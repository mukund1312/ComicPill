// What the daily reading reminder says. Pure, so the copy rules are tested.
export interface ReminderContent { title: string; body: string }

/** If the reader is on a journey, name the very next book — the most useful
 *  thing a reminder can say. Otherwise a plain nudge. Never guilt-trips. */
export function reminderContent(nextTitle: string | null): ReminderContent {
  return nextTitle
    ? { title: 'Tonight’s read', body: `${nextTitle} is next in your journey.` }
    : { title: 'Time for a comic?', body: 'Open ComicPill for a pick that fits tonight.' };
}
