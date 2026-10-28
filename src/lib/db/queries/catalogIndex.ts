// The catalog as the scan matcher wants it: every comic's id, title and creators, for fuzzy matching against what a spine says.
import { sqlite } from '../client';
import type { CatalogEntry } from '../../scan/candidates';

export function loadCatalogEntries(): CatalogEntry[] {
  return sqlite.getAllSync<{ id: string; title: string; creators: string | null }>('SELECT id, title, creators FROM works').map((r) => {
    let creators: string[] = [];
    try { const parsed = JSON.parse(r.creators ?? '[]'); if (Array.isArray(parsed)) creators = parsed.filter((c): c is string => typeof c === 'string'); } catch { /* an entry with odd creators still matches by title */ }
    return { id: r.id, title: r.title, creators };
  });
}
