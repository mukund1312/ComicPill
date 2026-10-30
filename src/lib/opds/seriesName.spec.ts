import { describe, expect, it } from 'vitest';
import { groupSeries, looksFlat, seriesOf } from './seriesName';

describe('seriesOf', () => {
  it('drops tags, volume and issue numbers', () => {
    expect(seriesOf('Ice Cream Man v03 - Hopscotch Mélange (2019) (Digital) (EJGriffin-Empire).cbz')).toBe('Ice Cream Man');
    expect(seriesOf('Gideon Falls (2018) v04 - The Pentoculus (2020) (Digital).cbr')).toBe('Gideon Falls');
    expect(seriesOf('Clayface - Celebrity Dirt 003 (2026) (digital) (Pyrate-DCP).cbz')).toBe('Clayface - Celebrity Dirt');
    expect(seriesOf('Ultimate Spider-Man - Ultimate Collection Book 02 (2009) (Digital).cbr')).toBe('Ultimate Spider-Man - Ultimate Collection');
    expect(seriesOf('Kill Or Be Killed v01 (2017) GetComics.INFO.cbz')).toBe('Kill Or Be Killed');
    expect(seriesOf('The Department of Truth v01 - The End of the World (2021).cbz')).toBe('Department of Truth');
    expect(seriesOf('Department of Truth, Volume 4 The Ministry of Lies.cbz')).toBe('Department of Truth');
  });
});

describe('groupSeries', () => {
  const g = groupSeries([
    'Ultimate Wolverine - The Winter Soldier v01 (2025).cbz', 'Ultimate Wolverine v02 (2026).cbz',
    'Animal Man by Grant Morrison Book 01 (2020).cbr', 'Animal Man by Grant Morrison 30th Anniversary Deluxe Edition Book 02 (2020).cbr',
    'Fantastic Four By Jonathan Hickman - The Complete Collection v03.cbz', 'Fantastic Four by Jonathan Hickman - The Complete Collection v01 (2018).cbz',
    'Mister Miracle (2019).cbr',
  ]);
  it('joins a name that continues another series', () => {
    expect(g.get('Ultimate Wolverine - The Winter Soldier v01 (2025).cbz')).toBe('Ultimate Wolverine');
    expect(g.get('Animal Man by Grant Morrison 30th Anniversary Deluxe Edition Book 02 (2020).cbr')).toBe('Animal Man by Grant Morrison');
  });
  it('shares one spelling across capitals', () => {
    expect(g.get('Fantastic Four By Jonathan Hickman - The Complete Collection v03.cbz')).toBe(g.get('Fantastic Four by Jonathan Hickman - The Complete Collection v01 (2018).cbz'));
  });
  it('knows a flat catch-all from a real series', () => {
    expect(looksFlat(g)).toBe(true);
    expect(looksFlat(groupSeries(['Crossed 000 (2008).cbr', 'Crossed 001 (2008).cbr', 'Crossed 002 (2009).cbr']))).toBe(false);
  });
});
