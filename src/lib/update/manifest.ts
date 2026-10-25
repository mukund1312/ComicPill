// "Is there a newer ComicPill?" for people who installed the APK directly
// (the Play Store updates its own apps; a sideloaded APK never would).
//
// The app fetches a tiny public JSON file. Because that file decides which
// link the reader is sent to, it is treated as untrusted: the version must be
// plain semver and the download link MUST live under this project's GitHub
// releases — a tampered manifest can't point people somewhere else.
import { z } from 'zod';

export const UPDATE_MANIFEST_URL = 'https://mukund1312.github.io/ComicPill/version.json';
export const APK_URL_PREFIX = 'https://github.com/mukund1312/ComicPill/releases/';
export const CHECK_INTERVAL_HOURS = 24;

const SEMVER = /^\d+\.\d+\.\d+$/;

const ManifestSchema = z.object({
  latest: z.string().regex(SEMVER),
  apkUrl: z.string().startsWith(APK_URL_PREFIX),
  notes: z.string().max(300).nullable().optional(),
  minSupported: z.string().regex(SEMVER).nullable().optional(),
});

export interface UpdateManifest { latest: string; apkUrl: string; notes: string | null; minSupported: string | null }

export function parseManifest(raw: unknown): UpdateManifest | null {
  const p = ManifestSchema.safeParse(raw);
  if (!p.success) return null;
  return { latest: p.data.latest, apkUrl: p.data.apkUrl, notes: p.data.notes ?? null, minSupported: p.data.minSupported ?? null };
}

/** -1 if a < b, 0 if equal, 1 if a > b. Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type UpdateStatus =
  | { kind: 'up_to_date' }
  | { kind: 'available'; latest: string; apkUrl: string; notes: string | null }
  /** The installed version is older than the oldest the project still supports. */
  | { kind: 'required'; latest: string; apkUrl: string; notes: string | null };

export function updateStatus(current: string, m: UpdateManifest): UpdateStatus {
  if (compareVersions(current, m.latest) >= 0) return { kind: 'up_to_date' };
  const base = { latest: m.latest, apkUrl: m.apkUrl, notes: m.notes };
  return m.minSupported && compareVersions(current, m.minSupported) < 0 ? { kind: 'required', ...base } : { kind: 'available', ...base };
}

/** At most one automatic check per interval; a clock that went backwards is treated as due. */
export function shouldCheck(lastCheckedIso: string | null, now: Date, intervalHours = CHECK_INTERVAL_HOURS): boolean {
  if (!lastCheckedIso) return true;
  const last = new Date(lastCheckedIso).getTime();
  if (Number.isNaN(last) || last > now.getTime()) return true;
  return now.getTime() - last >= intervalHours * 3_600_000;
}

/** Checked again right before opening, so nothing but the project's own release links is ever launched. */
export const isTrustedApkUrl = (url: string) => url.startsWith(APK_URL_PREFIX) && !/\s/.test(url);
