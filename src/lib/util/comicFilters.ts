// Shared Publisher/Creator/Character filtering for Library and Discover —
// one matcher so both screens agree on what "filtered" means. Publisher is
// a closed set (chip-select); creator/character are free-text substring
// matches, since a full catalog's worth of distinct names is too many to
// enumerate as chips.
export type PublisherFilter = 'Marvel' | 'DC' | 'Indie' | 'Manga' | null;

export interface ComicFilters {
  publisher: PublisherFilter;
  creator: string;
  character: string;
}

export const EMPTY_COMIC_FILTERS: ComicFilters = { publisher: null, creator: '', character: '' };

export function hasActiveFilters(filters: ComicFilters): boolean {
  return filters.publisher !== null || filters.creator.trim() !== '' || filters.character.trim() !== '';
}

export interface FilterableComic {
  publisher: string | null;
  creators: string[];
  characters: string[];
}

export function matchesFilters(item: FilterableComic, filters: ComicFilters): boolean {
  if (filters.publisher && item.publisher !== filters.publisher) return false;

  const creatorQuery = filters.creator.trim().toLowerCase();
  if (creatorQuery && !item.creators.some((c) => c.toLowerCase().includes(creatorQuery))) return false;

  const characterQuery = filters.character.trim().toLowerCase();
  if (characterQuery && !item.characters.some((c) => c.toLowerCase().includes(characterQuery))) return false;

  return true;
}
