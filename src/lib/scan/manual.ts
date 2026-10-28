// Adding a comic by hand: what may be typed, what is required, and tidying it up. Only the title is required; everything else can be added later.
export const PRINTINGS = [
  { key: 'single_issue', label: 'Single issue' }, { key: 'trade_paperback', label: 'Paperback' }, { key: 'hardcover', label: 'Hardcover' },
  { key: 'deluxe', label: 'Deluxe' }, { key: 'omnibus', label: 'Omnibus' }, { key: 'absolute', label: 'Absolute' }, { key: 'compact', label: 'Compact' },
] as const;
export type Printing = (typeof PRINTINGS)[number]['key'];

export type ManualInput = {
  title: string; series?: string; volume?: string; publisher?: string; writer?: string; artist?: string;
  year?: string; printing?: Printing; format?: 'physical' | 'digital'; isbn?: string; pages?: string;
};
export type ManualComic = {
  title: string; series: string | null; volume: string | null; publisher: string | null; creators: string[];
  year: number | null; printing: Printing; format: 'physical' | 'digital'; isbn13: string | null; pages: number | null;
};
export type ManualResult = { ok: true; value: ManualComic } | { ok: false; errors: Partial<Record<keyof ManualInput, string>> };

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const orNull = (s: string | undefined) => clean(s) || null;

/** A valid ISBN-13 from what was typed (hyphens and spaces allowed; an ISBN-10 is converted), or null. */
export function normalizeIsbn(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{13}$/.test(digits)) {
    const sum = [...digits].slice(0, 12).reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === Number(digits[12]) ? digits : null;
  }
  if (/^\d{9}[\dX]$/.test(digits)) {
    const sum = [...digits].reduce((n, d, i) => n + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
    if (sum % 11 !== 0) return null;
    const core = `978${digits.slice(0, 9)}`;
    const check = (10 - ([...core].reduce((n, d, i) => n + Number(d) * (i % 2 === 0 ? 1 : 3), 0) % 10)) % 10;
    return `${core}${check}`;
  }
  return null;
}

export function validateManual(input: ManualInput, thisYear = new Date().getFullYear()): ManualResult {
  const errors: Partial<Record<keyof ManualInput, string>> = {};
  const title = clean(input.title);
  if (title.replace(/[^\p{L}\p{N}]/gu, '').length < 2) errors.title = 'Enter the comic’s title.';
  let year: number | null = null;
  if (clean(input.year)) { year = Number(clean(input.year)); if (!Number.isInteger(year) || year < 1930 || year > thisYear + 1) errors.year = 'Enter a four-digit year.'; }
  let isbn13: string | null = null;
  if (clean(input.isbn)) { isbn13 = normalizeIsbn(clean(input.isbn)); if (!isbn13) errors.isbn = 'That doesn’t look like a valid ISBN.'; }
  let pages: number | null = null;
  if (clean(input.pages)) { pages = Number(clean(input.pages)); if (!Number.isInteger(pages) || pages < 1 || pages > 5000) errors.pages = 'Enter the number of pages.'; }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title, series: orNull(input.series), volume: orNull(input.volume), publisher: orNull(input.publisher),
      creators: [clean(input.writer), clean(input.artist)].filter(Boolean), year, printing: input.printing ?? 'trade_paperback', format: input.format ?? 'physical', isbn13, pages,
    },
  };
}
