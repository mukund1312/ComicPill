// The privacy gate. Runs on the phone, on text ML Kit already read from a screenshot, BEFORE anything is
// uploaded. A screenshot album can hold bank messages, chats and one-time codes: those are dropped hard,
// and only screenshots that look comic-related are even offered for sending.
export type Gate = 'likely' | 'maybe' | 'skip' | 'sensitive';
export type GateResult = { gate: Gate; reason: string };

// Anything that smells like money, codes, credentials or contact details never goes anywhere.
const SENSITIVE: RegExp[] = [
  /\b(otp|one[- ]?time (password|passcode|code)|verification code|security code|passcode|cvv)\b/i,
  /\b(password|passwd|pin)\b/i,
  /\b(debited|credited|a\/c|acct\.?|account (no|number)|upi|ifsc|neft|imps|available balance|bank)\b/i,
  /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}\b/, // card numbers
  /\b(\+?\d{1,3}[ -]?)?\d{10}\b/, // phone-number-shaped
  /\b[\w.+-]+@[\w-]+\.[\w.]+\b/, // email addresses
  /\b(aadhaar|ssn|passport)\b/i,
];

const STRONG = /\b(comics?|manga|manhwa|manhua|webtoons?|graphic novels?|tpb|omnibus|hardcover|issues?|vol(?:ume)?\.?\s*\d+|chapters?|#\s?\d{1,4}|marvel|dc comics|image comics|dark horse|viz media|kodansha|shueisha|boom! studios|idw|fantagraphics|shonen|seinen|shojo|josei|volume|variant cover|first issue|new series|reading list|read order|must[- ]reads?)\b/gi;
const WEAK = /\b(writer|artist|penciler|inker|colorist|series|trade paperback|release|pre-?order|recommend|review|arc|saga|origin|storyline)\b/gi;

/** Phone chrome — status bar, quick settings, system dialogs — is never a cover, however short. */
const UI_NOISE = /\b(battery|wi-?fi|bluetooth|airplane|settings|notifications?|brightness|do not disturb|hotspot|storage|network|charging|cancel|allow|deny|ok|permissions?|update available)\b/i;

export function gateScreenshot(text: string): GateResult {
  const t = text.trim();
  if (t.length < 3) return { gate: 'skip', reason: 'No readable text.' };
  for (const re of SENSITIVE) if (re.test(t)) return { gate: 'sensitive', reason: 'Looks private (codes, money, contacts). Never sent.' };
  const strong = new Set((t.match(STRONG) ?? []).map((m) => m.toLowerCase().replace(/\s+/g, ' '))).size;
  const weak = new Set((t.match(WEAK) ?? []).map((m) => m.toLowerCase())).size;
  if (strong >= 2 || (strong >= 1 && weak >= 1)) return { gate: 'likely', reason: 'Mentions comics.' };
  if (strong === 1) return { gate: 'maybe', reason: 'Might be about a comic.' };
  // A cover often reads as just a few big words: short, title-like text is worth the reader's eye.
  const words = t.split(/\s+/).filter(Boolean);
  if (UI_NOISE.test(t) || words.some((w) => /\d/.test(w))) return { gate: 'skip', reason: 'Looks like phone screens or numbers, not a comic.' };
  const mostlyWords = words.filter((w) => /^[A-Za-z][A-Za-z'’:!?.-]*$/.test(w)).length / Math.max(1, words.length) > 0.7;
  if (words.length <= 10 && mostlyWords) return { gate: 'maybe', reason: 'Short title-like text, could be a cover.' };
  return { gate: 'skip', reason: 'Nothing comic-related in the text.' };
}
