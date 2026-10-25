// The words shown when a book belongs to one of the reader's journeys, and
// when it comes to getting a book they don't have. Pure so the rules are
// testable without rendering.
import type { ArcMembership, ReadGuidance } from '../../lib/engines/arc/membership';
import type { FundVerdict } from '../../lib/engines/fund/verdict';

export interface RelevanceView {
  arcId: string;
  arcTitle: string;
  /** One line: where this sits in the journey. */
  line: string;
  isNext: boolean;
  finished: boolean;
}

export function relevanceView(m: ArcMembership, titleOf: (workId: string) => string): RelevanceView {
  let line: string;
  if (m.state === 'finished') line = `You’ve finished this — ${m.chapterTitle}.`;
  else if (m.isNext) line = `Your next step: ${m.milestoneTitle}.`;
  else if (m.previousWorkId) line = `Recommended after ${titleOf(m.previousWorkId)}.`;
  else line = `Part of ${m.chapterTitle}.`;
  return { arcId: m.arcId, arcTitle: m.arcTitle, line, isNext: m.isNext, finished: m.state === 'finished' };
}

export interface GuidanceView {
  label: 'WAIT' | 'BUY' | 'SAVE' | 'SKIP';
  text: string;
}

/** "How should you read this?" for a book the reader doesn't have. The
 *  reading path speaks first (finish what you already own), then the real
 *  buy/save/skip engine — and it never shouts BUY at someone with unread
 *  books ahead of it. */
export function guidanceView(
  guidance: ReadGuidance,
  titleOf: (workId: string) => string,
  verdict: FundVerdict | null,
): GuidanceView | null {
  if (guidance.kind === 'wait') {
    return { label: 'WAIT', text: `You still have ${titleOf(guidance.becauseWorkId)} unread. Finish that first.` };
  }
  if (guidance.kind !== 'consider_buying' || !verdict) return null;
  const detail = verdict.actionDetail ? ` ${verdict.actionDetail}` : '';
  switch (verdict.action) {
    case 'buy': return { label: 'BUY', text: `${verdict.why}${detail}` };
    case 'save': return { label: 'SAVE', text: `${verdict.why}${detail}` };
    case 'wait': return { label: 'WAIT', text: `${verdict.why}${detail}` };
    case 'skip': return { label: 'SKIP', text: verdict.why };
    case 'owned': return null;
  }
}
