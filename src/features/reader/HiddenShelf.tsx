// The hidden shelf on "On my phone". Swipe the shelf from right to left and a panel follows the finger in from the right edge; let go past a
// quarter of the way and it settles half open, asking for the password. The right password slides it the rest of the way, showing the
// hidden comics. Swiping it back to the right, Back, tapping the dimmed shelf, or the app leaving the foreground all close it again.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, AppState, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { feedback } from '../../lib/platform/feedback';
import { onMyDevice } from '../../lib/platform/device';
import { askToUseBiometrics, biometricName, biometricsOn, confirmWithBiometrics } from '../../lib/platform/biometrics';
import { Icon } from '../../ui/Icon';
import { Button } from '../../ui/primitives';
import { useAppearance, type ThemeColors, type TypographyPreset } from '../../ui/theme';
import { radius, space } from '../../ui/tokens';
import { ActionSheet, type SheetOption } from './dialogs';
import {
  checkHiddenShelfPassword, hiddenShelfReady, hiddenShelfUsesBiometrics, setHiddenShelfBiometrics, hideComics, listHiddenComics, newPasswordProblem, offsetFor, resetHiddenShelf, settleAfterSwipe,
  setUpHiddenShelf, unhideComics, type PanelStop,
} from '../../lib/reader/hiddenShelf';
import { allReaderComicIds, type ReaderComic } from '../../lib/reader/readerLibrary';
import { pickAndImportComics, removeComics } from '../../lib/reader/importComics';
import { runJob } from '../../lib/reader/importJob';

const SPRING = { damping: 22, stiffness: 220, mass: 0.9 };

type Props = {
  /** Off while selecting or dragging comics on the shelf, so the two gestures never fight. */
  enabled: boolean;
  /** Opens a hidden comic in the reader. The panel stays open underneath, so Back from the reader lands here again. */
  onOpenComic: (comic: ReaderComic) => void;
  /** Something moved between the hidden shelf and the normal one: the shelf behind should reload. */
  onShelfChanged: () => void;
  children: ReactNode;
};

export function HiddenShelf({ enabled, onOpenComic, onShelfChanged, children }: Props) {
  const { theme, typography } = useAppearance(); const c = theme.colors;
  const styles = useMemo(() => makeStyles(c, typography), [c, typography]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const { width: screenW } = useWindowDimensions();
  const W = box.w || screenW;

  const [stop, setStopState] = useState<PanelStop>('closed');
  // How far the panel's left edge sits from the container's left edge: W = shut, W/2 = half open, 0 = open. `rest` is where it settles now.
  const offset = useSharedValue(W);
  const rest = useSharedValue(W);
  const shake = useSharedValue(0);
  // A rotation or resize keeps the panel at the same stop.
  useEffect(() => {
    const want = offsetFor(stop, W);
    if (rest.get() !== want) { rest.set(want); offset.set(want); } // only when the width changed: a stop change has already set (and is animating) it
  }, [W, stop, offset, rest]);
  // The panel is only on screen while it is open or being pulled out. Shut, it isn't drawn at all, so nothing of it can be left showing
  // (Android can keep a paused view where it last was when the app went to the background mid-animation).
  const [shown, setShown] = useState(false);

  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [setup, setSetup] = useState<{ pw: string; again: string } | null>(null);
  const [comics, setComics] = useState<ReaderComic[]>([]);
  const [sheet, setSheet] = useState<{ title?: string; options: SheetOption[] } | null>(null);

  const reload = useCallback(() => setComics(listHiddenComics()), []);
  // With a fingerprint set up (and allowed in Settings) the half-open panel asks for it first; the password is always there too.
  const [bio, setBio] = useState<string | null>(null);
  // (Re-checked each time the panel opens: the choice can change in Settings → Hidden shelf.)
  useEffect(() => { if (stop !== 'closed') return undefined; let live = true; void biometricsOn().then(async (on) => { if (!live) return; setBio(on && hiddenShelfUsesBiometrics() ? await biometricName() : null); }); return () => { live = false; }; }, [stop]);

  // `animate` is off when the app is leaving the foreground: animations don't run in the background, so the panel would stay drawn where it was.
  const goTo = useCallback((next: PanelStop, animate = true) => {
    setStopState(next);
    rest.set(offsetFor(next, W));
    if (next !== 'closed') setShown(true);
    if (!animate) { offset.set(offsetFor(next, W)); if (next === 'closed') setShown(false); }
    // Shut: it leaves the screen once the slide out has finished.
    else offset.set(withSpring(offsetFor(next, W), SPRING, (done) => { if (done && next === 'closed') scheduleOnRN(setShown, false); }));
    if (next !== 'open') setComics([]); // nothing hidden stays in memory (or on screen) once the panel isn't fully open
    if (next === 'closed') { setPassword(''); setWrong(false); setSetup(null); }
  }, [W, offset, rest]);
  const close = useCallback(() => goTo('closed'), [goTo]);
  const unlockWithBio = useCallback(async () => {
    if (await confirmWithBiometrics('the hidden shelf')) { feedback.success(); setPassword(''); setWrong(false); reload(); goTo('open'); }
  }, [reload, goTo]);
  const stayPut = useCallback(() => goTo(stop), [goTo, stop]);

  // Back closes the panel instead of leaving the shelf; leaving the app locks it.
  // (Only while the shelf is the screen on top: with a hidden comic open in the reader, Back belongs to the reader.)
  useFocusEffect(useCallback(() => {
    if (stop === 'closed') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [stop, close]));
  useEffect(() => {
    if (stop === 'closed') return undefined;
    // Only a real trip to the background locks it: iOS reports 'inactive' while Face ID is asking.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'background') goTo('closed', false); });
    return () => sub.remove();
  }, [stop, goTo]);

  // ---- gestures -------------------------------------------------------------------------------------------------------------------
  const crossed = useSharedValue(false);
  const tick = useCallback(() => feedback.select(), []);
  const settle = useCallback((dx: number, vx: number) => {
    const next = settleAfterSwipe(dx, vx, W);
    if (next === 'half') feedback.tap();
    goTo(next);
    if (next === 'half' && bio && hiddenShelfReady()) void unlockWithBio();
  }, [W, goTo, bio, unlockWithBio]);
  // Right-to-left on the shelf pulls the panel out. It only starts once the finger has clearly gone sideways, so scrolling is untouched.
  const pullOut = useMemo(() => Gesture.Pan()
    .enabled(enabled && stop === 'closed')
    .activeOffsetX(-22).failOffsetX(18).failOffsetY([-16, 16])
    .onBegin(() => { crossed.set(false); })
    .onStart(() => { scheduleOnRN(setShown, true); })
    .onUpdate((e) => {
      const half = W / 2;
      // Follows the finger up to half open, then stiffens: it never opens further without the password.
      const raw = W + e.translationX;
      offset.set(raw >= half ? raw : half - (half - raw) * 0.15);
      const past = -e.translationX > W * 0.25;
      if (past !== crossed.get()) { crossed.set(past); scheduleOnRN(tick); }
    })
    .onEnd((e) => { scheduleOnRN(settle, e.translationX, e.velocityX); }),
  [enabled, stop, W, offset, crossed, tick, settle]);
  // Left-to-right on the panel pushes it away.
  const pushBack = useMemo(() => Gesture.Pan()
    .enabled(stop !== 'closed')
    .activeOffsetX(22).failOffsetX(-18).failOffsetY([-16, 16])
    .onUpdate((e) => { offset.set(Math.min(W, rest.get() + Math.max(0, e.translationX))); })
    .onEnd((e) => { if (e.translationX > W * 0.2 || e.velocityX > 600) scheduleOnRN(close); else scheduleOnRN(stayPut); }),
  [stop, W, offset, rest, close, stayPut]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() + shake.get() }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: interpolate(offset.get(), [0, W / 2, W], [0.75, 0.55, 0]) }));

  // ---- password -----------------------------------------------------------------------------------------------------------------
  const unlock = async () => {
    if (!password) return;
    if (await checkHiddenShelfPassword(password)) {
      feedback.success(); setPassword(''); setWrong(false); reload(); goTo('open');
    } else {
      feedback.warning(); setWrong(true); setPassword('');
      shake.set(withSequence(withTiming(-12, { duration: 50 }), withTiming(12, { duration: 70 }), withTiming(-8, { duration: 60 }), withTiming(0, { duration: 50 })));
    }
  };
  const forgot = () => Alert.alert('Forgot the password?', 'It can’t be recovered. Starting over deletes every comic on the hidden shelf from this device, then you can choose a new password.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete hidden comics and start over', style: 'destructive', onPress: () => { const n = resetHiddenShelf(); feedback.warning(); onShelfChanged(); setSetup({ pw: '', again: '' }); goTo('open'); Alert.alert('Started over', `${n} hidden ${n === 1 ? 'comic was' : 'comics were'} deleted. Choose a new password.`); } },
  ]);
  const saveSetup = async () => {
    if (!setup) return;
    const problem = newPasswordProblem(setup.pw, setup.again);
    if (problem) { feedback.warning(); Alert.alert('Check the password', problem); return; }
    await setUpHiddenShelf(setup.pw);
    setHiddenShelfBiometrics(await askToUseBiometrics('the hidden shelf'));
    feedback.success(); setSetup(null); reload(); goTo('open');
  };

  // ---- the hidden comics ---------------------------------------------------------------------------------------------------------
  const importHere = async () => {
    const before = new Set(allReaderComicIds());
    const started = await runJob('Importing to the hidden shelf', async (p) => {
      const result = await pickAndImportComics(p);
      hideComics(allReaderComicIds().filter((id) => !before.has(id)));
      return { verb: 'Hid', result };
    });
    if (!started) Alert.alert('Another import is running', 'Wait for it to finish, then try again.');
    reload(); onShelfChanged();
  };
  const comicMenu = (comic: ReaderComic) => { feedback.hold(); setSheet({
    title: comic.title,
    options: [
      { label: 'Open', onPress: () => onOpenComic(comic) },
      { label: `Move back to ${onMyDevice()}`, onPress: () => { unhideComics([comic.id]); feedback.success(); reload(); onShelfChanged(); } },
      { label: 'Delete from device', destructive: true, onPress: () => Alert.alert('Delete comic?', `“${comic.title}” will be removed from this device.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { removeComics([comic.id]); feedback.warning(); reload(); } },
      ]) },
    ],
  }); };

  const ready = hiddenShelfReady();
  const cols = Math.max(3, Math.floor(W / 130));
  const cell = (W - space.lg * 2 - space.md * (cols - 1)) / cols;

  const halfBody = !ready && !setup ? (
    <View style={[styles.halfBody, { width: W / 2 }]}>
      <Icon name="eye-off-outline" size={34} color={c.primary} />
      <Text style={styles.halfTitle}>No hidden shelf yet</Text>
      <Text style={styles.halfText}>Keep some comics behind a password of their own.</Text>
      <Button onPress={() => { setSetup({ pw: '', again: '' }); goTo('open'); }}>Set it up</Button>
    </View>
  ) : (
    <Animated.View style={[styles.halfBody, { width: W / 2 }]}>
      <Icon name="lock-closed" size={32} color={c.primary} />
      <Text style={styles.halfTitle}>Hidden shelf</Text>
      <TextInput autoFocus={!bio} value={password} onChangeText={(t) => { setPassword(t); setWrong(false); }} onSubmitEditing={unlock} secureTextEntry placeholder="Password" placeholderTextColor={c.textMuted}
        autoCapitalize="none" autoCorrect={false} returnKeyType="go" submitBehavior="submit" style={[styles.input, wrong && { borderColor: c.destructive }]} accessibilityLabel="Hidden shelf password" />
      {wrong ? <Text style={styles.wrong}>Wrong password</Text> : null}
      <Button onPress={unlock} disabled={!password}>Unlock</Button>
      {bio ? <Button kind="secondary" onPress={() => { void unlockWithBio(); }}>{`Use ${bio}`}</Button> : null}
      <Pressable onPress={forgot} hitSlop={8}><Text style={styles.link}>Forgot it?</Text></Pressable>
    </Animated.View>
  );

  // While the finger pulls it out: just the lock and the name, no field (the keyboard opens once it settles).
  const peek = (
    <View style={[styles.halfBody, { width: W / 2 }]}>
      <Icon name={ready ? 'lock-closed' : 'eye-off-outline'} size={32} color={c.primary} />
      <Text style={styles.halfTitle}>{ready ? 'Hidden shelf' : 'No hidden shelf yet'}</Text>
    </View>
  );

  const setupBody = setup ? (
    <ScrollView contentContainerStyle={styles.setup} keyboardShouldPersistTaps="handled">
      <Icon name="eye-off-outline" size={36} color={c.primary} />
      <Text style={styles.openTitle}>Set up your hidden shelf</Text>
      <Text style={styles.halfText}>{`Comics you put here disappear from your shelf, folders, Reading now and search. To open it, swipe ${onMyDevice()} from right to left and type this password.`}</Text>
      <TextInput value={setup.pw} onChangeText={(t) => setSetup({ ...setup, pw: t })} secureTextEntry placeholder="New password (4+ characters)" placeholderTextColor={c.textMuted} autoCapitalize="none" autoCorrect={false} style={styles.input} />
      <TextInput value={setup.again} onChangeText={(t) => setSetup({ ...setup, again: t })} onSubmitEditing={saveSetup} secureTextEntry placeholder="Type it again" placeholderTextColor={c.textMuted} autoCapitalize="none" autoCorrect={false} returnKeyType="done" style={styles.input} />
      <Text style={styles.note}>There is no way to recover a forgotten password: starting over deletes the hidden comics.</Text>
      <Button onPress={saveSetup} disabled={!setup.pw || !setup.again}>Create hidden shelf</Button>
      <Button kind="ghost" onPress={close}>Not now</Button>
    </ScrollView>
  ) : null;

  const openBody = (
    <View style={styles.fill}>
      <View style={styles.openHead}>
        <View style={styles.fill}>
          <Text style={styles.openTitle}>Hidden shelf</Text>
          <Text style={styles.halfText}>{`${comics.length} ${comics.length === 1 ? 'comic' : 'comics'} · only you can see these`}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Import into the hidden shelf" onPress={importHere} hitSlop={8} style={styles.headBtn}><Icon name="add" size={22} color={c.textPrimary} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Lock the hidden shelf" onPress={close} hitSlop={8} style={styles.headBtn}><Icon name="lock-closed" size={20} color={c.textPrimary} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.grid, { gap: space.md }]}>
        {comics.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.halfTitle}>Nothing hidden yet</Text>
            <Text style={styles.halfText}>Long-press a comic on your shelf and choose “Move to hidden shelf”, or tap + to import files straight here.</Text>
          </View>
        ) : comics.map((comic) => (
          <Pressable key={comic.id} accessibilityRole="button" accessibilityLabel={comic.title} style={{ width: cell }} onPress={() => { feedback.tap(); onOpenComic(comic); }} onLongPress={() => comicMenu(comic)}>
            <View style={styles.cover}>
              {comic.coverPath ? <Image source={{ uri: comic.coverPath }} style={styles.fillAbs} contentFit="cover" recyclingKey={`hidden-${comic.id}`} /> : <Text numberOfLines={4} style={styles.coverText}>{comic.title}</Text>}
            </View>
            <Text numberOfLines={2} style={styles.title}>{comic.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.fill} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <GestureDetector gesture={pullOut}>
        <View style={styles.fill} collapsable={false}>{children}</View>
      </GestureDetector>
      {shown ? (
        <>
          <Animated.View pointerEvents={stop === 'closed' ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
            <Pressable accessibilityLabel="Close the hidden shelf" style={StyleSheet.absoluteFill} onPress={close} />
          </Animated.View>
          <GestureDetector gesture={pushBack}>
            <Animated.View style={[styles.panel, { width: W }, panelStyle]} accessibilityViewIsModal={stop !== 'closed'}>
              <View style={styles.edge} />
              {stop === 'open' ? (setup ? setupBody : openBody) : stop === 'half' ? halfBody : peek}
            </Animated.View>
          </GestureDetector>
        </>
      ) : null}
      <ActionSheet visible={!!sheet} title={sheet?.title} options={sheet?.options ?? []} onClose={() => setSheet(null)} />
    </View>
  );
}

function makeStyles(c: ThemeColors, t: TypographyPreset) {
  return StyleSheet.create({
    fill: { flex: 1 },
    fillAbs: { ...StyleSheet.absoluteFill },
    scrim: { backgroundColor: '#000' },
    panel: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: c.background, borderLeftWidth: 1, borderLeftColor: c.border, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: -6, height: 0 }, elevation: 16 },
    edge: { position: 'absolute', left: 6, top: '45%', width: 4, height: 44, borderRadius: 2, backgroundColor: c.border },
    halfBody: { paddingHorizontal: space.lg, paddingTop: space.xl * 1.5, gap: space.md, alignItems: 'stretch' },
    halfTitle: { color: c.textPrimary, fontFamily: t.displayMedium, fontSize: 18 },
    halfText: { color: c.textSecondary, fontFamily: t.body, fontSize: 13, lineHeight: 19 },
    note: { color: c.textMuted, fontFamily: t.body, fontSize: 12, lineHeight: 17 },
    input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceRaised, color: c.textPrimary, paddingHorizontal: space.md, fontFamily: t.body, fontSize: 16 },
    wrong: { color: c.destructive, fontFamily: t.bodySemibold, fontSize: 13 },
    link: { color: c.textSecondary, fontFamily: t.bodySemibold, fontSize: 13, textAlign: 'center', paddingVertical: space.xs },
    setup: { padding: space.lg, paddingTop: space.xl * 1.5, gap: space.md },
    openHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
    openTitle: { color: c.textPrimary, fontFamily: t.display, fontSize: 26 },
    headBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.lg, paddingBottom: 120 },
    empty: { width: '100%', gap: space.sm, paddingTop: space.xl },
    cover: { aspectRatio: 2 / 3, borderRadius: 12, overflow: 'hidden', backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', padding: 6 },
    coverText: { color: c.textPrimary, fontFamily: t.bodySemibold, fontSize: 12, textAlign: 'center' },
    title: { color: c.textPrimary, fontFamily: t.bodyMedium, fontSize: 12, lineHeight: 16, marginTop: 6 },
  });
}
