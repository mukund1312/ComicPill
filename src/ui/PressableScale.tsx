import { useState, type PropsWithChildren } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A pressable that gives a little: shrinks slightly while held and eases back on release (the easing runs on the UI thread). */
export function PressableScale({ children, style, to = 0.96, ...rest }: PropsWithChildren<PressableProps & { style?: StyleProp<ViewStyle>; to?: number }>) {
  const [held, setHeld] = useState(false);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: withTiming(held ? to : 1, { duration: held ? 90 : 160 }) }] }), [held, to]);
  return (
    <AnimatedPressable
      {...rest}
      style={[style, anim]}
      onPressIn={(e) => { setHeld(true); rest.onPressIn?.(e); }}
      onPressOut={(e) => { setHeld(false); rest.onPressOut?.(e); }}
    >
      {children}
    </AnimatedPressable>
  );
}
