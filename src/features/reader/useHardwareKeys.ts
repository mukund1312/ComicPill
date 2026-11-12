import { useEffect, useRef } from 'react';
import { optionalNative } from '../../lib/reader/nativeArchive';

export type HardwareKey = 'volume_up' | 'volume_down' | 'left' | 'right';

/**
 * While `active`, the volume keys and a keyboard's left/right arrows are delivered to `onKey` (one call per press, repeats already removed on
 * the native side) and kept away from the system, so the media volume does not move. They go back to the system as soon as this stops being
 * active or the reader unmounts. Android only; elsewhere, or where the platform refuses, nothing happens and the keys behave normally.
 */
export function useHardwareKeys(active: boolean, onKey: (key: HardwareKey) => void) {
  const handler = useRef(onKey);
  useEffect(() => { handler.current = onKey; });
  useEffect(() => {
    const native = optionalNative();
    if (!active || !native?.captureKeys || !native.addListener) return;
    const sub = native.addListener('onHardwareKey', (e) => handler.current(e.key));
    native.captureKeys(true);
    return () => { sub.remove(); native.captureKeys?.(false); };
  }, [active]);
}
