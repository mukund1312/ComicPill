// Where feedback goes. Shown in Help & feedback; the Play Store listing and privacy policy should use the same address.
export const SUPPORT_EMAIL = 'mukund.umashankar@gmail.com';

/** A `mailto:` link with the subject and body filled in (each part encoded, so line breaks and symbols survive). */
export function mailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
