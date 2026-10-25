// Typed, strength-tagged story edges behind the Batman life-arc. These say
// WHY two books belong together (a character arrives, changes identity,
// inherits a mantle), which is what lets the arc builder explain itself
// instead of just numbering a list. Continuity-crossing links are explicit
// (`possible_future`) — a future Bruce is never chained onto the main
// timeline as though it were the next chapter.
import type { CatalogEdge } from './catalog';

const e = (
  fromWork: string, toWork: string, type: CatalogEdge['type'], strength: NonNullable<CatalogEdge['strength']>,
): CatalogEdge => ({ fromWork, toWork, type, strength, confirmed: true });

export const BATMAN_ARC_EDGES: CatalogEdge[] = [
  e('year-one', 'long-halloween', 'direct_sequel', 'useful_context'),
  e('long-halloween', 'dark-victory', 'direct_sequel', 'strongly_recommended'),
  e('dark-victory', 'robin-year-one', 'character_introduction', 'useful_context'),
  e('robin-year-one', 'nightwing-year-one', 'character_transformation', 'optional'),
  e('arc-batman-second-chances', 'death-in-family', 'character_introduction', 'useful_context'),
  e('death-in-family', 'under-red-hood', 'character_transformation', 'strongly_recommended'),
  e('under-red-hood', 'arc-red-hood-lost-days', 'optional_context', 'optional'),
  e('death-in-family', 'arc-batman-lonely-place-of-dying', 'legacy_succession', 'useful_context'),
  e('arc-batman-lonely-place-of-dying', 'arc-red-robin-the-grail', 'character_transformation', 'optional'),
  e('arc-batman-and-son', 'arc-batman-rip', 'direct_sequel', 'strongly_recommended'),
  e('arc-batman-rip', 'dc-800-batman-battle-for-the-cowl', 'event_connection', 'strongly_recommended'),
  e('dc-800-batman-battle-for-the-cowl', 'batman-robin-reborn', 'legacy_succession', 'strongly_recommended'),
  e('batman-robin-reborn', 'arc-batman-robin-vs-robin', 'direct_sequel', 'useful_context'),
  e('dc-800-batman-the-return-of-bruce-wayne', 'dc-800-batman-incorporated-vol-1', 'direct_sequel', 'useful_context'),
  e('year-one', 'dark-knight-returns', 'possible_future', 'optional'),
  e('dark-knight-returns', 'dc-800-batman-the-dark-knight-strikes-again', 'direct_sequel', 'optional'),
];
