import { PER_ROW_CHOICES, setPerRow, usePerRow } from '../../ui/gridColumns';
import { ActionSheet } from './dialogs';

/** “How many comics in a row”, shared by every cover grid in the app. */
export function PerRowSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const perRow = usePerRow();
  return (
    <ActionSheet visible={visible} title="Comics per row" onClose={onClose} options={[
      { label: 'Automatic', checked: perRow === 0, onPress: () => setPerRow(0) },
      ...PER_ROW_CHOICES.map((n) => ({ label: n === 1 ? '1 per row' : `${n} per row`, checked: perRow === n, onPress: () => setPerRow(n) })),
    ]} />
  );
}
