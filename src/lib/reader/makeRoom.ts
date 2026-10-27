// Deciding what to put away so a comic you are opening fits in the space the reader gave ready comics. Pure, so it is testable.
export type ReadyComic = { id: string; title: string; bytes: number; lastReadAt: number };

export type RoomPlan = {
  /** What ready comics take now. */
  used: number;
  /** How far over the budget opening this comic would take things; 0 or less means it fits. */
  over: number;
  /** The least recently read comics that, put away, make it fit. */
  suggested: string[];
  /** False when even putting every other comic away would not be enough (the comic is bigger than the budget). */
  possible: boolean;
};

export function planRoom(ready: ReadyComic[], budget: number, need: number): RoomPlan {
  const used = ready.reduce((n, c) => n + c.bytes, 0);
  const over = used + need - budget;
  const suggested: string[] = [];
  let freed = 0;
  if (over > 0) for (const c of [...ready].sort((a, b) => a.lastReadAt - b.lastReadAt)) {
    if (freed >= over) break;
    suggested.push(c.id); freed += c.bytes;
  }
  return { used, over, suggested, possible: need <= budget };
}

/** Not enough free space on the device to fetch `need` bytes and still leave `reserve` bytes for the system. */
export const isLowOnSpace = (available: number, need: number, reserve: number): boolean => available - need < reserve;
