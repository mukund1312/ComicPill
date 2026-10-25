// Pure helpers for comic EPUBs: container.xml → OPF → spine → the image on each page.
// Regex-based on purpose: these files are machine-generated and tiny, and a full
// XML parser would be a dependency for ~40 lines of work.
export type Manifest = Record<string, { href: string; mediaType: string }>;

const attr = (tag: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];

export function parseContainer(xml: string): string | null {
  const rootfile = /<rootfile\b[^>]*>/i.exec(xml)?.[0];
  return rootfile ? attr(rootfile, 'full-path') ?? null : null;
}

export function parseOpf(xml: string): { manifest: Manifest; spine: string[] } {
  const manifest: Manifest = {};
  for (const tag of xml.match(/<item\b[^>]*>/gi) ?? []) {
    const id = attr(tag, 'id'); const href = attr(tag, 'href');
    if (id && href) manifest[id] = { href: decodeURIComponent(href), mediaType: attr(tag, 'media-type') ?? '' };
  }
  const spine = (xml.match(/<itemref\b[^>]*>/gi) ?? []).map((t) => attr(t, 'idref')).filter((v): v is string => !!v);
  return { manifest, spine };
}

/** First image referenced by a page: <img src>, or SVG <image href / xlink:href>. */
export function findImageRef(markup: string): string | null {
  const img = /<img\b[^>]*>/i.exec(markup)?.[0];
  if (img) { const src = attr(img, 'src'); if (src) return decodeURIComponent(src); }
  const svg = /<image\b[^>]*>/i.exec(markup)?.[0];
  if (svg) { const href = attr(svg, 'xlink:href') ?? attr(svg, 'href'); if (href) return decodeURIComponent(href); }
  return null;
}

/** Resolve `href` against the directory of `base` ("OEBPS/content.opf" + "../x.png" → "x.png"). */
export function resolvePath(base: string, href: string): string {
  const out = base.split('/').slice(0, -1);
  for (const part of href.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}
