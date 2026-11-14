import { describe, expect, it } from 'vitest';
import { mailtoLink } from './support';

describe('mailtoLink', () => {
  it('encodes the subject and body', () => {
    expect(mailtoLink('a@b.co', 'Bug: reader & panels', 'Line 1\nLine 2?')).toBe('mailto:a@b.co?subject=Bug%3A%20reader%20%26%20panels&body=Line%201%0ALine%202%3F');
  });
});
