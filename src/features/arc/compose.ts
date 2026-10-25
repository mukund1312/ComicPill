// Turns an interpreted request into what the reader is TOLD before anything
// is built: what we understood, the journey it maps to, what we did not
// cover, and — separately — any reassurance about friction they mentioned.
// Pure, so the wording rules are testable without rendering anything.
import type { ReadingIntent } from '../../lib/intent/schema';
import type { ResolvedArc } from '../../lib/intent/resolve';

export interface ComposeView {
  kind: ResolvedArc['kind'];
  headline: string;
  /** Chapter titles at the chosen depth, in order. */
  outline: string[];
  /** Beats the reader named that the journey actually covers. */
  focusChips: string[];
  /** Beats the journey does not specifically cover — always shown. */
  notCovered: string[];
  /** Shown instead of prerequisite reading when friction was mild. */
  reassurance: string | null;
  /** True when the reader described real friction worth offering help with. */
  offersCharacterHelp: boolean;
  /** Honest note about how the request was read; null when the model read it. */
  sourceNote: string | null;
  /** Parts of the reading that were guessed, so the reader can correct them. */
  worthChecking: string[];
}

export interface ComposeNotes {
  /** Why the reader's own AI key didn't work, if it was tried. */
  aiError?: string;
  /** Whether any assistant (their key, or a configured endpoint) is set up. */
  hasAssistant?: boolean;
}

export function describeResult(resolved: ResolvedArc, intent: ReadingIntent, source: 'model' | 'offline', notes: ComposeNotes = {}): ComposeView {
  const friction = intent.friction;
  const mild = friction && (friction.severity === 'none' || friction.severity === 'low');
  const work = intent.currentReading?.work;
  const examples = friction?.examples.length ? ` (like ${friction.examples.join(', ')})` : '';

  // A reader who says "it's not really a problem" must never be told to stop
  // and read something first — that is the anxiety this app exists to remove.
  const reassurance = friction?.type === 'unfamiliar_characters' && mild && work
    ? `You’re meeting some new characters${examples} in ${work}. That’s normal for this series — you don’t need extra reading to keep going.`
    : null;

  const base = {
    outline: [] as string[], focusChips: [] as string[], notCovered: [] as string[],
    reassurance,
    offersCharacterHelp: !!friction && friction.type === 'unfamiliar_characters' && !mild,
    sourceNote: source === 'model' ? null
      : notes.aiError ? `${notes.aiError} I matched your words against the journeys I have instead — check the details below.`
        : notes.hasAssistant === false ? 'I matched your words against the journeys I have. Add an AI key in Settings for a smarter reading.'
          : 'I couldn\u2019t reach the assistant, so I matched your words against the journeys I have. Check the details below.',
    worthChecking: intent.confidence.low,
  };

  if (resolved.kind === 'match') {
    return {
      ...base, kind: 'match',
      headline: `Got it. You’re looking for a curated journey: ${resolved.title}.`,
      outline: resolved.chapterOutline,
      focusChips: resolved.matchedFocus.map((m) => m.focus),
      notCovered: resolved.unmatchedFocus,
    };
  }
  if (resolved.kind === 'no_template') {
    return {
      ...base, kind: 'no_template',
      headline: 'I don’t have a journey for that yet.',
    };
  }
  return {
    ...base, kind: 'no_goal',
    headline: intent.currentReading
      ? `Noted — you’re reading ${intent.currentReading.work}. Tell me what you’d like to read next and I’ll build it.`
      : 'Tell me what you’d like to read — a character, a story, or where you want to end up.',
  };
}
