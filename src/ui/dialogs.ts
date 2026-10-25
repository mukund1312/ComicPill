// Native confirmation dialogs as promises, so screen code reads top to bottom.
import { Alert } from 'react-native';

/** Resolves true only if the reader taps the confirm button. */
export function confirm(opts: { title: string; message: string; confirmLabel: string; destructive?: boolean; cancelLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: opts.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: opts.confirmLabel, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function notice(title: string, message: string): void {
  Alert.alert(title, message);
}
