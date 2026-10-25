// Model output is untrusted input. Structured outputs make the shape very
// likely, not guaranteed, and the offline path and the network both hand
// back JSON we did not write — so everything is re-validated and bounded here.
import { ReadingIntentSchema, type ReadingIntent } from './schema';

const MAX_STR = 200;
const MAX_LIST = 20;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_STR);
const cleanList = (xs: string[]) => xs.map(clean).filter(Boolean).slice(0, MAX_LIST);

/** Returns a normalized intent, or null if `raw` is not a valid ReadingIntent. */
export function parseReadingIntent(raw: unknown): ReadingIntent | null {
  const parsed = ReadingIntentSchema.safeParse(raw);
  if (!parsed.success) return null;
  const i = parsed.data;
  return {
    ...i,
    currentReading: i.currentReading && { ...i.currentReading, work: clean(i.currentReading.work) },
    friction: i.friction && { ...i.friction, examples: cleanList(i.friction.examples) },
    newGoal: i.newGoal && {
      ...i.newGoal,
      character: i.newGoal.character ? clean(i.newGoal.character) : null,
      focus: cleanList(i.newGoal.focus),
      titleReferences: i.newGoal.titleReferences.slice(0, MAX_LIST).map((t) => ({ ...t, text: clean(t.text) })),
    },
    implicitFeedback: i.implicitFeedback.slice(0, MAX_LIST).map((f) => ({ ...f, work: clean(f.work) })),
    proposedLibraryUpdates: i.proposedLibraryUpdates.slice(0, MAX_LIST).map((u) => ({ ...u, work: clean(u.work) })),
    confidence: { high: cleanList(i.confidence.high), medium: cleanList(i.confidence.medium), low: cleanList(i.confidence.low) },
    clarifyingQuestion: i.clarifyingQuestion ? clean(i.clarifyingQuestion) : null,
  };
}

/** Parse a JSON string (as returned in a model text block). */
export function parseReadingIntentJson(text: string): ReadingIntent | null {
  try { return parseReadingIntent(JSON.parse(text)); } catch { return null; }
}
