// Pure helpers for API keys pasted by hand. (Storage is in keyStore.ts.)
import type { Provider } from './types';

/** Pasted keys arrive with trailing newlines, spaces, or wrapping quotes. */
export function normalizeKeyInput(raw: string): string {
  return raw.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\s+/g, '');
}

/** Shown in the UI instead of the key itself. */
export function maskKey(key: string): string {
  return key.length <= 8 ? '••••' : `••••${key.slice(-4)}`;
}

export type KeyShape = 'ok' | 'wrong_provider' | 'too_short' | 'empty';

/** A gentle sanity check — not validation (only the provider can do that).
 *  It exists to catch pasting an OpenAI key into the Claude box and vice versa. */
export function checkKeyShape(provider: Provider, key: string): KeyShape {
  if (!key) return 'empty';
  if (key.length < 20) return 'too_short';
  const isAnthropic = key.startsWith('sk-ant-');
  if (provider === 'anthropic') return isAnthropic ? 'ok' : 'wrong_provider';
  return key.startsWith('sk-') && !isAnthropic ? 'ok' : 'wrong_provider';
}

export const SHAPE_MESSAGE: Record<Exclude<KeyShape, 'ok'>, (p: Provider) => string> = {
  empty: () => 'Paste your API key first.',
  too_short: () => 'That looks too short to be an API key.',
  wrong_provider: (p) => p === 'anthropic'
    ? 'Claude keys start with "sk-ant-". This looks like a different provider’s key.'
    : 'OpenAI keys start with "sk-". This looks like a different provider’s key.',
};
