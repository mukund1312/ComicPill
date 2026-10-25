import { describe, expect, it } from 'vitest';
import { isSameTopic, normalizeTopic } from './rabbit';

describe('rabbit hole topics', () => {
  it('treats case and punctuation as the same topic', () => {
    expect(isSameTopic('Doom Patrol', 'doom patrol')).toBe(true);
    expect(isSameTopic('Doom  Patrol!', 'Doom Patrol')).toBe(true);
  });
  it('keeps different topics apart, and never matches empty', () => {
    expect(isSameTopic('Doom Patrol', 'Metamorpho')).toBe(false);
    expect(isSameTopic('', '')).toBe(false);
    expect(normalizeTopic('  A-B  ')).toBe('a b');
  });
});
