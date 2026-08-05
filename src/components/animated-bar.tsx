import { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const BAR_DURATION = 520;
const timingConfig = {
  duration: BAR_DURATION,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, minimum), maximum);
}

export function AnimatedHorizontalBar({ percent, delay = 0, style }: {
  percent: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const width = useSharedValue<`${number}%`>('0%');

  useEffect(() => {
    const target = `${clamp(percent, 0, 100)}%` as `${number}%`;
    width.value = withDelay(delay, withTiming(target, timingConfig), ReduceMotion.System);
  }, [delay, percent, width]);

  const animatedStyle = useAnimatedStyle(() => ({ width: width.value }));

  return <Animated.View style={[style, animatedStyle]} />;
}

export function AnimatedVerticalBar({ height, delay = 0, style }: {
  height: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const animatedHeight = useSharedValue(0);

  useEffect(() => {
    animatedHeight.value = withDelay(
      delay,
      withTiming(Math.max(Number.isFinite(height) ? height : 0, 0), timingConfig),
      ReduceMotion.System,
    );
  }, [animatedHeight, delay, height]);

  const animatedStyle = useAnimatedStyle(() => ({ height: animatedHeight.value }));

  return <Animated.View style={[style, animatedStyle]} />;
}