import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ENGINES_DIR = join(__dirname, '..');
const BANNED_IMPORTS = [
  /from ['"]react['"]/, /from ['"]react-native/, /from ['"]expo/,
  /from ['"]@supabase\//, /\/db\//, /\/api\//, /\/features\//, /\/ui\//,
];
const BANNED_CALLS = [/Date\.now\(/, /Math\.random\(/, /fetch\(/];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__') continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('engines stay pure', () => {
  const files = walk(ENGINES_DIR);
  it('found engine files to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    it(`${file.replace(ENGINES_DIR, 'engines')} has no banned imports or calls`, () => {
      for (const re of BANNED_IMPORTS) expect(src).not.toMatch(re);
      for (const re of BANNED_CALLS) expect(src).not.toMatch(re);
    });
  }
});
