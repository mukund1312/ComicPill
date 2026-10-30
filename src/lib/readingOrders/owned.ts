import { sqlite } from '../db/client';
import { addToPlaylist, createPlaylist } from '../db/queries/playlists';
import { progressFor, type OrderProgress } from './match';
import type { ReadingOrder } from './types';

type OwnedWork = { id: string; title: string };

/** Every comic in My Collection that you actually have (owned on paper or as a file; wishlist and ordered ones don't count). */
export const ownedWorks = (): OwnedWork[] =>
  sqlite.getAllSync<OwnedWork>("SELECT w.id AS id, w.title AS title FROM works w JOIN user_library l ON l.work_id = w.id WHERE l.own IN ('physical', 'digital', 'both', 'subscription')");

export type OrderView = OrderProgress & { /** Work ids of the owned entries, in reading order. */ workIds: Map<string, string> };

/** A reading order laid against what is in My Collection now. */
export function viewOrder(order: ReadingOrder, owned: OwnedWork[] = ownedWorks()): OrderView {
  const progress = progressFor(order, owned.map((w) => w.title));
  const idByTitle = new Map(owned.map((w) => [w.title, w.id]));
  const workIds = new Map<string, string>();
  for (const e of progress.entries) if (e.ownedAs && idByTitle.has(e.ownedAs)) workIds.set(e.entry.title, idByTitle.get(e.ownedAs) as string);
  return { ...progress, workIds };
}

/** A playlist of the comics you have from this order, in reading order. Returns its id and how many went in. */
export function makePlaylistFrom(view: OrderView, opts: { essentialOnly?: boolean } = {}): { id: string; added: number } {
  const p = createPlaylist(opts.essentialOnly ? `${view.order.title}: essentials` : view.order.title, 'app', `reading-order:${view.order.id}`);
  let added = 0;
  for (const e of view.entries) {
    if (!e.owned || (opts.essentialOnly && e.entry.role !== 'essential')) continue;
    const id = view.workIds.get(e.entry.title);
    if (id) { addToPlaylist(p.id, id); added++; }
  }
  return { id: p.id, added };
}
