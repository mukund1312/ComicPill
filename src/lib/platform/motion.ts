import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useSettings } from '../state/settings';

/** True when the reader asked for less motion in ComicPill OR turned on
 *  "Reduce motion" in their phone's own accessibility settings. */
export function useReducedMotion(): boolean {
  const inApp = useSettings((s) => s.reduceMotion);
  const [system, setSystem] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (alive) setSystem(v); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystem);
    return () => { alive = false; sub.remove(); };
  }, []);
  return inApp || system;
}
