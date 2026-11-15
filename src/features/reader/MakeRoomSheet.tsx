import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatBytes } from '../../lib/reader/bytes';
import { BUDGET_CHOICES_GB, KEEP_CHOICES, cloudBudgetBytes, cloudBudgetGb, keepLimit, setCloudBudgetGb, setKeepLimit } from '../../lib/reader/cloudBudget';
import type { ReadyComic, RoomPlan } from '../../lib/reader/makeRoom';
import { font, radius, space, type } from '../../ui/tokens';
import { useThemed, type Palette } from '../../ui/theme';

const ago = (ms: number): string => {
  const days = Math.floor((Date.now() - ms) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 60 ? `${days} days ago` : `${Math.round(days / 30)} months ago`;
};

/**
 * Shown when opening a comic would take the downloaded comics past the space the reader set aside. The least recently read are ticked
 * to begin with; putting them away only removes the downloaded copy, since the comic stays linked and comes back when opened.
 */
export function MakeRoomSheet({ title, need, plan: firstPlan, ready, onConfirm, onCancel, recompute, verb = 'open' }: { verb?: string; /** Works out the plan again after the limit is changed here. Without it the limits can't be edited from this sheet. */ recompute?: () => RoomPlan; budget?: number; title: string; need: number; plan: RoomPlan; ready: ReadyComic[]; onConfirm: (ids: string[]) => void; onCancel: () => void }) {
  const { styles } = useThemed(makeStyles);
  const [plan, setPlan] = useState(firstPlan);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(firstPlan.suggested));
  const [editing, setEditing] = useState(false);
  const [limits, setLimits] = useState(() => ({ gb: cloudBudgetGb(), most: keepLimit() }));
  // Changing a limit here is the same as changing it in Settings; the plan is worked out again at once, so raising it can free the way without putting anything away.
  const change = (apply: () => void) => { apply(); setLimits({ gb: cloudBudgetGb(), most: keepLimit() }); if (recompute) { const next = recompute(); setPlan(next); setChosen(new Set(next.suggested)); } };
  const list = [...ready].sort((a, b) => a.lastReadAt - b.lastReadAt);
  const freed = list.filter((c) => chosen.has(c.id)).reduce((n, c) => n + c.bytes, 0);
  const short = Math.max(0, plan.over - freed);
  const everything = chosen.size === list.length;
  // A comic bigger than the whole budget can still be opened once everything else is put away.
  const mustPutAway = Math.max(0, plan.overCount - chosen.size);
  const canOpen = mustPutAway === 0 && (short === 0 || (!plan.possible && everything));
  const toggle = (id: string) => setChosen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Make room to {verb} {verb === 'open' ? 'this comic' : 'these comics'}</Text>
          <Text style={styles.body}>
            {plan.overCount > 0 ? `You can keep ${keepLimit()} comics downloaded at a time. Put ${plan.overCount === 1 ? 'one' : plan.overCount} away to open “${title}”. ` : `“${title}” needs ${need ? formatBytes(need) : 'some space'}. You’ve set aside ${formatBytes(cloudBudgetBytes())} for downloaded comics and ${formatBytes(plan.used)} is in use. `}
            Put some away to continue. They stay on your shelf and download again when you open them.
          </Text>
          {recompute ? (
            <View style={styles.limits}>
              <Pressable accessibilityRole="button" onPress={() => setEditing((e) => !e)} hitSlop={8}><Text style={styles.link}>{editing ? 'Done changing the limit' : `Change the limit (${limits.gb} GB${limits.most ? `, ${limits.most} comics` : ''})`}</Text></Pressable>
              {editing ? (
                <View style={styles.limitBody}>
                  <Text style={styles.limitLabel}>Space for downloaded comics</Text>
                  <View style={styles.chips}>{BUDGET_CHOICES_GB.map((n) => <Pressable key={n} accessibilityRole="button" onPress={() => change(() => setCloudBudgetGb(n))} style={[styles.chip, limits.gb === n && styles.chipOn]}><Text style={styles.chipText}>{n} GB</Text></Pressable>)}</View>
                  <Text style={styles.limitLabel}>Most comics at once</Text>
                  <View style={styles.chips}>{KEEP_CHOICES.map((n) => <Pressable key={n} accessibilityRole="button" onPress={() => change(() => setKeepLimit(n))} style={[styles.chip, limits.most === n && styles.chipOn]}><Text style={styles.chipText}>{n === 0 ? 'No limit' : n}</Text></Pressable>)}</View>
                </View>
              ) : null}
            </View>
          ) : null}
          {!plan.possible ? <Text style={styles.warn}>This comic is bigger than your whole limit. Raise it in Settings → Storage, or put everything away to open it anyway.</Text> : null}
          <ScrollView style={styles.list} contentContainerStyle={{ gap: 2 }}>
            {list.map((c) => (
              <Pressable key={c.id} onPress={() => toggle(c.id)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: chosen.has(c.id) }}>
                <View style={[styles.box, chosen.has(c.id) && styles.boxOn]}>{chosen.has(c.id) ? <Text style={styles.tick}>✓</Text> : null}</View>
                <View style={styles.rowBody}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{c.title}</Text>
                  <Text style={styles.rowSub}>{formatBytes(c.bytes)} · read {ago(c.lastReadAt)}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.status}>{mustPutAway > 0 ? `Choose ${mustPutAway} more` : short > 0 && !(everything && !plan.possible) ? `Choose ${formatBytes(short)} more` : `Freeing ${formatBytes(freed)}`}</Text>
          <Pressable disabled={!canOpen} onPress={() => onConfirm([...chosen])} style={[styles.primary, !canOpen && styles.off]}>
            <Text style={styles.primaryText}>{chosen.size ? `Put away ${chosen.size} and ${verb}` : verb === 'open' ? 'Open' : 'Download'}</Text>
          </Pressable>
          <Pressable onPress={onCancel} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (color: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '88%', backgroundColor: color.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.lg, gap: space.md },
  title: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.body + 3 },
  body: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 20 },
  warn: { color: color.warning, fontFamily: font.body, fontSize: type.caption },
  limits: { gap: space.sm },
  link: { color: color.accent, fontFamily: font.bodySemibold, fontSize: type.caption },
  limitBody: { gap: space.sm },
  limitLabel: { color: color.muted, fontFamily: font.body, fontSize: type.caption - 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radius.md, borderWidth: 1, borderColor: color.faint, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: color.accent, borderColor: color.accent },
  chipText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  rowBody: { flex: 1 },
  rowTitle: { color: color.text, fontFamily: font.body, fontSize: type.caption + 1 },
  rowSub: { color: color.faint, fontFamily: font.body, fontSize: type.caption - 1 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: color.faint, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.accent, borderColor: color.accent },
  tick: { color: color.text, fontSize: 14, fontWeight: '700' },
  status: { color: color.muted, fontFamily: font.bodySemibold, fontSize: type.caption, textAlign: 'center' },
  primary: { minHeight: 50, borderRadius: radius.md, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.body },
  off: { opacity: 0.35 },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: color.muted, fontFamily: font.bodySemibold, fontSize: type.caption },
});
