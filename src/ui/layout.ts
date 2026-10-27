import { useWindowDimensions } from 'react-native';
import { layoutFor, type Layout } from '../lib/util/layout';
import { useSidebar } from '../lib/state/sidebar';

export { RAIL_WIDTH, type Layout } from '../lib/util/layout';

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const open = useSidebar((st) => st.open);
  return layoutFor(width, height, open);
}
