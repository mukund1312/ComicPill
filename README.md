# ComicPill

A personal decision system for comics: what to read tonight, and what's worth
owning. See `docs/frontend-blueprint.md` for the full UI/UX spec (and
`docs/mockups/`) and `docs/PERFORMANCE.md` for the concrete "fast, quick,
crisp" budget and rules — this README documents the **backend this UI is
built against**: the data model, the taste/recommendation/purchase engines,
and the hooks a screen calls to get real data.

## Status

The engine layer and local data layer are built and tested. **No screens exist
yet beyond `app/index.tsx`**, a placeholder that proves the pipeline works —
replace it with the real Today screen (and the rest of the page tree) per
`docs/frontend-blueprint.md`. Auth and cloud sync (Supabase) are not wired in
this pass; the app is local-only (one implicit user, one SQLite database).

```
npm install
npx expo start        # scan the QR with Expo Go on your phone
npm test               # engine unit tests (vitest, ~50 tests)
npx tsc --noEmit        # typecheck
npx expo-doctor         # verify Expo config/deps
```

**Do not `npm i <pkg>@latest` for any Expo-adjacent package.** Use
`npx expo install <pkg>` — SDK 57 pins specific versions (e.g. Reanimated
4.5.1, not the npm-latest 4.7.0), and mismatches cause runtime crashes on
device that don't show up in Metro. See the version table in
`.claude`-adjacent plan docs if you need the full rationale.

## Architecture: engines never touch the database or the UI

```
a screen (app/**/*.tsx)
  → a hook (src/features/<feature>/use<Feature>.ts)
      → a query (src/lib/db/queries/*.ts)   — loads plain objects from SQLite
      → an engine (src/lib/engines/**)       — pure function, scores/decides
      → a query again                        — writes the result back
```

- **Engines** (`src/lib/engines/`) are pure TypeScript: plain objects in, plain
  objects out. No React, no SQLite, no network, no `Date.now()`, no
  `Math.random()` — time and randomness seeds are always arguments. This is
  enforced by `src/lib/engines/__tests__/purity.spec.ts`, not just convention.
  This means the entire recommendation/taste/purchase logic can be tested (and
  is) with zero UI and no device.
- **Queries** (`src/lib/db/queries/`) are the only code that touches SQLite.
  They return finished engine-input objects, never raw rows.
- **Hooks** (`src/features/<feature>/use<Feature>.ts`) are what a screen
  actually calls. This is the intended integration point for the frontend
  build — a screen should rarely (if ever) import from `lib/db` or
  `lib/engines` directly.

## What exists right now

### Hooks (call these from screens)

| Hook | File | Returns |
| --- | --- | --- |
| `useToday()` | `src/features/today/useToday.ts` | `continueCard`, `switchCard`, `exploreCard` (each `{workId, title, bucket, own, reasons}` or `null`), `lead`, `mood`/`setMood`, `ownedOnly`/`setOwnedOnly`, `notTonight(workId)`, `refresh()` |
| `useCheckIn(workId, recentFinished)` | `src/features/checkin/useCheckIn.ts` | `cards` (≤4, from `pickCheckInCards`), `currentCard`, `appetitePreset`/`appetiteLine` (pre-set thumb + one-liner), `answerRating(1-5)`, `answerDropped()`, `answerChip(kind, value)`, `answerCalibration(dim, answer)`, `answerAppetite(answer)`, `skip()` |
| `useLibrary()` | `src/features/library/useLibrary.ts` | `items: LibraryItem[]` (title, bucket, own, status, rating, keeper, formatVerdict), `setOwnership`, `setStatus`, `refresh()` |

None of these exist yet for Paths, Compare, or Discover — the engines they'd
call (`engines/graph`, `engines/purchase`, `engines/recommend/deck.ts`) are
built and tested; only the hook layer is missing. Follow the same pattern:
query → engine → plain result object.

### The engines (`src/lib/engines/`)

| Module | Key exports | What it does |
| --- | --- | --- |
| `taste/affinity.ts` | `updateAffinity(a, n, w)` | The `a_new = a + (1/(n+2))·\|w\|·(sign(w)-a)` update rule. **Uses `\|w\|` for the step size, `sign(w)` for direction** — see the comment in the file for why the literal blueprint LaTeX (`w` twice) was a bug. |
| `taste/profile.ts` | `recomputeProfile(events, works, now)`, `applyAppetite`, `applyExploreOutcome`, `moveSweetSpot` | Replays the entire event log into a `TasteProfile`. Always recomputed, never patched — bumping `ENGINE_VERSION` makes every device replay automatically. |
| `taste/fit.ts` | `tasteFit(work, profile)` | The `T` score component: fingerprint closeness to sweet spots, blended with tag/creator/character/bucket affinity. |
| `taste/fatigue.ts` | `detectFatigue`, `fatiguePenalty`, `currentStreak` | The four "tired of a lane" triggers, and `F` in the score formula. |
| `taste/checkin.ts` | `pickCheckInCards`, `calibrationDimension`, `predictAppetite` | Which of the ≤4 check-in cards to show, and what to pre-set card 4's thumb to. |
| `recommend/score.ts` | `scoreWork`, `dailyJitter` | `score = 0.35T + 0.15M + 0.20P + 0.10O + N − 0.15F`, plus a deterministic daily tie-breaker so Today is stable within an evening. |
| `recommend/slots.ts` | `pickToday(input, options)` | Fills Continue/Switch/Explore from three different buckets, respecting the taste floors (Switch ≥ 0.6, Explore ≥ 0.45), decides which slot leads. |
| `recommend/reasons.ts` | `reasonsFor(parts)` | Top 3 positive score contributions → the "Why this?" reasons. **A reason cannot exist that isn't backed by a real score part** — this is what makes "no 97% match, ever" structural rather than a copy guideline. |
| `recommend/deck.ts` | `buildDeck(candidates, profile, 5\|15)` | The swipe-deck card mix (2 near-taste, 2 probe, 1 wildcard for a 5-card deck). |
| `purchase/label.ts` | `labelFor(signals)`, `buyScore(signals)` | The five purchase labels (`collect`, `buy_on_sale`, `digital_is_fine`, `try_digital_first`, `skip`) from the four 0–1 signals. |
| `purchase/basket.ts` | `fillBasket(candidates, budgetPaise)`, `pickOneForMe(candidates)` | Budget-mode basket filling and "Pick one for me". |
| `graph/path.ts` | `expandPath`, `nextInPath`, `readyToRead`, `pathReadiness` | Reading-order expansion by context level (Simple/Recommended/Completionist), and the `P` score component. |
| `graph/rabbithole.ts` | `rabbitHole(from, edges, works, profile)` | Walks forward up to 6 steps for the "Rabbit Hole" feature. |

**Currency note:** the blueprint's screens show ₹ prices; `pricePaise` fields
throughout are integer paise (₹1 = 100 paise) to avoid float rounding on
money — convert at the UI boundary only.

### Data model

Local-only SQLite for this pass (`src/lib/db/schema.ts`, bootstrapped by
`src/lib/db/client.ts`'s `initDatabase()`, called once from `app/_layout.tsx`).
No Supabase/auth/sync yet — that's the next milestone. Tables:

- `works` / `editions` — the catalog. One `work` per story (e.g. *Batman: The
  Long Halloween*), with its 8-slider `fingerprint` (tone, violence, scale,
  complexity, mystery, pace, artForward, commitment, each 0–1), genres,
  creators, characters. `editions` hold the physical/digital format + price.
  **Global and shared** — not per-user.
- `story_edges` — the reading-order graph (`direct_sequel`, `required_context`,
  `optional_context`, `same_run`, `same_event`, `alternate_universe`,
  `similar_tone`), each `confirmed` or not.
- `paths` / `path_items` — a path is a bucket/reading lane (e.g. "Batman:
  Gotham & crime"); `path_items` orders works within it.
- `user_library` — **the only per-user table in this pass**: `own`
  (physical/digital/both/none), `status` (none/reading/done/dropped),
  `rating` (1–5, mapping to Not for me..Loved it), `finishedAt`.
- `events` — the append-only taste-signal log. See "The event model" below.
- `taste_profiles` — a **cache**, not a source of truth. Always safe to
  delete; `getProfile()` recomputes it from `events` if missing or stale.
- `shown` — every Today recommendation shown, with its score breakdown, for
  the eventual metrics screen (check-in completion, Explore hit rate, etc. —
  see the plan doc's success metrics).
- `not_tonight` — timestamps of "not tonight" taps, feeding the 3-day
  re-suppression rule and the small −0.05 mood nudge.

### The catalog: 65 real, fingerprinted books, ready on day one

`src/lib/db/seed/catalog.data.json` + `catalog.ts` hold 65 real comics (from
Mukund's own curated Longbox library) with hand-authored fingerprints, genres,
creators, characters, and same-run reading-order edges — this is **global
catalog data**, seeded for every user via `seedCatalogIfEmpty()`.

**Important, read before touching seeding:** `DEV_LIBRARY_ENTRIES` in
`catalog.ts` is Mukund's own personal ownership/read-history from the
prototype. It is claimed **only** for the developer (`isDevSeedUser()` checks
`__DEV__`) via `claimDevLibraryIfEmpty()`. A real new user's `user_library`
starts empty — they build it by scanning/adding books, exactly like the
onboarding flow in the frontend blueprint describes. Do not wire
`DEV_LIBRARY_ENTRIES` into a real signup path; that was a bug caught and fixed
before it shipped (see the plan doc's "Bug caught before it shipped" note).

### The event model

Every taste signal is one row in `events`, and `TasteProfile` is always a pure
function of that log (`recomputeProfile`) — never hand-edited. Event
`type`s and what they carry:

| `type` | Fields used | Fired when |
| --- | --- | --- |
| `rating_loved` / `_great` / `_good` / `_meh` / `_not_for_me` | `workId` | Check-in card 1 |
| `dropped` | `workId` | User marks a book Dropped instead of finished |
| `chip` | `workId`, `tag: {kind, value}` | Check-in card 2 (a "Mystery"/"Villain"/etc. chip) |
| `calibrate` | `workId`, `dimension`, `calibration: 'too_little'\|'just_right'\|'too_much'` | Check-in card 3 |
| `appetite` | `workId`, `appetite: 'more'\|'mix'\|'new'` | Check-in card 4 |
| `explore_outcome` | `workId`, `exploreGoodOrBetter: boolean` | Auto-fired by `useCheckIn` when the finished work's most recent `shown` row was slot `explore` |
| `swipe_right` / `swipe_left` | `workId` | Discover deck |
| `swipe_up` | `workId`, `value: 1\|2\|3` | Discover deck's quick-rate |
| `not_tonight` | `workId` | Today's "Not tonight" |

If you add a new screen that teaches the engine something, it should almost
always be **one more event type**, handled in `applySignal`
(`src/lib/engines/taste/profile.ts`) — not a direct mutation of
`taste_profiles`. That's what keeps "rebuildable from events" true.

## Testing

```
npm test
```

50 tests across 5 files. The one worth reading first is
`src/lib/engines/__tests__/twoWeeks.spec.ts` — it replays the taste-engine
blueprint's own worked example (Dark Victory → ... → Fantastic Four: Solve
Everything) end to end through the real engines, and is the acceptance test
for "does the loop actually work." Its comments explain a few places where
the blueprint's prose was ambiguous or (in one case, the affinity formula)
outright wrong, and how that got resolved.

`src/lib/engines/__tests__/performance.spec.ts` enforces the "fast, quick,
crisp" budget as an actual number: `pickToday` over 500 works must average
under 8ms (currently ~0.5ms) and must scale roughly linearly, not
quadratically. See `docs/PERFORMANCE.md` for the full budget and the rules
that matter more right now (mainly: use `FlashList`, not `ScrollView`, for
any list of comics).

## What's NOT built yet (by design, or because it's a later milestone)

- **Any real screen.** `app/index.tsx` is a smoke test, not a design.
- **Scan** (camera → Claude vision → confirm grid). Needs a Supabase project
  (Storage + Edge Functions) that doesn't exist yet for this app — see the
  plan doc's scan pipeline section for the intended design (signed URLs, not
  inline image payloads, and why).
- **Auth / cloud sync.** Local-only for now, one implicit user.
- **Paths/Compare/Discover hooks.** Engines exist and are tested; the
  `useX()` wrapper doesn't yet. Same pattern as `useToday`/`useLibrary`.
- **`EngineConfig` as server-fetched, tunable data.** `DEFAULT_ENGINE_CONFIG`
  is currently a hardcoded constant; making weights tunable without an app
  release is a real, deferred idea (see conversation/plan notes on this).
