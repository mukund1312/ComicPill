// "How many books do I need to buy to finish this?" — job #19. A cheap-
// looking Vol. 1 can be the wrong signal on its own: ₹700 × 8 remaining
// volumes changes the decision completely. Separate from labelFor/buyScore,
// which price ONE edition — this projects the total remaining cost of a run.
import type { SeriesStatus } from '../../types/domain';

export interface SeriesVolume {
  workId: string;
  ownedOrRead: boolean;
  typicalPricePaise: number | null;
}

export interface SeriesCommitment {
  status: SeriesStatus;
  volumesRemaining: number; // unread/unowned volumes, among those known
  estimatedRemainingCostPaise: number | null; // null if any remaining volume has no price on file
  isOpenEnded: boolean; // true for an ongoing series with no announced end — "unknown total" must be shown as such, never guessed
}

/** `releasedVolumeCount`/`plannedVolumeCount` distinguish "9 released" from
 *  "9 total" — an ongoing series never gets a fabricated total. */
export function estimateSeriesCommitment(
  volumes: SeriesVolume[],
  status: SeriesStatus,
  plannedVolumeCount: number | null,
): SeriesCommitment {
  const remaining = volumes.filter((v) => !v.ownedOrRead);
  const prices = remaining.map((v) => v.typicalPricePaise);
  const hasAllPrices = prices.every((p): p is number => p !== null);

  return {
    status,
    volumesRemaining: remaining.length,
    estimatedRemainingCostPaise: hasAllPrices ? prices.reduce((sum, p) => sum + p, 0) : null,
    isOpenEnded: status === 'ongoing' && plannedVolumeCount == null,
  };
}
