import { Image } from 'expo-image';
import type { ImageSource } from 'expo-image';

// The four themes are ComicPill's own; none carries a character portrait (the old hero and villain themes did).
const portraits: Record<string, ImageSource> = {};

/** The user-selected character portrait. ComicPill Default intentionally has no character. */
export function ThemeEmblem({ id, size = 52 }: { id: string; size?: number }) {
  const source = portraits[id];
  if (!source) return null;

  return <Image
    accessible
    accessibilityLabel={`${id} theme portrait`}
    contentFit="contain"
    source={source}
    style={{ width: size, height: size }}
  />;
}
