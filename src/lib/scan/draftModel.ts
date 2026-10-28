// How long an unfinished shelf scan lives. A scan is kept only so the reader can come back to it; the shelf photo is removed as soon as they
// are done, unless they choose to keep it for a week.
export const DRAFT_DAYS = 7;
const DAY = 86_400_000;

export type DraftStatus = 'draft' | 'kept';

/** When a draft (or a kept scan) must be gone by, however it is used. */
export const expiryFor = (now: number): number => now + DRAFT_DAYS * DAY;
export const isExpired = (expiresAt: number, now: number): boolean => expiresAt <= now;

/** What happens to the shelf photo when the reader taps OK after importing: gone at once, unless they asked to keep it. */
export const afterImport = (keepForAWeek: boolean): 'delete' | 'keep' => (keepForAWeek ? 'keep' : 'delete');
