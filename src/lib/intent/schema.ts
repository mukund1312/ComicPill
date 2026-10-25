// The internal representation of what a reader said. The reader never fills
// this in — a model (or the offline fallback) extracts it from free text.
//
// One message carries SEVERAL different signals (what they're reading, how
// it's going, what's confusing, what they want next). Keeping them as
// separate fields — instead of one search string — is what lets the app
// answer the new goal without nagging about the friction, and treat "going
// good" as a weak signal rather than a 5-star rating.
//
// Kept to the plain JSON-schema subset structured outputs accept: no
// min/max/pattern, every object closed. Length/size limits are enforced in
// validate.ts, after parsing, because the model's output is untrusted.
import { z } from 'zod';

export const JOURNEY_KINDS = [
  'character_life_arc', 'story_arc', 'family_arc', 'creator_run', 'event_path', 'universe_path',
  'origin_path', 'relationship_arc', 'villain_arc', 'transformation_arc', 'legacy_arc', 'custom_goal',
] as const;

const Sentiment = z.enum(['positive', 'neutral', 'negative']);
const Level = z.enum(['high', 'medium', 'low']);

export const ReadingIntentSchema = z.object({
  /** What they're reading right now, if they said. */
  currentReading: z.object({
    work: z.string(),
    sentiment: Sentiment.nullable(),
    /** false only if they said they're stopping or dropping it. */
    continueReading: z.boolean(),
  }).nullable(),

  /** Something getting in the way of enjoyment. `severity` follows the
   *  reader's own words: "it's not really a problem" is low, not high. */
  friction: z.object({
    type: z.enum(['unfamiliar_characters', 'confusing_continuity', 'pacing', 'other']),
    severity: z.enum(['none', 'low', 'medium', 'high']),
    examples: z.array(z.string()),
  }).nullable(),

  /** What they want to read next. Null when the message has no new goal. */
  newGoal: z.object({
    /** The character the journey is centred on, e.g. "Batman". */
    character: z.string().nullable(),
    journeyKinds: z.array(z.enum(JOURNEY_KINDS)),
    /** The beats they named, in the order they named them. */
    focus: z.array(z.string()),
    /** A phrase that could be a book title OR a request ("Batman and sons").
     *  Read the rest of the message to decide which; never match on keywords alone. */
    titleReferences: z.array(z.object({
      text: z.string(),
      interpretation: z.enum(['title', 'intent', 'both']),
    })),
  }).nullable(),

  /** How much to read. Null means "they didn't say" — the app defaults to Recommended. */
  depth: z.enum(['essential', 'recommended', 'completionist']).nullable(),
  spoilerPreference: z.enum(['minimal', 'full']),
  ownershipAware: z.boolean(),

  /** Weak conversational feedback. Explicit ratings always outrank these. */
  implicitFeedback: z.array(z.object({
    work: z.string(),
    sentiment: Sentiment,
    confidence: Level,
  })),

  /** State changes the message implies. These are PROPOSALS the reader must
   *  confirm, never silent writes. */
  proposedLibraryUpdates: z.array(z.object({
    work: z.string(),
    action: z.enum(['mark_finished', 'mark_reading']),
  })),

  /** Which parts of the reading are solid vs. guessed. A low-confidence
   *  reading never blocks building the obvious part of the journey. */
  confidence: z.object({
    high: z.array(z.string()),
    medium: z.array(z.string()),
    low: z.array(z.string()),
  }),

  /** Only when the answer would materially change what gets built. Almost always null. */
  clarifyingQuestion: z.string().nullable(),
});

export type ReadingIntent = z.infer<typeof ReadingIntentSchema>;

/** The JSON Schema sent as the structured-output contract. */
export function readingIntentJsonSchema(): Record<string, unknown> {
  // The `$schema` draft URL is metadata the API has no use for; drop it.
  const { $schema: _draft, ...schema } = z.toJSONSchema(ReadingIntentSchema) as Record<string, unknown>;
  return schema;
}
