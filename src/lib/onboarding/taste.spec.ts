import { describe, expect, it } from 'vitest';
import { ONBOARDING_EVENT_PREFIX, buildSignals, EMPTY_SELECTIONS, signalsToEvents, summarizeTaste, type TasteSelections } from './taste';
import { INITIAL_ONBOARDING, MIN_PICKS, PICK_STAGES, STAGE_ORDER, STAGE_PICKS, isStage, nextStage, nextStageFor, prevStage, prevStageFor, progressOf, sanitizeOnboarding } from './flow';
import { initialChoices, rebuildStep, nextChoices } from './discovery';
import { CHARACTERS, RELATIONSHIPS } from './entities';
import { characterGraph } from './graph';
import { emptyProfile, recomputeProfile } from '../engines/taste/profile';

const NOW = new Date('2026-10-01T10:00:00Z');
const sel = (over: Partial<TasteSelections> = {}): TasteSelections => ({ ...EMPTY_SELECTIONS, ...over });

// The reader from the spec: Batman + Nightwing + Red Hood, noir/dark/detective, Tim Sale, Jeph Loeb.
const noirFan = sel({
  characters: ['char:batman', 'char:nightwing', 'char:red-hood', 'char:joker'],
  artStyles: ['style:noir', 'style:horror-gritty'],
  artists: ['creator:tim-sale'],
  writers: ['creator:jeph-loeb'],
  genres: ['genre:detective', 'genre:crime'],
  traits: ['trait:dark', 'trait:mystery', 'trait:characters'],
});

describe('signals keep their provenance', () => {
  const signals = buildSignals(noirFan);
  it('records each pick as an onboarding LIKE, typed by what it is', () => {
    expect(signals.every((s) => s.signal === 'LIKE' && s.source === 'ONBOARDING' && s.strength > 0)).toBe(true);
    const types = new Set(signals.map((s) => s.entityType));
    expect(types).toEqual(new Set(['CHARACTER', 'CREATOR', 'ART_STYLE', 'GENRE', 'STORY_TRAIT']));
  });
  it('counts a creator once even if listed as both artist and writer', () => {
    expect(buildSignals(sel({ artists: ['creator:frank-miller'], writers: ['creator:frank-miller'] }))).toHaveLength(1);
  });
  it('has nothing for an empty selection', () => {
    expect(buildSignals(EMPTY_SELECTIONS)).toEqual([]);
  });
});

describe('events for the taste engine', () => {
  const events = signalsToEvents(noirFan, NOW);
  it('all carry the onboarding prefix, so a re-run can replace exactly these and nothing else', () => {
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.id.startsWith(ONBOARDING_EVENT_PREFIX))).toBe(true);
  });
  it('have unique ids (re-running never duplicates)', () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });
  it('like the catalog’s spelling of a character with several (The Flash, Flash)', () => {
    const flash = signalsToEvents(sel({ characters: ['char:flash'] }), NOW).map((e) => e.tag?.value);
    expect(flash).toEqual(expect.arrayContaining(['The Flash', 'Flash']));
  });
  it('turn genre cards into genre likes and traits into both genre likes and dimension seeds', () => {
    const t = (id: string) => events.filter((e) => e.id.startsWith(`${ONBOARDING_EVENT_PREFIX}${id}:`));
    expect(t('genre:detective').map((e) => e.tag?.value).sort()).toEqual(['detective', 'mystery']);
    expect(events.some((e) => e.type === 'preference_seed' && e.dimension === 'tone')).toBe(true);
  });
  it('are empty for an empty selection, and ignore unknown ids', () => {
    expect(signalsToEvents(EMPTY_SELECTIONS, NOW)).toEqual([]);
    expect(signalsToEvents(sel({ characters: ['char:nobody'], genres: ['genre:???'] }), NOW)).toEqual([]);
  });
  it('actually shapes the profile the rest of the app reads', () => {
    const p = recomputeProfile(events, new Map(), NOW);
    expect(p.affinities.character.Batman.score).toBeGreaterThanOrEqual(0.3);
    expect(p.affinities.creator['Tim Sale'].score).toBeGreaterThan(0);
    expect(p.affinities.genre.detective.score).toBeGreaterThanOrEqual(0.3);
    expect(p.sweetSpots.tone.value).toBeGreaterThan(0.6); // noir + dark => a darker sweet spot
    expect(p.sweetSpots.tone.confidence).toBeLessThanOrEqual(0.3); // ...but stated, so modest
  });
  it('leaves an empty profile untouched when nothing was picked', () => {
    expect(recomputeProfile([], new Map(), NOW)).toEqual(emptyProfile());
  });
});

describe('the starting-taste reveal', () => {
  const t = summarizeTaste(noirFan);
  it('describes what was actually picked, in the reader’s terms', () => {
    expect(t.leanings).toEqual(expect.arrayContaining(['Dark', 'Detective']));
    expect(t.characters).toEqual(['Batman', 'Nightwing', 'Red Hood']);
    expect(t.visual).toEqual(['Noir & shadow', 'Horror & gritty']);
    expect(t.story).toEqual(expect.arrayContaining(['Detective & mystery', 'Crime']));
  });
  it('shows at most four leanings', () => {
    expect(t.leanings.length).toBeLessThanOrEqual(4);
  });
  it('is honest about how much it knows', () => {
    expect(t.confidence.characters).toBe('medium'); // 4 picks
    expect(summarizeTaste(sel({ characters: ['char:batman', 'char:nightwing', 'char:red-hood', 'char:joker', 'char:robin', 'char:batgirl'] })).confidence.characters).toBe('high');
    expect(t.confidence.creators).toBe('low'); // 2 picks
    expect(t.confidence.reading).toBe('unknown'); // never claimed at onboarding
  });
  it('does not invent a persona from a couple of picks', () => {
    const few = summarizeTaste(sel({ characters: ['char:batman'] }));
    expect(few.confidence.characters).toBe('low');
    expect(few.leanings).toEqual([]);
  });
  it('an empty selection says so instead of fabricating taste', () => {
    const e = summarizeTaste(EMPTY_SELECTIONS);
    expect(e.empty).toBe(true);
    expect(e.leanings).toEqual([]);
    expect(Object.values(e.confidence).every((c) => c === 'unknown')).toBe(true);
  });
  it('reads light-hearted picks as light-hearted', () => {
    expect(summarizeTaste(sel({ artStyles: ['style:bright-colorful'], traits: ['trait:humor'] })).leanings).toContain('Light-hearted');
  });
});

describe('the flow', () => {
  it('runs welcome -> characters -> villains -> art -> artists -> writers -> genres -> traits -> processing -> reveal -> collection -> library -> first pick -> done', () => {
    expect(STAGE_ORDER).toEqual(['welcome', 'characters', 'villains', 'art', 'artists', 'writers', 'genres', 'traits', 'processing', 'reveal', 'collection', 'library_ready', 'first_pick', 'done']);
  });
  it('advances one step at a time and stops at the end', () => {
    expect(nextStage('welcome')).toBe('characters');
    expect(nextStage('traits')).toBe('processing');
    expect(nextStage('done')).toBe('done');
  });
  it('editing your picks saves and leaves, skipping the reveal and collection', () => {
    expect(nextStage('traits', true)).toBe('done');
    expect(nextStage('characters', true)).toBe('villains');
  });
  it('lets you go back through the picking steps, but not back into a processed result', () => {
    expect(prevStage('villains')).toBe('characters');
    expect(prevStage('characters')).toBe('welcome');
    expect(prevStage('welcome')).toBeNull();
    for (const s of ['processing', 'reveal', 'collection', 'library_ready', 'first_pick', 'done'] as const) expect(prevStage(s)).toBeNull();
    expect(prevStage('characters', true)).toBeNull();
  });
  it('shows progress only on picking steps', () => {
    expect(progressOf('welcome')).toBeNull();
    expect(progressOf('characters')).toEqual({ index: 0, total: PICK_STAGES.length });
    expect(progressOf('traits')).toEqual({ index: PICK_STAGES.length - 1, total: PICK_STAGES.length });
    expect(progressOf('reveal')).toBeNull();
  });
  it('only requires picks on the first step, and never traps anyone (skip is always available)', () => {
    expect(MIN_PICKS.characters).toBe(3);
    expect(Object.keys(MIN_PICKS)).toEqual(['characters']);
  });
  it('every picking stage writes to a list', () => {
    for (const s of PICK_STAGES) expect(STAGE_PICKS[s]).toBeTruthy();
    expect(STAGE_PICKS.characters).toBe(STAGE_PICKS.villains); // heroes and villains are one preference list
  });
  it('recognises real stages only', () => {
    expect(isStage('artists')).toBe(true);
    expect(isStage('nope')).toBe(false);
    expect(isStage(3)).toBe(false);
  });
});

describe('adapting to a newcomer', () => {
  it('skips the artist and writer steps for someone new to comics, both ways', () => {
    expect(nextStageFor('art', false, 'new')).toBe('genres');
    expect(prevStageFor('genres', false, 'new')).toBe('art');
    expect(nextStageFor('art', false, 'experienced')).toBe('artists');
    expect(nextStageFor('art', false, 'unknown')).toBe('artists');
    expect(prevStageFor('genres', false, 'unknown')).toBe('writers');
  });
  it('still ends editing at traits', () => {
    expect(nextStageFor('traits', true, 'new')).toBe('done');
  });
});

describe('resuming the collection step', () => {
  it('keeps a valid draft and drops broken rows and repeats', () => {
    const good = { workId: 'a', title: 'A', ownership: 'digital', reading: 'reading', source: 'shelf_scan' };
    const s = sanitizeOnboarding({ draft: [good, good, { ...good, workId: 'b', ownership: 'lent' }, { workId: 'c' }, null, 5, { ...good, workId: 'd', source: '???' }] });
    expect(s.draft.map((d) => d.workId)).toEqual(['a', 'd']);
    expect(s.draft[1].source).toBe('manual');
    expect(sanitizeOnboarding({ draft: 'nope' }).draft).toEqual([]);
  });
});

describe('resuming', () => {
  it('reads valid progress back exactly', () => {
    const saved = { ...INITIAL_ONBOARDING, stage: 'writers', selections: noirFan, seed: 42 };
    expect(sanitizeOnboarding(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
  it('recovers from garbage with a fresh start', () => {
    for (const bad of [null, undefined, 7, 'x', [], {}]) expect(sanitizeOnboarding(bad)).toEqual(INITIAL_ONBOARDING);
  });
  it('drops ids that no longer exist and duplicates, keeping the rest', () => {
    const s = sanitizeOnboarding({ stage: 'art', selections: { characters: ['char:batman', 'char:batman', 'char:removed-in-v2', 42], artists: ['creator:tim-sale', 'creator:jeph-loeb'], writers: ['creator:jeph-loeb', 'creator:tim-sale'] } });
    expect(s.selections.characters).toEqual(['char:batman']);
    expect(s.selections.artists).toEqual(['creator:tim-sale']); // Jeph Loeb is a writer, not an artist
    expect(s.selections.writers).toEqual(['creator:jeph-loeb']);
  });
  it('an unknown stage restarts at the welcome, and a completed flow stays done', () => {
    expect(sanitizeOnboarding({ stage: 'hyperspace' }).stage).toBe('welcome');
    expect(sanitizeOnboarding({ completed: true, stage: 'characters' }).stage).toBe('done');
  });
  it('does not let a huge list through', () => {
    const many = Array.from({ length: 500 }, (_, i) => `char:${i}`);
    expect(sanitizeOnboarding({ selections: { characters: many } }).selections.characters).toEqual([]);
  });
  it('restores the very same choices on screen after a relaunch', () => {
    const relate = characterGraph(RELATIONSHIPS);
    const pool = CHARACTERS.filter((c) => c.alignment !== 'villain' && c.alignment !== 'variable');
    const picks = ['char:batman', 'char:nightwing', 'char:spider-man'];
    // live: tap by tap
    let visible = initialChoices(pool, 9);
    const shown = new Set(visible);
    const chosen: string[] = [];
    for (const p of picks) {
      chosen.push(p);
      visible = visible.filter((id) => id !== p);
      const r = nextChoices({ pool, relate, selected: chosen, shown, visible, seed: 5 }, p, 3);
      r.add.forEach((id) => shown.add(id));
      visible = visible.filter((id) => !r.retire.includes(id)).concat(r.add);
    }
    const rebuilt = rebuildStep({ pool, relate, selected: picks, seed: 5 });
    expect(rebuilt.visible).toEqual(visible);
    expect([...rebuilt.shown].sort()).toEqual([...shown].sort());
  });
  it('ignores a saved pick that is not in this step’s pool', () => {
    const relate = characterGraph(RELATIONSHIPS);
    const heroes = CHARACTERS.filter((c) => c.alignment === 'hero');
    const r = rebuildStep({ pool: heroes, relate, selected: ['char:joker'], seed: 1 });
    expect(r.visible).not.toContain('char:joker');
  });
});
