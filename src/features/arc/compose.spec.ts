import { describe, expect, it } from 'vitest';
import { describeResult } from './compose';
import { interpretOffline } from '../../lib/intent/offline';
import { resolveArc } from '../../lib/intent/resolve';
import type { ReadingIntent } from '../../lib/intent/schema';

const MESSAGE = "I am reading World's Finest. It's going good, but there are lots of characters I don't know, like Doom Patrol. It's not really a problem though. Anyway, I want to read the Batman and sons stuff. What's the arc? Basically I want Batman's origin, then introduction to Robin, Red Hood, Nightwing and eventually slowly reach the end of Batman.";

const view = (text: string, source: 'model' | 'offline' = 'model') => {
  const intent = interpretOffline(text);
  return { intent, view: describeResult(resolveArc(intent), intent, source) };
};

describe('describeResult on the spec message', () => {
  const { view: v } = view(MESSAGE);

  it('tells the reader what it built, from real journey data', () => {
    expect(v.kind).toBe('match');
    expect(v.headline).toMatch(/Batman: From Year One to Legacy/);
    expect(v.outline).toEqual(expect.arrayContaining(['The Beginning', 'The First Robin', 'The Second Robin', 'Batman and Son']));
    expect(v.focusChips).toEqual(['Batman origin', 'Robin', 'Red Hood', 'Nightwing']);
    expect(v.notCovered).toEqual([]);
  });

  it('reassures about Doom Patrol instead of sending the reader off to prerequisite reading', () => {
    expect(v.reassurance).toMatch(/Doom Patrol/);
    expect(v.reassurance).toMatch(/World’s Finest|World's Finest/);
    expect(v.reassurance).toMatch(/don’t need extra reading/);
    expect(v.reassurance).not.toMatch(/read .* first/i);
    expect(v.offersCharacterHelp).toBe(false);
  });

  it('never tells the reader to read anything before starting', () => {
    const all = [v.headline, v.reassurance ?? '', ...v.outline].join(' ');
    expect(all).not.toMatch(/before you (start|begin)|must read|first read/i);
  });
});

describe('describeResult edge cases', () => {
  it('says why the fallback happened: a rejected key, no key at all, or an unreachable assistant', () => {
    const { intent } = view(MESSAGE);
    const r = resolveArc(intent);
    expect(describeResult(r, intent, 'offline', { aiError: 'The provider rejected your API key.' }).sourceNote).toMatch(/rejected your API key.*instead/);
    expect(describeResult(r, intent, 'offline', { hasAssistant: false }).sourceNote).toMatch(/Add an AI key in Settings/);
    expect(describeResult(r, intent, 'offline', { hasAssistant: true }).sourceNote).toMatch(/couldn.t reach the assistant/);
    expect(describeResult(r, intent, 'model', { aiError: 'x' }).sourceNote).toBeNull();
  });

  it('is honest that the offline path only matched words', () => {
    expect(view(MESSAGE, 'offline').view.sourceNote).toMatch(/matched your words/);
    expect(view(MESSAGE, 'model').view.sourceNote).toBeNull();
  });

  it('offers help (not a reassurance) when the friction is serious', () => {
    const { intent } = view(MESSAGE);
    const serious: ReadingIntent = { ...intent, friction: { type: 'unfamiliar_characters', severity: 'high', examples: ['Doom Patrol'] } };
    const v = describeResult(resolveArc(serious), serious, 'model');
    expect(v.reassurance).toBeNull();
    expect(v.offersCharacterHelp).toBe(true);
  });

  it('surfaces beats the journey does not cover instead of hiding them', () => {
    const { intent } = view(MESSAGE);
    const extra: ReadingIntent = { ...intent, newGoal: { ...intent.newGoal!, focus: [...intent.newGoal!.focus, 'Zatanna'] } };
    expect(describeResult(resolveArc(extra), extra, 'model').notCovered).toEqual(['Zatanna']);
  });

  it('says so plainly when there is no journey for the request', () => {
    const { view: v } = view('I want Spider-Man from his origin to Secret Wars');
    expect(v.kind === 'no_template' || v.kind === 'no_goal').toBe(true);
    expect(v.outline).toEqual([]);
  });

  it('acknowledges current reading when there is no new goal', () => {
    const { view: v } = view("I am reading World's Finest and it's going good");
    expect(v.kind).toBe('no_goal');
    expect(v.headline).toMatch(/World's Finest/);
  });
});
