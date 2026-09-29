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
| `useComicDetail(workId, contextLevel?)` | `src/features/library/useComicDetail.ts` | `detail: ComicDetail \| null` — summary, **all** editions of the work (for the format/price comparison), position in its path with `previousInPath`/`nextInPath`, `related` works from the story graph, `issues` (empty until real issue data is imported — see the data model section), `refresh()` |
| `usePlaylists()` | `src/features/playlists/usePlaylists.ts` | `playlists: PlaylistWithItems[]`, `selected`, `select(id)`, `create(name)`, `generateForMe(name, mood?, seedName?, count?)`, `generateJourney(name, characterName, count?)`, `rename(id, name)`, `remove(id)`, `addItem(playlistId, workId)`, `removeItem(playlistId, workId)`, `reorder(playlistId, orderedWorkIds)`, `share(playlistId) → code \| null`, `importFromCode(code) → {playlist, resolvedCount, unresolvedTitles}`, `query`/`setQuery`, `searchResults` (title/creator/character matches), `characterSuggestions` (known character names matching the query, shortest/most-likely first — drives "Build their journey") |
| `useComicFund()` | `src/features/wallet/useComicFund.ts` | Comic Wallet + Piggy Bank + Smart Purchase System (see "Comic Wallet..." below): `config`/`updateConfig`, `snapshot: WalletSnapshot` (available/reserved/spent-this-cycle/budget-remaining — four distinct numbers, never one balance), `ledger`, `topUp(amountPaise, note?)`, `piggyBanks`, `startPiggyBank(workId, editionId, name, targetPaise)`, `contribute(id, amountPaise)`, `cancel(id)`, `allocateLumpSum(amountPaise)` (auto-distributes across active goals), `settle(id, actualPricePaise) → leftoverPaise`, `settleLeftoverToWallet`/`settleLeftoverToPiggyBank`, `readiness(id)` (re-checks against current price before "ready to buy"), `bestBuyFor(editionId)`, `verdictFor(workId)` (the unified WHAT/WHY/WHERE/WHEN/CAN-AFFORD/IMPACT/ACTION answer), `cart`/`cartPlan` (buy-now/postpone/wait, each with a reason, can legitimately be "buy nothing"), `addItemToCart`/`removeItemFromCart` |

None of these exist yet for Compare or Discover — the engines they'd
call (`engines/purchase`, `engines/recommend/deck.ts`) are
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
| `playlist/generate.ts` | `generatePlaylist(candidates, profile, options)` | Ranks candidates by `tasteFit`, boosted by mood-genre match and/or a `seedName` (character/creator), diversifies by creator/character unless a seed was given (a seed playlist is *supposed* to overlap on that person). Powers "the app can make it for him". |
| `playlist/journey.ts` | `characterJourney(candidates, positionByWorkId, characterName, count)` | "Type a character's name, get their journey": selects up to `count` (default 12) keeper/accessible-weighted matches, then **orders them by lane position, not by score** — a linear reading path, not a ranked list. See the file's header comment for why lane position (not story_edges) is the honest ordering signal with today's seed data. |
| `fund/wallet.ts` | `computeWalletSnapshot(config, ledger, piggyBanks, now)`, `cycleStart(now, resetDay)` | The Comic Wallet's four numbers (available/reserved/spent-this-cycle/budget-remaining), derived from an append-only ledger — never a mutable balance. |
| `fund/piggybank.ts` | `dailyEquivalent`, `projectCompletionDate`, `savingsPlanSummary`, `autoAllocate`, `piggyBankReadiness`, `settlePiggyBank` | Saving-schedule math, the "you'll reach your goal around DATE" projection, the non-blocking "X% of your budget goes to savings" warning, lump-sum distribution across goals, and re-checking a matured goal against the *current* price rather than assuming it's ready to buy. |
| `fund/price.ts` | `bestBuy(prices)`, `priceHistory(prices)`, `checkPriceAlerts(alerts, currentByEdition)` | Ranks by landed cost (price + shipping, not sticker price), a buy/wait verdict from current vs. typical vs. lowest-ever price, and target-price alert matching. Always takes prices pre-filtered to one exact `edition_id` — the app must never compare a Compact against a Deluxe. |
| `fund/cart.ts` | `cartOverflow`, `optimizeCart(items, budgetPaise)` | "You're ₹X over budget" framing (never "insufficient balance"), and the Cart Optimizer: buy-now/postpone/wait per item with a reason, reusing `purchase/basket.ts`'s greedy fill rather than re-deriving purchase-worthiness — can legitimately return "buy nothing this month". |
| `fund/verdict.ts` | `fundVerdict(workId, signals, bestBuy, walletSnapshot, dailySavingRate)` | The capstone: one answer combining WHAT/WHY (existing purchase engine), WHERE (price engine), and WHEN/CAN-AFFORD/IMPACT (wallet) — `action` is `buy \| save \| wait \| skip`. |

`src/lib/util/playlistShare.ts` (not an engine — deliberately outside
`engines/` since it's encoding, not scoring — but just as pure) has the
share-code codec: `encodePlaylistShare`/`decodePlaylistShare` (a
dependency-free base64 JSON codec, no `btoa`/`atob` — not guaranteed under
Hermes) and `resolveSharedItems` (matches a decoded payload against the
local catalog by id first, title-loosely second).

**Currency note:** the blueprint's screens show ₹ prices; `pricePaise` fields
throughout are integer paise (₹1 = 100 paise) to avoid float rounding on
money — convert at the UI boundary only.

### Data model

Local-only SQLite for this pass (`src/lib/db/schema.ts`, bootstrapped by
`src/lib/db/client.ts`'s `initDatabase()`, called once from `app/_layout.tsx`).
No Supabase/auth/sync yet — that's the next milestone. Tables:

- `series` / `issues` / `issue_creators` — the bibliographic layer. A `series`
  is one periodical run (a title relaunched with a new #1 is a *different*
  series row, not the same one continuing). An `issue` is one periodical
  chapter; `sortPosition` (not the display `issueNumber`) is what orders them
  correctly, since annuals and specials don't sort as plain numbers.
  **Schema is complete; rows are empty for the seed catalog** — populating
  real issue-level data (which issues a given collected edition actually
  contains) needs a real bibliographic source rather than guessed numbers;
  Grand Comics Database's bulk dump (CC BY-SA, commercial use permitted with
  attribution) is the intended import path, not something to hand-type.
- `works` — one `work` per STORY as a reading unit (e.g. *Batman: The Long
  Halloween*), with its 8-slider `fingerprint` (tone, violence, scale,
  complexity, mystery, pace, artForward, commitment, each 0–1), genres,
  creators, characters. **Global and shared** — not per-user. `work_issues`
  says exactly which issues make up a work, in order (empty for now, same
  reason as above).
- `editions` / `edition_works` / `edition_issues` — the commerce layer: the
  physical/digital PRODUCTS of a work. `printing` is a real enum
  (`single_issue`, `trade_paperback`, `hardcover`, `deluxe`, `omnibus`,
  `absolute`, `compact`, `digital`) — the actual distinction the "which one
  should I buy" comparison and Compare's purchase labels turn on. An edition
  is scoped to either issues (`edition_issues`, a single-issue purchase) or
  works (`edition_works`) — **never a direct `work_id` foreign key**, because
  an omnibus or "complete collection" can legitimately span *multiple*
  works, and a single foreign key can't represent that.
- `story_edges` — the reading-order graph (`direct_sequel`, `required_context`,
  `optional_context`, `same_run`, `same_event`, `alternate_universe`,
  `similar_tone`), each `confirmed` or not.
- `paths` / `path_items` — a path is a bucket/reading lane (e.g. "Batman:
  Gotham & crime"); `path_items` orders works within it. **Catalog-owned**:
  seeded once, the same for every install, expanded via the story graph.
- `playlists` / `playlist_items` — a playlist is the **personal, editable**
  counterpart to a path: same "ordered list of works" shape, but user-owned
  (`created_by: 'user' | 'app'`), never graph-expanded, freely
  add/remove/reorder-able. `source_hint` records what an app-generated
  playlist was built from (a mood, a character/creator name, or `'shared'`
  for an imported one), shown back as "why this playlist". Reading progress
  is **not** stored here — same as paths, it's derived from
  `user_library.status` per work, so there's one source of truth app-wide.
  Sharing is local-only for now (see "Sharing playlists" below) — there's no
  backend yet for real account-to-account delivery.
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

### Comic Wallet + Piggy Bank + Smart Purchase System

A financial-planning layer, **V1 is virtual-only** — no card numbers, no
bank credentials, no real money movement of any kind. Every ledger row is a
user-declared amount, same trust model as a spreadsheet. See the plan's
"Comic Wallet..." section for the full 36-feature spec and build-status
table (what's built now vs. explicitly deferred to a later, separate
payments milestone).

Tables (all local-only, no `user_id` — same single-implicit-user model as
`user_library`): `wallet_config` (single row, like `taste_profiles`),
`wallet_ledger` (append-only, like `events`), `piggy_banks`, `saving_rules`,
`retailers`, `comic_prices` (seeded from each edition's `typicalPricePaise`
— no live price-feed access in this environment, same constraint as the
catalog build), `price_alerts`, `cart_items`.

Query layer: `src/lib/db/queries/wallet.ts` — wallet/ledger CRUD, Piggy Bank
lifecycle (create → contribute → settle → route the leftover), price
lookup + seeding, cart + optimizer assembly, and `getFundVerdict()` (feature
#36's unified answer). Hook: `useComicFund()` (see the hooks table above).

### Sharing playlists (local-only, by design)

There's no Supabase project, no accounts, and no cloud sync anywhere in this
app yet — so "share a playlist with someone else" can't mean real
account-to-account delivery today. What it means instead: `share(playlistId)`
produces a compact `PILL1:...` code encoding the playlist's name and its
works (id + title, both — see below); `importFromCode(code)` decodes it and
creates a new local playlist on the receiving device from whatever resolves.

This works **today, with zero backend**, because the seed catalog
(`catalog.data.json`) ships byte-identical `work.id`s to every install — an
id match is authoritative. Once the catalog scales past the hand-seeded 100
and installs can be on different app/catalog versions, `resolveSharedItems`
already has the fallback: a loose title match, and anything that still can't
be resolved is reported back (`unresolvedTitles`), never silently dropped.
The transport (paste a code today; a deep link or QR is a thin wrapper
around the same string) can be swapped for a real backend later without
touching this format.

### Search + character journeys

`src/lib/db/queries/search.ts` backs the playlist search bar:
`searchWorks(query)` (title/creator/character substring match, title matches
ranked first) and `searchCharacters(query)` (distinct known character names
matching the query, shortest first) — the latter is what lets the UI detect
"you typed a character name" and offer to build their journey instead of (or
alongside) plain search results.

**Honest data-scale caveat:** with the current 373-book seed catalog, most
characters have 1–3 books, not the 10–15 a "journey" implies at full scale —
e.g. Iron Man has exactly one seed entry right now, and Martian Manhunter has
none. `characterJourney()` still does the right thing (returns what exists,
correctly ordered, or nothing if the character isn't in the catalog yet) —
this gets visibly better as the catalog scales, it isn't a bug to fix now.

### The catalog: 373 real, fingerprinted books, ready on day one

`src/lib/db/seed/catalog.data.json`, `catalog.popular.data.json` +
`catalog.ts` hold 373 real comics: the Longbox library plus vetted classics
and popular-reading expansions. They have hand-authored
fingerprints, genres, creators, characters, and reading-order edges where a
real sequential relationship exists — this is **global
catalog data**, seeded for every user via `seedCatalogIfEmpty()`.

**Important, read before touching seeding:** `DEV_LIBRARY_ENTRIES` in
`catalog.ts` is Mukund's own personal ownership/read-history from the
prototype. It is claimed **only** for the developer (`isDevSeedUser()` checks
`__DEV__`) via `claimDevLibraryIfEmpty()`. A real new user's `user_library`
starts empty — they build it by scanning/adding books, exactly like the
onboarding flow in the frontend blueprint describes. Do not wire
`DEV_LIBRARY_ENTRIES` into a real signup path; that was a bug caught and fixed
before it shipped (see the plan doc's "Bug caught before it shipped" note).

### Cover images

`scripts/fetch-covers.py` (+ `fetch-covers-retry.py` for a second pass on
transient network failures) fetches official cover thumbnails for the seed
catalog from **Open Library's public covers API** — the sanctioned,
third-party-display use of that API, the same mechanism Goodreads/Libby use,
never a redrawn or generated image. They're bundled as local assets
(`assets/covers/<workId>.jpg`) rather than fetched at runtime, so covers
render instantly with zero network dependency (see `docs/PERFORMANCE.md`).

- `src/ui/coverAssets.ts` is **generated**, not hand-written — Metro needs
  static, bundle-time-known `require()` paths, so this file maps a `workId`
  to its bundled asset. Re-run the fetch script after catalog changes.
- `ComicCover` (`src/ui/comic.tsx`) takes an optional `workId`: when
  `COVER_ASSETS[workId]` exists it renders via `expo-image`
  (`cachePolicy="memory-disk"`); otherwise it falls back to the tinted
  placeholder, which is a deliberate, graceful state — not an error — since
  plenty of works (mocks, unmatched scan results) never get a real cover.
- `docs/cover-sources.json` records what was matched and where each cover
  came from, for the Sources & Transparency screen the blueprint calls for.
- Currently 50/373 seed books have a bundled cover (Open Library's title-only
  search doesn't confidently match every collected-edition title — some
  omnibus/absolute/"complete collection" titles need a cleaner query or a
  second source). **Google Books would likely recover more of the misses**
  (better coverage of modern collected editions specifically) but needs an
  API key with a real quota — the unauthenticated public endpoint used during
  development returned `RESOURCE_EXHAUSTED` with a zero daily quota. Get a
  key, add it to the script, and re-run for the rest.

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

112 tests across 13 files. The one worth reading first is
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
