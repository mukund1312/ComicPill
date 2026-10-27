import { Dimensions, Platform } from 'react-native';

/** What the app calls this device: iPad, iPhone, tablet or phone. */
export function deviceName(): 'iPad' | 'iPhone' | 'tablet' | 'phone' {
  if (Platform.OS === 'ios') return Platform.isPad ? 'iPad' : 'iPhone';
  const { width, height } = Dimensions.get('window');
  return Math.min(width, height) >= 600 ? 'tablet' : 'phone';
}

/** The name of the shelf of files kept on this device, the way iOS Files says it: “On My iPad”. */
export const onMyDevice = (): string => { const n = deviceName(); return `On My ${n[0].toUpperCase()}${n.slice(1)}`; };

export const deviceIcon = (): 'phone-portrait-outline' | 'tablet-portrait-outline' => { const n = deviceName(); return n === 'iPad' || n === 'tablet' ? 'tablet-portrait-outline' : 'phone-portrait-outline'; };
