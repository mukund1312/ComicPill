import { Icon } from '../../ui/Icon';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import ArcRelevance from '../arc/ArcRelevance';
import { ComicCover } from '../../ui/comic';
import { radius } from '../../ui/tokens';

import { useThemed, type Palette, type Fonts } from '../../ui/theme';
import { isAccessible } from '../../lib/util/own';
import type { buildDeck } from '../../lib/engines/recommend/deck';

type DeckCard = ReturnType<typeof buildDeck>[number];

const SWIPE_DISTANCE = 0.26; // of the screen width
const SWIPE_VELOCITY = 800;

/**
 * Tinder-style card: drag it and it tilts and follows your finger; let go past the edge and it flies off.
 * Right = save / read, left = pass, up = rate (the card stays and the rating sheet opens). The buttons do the same thing.
 */
export function SwipeDeck({ card, next, onPass, onSave, onRate }: { card: DeckCard; next: DeckCard | null; onPass: () => void; onSave: () => void; onRate: () => void }) {
  const { color, styles } = useThemed(makeStyles);
  const { width } = useWindowDimensions();
  const x = useSharedValue(0); const y = useSharedValue(0);
  const away = width * 1.5;

  const pan = Gesture.Pan()
    // Only sideways drags belong to the card; a drag that goes up or down first is the page scrolling, so it fails and the list takes it.
    .activeOffsetX([-12, 12]).failOffsetY([-24, 24])
    .onUpdate((e) => { x.value = e.translationX; y.value = e.translationY * 0.25; })
    .onEnd((e) => {
      if (e.translationX > width * SWIPE_DISTANCE || e.velocityX > SWIPE_VELOCITY) {
        x.value = withTiming(away, { duration: 220 }, (done) => { if (done) scheduleOnRN(onSave); });
      } else if (e.translationX < -width * SWIPE_DISTANCE || e.velocityX < -SWIPE_VELOCITY) {
        x.value = withTiming(-away, { duration: 220 }, (done) => { if (done) scheduleOnRN(onPass); });
      } else {
        x.value = withSpring(0, { damping: 16, stiffness: 190 }); y.value = withSpring(0, { damping: 16, stiffness: 190 });
      }
    });

  const fly = (dir: 'left' | 'right') => {
    x.value = withTiming(dir === 'right' ? away : -away, { duration: 260 }, (done) => { if (done) scheduleOnRN(dir === 'right' ? onSave : onPass); });
  };

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${interpolate(x.value, [-width, 0, width], [-16, 0, 16])}deg` }],
  }));
  const behind = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(x.value), [0, width * 0.4], [0.7, 1], 'clamp'),
    transform: [{ scale: interpolate(Math.abs(x.value), [0, width * 0.5], [0.93, 1], 'clamp') }, { translateY: interpolate(Math.abs(x.value), [0, width * 0.5], [14, 0], 'clamp') }],
  }));
  const saveStamp = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [16, 110], [0, 1], 'clamp') }));
  const passStamp = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-110, -16], [1, 0], 'clamp') }));

  return (
    <>
      <View style={styles.deck}>
        {next ? <Animated.View style={[styles.cardWrap, styles.behind, behind]} pointerEvents="none"><CardFace card={next} /></Animated.View> : <View style={styles.ghost} />}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.cardWrap, cardStyle]}>
            <CardFace card={card} />
            <Animated.View pointerEvents="none" style={[styles.stamp, styles.stampSave, saveStamp]}><Text style={[styles.stampText, { color: color.positive }]}>{isAccessible(card.work.own) ? 'CONTINUE' : 'SAVE'}</Text></Animated.View>
            <Animated.View pointerEvents="none" style={[styles.stamp, styles.stampPass, passStamp]}><Text style={[styles.stampText, { color: color.accent }]}>PASS</Text></Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" onPress={() => fly('left')} style={styles.pass}><View style={styles.passIcon}><Icon name="close" size={30} color={color.muted} /></View><Text style={styles.controlText}>Pass</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onRate} style={styles.rate}><View style={styles.rateIcon}><Icon name="star" size={22} color={color.collectGold} /></View><Text style={styles.controlText}>Rate</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => fly('right')} style={styles.read}><View style={styles.readIcon}><Icon name="heart" size={28} color="#FFFFFF" /></View><Text style={styles.controlText}>{isAccessible(card.work.own) ? 'Continue' : 'Read'}</Text></Pressable>
      </View>
      <Text style={styles.help}>Swipe the card left to pass or right to save.</Text>
    </>
  );
}

function CardFace({ card }: { card: DeckCard }) {
  const { styles } = useThemed(makeStyles);
  return (
    <View style={styles.card}>
      <ComicCover title={card.work.title} workId={card.work.id} size="hero" recyclingKey={`deck-${card.work.id}`} />
      <View style={styles.info}>
        <Text numberOfLines={3} style={styles.title}>{card.work.title}</Text>
        <Text style={styles.meta}>{card.work.genres.slice(0, 2).join(' · ') || 'A story worth considering'}</Text>
        <Text style={styles.owned}>{isAccessible(card.work.own) ? 'Already in your library' : 'New to you'}</Text>
        <ArcRelevance workId={card.work.id} compact />
        <Text numberOfLines={2} style={styles.copy}>{card.kind === 'near' ? 'Close to what you already love.' : card.kind === 'probe' ? 'A thoughtful change of pace.' : 'A little outside your usual shelf.'}</Text>
      </View>
    </View>
  );
}

const makeStyles = (color: Palette, font: Fonts) => StyleSheet.create({
  deck: { minHeight: 270, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  cardWrap: { width: '92%' },
  behind: { position: 'absolute' },
  ghost: { position: 'absolute', width: '82%', height: 230, borderRadius: radius.lg, backgroundColor: color.surface2, transform: [{ rotate: '4deg' }] },
  card: { width: '100%', backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, flexDirection: 'row', gap: 14, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 18, elevation: 9 },
  info: { flex: 1, minWidth: 0, justifyContent: 'center' },
  title: { color: color.text, fontFamily: font.display, fontSize: 25, lineHeight: 29 },
  meta: { color: color.accent, fontFamily: font.bodyMedium, fontSize: 12, marginTop: 7, textTransform: 'capitalize' },
  owned: { color: color.faint, fontFamily: font.bodyMedium, fontSize: 11, marginTop: 4 },
  copy: { color: color.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 12 },
  stamp: { position: 'absolute', top: 22, borderWidth: 3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2 },
  stampSave: { left: 18, borderColor: color.positive, transform: [{ rotate: '-12deg' }] },
  stampPass: { right: 18, borderColor: color.accent, transform: [{ rotate: '12deg' }] },
  stampText: { fontFamily: font.display, fontSize: 24, letterSpacing: 1.5 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 10 },
  pass: { alignItems: 'center', gap: 4 },
  passIcon: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  rate: { alignItems: 'center', gap: 4 },
  rateIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  read: { alignItems: 'center', gap: 4 },
  readIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center', shadowColor: color.accent, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  controlText: { color: color.muted, fontFamily: font.bodyMedium, fontSize: 11 },
  help: { color: color.faint, fontFamily: font.body, fontSize: 12, textAlign: 'center', marginTop: 15 },
});
