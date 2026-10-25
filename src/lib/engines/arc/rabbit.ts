// Rabbit holes: curiosity the reader wants to keep without derailing what
// they are reading. Saving one changes nothing about their current journey.
export const normalizeTopic = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const isSameTopic = (a: string, b: string) => normalizeTopic(a) === normalizeTopic(b) && normalizeTopic(a) !== '';
