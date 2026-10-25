// On-device crash log. There is no server and no analytics, so the last unhandled JS error is kept
// locally (and shown in Reader settings) to attach to a bug report. Hooking up Crashlytics instead
// is a Firebase-project task — see docs/RELEASING.md.
import { getMeta, setMeta } from '../db/queries/meta';

const KEY = 'last_error';

export type CrashRecord = { message: string; stack: string; fatal: boolean; at: number };

type ErrorUtilsLike = { getGlobalHandler?: () => ((e: unknown, fatal?: boolean) => void) | undefined; setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void };

export function installCrashLog(): void {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils?.setGlobalHandler) return;
  const previous = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error, fatal) => {
    try {
      const e = error as { message?: string; stack?: string } | undefined;
      const record: CrashRecord = { message: String(e?.message ?? error), stack: String(e?.stack ?? '').slice(0, 1500), fatal: !!fatal, at: Date.now() };
      setMeta(KEY, JSON.stringify(record));
    } catch { /* logging must never make a crash worse */ }
    previous?.(error, fatal);
  });
}

export function lastCrash(): CrashRecord | null {
  try { const raw = getMeta(KEY); return raw ? (JSON.parse(raw) as CrashRecord) : null; } catch { return null; }
}

export function clearCrash(): void { setMeta(KEY, ''); }
