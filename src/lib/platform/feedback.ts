import * as Haptics from 'expo-haptics';
import { useSettings } from '../state/settings';
import { createFeedback } from './feedbackCore';

/** App-wide haptics. Every call checks the reader's setting at the moment it fires. */
export const feedback = createFeedback(() => useSettings.getState().haptics, {
  impact: (weight) => Haptics.impactAsync(weight === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium),
  select: () => Haptics.selectionAsync(),
  notify: (type) => Haptics.notificationAsync(type === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning),
});
