import { useWindowDimensions } from 'react-native';
import { layoutFor, type Layout } from '../lib/util/layout';

export { RAIL_WIDTH, type Layout } from '../lib/util/layout';

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return layoutFor(width, height);
}
