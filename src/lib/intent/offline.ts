// Degraded-mode interpreter: used only when the model endpoint is not
// configured or unreachable. It matches WORDING against the app's own
// journey vocabulary, so it catches the obvious parts of a request but does
// not truly understand it — which is why it always reports that in
// `confidence.low` and the UI can say so. The model is the primary reader.
import { ARC_TEMPLATES } from '../engines/arc/templates';
import type { ArcTemplate } from '../engines/arc/types';
import { norm, templateKeywords } from './resolve';
import { parseReadingIntent } from './validate';
import type { JOURNEY_KINDS, ReadingIntent } from './schema';

const titleCase = (s: string) => s.trim().replace(/\b\w/g, (c) => c.toUpperCase());

function currentReading(text: string): ReadingIntent['currentReading'] {
  const m = /\b(?:i am|i'm|im|currently)\s+(?:currently\s+)?reading\s+(.+?)(?=[.,;!?\n]|\s+(?:and|but|it|its|it's)\b|$)/i.exec(text);
  if (!m) return null;
  const work = m[1].replace(/^(the)\s+/i, '').trim();
  if (!work) return null;
  let sentiment: 'positive' | 'neutral' | 'negative' | null = null;
  if (/(going (good|great|well)|enjoying|loving|really good|it'?s (good|great)|liking it)/i.test(text)) sentiment = 'positive';
  else if (/(bored|hate|not enjoying|dropping|dnf|not for me)/i.test(text)) sentiment = 'negative';
  const stopping = /(dropping|dropped|dnf|stopped reading|giving up)/i.test(text);
  return { work, sentiment, continueReading: !stopping };
}

function friction(text: string): ReadingIntent['friction'] {
  if (!/(don'?t know|do not know|lots of characters|many characters|unfamiliar|new characters|who (is|are))/i.test(text)) return null;
  const harmless = /(not really a problem|not a problem|no problem|doesn'?t bother|not an issue|it'?s fine|that'?s fine)/i.test(text);
  const examples: string[] = [];
  const ex = /\blike\s+((?:[A-Z][\w'-]*)(?:\s+[A-Z][\w'-]*)*)/.exec(text);
  if (ex) examples.push(ex[1]);
  return { type: 'unfamiliar_characters', severity: harmless ? 'low' : 'medium', examples };
}

function pickTemplate(nText: string, templates: ArcTemplate[]) {
  let best: { t: ArcTemplate; hits: { k: string; at: number }[] } | null = null;
  for (const t of templates) {
    const hits = templateKeywords(t)
      .map((k) => ({ k: k.trim(), at: nText.indexOf(k) }))
      .filter((h) => h.at >= 0);
    if (hits.length && (!best || hits.length > best.hits.length)) best = { t, hits };
  }
  return best;
}

export function interpretOffline(text: string, templates: ArcTemplate[] = Object.values(ARC_TEMPLATES)): ReadingIntent {
  const nText = norm(text);
  const reading = currentReading(text);
  const fr = friction(text);
  const picked = pickTemplate(nText, templates);

  const hasCharacter = picked ? nText.includes(norm(picked.t.character)) : false;
  // Aliases that read like a book title ("Batman and Son(s)") are title
  // references, not story beats — keep them out of the focus list.
  const titleAliasNorms = new Set((picked?.t.aliases ?? []).filter((a) => /\b(and|&)\s+sons?\b/i.test(a)).map(norm));
  const kwHits = picked
    ? [...picked.hits].sort((a, b) => a.at - b.at).filter((h) => !titleAliasNorms.has(norm(h.k))).map((h) => titleCase(h.k)).filter((k, i, a) => a.indexOf(k) === i)
    : [];
  const wantsOrigin = /\borigin/i.test(text);
  const focus = picked ? [...(wantsOrigin && hasCharacter ? [`${picked.t.character} origin`] : []), ...kwHits.filter((k) => norm(k) !== norm(picked.t.character))] : [];

  const kinds: (typeof JOURNEY_KINDS)[number][] = [];
  if (picked) {
    kinds.push('character_life_arc');
    if (/(family|sons?|robins?|bat-?family)/i.test(text)) kinds.push('family_arc');
    if (/(legacy|end of|ending|endgame|final)/i.test(text)) kinds.push('legacy_arc');
  }

  const titleReferences: { text: string; interpretation: 'title' | 'intent' | 'both' }[] = [];
  if (picked) {
    for (const alias of picked.t.aliases ?? []) {
      if (nText.includes(norm(alias)) && /\b(and|&)\s+sons?\b/i.test(alias)) {
        titleReferences.push({ text: alias, interpretation: focus.length >= 2 ? 'both' : 'title' });
        break;
      }
    }
  }

  let depth: ReadingIntent['depth'] = null;
  if (/(completionist|deep dive|every single)/i.test(text)) depth = 'completionist';
  else if (/(essentials? only|just the essentials|short version|main story only)/i.test(text)) depth = 'essential';

  const finished = /\b(?:i(?:'ve| have)?(?: just)?|just)\s+finished\s+(?:reading\s+)?(.+?)(?=[.,;!?\n]|\s+(?:and|but)\b|$)/i.exec(text);
  const proposed: ReadingIntent['proposedLibraryUpdates'] = finished
    ? [{ work: finished[1].trim(), action: 'mark_finished' }]
    : reading && reading.continueReading ? [{ work: reading.work, action: 'mark_reading' }] : [];

  const high: string[] = [];
  const medium: string[] = [];
  const low: string[] = ['Read by matching words, not by understanding the request.'];
  if (reading) high.push(`Currently reading ${reading.work}`);
  if (picked && hasCharacter) high.push(`Wants a ${picked.t.character} journey`);
  if (focus.length) medium.push(`Mentioned: ${focus.join(', ')}`);
  if (/(end of|ending|endgame)/i.test(text)) low.push('"End of the story" could mean several different endings.');

  const intent = parseReadingIntent({
    currentReading: reading,
    friction: fr,
    newGoal: picked
      ? { character: hasCharacter ? picked.t.character : null, journeyKinds: kinds, focus, titleReferences }
      : null,
    depth,
    spoilerPreference: /spoil me|full spoilers/i.test(text) ? 'full' : 'minimal',
    ownershipAware: true,
    implicitFeedback: reading?.sentiment ? [{ work: reading.work, sentiment: reading.sentiment, confidence: 'medium' }] : [],
    proposedLibraryUpdates: proposed,
    confidence: { high, medium, low },
    clarifyingQuestion: null,
  });
  // The object above is built to satisfy the schema; a null here is a bug in
  // this file, not bad input.
  if (!intent) throw new Error('interpretOffline produced an invalid ReadingIntent');
  return intent;
}
