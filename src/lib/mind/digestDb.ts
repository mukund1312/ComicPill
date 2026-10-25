import { buildDigest, weekKey, type Digest, type FindInput } from './engine/digest';
import { readingOrder } from './engine/readingPlanner';
import { listDigests, loadGraph, saveDigestJson, sourcesOf } from './queries';
import { getMindSettings } from './settings';
import { makeScorer, verdictFor } from './taste';

const DAY = 24 * 60 * 60 * 1000;
const FIND_WINDOW = 7 * DAY;

/** The most recent digest day at its hour, not after `now` — the start of the current reading week. */
export function cycleStart(now: Date, weekday: number, hour: number, minute: number): Date {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  t.setDate(t.getDate() - ((now.getDay() - weekday + 7) % 7));
  if (t.getTime() > now.getTime()) t.setDate(t.getDate() - 7);
  return t;
}

export function latestDigest(): Digest | null {
  const row = listDigests()[0];
  try { return row ? (JSON.parse(row.json) as Digest) : null; } catch { return null; }
}

/** Build this reading week's digest from what is in the library right now, and keep it. */
export function buildAndSaveDigest(now: Date = new Date()): Digest {
  const settings = getMindSettings();
  const graph = loadGraph();
  const scorer = makeScorer(settings.weights);
  const start = cycleStart(now, settings.digestDay, settings.digestHour, settings.digestMinute);
  const since = now.getTime() - FIND_WINDOW;

  // Last week's "Up next" carries over, so nothing found is lost for not fitting.
  const previous = latestDigest();
  const carried = new Set(previous && previous.week !== weekKey(start) ? previous.upNext.map((c) => c.seriesId) : []);

  const finds: FindInput[] = [];
  for (const row of graph.rows.values()) {
    if (row.stub || row.readStatus !== 'planned') continue;
    const fresh = (row.foundAt ?? 0) >= since;
    if (!fresh && !carried.has(row.id)) continue;
    const scored = scorer.score(row);
    finds.push({
      series: graph.series.get(row.id)!,
      score: scored.score, confidence: scored.confidence, reason: scored.reasons.slice(0, 2).join('. '),
      order: readingOrder(row.id, graph.series, graph.edges),
      verdict: verdictFor(row, scored, settings, settings.thresholds, now),
      coverUrl: row.coverUrl, thumbUri: sourcesOf(row.id)[0]?.uri ?? null, unverified: !row.verified,
    });
  }

  const startDay = Math.max(now.getTime(), start.getTime()) === now.getTime() ? now.getDay() : start.getDay();
  const digest = buildDigest(finds, { week: weekKey(start), builtAt: now.getTime(), capacity: settings.capacity, startDayIndex: startDay, readingDays: settings.readingDays });
  saveDigestJson(digest.week, JSON.stringify(digest));
  return digest;
}
