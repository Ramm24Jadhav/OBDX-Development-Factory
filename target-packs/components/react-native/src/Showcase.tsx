/*
 * Showcase components (the M2 "Showcase" category), our own code on React Native's Animated: lists, cards, carousels,
 * pickers and menus that move. Each works with a screen reader (roles, names, and actions where a gesture is needed)
 * and shows its end state under reduced motion.
 */
import { ComponentRef, ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Image, PanResponder, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from './G1';
import { Tabs } from './Tabs';
import { Option } from './field';
import { BG, DURATION, Enter, Press, useOpen, usePop, useProgress, useReducedMotion, useSlide, useStagger } from './motion';
import { Heading, KeyValues, Row, Sheet, SliderControl, SliderControlProps, Touch, panel } from './parts';
import { useTheme } from './theme';
import { CardVariant, CardsVariant, ListVariant, MenuVariant, NavVariant, TilesVariant, variantStyle } from './variants-v2';

/* ---------- AnimatedList ---------- */

export interface AnimatedListProps<T> {
  testID?: string;
  /** The style variant (variants/v2.json); the component's own look when left out. */
  variant?: ListVariant;
  items: ReadonlyArray<T>;
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Milliseconds between rows. */
  step?: number;
}

/** Rows that come in one after another. */
export function AnimatedList<T>({ variant, testID, items, keyOf, renderItem, step = 50 }: AnimatedListProps<T>) {
  const t = useTheme();
  const vs = useStagger(items.length, step, items.length);
  return (
    <View testID={testID} style={[{ gap: 8 }, variantStyle(t, 'list', variant)]}>
      {items.map((x, i) => (
        <Animated.View key={keyOf(x)} style={{ opacity: vs[i], transform: [{ translateY: vs[i].interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
          {renderItem(x)}
        </Animated.View>
      ))}
    </View>
  );
}

/* ---------- SpotlightCard and TiltCard (they answer the finger) ---------- */

export interface CardProps {
  testID?: string;
  /** The style variant (variants/v2.json); the component's own look when left out. */
  variant?: CardVariant;
  children?: ReactNode;
  /** Makes the card a button with this name. */
  label?: string;
  onPress?: () => void;
}

/** A card where a soft light follows the finger. */
export function SpotlightCard({ variant, testID, children, label, onPress }: CardProps) {
  const t = useTheme();
  const r = useReducedMotion();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <Press testID={testID} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label} onPress={onPress}
           onPressIn={(e) => { if (!r) { setAt({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }); } }}
           onTouchMove={(e) => { if (!r) { setAt({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }); } }} onPressOut={() => setAt(null)}
           style={[panel(t), { overflow: 'hidden' }, variantStyle(t, 'card', variant)]}>
      {children}
      {at ? <View pointerEvents="none" importantForAccessibility="no" style={[StyleSheet.absoluteFill, {
        [BG]: `radial-gradient(circle at ${Math.round(at.x)}px ${Math.round(at.y)}px, rgba(255, 255, 255, 0.35), transparent 60%)` }]} /> : null}
    </Press>
  );
}

/** A card that tilts towards the finger and settles back. */
export function TiltCard({ variant, testID, children, label }: CardProps) {
  const t = useTheme();
  const r = useReducedMotion();
  const tilt = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const size = useRef({ w: 1, h: 1 });
  const still = useRef(r);
  still.current = r;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (e) => { if (!still.current) { tilt.setValue({ x: e.nativeEvent.locationX / size.current.w - 0.5, y: e.nativeEvent.locationY / size.current.h - 0.5 }); } },
    onPanResponderRelease: () => Animated.spring(tilt, { toValue: { x: 0, y: 0 }, friction: 5, useNativeDriver: true }).start(),
    onPanResponderTerminate: () => tilt.setValue({ x: 0, y: 0 }),
  })).current;
  return (
    <Animated.View testID={testID} accessible={!!label} accessibilityLabel={label} {...pan.panHandlers}
                   onLayout={(e) => { size.current = { w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 }; }}
                   style={[panel(t), { transform: [{ perspective: 800 }, { rotateY: tilt.x.interpolate({ inputRange: [-0.5, 0.5], outputRange: ['-8deg', '8deg'] }) },
                     { rotateX: tilt.y.interpolate({ inputRange: [-0.5, 0.5], outputRange: ['8deg', '-8deg'] }) }] }, variantStyle(t, 'card', variant)]}>
      {children}
    </Animated.View>
  );
}

/* ---------- FlipCard ---------- */

export interface FlipCardProps {
  testID?: string;
  /** The style variant (variants/v2.json); the component's own look when left out. */
  variant?: CardVariant;
  front: ReactNode;
  back: ReactNode;
  /** What the back holds: "card details"; the button reads "Show card details". */
  backLabel: string;
  flipped: boolean;
  onFlippedChange: (flipped: boolean) => void;
}

/** A card that turns over to show its back (the card's details, a rate's terms). Only the face in view is read. */
export function FlipCard({ variant, testID, front, back, backLabel, flipped, onFlippedChange }: FlipCardProps) {
  const t = useTheme();
  const v = useSlide(flipped ? 1 : 0);
  const face = (side: 0 | 1) => ({ backfaceVisibility: 'hidden' as const, transform: [{ perspective: 1000 },
    { rotateY: v.interpolate({ inputRange: [0, 1], outputRange: side ? ['180deg', '360deg'] : ['0deg', '180deg'] }) }] });
  return (
    <View testID={testID} style={[{ gap: 8 }, variantStyle(t, 'card', variant)]}>
      <View>
        <Animated.View style={[panel(t), face(0)]} importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}>{front}</Animated.View>
        <Animated.View style={[panel(t), StyleSheet.absoluteFill, face(1)]} importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}>{back}</Animated.View>
      </View>
      <Touch testID={testID ? `${testID}-flip` : undefined} label={flipped ? 'Show the front' : `Show ${backLabel}`} onPress={() => onFlippedChange(!flipped)}
             style={{ alignSelf: 'center', paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: t.color.primaryText }}>{flipped ? 'Show the front' : `Show ${backLabel}`}</Text>
      </Touch>
    </View>
  );
}

/* ---------- CardStack ---------- */

export interface CardStackProps {
  testID?: string;
  /** The style variant (variants/v2.json); the component's own look when left out. */
  variant?: CardsVariant;
  label: string;
  cards: ReadonlyArray<{ id: string; label: string; content: ReactNode }>;
  /** The card on top. */
  value: string;
  onChange: (id: string) => void;
}

/** Cards in a pile: swipe the top one aside (or press Next) to bring the next forward. */
export function CardStack({ variant, testID, label, cards, value, onChange }: CardStackProps) {
  const t = useTheme();
  const at = Math.max(0, cards.findIndex((c) => c.id === value));
  const next = () => onChange(cards[(at + 1) % cards.length].id);
  const x = useRef(new Animated.Value(0)).current;
  const go = useRef(next);
  go.current = next;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
    onPanResponderMove: (_, g) => x.setValue(g.dx),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 90) { go.current(); }
      Animated.spring(x, { toValue: 0, friction: 6, useNativeDriver: true }).start();
    },
  })).current;
  const order = cards.map((_, i) => cards[(at + i) % cards.length]).slice(0, 3).reverse();
  return (
    <View testID={testID} style={[{ gap: 10 }, variantStyle(t, 'cards', variant)]}>
      <View accessibilityLabel={`${label}, ${at + 1} of ${cards.length}`} style={{ height: 180 }}>
        {order.map((c, i) => {
          const depth = order.length - 1 - i;
          const top = depth === 0;
          return (
            <Animated.View key={c.id} {...(top ? pan.panHandlers : {})} importantForAccessibility={top ? 'auto' : 'no-hide-descendants'}
                           style={[panel(t), StyleSheet.absoluteFill, { transform: [{ translateY: depth * 10 }, { scale: 1 - depth * 0.05 },
                             ...(top ? [{ translateX: x }, { rotate: x.interpolate({ inputRange: [-200, 200], outputRange: ['-8deg', '8deg'] }) }] : [])] }]}>
              {c.content}
            </Animated.View>
          );
        })}
      </View>
      <Touch testID={testID ? `${testID}-next` : undefined} label={`Next ${label}`} onPress={next} style={{ alignSelf: 'center', paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: t.color.primaryText }}>Next</Text>
      </Touch>
    </View>
  );
}

/* ---------- GlowBorderCard ---------- */

/** A card with a slowly turning glow along its border (a premium product, an offer). */
export function GlowBorderCard({ variant, testID, children }: CardProps) {
  const t = useTheme();
  const r = useReducedMotion();
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (r) { turn.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 6000, easing: (n) => n, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [r, turn]);
  return (
    <View testID={testID} style={[{ borderRadius: t.radius.card + 2, padding: 2, overflow: 'hidden' }, variantStyle(t, 'card', variant)]}>
      <Animated.View pointerEvents="none" importantForAccessibility="no" style={{ position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%',
        [BG]: `linear-gradient(90deg, ${t.color.primary}, ${t.color.info}, ${t.color.success}, ${t.color.primary})`,
        transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }} />
      <View style={[panel(t), { borderWidth: 0 }]}>{children}</View>
    </View>
  );
}

/* ---------- BentoGrid ---------- */

export interface BentoTile {
  id: string;
  title: string;
  value?: string;
  note?: string;
  /** 2 takes the full width. */
  span?: 1 | 2;
  content?: ReactNode;
}

/** A dashboard of tiles in two columns, wide ones across both; the tiles come in one after another. */
export function BentoGrid({ variant, testID, tiles, onSelect }: { testID?: string; variant?: TilesVariant; tiles: ReadonlyArray<BentoTile>; onSelect?: (id: string) => void }) {
  const t = useTheme();
  const vs = useStagger(tiles.length, 60, tiles.length);
  return (
    <View testID={testID} style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, variantStyle(t, 'tiles', variant)]}>
      {tiles.map((x, i) => {
        const body = (
          <>
            <Text style={{ fontSize: 13, color: t.color.textMuted }}>{x.title}</Text>
            {x.value ? <Text style={{ fontSize: 22, fontWeight: '700', color: t.color.text, fontVariant: ['tabular-nums'] }}>{x.value}</Text> : null}
            {x.note ? <Text style={{ fontSize: 12.5, color: t.color.textMuted }}>{x.note}</Text> : null}
            {x.content}
          </>
        );
        // Named by its own text, so the name always matches what is shown
        return (
          <Animated.View key={x.id} style={{ flexBasis: x.span === 2 ? '100%' : '47%', flexGrow: 1, opacity: vs[i],
            transform: [{ scale: vs[i].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }}>
            {onSelect
              ? <Touch testID={testID ? `${testID}-${x.id}` : undefined} onPress={() => onSelect(x.id)} style={[panel(t), { gap: 4 }]}>{body}</Touch>
              : <View accessible style={[panel(t), { gap: 4 }]}>{body}</View>}
          </Animated.View>
        );
      })}
    </View>
  );
}

/* ---------- Carousel ---------- */

export interface CarouselProps {
  testID?: string;
  label: string;
  slides: ReadonlyArray<{ id: string; label: string; content: ReactNode }>;
  value: string;
  onChange: (id: string) => void;
  width?: number;
}

/** Slides side by side that page with a swipe, with Previous, Next and a dot for each. */
export function Carousel({ testID, label, slides, value, onChange, width = 320 }: CarouselProps) {
  const t = useTheme();
  const r = useReducedMotion();
  const at = Math.max(0, slides.findIndex((s) => s.id === value));
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { scroll.current?.scrollTo({ x: at * width, animated: !r }); }, [at, width, r]);
  const go = (i: number) => onChange(slides[(i + slides.length) % slides.length].id);
  return (
    <View testID={testID} style={{ gap: 8 }} accessibilityLabel={`${label}, ${at + 1} of ${slides.length}: ${slides[at]?.label ?? ''}`}>
      {/* Focusable, so the slides can be scrolled with the keyboard on the web */}
      <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width }} focusable accessibilityLabel={label}
                  onMomentumScrollEnd={(e) => { const i = Math.round(e.nativeEvent.contentOffset.x / width); if (i !== at) { go(i); } }}>
        {slides.map((s, i) => (
          <View key={s.id} style={{ width, paddingHorizontal: 4 }} importantForAccessibility={i === at ? 'auto' : 'no-hide-descendants'}>{s.content}</View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <Touch testID={testID ? `${testID}-previous` : undefined} label="Previous slide" onPress={() => go(at - 1)} style={{ paddingHorizontal: 12 }}>
          <Text style={{ fontSize: 18, color: t.color.primaryText }}>‹</Text>
        </Touch>
        {slides.map((s, i) => (
          <Touch key={s.id} label={`Slide ${i + 1} of ${slides.length}, ${s.label}`} selected={i === at} onPress={() => go(i)}
                 style={{ minWidth: 28, alignItems: 'center' }}>
            <View style={{ width: i === at ? 18 : 8, height: 8, borderRadius: 4, backgroundColor: i === at ? t.color.primary : t.color.borderStrong }} />
          </Touch>
        ))}
        <Touch testID={testID ? `${testID}-next` : undefined} label="Next slide" onPress={() => go(at + 1)} style={{ paddingHorizontal: 12 }}>
          <Text style={{ fontSize: 18, color: t.color.primaryText }}>›</Text>
        </Touch>
      </View>
    </View>
  );
}

/* ---------- ElasticSlider ---------- */

/** An amount on a slider that stretches a little at either end, so the customer feels the limit. */
export function ElasticSlider(props: SliderControlProps) {
  const at = props.value ?? props.min ?? 0;
  const edge = at <= (props.min ?? 0) || at >= (props.max ?? 100);
  const bump = usePop(edge ? at : 'inside');
  return <Animated.View style={bump}><SliderControl {...props} /></Animated.View>;
}

/* ---------- OptionWheel ---------- */

export interface OptionWheelProps {
  testID?: string;
  label: string;
  options: ReadonlyArray<Option>;
  value: string;
  onChange: (value: string) => void;
}

const ROW = 40;

/** A wheel picker (a tenure, a day of the month): scroll to choose, the middle row is the value; screen readers swipe up and down. */
export function OptionWheel({ testID, label, options, value, onChange }: OptionWheelProps) {
  const t = useTheme();
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  const y = useRef(new Animated.Value(at * ROW)).current;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: at * ROW, animated: false }); }, [at]);
  const pick = (i: number) => { const o = options[Math.max(0, Math.min(options.length - 1, i))]; if (o && o.value !== value) { onChange(o.value); } };
  return (
    <View testID={testID} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: options[at]?.label }}
          aria-valuemin={0} aria-valuemax={options.length - 1} aria-valuenow={at} aria-valuetext={options[at]?.label}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => pick(at + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
          style={{ height: ROW * 5, overflow: 'hidden', borderRadius: t.radius.card, backgroundColor: t.color.surface2 }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: ROW * 2, left: 8, right: 8, height: ROW, borderRadius: t.radius.control,
        backgroundColor: t.card, borderWidth: t.border, borderColor: t.line }} />
      <Animated.ScrollView ref={scroll} snapToInterval={ROW} decelerationRate="fast" showsVerticalScrollIndicator={false}
                           contentContainerStyle={{ paddingVertical: ROW * 2 }} scrollEventThrottle={16}
                           onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}
                           onMomentumScrollEnd={(e) => pick(Math.round(e.nativeEvent.contentOffset.y / ROW))}>
        {options.map((o, i) => {
          const near = { inputRange: [(i - 2) * ROW, i * ROW, (i + 2) * ROW], extrapolate: 'clamp' as const };
          return (
            <Animated.Text key={o.value} style={{ height: ROW, lineHeight: ROW, textAlign: 'center', fontSize: 17, color: t.color.text,
              opacity: y.interpolate({ ...near, outputRange: [0.3, 1, 0.3] }), transform: [{ scale: y.interpolate({ ...near, outputRange: [0.85, 1, 0.85] }) }] }}>
              {o.label}
            </Animated.Text>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

/* ---------- PillNav, DockNav ---------- */

export interface NavProps {
  testID?: string;
  /** The style variant (variants/v2.json); the component's own look when left out. */
  variant?: NavVariant;
  label: string;
  items: ReadonlyArray<{ id: string; label: string; icon?: string }>;
  value: string;
  onChange: (id: string) => void;
}

/** Navigation as pills; the chosen pill slides to its place. */
export function PillNav({ testID, label, items, value, onChange, variant }: NavProps) {
  const t = useTheme();
  const tabs = <Tabs testID={testID} label={label} tabs={items.map((i) => ({ id: i.id, label: i.label }))} selection={value} onSelectionChange={onChange} />;
  return variant ? <View style={variantStyle(t, 'nav', variant)}>{tabs}</View> : tabs;
}

function DockItem({ item, on, onPress, testID }: { item: NavProps['items'][number]; on: boolean; onPress: () => void; testID?: string }) {
  const t = useTheme();
  const v = useSlide(on ? 1 : 0);
  return (
    <Press testID={testID} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: on }} onPress={onPress}
           style={{ minWidth: t.minTouch, minHeight: t.minTouch + 8, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 }}>
      <Animated.View style={{ alignItems: 'center', transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }}>
        <Text style={{ fontSize: 20, color: on ? t.color.primaryText : t.color.textBody }}>{item.icon ?? item.label[0]}</Text>
        <Text style={{ fontSize: 10.5, color: on ? t.color.primaryText : t.color.textMuted }}>{item.label}</Text>
      </Animated.View>
    </Press>
  );
}

/** A bottom dock whose chosen item rises and grows. */
export function DockNav({ variant, testID, label, items, value, onChange }: NavProps) {
  const t = useTheme();
  return (
    <View testID={testID} accessibilityRole="tablist" accessibilityLabel={label}
          style={[{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, paddingTop: 4, borderRadius: 24, backgroundColor: t.color.surface,
            borderWidth: t.border, borderColor: t.color.border, boxShadow: '0 6px 20px rgba(15, 23, 42, 0.12)' }, variantStyle(t, 'nav', variant)]}>
      {items.map((i) => <DockItem key={i.id} testID={testID ? `${testID}-${i.id}` : undefined} item={i} on={i.id === value} onPress={() => onChange(i.id)} />)}
    </View>
  );
}

/* ---------- CardNav and StaggeredMenu ---------- */

export interface MenuGroup {
  id: string;
  title: string;
  links: ReadonlyArray<{ id: string; label: string }>;
}

/** A menu button that opens into cards of links, one card per area. */
export function CardNav({ variant, testID, label = 'Menu', groups, onNavigate }: { testID?: string; variant?: NavVariant; label?: string; groups: ReadonlyArray<MenuGroup>; onNavigate: (id: string) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const drop = useOpen(open, 'drop');
  return (
    <View testID={testID} style={[{ gap: 8 }, variantStyle(t, 'nav', variant)]}>
      <Touch testID={testID ? `${testID}-toggle` : undefined} label={label} expanded={open} onPress={() => setOpen(!open)}
             style={{ alignSelf: 'flex-start', paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.color.surface2 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: t.color.text }}>{open ? '×' : '☰'}  {label}</Text>
      </Touch>
      {open ? (
        <Animated.View style={[{ gap: 8 }, drop]}>
          {groups.map((g) => (
            <View key={g.id} style={[panel(t), { gap: 2 }]}>
              <Heading t={t}>{g.title}</Heading>
              {g.links.map((l) => (
                <Touch key={l.id} label={l.label} role="link" onPress={() => { setOpen(false); onNavigate(l.id); }}>
                  <Text style={{ fontSize: 15, color: t.color.primaryText }}>{l.label} →</Text>
                </Touch>
              ))}
            </View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A full menu whose items slide in one after another. */
export function StaggeredMenu({ variant, testID, title = 'Menu', open, onOpenChange, items, onSelect }: { testID?: string; variant?: MenuVariant; title?: string; open: boolean;
  onOpenChange: (open: boolean) => void; items: ReadonlyArray<{ id: string; label: string }>; onSelect: (id: string) => void }) {
  const t = useTheme();
  const vs = useStagger(items.length, 45, open);
  return (
    <Sheet testID={testID} style={variantStyle(t, 'menu', variant)} open={open} title={title} side="start" onClose={() => onOpenChange(false)}>
      {items.map((x, i) => (
        <Animated.View key={x.id} style={{ opacity: vs[i], transform: [{ translateX: vs[i].interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }}>
          <Touch testID={testID ? `${testID}-${x.id}` : undefined} label={x.label} onPress={() => { onOpenChange(false); onSelect(x.id); }} style={{ paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: t.color.text }}>{x.label}</Text>
          </Touch>
        </Animated.View>
      ))}
    </Sheet>
  );
}

/* ---------- DocumentFolder ---------- */

export interface DocumentFolderProps {
  testID?: string;
  /** The style variant (variants/v2.json); the component's own look when left out. */
  variant?: ListVariant;
  title: string;
  documents: ReadonlyArray<{ id: string; title: string; meta?: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
}

/** A folder of documents (statements, certificates) whose papers fan up out of it when it opens. */
export function DocumentFolder({ variant, testID, title, documents, open, onOpenChange, onSelect }: DocumentFolderProps) {
  const t = useTheme();
  const v = useSlide(open ? 1 : 0);
  const peek = documents.slice(0, 3);
  return (
    <View testID={testID} style={[{ gap: 10 }, variantStyle(t, 'list', variant)]}>
      <Touch testID={testID ? `${testID}-folder` : undefined} expanded={open} onPress={() => onOpenChange(!open)}
             style={{ height: 120, justifyContent: 'flex-end' }}>
        {peek.map((d, i) => (
          <Animated.View key={d.id} importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: 24 + i * 8, right: 24 - i * 8, bottom: 30, height: 70,
            borderRadius: t.radius.small, backgroundColor: t.fill, borderWidth: t.border, borderColor: t.line,
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -18 - i * 10] }) },
              { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i - 1) * 6}deg`] }) }] }} />
        ))}
        <View style={{ height: 64, borderRadius: 10, backgroundColor: t.color.primary, justifyContent: 'center', paddingHorizontal: 14 }}>
          <Text style={{ color: t.color.onPrimary, fontWeight: '700', fontSize: 15 }}>{title}</Text>
          <Text style={{ color: t.color.onPrimary, fontSize: 12.5 }}>{documents.length} documents</Text>
        </View>
      </Touch>
      {open ? (
        <Enter effect="settle" style={[panel(t), { gap: 0, paddingVertical: 4 }]}>
          {documents.map((d) => (
            <Touch key={d.id} label={[d.title, d.meta].filter(Boolean).join(', ')} onPress={() => onSelect(d.id)}>
              <Text style={{ fontSize: 15, color: t.color.text }}>{d.title}</Text>
              {d.meta ? <Text style={{ fontSize: 12.5, color: t.color.textMuted }}>{d.meta}</Text> : null}
            </Touch>
          ))}
        </Enter>
      ) : null}
    </View>
  );
}

/* ---------- ScrollStack ---------- */

/** Cards that pile up as the list scrolls: each one shrinks a little as the next slides over it. */
export function ScrollStack({ variant, testID, cards, height = 160 }: { testID?: string; variant?: CardsVariant; cards: ReadonlyArray<{ id: string; content: ReactNode }>; height?: number }) {
  const t = useTheme();
  const y = useRef(new Animated.Value(0)).current;
  return (
    <Animated.ScrollView testID={testID} style={[{ maxHeight: height * 2.5 }, variantStyle(t, 'cards', variant)]} scrollEventThrottle={16}
                         onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}>
      {cards.map((c, i) => (
        <Animated.View key={c.id} style={[panel(t), { height, marginBottom: 12, transform: [
          { scale: y.interpolate({ inputRange: [i * (height + 12), (i + 1) * (height + 12)], outputRange: [1, 0.92], extrapolate: 'clamp' }) },
          { translateY: y.interpolate({ inputRange: [i * (height + 12), (i + 1) * (height + 12)], outputRange: [0, height * 0.6], extrapolate: 'clamp' }) }] }]}>
          {c.content}
        </Animated.View>
      ))}
    </Animated.ScrollView>
  );
}

/* ---------- ProfileCard and GlassPanel ---------- */

export interface ProfileCardProps {
  testID?: string;
  /** The style variant (variants/v2.json); the component's own look when left out. */
  variant?: CardVariant;
  name: string;
  role?: string;
  photo?: string;
  rows?: ReadonlyArray<Row>;
  actionLabel?: string;
  onAction?: () => void;
}

/** A person (the customer, the relationship manager) with a photo or initials, a few facts and one action. */
export function ProfileCard({ variant, testID, name, role, photo, rows = [], actionLabel, onAction }: ProfileCardProps) {
  const t = useTheme();
  const v = useProgress(name, DURATION.slow);
  return (
    <Enter testID={testID} style={[panel(t), { padding: 0, overflow: 'hidden' }, variantStyle(t, 'card', variant)]}>
      <View style={{ height: 64, [BG]: `linear-gradient(135deg, ${t.color.primary}, ${t.color.info})` }} />
      <Animated.View style={{ marginTop: -28, alignSelf: 'center', borderRadius: 32, borderWidth: 3, borderColor: t.color.surface,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
        {photo ? <Image source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: 28 }} accessibilityLabel={name} /> : <Avatar name={name} size="lg" />}
      </Animated.View>
      <View style={{ alignItems: 'center', paddingHorizontal: 16 }}>
        <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', color: t.color.text }}>{name}</Text>
        {role ? <Text style={{ fontSize: 13, color: t.color.textMuted }}>{role}</Text> : null}
      </View>
      <View style={{ padding: 12 }}>
        <KeyValues testID={`${testID ?? 'profile'}-rows`} rows={rows} actionLabel={actionLabel} onAction={onAction} />
      </View>
    </Enter>
  );
}

/**
 * A frosted panel over a backdrop: a light translucent surface with a bright edge. shortcut: React Native cannot blur
 * what is behind a view, so this is translucency only; use expo-blur's BlurView behind it if the app has it.
 */
export function GlassPanel({ testID, children }: CardProps) {
  const t = useTheme();
  const dark = t.color.bg.startsWith('#0');
  return (
    <Enter testID={testID} style={{ padding: 16, gap: 10, borderRadius: t.radius.card, borderWidth: 1,
      borderColor: dark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.7)',
      backgroundColor: dark ? 'rgba(20, 30, 43, 0.55)' : 'rgba(255, 255, 255, 0.6)', boxShadow: '0 8px 32px rgba(15, 23, 42, 0.12)' }}>
      {children}
    </Enter>
  );
}
