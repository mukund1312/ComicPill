import { describe, expect, it } from 'vitest';
import { buildProfile, calibrate, confidenceFor, DEFAULT_WEIGHTS, emptyTags, reasonsFor, scoreSeries, suggestWeights, type RatingEvent, type Tags } from './tasteScorer';
import { applyOverrides, decideVerdict, DEFAULT_THRESHOLDS, type VerdictInput } from './verdictRules';

const T = (over: Partial<Tags>): Tags => ({ ...emptyTags(), ...over });
const ev = (tags: Partial<Tags>, rating: number, extra: Partial<RatingEvent> = {}): RatingEvent => ({ tags: T(tags), rating, ...extra });

describe('tasteScorer', () => {
  it('loved tags push a comic up, dropped tags push it down', () => {
    const events = [ev({ genre: ['sci-fi'] }, 5), ev({ genre: ['sci-fi'] }, 5), ev({ genre: ['romance'] }, 1, { dropped: true })];
    const profile = buildProfile(events);
    expect(scoreSeries(T({ genre: ['sci-fi'] }), profile, events).score).toBeGreaterThan(70);
    expect(scoreSeries(T({ genre: ['romance'] }), profile, events).score).toBeLessThan(30);
  });

  it('is 50 and low confidence when nothing is known', () => {
    const r = scoreSeries(T({ genre: ['western'] }), buildProfile([]), []);
    expect(r).toMatchObject({ score: 50, confidence: 'low', evidence: 0 });
  });

  it('weights the five signals 30/25/20/15/10 and leaves unknown signals out', () => {
    const events = [ev({ genre: ['a'], creator: ['x'] }, 5), ev({ genre: ['b'], creator: ['y'] }, 1)];
    const profile = buildProfile(events);
    // genre known + loved, creator known + hated: (0.30 * g + 0.25 * c) / 0.55
    const r = scoreSeries(T({ genre: ['a'], creator: ['y'] }), profile, events);
    const g = r.breakdown.find((b) => b.signal === 'genre')!.score; const c = r.breakdown.find((b) => b.signal === 'creator')!.score;
    expect(r.score).toBe(Math.round(((0.3 * g + 0.25 * c) / 0.55) * 100));
    expect(r.breakdown.filter((b) => b.known).map((b) => b.signal)).toEqual(['genre', 'creator']);
  });

  it('a single rating cannot swing a tag all the way', () => {
    const events = [ev({ genre: ['x'] }, 5)];
    expect(scoreSeries(T({ genre: ['x'] }), buildProfile(events), events).score).toBeLessThan(90);
  });

  it('confidence needs 10 rated comics near the genre', () => {
    expect([confidenceFor(9), confidenceFor(10), confidenceFor(19), confidenceFor(20)]).toEqual(['low', 'medium', 'medium', 'high']);
    const events = Array.from({ length: 12 }, () => ev({ genre: ['sci-fi'] }, 4));
    expect(scoreSeries(T({ genre: ['sci-fi'] }), buildProfile(events), events).confidence).toBe('medium');
  });

  it('"I disagree" overrides count double', () => {
    const plain = [ev({ genre: ['g'] }, 5), ev({ genre: ['g'] }, 1)];
    const strong = [ev({ genre: ['g'] }, 5), ev({ genre: ['g'] }, 1, { weight: 2 })];
    const s = (e: RatingEvent[]) => scoreSeries(T({ genre: ['g'] }), buildProfile(e), e).score;
    expect(s(strong)).toBeLessThan(s(plain));
  });

  it('explains itself from the real matches', () => {
    const events = [ev({ creator: ['vaughan'] }, 5), ev({ creator: ['vaughan'] }, 5), ev({ genre: ['romance'] }, 1)];
    const lines = reasonsFor(scoreSeries(T({ creator: ['vaughan'], genre: ['romance'] }), buildProfile(events), events));
    expect(lines[0]).toContain('vaughan');
    expect(lines.some((l) => l.includes('lower'))).toBe(true);
  });

  it('calibrates: a consistent reader is predicted well, and a more predictive signal gains weight', () => {
    // Genre decides the rating; creator is noise.
    const events: RatingEvent[] = [];
    for (let i = 0; i < 14; i++) events.push(ev({ genre: [i % 2 ? 'loved' : 'hated'], creator: [`c${i % 5}`] }, i % 2 ? 5 : 1));
    const cal = calibrate(events);
    expect(cal.n).toBe(14);
    expect(cal.perSignal.genre.mae).toBeLessThan(cal.perSignal.creator.mae); // genre is the better predictor
    const w = suggestWeights(events);
    expect(w.genre).toBeGreaterThan(DEFAULT_WEIGHTS.genre);
    expect(w.creator).toBeLessThan(DEFAULT_WEIGHTS.creator);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2);
    // ...and using the suggestion predicts the reader's own ratings better than the starting guess.
    expect(calibrate(events, w).mae).toBeLessThan(cal.mae);
  });
});

const V = (over: Partial<VerdictInput>): VerdictInput => ({
  score: 90, confidence: 'high', artDriven: true, runStatus: 'finished', volumes: 6, print: 'in_print', priceRising: false,
  budgetRemaining: 100, typicalPrice: 20, ...over,
});

describe('decideVerdict — one rule at a time', () => {
  it('score under 60 → digital', () => expect(decideVerdict(V({ score: 59 })).rule).toBe('low_score'));
  it('low confidence → digital, whatever the score', () => expect(decideVerdict(V({ confidence: 'low', score: 95 })).rule).toBe('low_score'));
  it('only digital exists → digital', () => expect(decideVerdict(V({ print: 'digital_only' }))).toMatchObject({ outcome: 'digital', rule: 'digital_only' }));
  it('85+, finished ≤12 volumes, art-driven → buy physical, with the plan’s wording', () => {
    expect(decideVerdict(V({ score: 91 }))).toMatchObject({ outcome: 'buy_physical', rule: 'buy_art_finished', reason: "Buy physical: you'd score it 91, it's a finished 6-volume run, and the art is the main draw." });
  });
  it('85+ and out of print → buy physical now, noting scarcity', () => {
    const v = decideVerdict(V({ artDriven: false, print: 'out_of_print' }));
    expect(v).toMatchObject({ outcome: 'buy_physical', rule: 'buy_scarce' });
    expect(v.reason).toContain('harder to find');
  });
  it('85+ and rising in price → buy physical', () => expect(decideVerdict(V({ artDriven: false, priceRising: true })).rule).toBe('buy_scarce'));
  it('70–84 and art-driven → borrow', () => expect(decideVerdict(V({ score: 78 })).outcome).toBe('borrow'));
  it('long ongoing → digital until volume 1 is done', () => {
    expect(decideVerdict(V({ score: 80, artDriven: false, runStatus: 'ongoing', volumes: 40 }))).toMatchObject({ outcome: 'digital', rule: 'long_ongoing' });
  });
  it('budget used → wait for a sale', () => {
    expect(decideVerdict(V({ score: 75, artDriven: false, budgetRemaining: 5 }))).toMatchObject({ outcome: 'wait_sale', rule: 'budget_used' });
  });
  it('with no budget set the budget rule never fires', () => expect(decideVerdict(V({ score: 75, artDriven: false, budgetRemaining: null })).rule).toBe('fallback'));
});

describe('decideVerdict — order and edits', () => {
  it('first match wins: low score beats everything', () => {
    expect(decideVerdict(V({ score: 40, print: 'digital_only', budgetRemaining: 0 })).rule).toBe('low_score');
  });
  it('the plan’s order is literal: a top-scoring buy fires before the budget rule', () => {
    expect(decideVerdict(V({ budgetRemaining: 0 })).outcome).toBe('buy_physical');
  });
  it('thresholds are editable', () => {
    expect(decideVerdict(V({ score: 80 }), { ...DEFAULT_THRESHOLDS, buyAtLeast: 80 }).outcome).toBe('buy_physical');
  });
  it('"Not quite" overrides replace the wrong input', () => {
    const v = V({ artDriven: true });
    expect(decideVerdict(applyOverrides(v, { artDriven: false })).rule).not.toBe('buy_art_finished');
    expect(applyOverrides(v, undefined)).toEqual(v);
  });
});
