import { describe, expect, it } from 'vitest';
import { findCatalogMatch } from './catalogMatch';

const catalog = [
  { id: 'w1', title: 'Saga, Vol. 1' }, { id: 'w2', title: 'Saga, Vol. 2' }, { id: 'w3', title: 'Batman: The Long Halloween' }, { id: 'w4', title: 'Absolute Batman Vol. 1: The Zoo' },
];

describe('matching an imported file to the catalog', () => {
  it('links a file that is clearly a catalog book', () => {
    expect(findCatalogMatch(catalog, 'Batman The Long Halloween', null)).toBe('w3');
    expect(findCatalogMatch(catalog, 'saga vol 1', null)).toBe('w1');
  });
  it('keeps different volumes apart', () => {
    expect(findCatalogMatch(catalog, 'Saga Vol 2', null)).toBe('w2');
  });
  it('does not guess for a title it has never heard of', () => {
    expect(findCatalogMatch(catalog, 'Nightwatch 01', null)).toBeNull();
    expect(findCatalogMatch(catalog, 'Batman', null)).toBeNull(); // too vague to claim one specific book
  });
  it('the series name can match when the file name is just a number', () => {
    expect(findCatalogMatch(catalog, 'Vol 1', 'Saga')).toBeNull(); // a bare series name is not a specific book either
  });
});
