/*
 * Group 1: the rest of the foundation, layout, data and feedback. The same props as the web packs; on a phone the menu
 * and the drawer open as sheets, and everything a screen reader reaches has a role, a name and its state.
 */
import { Children, ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator as Spin, Animated, Image, Text, View } from 'react-native';

import { Button, ButtonProps } from './Button';
import { Dialog } from './Dialog';
import { FieldProps, Option } from './field';
import { Banner, BannerProps, Chips, ChipsProps, Event, Item, ItemList, Segment, SegmentProps, Sheet, SliderControl, SliderControlProps, Steps, StepsProps,
  TimelineList, TimelineListProps, Tone, Touch, panel, toneColors } from './parts';
import { useTheme } from './theme';

/* ---------- SecondaryButton and DestructiveButton ---------- */

export type SecondaryButtonProps = Omit<ButtonProps, 'chroming'>;

/** A second, quieter action beside the main one. */
export function SecondaryButton(props: SecondaryButtonProps) {
  return <Button {...props} chroming="outlined" />;
}

export interface DestructiveButtonProps extends Omit<ButtonProps, 'chroming'> {
  /** Asks first, in a dialog with this question ("Cancel the payment to A. Rao?"); without it the press acts at once. */
  confirm?: string;
  /** The dialog's confirming button; the action's label by default. */
  confirmLabel?: string;
}

/** An action that cannot be undone, in the danger colour, and asked first when confirm is set. */
export function DestructiveButton({ confirm, confirmLabel, onAction, ...props }: DestructiveButtonProps) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button {...props} chroming="danger" onAction={() => (confirm ? setAsking(true) : onAction?.())} />
      {confirm ? (
        <Dialog open={asking} onOpenChange={setAsking} title={confirm} testID={props.testID ? `${props.testID}-confirm` : undefined}
                footer={<>
                  <Button label="Keep it" chroming="outlined" onAction={() => setAsking(false)} />
                  <Button label={confirmLabel ?? props.label} chroming="danger" onAction={() => { setAsking(false); onAction?.(); }} />
                </>} />
      ) : null}
    </>
  );
}

/* ---------- Slider ---------- */

export type SliderProps = SliderControlProps;

/** Choose a value on a scale (a monthly saving): drag, tap, or swipe up and down with a screen reader. */
export function Slider(props: SliderProps) {
  return <SliderControl {...props} />;
}

/* ---------- ToggleGroup and FilterChips ---------- */

export type ToggleGroupProps = SegmentProps;

/** Switch a view between a few options (Day, Week, Month). */
export function ToggleGroup(props: ToggleGroupProps) {
  return <Segment {...props} />;
}

export type FilterChipsProps = ChipsProps;

/** Narrow a list by several tags. */
export function FilterChips(props: FilterChipsProps) {
  return <Chips {...props} />;
}

/* ---------- ActionMenu ---------- */

export interface MenuAction {
  id: string;
  label: string;
  /** Shown in the danger colour (close the account). */
  danger?: boolean;
  disabled?: boolean;
}

export interface ActionMenuProps {
  testID: string;
  /** The button's name, "More" by default; screen readers read "More actions". */
  label?: string;
  actions: ReadonlyArray<MenuAction>;
  onAction: (id: string) => void;
  disabled?: boolean;
}

/** More actions behind one button: a sheet of actions on a phone. */
export function ActionMenu({ testID, label = 'More', actions, onAction, disabled }: ActionMenuProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Touch testID={testID} label={`${label} actions`} hint="Opens a list of actions" disabled={disabled} onPress={() => setOpen(true)}
             style={{ minWidth: t.minTouch, alignItems: 'center', paddingHorizontal: 12, borderRadius: t.radius.control }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.color.primaryText }}>{label} ⋯</Text>
      </Touch>
      <Sheet testID={`${testID}-sheet`} open={open} title={label} onClose={() => setOpen(false)}>
        {actions.map((a) => (
          <Touch key={a.id} testID={`${testID}-${a.id}`} label={a.label} disabled={a.disabled} onPress={() => { setOpen(false); onAction(a.id); }}
                 style={{ paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 16, color: a.danger ? t.color.dangerText : t.color.text }}>{a.label}</Text>
          </Touch>
        ))}
      </Sheet>
    </>
  );
}

/* ---------- Accordion ---------- */

export interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

export interface AccordionProps {
  testID: string;
  label?: string;
  sections: ReadonlyArray<Section>;
  /** The open sections; without it the accordion keeps its own. */
  value?: string[];
  onChange?: (open: string[]) => void;
  /** Only one open at a time. */
  single?: boolean;
}

/** Questions and details that open in place; each header is a button that says whether it is expanded. */
export function Accordion({ testID, label, sections, value, onChange, single }: AccordionProps) {
  const t = useTheme();
  const [own, setOwn] = useState<string[]>([]);
  const open = value ?? own;
  const flip = (id: string) => {
    const next = open.includes(id) ? open.filter((x) => x !== id) : single ? [id] : [...open, id];
    setOwn(next);
    onChange?.(next);
  };
  return (
    <View testID={testID} style={[panel(t), { gap: 0, paddingVertical: 4 }]}>
      {label ? <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text, paddingVertical: 8 }}>{label}</Text> : null}
      {sections.map((x, i) => {
        const on = open.includes(x.id);
        return (
          <View key={x.id} style={{ borderTopWidth: i || label ? 1 : 0, borderColor: t.color.border }}>
            <Touch testID={`${testID}-${x.id}`} label={x.title} expanded={on} onPress={() => flip(x.id)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: t.color.text }}>{x.title}</Text>
                <Text importantForAccessibility="no" style={{ fontSize: 16, color: t.color.textMuted }}>{on ? '−' : '+'}</Text>
              </View>
            </Touch>
            {on ? <View testID={`${testID}-${x.id}-body`} style={{ paddingBottom: 12 }}>
              {typeof x.body === 'string' ? <Text style={{ fontSize: 14, color: t.color.textBody }}>{x.body}</Text> : x.body}
            </View> : null}
          </View>
        );
      })}
    </View>
  );
}

/* ---------- Stepper ---------- */

export type StepperProps = StepsProps;

/** Where the customer is in a multi-step flow. */
export function Stepper(props: StepperProps) {
  return <Steps {...props} />;
}

/* ---------- Drawer and BottomSheet ---------- */

export interface DrawerProps extends Pick<FieldProps<string>, 'testID' | 'label' | 'value' | 'onChange'> {
  items: ReadonlyArray<Option>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The app's menu in a drawer from the start edge; the current page is marked and choosing one closes it. */
export function Drawer({ testID, label, items, value, onChange, open, onOpenChange }: DrawerProps) {
  const t = useTheme();
  return (
    <Sheet testID={testID} open={open} title={label} side="start" onClose={() => onOpenChange(false)}>
      {items.map((x) => {
        const on = x.value === value;
        return (
          <Touch key={x.value} testID={`${testID}-${x.value}`} role="tab" label={x.label} selected={on} disabled={x.disabled}
                 onPress={() => { onChange?.(x.value); onOpenChange(false); }}
                 style={{ paddingHorizontal: 12, borderRadius: t.radius.control, backgroundColor: on ? t.color.primarySoft : 'transparent' }}>
            <Text style={{ fontSize: 16, fontWeight: on ? '700' : '500', color: on ? t.color.primaryText : t.color.text }}>{x.label}</Text>
          </Touch>
        );
      })}
    </Sheet>
  );
}

export interface BottomSheetProps {
  testID: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/** A panel that slides over the screen for filters or details. */
export function BottomSheet({ testID, title, open, onOpenChange, children }: BottomSheetProps) {
  return <Sheet testID={testID} open={open} title={title} onClose={() => onOpenChange(false)}>{children}</Sheet>;
}

/* ---------- Stack and Divider ---------- */

export interface StackProps {
  testID?: string;
  /** Columns on a phone; 1 stacks the children. */
  columns?: 1 | 2 | 3 | 4;
  gap?: number;
  children: ReactNode;
}

/** Lays out children in equal columns that wrap onto more rows. */
export function Stack({ testID, columns = 1, gap, children }: StackProps) {
  const t = useTheme();
  const g = gap ?? t.space.m;
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -g / 2 }}>
      {Children.toArray(children).map((c, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, paddingHorizontal: g / 2, paddingBottom: g }}>{c}</View>
      ))}
    </View>
  );
}

/** Separates groups of content; with a label it reads as a heading between them. */
export function Divider({ testID, label }: { testID?: string; label?: string }) {
  const t = useTheme();
  const line = <View style={{ flex: 1, height: 1, backgroundColor: t.color.border }} />;
  if (!label) { return <View testID={testID} style={{ height: 1, backgroundColor: t.color.border, marginVertical: t.space.m }} importantForAccessibility="no" />; }
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: t.space.m }}>
      {line}<Text accessibilityRole="header" style={{ fontSize: 12.5, color: t.color.textMuted, fontWeight: '600' }}>{label}</Text>{line}
    </View>
  );
}

/* ---------- Avatar ---------- */

export interface AvatarProps {
  testID?: string;
  /** The person or payee; their initials show when there is no photo, and screen readers read the name. */
  name: string;
  /** A photo address. */
  photo?: string;
  size?: number;
}

export const initials = (name: string) => name.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

/** Initials or a photo for a person or payee. */
export function Avatar({ testID, name, photo, size = 40 }: AvatarProps) {
  const t = useTheme();
  const box = { width: size, height: size, borderRadius: size / 2 };
  return photo
    ? <Image testID={testID} source={{ uri: photo }} style={box} accessibilityLabel={name} accessibilityRole="image" />
    : (
      <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={name}
            style={[box, { backgroundColor: t.color.primarySoft, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: size * 0.38, fontWeight: '700', color: t.color.primaryText }}>{initials(name)}</Text>
      </View>
    );
}

/* ---------- Pagination ---------- */

export interface PaginationProps {
  testID: string;
  /** The current page, from 1. */
  value: number;
  pageCount: number;
  onChange: (page: number) => void;
  label?: string;
}

/** Previous, the pages near the current one, and Next; the current page is marked for screen readers. */
export function Pagination({ testID, value, pageCount, onChange, label = 'Pages' }: PaginationProps) {
  const t = useTheme();
  const from = Math.max(1, Math.min(value - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => from + i);
  const nav = (text: string, to: number, off: boolean) => (
    <Touch testID={`${testID}-${text.toLowerCase()}`} label={`${text} page`} disabled={off} onPress={() => onChange(to)}
           style={{ paddingHorizontal: 10, borderRadius: t.radius.control }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.color.primaryText }}>{text === 'Previous' ? '‹' : '›'}</Text>
    </Touch>
  );
  return (
    <View testID={testID} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
      {nav('Previous', value - 1, value <= 1)}
      {pages.map((p) => (
        <Touch key={p} testID={`${testID}-${p}`} label={`Page ${p} of ${pageCount}`} selected={p === value} onPress={() => onChange(p)}
               style={{ minWidth: t.minTouch, alignItems: 'center', borderRadius: t.radius.control, backgroundColor: p === value ? t.color.primary : 'transparent' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: p === value ? t.color.onPrimary : t.color.text }}>{p}</Text>
        </Touch>
      ))}
      {nav('Next', value + 1, value >= pageCount)}
    </View>
  );
}

/* ---------- StatusBadge ---------- */

export interface StatusBadgeProps {
  testID?: string;
  label: string;
  tone?: Tone;
}

/** The state of a payment at a glance; the colour is never the only sign, the word is always there. */
export function StatusBadge({ testID, label, tone = 'neutral' }: StatusBadgeProps) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return (
    <View testID={testID} accessible accessibilityLabel={`Status: ${label}`}
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
            backgroundColor: c.bg }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.line }} />
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: c.fg }}>{label}</Text>
    </View>
  );
}

/* ---------- Timeline ---------- */

export type TimelineProps = TimelineListProps;
export type { Event };

/** Events in order, for example a payment's journey. */
export function Timeline(props: TimelineProps) {
  return <TimelineList {...props} />;
}

/* ---------- ActivityIndicator and Skeleton ---------- */

export interface ActivityIndicatorProps {
  testID?: string;
  /** What is loading, read by screen readers: "Loading transactions". */
  label?: string;
  size?: 'small' | 'large';
}

/** Shows that something is loading. */
export function ActivityIndicator({ testID, label = 'Loading', size = 'large' }: ActivityIndicatorProps) {
  const t = useTheme();
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}
          style={{ alignItems: 'center', gap: 8, padding: 12 }}>
      <Spin size={size} color={t.color.primary} />
      <Text style={{ fontSize: 13, color: t.color.textMuted }}>{label}</Text>
    </View>
  );
}

export interface SkeletonProps {
  testID?: string;
  /** Lines of text to stand in for. */
  lines?: number;
  label?: string;
}

/** The shape of the content while it loads, with a soft pulse (still when the device asks for reduced motion). */
export function Skeleton({ testID, lines = 3, label = 'Loading' }: SkeletonProps) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || !live) { return; }
      loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]));
      loop.start();
    }).catch(() => undefined);
    return () => { live = false; loop?.stop(); };
  }, [pulse]);
  return (
    <Animated.View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}
                   style={{ gap: 10, opacity: pulse }}>
      {Array.from({ length: lines }, (_, i) => (
        <View key={i} style={{ height: 14, borderRadius: 7, backgroundColor: t.color.surface3, width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </Animated.View>
  );
}

/* ---------- EmptyState ---------- */

export interface EmptyStateProps {
  testID?: string;
  title: string;
  /** What to do to fill it. */
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** What to do when there is nothing yet. */
export function EmptyState({ testID, title, body, actionLabel, onAction }: EmptyStateProps) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ alignItems: 'center', gap: 8, padding: 24 }}>
      <View importantForAccessibility="no" style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.color.primarySoft, alignItems: 'center',
        justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, color: t.color.primaryText }}>○</Text>
      </View>
      <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', color: t.color.text, textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ fontSize: 14, color: t.color.textMuted, textAlign: 'center' }}>{body}</Text> : null}
      {actionLabel ? <Button testID={testID ? `${testID}-action` : undefined} label={actionLabel} onAction={onAction} /> : null}
    </View>
  );
}

/* ---------- Tooltip ---------- */

export interface TooltipProps {
  testID: string;
  /** The term it explains ("Available balance"); the button reads "About Available balance". */
  label: string;
  text: string;
  children?: ReactNode;
}

/** A short explanation on demand: phones have no hover, so the i button opens it and announces it. */
export function Tooltip({ testID, label, text, children }: TooltipProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const flip = () => { if (!open) { AccessibilityInfo.announceForAccessibility(text); } setOpen(!open); };
  return (
    <View testID={testID} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {children ?? <Text style={{ fontSize: 14, color: t.color.textBody }}>{label}</Text>}
        <Touch testID={`${testID}-button`} label={`About ${label}`} selected={open} onPress={flip} style={{ width: t.minTouch, alignItems: 'center' }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: t.color.textMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.color.textMuted }}>i</Text>
          </View>
        </Touch>
      </View>
      {open ? (
        <View testID={`${testID}-text`} style={{ padding: 10, borderRadius: t.radius.control, backgroundColor: t.color.text, alignSelf: 'flex-start', maxWidth: 280 }}>
          <Text style={{ fontSize: 13, color: t.color.surface }}>{text}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ---------- Alert, ErrorMessage, SuccessMessage ---------- */

export type AlertProps = BannerProps;

/** Information for everyone on a screen. */
export function Alert(props: AlertProps) {
  return <Banner {...props} />;
}

export type MessageProps = Omit<BannerProps, 'tone'>;

/** What went wrong and what to do next; announced at once. */
export function ErrorMessage(props: MessageProps) {
  return <Banner {...props} tone="danger" />;
}

/** Confirms that an action worked. */
export function SuccessMessage(props: MessageProps) {
  return <Banner {...props} tone="success" />;
}

/* ---------- NotificationPanel ---------- */

export interface NotificationPanelProps {
  testID: string;
  label?: string;
  /** Newest first; unread ones are bold and read as "Unread". */
  items: ReadonlyArray<Item>;
  /** Marks one read. */
  onRead?: (item: Item) => void;
  onSelect?: (item: Item) => void;
}

/** Messages from the bank, newest first, with Read on the unread ones. */
export function NotificationPanel({ testID, label = 'Notifications', items, onRead, onSelect }: NotificationPanelProps) {
  const unread = items.filter((x) => x.unread).length;
  return <ItemList testID={testID} label={unread ? `${label}, ${unread} unread` : label} items={items} onSelect={onSelect}
                   actionLabel={onRead ? 'Read' : undefined} onAction={onRead} showAction={(x) => !!x.unread} emptyText="No messages from the bank." />;
}
