import { ARC_TEMPLATES } from '../../engines/arc/templates';
import { buildCharacterTemplates } from '../../engines/arc/generated';
import { loadAllWorkContexts } from './library';

/** Add a journey for every character the catalog has enough books for. Call once the database is ready. Hand-written journeys always win. */
export function registerGeneratedArcTemplates(): number {
  const handWritten = Object.values(ARC_TEMPLATES).filter((t) => !t.key.startsWith('auto-'));
  const taken = handWritten.flatMap((t) => [t.character, ...(t.aliases ?? [])]);
  const built = buildCharacterTemplates(
    loadAllWorkContexts().map((ctx) => ({ id: ctx.work.id, title: ctx.work.title, characters: ctx.work.characters, keeper: ctx.work.keeperFlag })),
    taken,
  );
  for (const t of built) ARC_TEMPLATES[t.key] = t;
  return built.length;
}
