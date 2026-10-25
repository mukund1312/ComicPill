// "page2" must sort before "page10" — plain string compare gets that wrong.
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

export function naturalSort(values: string[]): string[] {
  return [...values].sort(naturalCompare);
}
