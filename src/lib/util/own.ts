import type { Own } from '../types/domain';

/** physical + digital = both; otherwise the newer format wins over 'none'. */
export function mergeOwn(existing: Own, format: 'physical' | 'digital'): Own {
  if (existing === 'both') return 'both';
  if (existing === 'none' || existing === 'wishlist' || existing === 'ordered') return format;
  if (existing === format) return existing;
  if (existing === 'subscription') return format; // acquiring a real copy supersedes subscription access
  return 'both'; // existing was the other format
}

/** Can the reader actually open this right now? 'wishlist' and 'ordered' are
 *  real states but not yet readable — a package in transit isn't a book in
 *  hand. 'subscription' is readable even though nothing is "owned" in the
 *  shelf sense. */
export function isAccessible(own: Own): boolean {
  return own === 'physical' || own === 'digital' || own === 'both' || own === 'subscription';
}

/** Is this in the physical-or-digital-format sense — used where "owned"
 *  really means "I have a specific copy", e.g. edition-upgrade decisions. */
export function isFormatOwned(own: Own, format: 'physical' | 'digital'): boolean {
  if (format === 'physical') return own === 'physical' || own === 'both';
  return own === 'digital' || own === 'both' || own === 'subscription';
}
