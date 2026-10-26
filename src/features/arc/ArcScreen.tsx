// The journey map: not a numbered reading list, but chapters of story
// milestones with "you are here" on the beat that's next for THIS reader.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppShell } from '../../ui/AppShell';
import { ComicCover } from '../../ui/comic';
import { Button, EmptyState, Eyebrow, Pill, Progress } from '../../ui/primitives';
import { space } from '../../ui/tokens';
import { useAppearance } from '../../ui/theme';
import { skipAdviceFor } from '../../lib/engines/arc/build';
import type { ArcChapter, ArcFamily, ArcItem, ArcPlan, ArcProgressStatus } from '../../lib/engines/arc/types';
import { DEPTHS, useArc } from './useArc';
import { TIER_LABEL, canReadNow, continuityLabel, itemStatusLine } from './format';
import { GuidanceBlock, useGuidance } from './ArcRelevance';

export default function ArcScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const arc = useArc(id);
  const { theme, typography } = useAppearance();
  const c = theme.colors;

  if (!arc.plan || !arc.arc || !arc.titles || !arc.counts) {
    return (
      <AppShell active="none" title="Journey">
        <EmptyState title="Journey not found" copy="This reading journey no longer exists." action="Back to Paths" onAction={() => router.replace('/paths')} />
      </AppShell>
    );
  }
  const { plan, titles, counts } = arc;
  const titleOf = (workId: string) => titles.get(workId) ?? workId;

  return (
    <AppShell active="none" title="Journey">
      <ScrollView contentContainerStyle={styles.content}>
        {arc.parent ? (
          <Text onPress={() => router.replace(`/arc/${arc.parent!.id}`)} accessibilityRole="button" style={[styles.back, { color: c.textSecondary, fontFamily: typography.bodyMedium }]}>‹ {arc.parent.title}</Text>
        ) : (
          <Text onPress={() => router.back()} style={[styles.back, { color: c.textSecondary, fontFamily: typography.bodyMedium }]}>‹ Paths</Text>
        )}
        <Eyebrow>{arc.parent ? 'A side journey' : 'Your journey'}</Eyebrow>
        <Text style={[styles.title, { color: c.textPrimary, fontFamily: typography.display }]}>{plan.title}</Text>
        <Text style={[styles.goal, { color: c.textSecondary, fontFamily: typography.body }]}>{plan.goal}</Text>

        <View style={styles.pills}>
          {DEPTHS.map((d) => (
            <Pill key={d.id} label={`${d.label} · ${counts[d.id]}`} active={plan.depth === d.id} onPress={() => arc.setDepth(d.id)} />
          ))}
        </View>

        <View style={styles.progressBlock}>
          <View style={styles.progressRow}>
            <Text style={[styles.progressText, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>{plan.percentComplete}% complete</Text>
            <Text style={[styles.progressSub, { color: c.textSecondary, fontFamily: typography.body }]}>{plan.milestonesComplete} of {plan.milestonesTotal} milestones</Text>
          </View>
          <Progress value={plan.percentComplete / 100} />
        </View>

        <NextCard plan={plan} title={plan.nextStep ? titleOf(plan.nextStep.workId) : ''} titleOf={titleOf} onStart={arc.startReading} />

        {arc.branches.length ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Eyebrow>Your side journeys</Eyebrow>
            {arc.branches.map((b) => (
              <Pressable key={b.id} accessibilityRole="button" onPress={() => router.push(`/arc/${b.id}`)} style={styles.branchRow}>
                <Text style={[styles.itemTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{b.title}</Text>
                <Text style={[styles.meta, { color: c.textSecondary, fontFamily: typography.body }]}>{b.percent}% complete</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {plan.family ? <FamilyTree family={plan.family} /> : null}

        {plan.chapters.map((chapter, index) => (
          <Chapter key={chapter.id} chapter={chapter} number={index + 1} nextWorkId={plan.nextStep?.workId ?? null} titleOf={titleOf} plan={plan} onBranch={(key) => router.push(`/arc/${arc.branchInto(key)}`)} />
        ))}

        {plan.endgame ? (
          <Endgame plan={plan} titleOf={titleOf} />
        ) : null}
      </ScrollView>
    </AppShell>
  );
}

// ---- READ NEXT -------------------------------------------------------------

function NextCard({ plan, title, titleOf, onStart }: { plan: ArcPlan; title: string; titleOf: (id: string) => string; onStart: (workId: string) => void }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const [whyOpen, setWhyOpen] = useState(false);
  const next = plan.nextStep;
  const guidance = useGuidance(plan, next?.workId ?? '', titleOf, !!next && next.state === 'not_owned');

  if (!next) {
    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Eyebrow>{plan.atEndgame ? 'The main journey is done' : 'Nothing to read next'}</Eyebrow>
        <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: typography.display }]}>
          {plan.atEndgame ? 'Where should Bruce’s story go from here?' : 'You are all caught up.'}
        </Text>
        <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
          {plan.atEndgame ? 'Pick an ending below — they live in different continuities.' : 'Try a deeper level to add more.'}
        </Text>
      </View>
    );
  }
  const readable = canReadNow(next);
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.primary }]}>
      <Eyebrow>Next milestone · {next.milestoneTitle}</Eyebrow>
      <View style={styles.nextRow}>
        <ComicCover title={title} workId={next.workId} size="list" recyclingKey={`arc-next-${next.workId}`} />
        <View style={styles.flex}>
          <Text numberOfLines={3} style={[styles.cardTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{title}</Text>
          <Text style={[styles.meta, { color: c.primary, fontFamily: typography.bodyMedium }]}>{itemStatusLine(next)}</Text>
          <Text style={[styles.meta, { color: c.textSecondary, fontFamily: typography.body }]}>{next.chapterTitle}</Text>
        </View>
      </View>
      {whyOpen ? <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{next.why}</Text> : null}
      <GuidanceBlock view={guidance} />
      <View style={styles.actions}>
        <Button
          style={styles.flex}
          onPress={() => {
            if (readable && next.state !== 'reading') onStart(next.workId);
            router.push(`/comic/${next.workId}`);
          }}
        >
          {readable ? (next.state === 'reading' ? 'Keep reading' : 'Read next') : 'See how to read it'}
        </Button>
        <Button kind="secondary" onPress={() => setWhyOpen((v) => !v)}>{whyOpen ? 'Hide' : 'Why this?'}</Button>
      </View>
    </View>
  );
}

// ---- FAMILY TREE -----------------------------------------------------------

function FamilyTree({ family }: { family: ArcFamily }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const chip = (status: ArcProgressStatus) => status === 'complete'
    ? { backgroundColor: c.success, borderColor: c.success, color: c.primaryForeground }
    : status === 'current'
      ? { backgroundColor: c.primaryMuted, borderColor: c.primary, color: c.textPrimary }
      : { backgroundColor: 'transparent', borderColor: c.border, color: c.textMuted };
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Eyebrow>Bruce starts alone. The family grows.</Eyebrow>
      <Text style={[styles.root, { color: c.textPrimary, fontFamily: typography.display }]}>{family.root}</Text>
      {family.branches.map((b) => (
        <View key={b.name} style={styles.branch}>
          <Text style={[styles.branchName, { color: c.textSecondary, fontFamily: typography.bodyMedium }]}>{b.name}</Text>
          <View style={styles.chain}>
            {b.identities.map((i, idx) => {
              const s = chip(i.status);
              return (
                <View key={i.label} style={styles.chainItem}>
                  {idx > 0 ? <Text style={{ color: c.textMuted }}>→</Text> : null}
                  <View style={[styles.identity, { backgroundColor: s.backgroundColor, borderColor: s.borderColor }]}>
                    <Text style={[styles.identityText, { color: s.color, fontFamily: typography.bodySemibold }]}>{i.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// ---- CHAPTERS --------------------------------------------------------------

function Chapter({ chapter, number, nextWorkId, titleOf, plan, onBranch }: {
  chapter: ArcChapter; number: number; nextWorkId: string | null; titleOf: (id: string) => string; plan: ArcPlan; onBranch: (templateKey: string) => void;
}) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const [open, setOpen] = useState(chapter.status === 'current');
  const statusText = chapter.status === 'complete' ? 'Complete' : chapter.status === 'current' ? 'Current' : 'Up next';
  const value = chapter.totalItems ? chapter.finishedItems / chapter.totalItems : 0;
  return (
    <View style={styles.chapter}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" style={styles.chapterHead}>
        <Text style={[styles.chapterNum, { color: chapter.status === 'upcoming' ? c.textMuted : c.primary, fontFamily: typography.display }]}>{String(number).padStart(2, '0')}</Text>
        <View style={styles.flex}>
          <Text style={[styles.chapterTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{chapter.title}</Text>
          <Text style={[styles.meta, { color: c.textSecondary, fontFamily: typography.body }]}>{chapter.tagline}</Text>
        </View>
        <Text style={[styles.status, { color: chapter.status === 'complete' ? c.success : chapter.status === 'current' ? c.primary : c.textMuted, fontFamily: typography.bodySemibold }]}>{statusText}</Text>
      </Pressable>
      <Progress value={value} />
      {open ? chapter.milestones.map((m) => (
        <View key={m.id} style={[styles.milestone, { borderLeftColor: m.status === 'complete' ? c.success : m.status === 'current' ? c.primary : c.border }]}>
          <Text style={[styles.milestoneTitle, { color: m.status === 'upcoming' ? c.textSecondary : c.textPrimary, fontFamily: typography.bodySemibold }]}>{m.title}</Text>
          <Text style={[styles.meta, { color: c.textMuted, fontFamily: typography.body }]}>{m.change}</Text>
          {plan.branchOffers.filter((o) => o.milestoneId === m.id && m.status !== 'upcoming').map((o) => (
            <View key={o.templateKey} style={[styles.branchOffer, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
              <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{o.pitch}</Text>
              <Button kind="secondary" onPress={() => onBranch(o.templateKey)}>{o.label}  →</Button>
              <Text style={[styles.meta, { color: c.textMuted, fontFamily: typography.body }]}>Your {plan.title.split(':')[0]} journey stays right where it is.</Text>
            </View>
          ))}
          {m.items.map((item) => (
            <ItemRow key={item.workId} item={item} title={titleOf(item.workId)} isNext={item.workId === nextWorkId} plan={plan} titleOf={titleOf} />
          ))}
        </View>
      )) : null}
    </View>
  );
}

// ---- ITEM ------------------------------------------------------------------

function ItemRow({ item, title, isNext, plan, titleOf }: { item: ArcItem; title: string; isNext: boolean; plan: ArcPlan; titleOf: (id: string) => string }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const [open, setOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const done = item.state === 'finished' || item.state === 'dropped';
  const node = item.state === 'finished' ? '✓' : item.state === 'dropped' ? '–' : item.state === 'reading' || isNext ? '●' : '○';
  const nodeColor = item.state === 'finished' ? c.success : item.state === 'reading' || isNext ? c.primary : c.textMuted;
  const cont = continuityLabel(item.continuity);
  const advice = skipOpen ? skipAdviceFor(item) : null;
  const guidance = useGuidance(plan, item.workId, titleOf, open && item.state === 'not_owned');

  return (
    <View style={styles.item}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" style={styles.itemHead}>
        <Text style={[styles.node, { color: nodeColor, fontFamily: typography.bodySemibold }]}>{node}</Text>
        <ComicCover title={title} workId={item.workId} size="tiny" recyclingKey={`arc-${item.workId}`} />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.itemTitle, { color: done ? c.textSecondary : c.textPrimary, fontFamily: typography.displayMedium }]}>{title}</Text>
          <Text style={[styles.meta, { color: isNext ? c.primary : c.textSecondary, fontFamily: typography.bodyMedium }]}>
            {isNext ? 'You are here · ' : ''}{itemStatusLine(item)}
          </Text>
        </View>
        <View style={[styles.tier, { borderColor: item.tier === 'essential' ? c.primary : c.border }]}>
          <Text style={[styles.tierText, { color: item.tier === 'essential' ? c.primary : c.textMuted, fontFamily: typography.bodySemibold }]}>{TIER_LABEL[item.tier]}</Text>
        </View>
      </Pressable>
      {open ? (
        <View style={[styles.detail, { backgroundColor: c.surfaceRaised, borderColor: c.border }]}>
          <Text style={[styles.detailLabel, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>WHY IT MATTERS</Text>
          <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.body }]}>{item.why}</Text>
          {cont ? <Text style={[styles.meta, { color: c.warning, fontFamily: typography.bodyMedium }]}>{cont}</Text> : null}
          <GuidanceBlock view={guidance} />
          {advice ? (
            <View style={styles.skip}>
              <Text style={[styles.detailLabel, { color: c.textMuted, fontFamily: typography.bodySemibold }]}>CAN I SKIP THIS?</Text>
              <Text style={[styles.body, { color: c.textPrimary, fontFamily: typography.bodySemibold }]}>{advice.headline}</Text>
              <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>Impact: {advice.impact}</Text>
              <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>What you’ll miss: {advice.missed}</Text>
              <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>{advice.recommendation}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button kind="secondary" style={styles.flex} onPress={() => setSkipOpen((v) => !v)}>{skipOpen ? 'Hide' : 'Can I skip this?'}</Button>
            <Button kind="secondary" style={styles.flex} onPress={() => router.push(`/comic/${item.workId}`)}>Open</Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---- ENDGAME ---------------------------------------------------------------

function Endgame({ plan, titleOf }: { plan: ArcPlan; titleOf: (id: string) => string }) {
  const { theme, typography } = useAppearance();
  const c = theme.colors;
  const [openId, setOpenId] = useState<string | null>(null);
  const eg = plan.endgame!;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border, opacity: plan.atEndgame ? 1 : 0.92 }]}>
      <Eyebrow>{plan.atEndgame ? eg.title : `Later · ${eg.title}`}</Eyebrow>
      <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: typography.display }]}>{eg.question}</Text>
      <Text style={[styles.body, { color: c.textSecondary, fontFamily: typography.body }]}>
        Batman has more than one possible ending, and they live in different continuities. Pick the kind of ending you want — none of these is the only one.
      </Text>
      {eg.branches.map((b) => (
        <View key={b.id}>
          <Pressable onPress={() => setOpenId(openId === b.id ? null : b.id)} accessibilityRole="button" style={[styles.branchCard, { borderColor: openId === b.id ? c.primary : c.border }]}>
            <Text style={[styles.itemTitle, { color: c.textPrimary, fontFamily: typography.displayMedium }]}>{b.label}</Text>
            <Text style={[styles.meta, { color: c.textSecondary, fontFamily: typography.body }]}>{b.description}</Text>
          </Pressable>
          {openId === b.id ? (
            <View style={styles.branchBody}>
              <Text style={[styles.meta, { color: c.warning, fontFamily: typography.bodyMedium }]}>{b.continuityNote}</Text>
              {b.items.map((item) => <ItemRow key={item.workId} item={item} title={titleOf(item.workId)} isNext={false} plan={plan} titleOf={titleOf} />)}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  back: { fontSize: 16, marginBottom: 8 },
  title: { fontSize: 30, lineHeight: 36 },
  goal: { fontSize: 15, lineHeight: 22 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  progressBlock: { gap: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressText: { fontSize: 15 },
  progressSub: { fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 18, padding: space.lg, gap: space.md },
  cardTitle: { fontSize: 22, lineHeight: 28 },
  nextRow: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: space.sm },
  body: { fontSize: 14, lineHeight: 21 },
  meta: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  root: { fontSize: 24 },
  branch: { gap: 6 },
  branchName: { fontSize: 13 },
  chain: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chainItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  identity: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  identityText: { fontSize: 12 },
  chapter: { gap: 8, marginTop: space.md },
  chapterHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chapterNum: { fontSize: 26, width: 40 },
  chapterTitle: { fontSize: 19 },
  status: { fontSize: 12 },
  milestone: { borderLeftWidth: 2, paddingLeft: space.md, gap: 6, marginTop: 6 },
  milestoneTitle: { fontSize: 15 },
  item: { gap: 6, marginTop: 6 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  node: { width: 16, fontSize: 14, textAlign: 'center' },
  itemTitle: { fontSize: 15, lineHeight: 20 },
  tier: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tierText: { fontSize: 10 },
  detail: { borderWidth: 1, borderRadius: 12, padding: space.md, gap: 8 },
  detailLabel: { fontSize: 10, letterSpacing: 1.4 },
  skip: { gap: 4, marginTop: 4 },
  branchOffer: { borderWidth: 1, borderRadius: 12, padding: space.md, gap: 8, marginTop: 6 },
  branchRow: { paddingVertical: 6, gap: 2 },
  branchCard: { borderWidth: 1, borderRadius: 12, padding: space.md, marginTop: 8 },
  branchBody: { paddingLeft: space.sm, gap: 4, marginTop: 4 },
});
