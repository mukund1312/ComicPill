import { describe, expect, it } from 'vitest';
import { formatBytes } from './bytes';

describe('formatBytes', () => {
  it('reads like the iPad storage screen', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(300)).toBe('1 KB');
    expect(formatBytes(842 * 1024)).toBe('842 KB');
    expect(formatBytes(1.4 * 1024 ** 2)).toBe('1.4 MB');
    expect(formatBytes(450 * 1024 ** 2)).toBe('450 MB');
    expect(formatBytes(5.74 * 1024 ** 3)).toBe('5.74 GB');
  });
});
