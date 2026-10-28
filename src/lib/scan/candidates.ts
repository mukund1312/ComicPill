// Deciding which catalog comic a spine is. The lettering on a spine is read imperfectly (typos, a credits line run into the title, two
// books' text in one group), so this asks "how much of this catalog title can I find in what was read?" instead of comparing two strings.
// Rare words count for more than common ones, typos are forgiven, and the creators on the spine are a bonus. Pure and testable.

export type CatalogEntry = { id: string; title: string; creators: string[] };
export type Reading = { title: string; volume: string | null; creators: string[]; rawText: string };
export type Candidate = { id: string; title: string; score: number; reasons: string[]; editionWords: string[] };
/** How sure the match is. A ranking signal, not a probability: nothing here has been calibrated against thousands of labelled scans. */
export type MatchStrength = 'strong' | 'likely' | 'possible' | 'none';
export type MatchDecision = { best: Candidate | null; strength: MatchStrength; alternatives: Candidate[]; editionUncertain: boolean };

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'to', 'vs', 'vol', 'volume', 'book', 'books', 'part', 'edition', 'tpb', 'hc', 'dc', 'comics']);
const EDITION_WORDS = ['deluxe', 'omnibus', 'absolute', 'compact', 'anniversary', 'hardcover', 'paperback', 'complete', 'collection', 'annotated', 'definitive', 'library'];
const WORD_NUMBER: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', zero: '0' };

/** Lower case, accents and punctuation removed, split into words. */
export const fold = (s: string): string[] => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const isNumber = (t: string) => /^\d+$/.test(t);

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const cur = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  }
  return row[b.length];
}

/** How alike two words are, for words read off a spine: 1 identical, less for one or two letters wrong, 0 if different. */
export function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (isNumber(a) || isNumber(b)) return 0;
  const min = Math.min(a.length, b.length);
  const d = distance(a, b);
  if (d === 1 && min >= 4) return 0.85;
  if (d === 2 && min >= 8) return 0.75;
  if (min >= 6 && (a.includes(b) || b.includes(a))) return 0.7; // part of a longer run-together word
  return 0;
}

export type CatalogIndex = { entries: { entry: CatalogEntry; words: string[]; stem: string[]; numbers: Set<string>; editionWords: Set<string> }[]; weight: Map<string, number> };

const numbersOf = (tokens: string[]) => new Set(tokens.map((t) => WORD_NUMBER[t] ?? t).filter(isNumber));

/** Prepare the catalog once: each title's significant words, and how rare each word is across the catalog (rare words identify a book). */
export function buildIndex(catalog: CatalogEntry[]): CatalogIndex {
  const df = new Map<string, number>();
  const entries = catalog.map((entry) => {
    const tokens = fold(entry.title);
    const words = tokens.filter((t) => !STOP.has(t) && !isNumber(t) && !(t in WORD_NUMBER));
    for (const t of new Set(words)) df.set(t, (df.get(t) ?? 0) + 1);
    // The series part of a title: what comes before the colon or the volume number (“The Sandman” in “The Sandman Vol. 1: Preludes & Nocturnes”).
    const stem = fold(entry.title.split(':')[0].replace(/\bvol(?:ume)?\.?\s*\d+.*$/i, '')).filter((t) => !STOP.has(t) && !isNumber(t) && !(t in WORD_NUMBER));
    return { entry, words, stem, numbers: numbersOf(tokens), editionWords: new Set(tokens.filter((t) => EDITION_WORDS.includes(t))) };
  });
  const weight = new Map([...df].map(([t, n]) => [t, Math.log(1 + catalog.length / n)]));
  return { entries, weight };
}

/** The best catalog comics for what was read from one spine, best first. */
export function rankCandidates(read: Reading, index: CatalogIndex, limit = 5): Candidate[] {
  const titleTokens = fold(`${read.title} ${read.volume ?? ''}`);
  const docTokens = fold(`${read.title} ${read.volume ?? ''} ${read.rawText}`);
  const docWords = docTokens.filter((t) => !STOP.has(t) && !isNumber(t));
  const titleWords = titleTokens.filter((t) => !STOP.has(t) && !isNumber(t) && t.length >= 4);
  const docNumbers = numbersOf(docTokens);
  const creatorWords = new Set(fold(read.creators.join(' ')).concat(docWords));
  const out: Candidate[] = [];
  for (const { entry, words, stem, numbers, editionWords } of index.entries) {
    if (words.length === 0) continue;
    // How much of the catalog title can be found in what was read.
    let got = 0; let total = 0; let matched = 0; const used = new Set<number>();
    for (const w of words) {
      const weight = index.weight.get(w) ?? 1; total += weight;
      let best = 0; let at = -1;
      docWords.forEach((d, i) => { if (!used.has(i)) { const s = wordSimilarity(w, d); if (s > best) { best = s; at = i; } } });
      if (best > 0) { used.add(at); got += weight * best; matched++; }
    }
    let score = total ? got / total : 0;
    const reasons = [`${matched} of ${words.length} words found`];
    // The spine may say only the series (“THE SANDMAN”, “HARLEY QUINN”) while the catalog lists a specific volume. That is a suggestion to
    // confirm, never an automatic match: it is scored below the “strong” line and says to pick the volume.
    if (score < 0.5 && stem.length >= 1 && stem.length < words.length) {
      const stemWeight = stem.reduce((n, w) => n + (index.weight.get(w) ?? 1), 0);
      const stemGot = stem.reduce((n, w) => { let best = 0; for (const d of docWords) best = Math.max(best, wordSimilarity(w, d)); return n + (index.weight.get(w) ?? 1) * best; }, 0);
      const stemScore = stemWeight ? stemGot / stemWeight : 0;
      const entryCreatorWords = fold(entry.creators.join(' '));
      // Words on the spine that neither the series name nor this record's own creators explain (credits often run into the title line).
      const spineSaysMore = titleWords.filter((t) => !stem.some((w) => wordSimilarity(w, t) > 0) && !entryCreatorWords.some((c) => wordSimilarity(c, t) > 0)).length;
      // A common name (“Batman”) names too many books to suggest from; a distinctive one (“Sandman”, “Harley Quinn”) is worth offering, and may carry one unread word.
      const distinct = stemWeight >= 0.6 * Math.log(1 + index.entries.length);
      if (stemWeight >= 0.35 * Math.log(1 + index.entries.length) && stemScore >= 0.85 && (spineSaysMore === 0 || (spineSaysMore === 1 && distinct))) { out.push({ id: entry.id, title: entry.title, score: Math.min(0.66, 0.78 * stemScore), reasons: ['same series: choose the volume'], editionWords: [...editionWords] }); continue; }
    }
    if (score < 0.5) {
      // The title may be in lettering that can't be read while the credits are plain. Two or more of this comic's creators on the spine is worth a
      // suggestion (never an automatic match): “TAYLOR • HAIRSINE • GAUDIANO” points at DCeased.
      const hits = new Set(entry.creators.map((c) => fold(c).pop() ?? '').filter((last) => last.length >= 4 && docWords.some((w) => wordSimilarity(last, w) >= 0.85)));
      if (hits.size >= 2) out.push({ id: entry.id, title: entry.title, score: Math.min(0.64, 0.42 + 0.1 * hits.size), reasons: [`${hits.size} creators match`], editionWords: [...editionWords] });
      continue;
    }
    // A short catalog title (one or two words) must be what the spine's title actually says, not something in the credits.
    if (words.length <= 2 && !words.every((w) => titleWords.some((t) => wordSimilarity(w, t) > 0))) score *= 0.7;
    // The spine's own title should mostly be explained by this catalog title: "Batman" alone isn't "Batman: Year One".
    const explained = titleWords.length ? titleWords.filter((t) => words.some((w) => wordSimilarity(w, t) > 0)).length / titleWords.length : 1;
    // A catalog title of one very common word (“Batman”) only fits a spine that says little more than that word.
    if (words.length === 1 && explained < 0.8) continue;
    score *= 0.75 + 0.25 * explained;
    // Numbers: the right volume helps, a different one is a different book.
    if (numbers.size && docNumbers.size) {
      if ([...numbers].some((n) => docNumbers.has(n))) { score = Math.min(1, score + 0.05); reasons.push('volume matches'); } else { score *= 0.55; reasons.push('different volume'); }
    }
    // Creators on the spine that are also the catalog entry's creators.
    const hits = entry.creators.filter((c) => { const last = fold(c).pop(); return !!last && last.length >= 4 && [...creatorWords].some((w) => wordSimilarity(last, w) >= 0.85); }).length;
    if (hits) { score = Math.min(1, score + Math.min(0.15, 0.08 * hits)); reasons.push(`${hits} creator${hits === 1 ? '' : 's'} match`); }
    // An edition word on the spine that this title lacks (or the reverse) is a different edition.
    const spineEdition = new Set(docTokens.filter((t) => EDITION_WORDS.includes(t)));
    const differs = [...spineEdition].some((e) => !editionWords.has(e) && e !== 'collection' && e !== 'complete') || [...editionWords].some((e) => !spineEdition.has(e) && e !== 'collection' && e !== 'complete');
    if (differs) { score *= 0.92; reasons.push('edition may differ'); }
    out.push({ id: entry.id, title: entry.title, score: Math.min(1, score), reasons, editionWords: [...editionWords] });
  }
  return out.sort((a, b) => b.score - a.score || a.title.length - b.title.length).slice(0, limit);
}

/**
 * Turn the ranked list into a decision: confident, needs a look, or nothing found. When the title is recognised but the edition can't be told
 * (the catalog has a standard and a deluxe record and the spine names neither, or the spine names an edition the record doesn't), it says so.
 */
export function decide(candidates: Candidate[], spineText = ''): MatchDecision {
  const best = candidates[0] ?? null;
  if (!best) return { best: null, strength: 'none', alternatives: [], editionUncertain: false };
  const second = candidates[1];
  const margin = best.score - (second?.score ?? 0);
  // Two records are the same book in different editions when their titles agree once the edition words (deluxe, omnibus…) are set aside.
  const core = (title: string) => fold(title).filter((t) => !STOP.has(t) && !EDITION_WORDS.includes(t));
  const bestWords = new Set(core(best.title));
  const sameBook = (c: Candidate) => { const w = core(c.title); const shared = w.filter((t) => bestWords.has(t)).length; return shared / Math.max(w.length, bestWords.size) >= 0.7; };
  const spineEdition = fold(spineText).some((t) => EDITION_WORDS.includes(t) && t !== 'collection' && t !== 'complete');
  const siblingEdition = candidates.slice(1).some((c) => sameBook(c) && c.score >= 0.5 && c.editionWords.join() !== best.editionWords.join());
  const editionUncertain = (!spineEdition && siblingEdition) || best.reasons.includes('edition may differ');
  const strength: MatchStrength = best.score >= 0.85 && (margin >= 0.08 || editionUncertain) ? 'strong' : best.score >= 0.7 ? 'likely' : best.score >= 0.55 ? 'possible' : 'none';
  return { best: strength === 'none' ? null : best, strength, alternatives: candidates.slice(strength === 'none' ? 0 : 1), editionUncertain };
}
