# Fingerprinting cost & calibration analysis

**Status: findings only — nothing here is implemented yet.** Revisit this before
building the real batch fingerprinting pipeline for the 10,000-book catalog.
Two concrete bugs found below should be fixed **before** any real batch run,
regardless of which model gets chosen.

## Why this exists

ComicPill's taste engine needs every comic tagged with 8 continuous 0–1
dimensions (tone, violence, scale, complexity, mystery, pace, artForward,
commitment), up to 3 genres, and a keeper flag — see `README.md`'s "The event
model" and `src/lib/types/domain.ts`. Scaling the catalog toward 10,000 books
means this has to run as an automated batch job, not more hand-authoring. This
doc is the evidence gathered to answer: *which model, at what cost, is
actually trustworthy for that job?*

## Method

Used the same prompt shape across every model (no tools, no web search — pure
model judgment, to isolate calibration quality):

```
You catalog comic books for a personal reading app. For the well-known graphic
novel "{title}", rate it on these 8 dimensions, each a number from 0 to 1:
- tone (0=hopeful/warm, 1=bleak/nihilistic)
- violence (0=tame, 1=brutal/graphic)
- scale (0=street-level, 1=cosmic/world-ending)
- complexity (0=straightforward, 1=mind-bending, needs focus)
- mystery (0=no puzzle, 1=whodunit drives the plot)
- pace (0=slow burn, 1=nonstop action)
- artForward (0=art serves story, 1=art IS the experience)
- commitment (0=one sitting, 1=long multi-volume run)
Also give: genres (up to 3 from: detective, crime, horror, sci-fi, mythic,
satire, war, supernatural, drama), and keeper (true/false).
```

Diffed against 5 books already hand-fingerprinted in
`src/lib/db/seed/catalog.data.json` (the ground truth, authored directly by
Claude in an earlier session, before any of this testing):

| Book | tone | violence | scale | complexity | mystery | pace | artForward | commitment | genres | keeper |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Watchmen | 0.80 | 0.55 | 0.40 | 0.80 | 0.60 | 0.35 | 0.60 | 0.45 | mystery, drama | true |
| Batman: The Long Halloween | 0.55 | 0.50 | 0.20 | 0.55 | 0.90 | 0.40 | 0.65 | 0.45 | detective, mystery, crime | true |
| Saga Vol. 1 | 0.50 | 0.50 | 0.60 | 0.40 | 0.30 | 0.50 | 0.65 | 0.30 | sci-fi, drama | true |
| Hellboy Vol. 1: Seed of Destruction | 0.65 | 0.50 | 0.40 | 0.35 | 0.45 | 0.50 | 0.70 | 0.20 | horror, supernatural | true |
| Kingdom Come | 0.40 | 0.40 | 0.60 | 0.50 | 0.20 | 0.35 | 0.90 | 0.35 | heroic, mythic | true |

"Miscalibrated" = absolute gap ≥ 0.15 on one dimension for one book (40
dimension-checks total per model: 5 books × 8 dimensions).

## Results

| Model | Provider | Cost basis | MAE (avg gap) | Miscalibrated |
| --- | --- | --- | --- | --- |
| **Claude Sonnet 5** | Anthropic | verified | **0.082** | **6/40 (15%)** |
| Claude Haiku 4.5 | Anthropic | verified | 0.109 | 10/40 (25%) |
| gpt-6-luna | OpenAI | verified (corrected, see below) | 0.114 | 15/40 (38%) |
| gpt-6-astra | OpenAI | verified (corrected, see below) | 0.181 | 20/40 (50%) |
| `gemma3:4b` (local, free, via Ollama) | — | free | *(1 book only — see note)* | 2/8 (25%) on Watchmen alone |
| Claude Opus 5 | Anthropic | verified | *(not tested)* | — |

`gemma3:4b` was only tested on Watchmen early in this process (scale
0.40→0.90, pace 0.35→0.60) — the result that started this whole
investigation. Never re-run against the full 5-book set, so its MAE isn't
directly comparable to the others' 40-check average.

### The finding that matters most: a shared, cross-provider bug, not a model problem

**All 5 models — free and paid, both providers — made the same error on
Watchmen's `scale`:** ground truth 0.40, every one said 0.80–0.90. That's 5/5
agreement across completely different model families, which is much stronger
evidence of a **prompt-definition bug** than a capability gap: every model is
reading Watchmen's cosmic *imagery* (a god-like being, a Mars sequence) as
cosmic *scale*, even though the plot's actual stakes stay personal and
grounded. **Fix before any real batch run:** reword the `scale` definition to
something like *"scale = what the plot's outcome actually threatens — one
street, one city, or the whole universe — not how thematically big or
visually cosmic it feels."*

### A second bug, unrelated to model choice

The allowed genre list omitted **`heroic`**, even though the ground truth for
*Kingdom Come* uses it. No model tested could have matched that label — this
isn't a calibration failure, it's a schema bug. **Fix:** add `heroic` to the
genre enum (`src/lib/types/domain.ts` and any duplicated list in prompts)
before any real run.

### Where models genuinely differ, beyond the shared bug

- **Sonnet 5's remaining errors are systematic** (scale, consistently biased
  high) — the kind of thing a clearer prompt mostly fixes.
- **Haiku 4.5 and gpt-6-luna's errors are noisier**, especially on
  `commitment` — sometimes too high, sometimes too low on the same dimension
  across different books. Noise is harder to correct with a prompt tweak than
  a consistent bias is.
- **gpt-6-astra performed *worse* than its own cheaper sibling gpt-6-luna**,
  and worse than every Claude tier tested, while costing almost as much as
  Claude Opus 5. Bigger/pricier was not better on this specific task, for
  either provider tested.

## Corrected cost table for 10,000 books

Assumptions: ~1,000 cached system-prompt tokens (frozen instructions, larger
than the raw prompt above to include the calibration fix), ~50 input tokens/book
(title + known metadata), ~300 output tokens/book (8 floats + genres + keeper
+ a short jumping-on-point note).

| Model | No batch, with caching | Batched |
| --- | --- | --- |
| Claude Opus 5 | ~$83 | ~$41–$64 (caching-in-batch unconfirmed on Anthropic's side) |
| Claude Sonnet 5 | ~$33 | ~$17–$26 |
| Claude Haiku 4.5 | ~$17 | ~$8–$13 |
| gpt-6-astra | ~$165 | ~$82.51 |
| gpt-6-luna | ~$1.65 | ~$0.83 |

**A pricing bug was caught and corrected here too:** Codex's first pass
quoted OpenAI's *Batch* pricing table as if it were the *Standard* table (the
two are separate tables on OpenAI's pricing page; Batch and Flex are
identical and exactly half of Standard for every cell), then applied the 50%
batch discount a second time on top. The numbers above are corrected against
the raw Standard/Batch tables, verified directly. One genuine finding from
that exercise stands, though: OpenAI's Batch table lists its own distinct
cached-input price, which implies caching **does** stack with batch on
OpenAI's side — a firmer answer than Anthropic's docs give for the same
question.

## Recommendation (as of this analysis)

**Claude Sonnet 5, batched, after fixing the `scale` wording and the missing
`heroic` genre — realistic cost ~$17–26 for all 10,000 books.** It's cheaper
than Opus 5, meaningfully more accurate than Haiku 4.5 or either OpenAI tier
tested, and its one remaining bias (scale, consistently high) is the same
bug affecting every other model and is a one-line prompt fix away from
probably resolving itself across the board.

`gpt-6-luna` remains interesting purely as a near-free (~$0.83 for 10,000
books) draft-generator tier — Codex's own recommendation was "cheap model as
draft, verified against ground truth or human review," which still holds:
neither tested cheap tier (`Haiku`, `luna`) clears the bar for direct
unsupervised ingestion at these error rates.

## Before building the real pipeline, still open

- [ ] Fix the `scale` dimension wording in the fingerprint prompt.
- [ ] Add `heroic` to the genre enum everywhere it's listed.
- [ ] Re-run this exact 5-book test against Sonnet 5 post-fix to confirm the
      scale bias actually resolves (it should, given 5/5 models shared it).
- [ ] Confirm whether Anthropic's prompt caching survives inside a real
      Batches API job (still unconfirmed — see the plan doc's "Live compare"
      section) — this is the one number in the Claude cost table that's a
      range, not a point estimate.
- [ ] ComicPill still has no Supabase project / Edge Functions / Anthropic
      key wired in anywhere — this whole analysis is prerequisite research,
      not yet runnable infrastructure.
