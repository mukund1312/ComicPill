import type { Own } from '../types/domain';

/** physical + digital = both; otherwise the newer format wins over 'none'. */
export function mergeOwn(existing: Own, format: 'physical' | 'digital'): Own {
  if (existing === 'both') return 'both';
  if (existing === 'none') return format;
  if (existing === format) return existing;
  return 'both'; // existing was the other format
}
