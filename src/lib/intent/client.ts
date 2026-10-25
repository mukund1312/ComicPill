// App-side entry: text in, ReadingIntent out. Tries the model endpoint when
// one is configured and falls back to the offline interpreter on ANY failure,
// so "Build me an arc" never dead-ends on a network or server problem. The
// result says which path produced it so the UI can be honest about it.
import { ARC_TEMPLATES } from '../engines/arc/templates';
import { interpretOffline } from './offline';
import { parseReadingIntent } from './validate';
import { interpretWithKey } from './aiIntent';
import type { AiConfig } from '../ai/types';
import type { FetchLike } from '../ai/client';
import type { ReadingIntent } from './schema';

export interface InterpretOptions {
  /** The reader's own AI key + model. Takes priority over `endpoint`. */
  ai?: AiConfig | null;
  aiFetch?: FetchLike;
  /** Full URL of the deployed endpoint. Unset means offline-only. */
  endpoint?: string;
  /** Sent as `Authorization: Bearer …` when set. */
  token?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface InterpretResult {
  intent: ReadingIntent;
  /** 'model' = understood by the model; 'offline' = word-matched fallback. */
  source: 'model' | 'offline';
  /** Set when the reader's key was tried and failed, so the UI can say why. */
  aiError?: string;
}

export async function interpretReadingIntent(text: string, opts: InterpretOptions = {}): Promise<InterpretResult> {
  const offline = (aiError?: string): InterpretResult => ({ intent: interpretOffline(text, Object.values(ARC_TEMPLATES)), source: 'offline', ...(aiError ? { aiError } : {}) });

  // 1. The reader's own key, if they added one.
  let aiError: string | undefined;
  if (opts.ai) {
    const res = await interpretWithKey(text, opts.ai, { fetchImpl: opts.aiFetch });
    if (res.ok) return { intent: res.data, source: 'model' };
    aiError = res.message;
  }
  // 2. A deployed endpoint, if the app was built with one.
  if (!opts.endpoint) return offline(aiError);

  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  try {
    const res = await doFetch(opts.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) return offline(aiError);
    const body: unknown = await res.json();
    const intent = parseReadingIntent(typeof body === 'object' && body !== null ? (body as { intent?: unknown }).intent : null);
    return intent ? { intent, source: 'model' } : offline(aiError);
  } catch {
    return offline(aiError);
  } finally {
    clearTimeout(timer);
  }
}

/** Config read from the Expo public env at build time. The URL is public by
 *  nature; there is deliberately no API key here. */
export function intentOptionsFromEnv(): InterpretOptions {
  return {
    endpoint: process.env.EXPO_PUBLIC_INTENT_URL || undefined,
    token: process.env.EXPO_PUBLIC_INTENT_TOKEN || undefined,
  };
}
