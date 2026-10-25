import { describe, expect, it } from 'vitest';
import { externalFromWork, lengthTag, mediumOf, relationFromEdge, tagsFromWork, type CatalogEdge, type CatalogWork } from './catalogBridge';
import { orderOf } from './remote/types';

const work = (over: Partial<CatalogWork> = {}): CatalogWork => ({ id: 'w1', title: 'Saga, Vol. 1', publisher: 'Image', genres: ['Sci-Fi', 'Fantasy'], creators: ['Brian K. Vaughan'], fingerprint: { tone: 0.5, pace: 0.7, complexity: 0.7, violence: 0.3, mystery: 0.2, artForward: 0.7, commitment: 0.8 }, completeness: 'ongoing', summary: 's', coverPath: null, ...over });
const titles = new Map([['w1', { title: 'Saga, Vol. 1' }], ['w2', { title: 'Saga, Vol. 2' }], ['w0', { title: 'Prologue' }]]);
const edge = (over: Partial<CatalogEdge>): CatalogEdge => ({ fromWork: 'w1', toWork: 'w2', type: 'direct_sequel', strength: 'required', confirmed: true, ...over });

describe('catalog → Mind Space tags', () => {
  it('turns decisive fingerprint values into tone, art and length tags', () => {
    const { tags, artDriven } = tagsFromWork(work());
    expect(tags.genre).toEqual(['sci-fi', 'fantasy']);
    expect(tags.creator).toEqual(['brian k. vaughan']);
    expect(tags.tone).toEqual(['fast-paced', 'dense']);
    expect(tags.art).toEqual(['art-forward']);
    expect(tags.length).toEqual(['epic']);
    expect(artDriven).toBe(true);
  });
  it('stays quiet when the fingerprint is missing or middling', () => {
    const { tags, artDriven } = tagsFromWork(work({ fingerprint: null }));
    expect(tags.tone).toEqual([]); expect(tags.art).toEqual([]); expect(tags.length).toEqual([]); expect(artDriven).toBe(false);
    expect(tagsFromWork(work({ fingerprint: { tone: 0.5, pace: 0.5, artForward: 0.5, commitment: 0.5 } })).tags.art).toEqual([]);
  });
  it('knows manga publishers and run lengths', () => {
    expect([mediumOf('Viz Media'), mediumOf('Image'), mediumOf(null)]).toEqual(['manga', 'comic', 'comic']);
    expect([lengthTag(0), lengthTag(3), lengthTag(12), lengthTag(40), lengthTag(200)]).toEqual(['', 'short', 'medium', 'long', 'epic']);
  });
});

describe('catalog edges → reading order', () => {
  it('a direct sequel is Required, and the order follows the edge', () => {
    const after = relationFromEdge(edge({}), 'w1', titles)!; // w1 is before w2
    expect(after).toMatchObject({ kind: 'sequel', importance: 'required', confidence: 'verified', externalId: 'w2', direction: 'after' });
    expect(orderOf('w1', after)).toEqual({ before: 'w1', after: 'w2' });
    const before = relationFromEdge(edge({}), 'w2', titles)!; // seen from w2
    expect(before).toMatchObject({ kind: 'prequel', externalId: 'w1', direction: 'before' });
    expect(orderOf('w2', before)).toEqual({ before: 'w1', after: 'w2' });
  });
  it('maps strengths: useful context is Helpful, tie-ins are Optional, and unconfirmed means AI-suggested', () => {
    expect(relationFromEdge(edge({ type: 'required_context', strength: 'useful_context' }), 'w1', titles)).toMatchObject({ importance: 'helpful' });
    expect(relationFromEdge(edge({ type: 'optional_context', strength: 'tie_in' }), 'w1', titles)).toMatchObject({ importance: 'optional' });
    expect(relationFromEdge(edge({ confirmed: false, type: 'same_run', strength: 'strongly_recommended' }), 'w1', titles)).toMatchObject({ importance: 'helpful', confidence: 'ai_suggested' });
  });
  it('ignores edges that do not touch the book', () => {
    expect(relationFromEdge(edge({ fromWork: 'x', toWork: 'y' }), 'w1', titles)).toBeNull();
  });
  it('hydrates a whole work', () => {
    const s = externalFromWork(work(), [edge({}), edge({ fromWork: 'w0', toWork: 'w1', strength: 'strongly_recommended', type: 'same_run' })], titles);
    expect(s).toMatchObject({ source: 'local', externalId: 'w1', medium: 'comic', status: 'ongoing' });
    expect(s.relations.map((r) => [r.externalId, r.importance])).toEqual([['w2', 'required'], ['w0', 'helpful']]);
    expect(s.hints?.artDriven).toBe(true);
  });
});
