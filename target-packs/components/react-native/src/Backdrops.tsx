/*
 * Backdrops (the M2 "Backdrops" category), our own code: plain views, React Native's gradients
 * (experimental_backgroundImage) and Animated. They fill their parent behind the content, are hidden from screen readers,
 * take no touches, move slowly, and stand still under reduced motion. Quiet by design: nothing flashes.
 */
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useCycle } from './motion';
import { useTheme } from './theme';

export interface BackdropProps {
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Two or three colours; the brand's by default. */
  colors?: ReadonlyArray<string>;
  /** Seconds for one cycle of the movement. */
  period?: number;
}

function useColors(colors?: ReadonlyArray<string>) {
  const t = useTheme();
  return colors && colors.length ? colors : [t.color.primary, t.color.info, t.color.successSoft];
}

const decor = { pointerEvents: 'none' as const, importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true };

/** A steady value from a seed, so particles and waves look scattered but render the same every time. */
const seeded = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

/** A soft gradient that slowly shifts between two angles. */
export function GradientBackdrop({ testID, style, colors, period = 12 }: BackdropProps) {
  const [a, b, c = b] = useColors(colors);
  const v = useCycle(period * 1000);
  return (
    <View testID={testID} {...decor} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: `linear-gradient(135deg, ${a}, ${b})` }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: `linear-gradient(45deg, ${b}, ${c})`,
        opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 0] }) }]} />
    </View>
  );
}

/** Large soft lights that drift slowly, like an aurora. */
export function SoftAurora({ testID, style, colors, period = 18 }: BackdropProps) {
  const list = useColors(colors);
  const v = useCycle(period * 1000);
  return (
    <View testID={testID} {...decor} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      {list.slice(0, 3).map((c, i) => (
        <Animated.View key={i} style={{ position: 'absolute', width: '90%', aspectRatio: 1, left: `${[-20, 30, 5][i]}%`, top: `${[-30, -10, 30][i]}%`, opacity: 0.45,
          experimental_backgroundImage: `radial-gradient(circle, ${c}, transparent 65%)`,
          transform: [{ translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, (i % 2 ? -1 : 1) * 40, 0] }) },
            { translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, (i === 1 ? 1 : -1) * 24, 0] }) }] }} />
      ))}
    </View>
  );
}

/** Wide diagonal bands of colour that slide past each other, like folds of silk. */
export function SilkBackdrop({ testID, style, colors, period = 16 }: BackdropProps) {
  const [a, b] = useColors(colors);
  const v = useCycle(period * 1000);
  return (
    <View testID={testID} {...decor} style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: a }, style]}>
      {[0, 1, 2, 3].map((i) => (
        <Animated.View key={i} style={{ position: 'absolute', top: '-50%', bottom: '-50%', width: '45%', left: `${i * 30 - 20}%`, opacity: 0.35,
          experimental_backgroundImage: `linear-gradient(to right, transparent, ${b}, transparent)`,
          transform: [{ rotate: '25deg' }, { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, i % 2 ? 30 : -30, 0] }) }] }} />
      ))}
    </View>
  );
}

/** A grid of small dots with a slow wave of light across it. */
export function DotGrid({ testID, style, colors, period = 6, rows = 10, columns = 14 }: BackdropProps & { rows?: number; columns?: number }) {
  const [a] = useColors(colors);
  const v = useCycle(period * 1000);
  return (
    <View testID={testID} {...decor} style={[StyleSheet.absoluteFill, { justifyContent: 'space-evenly' }, style]}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
          {Array.from({ length: columns }, (_, c) => {
            const at = (r + c) / (rows + columns);
            return <Animated.View key={c} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: a,
              opacity: v.interpolate({ inputRange: [0, at, Math.min(1, at + 0.2), 1], outputRange: [0.15, 0.15, 0.6, 0.15], extrapolate: 'clamp' }) }} />;
          })}
        </View>
      ))}
    </View>
  );
}

/** Thin horizontal lines that sway up and down in a slow wave. */
export function LineWaves({ testID, style, colors, period = 8, lines = 12 }: BackdropProps & { lines?: number }) {
  const [a] = useColors(colors);
  const v = useCycle(period * 1000);
  return (
    <View testID={testID} {...decor} style={[StyleSheet.absoluteFill, { overflow: 'hidden', justifyContent: 'space-evenly' }, style]}>
      {Array.from({ length: lines }, (_, i) => {
        const phase = i / lines;
        return <Animated.View key={i} style={{ height: 1, marginHorizontal: -20, backgroundColor: a, opacity: 0.25,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 6, 0, -6, 0].map((y) => y * Math.cos(phase * Math.PI * 2)) }) },
            { rotate: `${(phase - 0.5) * 4}deg` }] }} />;
      })}
    </View>
  );
}

/** Soft beams of light falling from the top, sweeping a little. */
export function LightBeams({ testID, style, colors, period = 14, beams = 5 }: BackdropProps & { beams?: number }) {
  const [a] = useColors(colors);
  const v = useCycle(period * 1000);
  return (
    <View testID={testID} {...decor} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      {Array.from({ length: beams }, (_, i) => (
        <Animated.View key={i} style={{ position: 'absolute', top: '-10%', height: '120%', width: 40 + seeded(i) * 40, left: `${(i + 0.5) * (100 / beams) - 8}%`,
          opacity: 0.18 + seeded(i + 7) * 0.15, experimental_backgroundImage: `linear-gradient(to bottom, ${a}, transparent)`,
          transform: [{ rotate: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-6deg', `${4 + i}deg`, '-6deg'] }) }] }} />
      ))}
    </View>
  );
}

/** Contour lines spreading from a point, like a map of hills. */
export function Topography({ testID, style, colors, period = 10, rings = 7 }: BackdropProps & { rings?: number }) {
  const [a] = useColors(colors);
  const v = useCycle(period * 1000);
  return (
    <View testID={testID} {...decor} style={[StyleSheet.absoluteFill, { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {Array.from({ length: rings }, (_, i) => (
        <Animated.View key={i} style={{ position: 'absolute', width: `${(i + 1) * 30}%`, aspectRatio: 1.3 + seeded(i) * 0.3, borderRadius: 999, borderWidth: 1,
          borderColor: a, opacity: 0.22, transform: [{ rotate: `${seeded(i + 3) * 40 - 20}deg` },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + 1 / rings] }) }] }} />
      ))}
    </View>
  );
}

/** Small specks drifting slowly upwards. */
export function ParticleBackdrop({ testID, style, colors, period = 12, count = 24 }: BackdropProps & { count?: number }) {
  const list = useColors(colors);
  const v = useCycle(period * 1000);
  return (
    <View testID={testID} {...decor} style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]}>
      {Array.from({ length: count }, (_, i) => {
        const start = seeded(i);
        const size = 2 + seeded(i + 11) * 4;
        return <Animated.View key={i} style={{ position: 'absolute', left: `${seeded(i + 5) * 100}%`, top: `${start * 100}%`, width: size, height: size,
          borderRadius: size / 2, backgroundColor: list[i % list.length], opacity: 0.35,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -60 - seeded(i + 2) * 80] }) }] }} />;
      })}
    </View>
  );
}
