// One import at a time, tracked outside any screen: leaving the shelf doesn't stop it, and the progress bar follows you around the app.
import { useSyncExternalStore } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { ImportProgress, ImportResult } from './importComics';

export type JobState = {
  running: boolean;
  label: string;
  /** What is being worked on, e.g. the file name. */
  name: string;
  done: number;
  /** 0 while still counting (scanning a folder). */
  total: number;
  stopping: boolean;
  /** How the last job ended, until dismissed. */
  summary: { text: string; problems: string[] } | null;
};

const idle: JobState = { running: false, label: '', name: '', done: 0, total: 0, stopping: false, summary: null };
let state: JobState = idle;
let cancel = { cancelled: false };
const listeners = new Set<() => void>();
const set = (next: Partial<JobState>) => { state = { ...state, ...next }; listeners.forEach((l) => l()); };

export const getJob = (): JobState => state;
export const subscribeJob = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useJob = (): JobState => useSyncExternalStore(subscribeJob, getJob, getJob);

export const dismissSummary = (): void => set({ summary: null });
/** Ask the running job to stop after the file it is on. */
export const stopJob = (): void => { cancel.cancelled = true; set({ stopping: true }); };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a finished job says about itself: how many went in, how many were already there, what failed. */
export function summarize(verb: string, r: ImportResult, stopped: boolean): { text: string; problems: string[] } {
  const parts = [`${verb} ${plural(r.imported.length, 'comic', 'comics')}`];
  if (r.skipped.length) parts.push(`${r.skipped.length} already in your library`);
  if (r.failed.length) parts.push(`${r.failed.length} couldn’t be added`);
  return { text: `${stopped ? 'Stopped. ' : ''}${parts.join(' · ')}`, problems: r.failed.map((f) => `${f.name}: ${f.reason}`) };
}

/**
 * Run `work` as the app's import job. Returns false if one is already running.
 * The screen stays awake meanwhile: iOS suspends an app that has been locked, which would pause the import.
 */
export async function runJob(label: string, work: (progress: ImportProgress) => Promise<{ verb: string; result: ImportResult }>): Promise<boolean> {
  if (state.running) return false;
  cancel = { cancelled: false };
  set({ ...idle, running: true, label });
  void activateKeepAwakeAsync('comicpill-import').catch(() => undefined);
  try {
    const { verb, result } = await work({ cancel, onProgress: (p) => set({ done: p.done, total: p.total, name: p.name, ...(p.phase ? { label: p.phase } : {}) }) });
    // Backing out of the picker leaves nothing to report.
    if (result.imported.length || result.skipped.length || result.failed.length) set({ summary: summarize(verb, result, cancel.cancelled) });
  } catch (e) {
    set({ summary: { text: 'The import stopped unexpectedly', problems: [e instanceof Error ? e.message : String(e)] } });
  } finally {
    void deactivateKeepAwake('comicpill-import').catch(() => undefined);
    set({ running: false, stopping: false, name: '' });
  }
  return true;
}
