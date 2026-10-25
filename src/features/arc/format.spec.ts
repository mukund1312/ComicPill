import { describe, expect, it } from 'vitest';
import { TIER_LABEL, canReadNow, continuityLabel, itemStatusLine, ownLabel } from './format';
import type { ArcItemState } from '../../lib/engines/arc/types';
import type { Own } from '../../lib/types/domain';

describe('itemStatusLine', () => {
  const cases: [ArcItemState, Own, string][] = [
    ['finished', 'physical', 'Finished'],
    ['reading', 'digital', 'Reading now'],
    ['dropped', 'none', 'Set aside'],
    ['owned_unread', 'physical', 'Physical · Unread'],
    ['owned_unread', 'digital', 'Digital · Unread'],
    ['owned_unread', 'both', 'Physical + digital · Unread'],
    ['not_owned', 'none', 'Not owned'],
    ['not_owned', 'wishlist', 'Wishlist'],
    ['not_owned', 'ordered', 'Ordered'],
  ];
  it.each(cases)('%s / %s -> %s', (state, own, expected) => {
    expect(itemStatusLine({ state, own })).toBe(expected);
  });
});

describe('canReadNow', () => {
  it('is true only when a copy is actually accessible', () => {
    expect(canReadNow({ own: 'physical' })).toBe(true);
    expect(canReadNow({ own: 'subscription' })).toBe(true);
    expect(canReadNow({ own: 'ordered' })).toBe(false); // in transit is not in hand
    expect(canReadNow({ own: 'wishlist' })).toBe(false);
    expect(canReadNow({ own: 'none' })).toBe(false);
  });
});

describe('labels', () => {
  it('hides the continuity tag for the main timeline but labels everything else', () => {
    expect(continuityLabel('main')).toBeNull();
    for (const c of ['flashback', 'retelling', 'soft_reboot', 'alternate', 'elseworld', 'possible_future'] as const) {
      expect(continuityLabel(c)).toBeTruthy();
    }
  });
  it('names every tier and ownership state', () => {
    expect(Object.values(TIER_LABEL).every(Boolean)).toBe(true);
    expect(ownLabel('none')).toBe('Not owned');
  });
});
