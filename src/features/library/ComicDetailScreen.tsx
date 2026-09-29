import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, router } from 'expo-router';
import { useLibrary, type LibraryItem } from './useLibrary';
import { useComicDetail } from './useComicDetail';
import { useComicFund } from '../wallet/useComicFund';
import type { ComicDetail, DetailEdition } from '../../lib/db/queries/detail';
import { ComicCover } from '../../ui/comic';
import { Button, Eyebrow, Input, Pill, Progress, PurchaseBadge, SectionHeader, Sheet } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';
import { isAccessible } from '../../lib/util/own';

function formatCommitment(paise: number | null): string {
  if (paise == null) return 'price not on file for every remaining volume';
  return `₹${(paise / 100).toLocaleString('en-IN')} to finish`;
}

const PRINTING_LABEL: Record<string, string> = {
  single_issue: 'Single issue', trade_paperback: 'Trade paperback', hardcover: 'Hardcover',
  deluxe: 'Deluxe edition', omnibus: 'Omnibus', absolute: 'Absolute edition',
  compact: 'Compact edition', digital: 'Digital',
};

function formatPrice(paise: number | null): string {
  if (paise == null) return 'Price not set';
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

export default function ComicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const library = useLibrary();
  const { detail } = useComicDetail(id);
  const item = library.items.find((entry) => entry.workId === id);
  const fund = useComicFund();
  const [saveOpen, setSaveOpen] = useState(false);
  const [targetText, setTargetText] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  if (!item || !detail) return <View style={styles.missing}><Text style={styles.missingText}>This comic is not in the catalog.</Text></View>;

  const edition = detail.editions[0] ?? null;
  const bestBuy = edition ? fund.bestBuyFor(edition.id) : null;
  const purchase = fund.verdictFor(item.workId);
  const linkedBank = fund.piggyBanks.find((bank) => bank.workId === item.workId && (bank.status === 'saving' || bank.status === 'ready')) ?? null;
  const targetPaise = Math.max(0, Math.round(Number(targetText.replace(/[^0-9.]/g, '')) * 100)) || bestBuy?.totalPaise || edition?.typicalPricePaise || 0;

  // A plain ScrollView, not FlashList — this screen only ever shows exactly
  // one item, so virtualization buys nothing, and (the actual reason for
  // the change) a Sheet overlay rendered *inside* a FlashList's renderItem
  // sits inside its virtualized scroll content, where position:absolute
  // doesn't reliably fill the real viewport — the same class of bug fixed
  // on TodayScreen. The overlay is now a sibling of the scroll view instead.
  return <>
    <FlashList style={styles.page} contentContainerStyle={styles.content} data={[detail]} keyExtractor={(entry) => entry.workId} getItemType={() => 'comic-detail'} renderItem={({ item: d }) => (
      <Detail item={item} detail={d} setStatus={library.setStatus} label={item.keeper ? 'collect' : item.formatVerdict === 'digital' ? 'digital_is_fine' : 'try_digital_first'} linkedBank={linkedBank} purchase={purchase} onSave={() => { setTargetText(String((purchase?.wherePaise ?? edition?.typicalPricePaise ?? 0) / 100)); setSaveOpen(true); }} onBuy={() => { if (edition) fund.addItemToCart(item.workId, edition.id); router.push('/wallet'); }} onAdd={() => setAddOpen(true)} />
    )} />
    {saveOpen ? <View style={styles.overlay}><Sheet title="Save for this comic"><Text style={styles.sheetCopy}>Start a virtual Piggy Bank for this exact edition. You’ll add savings manually whenever you choose.</Text><Text style={styles.sheetPrice}>{bestBuy ? `Current best price · ${formatPrice(bestBuy.totalPaise)}` : 'Price not available yet'}</Text><Input placeholder="Target in ₹" value={targetText} onChangeText={setTargetText} /><Button disabled={!edition || !targetPaise} style={{ marginTop: 14 }} onPress={() => { if (edition && targetPaise) { fund.startPiggyBank(item.workId, edition.id, item.title, targetPaise); setSaveOpen(false); } }}>Start saving</Button><Button kind="ghost" onPress={() => setSaveOpen(false)}>Cancel</Button></Sheet></View> : null}
    {addOpen ? <View style={styles.overlay}><Sheet title="Add to your library"><Text style={styles.sheetCopy}>How do you have this one? This moves it out of Discover and into your collection.</Text>
      <Button style={{ marginBottom: 10 }} onPress={() => { library.setOwnership(item.workId, 'physical'); setAddOpen(false); }}>Physical</Button>
      <Button kind="secondary" style={{ marginBottom: 10 }} onPress={() => { library.setOwnership(item.workId, 'digital'); setAddOpen(false); }}>Digital</Button>
      <Button kind="secondary" style={{ marginBottom: 10 }} onPress={() => { library.setOwnership(item.workId, 'both'); setAddOpen(false); }}>Both</Button>
      <Button kind="secondary" style={{ marginBottom: 10 }} onPress={() => { library.setOwnership(item.workId, 'wishlist'); setAddOpen(false); }}>Wishlist it instead</Button>
      <Button kind="ghost" onPress={() => setAddOpen(false)}>Cancel</Button>
    </Sheet></View> : null}
  </>;
}

function Detail({ item, detail, setStatus, label, linkedBank, purchase, onSave, onBuy, onAdd }: {
  item: LibraryItem; detail: ComicDetail; setStatus: ReturnType<typeof useLibrary>['setStatus'];
  label: 'collect' | 'digital_is_fine' | 'try_digital_first';
  linkedBank: ReturnType<typeof useComicFund>['piggyBanks'][number] | null;
  purchase: ReturnType<typeof useComicFund>['verdictFor'] extends (...args: never[]) => infer R ? R : never;
  onSave: () => void; onBuy: () => void; onAdd: () => void;
}) {
  return (
    <>
      <Text onPress={() => router.back()} style={styles.back}>‹ Back</Text>
      <View style={styles.hero}>
        <ComicCover title={item.title} workId={item.workId} size="hero" recyclingKey={item.workId} />
        <View style={styles.heroInfo}>
          <Eyebrow>{item.bucket.replaceAll('_', ' ')}</Eyebrow>
          <Text numberOfLines={3} ellipsizeMode="tail" style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>{[detail.publisher, detail.pathName ? `#${detail.positionInPath ?? '?'} of ${detail.totalInPath ?? '?'} in ${detail.pathName}` : null].filter(Boolean).join(' · ') || 'A considered addition to your reading life.'}</Text>
          <PurchaseBadge label={label} />
        </View>
      </View>

      {detail.previousInPath || detail.nextInPath ? (
        <View style={styles.journeyRow}>
          {detail.previousInPath ? <Pressable_ onPress={() => router.push(`/comic/${detail.previousInPath!.workId}`)} label={`‹ ${detail.previousInPath.title}`} align="left" /> : <View style={{ flex: 1 }} />}
          {detail.nextInPath ? <Pressable_ onPress={() => router.push(`/comic/${detail.nextInPath!.workId}`)} label={`${detail.nextInPath.title} ›`} align="right" /> : <View style={{ flex: 1 }} />}
        </View>
      ) : null}

      <Text style={styles.summary}>{detail.summary ?? 'A story with enough atmosphere and character to make room for a deliberate read.'}</Text>

      <View style={styles.verdict}>
        <Eyebrow>Best format for you</Eyebrow>
        <Text style={styles.verdictTitle}>{item.keeper ? 'Best in print' : item.formatVerdict === 'digital' ? 'Digital is fine' : 'Try digital first'}</Text>
        <Text style={styles.verdictCopy}>{item.keeper ? 'The artwork and keeper value make shelf space worthwhile.' : 'A strong read, but save physical space for the stories you love most.'}</Text>
      </View>

      {linkedBank ? <Pressable onPress={() => router.push({ pathname: '/wallet', params: { bankId: linkedBank.id } })} style={styles.walletBlock}><Eyebrow>Comic Wallet</Eyebrow><Text style={styles.walletTitle}>{linkedBank.name}</Text><Text style={styles.walletCopy}>{formatPrice(linkedBank.savedPaise)} saved of {formatPrice(linkedBank.targetPaise)} · {Math.round((linkedBank.targetPaise ? linkedBank.savedPaise / linkedBank.targetPaise : 0) * 100)}%</Text><Progress value={linkedBank.targetPaise ? linkedBank.savedPaise / linkedBank.targetPaise : 0} /><Text style={styles.walletAction}>Open goal →</Text></Pressable> : purchase ? <View style={styles.walletBlock}><Eyebrow>Should I buy this?</Eyebrow>{purchase.wherePaise != null ? <Text style={styles.walletPrice}>Best price {formatPrice(purchase.wherePaise)}{purchase.whereRetailerId ? ` · ${purchase.whereRetailerId.replace('retailer-', '')}` : ''}</Text> : null}<Text style={styles.walletCopy}>{purchase.action === 'wait' || purchase.action === 'skip' ? purchase.why : purchase.actionDetail}</Text>{purchase.action === 'buy' ? <Button style={{ marginTop: 12 }} onPress={onBuy}>Buy</Button> : purchase.action === 'save' ? <Button style={{ marginTop: 12 }} onPress={onSave}>Save for this</Button> : null}</View> : null}

      <SectionHeader title="Editions" />
      {detail.editions.length ? (
        <View style={styles.editions}>{detail.editions.map((e) => <EditionRow key={e.id} edition={e} />)}</View>
      ) : (
        <Text style={styles.emptyNote}>No edition on record yet — add one from Compare.</Text>
      )}

      <SectionHeader title="Your reading" />
      <View style={styles.statuses}>{(['none', 'reading', 'done', 'dropped'] as const).map((status) => <Pill key={status} label={status === 'none' ? 'Unread' : status} active={item.status === status} onPress={() => setStatus(item.workId, status)} />)}</View>
      {item.status === 'reading' ? <View style={{ marginTop: 16 }}><Progress value={0.45} /></View> : null}
      <Button style={{ marginTop: 24 }} onPress={() => item.status === 'reading' ? router.push(`/check-in/${item.workId}`) : !isAccessible(item.own) ? onAdd() : setStatus(item.workId, 'reading')}>{item.status === 'reading' ? 'Check in' : item.own === 'none' ? 'Add to library' : !isAccessible(item.own) ? 'Update ownership' : 'Start reading'}</Button>
      <Button kind="secondary" style={{ marginTop: 10 }} onPress={() => router.push('/compare')}>Compare formats</Button>

      {detail.skip.affectedWorkIds.length > 0 ? (
        <View style={styles.skipBox}>
          <Eyebrow>Can I skip this?</Eyebrow>
          <Text style={styles.skipTitle}>{detail.skip.canSkip ? 'You can skip it — with tradeoffs' : "Don't skip this one"}</Text>
          {!detail.skip.canSkip ? <Text style={styles.skipLine}>• Something later requires having read this first.</Text> : null}
          {detail.skip.mainStoryImpact !== 'none' ? <Text style={styles.skipLine}>• Main story impact: {detail.skip.mainStoryImpact}</Text> : null}
          {detail.skip.characterContextImpact !== 'none' ? <Text style={styles.skipLine}>• Character context impact: {detail.skip.characterContextImpact}</Text> : null}
          {detail.skip.futureContinuityImpact !== 'none' ? <Text style={styles.skipLine}>• Future continuity impact: {detail.skip.futureContinuityImpact}</Text> : null}
          {detail.skip.completionistOnly ? <Text style={styles.skipLine}>Only affects completionist-level reading.</Text> : null}
        </View>
      ) : null}

      {detail.seriesCommitment ? (
        <View style={styles.skipBox}>
          <Eyebrow>Finishing this series</Eyebrow>
          <Text style={styles.skipTitle}>
            {detail.seriesCommitment.volumesRemaining === 0
              ? "You're caught up"
              : `${detail.seriesCommitment.volumesRemaining} volume${detail.seriesCommitment.volumesRemaining === 1 ? '' : 's'} left · ${formatCommitment(detail.seriesCommitment.estimatedRemainingCostPaise)}`}
          </Text>
          {detail.seriesCommitment.isOpenEnded ? <Text style={styles.skipLine}>Ongoing series — no announced total yet, so this is only what&apos;s out so far.</Text> : null}
        </View>
      ) : null}

      {detail.related.length ? (
        <>
          <SectionHeader title="Related" />
          <View style={{ gap: 8 }}>{detail.related.map((r) => (
            <Pressable_ key={`${r.direction}-${r.workId}`} onPress={() => router.push(`/comic/${r.workId}`)} label={`${r.direction === 'before' ? 'Read before: ' : 'Continues into: '}${r.title}${r.confirmed ? '' : ' (suggested)'}`} align="left" full />
          ))}</View>
        </>
      ) : null}

      <SectionHeader title="Personal notes" />
      <View style={styles.notes}><Text style={styles.noteText}>A private place for what stayed with you.</Text></View>
    </>
  );
}

function EditionRow({ edition }: { edition: DetailEdition }) {
  return (
    <View style={styles.editionRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.editionPrinting}>{PRINTING_LABEL[edition.printing] ?? edition.printing}</Text>
        <Text style={styles.editionMeta}>{[edition.format === 'physical' ? 'Physical' : 'Digital', edition.pages ? `${edition.pages}pp` : null].filter(Boolean).join(' · ')}</Text>
      </View>
      <Text style={styles.editionPrice}>{formatPrice(edition.typicalPricePaise)}</Text>
    </View>
  );
}

// A minimal pressable text row — kept local since it's only used for the
// previous/next path nav and the related-works list on this screen.
function Pressable_({ onPress, label, align, full }: { onPress: () => void; label: string; align: 'left' | 'right'; full?: boolean }) {
  return <Pressable onPress={onPress} style={[styles.navItem, full && { width: '100%' }]}><Text numberOfLines={1} style={[styles.navText, align === 'right' && { textAlign: 'right' }]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, paddingTop: 60, paddingBottom: 40 },
  back: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.body, marginBottom: 16 },
  hero: { flexDirection: 'row', gap: 18 },
  heroInfo: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 9 },
  title: { color: color.text, fontFamily: font.display, fontSize: 29, lineHeight: 34 },
  meta: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 18 },
  journeyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 18 },
  navItem: { flex: 1, backgroundColor: color.surface2, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12 },
  navText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption },
  summary: { color: color.muted, fontFamily: font.body, fontSize: type.body, lineHeight: 24, marginTop: 20 },
  verdict: { marginTop: 20, backgroundColor: color.surface, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.collectGold + '77' },
  verdictTitle: { color: color.collectGold, fontFamily: font.display, fontSize: type.title, marginTop: 5 },
  verdictCopy: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 18, marginTop: 5 },
  walletBlock: { marginTop: 18, backgroundColor: color.surface2, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.accentDeep + '88' }, walletTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, marginTop: 5 }, walletPrice: { color: color.collectGold, fontFamily: font.bodySemibold, fontSize: type.caption, marginTop: 5 }, walletCopy: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 18, marginTop: 6 }, walletAction: { color: color.accent, fontFamily: font.bodySemibold, fontSize: type.caption, marginTop: 10 },
  skipBox: { marginTop: 18, backgroundColor: color.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, padding: space.md, gap: 6 },
  skipTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, marginTop: 4 },
  skipLine: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 18 },
  editions: { gap: 8 },
  editionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.md, padding: space.md },
  editionPrinting: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.body },
  editionMeta: { color: color.faint, fontFamily: font.body, fontSize: type.caption, marginTop: 2 },
  editionPrice: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle },
  emptyNote: { color: color.faint, fontFamily: font.body, fontSize: type.caption },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notes: { backgroundColor: color.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, padding: 16, minHeight: 92 },
  noteText: { color: color.faint, fontFamily: font.body, fontSize: type.caption },
  missing: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  missingText: { color: color.muted, fontFamily: font.body },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 10, justifyContent: 'flex-end', backgroundColor: '#000000aa' }, sheetCopy: { color: color.muted, fontFamily: font.body, fontSize: type.body, lineHeight: 22, marginBottom: 12 }, sheetPrice: { color: color.collectGold, fontFamily: font.bodySemibold, fontSize: type.caption, marginBottom: 12 },
});
