/*
 * Group 1: the rest of the foundation, layout, data and feedback. The same props as the web packs; on a phone the menu
 * and the drawer open as sheets, and everything a screen reader reaches has a role, a name and its state.
 */
import { Children, ReactNode, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator as Spin, Animated, Image, Text, View, useWindowDimensions } from 'react-native';

import { Button, ButtonProps } from './Button';
import { Dialog } from './Dialog';
import { Banner, BannerProps, Chips, ChipsProps, Item, ItemList, ListEntry, Segment, SegmentProps, Sheet, SliderControl, SliderControlProps, Steps, StepsProps,
  TimelineItem, TimelineList, TimelineListProps, Tone, Touch, panel, toItems, toneColors } from './parts';
import { Enter, useCycle, useShimmer } from './motion';
import { useTheme } from './theme';
import { BadgeVariant, EmptyVariant, Orb, OrbState, PulseDots, SkeletonVariant, SpinnerVariant, TooltipVariant, badgeLook, emptyLook, isDark, skeletonLook, tooltipLook } from './variants';

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

export interface MenuItem extends ListEntry {
  /** Shown in the danger colour (close the account). */
  danger?: boolean;
}

export interface ActionMenuProps {
  testID: string;
  /** The button's name, "More" by default; screen readers read "More actions". */
  label?: string;
  items: ReadonlyArray<string | MenuItem>;
  /** Called with the item's value (else its id or label). */
  onAction?: (value: string) => void;
  disabled?: boolean;
}

/** More actions behind one button: a sheet of actions on a phone. */
export function ActionMenu({ testID, label = 'More', items, onAction, disabled }: ActionMenuProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Touch testID={testID} label={`${label} actions`} hint="Opens a list of actions" disabled={disabled} onPress={() => setOpen(true)}
             style={{ minWidth: t.minTouch, alignItems: 'center', paddingHorizontal: 12, borderRadius: t.radius.control }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.color.primaryText }}>{label} ⋯</Text>
      </Touch>
      <Sheet testID={`${testID}-sheet`} open={open} title={label} onClose={() => setOpen(false)}>
        {toItems(items).map((a) => (
          <Touch key={a.key} testID={`${testID}-${a.key}`} label={a.label} disabled={a.disabled} onPress={() => { setOpen(false); onAction?.(a.key); }}
                 style={{ paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 16, color: (a.source as MenuItem).danger ? t.color.dangerText : t.color.text }}>{a.label}</Text>
          </Touch>
        ))}
      </Sheet>
    </>
  );
}

/* ---------- Accordion ---------- */

export interface PanelItem {
  id?: string;
  title: string;
  body?: ReactNode;
}

export interface AccordionProps {
  testID: string;
  /** A heading above the sections. */
  label?: string;
  items: ReadonlyArray<PanelItem>;
  /** The open sections (their id, else their title); without it the accordion keeps its own. */
  expanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  /** Several open at once; one at a time unless set. */
  multiple?: boolean;
}

/** Questions and details that open in place; each header is a button that says whether it is expanded. */
export function Accordion({ testID, label, items, expanded, onExpandedChange, multiple }: AccordionProps) {
  const t = useTheme();
  const [own, setOwn] = useState<string[]>([]);
  const open = expanded ?? own;
  const flip = (key: string) => {
    const next = open.includes(key) ? open.filter((x) => x !== key) : multiple ? [...open, key] : [key];
    setOwn(next);
    onExpandedChange?.(next);
  };
  return (
    <Enter testID={testID} style={[panel(t), { gap: 0, paddingVertical: 4 }]}>
      {label ? <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text, paddingVertical: 8 }}>{label}</Text> : null}
      {items.map((x, i) => {
        const key = x.id ?? x.title;
        const on = open.includes(key);
        return (
          <View key={key} style={{ borderTopWidth: i || label ? 1 : 0, borderColor: t.color.border }}>
            <Touch testID={`${testID}-${key}`} label={x.title} expanded={on} onPress={() => flip(key)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: t.color.text }}>{x.title}</Text>
                <Text importantForAccessibility="no" style={{ fontSize: 16, color: t.color.textMuted }}>{on ? '−' : '+'}</Text>
              </View>
            </Touch>
            {on ? <View testID={`${testID}-${key}-body`} style={{ paddingBottom: 12 }}>
              {typeof x.body === 'string' ? <Text style={{ fontSize: 14, color: t.color.textBody }}>{x.body}</Text> : x.body}
            </View> : null}
          </View>
        );
      })}
    </Enter>
  );
}

/* ---------- Stepper ---------- */

export type StepperProps = StepsProps;

/** Done, current and next steps of a journey. */
export function Stepper(props: StepperProps) {
  return <Steps {...props} />;
}

/* ---------- Drawer (the web packs' SideNav) and BottomSheet (Sheet) ---------- */

export interface NavItem extends ListEntry {
  /** A count or word beside the item ("3"). */
  badge?: string | number;
}

export interface DrawerProps {
  testID: string;
  label?: string;
  items: ReadonlyArray<string | NavItem>;
  /** The current page's id. */
  selection?: string;
  onSelectionChange?: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The app's menu in a drawer from the start edge; the current page is marked and choosing one closes it. */
export function Drawer({ testID, label = 'Main', items, selection, onSelectionChange, open, onOpenChange }: DrawerProps) {
  const t = useTheme();
  return (
    <Sheet testID={testID} open={open} title={label} side="start" onClose={() => onOpenChange(false)}>
      {toItems(items).map((x) => {
        const on = x.key === selection;
        const badge = (x.source as NavItem).badge;
        return (
          <Touch key={x.key} testID={`${testID}-${x.key}`} label={badge === undefined ? x.label : `${x.label}, ${badge}`} current={on}
                 disabled={x.disabled} onPress={() => { onSelectionChange?.(x.key); onOpenChange(false); }}
                 style={{ paddingHorizontal: 12, borderRadius: t.radius.control, backgroundColor: on ? t.color.primarySoft : 'transparent' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: on ? '700' : '500', color: on ? t.color.primaryText : t.color.text }}>{x.label}</Text>
              {badge !== undefined ? <Text style={{ fontSize: 12.5, fontWeight: '700', color: t.color.primaryText }}>{badge}</Text> : null}
            </View>
          </Touch>
        );
      })}
    </Sheet>
  );
}

export interface BottomSheetProps {
  testID: string;
  heading: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: ReactNode;
  /** The sheet's actions, at its foot. */
  footer?: ReactNode;
}

/** A panel that slides over the screen for filters or details. */
export function BottomSheet({ testID, heading, open, onOpenChange, children, footer }: BottomSheetProps) {
  return (
    <Sheet testID={testID} open={open} title={heading} onClose={() => onOpenChange(false)}>
      {children}
      {footer ? <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap', paddingTop: 8 }}>{footer}</View> : null}
    </Sheet>
  );
}

/* ---------- Stack (the web packs' Grid) and Divider ---------- */

export interface StackProps {
  testID?: string;
  /** Columns; auto stacks on a phone and makes two on a tablet. */
  columns?: 1 | 2 | 3 | 4 | 'auto';
  gap?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

/** Lays out children in equal columns that wrap onto more rows. */
export function Stack({ testID, columns = 'auto', gap = 'md', children }: StackProps) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const n = columns === 'auto' ? (width >= 768 ? 2 : 1) : columns;
  const g = { sm: t.space.s, md: t.space.m, lg: t.space.l }[gap];
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -g / 2 }}>
      {Children.toArray(children).map((c, i) => (
        <View key={i} style={{ width: `${100 / n}%`, paddingHorizontal: g / 2, paddingBottom: g }}>{c}</View>
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
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';

const AVATAR = { sm: 32, md: 40, lg: 56 } as const;

/** Initials or a photo for a person or payee. */
export function Avatar({ testID, name, src, size = 'md' }: AvatarProps) {
  const t = useTheme();
  const d = AVATAR[size];
  const box = { width: d, height: d, borderRadius: d / 2 };
  return src
    ? <Image testID={testID} source={{ uri: src }} style={box} accessibilityLabel={name} accessibilityRole="image" />
    : (
      <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={name}
            style={[box, { backgroundColor: t.color.primarySoft, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: d * 0.38, fontWeight: '700', color: t.color.primaryText }}>{initials(name)}</Text>
      </View>
    );
}

/* ---------- Pagination ---------- */

export interface PaginationProps {
  testID: string;
  label?: string;
  /** The current page, from 1. */
  page: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
}

/** Previous, the pages near the current one, and Next; the current page is marked for screen readers. */
export function Pagination({ testID, label = 'Pages', page, pageCount, onPageChange }: PaginationProps) {
  const t = useTheme();
  const from = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, i) => from + i);
  const nav = (text: string, to: number, off: boolean) => (
    <Touch testID={`${testID}-${text.toLowerCase()}`} label={`${text} page`} disabled={off} onPress={() => onPageChange?.(to)}
           style={{ paddingHorizontal: 10, borderRadius: t.radius.control }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: t.color.primaryText }}>{text === 'Previous' ? '‹' : '›'}</Text>
    </Touch>
  );
  return (
    <View testID={testID} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
      {nav('Previous', page - 1, page <= 1)}
      {pages.map((p) => (
        <Touch key={p} testID={`${testID}-${p}`} label={`Page ${p} of ${pageCount}`} selected={p === page} onPress={() => onPageChange?.(p)}
               style={{ minWidth: t.minTouch, alignItems: 'center', borderRadius: t.radius.control, backgroundColor: p === page ? t.color.primary : 'transparent' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: p === page ? t.color.onPrimary : t.color.text }}>{p}</Text>
        </Touch>
      ))}
      {nav('Next', page + 1, page >= pageCount)}
    </View>
  );
}

/* ---------- StatusBadge ---------- */

export interface StatusBadgeProps {
  testID?: string;
  label: string;
  tone?: Tone;
  /** The style: default, filled, outlined or dot. */
  variant?: BadgeVariant;
}

/** The state of a payment at a glance; the colour is never the only sign, the word is always there. */
export function StatusBadge({ testID, label, tone = 'neutral', variant = 'default' }: StatusBadgeProps) {
  const t = useTheme();
  const c = toneColors(t, tone);
  const look = badgeLook(t, variant, c);
  return (
    <View testID={testID} accessible accessibilityLabel={`Status: ${label}`}
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, ...look.box }}>
      {look.dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.line }} /> : null}
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: look.fg }}>{label}</Text>
    </View>
  );
}

/* ---------- Timeline ---------- */

export type TimelineProps = TimelineListProps;
export type { TimelineItem };

/** Events in order, with who and when. */
export function Timeline({ label = 'Timeline', ...props }: TimelineProps) {
  return <TimelineList {...props} label={label} />;
}

/* ---------- ActivityIndicator (the web packs' Spinner) and Skeleton ---------- */

export interface ActivityIndicatorProps {
  testID?: string;
  /** What is loading, read by screen readers: "Loading transactions". */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  /** The style: the platform's ring (default), material, dots, or orbs (a thinking orb for an AI assistant). */
  variant?: SpinnerVariant;
  /** What the orb shows when variant is orbs. */
  orbState?: OrbState;
}

/** Shows that something is loading. */
export function ActivityIndicator({ testID, label = 'Loading', size = 'md', variant = 'default', orbState = 'working' }: ActivityIndicatorProps) {
  const t = useTheme();
  const px = size === 'lg' ? 40 : size === 'sm' ? 16 : 24;
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}
          style={{ alignItems: 'center', gap: 8, padding: 12 }}>
      {variant === 'material' ? <MaterialArc size={px} color={t.color.primary} />
        : variant === 'dots' ? <PulseDots color={t.color.primary} size={px / 3} />
        : variant === 'orbs' ? <Orb state={orbState} size={size === 'lg' ? 64 : 20} dark={isDark(t)} />
        : <Spin size={size === 'lg' ? 'large' : size === 'sm' ? 18 : 'small'} color={t.color.primary} aria-hidden />}
      <Text style={{ fontSize: 13, color: t.color.textMuted }}>{label}</Text>
    </View>
  );
}

/** Material's circular indicator: an arc that turns; still under reduced motion. */
function MaterialArc({ size, color }: { size: number; color: string }) {
  const spin = useCycle(1100, true);
  return <Animated.View importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size / 9), borderColor: color,
    borderTopColor: 'transparent', borderRightColor: 'transparent', transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }} />;
}

export interface SkeletonProps {
  testID?: string;
  label?: string;
  /** Lines of text to stand in for. */
  lines?: number;
  shape?: 'text' | 'card' | 'circle';
  /** The style: default (shimmer), pulse or soft (still, rounder, lighter). */
  variant?: SkeletonVariant;
}

/** The shape of the content while it loads, with a soft pulse (still when the device asks for reduced motion). */
export function Skeleton({ testID, label = 'Loading', lines = 3, shape = 'text', variant = 'default' }: SkeletonProps) {
  const t = useTheme();
  const shimmer = useShimmer(variant === 'default');
  const cycle = useCycle(1500, variant === 'pulse');
  const pulse = { opacity: cycle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.4, 1] }) };
  const look = skeletonLook(t, variant);
  return (
    <Animated.View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}
                   style={[{ gap: 10 }, variant === 'pulse' ? pulse : shimmer]}>
      {shape === 'circle' ? <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: look.fill }} />
        : shape === 'card' ? <View style={{ height: 120, borderRadius: t.radius.card * look.round, backgroundColor: look.fill }} />
          : Array.from({ length: lines }, (_, i) => (
            <View key={i} style={{ height: 14, borderRadius: 7 * look.round, backgroundColor: look.fill, width: i === lines - 1 ? '60%' : '100%' }} />
          ))}
    </Animated.View>
  );
}

/* ---------- EmptyState ---------- */

export interface EmptyStateProps {
  testID?: string;
  heading: string;
  /** What to do to fill it. */
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** A short symbol above the heading; it is not read. */
  icon?: string;
  /** The style: default, illustrated, compact or card. */
  variant?: EmptyVariant;
}

/** What to do when there is nothing yet. */
export function EmptyState({ testID, heading, text, actionLabel, onAction, icon = '○', variant = 'default' }: EmptyStateProps) {
  const t = useTheme();
  const look = emptyLook(t, variant);
  const align = look.row ? 'left' : 'center';
  return (
    <View testID={testID} style={look.box}>
      <View importantForAccessibility="no" style={{ width: look.disc, height: look.disc, borderRadius: look.disc / 2, backgroundColor: t.color.primarySoft, alignItems: 'center',
        justifyContent: 'center' }}>
        <Text style={{ fontSize: look.disc * 0.43, color: t.color.primaryText }}>{icon}</Text>
      </View>
      <View style={look.row ? { flex: 1, gap: 2 } : { alignItems: 'center', gap: 8 }}>
        <Text accessibilityRole="header" style={{ fontSize: look.row ? 15 : 17, fontWeight: '700', color: t.color.text, textAlign: align }}>{heading}</Text>
        {text ? <Text style={{ fontSize: 14, color: t.color.textMuted, textAlign: align }}>{text}</Text> : null}
      </View>
      {actionLabel ? <Button testID={testID ? `${testID}-action` : undefined} label={actionLabel} onAction={onAction} /> : null}
    </View>
  );
}

/* ---------- Tooltip ---------- */

export interface TooltipProps {
  testID?: string;
  /** The term it explains ("Available balance"); the button reads "About Available balance". */
  label: string;
  text: string;
  children?: ReactNode;
  /** The style: default, plain, rich or beak. */
  variant?: TooltipVariant;
}

/** A short explanation on demand: phones have no hover, so the i button opens it and announces it. */
export function Tooltip({ testID, label, text, children, variant = 'default' }: TooltipProps) {
  const look = tooltipLook(useTheme(), variant);
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const flip = () => { if (!open) { AccessibilityInfo.announceForAccessibility(text); } setOpen(!open); };
  // Escape (a keyboard on the web or a tablet) and the screen reader's escape gesture close it (WCAG 1.4.13)
  const escape = { onKeyDown: (e: { nativeEvent: { key?: string } }) => { if (e.nativeEvent.key === 'Escape') { setOpen(false); } } };
  return (
    <View testID={testID} style={{ gap: 6 }} onAccessibilityEscape={() => setOpen(false)} {...escape}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {children ?? <Text style={{ fontSize: 14, color: t.color.textBody }}>{label}</Text>}
        <Touch testID={testID ? `${testID}-button` : undefined} label={`About ${label}`} selected={open} onPress={flip} style={{ width: t.minTouch, alignItems: 'center' }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: t.color.textMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.color.textMuted }}>i</Text>
          </View>
        </Touch>
      </View>
      {open ? (
        <View style={{ alignSelf: 'flex-start' }}>
          {variant === 'beak' ? <View style={{ marginLeft: 14, marginBottom: -6, width: 10, height: 10, backgroundColor: t.color.surface, borderLeftWidth: 1, borderTopWidth: 1,
            borderColor: t.color.borderStrong, transform: [{ rotate: '45deg' }], zIndex: 1 }} /> : null}
          <View testID={testID ? `${testID}-text` : undefined} role="tooltip" style={{ ...look.bubble, maxWidth: 280 }}>
            <Text style={{ fontSize: variant === 'rich' ? 14 : 13, lineHeight: variant === 'rich' ? 20 : undefined, color: look.fg }}>{text}</Text>
          </View>
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

export type MessageProps = Omit<BannerProps, 'severity'>;

/** What went wrong and what to do next; announced at once. */
export function ErrorMessage(props: MessageProps) {
  return <Banner {...props} severity="error" />;
}

/** That it worked, and what next. */
export function SuccessMessage(props: MessageProps) {
  return <Banner {...props} severity="confirmation" />;
}

/* ---------- NotificationPanel ---------- */

export interface NotificationPanelProps {
  testID: string;
  heading?: string;
  /** Newest first; unread ones are bold and read as "Unread". */
  items: ReadonlyArray<Item>;
  /** The button on unread items, "Read" by default. */
  actionLabel?: string;
  /** Marks one read. */
  onAction?: (item: Item) => void;
  onSelect?: (item: Item) => void;
  emptyText?: string;
}

/** Alerts and notices for the customer, newest first, with Read on the unread ones. */
export function NotificationPanel({ testID, heading = 'Notifications', items, actionLabel = 'Read', onAction, onSelect,
  emptyText = 'No messages from the bank.' }: NotificationPanelProps) {
  const unread = items.filter((x) => x.unread).length;
  return <ItemList testID={testID} heading={unread ? `${heading}, ${unread} unread` : heading} items={items} onSelect={onSelect}
                   actionLabel={onAction ? actionLabel : undefined} onAction={onAction} showAction={(x) => !!x.unread} emptyText={emptyText} />;
}
