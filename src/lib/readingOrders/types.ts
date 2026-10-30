/** essential: the story doesn't make sense without it. optional: worth it for context or extra story. */
export type Role = 'essential' | 'optional';

export type OrderEntry = {
  title: string;
  role: Role;
  /** Why it is here, in a few words. */
  note?: string;
  /** Any of these phrases found in a comic's title means you have it. Every word of a phrase must appear. Volume numbers match "v1", "Vol. 1" and "v01" alike. */
  match?: string[];
  /** The title (without its (year) (tags)) is exactly this: for names other titles contain, like "Civil War". */
  exact?: string[];
  /** Words that rule a title out ("infinity" must not match "Infinity Gauntlet"). */
  not?: string[];
};

export type ReadingOrder = {
  id: string;
  title: string;
  publisher: 'Marvel' | 'DC';
  year: string;
  /** What the event is, in a line. */
  blurb: string;
  /** Other names someone might type to find it. */
  aliases: string[];
  entries: OrderEntry[];
};
