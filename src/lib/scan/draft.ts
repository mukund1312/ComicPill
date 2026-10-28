// An unfinished shelf scan, kept so closing the screen doesn't lose the work. The shelf photo and the spine pictures live in the app's own
// folder for this scan only, and go when the scan is finished (or after a week at most).
import { sqlite } from '../db/client';
// eslint-disable-next-line import/no-unresolved -- package ships .ts source; tsc and Metro resolve it
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { expiryFor, isExpired, type DraftStatus } from './draftModel';

export type Draft = { id: string; createdAt: number; expiresAt: number; status: DraftStatus; state: unknown };

const scansRoot = () => new Directory(Paths.document, 'scans');
export const draftDir = (id: string) => new Directory(scansRoot(), id);
export const draftPhoto = (id: string) => new File(draftDir(id), 'photo.jpg');

type Row = { id: string; created_at: number; expires_at: number; status: string; state_json: string };
const toDraft = (r: Row): Draft => ({ id: r.id, createdAt: r.created_at, expiresAt: r.expires_at, status: r.status === 'kept' ? 'kept' : 'draft', state: (() => { try { return JSON.parse(r.state_json); } catch { return null; } })() });

/** Start a draft from the photo that is being scanned. The photo is copied in, so it outlives the picker's temporary file. */
export async function createDraft(photoUri: string): Promise<string> {
  const id = randomUUID();
  const dir = draftDir(id);
  dir.create({ intermediates: true });
  await new File(photoUri).copy(draftPhoto(id));
  const now = Date.now();
  sqlite.runSync('INSERT INTO scan_drafts (id, created_at, expires_at, status, state_json) VALUES (?, ?, ?, ?, ?)', id, now, expiryFor(now), 'draft', '{}');
  return id;
}

export const saveDraftState = (id: string, state: unknown): void => { sqlite.runSync('UPDATE scan_drafts SET state_json = ? WHERE id = ?', JSON.stringify(state), id); };

export const loadDraft = (id: string): Draft | null => { const r = sqlite.getFirstSync<Row>('SELECT * FROM scan_drafts WHERE id = ?', id); return r ? toDraft(r) : null; };

/** The scan still being reviewed, newest first, so reopening the screen can offer to pick up where the reader left off. */
export const openDrafts = (): Draft[] => sqlite.getAllSync<Row>("SELECT * FROM scan_drafts WHERE status = 'draft' ORDER BY created_at DESC").map(toDraft);
export const keptScans = (): Draft[] => sqlite.getAllSync<Row>("SELECT * FROM scan_drafts WHERE status = 'kept' ORDER BY created_at DESC").map(toDraft);

/** Remove the scan and every picture belonging to it. */
export function deleteDraft(id: string): void {
  try { const dir = draftDir(id); if (dir.exists) dir.delete(); } catch { /* it will be swept up with the expired ones */ }
  sqlite.runSync('DELETE FROM scan_drafts WHERE id = ?', id);
}

/** The reader chose to keep the photo: it stays for a week from now, then goes. */
export function keepDraft(id: string): void { sqlite.runSync("UPDATE scan_drafts SET status = 'kept', expires_at = ? WHERE id = ?", expiryFor(Date.now()), id); }

/** Delete anything past its date. Safe to run whenever the app starts. */
export function purgeExpiredDrafts(now = Date.now()): number {
  const rows = sqlite.getAllSync<Row>('SELECT * FROM scan_drafts');
  const gone = rows.filter((r) => isExpired(r.expires_at, now));
  for (const r of gone) deleteDraft(r.id);
  // A scan folder with no row (the app was closed mid-way) is leftover too.
  try {
    const known = new Set(rows.filter((r) => !isExpired(r.expires_at, now)).map((r) => r.id));
    if (scansRoot().exists) for (const e of scansRoot().list()) if (e instanceof Directory && !known.has(e.name)) e.delete();
  } catch { /* nothing to sweep */ }
  return gone.length;
}
