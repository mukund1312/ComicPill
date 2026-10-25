// Physical or digital? Transparent rules, in order, first match wins. The AI only explains the result.
import type { Confidence } from './tasteScorer';

export type Outcome = 'buy_physical' | 'digital' | 'borrow' | 'wait_sale';
export const OUTCOME_LABEL: Record<Outcome, string> = { buy_physical: 'Buy physical', digital: 'Digital is fine', borrow: 'Borrow it', wait_sale: 'Wait for a sale' };

export type RunStatus = 'finished' | 'ongoing' | 'unknown';
export type PrintStatus = 'in_print' | 'out_of_print' | 'digital_only' | 'unknown';

export type VerdictInput = {
  score: number;
  confidence: Confidence;
  /** Graphic novel, painted art, oversized pages — the art is a main draw. */
  artDriven: boolean;
  runStatus: RunStatus;
  /** Volumes in the run, 0 if unknown. */
  volumes: number;
  print: PrintStatus;
  priceRising: boolean;
  /** Money left this month; null when no budget is set. */
  budgetRemaining: number | null;
  /** Rough price of one volume — the budget counts as used up when less than this is left. */
  typicalPrice: number;
};

/** The starting numbers. All editable in Settings. */
export type Thresholds = { digitalBelow: number; buyAtLeast: number; borrowFrom: number; shortRunMax: number; longRunMin: number };
export const DEFAULT_THRESHOLDS: Thresholds = { digitalBelow: 60, buyAtLeast: 85, borrowFrom: 70, shortRunMax: 12, longRunMin: 12 };

export type RuleId = 'low_score' | 'digital_only' | 'buy_art_finished' | 'buy_scarce' | 'borrow_art' | 'long_ongoing' | 'budget_used' | 'fallback';

export type Verdict = { outcome: Outcome; rule: RuleId; ruleLabel: string; reason: string };

const RULE_LABEL: Record<RuleId, string> = {
  low_score: 'Score under 60, or low confidence',
  digital_only: 'Only digital exists',
  buy_art_finished: 'Top score, short finished run, art-driven',
  buy_scarce: 'Top score and getting hard to find',
  borrow_art: 'Good score and art-driven',
  long_ongoing: 'Long ongoing series',
  budget_used: 'This month’s budget is used',
  fallback: 'Nothing says it needs shelf space',
};

export function decideVerdict(i: VerdictInput, t: Thresholds = DEFAULT_THRESHOLDS): Verdict {
  const make = (outcome: Outcome, rule: RuleId, reason: string): Verdict => ({ outcome, rule, ruleLabel: RULE_LABEL[rule], reason: `${OUTCOME_LABEL[outcome]}: ${reason}` });
  const run = i.volumes > 0 ? `${i.volumes}-volume` : '';
  const finishedShort = i.runStatus === 'finished' && i.volumes > 0 && i.volumes <= t.shortRunMax;

  if (i.score < t.digitalBelow || i.confidence === 'low') {
    return make('digital', 'low_score', i.confidence === 'low' && i.score >= t.digitalBelow ? `you'd score it ${i.score}, but there aren't enough ratings near it yet to trust that — try it before you buy.` : `you'd score it ${i.score}, so try it before you buy.`);
  }
  if (i.print === 'digital_only') return make('digital', 'digital_only', 'it only exists digitally.');
  if (i.score >= t.buyAtLeast && finishedShort && i.artDriven) {
    return make('buy_physical', 'buy_art_finished', `you'd score it ${i.score}, it's a finished ${run} run, and the art is the main draw.`);
  }
  if (i.score >= t.buyAtLeast && (i.print === 'out_of_print' || i.priceRising)) {
    return make('buy_physical', 'buy_scarce', `you'd score it ${i.score} and it's ${i.print === 'out_of_print' ? 'out of print' : 'rising in price'} — it may get harder to find.`);
  }
  if (i.score >= t.borrowFrom && i.score < t.buyAtLeast && i.artDriven) {
    return make('borrow', 'borrow_art', `you'd score it ${i.score} and the art is a draw — read it first, buy if it still lands.`);
  }
  if (i.runStatus === 'ongoing' && i.volumes >= t.longRunMin) {
    return make('digital', 'long_ongoing', `it's a long ongoing series — read digitally until you finish volume 1, then check again.`);
  }
  if (i.budgetRemaining !== null && i.budgetRemaining < Math.max(1, i.typicalPrice)) {
    return make('wait_sale', 'budget_used', `this month's budget is already used, so wait for a sale.`);
  }
  return make('digital', 'fallback', `you'd score it ${i.score}, but nothing here says it needs shelf space.`);
}

/** The reader said "Not quite": which input was wrong, and what it should be. Kept per series, applied before the rules run. */
export type VerdictOverrides = Partial<Pick<VerdictInput, 'artDriven' | 'runStatus' | 'print' | 'volumes'>>;
export type WrongInput = 'score' | 'art' | 'run' | 'print';
export const WRONG_INPUT_LABEL: Record<WrongInput, string> = { score: 'My score for it', art: 'Whether the art is the main draw', run: 'Whether it is finished or ongoing', print: 'Whether it is in print' };

export const applyOverrides = (input: VerdictInput, o: VerdictOverrides | undefined): VerdictInput => ({ ...input, ...(o ?? {}) });
