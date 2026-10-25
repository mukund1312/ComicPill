// ComicInfo.xml (the de-facto comic metadata format from ComicRack/Anansi).
export type ComicInfo = { title?: string; series?: string; number?: string; writer?: string; year?: number; rtl?: boolean };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const code = e[1].toLowerCase() === 'x' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : m; }
    return ENTITIES[e.toLowerCase()] ?? m;
  }).trim();

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  const v = m ? decode(m[1]) : '';
  return v || undefined;
}

export function parseComicInfo(xml: string): ComicInfo {
  const year = Number.parseInt(tag(xml, 'Year') ?? '', 10);
  const manga = tag(xml, 'Manga');
  return {
    title: tag(xml, 'Title'),
    series: tag(xml, 'Series'),
    number: tag(xml, 'Number'),
    // Several roles can be credited; Writer is the one the plan searches on.
    writer: tag(xml, 'Writer'),
    year: Number.isFinite(year) ? year : undefined,
    rtl: manga ? /righttoleft/i.test(manga) : undefined,
  };
}

/** Display title: "Series #3 — Title" style, falling back to whatever exists. */
export function displayTitle(info: ComicInfo, fallback: string): string {
  const head = info.series ? `${info.series}${info.number ? ` #${info.number}` : ''}` : undefined;
  if (head && info.title) return `${head} — ${info.title}`;
  return head ?? info.title ?? fallback;
}
