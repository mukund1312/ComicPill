// How much space the reader lets downloaded (ready) cloud comics take, and what to do when a new one doesn't fit.
import { getMeta, setMeta } from '../db/queries/meta';

const GB = 1024 ** 3;
export type BudgetMode = 'ask' | 'auto';

export const BUDGET_CHOICES_GB = [2, 5, 10, 20, 50] as const;
const DEFAULT_GB = 10;
/** Free space always left for the system; a download that would eat into it is refused. */
export const LOW_SPACE_RESERVE = 3 * GB;

export const cloudBudgetGb = (): number => { const v = Number(getMeta('cloud_budget_gb')); return Number.isFinite(v) && v > 0 ? v : DEFAULT_GB; };
export const cloudBudgetBytes = (): number => cloudBudgetGb() * GB;
export const setCloudBudgetGb = (gb: number): void => { setMeta('cloud_budget_gb', String(gb)); };

/** Like an e-reader: only so many cloud comics are downloaded and readable at once. Opening another means putting one away first. */
export const KEEP_CHOICES = [10, 15, 20, 30] as const;
export const keepLimit = (): number => { const v = Number(getMeta('cloud_keep_limit')); return Number.isFinite(v) && v > 0 ? v : 15; };
export const setKeepLimit = (n: number): void => { setMeta('cloud_keep_limit', String(n)); };

/** `ask`: the reader chooses what to put away when space runs out. `auto`: the least recently read comics go on their own. */
export const budgetMode = (): BudgetMode => (getMeta('cloud_budget_mode') === 'auto' ? 'auto' : 'ask');
export const setBudgetMode = (mode: BudgetMode): void => { setMeta('cloud_budget_mode', mode); };
