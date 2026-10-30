import { describe, expect, it } from 'vitest';
import { READING_ORDERS } from './data';
import { findOrders, normalize, progressFor, summaryLine, titleMatches } from './match';

const order = (id: string) => READING_ORDERS.find((o) => o.id === id)!;
const entry = (id: string, title: string) => order(id).entries.find((x) => x.title === title)!;

describe('normalize', () => {
  it('folds every way of writing a volume', () => {
    expect(normalize('Time Runs Out v01')).toBe(normalize('Time Runs Out Vol. 1'));
    expect(normalize('Time Runs Out Volume 01')).toBe('time runs out v1');
  });
});

describe('matching real file names', () => {
  it('finds Time Runs Out volumes', () => {
    const tro1 = entry('secret-wars-2015', 'Avengers: Time Runs Out Vol. 1');
    expect(titleMatches(tro1, 'Avengers - Time Runs Out v01 (2015) (Digital) (F) (Zone-Empire)')).toBe(true);
    expect(titleMatches(tro1, 'Avengers - Time Runs Out v02 (2015) (Digital) (F) (Zone-Empire)')).toBe(false);
  });
  it('finds the Hickman runs', () => {
    expect(titleMatches(entry('secret-wars-2015', 'Avengers by Jonathan Hickman Vol. 2'), 'Avengers by Jonathan Hickman v02 (2019) (Digital) (Kileko-Empire)')).toBe(true);
    expect(titleMatches(entry('secret-wars-2015', 'Avengers by Jonathan Hickman Vol. 2'), 'New Avengers by Jonathan Hickman v02')).toBe(false); // the New Avengers entry is its own
    expect(titleMatches(entry('secret-wars-2015', 'Fantastic Four by Jonathan Hickman Vol. 3'), 'Fantastic Four By Jonathan Hickman - The Complete Collection v03')).toBe(true);
  });
  it('does not mistake other Infinity or Secret Wars books', () => {
    expect(titleMatches(entry('secret-wars-2015', 'Infinity'), 'Infinity Gauntlet')).toBe(false);
    expect(titleMatches(entry('secret-wars-2015', 'Infinity'), 'Infinity (2013)')).toBe(true);
    expect(titleMatches(entry('secret-wars-2015', 'Secret Wars (2015)'), 'Secret Wars (TPB) (2016) GetComics.INFO')).toBe(true);
    expect(titleMatches(entry('secret-wars-2015', 'Secret Wars (2015)'), 'Secret Wars Journal')).toBe(false);
  });
  it('tells Civil War from its tie-ins and the road to it', () => {
    const core = entry('civil-war-2006', 'Civil War');
    expect(titleMatches(core, 'Civil War (2007) (Digital)')).toBe(true);
    expect(titleMatches(core, 'Civil War - The Road to Civil War (2007) (F) (Digital-Empire)')).toBe(false);
    expect(titleMatches(entry('civil-war-2006', 'The Road to Civil War'), 'Civil War - The Road to Civil War (2007) (F) (Digital-Empire)')).toBe(true);
  });
  it('tells World War Hulk from its parts', () => {
    expect(titleMatches(entry('world-war-hulk', 'World War Hulk'), 'World War Hulk (Story Arc) (2007-2008) Part 1')).toBe(true);
    expect(titleMatches(entry('world-war-hulk', 'World War Hulk'), 'World War Hulk - Front Line 01 (of 06)')).toBe(false);
    expect(titleMatches(entry('world-war-hulk', 'Planet Hulk'), 'Hulk - Planet Hulk Prelude (2010) (Digital)')).toBe(false);
    expect(titleMatches(entry('world-war-hulk', 'Planet Hulk Prelude'), 'Hulk - Planet Hulk Prelude (2010) (Digital)')).toBe(true);
    expect(titleMatches(entry('world-war-hulk', 'Planet Hulk'), 'Hulk - Planet Hulk (2008) (Digital) (F) (Kileko-Empire)')).toBe(true);
  });
  it('keeps the DC crises apart', () => {
    expect(titleMatches(entry('dc-crisis-to-flashpoint', 'Infinite Crisis'), 'Crisis on Infinite Earths')).toBe(false);
    expect(titleMatches(entry('dc-crisis-to-flashpoint', 'Crisis on Infinite Earths'), 'Crisis on Infinite Earths')).toBe(true);
    expect(titleMatches(entry('dc-crisis-to-flashpoint', 'Flashpoint'), 'Flashpoint (2011)')).toBe(true);
    expect(titleMatches(entry('dc-crisis-to-flashpoint', 'Flashpoint'), 'Flashpoint: Batman: Knight of Vengeance')).toBe(false);
  });
});

describe('progress', () => {
  const owned = ['Avengers - Time Runs Out v01 (2015)', 'Avengers - Time Runs Out v02 (2015)', 'Secret Wars (TPB) (2016) GetComics.INFO'];
  const p = progressFor(order('secret-wars-2015'), owned);
  it('counts what you have', () => {
    expect(p.have).toBe(3);
    expect(p.haveEssential).toBe(3);
    expect(p.missing.length).toBe(p.total - 3);
  });
  it('lists essential gaps before optional ones', () => {
    const firstOptional = p.missing.findIndex((m) => m.role === 'optional');
    expect(p.missing.slice(0, firstOptional).every((m) => m.role === 'essential')).toBe(true);
    expect(summaryLine(p)).toMatch(/^You have 3 of \d+\. Missing: /);
  });
  it('says so when you have everything', () => {
    const all = progressFor(order('flashpoint'), order('flashpoint').entries.map((x) => x.exact?.[0] ?? x.match![0]));
    expect(summaryLine(all)).toBe(`You have all ${all.total}.`);
  });
});

describe('findOrders', () => {
  it('turns free text into the right order', () => {
    expect(findOrders('I want to read Flashpoint', READING_ORDERS)[0].id).toBe('flashpoint');
    expect(findOrders('secret wars 2015', READING_ORDERS)[0].id).toBe('secret-wars-2015');
    expect(findOrders('hickman avengers', READING_ORDERS)[0].id).toBe('secret-wars-2015');
    expect(findOrders('blackest night', READING_ORDERS)[0].id).toBe('dc-crisis-to-flashpoint');
    expect(findOrders('planet hulk', READING_ORDERS)[0].id).toBe('world-war-hulk');
  });
  it('returns nothing for nonsense', () => {
    expect(findOrders('i want to read', READING_ORDERS)).toEqual([]);
    expect(findOrders('zzzz qqqq', READING_ORDERS)).toEqual([]);
  });
});
