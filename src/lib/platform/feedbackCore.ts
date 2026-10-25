// Haptic feedback that respects the reader's setting. The device call is
// injected so this stays testable and never throws into a press handler.
export type HapticKind = 'tap' | 'select' | 'success' | 'warning';

export interface HapticDevice {
  impact: (weight: 'light' | 'medium') => Promise<unknown>;
  select: () => Promise<unknown>;
  notify: (type: 'success' | 'warning') => Promise<unknown>;
}

export function createFeedback(isEnabled: () => boolean, device: HapticDevice) {
  const run = (fn: () => Promise<unknown>) => {
    if (!isEnabled()) return;
    try { void fn().catch(() => undefined); } catch { /* haptics are never worth a crash */ }
  };
  return {
    tap: () => run(() => device.impact('light')),
    select: () => run(() => device.select()),
    success: () => run(() => device.notify('success')),
    warning: () => run(() => device.notify('warning')),
  };
}
