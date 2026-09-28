/** YYYY-MM-DD in the device's local time — the daily seed for Today's
 *  tie-breaker jitter, so reopening tonight is stable but tomorrow can differ. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
