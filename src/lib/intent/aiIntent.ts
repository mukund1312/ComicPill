// Understand a reader's request with THEIR OWN AI key, straight from the phone.
// Used only when they tap "Build my journey", and only if they saved a key.
import { runStructured, type RunOptions } from '../ai/client';
import type { AiConfig, AiResult } from '../ai/types';
import { ARC_TEMPLATES } from '../engines/arc/templates';
import { INTENT_SYSTEM_PROMPT, buildIntentUserMessage } from './prompt';
import { readingIntentJsonSchema, type ReadingIntent } from './schema';
import { parseReadingIntent } from './validate';

// The same words always mean the same thing: don't pay to ask twice.
const cache = new Map<string, ReadingIntent>();
export const clearIntentCache = () => cache.clear();

export async function interpretWithKey(text: string, cfg: AiConfig, opts: RunOptions = {}): Promise<AiResult<ReadingIntent>> {
  const cacheKey = `${cfg.provider}|${cfg.model}|${text}`;
  const hit = cache.get(cacheKey);
  if (hit) return { ok: true, data: hit };

  const journeys = Object.values(ARC_TEMPLATES).map((t) => ({ key: t.key, title: t.title, character: t.character }));
  const res = await runStructured(
    cfg,
    { system: INTENT_SYSTEM_PROMPT, text: buildIntentUserMessage(text, journeys), schema: readingIntentJsonSchema(), schemaName: 'reading_intent', maxTokens: 4000 },
    parseReadingIntent,
    opts,
  );
  if (res.ok) cache.set(cacheKey, res.data);
  return res;
}
