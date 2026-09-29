import { useMemo, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useComicFund } from './useComicFund';
import { useLibrary } from '../library/useLibrary';
import { AppShell } from '../../ui/AppShell';
import { Button, Eyebrow, Input, Pill, Progress, SectionHeader, Sheet } from '../../ui/primitives';
import { color, font, radius, space, type } from '../../ui/tokens';

const money = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
const toPaise = (value: string) => Math.max(0, Math.round(Number(value.replace(/[^0-9.]/g, '')) * 100));
const dateText = (date: Date) => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

type Fund = ReturnType<typeof useComicFund>;
type Bank = Fund['piggyBanks'][number];
type ScheduleId = 'daily' | 'weekly' | 'monthly' | 'manual';

function scheduleRate(id: ScheduleId) {
  if (id === 'daily') return 5000;
  if (id === 'weekly') return Math.round(25000 / 7);
  if (id === 'monthly') return Math.round(100000 / 30);
  return 0;
}

function projectDate(targetPaise: number, savedPaise: number, schedule: ScheduleId): Date | null {
  const rate = scheduleRate(schedule);
  if (!rate) return null;
  return new Date(Date.now() + Math.max(0, Math.ceil((targetPaise - savedPaise) / rate)) * 24 * 60 * 60 * 1000);
}

export default function WalletScreen() {
  const fund = useComicFund();
  const library = useLibrary();
  const { bankId } = useLocalSearchParams<{ bankId?: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(bankId ?? null);
  const selected = fund.piggyBanks.find((bank) => bank.id === selectedId) ?? null;
  if (selected) return <PiggyBankDetail fund={fund} bank={selected} onBack={() => setSelectedId(null)} />;
  return <WalletHome fund={fund} library={library} onSelect={setSelectedId} />;
}

function WalletHome({ fund, library, onSelect }: { fund: Fund; library: ReturnType<typeof useLibrary>; onSelect: (id: string) => void }) {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [newGoalOpen, setNewGoalOpen] = useState(false);
  const [buyOnly, setBuyOnly] = useState(false);
  const [topUpText, setTopUpText] = useState('');
  const [budgetText, setBudgetText] = useState(fund.config.monthlyBudgetPaise ? String(fund.config.monthlyBudgetPaise / 100) : '');
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalSchedule, setGoalSchedule] = useState<ScheduleId>('manual');
  const [selectedCartId, setSelectedCartId] = useState<string | null>(fund.cart[0]?.id ?? null);
  const [allocationSummary, setAllocationSummary] = useState<{ name: string; amountPaise: number }[] | null>(null);
  const activeBanks = fund.piggyBanks.filter((bank) => bank.status === 'saving' || bank.status === 'ready');
  const readiness = useMemo(() => new Map(activeBanks.map((bank) => [bank.id, fund.readiness(bank.id)])), [activeBanks, fund]);
  const readyBanks = activeBanks.filter((bank) => {
    const verdict = readiness.get(bank.id)?.verdict;
    return verdict === 'can_afford_now' || verdict === 'ready_check_price';
  });
  const savingBanks = activeBanks.filter((bank) => !readyBanks.some((ready) => ready.id === bank.id));
  const titleByWork = new Map(library.items.map((item) => [item.workId, item.title]));
  const decisionByCartId = new Map(fund.cartPlan.decisions.map((decision) => [decision.candidate.id, decision]));
  const selectedCart = fund.cart.find((item) => item.id === selectedCartId) ?? null;
  const selectedDecision = selectedCart ? decisionByCartId.get(selectedCart.id) : null;
  const goalDefault = selectedDecision?.candidate.pricePaise ?? 0;
  const topUpPaise = toPaise(topUpText);
  const overBy = fund.snapshot.monthlyBudgetPaise > 0 ? Math.max(0, fund.snapshot.spentThisCyclePaise + topUpPaise - fund.snapshot.monthlyBudgetPaise) : 0;
  const cartTotal = fund.cartPlan.decisions.reduce((sum, decision) => sum + decision.candidate.pricePaise, 0);
  const overflow = Math.max(0, cartTotal - Math.max(0, fund.snapshot.budgetRemainingPaise));
  const visibleDecisions = buyOnly ? fund.cartPlan.decisions.filter((decision) => decision.action === 'buy_now') : fund.cartPlan.decisions;
  const createGoal = () => {
    if (!selectedCart) return;
    const target = toPaise(goalTarget) || goalDefault;
    if (!target) return;
    fund.startPiggyBank(selectedCart.workId, selectedCart.editionId, goalName.trim() || titleByWork.get(selectedCart.workId) || 'Comic goal', target);
    setNewGoalOpen(false);
    setGoalName('');
    setGoalTarget('');
    setGoalSchedule('manual');
  };
  return <AppShell active="library" title="Comic Wallet">
    <FlashList
      data={fund.ledger}
      keyExtractor={(item) => item.id}
      getItemType={() => 'wallet-ledger'}
      renderItem={({ item }) => <LedgerRow entry={item} />}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<>
        <Text style={styles.intro}>A calm plan for the comics you want to bring home.</Text>
        <View style={styles.hero}><Eyebrow>Available this month</Eyebrow><Text style={styles.available}>{money(fund.snapshot.availablePaise)}</Text><Text style={styles.heroCopy}>A virtual, user-declared ledger — never a payment account.</Text><View style={styles.budgetLine}><Text style={styles.budgetLabel}>{money(fund.snapshot.spentThisCyclePaise)} spent of {money(fund.snapshot.monthlyBudgetPaise || 0)}</Text><Text onPress={fund.snapshot.monthlyBudgetPaise ? undefined : () => setBudgetOpen(true)} style={[styles.budgetRemaining, fund.snapshot.budgetRemainingPaise < 0 && { color: color.warning }]}>{fund.snapshot.monthlyBudgetPaise ? fund.snapshot.budgetRemainingPaise >= 0 ? `${money(fund.snapshot.budgetRemainingPaise)} left` : `${money(-fund.snapshot.budgetRemainingPaise)} over` : 'Set a budget'}</Text></View><Progress value={fund.snapshot.monthlyBudgetPaise ? Math.min(1, fund.snapshot.spentThisCyclePaise / fund.snapshot.monthlyBudgetPaise) : 0} /></View>
        <View style={styles.heroActions}><Button style={styles.halfButton} onPress={() => setTopUpOpen(true)}>+ Add money</Button><Button kind="secondary" style={styles.halfButton} onPress={() => setBudgetOpen(true)}>Budget</Button></View>
        <View style={styles.walletNumbers}><Stat label="Reserved" value={money(fund.snapshot.reservedPaise)} /><Stat label="Spent" value={money(fund.snapshot.spentThisCyclePaise)} /><Stat label="Budget left" value={money(fund.snapshot.budgetRemainingPaise)} /></View>
        <SectionHeader title="Saving for" action="+ New goal" onAction={() => { setSelectedCartId(fund.cart[0]?.id ?? null); setNewGoalOpen(true); }} />
        {savingBanks.length ? <FlashList horizontal data={savingBanks} keyExtractor={(bank) => bank.id} getItemType={() => 'saving-bank'} renderItem={({ item }) => <BankCard bank={item} onPress={() => onSelect(item.id)} />} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList} style={styles.bankList} /> : <QuietEmpty copy="Set aside a little for the physical editions that matter most." action="Start a goal" onAction={() => setNewGoalOpen(true)} />}
        <SectionHeader title="Ready to buy" />
        {readyBanks.length || fund.cartPlan.decisions.some((decision) => decision.action === 'buy_now') ? <FlashList data={[...readyBanks.map((bank) => ({ kind: 'bank' as const, id: bank.id, title: bank.name })), ...fund.cartPlan.decisions.filter((decision) => decision.action === 'buy_now').map((decision) => ({ kind: 'cart' as const, id: decision.candidate.id, title: decision.candidate.title }))]} keyExtractor={(item) => `${item.kind}-${item.id}`} getItemType={(item) => item.kind} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList} style={styles.bankList} renderItem={({ item }) => <ReadyCard title={item.title} copy={item.kind === 'bank' ? 'Savings are ready for a current price check.' : 'Fits your comic plan this month.'} onPress={() => item.kind === 'bank' ? onSelect(item.id) : router.push('/wallet')} />} /> : <QuietEmpty copy="Nothing needs a buying decision right now. That is a good outcome too." />}
        <SectionHeader title="Smart cart" />
        {fund.cartPlan.buyNothing ? <View style={styles.buyNothing}><Eyebrow>Buy nothing right now</Eyebrow><Text style={styles.buyNothingText}>{fund.cartPlan.buyNothingReason}</Text></View> : null}
        {overflow > 0 ? <View style={styles.overflow}><Text style={styles.overflowTitle}>You’re {money(overflow)} over your comic budget.</Text><View style={styles.overflowActions}><Button kind="secondary" style={styles.halfButton} onPress={() => setBuyOnly(true)}>Stay within {money(Math.max(0, fund.snapshot.budgetRemainingPaise))}</Button><Button style={styles.halfButton} onPress={() => setTopUpOpen(true)}>Add money</Button></View></View> : null}
        {fund.cart.length ? <FlashList horizontal data={visibleDecisions} keyExtractor={(decision) => decision.candidate.id} getItemType={() => 'cart-plan'} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalList} style={styles.cartList} renderItem={({ item: decision }) => <CartCard decision={decision} onRemove={() => fund.removeItemFromCart(decision.candidate.id)} />} /> : null}
      </>}
      ListEmptyComponent={fund.cart.length ? null : <QuietEmpty copy="Your cart is empty. Add a comic from its detail page when a purchase deserves a closer look." />}
      ListFooterComponent={<SectionHeader title="Wallet activity" />}
    />
    {topUpOpen ? <SheetOverlay title="Add money"><Text style={styles.sheetCopy}>Record money you’ve set aside for comics. This never moves real money.</Text><View style={styles.sheetPills}>{[500, 1000, 2000].map((amount) => <Pill key={amount} label={money(amount * 100)} active={topUpText === String(amount)} onPress={() => setTopUpText(String(amount))} />)}</View><Input placeholder="Custom amount in ₹" value={topUpText} onChangeText={setTopUpText} />{overBy > 0 ? <Text style={styles.budgetWarning}>This takes you {money(overBy)} above the comic budget you set.</Text> : null}<Button disabled={!topUpPaise} style={styles.sheetButton} onPress={() => { fund.topUp(topUpPaise); setTopUpText(''); setTopUpOpen(false); }}>Add {topUpPaise ? money(topUpPaise) : 'money'}</Button>{activeBanks.length ? <Button disabled={!topUpPaise} kind="secondary" style={styles.transferButton} onPress={() => { fund.topUp(topUpPaise); const allocations = fund.allocateLumpSum(topUpPaise); setAllocationSummary(allocations.map((allocation) => ({ name: activeBanks.find((bank) => bank.id === allocation.piggyBankId)?.name ?? 'Goal', amountPaise: allocation.amountPaise }))); setTopUpText(''); setTopUpOpen(false); }}>Split across goals</Button> : null}<Button kind="ghost" onPress={() => setTopUpOpen(false)}>Cancel</Button></SheetOverlay> : null}
    {budgetOpen ? <SheetOverlay title="Monthly comic budget"><Text style={styles.sheetCopy}>A planning limit, not a hard stop. ComicPill will flag tradeoffs without getting in your way.</Text><Input placeholder="Monthly budget in ₹" value={budgetText} onChangeText={setBudgetText} /><View style={styles.sheetPills}>{[1000, 2000, 3000, 5000].map((amount) => <Pill key={amount} label={money(amount * 100)} active={budgetText === String(amount)} onPress={() => setBudgetText(String(amount))} />)}</View><Button disabled={!toPaise(budgetText)} style={styles.sheetButton} onPress={() => { fund.updateConfig({ monthlyBudgetPaise: toPaise(budgetText) }); setBudgetOpen(false); }}>Save budget</Button><Button kind="ghost" onPress={() => setBudgetOpen(false)}>Cancel</Button></SheetOverlay> : null}
    {newGoalOpen ? <SheetOverlay title="New Piggy Bank">{fund.cart.length ? <><Text style={styles.sheetCopy}>Choose a comic from your Wallet cart. For any other comic, open its detail page and choose “Save for this.”</Text><View style={styles.goalChoices}>{fund.cart.map((cart) => <Pill key={cart.id} label={titleByWork.get(cart.workId) ?? 'Comic'} active={selectedCartId === cart.id} onPress={() => { setSelectedCartId(cart.id); const decision = decisionByCartId.get(cart.id); setGoalTarget(decision ? String(decision.candidate.pricePaise / 100) : ''); }} />)}</View><Input placeholder="Goal name (optional)" value={goalName} onChangeText={setGoalName} /><Input placeholder="Target in ₹" value={goalTarget} onChangeText={setGoalTarget} /><Text style={styles.sheetLabel}>Planning cadence</Text><View style={styles.sheetPills}>{([['daily', '₹50/day'], ['weekly', '₹250/week'], ['monthly', '₹1,000/month'], ['manual', 'Manual only']] as const).map(([id, label]) => <Pill key={id} label={label} active={goalSchedule === id} onPress={() => setGoalSchedule(id)} />)}</View>{(toPaise(goalTarget) || goalDefault) && projectDate(toPaise(goalTarget) || goalDefault, 0, goalSchedule) ? <Text style={styles.projected}>You’ll reach this goal around {dateText(projectDate(toPaise(goalTarget) || goalDefault, 0, goalSchedule)!) }.</Text> : <Text style={styles.projected}>Manual savings stay flexible — add whatever feels right.</Text>}<Button disabled={!selectedCart || !(toPaise(goalTarget) || goalDefault)} style={styles.sheetButton} onPress={createGoal}>Start saving</Button></> : <><Text style={styles.sheetCopy}>Add a comic to your Wallet cart first, or open a comic’s detail page to start a goal with its exact edition and current best price.</Text><Button onPress={() => { setNewGoalOpen(false); router.push('/library'); }}>Browse Library</Button></>}<Button kind="ghost" onPress={() => setNewGoalOpen(false)}>Cancel</Button></SheetOverlay> : null}
    {allocationSummary ? <SheetOverlay title="Savings allocated"><Text style={styles.sheetCopy}>This month’s savings, split {allocationSummary.length === 1 ? 'one way' : `${allocationSummary.length} ways`}.</Text>{allocationSummary.length ? allocationSummary.map((allocation) => <View key={allocation.name} style={styles.allocationRow}><Text numberOfLines={1} style={styles.allocationName}>{allocation.name}</Text><Text style={styles.allocationAmount}>{money(allocation.amountPaise)}</Text></View>) : <Text style={styles.budgetWarning}>No active goal needs this amount yet.</Text>}<Button style={styles.sheetButton} onPress={() => setAllocationSummary(null)}>Done</Button></SheetOverlay> : null}
  </AppShell>;
}

function PiggyBankDetail({ fund, bank, onBack }: { fund: Fund; bank: Bank; onBack: () => void }) {
  const [contributeOpen, setContributeOpen] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [leftover, setLeftover] = useState<number | null>(null);
  const readiness = fund.readiness(bank.id);
  const best = bank.editionId ? fund.bestBuyFor(bank.editionId) : null;
  const remaining = Math.max(0, bank.targetPaise - bank.savedPaise);
  const otherGoals = fund.piggyBanks.filter((other) => other.id !== bank.id && other.status === 'saving');
  const amount = toPaise(amountText);
  const buy = () => {
    const price = best?.totalPaise ?? bank.targetPaise;
    const remaining = fund.settle(bank.id, price);
    if (remaining > 0) setLeftover(remaining);
    else onBack();
  };
  return <AppShell active="library" title="Piggy Bank"><FlashList data={fund.ledger.filter((entry) => entry.piggyBankId === bank.id)} keyExtractor={(entry) => entry.id} getItemType={() => 'piggy-ledger'} renderItem={({ item }) => <LedgerRow entry={item} />} contentContainerStyle={styles.content} ListHeaderComponent={<><Pressable onPress={onBack}><Text style={styles.back}>‹ Comic Wallet</Text></Pressable><Eyebrow>Saving for</Eyebrow><Text numberOfLines={2} style={styles.detailTitle}>{bank.name}</Text><View style={styles.goalHero}><Text style={styles.goalSaved}>{money(bank.savedPaise)}</Text><Text style={styles.goalTarget}>of {money(bank.targetPaise)}</Text><Progress value={bank.targetPaise ? bank.savedPaise / bank.targetPaise : 0} /><View style={styles.goalNumbers}><Text style={styles.goalNumber}>{money(remaining)} remaining</Text><Text style={styles.goalNumber}>{Math.round(Math.min(1, bank.savedPaise / bank.targetPaise) * 100)}%</Text></View></View><View style={styles.schedule}><Eyebrow>Saving plan</Eyebrow><Text style={styles.scheduleTitle}>Manual contributions</Text><Text style={styles.scheduleCopy}>Add savings when it suits you. Scheduled rules are not active in this virtual-ledger V1.</Text></View><ReadinessCard readiness={readiness} bestPrice={best?.totalPaise ?? null} onBuy={buy} onContribute={() => { if (readiness?.shortfallPaise) { setAmountText(String(readiness.shortfallPaise / 100)); } setContributeOpen(true); }} onUseWallet={() => { const usable = Math.min(Math.max(0, fund.snapshot.availablePaise), readiness?.shortfallPaise ?? 0); if (usable) fund.contribute(bank.id, usable); }} /><View style={styles.detailActions}><Button style={styles.halfButton} onPress={() => setContributeOpen(true)}>+ Add savings</Button><Button kind="secondary" style={styles.halfButton} onPress={onBack}>Keep saving</Button></View><SectionHeader title="Goal activity" /></>} ListEmptyComponent={<QuietEmpty copy="Your first contribution will appear here." />} ListFooterComponent={<Button kind="destructive" style={styles.deleteButton} onPress={() => { fund.cancel(bank.id); onBack(); }}>Cancel goal</Button>} />{contributeOpen ? <SheetOverlay title="Add savings"><Text style={styles.sheetCopy}>Record an amount you’re putting toward this comic.</Text><View style={styles.sheetPills}>{[50, 100, 250, 500].map((value) => <Pill key={value} label={money(value * 100)} active={amountText === String(value)} onPress={() => setAmountText(String(value))} />)}</View><Input placeholder="Custom amount in ₹" value={amountText} onChangeText={setAmountText} /><Button disabled={!amount} style={styles.sheetButton} onPress={() => { fund.contribute(bank.id, amount); setAmountText(''); setContributeOpen(false); }}>Add {amount ? money(amount) : 'savings'}</Button><Button kind="ghost" onPress={() => setContributeOpen(false)}>Cancel</Button></SheetOverlay> : null}{leftover != null && leftover > 0 ? <SheetOverlay title="Leftover savings"><Text style={styles.sheetCopy}>What should happen to {money(leftover)}?</Text><Button onPress={() => { fund.settleLeftoverToWallet(bank.id, leftover); setLeftover(null); onBack(); }}>Return to wallet</Button>{otherGoals.map((goal) => <Button key={goal.id} kind="secondary" style={styles.transferButton} onPress={() => { fund.settleLeftoverToPiggyBank(bank.id, goal.id, leftover); setLeftover(null); onBack(); }}>Move to {goal.name}</Button>)}<Button kind="ghost" onPress={() => setLeftover(null)}>Decide later</Button></SheetOverlay> : null}</AppShell>;
}

function BankCard({ bank, onPress }: { bank: Bank; onPress: () => void }) {
  const value = bank.targetPaise ? Math.min(1, bank.savedPaise / bank.targetPaise) : 0;
  return <Pressable onPress={onPress} style={styles.bankCard}><Eyebrow>Saving for</Eyebrow><Text numberOfLines={2} style={styles.bankTitle}>{bank.name}</Text><Text style={styles.bankMeta}>{money(bank.savedPaise)} of {money(bank.targetPaise)}</Text><Progress value={value} /><Text style={styles.bankPercent}>{Math.round(value * 100)}%</Text></Pressable>;
}

function ReadyCard({ title, copy, onPress }: { title: string; copy: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.readyCard}><Eyebrow>Ready to consider</Eyebrow><Text numberOfLines={2} style={styles.bankTitle}>{title}</Text><Text style={styles.readyCopy}>{copy}</Text><Text style={styles.readyAction}>Review →</Text></Pressable>;
}

function CartCard({ decision, onRemove }: { decision: Fund['cartPlan']['decisions'][number]; onRemove: () => void }) {
  const action = decision.action === 'buy_now' ? 'Buy now' : decision.action === 'postpone' ? 'Postpone' : 'Wait';
  return <View style={styles.cartCard}><Eyebrow>{action}</Eyebrow><Text numberOfLines={2} style={styles.bankTitle}>{decision.candidate.title}</Text><Text style={styles.cartPrice}>{money(decision.candidate.pricePaise)}</Text><Text numberOfLines={3} style={styles.cartReason}>{decision.reason}</Text><Pressable onPress={onRemove}><Text style={styles.removeCart}>Remove</Text></Pressable></View>;
}

function ReadinessCard({ readiness, bestPrice, onBuy, onContribute, onUseWallet }: { readiness: ReturnType<Fund['readiness']>; bestPrice: number | null; onBuy: () => void; onContribute: () => void; onUseWallet: () => void }) {
  if (!readiness || readiness.verdict === 'saving') return null;
  if (readiness.verdict === 'can_afford_now') return <View style={styles.readiness}><Eyebrow>Current price checked</Eyebrow><Text style={styles.readinessTitle}>You can afford it now.</Text><Text style={styles.readinessCopy}>{bestPrice != null ? `Best current price: ${money(bestPrice)}. ` : ''}{readiness.surplusPaise ? `${money(readiness.surplusPaise)} stays after this buy.` : 'Your goal covers the price.'}</Text><View style={styles.detailActions}><Button style={styles.halfButton} onPress={onBuy}>Buy</Button><Button kind="secondary" style={styles.halfButton} onPress={() => undefined}>Keep saving</Button></View></View>;
  if (readiness.verdict === 'price_increased') return <View style={styles.readiness}><Eyebrow>Current price checked</Eyebrow><Text style={styles.readinessTitle}>Price increased by {money(readiness.shortfallPaise)}.</Text><Text style={styles.readinessCopy}>Your saved amount reached the original target, but today’s best price is higher.</Text><View style={styles.priceActions}><Button style={styles.halfButton} onPress={onContribute}>Add {money(readiness.shortfallPaise)}</Button><Button kind="secondary" style={styles.halfButton} onPress={() => undefined}>Wait</Button><Button kind="secondary" style={styles.fullButton} onPress={onUseWallet}>Use wallet balance</Button></View></View>;
  return <View style={styles.readiness}><Eyebrow>Almost there</Eyebrow><Text style={styles.readinessTitle}>Ready to check today’s price.</Text><Text style={styles.readinessCopy}>You’re close to the target. Review the current price before deciding.</Text></View>;
}

function LedgerRow({ entry }: { entry: Fund['ledger'][number] }) {
  const incoming = entry.type === 'top_up' || entry.type === 'piggy_refund';
  const label = entry.type === 'top_up' ? 'Added to Wallet' : entry.type === 'purchase' ? 'Comic purchase' : entry.type === 'piggy_contribution' ? 'Moved to Piggy Bank' : 'Returned to Wallet';
  return <View style={styles.ledgerRow}><View style={[styles.ledgerMark, { backgroundColor: incoming ? color.positive + '44' : color.surface2 }]}><Text style={[styles.ledgerIcon, { color: incoming ? color.positive : color.muted }]}>{incoming ? '+' : '−'}</Text></View><View style={styles.ledgerBody}><Text style={styles.ledgerTitle}>{entry.note ?? label}</Text><Text style={styles.ledgerMeta}>{new Date(entry.occurredAt).toLocaleDateString('en-IN')}</Text></View><Text style={[styles.ledgerAmount, { color: incoming ? color.positive : color.text }]}>{incoming ? '+' : '−'}{money(entry.amountPaise)}</Text></View>;
}

function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function QuietEmpty({ copy, action, onAction }: { copy: string; action?: string; onAction?: () => void }) { return <View style={styles.quietEmpty}><Text style={styles.quietCopy}>{copy}</Text>{action ? <Pressable onPress={onAction}><Text style={styles.quietAction}>{action} →</Text></Pressable> : null}</View>; }
function SheetOverlay({ title, children }: PropsWithChildren<{ title: string }>) { return <View style={styles.overlay}><Sheet title={title}>{children}</Sheet></View>; }

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 105 }, intro: { color: color.text, fontFamily: font.display, fontSize: 27, lineHeight: 34, maxWidth: 326 }, hero: { marginTop: space.lg, padding: space.lg, backgroundColor: color.surface, borderRadius: radius.lg, borderColor: color.border, borderWidth: 1 }, available: { color: color.text, fontFamily: font.display, fontSize: 38, lineHeight: 44, marginTop: 6 }, heroCopy: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 17, marginTop: 5 }, budgetLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: space.lg, marginBottom: 8 }, budgetLabel: { flex: 1, color: color.muted, fontFamily: font.body, fontSize: 11 }, budgetRemaining: { color: color.accent, fontFamily: font.bodySemibold, fontSize: 11 }, heroActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md }, halfButton: { flex: 1, paddingHorizontal: space.sm }, fullButton: { width: '100%', paddingHorizontal: space.sm }, walletNumbers: { flexDirection: 'row', gap: space.sm, marginTop: space.md }, stat: { flex: 1, minHeight: 66, backgroundColor: color.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, padding: space.sm }, statValue: { color: color.text, fontFamily: font.displayMedium, fontSize: 15 }, statLabel: { color: color.faint, fontFamily: font.bodyMedium, fontSize: 10, marginTop: 4 }, horizontalList: { gap: space.sm, paddingRight: space.lg }, bankList: { height: 170, marginHorizontal: -space.lg }, cartList: { height: 190, marginTop: space.md, marginHorizontal: -space.lg }, bankCard: { width: 176, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.md, padding: space.md }, readyCard: { width: 176, backgroundColor: color.surface2, borderWidth: 1, borderColor: color.accentDeep, borderRadius: radius.md, padding: space.md }, cartCard: { width: 204, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.md, padding: space.md }, cartPrice: { color: color.collectGold, fontFamily: font.bodySemibold, fontSize: type.caption, marginTop: 5 }, cartReason: { color: color.muted, fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 7 }, removeCart: { color: color.accent, fontFamily: font.bodySemibold, fontSize: 11, marginTop: 8 }, bankTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, lineHeight: 21, marginTop: 5 }, bankMeta: { color: color.muted, fontFamily: font.body, fontSize: 11, marginTop: 5, marginBottom: 9 }, bankPercent: { color: color.accent, fontFamily: font.bodySemibold, fontSize: 11, marginTop: 8 }, readyCopy: { color: color.muted, fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 7 }, readyAction: { color: color.accent, fontFamily: font.bodySemibold, fontSize: 12, marginTop: 10 }, quietEmpty: { minHeight: 88, justifyContent: 'center', padding: space.md, backgroundColor: color.surface2, borderRadius: radius.md, borderColor: color.border, borderWidth: 1 }, quietCopy: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 19 }, quietAction: { color: color.accent, fontFamily: font.bodySemibold, fontSize: type.caption, marginTop: 9 }, buyNothing: { padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface2 }, buyNothingText: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, lineHeight: 23, marginTop: 6 }, overflow: { marginTop: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: color.warning + '99', backgroundColor: color.surface }, overflowTitle: { color: color.warning, fontFamily: font.displayMedium, fontSize: type.subtitle }, overflowActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md }, ledgerRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.border }, ledgerMark: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, ledgerIcon: { fontFamily: font.bodySemibold, fontSize: 20 }, ledgerBody: { flex: 1, minWidth: 0 }, ledgerTitle: { color: color.text, fontFamily: font.bodyMedium, fontSize: type.caption }, ledgerMeta: { color: color.faint, fontFamily: font.body, fontSize: 10, marginTop: 2 }, ledgerAmount: { fontFamily: font.bodySemibold, fontSize: type.caption }, back: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.body, marginBottom: space.lg }, detailTitle: { color: color.text, fontFamily: font.display, fontSize: 31, lineHeight: 37, marginTop: 6 }, goalHero: { marginTop: space.lg, padding: space.lg, backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border }, goalSaved: { color: color.text, fontFamily: font.display, fontSize: 34 }, goalTarget: { color: color.muted, fontFamily: font.body, fontSize: type.caption, marginBottom: space.md }, goalNumbers: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 }, goalNumber: { color: color.muted, fontFamily: font.bodyMedium, fontSize: type.caption }, schedule: { marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: color.surface2, borderWidth: 1, borderColor: color.border }, scheduleTitle: { color: color.text, fontFamily: font.displayMedium, fontSize: type.subtitle, marginTop: 5 }, scheduleCopy: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 4 }, readiness: { marginTop: space.md, padding: space.md, borderRadius: radius.md, borderColor: color.accentDeep, borderWidth: 1, backgroundColor: color.surface }, readinessTitle: { color: color.text, fontFamily: font.display, fontSize: type.title, marginTop: 5 }, readinessCopy: { color: color.muted, fontFamily: font.body, fontSize: type.caption, lineHeight: 19, marginTop: 5 }, detailActions: { flexDirection: 'row', gap: space.sm, marginTop: space.md }, priceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md }, deleteButton: { marginTop: space.xl }, overlay: { ...StyleSheet.absoluteFill, zIndex: 20, justifyContent: 'flex-end', backgroundColor: '#000000aa' }, sheetCopy: { color: color.muted, fontFamily: font.body, fontSize: type.body, lineHeight: 22, marginBottom: space.md }, sheetButton: { marginTop: space.md }, sheetPills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }, sheetLabel: { color: color.text, fontFamily: font.bodySemibold, fontSize: type.caption, marginTop: space.md, marginBottom: space.sm }, budgetWarning: { color: color.warning, fontFamily: font.bodyMedium, fontSize: type.caption, lineHeight: 19, marginTop: space.sm }, goalChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }, projected: { color: color.positive, fontFamily: font.bodyMedium, fontSize: type.caption, lineHeight: 19, marginTop: space.sm }, transferButton: { marginTop: space.sm }, allocationRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.border }, allocationName: { flex: 1, color: color.text, fontFamily: font.bodyMedium, fontSize: type.caption }, allocationAmount: { color: color.positive, fontFamily: font.bodySemibold, fontSize: type.caption },
});
