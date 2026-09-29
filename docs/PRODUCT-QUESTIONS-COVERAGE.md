# Product questions coverage — the 50 jobs

This maps every question/job from the "what your comic questions reveal"
product-requirements exercise to the actual architecture: what already
covered it, what was a real gap closed in this pass, and what's designed but
not yet built. Nothing from that exercise should be lost — if something isn't
marked ✅ or 🆕 below, it's explicitly called out as deferred, not silently
dropped.

**Legend:** ✅ already covered by the existing design · 🆕 gap found and
closed in this pass · 📋 designed here, not yet implemented · ⚠️ partially
covered, noted limitation.

## The six jobs underneath all 50 questions

The source document's own conclusion is the right frame, and it's already
how the codebase is organized — not by feature, but by decision:

| Job | Where it lives |
| --- | --- |
| Collection memory (what do I own?) | `user_library`, `own` enum |
| Reading decision (what should I read now?) | `engines/recommend`, `useToday` |
| Navigation (before/after this?) | `engines/graph`, `story_edges` |
| Purchase decision (worth my money?) | `engines/purchase` |
| Format decision (physical/digital/edition?) | `editions`, `printing` enum |
| Discovery (where next?) | `engines/recommend/deck.ts`, `useDiscover` |

## 1–9: Collection memory & the buy decision

| # | Question | Status |
| --- | --- | --- |
| 1 | "What do I own?" (physical/digital/ordered/wishlist/subscription) | 🆕 `Own` enum was `physical\|digital\|both\|none` — missing `wishlist`, `ordered`, `subscription` entirely. Added, plus `isAccessible()`/`isFormatOwned()` helpers so "owned" and "reachable right now" are never conflated again (a package in transit isn't a book in hand). |
| 2 | "Should I buy this?" (buy engine ≠ read engine) | ✅ Already separate: `engines/recommend` (Today) vs `engines/purchase` (Compare) are different modules with different inputs. |
| 3 | "Physical or digital?" (5 labels) | ✅ Exactly the existing `PurchaseLabel` enum (`collect`/`buy_on_sale`/`try_digital_first`/`digital_is_fine`/`skip`). |
| 4 | "Which edition should I buy?" (content / experience / value, 3 questions in 1) | ⚠️ Data model supports it (`editions` per work with printing/price), but the 3-way Compare-Editions breakdown itself isn't built as a UI/engine feature yet. 📋 |
| 5 | "Why does this edition have fewer pages?" (needs issue-level content) | ✅ Exactly what `work_issues`/`edition_issues`/`issues` already model — built in the prior session specifically for this. Rows are empty pending a real bibliographic import (GCD), documented in `FINGERPRINTING-COST-ANALYSIS.md`'s open items. |
| 6 | "Which of these should I buy?" (may be "neither") | ✅ Compare multi-title + "the app may recommend buying nothing" is a stated design rule, already in `fillBasket`/`labelFor`. |
| 7 | "I have ₹X, which should I buy?" | ✅ `fillBasket()` — budget-constrained basket, greedy by buy-score-per-rupee. |
| 8 | "Which ONE should I buy?" (relative to *my* collection, not absolute) | ⚠️ `pickOneForMe()` exists but doesn't yet weigh collection breadth (20 Batman books + 0 Daredevil should score differently than the reverse). 📋 — needs a "collection novelty" signal in `purchaseSignals`, analogous to the taste engine's existing novelty bonus. |
| 9 | "10 comics I must own, DC+Marvel only, excluding what I have" | 🆕 No engine did constrained must-own ranking at all. New `essentialCollection()` (`engines/recommend/essential.ts`): publisher filter, exclude-owned (default on), physical-only, top-N, blending keeper-worthiness with personal taste fit. |

## 10–16: Reading decisions & navigation

| # | Question | Status |
| --- | --- | --- |
| 10 | "What should I read next?" | ✅ Today / `pickToday()` — the core feature. |
| 11 | Continue / Switch / Explore | ✅ Exactly the existing 3-slot design. |
| 12 | "Traveling, digital only — what should I read?" | 🆕 No filter existed beyond `ownedOnly`. Added `formatFilter: 'any'\|'physical'\|'digital'` to `TodayInput`, applied in `filterCandidates` via the new `isFormatOwned()` helper — independent of `ownedOnly` (travel mode still requires ownership, it doesn't grant it). |
| 13 | "Can I read this instead?" (substitutability verdict) | ⚠️ `readyToRead()` + `tasteFit()` already answer the pieces (is it unlocked? does it fit?), but there's no single function returning the YES / YES-BUT-DIFFERENT-CONTINUITY / READ-X-FIRST / NOT-YET verdict shape. 📋 |
| 14 | "What should I read before this?" (edge STRENGTH, not just type) | 🆕 `EdgeType` had no notion of how strongly a relationship should push a reader — a `direct_sequel` and a loose `optional_context` edge were structurally different types but had no shared urgency scale. Added `EdgeStrength` (`required`/`strongly_recommended`/`useful_context`/`optional`/`tie_in`) as a field on every `StoryEdge`, orthogonal to its type. |
| 15 | "Will I miss anything if I skip this?" | 🆕 New `skipImpact()` (`engines/graph/skip.ts`): categorizes what's lost into main-story / character-context / future-continuity impact, using the new edge strength field. |
| 16 | "Is this tie-in necessary?" (CORE/SUPPORTING/OPTIONAL/COMPLETIONIST) | ✅ Unified with #14/#15 — the same `EdgeStrength` + `skipImpact()` answer this; a `tie_in`-only outgoing edge set is exactly `completionistOnly: true` in the new function's output. |

## 17–21: Editions, completeness, and where things fit

| # | Question | Status |
| --- | --- | --- |
| 17 | "How many volumes are there?" (released ≠ total for ongoing series) | 🆕 `series` had no status or volume-count fields at all. Added `status: 'ongoing'\|'complete'\|'hiatus'`, `releasedVolumeCount`, `plannedVolumeCount` — deliberately separate fields so "9 released" is never silently presented as "9 total". |
| 18 | "Is this a complete story?" (COMPLETE / VOL. 1 OF N / ONGOING badge) | 🆕 `works` had no completeness signal. Added `completeness: 'complete'\|'ongoing'\|'part_of_n'` directly on `Work`. |
| 19 | "How many books to finish this?" (total remaining cost, not just this volume) | 🆕 New `estimateSeriesCommitment()` (`engines/purchase/commitment.ts`): sums remaining-volume prices, and explicitly flags `isOpenEnded` for an ongoing series with no announced total rather than guessing one. |
| 20 | "What continuity/universe is this?" (translated, not dumped as raw fields) | ✅ The data (`universe`, `publisher`) already exists on `Work`; presenting it as one plain sentence instead of a field dump is a UI-copy concern, not an architecture gap. |
| 21 | "Where does this fit?" (multi-path membership — character/theme/universe/creator/user paths, simultaneously) | ✅ **Already structurally supported and not yet exploited.** `path_items(pathId, workId, position)` is a join table — nothing stops one work from appearing in several paths at once (a "Creator: Darwyn Cooke" path, a "Universe: DC" path, a character path, all at the same time). The seed data just hasn't been enriched with overlapping paths yet — this is a data-population task, not a schema change. |

## 22–26: Fatigue, taste, and rabbit holes

| # | Question | Status |
| --- | --- | --- |
| 22 | Parallel lanes so I don't get bored | ✅ The entire Paths/lanes architecture. |
| 23 | "Am I reading too much Batman?" | ✅ `detectFatigue()` — the 4 fatigue triggers, already built and tested. |
| 24 | "What fits my taste?" (learns from behavior, doesn't pigeonhole) | ✅ The taste profile + check-in chips + `recomputeProfile()` from the event log. |
| 25 | "Something similar to this — but similar HOW?" (story/art/tone/character, user-selectable axis) | 📋 Current `tasteFit()` blends everything into one score; there's no axis-isolated variant yet. A `similarBecauseOf(workId, axis)` function is designed (weight fingerprint dims + tag overlap toward just the requested axis) but not implemented. |
| 26 | "Rabbit hole from a loved book" | ✅ `rabbitHole()` — already built, walks forward up to 6 steps preferring taste fit. |

## 27–35: Money, price, and the purchase queue

| # | Question | Status |
| --- | --- | --- |
| 27 | "How much have I spent?" | 🆕 `user_library` had no purchase-history fields at all. Added `pricePaidPaise`, `purchasedAt`, `store`. |
| 28 | "Was this a good price?" (in context, not absolute) | ✅ `purchaseSignals().priceValue` already does exactly this (price vs. `typicalPricePaise` ratio) — needs `typicalPricePaise` populated, which is a data task (manual entry in V1, per the original blueprint), not an engine gap. |
| 29 | "Should I wait for a discount?" | 🆕 The 5 labels had no "buy below ₹X" number attached to a `buy_on_sale` verdict. New `suggestedMaxPricePaise()` in `engines/purchase/label.ts`, derived directly from the existing price-value threshold math (1.3× typical price is exactly where the verdict flips to `collect`). |
| 30 | "Should I upgrade digital → physical after loving it?" | ✅ Falls out of the existing formula automatically once a rating event lands (interest rises via `tasteFit`) — this is an application-wiring point (re-run Compare after check-in), not a missing engine capability. |
| 31 | "Should I upgrade the EDITION I own?" (Compact → Deluxe, not format → format) | 🆕 `user_library` only tracked format (`own`), never which *specific* edition. Added `ownedEditionId` — now "what do I currently hold" and "what am I comparing it to" are both edition-precise. |
| 32 | Travel mode / situational filters | ✅ Unified with #12 — `formatFilter` covers this; explicitly scoped to digital-only for V1 per the original blueprint, other contexts (commute, flight, bedtime) deliberately deferred. |
| 33 | "What can I read without buying anything?" | 🆕 **A real bug, not just a gap**: `useDiscover.ts` filtered candidates to `own === 'none'`, which meant Discover could *structurally never* surface an owned-unread book — exactly backwards from the anti-consumption trust feature this question describes. Fixed: the filter is now "not finished/dropped" (read status), not ownership. |
| 34 | "What am I missing?" (REQUIRED/RECOMMENDED/OPTIONAL gaps) | ✅ Unified with #14/#15 — `EdgeStrength` + `skipImpact()`. |
| 35 | "Can I skip this?" (explicit yes/no + explanation) | ✅ `skipImpact().canSkip` is exactly this — `false` only when a `required` edge depends on the work. |

## 36–41: Reading order modes & progress

| # | Question | Status |
| --- | --- | --- |
| 36 | Simple / Recommended / Completionist reading orders | ✅ Exactly the existing `ContextLevel` + `LEVEL_EDGES` + `expandPath()`. |
| 37 | Reading order for parallel/graph-shaped events (Hickman's Marvel) | ✅ `story_edges` is already a graph, not a flat list — `expandPath()` does graph traversal. ⚠️ True issue-by-issue interleaving (FF and Avengers alternating) would need refinement beyond the current relative-depth ordering, but the underlying model is right. |
| 38 | Guided universe discovery ("teach me DC Cosmic") | ✅ Largely the existing Paths feature, richly curated — the `dccosmic` seed lane already is a starter version of this. Needs deeper edge curation as the catalog grows, not new architecture. |
| 39 | Semantic/experiential search ("cosmic multiverse gods reality-warping") | 🆕 The `Genre` enum (itself a new addition — see below) now includes `cosmic`, `multiverse`, `gods`, `reality_warping`, `apocalypse`, `street_level` alongside the structural genres, so this kind of intent-based search has real tags to match against. |
| 40 | "How long will my collection take to read?" | 📋 `editions.pages` exists; no reading-time estimator (page count → time, refined by a learned personal reading speed) is built yet. |
| 41 | "How much of my collection have I finished?" (by path/character/format) | 📋 A pure aggregation query over existing data (`user_library.status` × path membership) — straightforward, just not written yet (Profile screen is explicitly in the README's "not built yet" list). |

## 42–45: Data acquisition & the global/personal split

| # | Question | Status |
| --- | --- | --- |
| 42 | "Photograph everything instead of manual entry" | ✅ The entire scan pipeline (camera → Claude vision → match → confirm) is fully designed in the plan doc, not yet implemented in code. |
| 43 | "How does a new user get all this data?" (global vs. personal split) | ✅ **This is the exact bug this project already caught and fixed** — the catalog (`works`/`editions`/`paths`) is global and shared; `user_library` is the only per-user table. A new signup's library starts empty; `DEV_LIBRARY_ENTRIES` is gated to the developer only. See the plan doc's "Bug caught before it shipped" note. |
| 44 | "Where does reading-order info come from?" (editorial knowledge, not LLM invention) | ✅ `story_edges.confirmed` + `source` (`seed`/`claude`/`user`) already encode exactly this — an unconfirmed Claude-suggested edge can only *order* a book, never *block* one, per the existing design rule. |
| 45 | "Recommend even unowned books" | ✅ Already how scoring works — `ownedOnly` is an opt-in filter, not a default restriction. |

## 46–50: The advisor relationship & collection philosophy

| # | Question | Status |
| --- | --- | --- |
| 46 | "Tell me something else is better" (override the supplied candidates) | 📋 Compare currently ranks what the user supplies; it has no mechanism to check the owned backlog and say "ignore these, read what you already have instead." Real, valuable gap — not yet built. |
| 47 | Dynamic purchase queue (buy next / wait / after-X / digital-first / skip) | ✅ Already the plan's "Queue groups" design almost verbatim. ⚠️ One nuance not yet covered: "after you clear your Batman backlog" is a *count*-based condition, not a single named prerequisite — the current "Buy after reading X" implies one specific book. |
| 48 | Separate READ-compare vs BUY-compare | ✅ Already explicit in the blueprint (Compare's Single/Multi tabs, separate labels/engines for reading-tonight vs. buying). |
| 49 | Price AND quality reasoning (marginal value) | ✅ Exactly `buyScore()`'s weighted blend of interest/keeper/urgency/priceValue — already a marginal-value calculation. |
| 50 | Collection philosophy (essential classics / Batman collector / deluxe-only / read-everything-collect-favorites) | 📋 No per-user engine-weight override exists. The closest existing idea is the global, developer-tunable `EngineConfig` discussed earlier in this project — this would need a *per-user* layer on top of it, genuinely new. |

## The unified recommendation object (the architectural synthesis this exercise revealed)

The source document's closing insight is correct and worth acting on: right
now, Today's output (`TodaySlots`), the purchase engine's output (a
`PurchaseLabel`), and the detail page's output (`ComicDetail`) are three
**separate** shapes. The 50 questions above are really all facets of one
underlying answer — read verdict, buy verdict, path position, prerequisites,
and an alternative, together. 📋 **Not yet built**: a single
`RecommendationVerdict` type assembling all of it —

```ts
interface RecommendationVerdict {
  workId: string;
  action: 'read_now' | 'buy' | 'skip' | 'wait';
  why: string[];                          // from reasonsFor(), never fabricated
  ownership: Own;
  path: { name: string; position: number; total: number } | null;
  prerequisites: { workId: string; status: 'done' | 'unread'; strength: EdgeStrength }[];
  optionalContext: { workId: string; canSkip: true }[];
  formatVerdict: PurchaseLabel;
  purchase: { needed: boolean; suggestedMaxPricePaise: number | null };
  alternative: { workId: string; why: string } | null;
  confidence: 'high' | 'medium' | 'low';
}
```

This doesn't replace `TodaySlots`/`ScoreParts`/`ComicDetail` — it's an
assembly layer on top of them, reusing every engine already built. Worth
doing once the individual pieces above (especially #13's substitution verdict
and #46's advisor override) exist to feed it.

## What changed in this pass, concretely

**Schema/types** (`src/lib/types/domain.ts`, `engine-io.ts`,
`src/lib/db/schema.ts` + `client.ts` bootstrap SQL):
- `Own` enum: added `wishlist`, `ordered`, `subscription`.
- `Genre` formalized as a real enum (was a bare `string[]`) — also fixes the
  `heroic` bug found during the fingerprinting calibration test, and adds
  the semantic tags from #39.
- `EdgeStrength` — new, orthogonal to `EdgeType`, on every `StoryEdge`.
- `Series.status` / `releasedVolumeCount` / `plannedVolumeCount`.
- `Work.completeness`.
- `LibraryEntry.ownedEditionId`, `.pricePaidPaise`, `.purchasedAt`, `.store`.
- `TodayInput.formatFilter` (travel mode).

**Engines, new:**
- `engines/recommend/essential.ts` — `essentialCollection()`.
- `engines/graph/skip.ts` — `skipImpact()`.
- `engines/purchase/commitment.ts` — `estimateSeriesCommitment()`.
- `engines/purchase/label.ts` — `suggestedMaxPricePaise()`.

**Engines, fixed:**
- `score.ts` — mood-pill matching no longer type-punned against `Genre`
  (real `MOOD_GENRES` mapping); the `O` (owned) score component now uses
  `isAccessible()` so `wishlist`/`ordered` correctly score as *not yet
  reachable*, distinct from genuinely owned states.
- `filter.ts` — `ownedOnly` now means "actually accessible", not "any
  non-'none' status"; `formatFilter` applied.
- `useDiscover.ts` — **the real bug**: filtered by ownership, now filters by
  read status, so owned-unread books are finally eligible to surface.

All existing tests pass unmodified in behavior (53/53); typecheck clean.
