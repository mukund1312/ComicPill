import { describe, expect, it, vi } from 'vitest';
import { checkKey, runStructured, type FetchLike } from './client';
import { checkKeyShape, maskKey, normalizeKeyInput, SHAPE_MESSAGE } from './keys';
import { anthropicCaps, DEFAULT_MODEL, isKnownModel, MODEL_CHOICES, modelLabel } from './models';
import {
  buildAnthropicCall, buildCall, buildModelsCall, buildOpenAiCall, errorFromStatus, modelIdsFrom,
  parseAnthropicReply, parseOpenAiReply,
} from './requests';
import type { AiConfig, StructuredRequest } from './types';

const SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
const req = (over: Partial<StructuredRequest> = {}): StructuredRequest => ({ system: 'SYS', text: 'hello', schema: SCHEMA, schemaName: 'thing', ...over });
const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-ant-abcdefghijklmnopqrstuvwxyz', ...over });

describe('models', () => {
  it('every default is one of the listed choices', () => {
    for (const p of ['anthropic', 'openai'] as const) expect(isKnownModel(p, DEFAULT_MODEL[p])).toBe(true);
  });
  it('has no duplicate ids and labels every model', () => {
    for (const p of ['anthropic', 'openai'] as const) {
      const ids = MODEL_CHOICES[p].map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(modelLabel(p, ids[0])).not.toBe(ids[0]);
    }
    expect(modelLabel('openai', 'mystery')).toBe('mystery');
  });
  it('only sends options a Claude model accepts (Haiku 4.5 rejects effort)', () => {
    expect(anthropicCaps('claude-opus-5-5')).toMatchObject({ effort: true, fallbacks: true });
    expect(anthropicCaps('claude-sonnet-5-5')).toMatchObject({ effort: true, fallbacks: true });
    expect(anthropicCaps('claude-haiku-4-5')).toMatchObject({ effort: false, fallbacks: false });
  });
});

describe('Anthropic request', () => {
  const call = buildAnthropicCall(cfg(), req());
  const body = JSON.parse(call.init.body!);
  it('targets the Messages API with the key and version headers', () => {
    expect(call.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call.init.headers['x-api-key']).toBe(cfg().apiKey);
    expect(call.init.headers['anthropic-version']).toBe('2023-06-01');
  });
  it('asks for structured output at low effort with the server-side fallback', () => {
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema: SCHEMA }, effort: 'low' });
    expect(body.fallbacks).toBe('default');
    expect(call.init.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    expect(body.system).toBe('SYS');
  });
  it('never sends parameters the newest models reject', () => {
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).not.toHaveProperty('thinking');
  });
  it('puts photos before the text, as base64 JPEG image blocks', () => {
    const b = JSON.parse(buildAnthropicCall(cfg(), req({ imagesBase64: ['AAA', 'BBB'] })).init.body!);
    expect(b.messages[0].content.map((c: { type: string }) => c.type)).toEqual(['image', 'image', 'text']);
    expect(b.messages[0].content[0].source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'AAA' });
  });
  it('omits effort and fallbacks entirely for Haiku 4.5', () => {
    const c = buildAnthropicCall(cfg({ model: 'claude-haiku-4-5' }), req());
    const b = JSON.parse(c.init.body!);
    expect(b.output_config).toEqual({ format: { type: 'json_schema', schema: SCHEMA } });
    expect(b).not.toHaveProperty('fallbacks');
    expect(c.init.headers).not.toHaveProperty('anthropic-beta');
  });
  it('caps max_tokens to what the model is set up for', () => {
    expect(JSON.parse(buildAnthropicCall(cfg({ model: 'claude-haiku-4-5' }), req({ maxTokens: 99999 })).init.body!).max_tokens).toBe(3000);
    expect(JSON.parse(buildAnthropicCall(cfg(), req({ maxTokens: 1000 })).init.body!).max_tokens).toBe(1000);
  });
});

describe('OpenAI request', () => {
  const c = cfg({ provider: 'openai', model: 'gpt-6.1-sol', apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz' });
  const call = buildOpenAiCall(c, req({ imagesBase64: ['XYZ'] }));
  const body = JSON.parse(call.init.body!);
  it('uses the Responses API with a bearer token', () => {
    expect(call.url).toBe('https://api.openai.com/v1/responses');
    expect(call.init.headers.authorization).toBe(`Bearer ${c.apiKey}`);
    expect(body.instructions).toBe('SYS');
  });
  it('sends text and photos as input parts (photos as data URLs)', () => {
    expect(body.input[0].content[0]).toEqual({ type: 'input_text', text: 'hello' });
    expect(body.input[0].content[1]).toMatchObject({ type: 'input_image', image_url: 'data:image/jpeg;base64,XYZ' });
  });
  it('requests strict structured output', () => {
    expect(body.text.format).toEqual({ type: 'json_schema', name: 'thing', strict: true, schema: SCHEMA });
  });
  it('asks the provider NOT to store the reader’s photos or text', () => {
    expect(body.store).toBe(false);
  });
  it('dispatches by provider', () => {
    expect(buildCall(cfg(), req()).url).toContain('anthropic.com');
    expect(buildCall(c, req()).url).toContain('openai.com');
  });
});

describe('replies', () => {
  it('Anthropic: reads the text block', () => {
    expect(parseAnthropicReply({ stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: '{"ok":true}' }] })).toEqual({ ok: true, text: '{"ok":true}' });
  });
  it.each([
    ['refusal', { stop_reason: 'refusal', content: [] }, 'refused'],
    ['truncation', { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"o' }] }, 'truncated'],
    ['no text', { stop_reason: 'end_turn', content: [] }, 'invalid_output'],
    ['garbage', 'nope', 'invalid_output'],
  ])('Anthropic: %s', (_n, json, kind) => {
    expect(parseAnthropicReply(json)).toMatchObject({ ok: false, kind });
  });

  it('OpenAI: reads output_text from a message item', () => {
    const json = { status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"ok":true}' }] }] };
    expect(parseOpenAiReply(json)).toEqual({ ok: true, text: '{"ok":true}' });
  });
  it('OpenAI: tolerates the message parts being nested under `message`', () => {
    const json = { output: [{ type: 'message', message: { content: [{ type: 'output_text', text: '{"ok":true}' }] } }] };
    expect(parseOpenAiReply(json)).toEqual({ ok: true, text: '{"ok":true}' });
  });
  it.each([
    ['refusal part', { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }, 'refused'],
    ['incomplete: length', { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, 'truncated'],
    ['incomplete: filter', { status: 'incomplete', incomplete_details: { reason: 'content_filter' } }, 'refused'],
    ['failed', { status: 'failed' }, 'server'],
    ['empty', { output: [] }, 'invalid_output'],
  ])('OpenAI: %s', (_n, json, kind) => {
    expect(parseOpenAiReply(json)).toMatchObject({ ok: false, kind });
  });

  it('maps HTTP statuses to plain-language errors', () => {
    expect(errorFromStatus(200)).toBeNull();
    expect(errorFromStatus(401)?.kind).toBe('unauthorized');
    expect(errorFromStatus(403)?.kind).toBe('unauthorized');
    expect(errorFromStatus(404)?.kind).toBe('model_not_found');
    expect(errorFromStatus(429)?.kind).toBe('rate_limited');
    expect(errorFromStatus(500)?.kind).toBe('server');
    expect(errorFromStatus(529)?.kind).toBe('server');
    expect(errorFromStatus(400)?.kind).toBe('server');
  });
  it('lists model ids from either provider’s models endpoint', () => {
    expect(modelIdsFrom({ data: [{ id: 'a' }, { id: 'b' }, { nope: 1 }] })).toEqual(['a', 'b']);
    expect(modelIdsFrom(null)).toEqual([]);
  });
  it('builds the models call per provider', () => {
    expect(buildModelsCall({ provider: 'anthropic', apiKey: 'k' }).init.headers['x-api-key']).toBe('k');
    expect(buildModelsCall({ provider: 'openai', apiKey: 'k' }).init.headers.authorization).toBe('Bearer k');
  });
});

const respond = (status: number, json: unknown): FetchLike => vi.fn(async () => ({ ok: status < 300, status, json: async () => json }));
const validateOk = (raw: unknown) => (typeof raw === 'object' && raw !== null && (raw as { ok?: unknown }).ok === true ? (raw as { ok: true }) : null);
const anthropicOk = (text: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });

describe('runStructured', () => {
  it('refuses to run without a key, and never touches the network', async () => {
    const f = respond(200, {});
    expect(await runStructured(null, req(), validateOk, { fetchImpl: f })).toMatchObject({ ok: false, kind: 'no_key' });
    expect(await runStructured(cfg({ apiKey: '' }), req(), validateOk, { fetchImpl: f })).toMatchObject({ ok: false, kind: 'no_key' });
    expect(f).not.toHaveBeenCalled();
  });
  it('returns validated data on success', async () => {
    expect(await runStructured(cfg(), req(), validateOk, { fetchImpl: respond(200, anthropicOk('{"ok":true}')) })).toEqual({ ok: true, data: { ok: true } });
  });
  it('rejects model output that does not validate, and non-JSON', async () => {
    expect(await runStructured(cfg(), req(), validateOk, { fetchImpl: respond(200, anthropicOk('{"ok":false}')) })).toMatchObject({ ok: false, kind: 'invalid_output' });
    expect(await runStructured(cfg(), req(), validateOk, { fetchImpl: respond(200, anthropicOk('not json')) })).toMatchObject({ ok: false, kind: 'invalid_output' });
  });
  it.each([[401, 'unauthorized'], [404, 'model_not_found'], [429, 'rate_limited'], [500, 'server']])('maps HTTP %i to %s', async (status, kind) => {
    expect(await runStructured(cfg(), req(), validateOk, { fetchImpl: respond(status, { error: {} }) })).toMatchObject({ ok: false, kind });
  });
  it('survives an error body that is not JSON', async () => {
    const f: FetchLike = async () => ({ ok: false, status: 500, json: async () => { throw new Error('html'); } });
    expect(await runStructured(cfg(), req(), validateOk, { fetchImpl: f })).toMatchObject({ ok: false, kind: 'server' });
  });
  it('reports a network failure without throwing', async () => {
    const f: FetchLike = async () => { throw new Error('offline'); };
    expect(await runStructured(cfg(), req(), validateOk, { fetchImpl: f })).toMatchObject({ ok: false, kind: 'network' });
  });
  it('gives up on a hung request after the timeout', async () => {
    const hang: FetchLike = (_u, init) => new Promise((_res, rej) => { init.signal?.addEventListener('abort', () => rej(new Error('aborted'))); });
    expect(await runStructured(cfg(), req(), validateOk, { fetchImpl: hang, timeoutMs: 20 })).toMatchObject({ ok: false, kind: 'network' });
  });
  it('sends the key only to the chosen provider', async () => {
    const f = respond(200, { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }] });
    await runStructured(cfg({ provider: 'openai', model: 'gpt-6.1-sol', apiKey: 'sk-openai-1234567890123456' }), req(), validateOk, { fetchImpl: f });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(JSON.stringify(init)).not.toContain('anthropic');
  });
});

describe('checkKey', () => {
  it('accepts a working key and reports whether the chosen model is available', async () => {
    expect(await checkKey(cfg(), { fetchImpl: respond(200, { data: [{ id: 'claude-opus-5-5' }] }) })).toEqual({ ok: true, data: { modelAvailable: true } });
    expect(await checkKey(cfg(), { fetchImpl: respond(200, { data: [{ id: 'other' }] }) })).toEqual({ ok: true, data: { modelAvailable: false } });
    expect(await checkKey(cfg(), { fetchImpl: respond(200, { data: [] }) })).toEqual({ ok: true, data: { modelAvailable: null } });
  });
  it('rejects a bad key and an empty one', async () => {
    expect(await checkKey(cfg(), { fetchImpl: respond(401, {}) })).toMatchObject({ ok: false, kind: 'unauthorized' });
    expect(await checkKey(cfg({ apiKey: '' }))).toMatchObject({ ok: false, kind: 'no_key' });
  });
});

describe('key handling', () => {
  it('cleans up what people paste', () => {
    expect(normalizeKeyInput('  "sk-ant-abc123"\n')).toBe('sk-ant-abc123');
    expect(normalizeKeyInput('sk-abc\n def')).toBe('sk-abcdef');
    expect(normalizeKeyInput("'sk-x'")).toBe('sk-x');
  });
  it('never shows more than the last four characters', () => {
    expect(maskKey('sk-ant-abcdefghijklmn1234')).toBe('••••1234');
    expect(maskKey('short')).toBe('••••');
    expect(maskKey('sk-ant-abcdefghijklmn1234')).not.toContain('abcdef');
  });
  it('catches the wrong provider’s key, without blocking a legitimate one', () => {
    const anth = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
    const oai = 'sk-proj-abcdefghijklmnopqrstuvwxyz';
    expect(checkKeyShape('anthropic', anth)).toBe('ok');
    expect(checkKeyShape('anthropic', oai)).toBe('wrong_provider');
    expect(checkKeyShape('openai', oai)).toBe('ok');
    expect(checkKeyShape('openai', anth)).toBe('wrong_provider');
    expect(checkKeyShape('openai', '')).toBe('empty');
    expect(checkKeyShape('openai', 'sk-1')).toBe('too_short');
    expect(SHAPE_MESSAGE.wrong_provider('anthropic')).toMatch(/sk-ant-/);
  });
});
