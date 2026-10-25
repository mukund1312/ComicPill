import type { ArcItem, ArcTier, Continuity } from '../../lib/engines/arc/types';
import type { Own } from '../../lib/types/domain';
import { isAccessible } from '../../lib/util/own';

export const TIER_LABEL: Record<ArcTier, string> = {
  essential: 'Essential', recommended: 'Recommended', optional: 'Optional', deep_cut: 'Deep cut',
};

const OWN_LABEL: Record<Own, string> = {
  physical: 'Physical', digital: 'Digital', both: 'Physical + digital', subscription: 'Subscription',
  ordered: 'Ordered', wishlist: 'Wishlist', none: 'Not owned',
};
export const ownLabel = (own: Own) => OWN_LABEL[own];

/** One short line: where this book stands for THIS reader. */
export function itemStatusLine(item: Pick<ArcItem, 'state' | 'own'>): string {
  switch (item.state) {
    case 'finished': return 'Finished';
    case 'reading': return 'Reading now';
    case 'dropped': return 'Set aside';
    case 'owned_unread': return `${ownLabel(item.own)} · Unread`;
    case 'not_owned': return ownLabel(item.own);
  }
}

export const canReadNow = (item: Pick<ArcItem, 'own'>) => isAccessible(item.own);

const CONTINUITY_LABEL: Record<Continuity, string | null> = {
  main: null,
  flashback: 'Early-career story',
  retelling: 'Retelling of the origin',
  soft_reboot: 'Soft reboot',
  alternate: 'Alternate universe',
  elseworld: 'Elseworld',
  possible_future: 'Possible future',
};
export const continuityLabel = (c: Continuity) => CONTINUITY_LABEL[c];
