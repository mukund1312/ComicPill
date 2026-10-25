import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from './client';
import type { AiConfig } from './types';
import { interpretReadingIntent } from '../intent/client';
import { clearIntentCache } from '../intent/aiIntent';
import { interpretOffline } from '../intent/offline';
import { readingIntentJsonSchema } from '../intent/schema';

const MESSAGE = "I am reading World's Finest, it's going good, but lots of characters I don't know like Doom Patrol. I want Batman from his origin through Robin, Nightwing and Red Hood.";
const intentJson = JSON.stringify(interpretOffline(MESSAGE));
const claude: AiConfig = { provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-ant-abcdefghijklmnopqrstuvwxyz' };
const gpt: AiConfig = { provider: 'openai', model: 'gpt-6.1-sol', apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz' };

const claudeReply = (text: string): FetchLike => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) }));
const status = (code: number): FetchLike => vi.fn(async () => ({ ok: false, status: code, json: async () => ({}) }));
const calls = (f: FetchLike) => (f as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

beforeEach(() => clearIntentCache());

describe('interpretReadingIntent with the reader’s own key', () => {
  it('uses the model and returns its understanding', async () => {
    const f = claudeReply(intentJson);
    const r = await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch: f });
    expect(r.source).toBe('model');
    expect(r.intent.newGoal?.character).toBe('Batman');
    expect(calls(f)).toBe(1);
  });

  it('does not pay twice for the same request', async () => {
    const f = claudeReply(intentJson);
    await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch: f });
    await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch: f });
    expect(calls(f)).toBe(1);
    await interpretReadingIntent(MESSAGE + ' please', { ai: claude, aiFetch: f });
    expect(calls(f)).toBe(2); // different words, different question
  });

  it('a different model or provider is a different question', async () => {
    const f = claudeReply(intentJson);
    await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch: f });
    await interpretReadingIntent(MESSAGE, { ai: { ...claude, model: 'claude-haiku-4-5' }, aiFetch: f });
    expect(calls(f)).toBe(2);
  });

  it('falls back to the offline reader and says why when the key is rejected', async () => {
    const r = await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch: status(401) });
    expect(r.source).toBe('offline');
    expect(r.aiError).toMatch(/rejected your API key/);
    expect(r.intent.newGoal?.character).toBe('Batman'); // still useful
  });

  it.each([[429, /rate limit|credit/], [500, /provider/], [404, /isn.t available/]])('HTTP %i falls back with a matching message', async (code, msg) => {
    const r = await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch: status(code) });
    expect(r.source).toBe('offline');
    expect(r.aiError).toMatch(msg);
  });

  it('falls back when the model returns something unusable', async () => {
    const r = await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch: claudeReply('{"hello":"world"}') });
    expect(r.source).toBe('offline');
    expect(r.aiError).toMatch(/expected format/);
  });

  it('never caches a failure', async () => {
    const bad = status(500);
    await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch: bad });
    const good = claudeReply(intentJson);
    expect((await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch: good })).source).toBe('model');
  });

  it('with no key it makes no AI call at all', async () => {
    const f = claudeReply(intentJson);
    const r = await interpretReadingIntent(MESSAGE, { ai: null, aiFetch: f });
    expect(r.source).toBe('offline');
    expect(r.aiError).toBeUndefined();
    expect(calls(f)).toBe(0);
  });

  it('the reader’s key wins over a configured endpoint', async () => {
    const aiFetch = claudeReply(intentJson);
    const endpointFetch = vi.fn() as unknown as typeof fetch;
    const r = await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch, endpoint: 'https://x.test/i', fetchImpl: endpointFetch });
    expect(r.source).toBe('model');
    expect(endpointFetch).not.toHaveBeenCalled();
  });

  it('if the key fails, a configured endpoint is still tried before giving up', async () => {
    const endpointFetch = vi.fn(async () => new Response(JSON.stringify({ intent: JSON.parse(intentJson) }), { status: 200 })) as unknown as typeof fetch;
    const r = await interpretReadingIntent(MESSAGE, { ai: claude, aiFetch: status(401), endpoint: 'https://x.test/i', fetchImpl: endpointFetch });
    expect(r.source).toBe('model');
  });

  it('works through OpenAI too', async () => {
    const f: FetchLike = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: intentJson }] }] }) }));
    const r = await interpretReadingIntent(MESSAGE, { ai: gpt, aiFetch: f });
    expect(r.source).toBe('model');
    expect(r.intent.friction?.examples).toEqual(['Doom Patrol']);
  });
});

describe('the intent schema is valid for OpenAI strict mode', () => {
  // strict:true requires every object to be closed and to list ALL of its properties as required.
  const violations: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      if (o.type === 'object') {
        const props = Object.keys((o.properties as object) ?? {});
        const required = (o.required as string[] | undefined) ?? [];
        if (o.additionalProperties !== false) violations.push(`${path}: not closed`);
        const missing = props.filter((p) => !required.includes(p));
        if (missing.length) violations.push(`${path}: optional ${missing.join(',')}`);
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    }
  };
  walk(readingIntentJsonSchema(), '$');
  it('has no open objects and no optional properties', () => {
    expect(violations).toEqual([]);
  });
});
