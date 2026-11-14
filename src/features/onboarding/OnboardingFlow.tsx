// The whole first-run journey, resumable at any step. Stage state lives in the
// persisted onboarding store; this component only decides what to show and what
// each button does. `?mode=edit` redoes just the taste picks (from Profile).
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import { WelcomeStage } from './WelcomeStage';
import { DiscoveryStageScreen } from './PickStages';
import { ArtStage, GenreStage, TraitStage } from './CardStages';
import { ProcessingStage } from './ProcessingStage';
import { RevealStage } from './RevealStage';
import { CollectionStage } from './CollectionStage';
import { StorageStage } from './StorageStage';
import { HiddenShelfStage } from './HiddenShelfStage';
import { FirstPickStage, LibraryReadyStage } from './FinalStages';
import { useOnboarding, useOnboardingReady } from '../../lib/state/onboarding';
import { PICK_STAGES, prevStageFor, type PickKey, type Stage } from '../../lib/onboarding/flow';
import { saveOnboardingTaste, saveCollectionDraft } from '../../lib/db/queries/onboardingData';
import { notice } from '../../ui/dialogs';
import { useAppearance } from '../../ui/theme';

/** Finishing first-run goes FORWARD to Today. Going "back" would land on whatever
 *  was underneath in the stack — after sign-up, that was the sign-in screen.
 *  Only editing from Profile returns to where it came from. */
const leave = (to: '/' | '/collection' = '/', backToCaller = false) => {
  if (backToCaller && router.canGoBack()) router.back();
  else router.replace(to);
};

export default function OnboardingFlow() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const ready = useOnboardingReady();
  const { theme } = useAppearance();
  const s = useOnboarding(useShallow((st) => ({
    stage: st.stage, completed: st.completed, editing: st.editing, selections: st.selections, draft: st.draft, seed: st.seed,
    begin: st.begin, toggle: st.toggle, setFamiliarity: st.setFamiliarity, next: st.next, back: st.back,
    setDraft: st.setDraft, markTasteSetup: st.markTasteSetup, markCollectionSetup: st.markCollectionSetup, finish: st.finish,
  })));
  const [saving, setSaving] = useState(false);
  const entered = useRef(false);
  const wantsEdit = mode === 'edit';

  // On arrival: an edit request starts edit mode once; a finished reader who
  // wandered here without asking is sent back to Today.
  useEffect(() => {
    if (!ready || entered.current) return;
    entered.current = true;
    if (wantsEdit) s.begin(true);
    else if (s.completed) router.replace('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const newcomer = s.selections.familiarity === 'new';
  const progress = useMemo(() => {
    const list = PICK_STAGES.filter((p) => !(newcomer && (p === 'artists' || p === 'writers')));
    const i = list.indexOf(s.stage);
    return i < 0 ? null : { index: i, total: list.length };
  }, [s.stage, newcomer]);
  const onBack = prevStageFor(s.stage, s.editing, s.selections.familiarity) ? s.back : null;
  const toggle = (key: PickKey, id: string) => s.toggle(key, id);

  if (!ready || (s.completed && !s.editing && !wantsEdit)) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  /** Editing: write the picks, and leave. */
  const finishEdit = () => {
    try {
      saveOnboardingTaste(s.selections, new Date());
      s.markTasteSetup();
      s.finish();
      leave('/', true);
    } catch {
      notice('Couldn’t save your picks', 'Nothing was changed. Please try again.');
    }
  };

  const saveCollection = () => {
    setSaving(true);
    try {
      if (s.draft.length) saveCollectionDraft(s.draft);
      s.setDraft([]);
      s.markCollectionSetup();
      s.next();
    } catch {
      notice('Couldn’t save your comics', 'Your list is still here. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const stage: Stage = s.stage;
  switch (stage) {
    case 'welcome':
      return (
        <WelcomeStage
          onStart={s.next}
          onNewcomer={() => { s.setFamiliarity('new'); s.next(); }}
          onSkipAll={() => { s.finish(); leave(); }}
        />
      );
    case 'characters':
      return <DiscoveryStageScreen key="characters" stage="characters" listKey="characters" picks={s.selections.characters} seed={s.seed} onToggle={toggle} minPicks={newcomer ? 1 : 3} progress={progress} onBack={onBack} onNext={s.next} />;
    case 'villains':
      return <DiscoveryStageScreen key="villains" stage="villains" listKey="characters" picks={s.selections.characters} seed={s.seed} onToggle={toggle} progress={progress} onBack={onBack} onNext={s.next} />;
    case 'art':
      return <ArtStage picks={s.selections.artStyles} onToggle={toggle} progress={progress} onBack={onBack} onNext={s.next} />;
    case 'artists':
      return <DiscoveryStageScreen key="artists" stage="artists" listKey="artists" picks={s.selections.artists} seed={s.seed} onToggle={toggle} progress={progress} onBack={onBack} onNext={s.next} />;
    case 'writers':
      return <DiscoveryStageScreen key="writers" stage="writers" listKey="writers" picks={s.selections.writers} seed={s.seed} onToggle={toggle} progress={progress} onBack={onBack} onNext={s.next} />;
    case 'genres':
      return <GenreStage picks={s.selections.genres} onToggle={toggle} progress={progress} onBack={onBack} onNext={s.next} />;
    case 'traits':
      return <TraitStage picks={s.selections.traits} onToggle={toggle} progress={progress} onBack={onBack} onNext={s.next} onFinish={s.editing ? finishEdit : s.next} finishLabel={s.editing ? 'Save my taste' : 'Continue'} />;
    case 'processing':
      return <ProcessingStage selections={s.selections} onDone={() => { s.markTasteSetup(); s.next(); }} />;
    case 'reveal':
      return <RevealStage selections={s.selections} onNext={s.next} />;
    case 'storage':
      return <StorageStage onNext={s.next} />;
    case 'hidden_shelf':
      return <HiddenShelfStage onNext={s.next} />;
    case 'collection':
      return <CollectionStage draft={s.draft} setDraft={s.setDraft} onSave={saveCollection} onSkip={() => { s.setDraft([]); s.markCollectionSetup(); s.next(); }} onBack={null} saving={saving} />;
    case 'library_ready':
      return <LibraryReadyStage onNext={s.next} />;
    case 'first_pick':
      return <FirstPickStage onDone={() => { s.finish(); leave(); }} onBrowse={() => { s.finish(); leave('/collection'); }} />;
    case 'done':
    default:
      return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }
}
