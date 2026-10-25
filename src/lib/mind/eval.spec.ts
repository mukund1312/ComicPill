// Phase 1's "done when": at least 80% of your own test screenshots give the right title, and the rest land in
// Needs your eye rather than being wrong silently. This needs YOUR screenshots and YOUR key, so it only runs when asked:
//
//   MIND_EVAL_DIR=/path/to/screens ANTHROPIC_API_KEY=sk-ant-... npx vitest run src/lib/mind/eval.spec.ts
//
// The folder holds the images plus an `expected.json`: { "reel1.png": "Saga", "cover2.jpg": "Berserk", ... }
// (a value of null means "no comic in this one"). Each image is sent exactly as the app would send it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractCaptures, isReadable } from './remote/extract';
import { titleScore } from '../scan/match';

const dir = process.env.MIND_EVAL_DIR; const key = process.env.ANTHROPIC_API_KEY;
const ready = !!dir && !!key && existsSync(join(dir, 'expected.json'));

describe.skipIf(!ready)('screenshot reading accuracy (your test set)', () => {
  it('reads at least 80% correctly, and never silently wrong', { timeout: 20 * 60_000 }, async () => {
    const expected = JSON.parse(readFileSync(join(dir!, 'expected.json'), 'utf8')) as Record<string, string | null>;
    let right = 0; let flagged = 0; let silentlyWrong = 0; const lines: string[] = [];
    for (const [file, want] of Object.entries(expected)) {
      const b64 = readFileSync(join(dir!, file)).toString('base64');
      const res = await extractCaptures({ provider: 'anthropic', model: process.env.MIND_EVAL_MODEL ?? 'claude-sonnet-5-5', apiKey: key! }, b64, '');
      const got = res.ok ? res.data!.candidates : [];
      const top = got[0];
      const correct = want === null ? got.length === 0 : !!top && titleScore(top.title, null, want) >= 0.8;
      const unsure = want !== null && (!top || !isReadable(top));
      if (correct && !unsure) right++; else if (unsure || (want !== null && !top)) flagged++; else silentlyWrong++;
      lines.push(`${correct && !unsure ? 'OK   ' : unsure ? 'EYE  ' : 'WRONG'} ${file}: wanted ${want ?? '(nothing)'}, got ${top ? `${top.title} [${top.titleConfidence}]` : '(nothing)'}`);
    }
    const total = Object.keys(expected).length;
    console.log(`\n${lines.join('\n')}\n\nright ${right}/${total} (${Math.round((right / total) * 100)}%), Needs-your-eye ${flagged}, silently wrong ${silentlyWrong}`);
    expect(right / total).toBeGreaterThanOrEqual(0.8);
    expect(silentlyWrong).toBe(0);
  });
});
