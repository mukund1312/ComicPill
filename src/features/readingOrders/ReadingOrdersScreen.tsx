import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppShell } from '../../ui/AppShell';
import { Button, Input, Pill, Progress } from '../../ui/primitives';
import { radius, space, type } from '../../ui/tokens';

import { useThemed, type Palette, type Fonts } from '../../ui/theme';
import { READING_ORDERS } from '../../lib/readingOrders/data';
import { findOrders, summaryLine } from '../../lib/readingOrders/match';
import { makePlaylistFrom, ownedWorks, viewOrder, type OrderView } from '../../lib/readingOrders/owned';

type Show = 'all' | 'essential' | 'missing';

/**
 * Reading orders: pick an event ("Flashpoint", "Secret Wars (2015)"), see the books in the order to read them, which are essential and which are
 * optional, and which you already have in My Collection. Type what you want to read in the box to find it.
 */
export default function ReadingOrdersScreen() {
  const { styles } = useThemed(makeStyles);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [show, setShow] = useState<Show>('all');
  const [tick, setTick] = useState(0);
  useFocusEffect(useCallback(() => { setTick((t) => t + 1); }, [])); // what you own may have changed since you were last here
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` is how a change in My Collection reaches the screen
  const owned = useMemo(() => ownedWorks(), [tick]);
  const orders = useMemo(() => (query.trim() ? findOrders(query, READING_ORDERS) : READING_ORDERS), [query]);
  const views = useMemo(() => new Map(READING_ORDERS.map((o) => [o.id, viewOrder(o, owned)])), [owned]);
  const open = openId ? views.get(openId) ?? null : null;

  return (
    <AppShell active="library" back onBack={() => { if (!open) return false; setOpenId(null); return true; }} title={open ? open.order.title : 'Reading orders'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {open ? <Detail view={open} show={show} onShow={setShow} /> : (
          <>
            <Text style={styles.intro}>What do you want to read? Type an event or a story and see what to read first, and what you already have.</Text>
            <View style={styles.search}><Input placeholder="e.g. I want to read Flashpoint" value={query} onChangeText={setQuery} /></View>
            {orders.length === 0 ? <Text style={styles.empty}>Nothing matches “{query.trim()}” yet. Try the name of an event, like “Civil War” or “Secret Wars”.</Text> : null}
            {orders.map((o, i) => {
              const v = views.get(o.id) as OrderView;
              return (
                <Pressable key={o.id} accessibilityRole="button" onPress={() => { setOpenId(o.id); setShow('all'); }} style={styles.card}>
                  <Text style={styles.meta}>{o.publisher} · {o.year}{query.trim() && i === 0 ? ' · Best match' : ''}</Text>
                  <Text style={styles.cardTitle}>{o.title}</Text>
                  <Text style={styles.blurb}>{o.blurb}</Text>
                  <View style={styles.bar}><Progress value={v.total ? v.have / v.total : 0} /></View>
                  <Text style={styles.line}>{summaryLine(v)}</Text>
                </Pressable>
              );
            })}
            <Text style={styles.foot}>These lists are made by hand and start small. Tell us what’s missing or wrong.</Text>
          </>
        )}
      </ScrollView>
    </AppShell>
  );
}

function Detail({ view, show, onShow }: { view: OrderView; show: Show; onShow: (s: Show) => void }) {
  const { styles } = useThemed(makeStyles);
  const entries = view.entries.filter((e) => (show === 'essential' ? e.entry.role === 'essential' : show === 'missing' ? !e.owned : true));
  const make = (essentialOnly: boolean) => {
    const { added } = makePlaylistFrom(view, { essentialOnly });
    if (!added) { Alert.alert('Nothing to put in a playlist yet', 'You don’t have any of these in My Collection yet.'); return; }
    Alert.alert('Playlist made', `${added} ${added === 1 ? 'comic' : 'comics'} in reading order.`, [{ text: 'Stay here' }, { text: 'Open Playlists', onPress: () => router.push('/playlists') }]);
  };
  return (
    <>
      <Text style={styles.meta}>{view.order.publisher} · {view.order.year}</Text>
      <Text style={styles.blurb}>{view.order.blurb}</Text>
      <View style={styles.bar}><Progress value={view.total ? view.have / view.total : 0} /></View>
      <Text style={styles.line}>{summaryLine(view)}</Text>
      <Text style={styles.line}>{view.haveEssential} of {view.totalEssential} essential books in My Collection.</Text>
      <View style={styles.pills}>
        <Pill label="All" active={show === 'all'} onPress={() => onShow('all')} />
        <Pill label="Essential only" active={show === 'essential'} onPress={() => onShow('essential')} />
        <Pill label="Missing" active={show === 'missing'} onPress={() => onShow('missing')} />
      </View>
      {entries.length === 0 ? <Text style={styles.empty}>{show === 'missing' ? 'Nothing missing. You have them all.' : 'Nothing to show.'}</Text> : null}
      {entries.map((e) => (
        <View key={e.entry.title} style={styles.entry}>
          <View style={[styles.mark, e.owned && styles.markOwned]}><Text style={styles.markText}>{e.owned ? '✓' : ''}</Text></View>
          <View style={styles.entryBody}>
            <Text style={styles.entryTitle}>{e.entry.title}</Text>
            <Text style={[styles.entryRole, e.entry.role === 'essential' && styles.entryEssential]}>{e.entry.role === 'essential' ? 'Essential' : 'Optional'}{e.owned ? ' · In My Collection' : ' · Missing'}</Text>
            {e.entry.note ? <Text style={styles.entryNote}>{e.entry.note}</Text> : null}
          </View>
        </View>
      ))}
      <View style={styles.actions}>
        <Button onPress={() => make(true)}>Make a playlist of the essentials I have</Button>
        <Button kind="secondary" onPress={() => make(false)}>Make a playlist of everything I have</Button>
      </View>
    </>
  );
}

const makeStyles = (color: Palette, font: Fonts) => StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 105, gap: space.sm },
  intro: { color: color.text, fontFamily: font.display, fontSize: 26, lineHeight: 30, maxWidth: 520 },
  search: { marginVertical: space.sm },
  card: { padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2, gap: 4 },
  meta: { color: color.accent, fontFamily: font.bodyMedium, fontSize: 12 },
  cardTitle: { color: color.text, fontFamily: font.display, fontSize: 22 },
  blurb: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 19 },
  bar: { marginTop: space.sm },
  line: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption, lineHeight: 19 },
  empty: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 19, marginTop: space.md },
  foot: { color: color.faint, fontFamily: font.body, fontSize: 11, marginTop: space.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginVertical: space.md },
  entry: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.border },
  mark: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: color.faint, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  markOwned: { backgroundColor: color.positive, borderColor: color.positive },
  markText: { color: color.text, fontFamily: font.bodySemibold, fontSize: 14 },
  entryBody: { flex: 1, minWidth: 0 },
  entryTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, lineHeight: 22 },
  entryRole: { color: color.muted, fontFamily: font.bodyMedium, fontSize: 12, marginTop: 2 },
  entryEssential: { color: color.accent },
  entryNote: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
  actions: { gap: space.sm, marginTop: space.lg },
});
