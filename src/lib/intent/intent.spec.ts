import { describe, expect, it, vi } from 'vitest';
import { ReadingIntentSchema, readingIntentJsonSchema, type ReadingIntent } from './schema';
import { parseReadingIntent, parseReadingIntentJson } from './validate';
import { matchFocus, resolveArc, templateKeywords } from './resolve';
import { interpretOffline } from './offline';
import { interpretReadingIntent } from './client';
import { INTENT_MODEL, MAX_MESSAGE_CHARS, extractReadingIntent, handleIntentRequest, type IntentClient } from './server';
import { buildIntentUserMessage } from './prompt';
import { BATMAN_FAMILY_ARC } from '../engines/arc/templates';

// The message from the product spec, verbatim.
const MESSAGE = "I am reading World's Finest. It's going good, but there are lots of characters I don't know, like Doom Patrol. It's not really a problem though. Anyway, I want to read the Batman and sons stuff. What's the arc? Basically I want Batman's origin, then introduction to Robin, Red Hood, Nightwing and eventually slowly reach the end of Batman.";

// What a good model reply looks like for that message.
const MODEL_REPLY: ReadingIntent = {
  currentReading: { work: "Batman/Superman: World's Finest", sentiment: 'positive', continueReading: true },
  friction: { type: 'unfamiliar_characters', severity: 'low', examples: ['Doom Patrol'] },
  newGoal: {
    character: 'Batman',
    journeyKinds: ['character_life_arc', 'family_arc', 'legacy_arc'],
    focus: ['Batman origin', 'Robin', 'Red Hood', 'Nightwing', 'end of Batman'],
    titleReferences: [{ text: 'Batman and sons', interpretation: 'both' }],
  },
  depth: null,
  spoilerPreference: 'minimal',
  ownershipAware: true,
  implicitFeedback: [{ work: "Batman/Superman: World's Finest", sentiment: 'positive', confidence: 'medium' }],
  proposedLibraryUpdates: [],
  confidence: {
    high: ["Currently reading World's Finest", 'Wants a Batman-focused journey'],
    medium: ['Interested in the Bat-Family'],
    low: ['"The end of Batman" could mean a later stage, a possible future, or an alternate ending'],
  },
  clarifyingQuestion: null,
};

describe('schema', () => {
  it('accepts the spec example reply', () => {
    expect(ReadingIntentSchema.safeParse(MODEL_REPLY).success).toBe(true);
  });

  it('sends no schema metadata and no $ref / numeric / string constraints (unsupported by structured outputs)', () => {
    const text = JSON.stringify(readingIntentJsonSchema());
    expect(text).not.toMatch(/\$schema|\$ref|\$defs|"minimum"|"maximum"|"minLength"|"maxLength"|"pattern"|"format"/);
  });

  it('generates a closed JSON schema (every object forbids extra keys), as structured outputs require', () => {
    const open: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
      if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>;
        if (o.type === 'object' && o.additionalProperties !== false) open.push(path);
        for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
      }
    };
    walk(readingIntentJsonSchema(), '$');
    expect(open).toEqual([]);
  });
});

describe('validation of untrusted output', () => {
  it('rejects non-objects, missing fields and wrong enums', () => {
    expect(parseReadingIntent(null)).toBeNull();
    expect(parseReadingIntent('hello')).toBeNull();
    expect(parseReadingIntent({})).toBeNull();
    expect(parseReadingIntent({ ...MODEL_REPLY, depth: 'everything' })).toBeNull();
    expect(parseReadingIntent({ ...MODEL_REPLY, friction: { type: 'unfamiliar_characters', severity: 'extreme', examples: [] } })).toBeNull();
  });

  it('rejects malformed JSON strings without throwing', () => {
    expect(parseReadingIntentJson('{not json')).toBeNull();
    expect(parseReadingIntentJson(JSON.stringify(MODEL_REPLY))).not.toBeNull();
  });

  it('bounds and trims strings and lists', () => {
    const noisy = { ...MODEL_REPLY, newGoal: { ...MODEL_REPLY.newGoal!, focus: ['  Robin  ', 'x'.repeat(5000), ...Array(50).fill('Robin')] } };
    const out = parseReadingIntent(noisy)!;
    expect(out.newGoal!.focus[0]).toBe('Robin');
    expect(out.newGoal!.focus[1].length).toBeLessThanOrEqual(200);
    expect(out.newGoal!.focus.length).toBeLessThanOrEqual(20);
  });
});

describe('resolveArc (the app, not the model, picks the journey)', () => {
  it('maps the spec message to the Batman journey at the default Recommended depth', () => {
    const r = resolveArc(MODEL_REPLY);
    expect(r.kind).toBe('match');
    if (r.kind !== 'match') return;
    expect(r.templateKey).toBe(BATMAN_FAMILY_ARC.key);
    expect(r.depth).toBe('recommended');
    expect(r.matchedFocus.map((m) => m.focus)).toEqual(expect.arrayContaining(['Robin', 'Red Hood', 'Nightwing']));
    expect(r.chapterOutline.length).toBeGreaterThanOrEqual(6);
  });

  it('reports what the journey does not specifically cover instead of hiding it', () => {
    const r = resolveArc({ ...MODEL_REPLY, newGoal: { ...MODEL_REPLY.newGoal!, focus: ['Robin', 'Zatanna'] } });
    if (r.kind !== 'match') throw new Error('expected a match');
    expect(r.unmatchedFocus).toEqual(['Zatanna']);
  });

  it('honours an explicit depth', () => {
    const r = resolveArc({ ...MODEL_REPLY, depth: 'essential' });
    if (r.kind !== 'match') throw new Error('expected a match');
    expect(r.depth).toBe('essential');
  });

  it('is honest when no journey exists yet (Spider-Man) and lists what does', () => {
    const r = resolveArc({ ...MODEL_REPLY, newGoal: { character: 'Spider-Man', journeyKinds: ['origin_path'], focus: ['Spider-Man origin', 'Secret Wars'], titleReferences: [] } });
    expect(r.kind).toBe('no_template');
    if (r.kind === 'no_template') expect(r.available.map((a) => a.key)).toEqual(expect.arrayContaining([BATMAN_FAMILY_ARC.key, 'superman-krypton-to-legacy']));
  });

  it('builds the Superman journey for "Superman\u2019s origin to Kingdom Come"', () => {
    const r = resolveArc({ ...MODEL_REPLY, newGoal: { character: 'Superman', journeyKinds: ['origin_path', 'legacy_arc'], focus: ['Superman origin', 'Kingdom Come'], titleReferences: [] } });
    expect(r).toMatchObject({ kind: 'match', templateKey: 'superman-krypton-to-legacy' });
    if (r.kind === 'match') {
      expect(r.matchedFocus.map((m) => m.keyword)).toEqual(expect.arrayContaining(['superman', 'kingdom come']));
      expect(r.chapterOutline).toEqual(expect.arrayContaining(['The Origin', 'Death and Return']));
    }
  });

  it('a Dick Grayson request builds the Nightwing journey, not Batman\u2019s', () => {
    const r = resolveArc({ ...MODEL_REPLY, newGoal: { character: 'Dick Grayson', journeyKinds: ['character_life_arc'], focus: ['Nightwing'], titleReferences: [] } });
    expect(r).toMatchObject({ kind: 'match', templateKey: 'nightwing-dick-grayson' });
  });

  it('returns no_goal when the message only described current reading', () => {
    expect(resolveArc({ ...MODEL_REPLY, newGoal: null }).kind).toBe('no_goal');
  });

  it('the friction about Doom Patrol never changes which journey is built', () => {
    const withFriction = resolveArc(MODEL_REPLY);
    const without = resolveArc({ ...MODEL_REPLY, friction: null });
    expect(withFriction).toEqual(without);
  });

  it('derives keywords from the family tree and milestones', () => {
    const kw = templateKeywords(BATMAN_FAMILY_ARC);
    for (const term of [' batman ', ' red hood ', ' nightwing ', ' damian ', ' dick ', ' bat family ']) expect(kw).toContain(term);
    expect(matchFocus('Batman origin', kw)).toBe('batman');
    expect(matchFocus('Red Hood', kw)).toBe('red hood');
    expect(matchFocus('quantum physics', kw)).toBeNull();
  });

  it('does not let a fragment resolve to a longer keyword ("Robin" is not "Red Robin")', () => {
    const kw = templateKeywords(BATMAN_FAMILY_ARC);
    expect(matchFocus('Robin', kw)).toBe('robin');
    expect(matchFocus('Red Robin', kw)).toBe('red robin');
    expect(matchFocus('Tim Drake as Red Robin', kw)).toBe('tim drake');
  });
});

describe('offline interpreter (degraded mode)', () => {
  const intent = interpretOffline(MESSAGE);

  it('produces a valid ReadingIntent', () => {
    expect(ReadingIntentSchema.safeParse(intent).success).toBe(true);
  });

  it('separates the signals in the spec message', () => {
    expect(intent.currentReading?.work).toBe("World's Finest");
    expect(intent.currentReading?.sentiment).toBe('positive');
    expect(intent.friction).toMatchObject({ type: 'unfamiliar_characters', severity: 'low' });
    expect(intent.friction?.examples).toEqual(['Doom Patrol']);
    expect(intent.newGoal?.character).toBe('Batman');
    expect(intent.newGoal?.journeyKinds).toEqual(expect.arrayContaining(['character_life_arc', 'family_arc', 'legacy_arc']));
    expect(intent.newGoal?.focus).toEqual(expect.arrayContaining(['Batman origin', 'Robin', 'Red Hood', 'Nightwing']));
  });

  it('treats "Batman and sons" as both a possible title and a request', () => {
    expect(intent.newGoal?.titleReferences).toEqual([{ text: 'Batman and Sons', interpretation: 'both' }]);
  });

  it('keeps the title reference out of the journey focus, in the order the reader named the beats', () => {
    expect(intent.newGoal?.focus.some((f) => /sons?/i.test(f))).toBe(false);
    expect(intent.newGoal?.focus).toEqual(['Batman origin', 'Robin', 'Red Hood', 'Nightwing']);
    expect(intent.confidence.medium.join(' ')).not.toMatch(/sons/i);
  });

  it('maps each named beat to the right thing in the journey', () => {
    const r = resolveArc(intent);
    if (r.kind !== 'match') throw new Error('expected a match');
    expect(Object.fromEntries(r.matchedFocus.map((m) => [m.focus, m.keyword]))).toEqual({
      'Batman origin': 'batman', Robin: 'robin', 'Red Hood': 'red hood', Nightwing: 'nightwing',
    });
    expect(r.unmatchedFocus).toEqual([]);
  });

  it('does not treat mild friction as a blocker and does not read "going good" as a rating', () => {
    expect(intent.friction?.severity).toBe('low');
    expect(intent.implicitFeedback[0]).toMatchObject({ sentiment: 'positive', confidence: 'medium' });
  });

  it('always admits it is a word-match, and flags the ambiguous ending', () => {
    expect(intent.confidence.low.join(' ')).toMatch(/matching words/);
    expect(intent.confidence.low.join(' ')).toMatch(/several different endings/);
  });

  it('resolves to the same journey the model reply does', () => {
    const a = resolveArc(intent);
    const b = resolveArc(MODEL_REPLY);
    expect(a.kind === 'match' && b.kind === 'match' && a.templateKey === b.templateKey).toBe(true);
  });

  it('does not force a journey on an unrelated message', () => {
    const other = interpretOffline('what should I read tonight?');
    expect(other.newGoal).toBeNull();
    expect(resolveArc(other).kind).toBe('no_goal');
  });

  it('proposes (never applies) a status change when the reader says they finished something', () => {
    const done = interpretOffline("I finished World's Finest Vol 1. Loved the art but didn't care about the villain.");
    expect(done.proposedLibraryUpdates).toEqual([{ work: "World's Finest Vol 1", action: 'mark_finished' }]);
  });

  it('picks up an explicit depth', () => {
    expect(interpretOffline('I want the completionist Batman family deep dive').depth).toBe('completionist');
  });
});

describe('server extraction', () => {
  const okResponse = (text: string, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text }] });
  const fakeClient = (response: unknown) => {
    const create = vi.fn().mockResolvedValue(response);
    return { create, client: { beta: { messages: { create } } } as unknown as IntentClient };
  };

  it('sends the request the API and the model docs require', async () => {
    const { create, client } = fakeClient(okResponse(JSON.stringify(MODEL_REPLY)));
    await extractReadingIntent(MESSAGE, client);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe(INTENT_MODEL);
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.fallbacks).toBe('default');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_config.effort).toBe('low');
    // Things this model rejects with a 400:
    expect(params).not.toHaveProperty('tool_choice');
    expect(params).not.toHaveProperty('temperature');
    expect(params.thinking).toBeUndefined();
    expect(params.max_tokens).toBeGreaterThanOrEqual(4000);
  });

  it('wraps the reader\'s message as data and names the journeys that exist', async () => {
    const { create, client } = fakeClient(okResponse(JSON.stringify(MODEL_REPLY)));
    await extractReadingIntent(MESSAGE, client);
    const content = create.mock.calls[0][0].messages[0].content as string;
    expect(content).toContain('<message>');
    expect(content).toContain(MESSAGE);
    expect(content).toContain(BATMAN_FAMILY_ARC.title);
  });

  it('returns the validated intent', async () => {
    const { client } = fakeClient(okResponse(JSON.stringify(MODEL_REPLY)));
    await expect(extractReadingIntent(MESSAGE, client)).resolves.toMatchObject({ friction: { severity: 'low' } });
  });

  it.each([
    ['a refusal', { stop_reason: 'refusal', content: [] }, 'refused'],
    ['truncation', okResponse('{"currentRea', 'max_tokens'), 'truncated'],
    ['no text block', { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }] }, 'empty'],
    ['invalid JSON', okResponse('not json'), 'invalid_output'],
    ['wrong shape', okResponse(JSON.stringify({ hello: 'world' })), 'invalid_output'],
  ])('fails cleanly on %s', async (_name, response, code) => {
    const { client } = fakeClient(response);
    await expect(extractReadingIntent(MESSAGE, client)).rejects.toMatchObject({ code });
  });

  it('describes journeys in the user message', () => {
    expect(buildIntentUserMessage('hi', [])).toContain('(none)');
  });
});

describe('HTTP handler', () => {
  const okClient = (): IntentClient => ({
    beta: { messages: { create: vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(MODEL_REPLY) }] }) } },
  } as unknown as IntentClient);
  const req = (body: unknown, init: RequestInit = {}) =>
    new Request('https://x.test/intent', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init });
  const allow = () => true;

  it('fails closed: rejects when authorize says no, without touching the model', async () => {
    const client = okClient();
    const res = await handleIntentRequest(req({ text: MESSAGE }), { client, authorize: () => false });
    expect(res.status).toBe(401);
    expect(client.beta.messages.create).not.toHaveBeenCalled();
  });

  it('rejects non-POST, bad JSON, missing/empty text and oversize text', async () => {
    const deps = { client: okClient(), authorize: allow };
    expect((await handleIntentRequest(new Request('https://x.test', { method: 'GET' }), deps)).status).toBe(405);
    expect((await handleIntentRequest(req('{oops'), deps)).status).toBe(400);
    expect((await handleIntentRequest(req({}), deps)).status).toBe(400);
    expect((await handleIntentRequest(req({ text: '   ' }), deps)).status).toBe(400);
    expect((await handleIntentRequest(req({ text: 'x'.repeat(MAX_MESSAGE_CHARS + 1) }), deps)).status).toBe(413);
  });

  it('returns the intent on success', async () => {
    const res = await handleIntentRequest(req({ text: MESSAGE }), { client: okClient(), authorize: allow });
    expect(res.status).toBe(200);
    const body = await res.json() as { intent: ReadingIntent };
    expect(body.intent.newGoal?.character).toBe('Batman');
  });

  it('maps a refusal to 422 and upstream failures to 502 without leaking internals', async () => {
    const refused = { beta: { messages: { create: vi.fn().mockResolvedValue({ stop_reason: 'refusal', content: [] }) } } } as unknown as IntentClient;
    expect((await handleIntentRequest(req({ text: 'hi' }), { client: refused, authorize: allow })).status).toBe(422);
    const boom = { beta: { messages: { create: vi.fn().mockRejectedValue(new Error('sk-ant-secret exploded')) } } } as unknown as IntentClient;
    const res = await handleIntentRequest(req({ text: 'hi' }), { client: boom, authorize: allow });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('secret');
  });
});

describe('app client with fallback', () => {
  const mockFetch = (impl: () => Promise<Response>) => vi.fn(impl) as unknown as typeof fetch;
  const ok = () => Promise.resolve(new Response(JSON.stringify({ intent: MODEL_REPLY }), { status: 200 }));

  it('goes straight to offline when no endpoint is configured (no network call)', async () => {
    const f = mockFetch(ok);
    const r = await interpretReadingIntent(MESSAGE, { fetchImpl: f });
    expect(r.source).toBe('offline');
    expect(f).not.toHaveBeenCalled();
  });

  it('uses the model result when the endpoint answers', async () => {
    const f = mockFetch(ok);
    const r = await interpretReadingIntent(MESSAGE, { endpoint: 'https://x.test/i', token: 't', fetchImpl: f });
    expect(r.source).toBe('model');
    expect(r.intent.friction?.examples).toEqual(['Doom Patrol']);
    const init = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer t');
  });

  it.each([
    ['a network error', () => Promise.reject(new Error('offline'))],
    ['a 500', () => Promise.resolve(new Response('no', { status: 500 }))],
    ['a 401', () => Promise.resolve(new Response('no', { status: 401 }))],
    ['non-JSON', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['JSON of the wrong shape', () => Promise.resolve(new Response(JSON.stringify({ intent: { nope: 1 } }), { status: 200 }))],
  ])('falls back to offline on %s', async (_n, impl) => {
    const r = await interpretReadingIntent(MESSAGE, { endpoint: 'https://x.test/i', fetchImpl: mockFetch(impl) });
    expect(r.source).toBe('offline');
    expect(r.intent.newGoal?.character).toBe('Batman');
  });

  it('gives up on a hung request after the timeout and falls back', async () => {
    const hang = ((_u: unknown, init: RequestInit) => new Promise<Response>((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new Error('aborted')));
    })) as unknown as typeof fetch;
    const r = await interpretReadingIntent(MESSAGE, { endpoint: 'https://x.test/i', fetchImpl: hang, timeoutMs: 20 });
    expect(r.source).toBe('offline');
  });
});
