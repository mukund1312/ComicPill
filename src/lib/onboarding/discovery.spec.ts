import { describe, expect, it } from 'vitest';
import { initialChoices, MAX_ADD, MAX_VISIBLE_UNSELECTED, MIN_ADD, nextChoices, quotas, searchEntities, seededUnit } from './discovery';
import { CHARACTERS, CREATORS, RELATIONSHIPS, type CharacterEntity } from './entities';
import { characterGraph, creatorGraph } from './graph';
import { CATALOG_WORKS } from '../db/seed/catalog';

const relate = characterGraph(RELATIONSHIPS);
const heroPool = CHARACTERS.filter((c) => c.alignment !== 'villain' && c.alignment !== 'variable');
const villainPool = CHARACTERS.filter((c) => c.alignment === 'villain' || c.alignment === 'variable');
const byId = new Map(CHARACTERS.map((c) => [c.id, c]));
const name = (id: string) => byId.get(id)!.name;

/** Play the screen: start with the opening choices, then tap picks in order. */
function play(pool: readonly CharacterEntity[], picks: string[], want = 3, seed = 7) {
  let visible = initialChoices(pool, 9);
  const shown = new Set(visible);
  const selected: string[] = [];
  const log: { pick: string; add: string[]; retire: string[]; shownBefore: Set<string>; selectedBefore: string[] }[] = [];
  for (const pick of picks) {
    // Not on screen yet? The reader found them with search — which counts as shown.
    if (!visible.includes(pick)) { visible = [...visible, pick]; shown.add(pick); }
    selected.push(pick);
    visible = visible.filter((id) => id !== pick);
    const shownBefore = new Set(shown);
    const r = nextChoices({ pool, relate, selected, shown, visible, seed }, pick, want);
    r.add.forEach((id) => shown.add(id));
    visible = visible.filter((id) => !r.retire.includes(id)).concat(r.add);
    log.push({ pick, ...r, shownBefore, selectedBefore: [...selected] });
  }
  return { visible, shown, selected, log };
}

describe('the opening screen', () => {
  const ids = initialChoices(heroPool, 9);
  it('offers the requested number of distinct choices', () => {
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
  });
  it('is led by the most popular characters, not an arbitrary list', () => {
    expect(ids).toContain('char:batman');
    expect(ids).toContain('char:spider-man');
  });
  it('never opens as one universe', () => {
    const pubs = ids.map((id) => (byId.get(id) as CharacterEntity).publisher);
    expect(new Set(pubs).size).toBeGreaterThanOrEqual(2);
    expect(pubs.filter((p) => p === 'DC').length).toBeLessThan(9);
    expect(pubs.filter((p) => p === 'Marvel').length).toBeLessThan(9);
  });
  it('is deterministic', () => {
    expect(initialChoices(heroPool, 9)).toEqual(ids);
  });
  it('can be biased (villains who oppose the chosen heroes come first)', () => {
    const enemies = new Set(['char:batman'].flatMap((h) => relate(h).map((n) => n.id)));
    const first = initialChoices(villainPool, 6, (e) => (enemies.has(e.id) ? 1 : 0));
    expect(first.slice(0, 3).every((id) => enemies.has(id))).toBe(true);
    expect(first).toContain('char:joker');
  });
});

describe('after a selection', () => {
  it('brings in related characters — Batman surfaces his own circle', () => {
    const { log } = play(heroPool, ['char:batman']);
    const added = log[0].add.map(name);
    expect(added.some((n) => ['Nightwing', 'Robin', 'Red Hood', 'Batgirl', 'Catwoman'].includes(n))).toBe(true);
  });
  it('adds between 2 and 4, however many were asked for', () => {
    for (const want of [1, 2, 3, 4, 9]) {
      const { log } = play(heroPool, ['char:batman'], want);
      expect(log[0].add.length).toBeGreaterThanOrEqual(MIN_ADD);
      expect(log[0].add.length).toBeLessThanOrEqual(MAX_ADD);
    }
  });
  it('never offers something twice, or something already shown or picked', () => {
    const { log } = play(heroPool, ['char:batman', 'char:nightwing', 'char:spider-man', 'char:daredevil', 'char:thor']);
    const all = log.flatMap((l) => l.add);
    expect(new Set(all).size).toBe(all.length);
    for (const l of log) {
      expect(l.add.filter((id) => l.shownBefore.has(id))).toEqual([]); // already on (or through) the screen
      expect(l.add.filter((id) => l.selectedBefore.includes(id))).toEqual([]); // already picked
    }
  });
  it('follows a new interest: Daredevil brings the street-level neighbours', () => {
    const { log } = play(heroPool, ['char:daredevil']);
    const added = log[0].add.map(name);
    expect(added.some((n) => ['Elektra', 'Punisher', 'Moon Knight', 'Black Widow', 'Spider-Man'].includes(n))).toBe(true);
  });
  it('and Superman brings his own', () => {
    const { log } = play(heroPool, ['char:superman']);
    expect(log[0].add.map(name).some((n) => ['Supergirl', 'Lois Lane', 'Wonder Woman'].includes(n))).toBe(true);
  });
  it('picking Batman AND Nightwing surfaces the wider family', () => {
    const { log } = play(heroPool, ['char:batman', 'char:nightwing']);
    const later = [...log[0].add, ...log[1].add].map(name);
    expect(later.some((n) => ['Red Hood', 'Robin', 'Batgirl'].includes(n))).toBe(true);
  });
});

describe('no echo chamber', () => {
  it('has the requested mix: about half related, some diverse, some exploration', () => {
    expect(quotas(4)).toEqual({ related: 2, diverse: 1, explore: 1 });
    expect(quotas(3)).toEqual({ related: 2, diverse: 1, explore: 0 });
    expect(quotas(2)).toEqual({ related: 1, diverse: 1, explore: 0 });
  });
  it('a batch is never all one publisher when others exist', () => {
    const { log } = play(heroPool, ['char:batman'], 4);
    const pubs = log[0].add.map((id) => (byId.get(id) as CharacterEntity).publisher);
    expect(new Set(pubs).size).toBeGreaterThanOrEqual(2);
  });
  it('a DC fan still gets shown Marvel, and the reverse', () => {
    const dc = play(heroPool, ['char:batman', 'char:nightwing', 'char:superman'], 4);
    expect(dc.log.flatMap((l) => l.add).some((id) => (byId.get(id) as CharacterEntity).publisher === 'Marvel')).toBe(true);
    const marvel = play(heroPool, ['char:spider-man', 'char:daredevil', 'char:thor'], 4);
    expect(marvel.log.flatMap((l) => l.add).some((id) => (byId.get(id) as CharacterEntity).publisher === 'DC')).toBe(true);
  });
});

describe('screen size', () => {
  it('never lets the un-picked choices grow past the cap, and never retires a pick or a new arrival', () => {
    const picks = heroPool.slice(0, 30).map((c) => c.id);
    const { log, visible } = play(heroPool, picks, 4);
    expect(visible.length).toBeLessThanOrEqual(MAX_VISIBLE_UNSELECTED);
    for (const l of log) {
      // judged at THAT step: something retired now may be found by search and picked later
      expect(l.retire.filter((id) => l.selectedBefore.includes(id) || id === l.pick)).toEqual([]);
      expect(l.retire.filter((id) => l.add.includes(id))).toEqual([]);
    }
  });
  it('retires the least relevant first (unrelated, unpopular), keeping the picks’ neighbours', () => {
    const { log } = play(heroPool, heroPool.slice(0, 12).map((c) => c.id), 4);
    const retired = log.flatMap((l) => l.retire);
    expect(retired.length).toBeGreaterThan(0);
  });
  it('offers nothing once the pool is exhausted', () => {
    const shown = new Set(heroPool.map((c) => c.id));
    const r = nextChoices({ pool: heroPool, relate, selected: ['char:batman'], shown, visible: [], seed: 1 }, 'char:batman', 3);
    expect(r.add).toEqual([]);
  });
});

describe('villains follow the heroes', () => {
  it('Batman puts the Joker, Two-Face, Bane and the Riddler up first', () => {
    const enemies = new Map(relate('char:batman').map((n) => [n.id, n.strength]));
    const first = initialChoices(villainPool, 8, (e) => enemies.get(e.id) ?? 0).map(name);
    expect(first.slice(0, 4)).toEqual(expect.arrayContaining(['Joker', 'Two-Face']));
  });
  it('Spider-Man puts Venom and Doctor Octopus up first', () => {
    const enemies = new Map(relate('char:spider-man').map((n) => [n.id, n.strength]));
    const first = initialChoices(villainPool, 6, (e) => enemies.get(e.id) ?? 0).map(name);
    expect(first.slice(0, 2).sort()).toEqual(['Doctor Octopus', 'Venom']);
  });
  it('picking the Joker surfaces Harley Quinn and other Gotham rogues', () => {
    const { log } = play(villainPool, ['char:joker'], 3);
    expect(log[0].add.map(name).some((n) => ['Harley Quinn', 'Two-Face', 'Bane', 'Riddler'].includes(n))).toBe(true);
  });
});

describe('search', () => {
  const all = CHARACTERS;
  it('finds by name, case-insensitively, and by prefix', () => {
    expect(searchEntities('moon', all)[0].name).toBe('Moon Knight');
    expect(searchEntities('JOKER', all)[0].name).toBe('Joker');
    expect(searchEntities('bat', all).map((e) => e.name)).toEqual(expect.arrayContaining(['Batman', 'Batgirl']));
  });
  it('finds by alias', () => {
    expect(searchEntities('peter parker', all)[0].name).toBe('Spider-Man');
    expect(searchEntities('dick grayson', all)[0].name).toBe('Nightwing');
  });
  it('ranks an exact match above a partial one', () => {
    expect(searchEntities('robin', all)[0].name).toBe('Robin');
  });
  it('returns nothing for an empty or unmatched query, and honours the limit', () => {
    expect(searchEntities('', all)).toEqual([]);
    expect(searchEntities('   ', all)).toEqual([]);
    expect(searchEntities('zzzzqq', all)).toEqual([]);
    expect(searchEntities('a', all, 3).length).toBeLessThanOrEqual(3);
  });
  it('ignores accents in creator names', () => {
    expect(searchEntities('george perez', CREATORS)[0].name).toBe('George Pérez');
  });
});

describe('determinism', () => {
  it('same inputs and seed give the same choices', () => {
    expect(play(heroPool, ['char:batman', 'char:spider-man'], 4, 3)).toEqual(play(heroPool, ['char:batman', 'char:spider-man'], 4, 3));
  });
  it('the exploration slot varies with the seed, the rest does not', () => {
    const a = play(heroPool, ['char:batman'], 4, 1).log[0].add;
    const b = play(heroPool, ['char:batman'], 4, 2).log[0].add;
    expect(a.slice(0, 3)).toEqual(b.slice(0, 3));
  });
  it('the hash is stable and spread over [0,1)', () => {
    expect(seededUnit(5, 'char:batman')).toBe(seededUnit(5, 'char:batman'));
    const vals = CHARACTERS.map((c) => seededUnit(5, c.id));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...vals)).toBeLessThan(1);
    expect(new Set(vals).size).toBeGreaterThan(CHARACTERS.length * 0.9);
  });
});

describe('creator similarity comes from the catalog, not invention', () => {
  const works = CATALOG_WORKS.map((w) => ({ id: w.id, characters: w.characters, genres: w.genres, creators: w.creators, publisher: w.publisher }));
  const artists = CREATORS.filter((c) => c.roles.includes('artist'));
  const relateArtists = creatorGraph(artists, works);

  it('gives every artist at least one neighbour', () => {
    expect(artists.filter((a) => relateArtists(a.id).length === 0).map((a) => a.name)).toEqual([]);
  });
  it('is symmetric', () => {
    for (const a of artists) for (const n of relateArtists(a.id)) expect(relateArtists(n.id).some((x) => x.id === a.id)).toBe(true);
  });
  it('keeps strengths within (0, 1]', () => {
    for (const a of artists) for (const n of relateArtists(a.id)) { expect(n.strength).toBeGreaterThan(0); expect(n.strength).toBeLessThanOrEqual(1); }
  });
  it('never relates a creator to themself', () => {
    for (const a of artists) expect(relateArtists(a.id).some((n) => n.id === a.id)).toBe(false);
  });
  it('relates artists who worked on the same characters (Batman artists cluster)', () => {
    const sale = relateArtists('creator:tim-sale').map((n) => n.id);
    expect(sale.some((id) => ['creator:jim-lee', 'creator:david-mazzucchelli', 'creator:greg-capullo', 'creator:darwyn-cooke'].includes(id))).toBe(true);
  });
  it('drives creator discovery end to end', () => {
    const r = nextChoices({ pool: artists, relate: relateArtists, selected: ['creator:tim-sale'], shown: new Set(['creator:tim-sale']), visible: [], seed: 2 }, 'creator:tim-sale', 3);
    expect(r.add.length).toBeGreaterThanOrEqual(2);
    expect(r.add).not.toContain('creator:tim-sale');
  });
});
