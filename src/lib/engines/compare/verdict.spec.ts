import { describe, expect, it } from 'vitest';
import { challengeWithAlternative, rankForRead } from './verdict';
import type { CompareContext, CompareWorkInput } from './dimensions';
import { emptyProfile } from '../taste/profile';
import type { Dim } from '../../types/domain';
import type { ScorableWork } from '../../types/engine-io';

const DIMENSIONS: Dim[] = ['tone', 'violence', 'scale', 'complexity', 'mystery', 'pace', 'artForward', 'commitment'];

function work(id: string, overrides: Partial<ScorableWork> = {}): ScorableWork {
  const fingerprint = {} as Record<Dim, number>;
  DIMENSIONS.forEach((d) => { fingerprint[d] = 0.5; });
  return {
    id, title: id, bucket: 'batman', universe: 'main', fingerprint, genres: [],
    creators: [], characters: [], contextNeeded: 'none', requiredParentIds: [],
    own: 'none', keeper: false, pricePaise: null, formatVerdict: 'physical',
    ...overrides,
  };
}

function candidate(overrides: Partial<CompareWorkInput> & { work: ScorableWork }): CompareWorkInput {
  return { isReady: true, blockedByTitles: [], pathStanding: 'none', ...overrides };
}

function ctx(overrides: Partial<CompareContext> = {}): CompareContext {
  return { profile: emptyProfile(), mood: null, recentFinished: [], ...overrides };
}

describe('rankForRead', () => {
  it('given the brief\'s own example, ranks the mood-matching owned book above the non-matching one', () => {
    const blackMirror = candidate({ work: work('black-mirror', { genres: ['crime'], own: 'physical' }) });
    const kingdomCome = candidate({ work: work('kingdom-come', { genres: ['mythic'], own: 'physical' }) });

    const results = rankForRead([blackMirror, kingdomCome], ctx({ mood: 'dark' }));
    const bm = results.find((r) => r.workId === 'black-mirror')!;
    const kc = results.find((r) => r.workId === 'kingdom-come')!;

    expect(bm.overallScore).toBeGreaterThan(kc.overallScore);
    expect(bm.category).toBe('read_first');
  });

  it('given a physical-owned comic, an unowned one never outranks it on availability alone', () => {
    const owned = candidate({ work: work('owned', { own: 'physical' }) });
    const unowned = candidate({ work: work('unowned', { own: 'none' }) });

    const results = rankForRead([owned, unowned], ctx());
    const ownedResult = results.find((r) => r.workId === 'owned')!;
    const unownedResult = results.find((r) => r.workId === 'unowned')!;

    expect(ownedResult.overallScore).toBeGreaterThan(unownedResult.overallScore);
    expect(ownedResult.reasons.some((r) => r.toLowerCase().includes('already own'))).toBe(true);
  });

  it('a book missing a required prerequisite is always skip_for_now, regardless of how well it otherwise fits', () => {
    const blocked = candidate({
      work: work('blocked', { own: 'physical', genres: ['crime'] }),
      isReady: false,
      blockedByTitles: ['Batman: Year One'],
    });
    const results = rankForRead([blocked], ctx({ mood: 'dark' }));
    expect(results[0].category).toBe('skip_for_now');
    expect(results[0].reasons[0]).toContain('Batman: Year One');
  });

  it('never invents fake precision — every dimension score stays within 0..1', () => {
    const c = candidate({ work: work('w', { own: 'both', genres: ['crime', 'mystery'] }) });
    const [result] = rankForRead([c], ctx({ mood: 'dark' }));
    for (const d of result.dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('challengeWithAlternative', () => {
  it('challenges when an owned book outside the compared set is clearly a better read than anything compared', () => {
    const weakA = candidate({ work: work('weak-a', { own: 'none' }) });
    const weakB = candidate({ work: work('weak-b', { own: 'none' }) });
    const results = rankForRead([weakA, weakB], ctx());

    const betterOwned = candidate({ work: work('better-owned', { own: 'both', genres: ['crime'] }), pathStanding: 'reading' });
    const challenge = challengeWithAlternative(results, betterOwned, ctx());

    expect(challenge.shouldChallenge).toBe(true);
    expect(challenge.betterAlternativeWorkId).toBe('better-owned');
  });

  it('says "none of these" only when every compared candidate is itself a skip', () => {
    const blocked = candidate({ work: work('blocked'), isReady: false });
    const results = rankForRead([blocked], ctx());
    const betterOwned = candidate({ work: work('better-owned', { own: 'both' }), pathStanding: 'reading' });

    const challenge = challengeWithAlternative(results, betterOwned, ctx());
    expect(challenge.message).toBe('None of these should be your next read.');
  });

  it('does not challenge when the alternative is only marginally better', () => {
    const inSet = candidate({ work: work('in-set', { own: 'physical' }) });
    const results = rankForRead([inSet], ctx());
    const alt = candidate({ work: work('barely-better', { own: 'physical' }) }); // same signals, no real margin

    expect(challengeWithAlternative(results, alt, ctx()).shouldChallenge).toBe(false);
  });

  it('does not challenge with an alternative that is not itself ready', () => {
    const inSet = candidate({ work: work('in-set', { own: 'none' }) });
    const results = rankForRead([inSet], ctx());
    const notReady = candidate({ work: work('blocked-alt', { own: 'both' }), isReady: false });

    expect(challengeWithAlternative(results, notReady, ctx()).shouldChallenge).toBe(false);
  });
});
