import { useLocalSearchParams } from 'expo-router';
import MindScreen, { type MindTab } from '../../src/features/mind/MindScreen';

const TABS: MindTab[] = ['digest', 'inbox', 'library', 'taste'];

// A link or notification can ask for a tab (?tab=inbox). Keying on it remounts the screen on that tab, even if it was already open.
export default function MindRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const wanted = TABS.find((t) => t === tab);
  return <MindScreen key={wanted ?? 'default'} initialTab={wanted} />;
}
