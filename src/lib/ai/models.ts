// The models a reader can pick. IDs are copied from each provider's own
// documentation (Anthropic model table; OpenAI "Models" page) — never guessed.
// The user pays for their own key, so cost is THEIR choice: cheapest is listed.
import type { Provider } from './types';

export interface ModelChoice { id: string; label: string; detail: string }

export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: 'Claude (Anthropic)', openai: 'OpenAI' };

export const MODEL_CHOICES: Record<Provider, ModelChoice[]> = {
  anthropic: [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', detail: 'Most capable. The default.' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', detail: 'Faster and cheaper, still strong.' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', detail: 'Cheapest. Fine for simple requests.' },
  ],
  openai: [
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', detail: 'Near-flagship quality at a lower cost. The default.' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra', detail: 'Most capable.' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna', detail: 'Most efficient and cheapest.' },
  ],
};

export const DEFAULT_MODEL: Record<Provider, string> = { anthropic: 'claude-opus-5-5', openai: 'gpt-6.1-sol' };

export const isKnownModel = (provider: Provider, model: string) => MODEL_CHOICES[provider].some((m) => m.id === model);

export function modelLabel(provider: Provider, model: string): string {
  return MODEL_CHOICES[provider].find((m) => m.id === model)?.label ?? model;
}

/** What each Claude model accepts. Sending an option the model rejects is a
 *  400, so it is gated here rather than sent blindly:
 *   - `effort` works on Opus 5.5 / Sonnet 5.5, but ERRORS on Haiku 4.5;
 *   - server-side `fallbacks` is Opus/Sonnet 5.x only. */
export function anthropicCaps(model: string): { effort: boolean; fallbacks: boolean; maxTokens: number } {
  const modern = model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5';
  return { effort: modern, fallbacks: modern, maxTokens: modern ? 8000 : 3000 };
}
