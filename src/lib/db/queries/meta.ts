import { eq } from 'drizzle-orm';
import { db } from '../client';
import { appMeta } from '../schema';

export function getMeta(key: string): string | null {
  return db.select().from(appMeta).where(eq(appMeta.key, key)).get()?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  db.insert(appMeta).values({ key, value }).onConflictDoUpdate({ target: appMeta.key, set: { value } }).run();
}

export const DEV_SHELF_KEY = 'dev_shelf_claimed';
