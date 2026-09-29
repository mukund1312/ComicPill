import { useCallback, useMemo, useState } from 'react';
import { addFeedback, listFeedback, deleteFeedback, exportFeedbackText } from '../../lib/db/queries/feedback';
import type { FeedbackCategory } from '../../lib/types/domain';

export function useFeedback() {
  const [tick, setTick] = useState(0);
  const entries = useMemo(() => listFeedback(), [tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const submit = useCallback((category: FeedbackCategory, message: string, screen: string | null = null) => {
    const trimmed = message.trim();
    if (!trimmed) return null;
    const entry = addFeedback(category, trimmed, screen);
    refresh();
    return entry;
  }, [refresh]);

  const remove = useCallback((id: string) => { deleteFeedback(id); refresh(); }, [refresh]);
  const exportText = useCallback(() => exportFeedbackText(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return { entries, submit, remove, exportText };
}
