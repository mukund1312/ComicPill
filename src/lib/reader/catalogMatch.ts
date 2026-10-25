// Which catalog book, if any, is this imported file?
import { titleScore } from '../scan/match';

const MATCH = 0.88; // titleScore treats a different volume number as a different book, so this is a safe bar

export function findCatalogMatch(titles: Array<{ id: string; title: string }>, title: string, series: string | null): string | null {
  let best: { id: string; score: number } | null = null;
  for (const t of titles) {
    const score = Math.max(titleScore(title, null, t.title), series ? titleScore(series, null, t.title) * 0.95 : 0);
    if (score > (best?.score ?? 0)) best = { id: t.id, score };
  }
  return best && best.score >= MATCH ? best.id : null;
}

