import { StageFrame } from './StageFrame';
import { PreferenceDiscoveryGrid } from './PreferenceDiscoveryGrid';
import { useDiscoveryStep } from './useDiscoveryStep';
import { COPY, type DiscoveryStage } from './pools';
import type { PickKey } from '../../lib/onboarding/flow';

/** Characters, villains, artists, writers: one component, four pools. */
export function DiscoveryStageScreen({ stage, listKey, picks: allPicks, seed, onToggle, minPicks = 0, progress, onBack, onNext }: {
  stage: DiscoveryStage; listKey: PickKey; picks: readonly string[]; seed: number; onToggle: (key: PickKey, id: string) => void;
  minPicks?: number; progress: { index: number; total: number } | null; onBack: (() => void) | null; onNext: () => void;
}) {
  const { choices, picks, toggle, search } = useDiscoveryStep(stage, allPicks, seed, (id) => onToggle(listKey, id));
  const copy = COPY[stage];
  const need = Math.max(0, minPicks - allPicks.length);
  return (
    <StageFrame
      title={copy.title} subtitle={copy.subtitle} progress={progress} onBack={onBack}
      primaryLabel={need > 0 ? `Pick ${need} more` : 'Continue'} primaryDisabled={need > 0} onPrimary={onNext}
      onSkip={onNext} skipLabel={minPicks > 0 ? 'I’ll do this later' : 'Skip this'}
    >
      <PreferenceDiscoveryGrid choices={choices} picks={picks} onToggle={toggle} search={search} emptyHint={copy.empty} />
    </StageFrame>
  );
}
