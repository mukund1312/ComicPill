import { describe, expect, it } from 'vitest';
import { decideRead } from './decide';
import { partitionCandidates } from './eligibility';
import { accessFor } from './evaluate';
import type { CandidateInput, ComparisonContext, JourneyPosition, Predecessor, ReadingState } from './types';
import { emptyProfile } from '../../taste/profile';
import type { Dim } from '../../../types/domain';
import type { ScorableWork } from '../../../types/engine-io';

const DIMS: Dim[] = ['tone', 'violence', 'scale', 'complexity', 'mystery', 'pace', 'artForward', 'commitment'];
function work(id: string, over: Partial<ScorableWork> & { fp?: Partial<Record<Dim, number>> } = {}): ScorableWork {
  const fingerprint = {} as Record<Dim, number>;
  DIMS.forEach((d) => { fingerprint[d] = 0.5; });
  Object.assign(fingerprint, over.fp);
  const { fp: _fp, ...rest } = over;
  return {
    id, title: id, bucket: 'batman', universe: 'main', fingerprint, genres: [], creators: [], characters: [],
    contextNeeded: 'none', requiredParentIds: [], own: 'none', keeper: false, pricePaise: null, formatVerdict: 'physical', ...rest,
  };
}
const cand = (w: ScorableWork, state: ReadingState = 'unread', extra: Partial<CandidateInput> = {}): CandidateInput =>
  ({ work: w, state, journey: null, predecessors: [], ...extra });

const JOURNEY = 'Batman: From Year One to Legacy';
const nextStep: JourneyPosition = { arcId: 'a1', arcTitle: JOURNEY, chapterTitle: 'The First Robin', milestoneTitle: 'Dick Grayson enters Bruce’s life', isNext: true };
const longHalloween: Predecessor = { workId: 'long-halloween', title: 'Batman: The Long Halloween', state: 'finished', kind: 'direct_sequel' };

function ctx(over: Partial<ComparisonContext> = {}): ComparisonContext {
  const profile = emptyProfile();
  profile.affinities.genre.detective = { score: 0.7, seen: 4 };
  profile.affinities.genre.horror = { score: 0.7, seen: 3 }; // this reader likes dark, psychological Batman
  return {
    profile, mood: null, intent: 'best', travelMode: 'any', rereadsAllowed: false, recentFinished: [],
    currentlyReading: [{ workId: 'worlds-finest', title: 'Batman/Superman: World’s Finest' }],
    activeJourneys: [JOURNEY], titleById: new Map(), ...over,
  };
}

// ---- The exact scenario from the screenshots --------------------------------------
const birthright = work('Superman: Birthright', { bucket: 'heroic', own: 'physical', genres: ['heroic', 'drama'], fp: { tone: 0.4 } });
const absBatman = work('Absolute Batman Vol. 1: The Zoo', { bucket: 'elseworld', universe: 'alternate', own: 'physical', genres: ['crime', 'detective'] });
const cult = work('Batman: The Cult', { own: 'digital', genres: ['horror', 'crime'], fp: { tone: 0.88, violence: 0.8, commitment: 0.25, mystery: 0.4 } });
const darkVictory = work('Batman: Dark Victory', { id: 'dark-victory', own: 'physical', genres: ['detective', 'mystery', 'crime'], fp: { tone: 0.55, mystery: 0.85, pace: 0.35, commitment: 0.55 } });

const screenshot = () => [
  cand(birthright, 'finished'),
  cand(absBatman, 'finished'),
  cand(cult),
  cand(darkVictory, 'unread', { journey: nextStep, predecessors: [longHalloween] }),
];

describe('the screenshot scenario', () => {
  const d = decideRead(screenshot(), ctx());

  it('does not rank books the reader already finished — it explains them', () => {
    expect(d.excluded.map((e) => e.title).sort()).toEqual(['Absolute Batman Vol. 1: The Zoo', 'Superman: Birthright']);
    expect(d.excluded.every((e) => e.reason === 'already_finished' && e.canReread)).toBe(true);
    expect(d.order.map((e) => e.title)).toEqual(['Batman: Dark Victory', 'Batman: The Cult']);
  });

  it('answers the three questions: what, why now, what after', () => {
    expect(d.primary?.title).toBe('Batman: Dark Victory');
    expect(d.primary?.headline).toBe('Continue your Batman journey.');
    expect(d.primary?.explanation).toContain('Continues directly from Batman: The Long Halloween, which you’ve already finished.');
    expect(d.primary?.explanation).toContain(`Advances your ${JOURNEY} journey`);
    expect(d.primary?.explanation).toContain('You already have it (physical).');
    expect(d.primary?.status).toBe('Physical • Owned • Unread');
    expect(d.thenNext?.title).toBe('Batman: The Cult');
  });

  it('gives exactly one of each position, and roles describe them', () => {
    expect(d.order.map((e) => e.position)).toEqual([1, 2]);
    expect(d.order[0].role).toBe('read_now');
    expect(d.order[1].role).toBe('detour'); // strong taste fit that doesn't advance the goal
  });

  it('explains why it beats The Cult, conceding what The Cult does better', () => {
    const line = d.beatsOthers.find((b) => b.title === 'Batman: The Cult')!.text;
    expect(line).toMatch(/moves your Batman: From Year One to Legacy journey forward/);
    expect(line).toMatch(/^Batman: The Cult .*, but Batman: Dark Victory /);
  });

  it('makes a real case for and against The Cult', () => {
    const c = d.order[1];
    expect(c.caseAgainst).toContain(`Doesn’t advance your ${JOURNEY} journey.`);
    expect(c.caseFor.join(' ')).toMatch(/detective|shorter read|already have it/i);
    expect(c.whyNotFirst.join(' ')).toMatch(/Batman: Dark Victory .*journey/);
    expect(c.bestFor.length).toBeGreaterThan(0);
  });

  it('marks the goal as the deciding dimension for Dark Victory', () => {
    const goal = d.order[0].dimensions.find((x) => x.key === 'goal')!;
    expect(goal.label).toBe('Excellent');
    expect(d.order[1].dimensions.find((x) => x.key === 'goal')!.label).toBe('Low');
  });

  it('is confident, because a hard fact and the goal both point the same way', () => {
    expect(d.confidence).toBe('high');
    expect(d.closeCall).toBeNull();
  });

  it('lists what would change the answer, including a reread', () => {
    const byLabel = Object.fromEntries(d.changesAnswer.map((c) => [c.label, c.title]));
    expect(byLabel['The darkest story']).toBe('Batman: The Cult');
    expect(byLabel['A shorter read']).toBe('Batman: The Cult');
    expect(byLabel['Continue your Batman journey']).toBe('Batman: Dark Victory');
    expect(byLabel['A reread']).toBeTruthy();
  });

  it('never shows a bare number or broken template text', () => {
    const strings = [
      d.primary!.headline, d.primary!.explanation, d.primary!.status,
      ...d.beatsOthers.map((b) => b.text),
      ...d.order.flatMap((o) => [...o.caseFor, ...o.caseAgainst, ...o.whyNotFirst, o.bestFor, o.tradeOff ?? '']),
      ...d.pairwise.map((p) => p.summary),
    ];
    for (const s of strings) expect(s).not.toMatch(/undefined|NaN|\[object|\bnull\b|\b0\.\d{2}\b|\{\w+\}/);
  });
});

describe('eligibility', () => {
  it('excludes finished and dropped by default; dropped can never be reread', () => {
    const { eligible, excluded } = partitionCandidates([cand(cult), cand(birthright, 'finished'), cand(absBatman, 'dropped')], { rereadsAllowed: false });
    expect(eligible.map((c) => c.work.id)).toEqual([cult.id]);
    expect(excluded.find((e) => e.reason === 'dropped')!.canReread).toBe(false);
  });

  it('a reading book stays eligible', () => {
    expect(partitionCandidates([cand(cult, 'reading')], { rereadsAllowed: false }).eligible).toHaveLength(1);
  });

  it('includes finished books when rereads are allowed, marked as rereads', () => {
    const d = decideRead(screenshot(), ctx({ rereadsAllowed: true }));
    expect(d.excluded).toEqual([]);
    expect(d.order).toHaveLength(4);
    const re = d.order.find((e) => e.title === 'Superman: Birthright')!;
    expect(re.isReread).toBe(true);
    expect(re.cons.some((c) => c.type === 'reread')).toBe(true);
  });

  it('ignores duplicate candidates', () => {
    expect(decideRead([cand(cult), cand(cult)], ctx()).order).toHaveLength(1);
  });

  it('handles nothing eligible without inventing a pick', () => {
    const d = decideRead([cand(birthright, 'finished')], ctx());
    expect(d.primary).toBeNull();
    expect(d.order).toEqual([]);
    expect(d.excluded).toHaveLength(1);
  });

  it('handles an empty comparison', () => {
    expect(decideRead([], ctx()).primary).toBeNull();
  });
});

describe('temporary intent', () => {
  it('"darkest" puts The Cult first, and says so', () => {
    const d = decideRead(screenshot(), ctx({ intent: 'darkest' }));
    expect(d.order[0].title).toBe('Batman: The Cult');
    expect(d.context.intent).toBe('darkest');
  });
  it('"short" favours the shorter book', () => {
    expect(decideRead(screenshot(), ctx({ intent: 'short' })).order[0].title).toBe('Batman: The Cult');
  });
  it('"continue a path" strengthens Dark Victory', () => {
    expect(decideRead(screenshot(), ctx({ intent: 'continue_path' })).order[0].title).toBe('Batman: Dark Victory');
  });
  it('does not offer "continue your journey" when there is no active journey', () => {
    const d = decideRead([cand(cult), cand(darkVictory)], ctx({ activeJourneys: [] }));
    expect(d.changesAnswer.some((c) => c.label.startsWith('Continue'))).toBe(false);
  });
});

describe('hard constraints beat preferences', () => {
  it('Travel Mode (digital only): a physical-only book cannot be first, even the goal book', () => {
    const d = decideRead(screenshot(), ctx({ travelMode: 'digital' }));
    expect(d.order[0].title).toBe('Batman: The Cult');
    const dv = d.order.find((e) => e.title === 'Batman: Dark Victory')!;
    expect(dv.access.status).toBe('not_now');
    expect(dv.cons.some((c) => c.type === 'not_available_now')).toBe(true);
    expect(dv.role).toBe('get_first');
    expect(d.beatsOthers[0].text).toMatch(/can be read now, while Batman: Dark Victory can’t/);
  });

  it('a book whose earlier volume is unread cannot be first, however well it fits', () => {
    const vol2 = work('vol-2', { id: 'vol-2', own: 'physical', genres: ['detective'], fp: { tone: 0.9 } });
    const filler = work('filler', { id: 'filler', own: 'physical' });
    const unreadVol1: Predecessor = { workId: 'vol-1', title: 'Volume One', state: 'unread', kind: 'direct_sequel' };
    const d = decideRead([cand(vol2, 'unread', { predecessors: [unreadVol1] }), cand(filler)], ctx({ activeJourneys: [] }));
    expect(d.order[0].title).toBe('filler');
    const blocked = d.order.find((e) => e.title === 'vol-2')!;
    expect(blocked.role).toBe('blocked');
    expect(blocked.caseAgainst).toContain('Comes after Volume One, which you haven’t finished yet.');
  });

  it('a missing REQUIRED prerequisite blocks it', () => {
    const w = work('needs-ctx', { id: 'needs-ctx', own: 'physical' });
    const pre: Predecessor = { workId: 'x', title: 'Batman: Year One', state: 'unread', kind: 'required_context' };
    const d = decideRead([cand(w, 'unread', { predecessors: [pre] }), cand(cult)], ctx({ activeJourneys: [] }));
    expect(d.order[0].title).toBe('Batman: The Cult');
    expect(d.order.find((e) => e.title === 'needs-ctx')!.dimensions.find((x) => x.key === 'readiness')!.label).toBe('Missing context');
  });

  it('when nothing is readable tonight, the answer says what to do first instead of pretending', () => {
    const d = decideRead([cand(work('unowned', { id: 'unowned', own: 'none' }))], ctx({ activeJourneys: [] }));
    expect(d.primary?.headline).toBe('Get this one first.');
    expect(d.order[0].role).toBe('get_first');
    expect(d.primary?.status).toBe('Not owned');
  });

  it('owning both formats gives no ranking advantage over one', () => {
    expect(accessFor('both', 'any').status).toBe('available');
    const a = decideRead([cand(work('a', { id: 'a', own: 'both' })), cand(work('b', { id: 'b', own: 'physical' }))], ctx({ activeJourneys: [] }));
    const accessScores = a.order.map((o) => o.dimensions.find((x) => x.key === 'access')!.score);
    expect(new Set(accessScores).size).toBe(1);
  });

  it('Travel Mode treats subscription as digital', () => {
    expect(accessFor('subscription', 'digital').status).toBe('available');
    expect(accessFor('physical', 'digital').status).toBe('not_now');
    expect(accessFor('wishlist', 'any').status).toBe('not_owned');
  });
});

describe('sequence planning', () => {
  it('never puts a sequel above the book it follows', () => {
    const first = work('first', { id: 'first', own: 'physical' });
    const sequel = work('sequel', { id: 'sequel', own: 'physical', genres: ['detective'], fp: { tone: 0.9 } });
    const pre: Predecessor = { workId: 'first', title: 'first', state: 'unread', kind: 'direct_sequel' };
    const d = decideRead([cand(sequel, 'unread', { predecessors: [pre] }), cand(first)], ctx({ activeJourneys: [] }));
    expect(d.order.map((e) => e.title)).toEqual(['first', 'sequel']);
    expect(d.relationships.some((r) => r.basis === 'STORY_ORDER' && r.from === 'first' && r.to === 'sequel')).toBe(true);
    expect(d.pairwise.find((p) => p.winnerId === 'first' && p.otherId === 'sequel')!.decidedBy).toBe('order');
  });

  it('records the preference / path order between the top two, labelled by kind', () => {
    const d = decideRead(screenshot(), ctx());
    const rel = d.relationships.find((r) => r.from === 'dark-victory')!;
    expect(rel.basis).toBe('PATH_ORDER');
    expect(rel.relation).toBe('RECOMMENDED_BEFORE');
  });

  it('a book you are already reading is honoured', () => {
    const d = decideRead([cand(cult, 'reading'), cand(darkVictory, 'unread', { journey: nextStep, predecessors: [longHalloween] })], ctx());
    const reading = d.order.find((e) => e.title === 'Batman: The Cult')!;
    expect(reading.pros.some((p) => p.type === 'in_progress')).toBe(true);
    expect(reading.dimensions.find((x) => x.key === 'continuity')!.label).toBe('In progress');
  });
});

describe('confidence and close calls', () => {
  it('near-identical books produce an honest close call, not a fake verdict', () => {
    const a = work('a', { id: 'a', own: 'physical' });
    const b = work('b', { id: 'b', own: 'physical' });
    const d = decideRead([cand(a), cand(b)], ctx({ activeJourneys: [] }));
    expect(d.confidence).not.toBe('high');
    expect(d.closeCall).toMatch(/Close call|effectively tied/);
  });
});

describe('compare at a glance', () => {
  const g = decideRead(screenshot(), ctx()).glance;

  it('hides mood when no mood was set', () => {
    expect(g.rows.some((r) => r.key === 'mood')).toBe(false);
  });
  it('collapses dimensions that do not separate the books into one line', () => {
    expect(g.rows.some((r) => r.key === 'readiness')).toBe(false);
    expect(g.uniformNotes).toContain('All of these are ready to read.');
  });
  it('puts the dimension with the biggest real difference first', () => {
    expect(g.rows[0].key).toBe('goal');
  });
  it('shows mood once a mood is chosen', () => {
    const withMood = decideRead(screenshot(), ctx({ mood: 'mysterious' })).glance;
    expect(withMood.rows.some((r) => r.key === 'mood')).toBe(true); // Dark Victory is mystery/detective, The Cult is not
  });
  it('collapses mood too when every book matches it equally ("dark" fits both)', () => {
    const g2 = decideRead(screenshot(), ctx({ mood: 'dark' })).glance;
    expect(g2.rows.some((r) => r.key === 'mood')).toBe(false);
  });
  it('always describes the experience of each book', () => {
    const exp = g.rows.find((r) => r.key === 'experience')!;
    expect(exp.cells.find((c) => c.workId === 'dark-victory')!.label).toMatch(/Detective/);
  });
});

describe('determinism', () => {
  it('gives the same answer for the same input, in any input order', () => {
    const a = decideRead(screenshot(), ctx());
    const b = decideRead([...screenshot()].reverse(), ctx());
    expect(b.order.map((e) => e.workId)).toEqual(a.order.map((e) => e.workId));
    expect(b.primary).toEqual(a.primary);
    expect(decideRead(screenshot(), ctx())).toEqual(a);
  });
});
