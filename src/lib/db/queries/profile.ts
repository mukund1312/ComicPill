import { eq } from 'drizzle-orm';
import { db } from '../client';
import { tasteProfiles } from '../schema';
import { loadAllEvents } from './events';
import { loadAllScorableWorks } from './library';
import { recomputeProfile, ENGINE_VERSION } from '../../engines/taste/profile';
import type { TasteProfile } from '../../types/engine-io';

const ROW_ID = 1;

/** taste_profiles is a CACHE, never the source of truth — recomputed from the
 *  event log whenever it's missing or stamped with an old engine version, so
 *  bumping ENGINE_VERSION or a weight makes every device replay automatically. */
export function getProfile(now: Date): TasteProfile {
  const row = db.select().from(tasteProfiles).where(eq(tasteProfiles.id, ROW_ID)).get();
  if (row && row.engineVersion === ENGINE_VERSION) {
    return row.data as TasteProfile;
  }
  const works = loadAllScorableWorks();
  const events = loadAllEvents();
  const profile = recomputeProfile(events, works, now);
  saveProfile(profile);
  return profile;
}

export function saveProfile(profile: TasteProfile): void {
  const now = new Date().toISOString();
  const existing = db.select().from(tasteProfiles).where(eq(tasteProfiles.id, ROW_ID)).get();
  if (existing) {
    db.update(tasteProfiles).set({ engineVersion: profile.engineVersion, data: profile, updatedAt: now }).where(eq(tasteProfiles.id, ROW_ID)).run();
  } else {
    db.insert(tasteProfiles).values({ id: ROW_ID, engineVersion: profile.engineVersion, data: profile, updatedAt: now }).run();
  }
}

/** Force a full replay — call after any event write so Today always scores
 *  against the freshest profile. Cheap at hundreds of events (see the plan). */
export function invalidateProfile(now: Date): TasteProfile {
  const works = loadAllScorableWorks();
  const events = loadAllEvents();
  const profile = recomputeProfile(events, works, now);
  saveProfile(profile);
  return profile;
}
