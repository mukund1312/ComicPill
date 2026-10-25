// "Not quite": when the reader disagrees with a verdict, the app asks which INPUT was wrong — and remembers the fix.
import { useState } from 'react';
import { ActionSheet, PromptModal, type SheetOption } from '../reader/dialogs';
import { WRONG_INPUT_LABEL, type VerdictOverrides, type WrongInput } from '../../lib/mind/engine/verdictRules';
import type { SeriesRow } from '../../lib/mind/model';
import { getVerdictOverrides, saveVerdictOverrides, setOverride } from '../../lib/mind/queries';

type Step = { kind: 'sheet'; title: string; options: SheetOption[] } | { kind: 'score' } | null;

export function useNotQuite(onDone: () => void) {
  const [series, setSeries] = useState<SeriesRow | null>(null);
  const [step, setStep] = useState<Step>(null);

  const save = (s: SeriesRow, patch: VerdictOverrides) => { saveVerdictOverrides(s.id, { ...(getVerdictOverrides(s.id) ?? {}), ...patch }); onDone(); };

  const choose = (s: SeriesRow, wrong: WrongInput) => {
    if (wrong === 'score') { setStep({ kind: 'score' }); return; }
    if (wrong === 'art') { save(s, { artDriven: !((getVerdictOverrides(s.id) as VerdictOverrides | undefined)?.artDriven ?? s.artDriven) }); return; }
    if (wrong === 'run') {
      setStep({ kind: 'sheet', title: 'It is…', options: [
        { label: 'Finished', onPress: () => save(s, { runStatus: 'finished' }) }, { label: 'Ongoing', onPress: () => save(s, { runStatus: 'ongoing' }) },
      ] });
      return;
    }
    setStep({ kind: 'sheet', title: 'In print?', options: [
      { label: 'In print', onPress: () => save(s, { print: 'in_print' }) }, { label: 'Out of print', onPress: () => save(s, { print: 'out_of_print' }) }, { label: 'Only digital', onPress: () => save(s, { print: 'digital_only' }) },
    ] });
  };

  const open = (s: SeriesRow) => {
    setSeries(s);
    setStep({ kind: 'sheet', title: 'Which part was wrong?', options: (Object.keys(WRONG_INPUT_LABEL) as WrongInput[]).map((w) => ({ label: WRONG_INPUT_LABEL[w], onPress: () => choose(s, w) })) });
  };

  const sheets = (
    <>
      <ActionSheet visible={step?.kind === 'sheet'} title={step?.kind === 'sheet' ? step.title : undefined} options={step?.kind === 'sheet' ? step.options : []} onClose={() => setStep((cur) => (cur?.kind === 'sheet' ? null : cur))} />
      <PromptModal visible={step?.kind === 'score'} title="Your score for it (0–100)" placeholder="e.g. 85" submitLabel="Set score"
        onSubmit={(v) => { const n = Number.parseInt(v, 10); if (series && Number.isFinite(n)) { setOverride(series.id, Math.max(0, Math.min(100, n))); onDone(); } }}
        onClose={() => setStep(null)} />
    </>
  );
  return { open, sheets };
}
