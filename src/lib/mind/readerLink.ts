// "Read now": if the reader has this comic as a file in the ComicPill reader, jump straight into it.
import { titleScore } from '../scan/match';
import type { ReaderComic } from '../reader/readerLibrary';

export function findReaderComic(title: string, comics: Pick<ReaderComic, 'id' | 'title' | 'series'>[]): string | null {
  let best: { id: string; score: number } | null = null;
  for (const c of comics) {
    for (const name of [c.title, c.series].filter((n): n is string => !!n)) {
      const score = titleScore(title, null, name);
      if (score > (best?.score ?? 0)) best = { id: c.id, score };
    }
  }
  return best && best.score >= 0.8 ? best.id : null;
}
