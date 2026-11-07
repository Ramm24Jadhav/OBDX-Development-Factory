/*
 * The building blocks the banking groups (G1 to G6) share: a sheet, a banner, a key-value card, tiles, a list of items
 * with an action, steps, a timeline, progress bars, bar charts, a segmented choice, chips, code boxes and a slider.
 * Each named component in G1.tsx to G6.tsx is one of these with its banking meaning, so they look and read alike.
 */
import { ComponentRef, ReactNode, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from './Button';
import { panelRole } from './Dialog';
import { formatAmount } from './TextField';
import type { Severity } from './Toast';
import { FieldProps, styles, useField } from './field';
import { Enter, MODAL_FADE, Pop, Press, Roll, Shake, useGrow, useOpen, useSlide } from './motion';
import { Theme, useTheme } from './theme';
import { part, variantOf } from './variants';

/** The kinds whose variants style the slider. */
const SLIDERS = 'slider';

/** A form's props: the field props with the heading optional. */
export type FormProps<T> = Omit<FieldProps<T>, 'label'> & { label?: string };

export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export function toneColors(t: Theme, tone: Tone = 'neutral') {
  const c = t.color;
  return tone === 'info' ? { fg: c.infoText, bg: c.infoSoft, line: c.info } : tone === 'success' ? { fg: c.successText, bg: c.successSoft, line: c.success }
    : tone === 'warning' ? { fg: c.warningText, bg: c.warningSoft, line: c.warning } : tone === 'danger' ? { fg: c.dangerText, bg: c.dangerSoft, line: c.danger }
    : { fg: c.textBody, bg: c.surface2, line: c.borderStrong };
}

/** Masks an account or card number to its last four digits: "·· 4821". */
export function maskNumber(n: string): string {
  const digits = n.replace(/\s/g, '');
  return digits.length <= 4 ? digits : `·· ${digits.slice(-4)}`;
}

/** The panel every group uses: a surface with the card radius, border and shadow of the component style. */
export function panel(t: Theme) {
  return {
    gap: 12, padding: 16, borderRadius: t.radius.card, backgroundColor: t.color.surface, borderWidth: t.border,
    borderColor: t.look === 'brutal' ? t.color.text : t.color.border,
    ...(t.shadow ? { shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 } : {}),
  };
}

export function Heading({ children, t }: { children: ReactNode; t: Theme }) {
  return <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{children}</Text>;
}

/** A plain pressable row or button that is at least the touch size. */
export function Touch({ testID, label, hint, onPress, disabled, selected, current, expanded, role = 'button', style, children }: {
  testID?: string; label?: string; hint?: string; onPress?: () => void; disabled?: boolean; selected?: boolean; current?: boolean; expanded?: boolean; role?: 'button' | 'link' | 'tab' | 'radio';
  style?: object; children: ReactNode;
}) {
  const t = useTheme();
  return (
    <Press testID={testID} accessibilityRole={role} accessibilityLabel={label} accessibilityHint={hint} disabled={disabled} onPress={onPress} aria-current={current ? 'page' : undefined}
               accessibilityState={{ disabled: !!disabled, ...(expanded === undefined ? {} : { expanded }), ...(current ? { selected: true } : {}), ...(selected === undefined ? {} : role === 'radio' ? { checked: selected } : { selected }) }}
           style={[{ minHeight: t.minTouch, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }, style]}>
      {children}
    </Press>
  );
}

/* ---------- Sheet ---------- */

/** A panel that slides up over the screen; the back button and a tap outside close it, and the screen behind is hidden from screen readers. */
export function Sheet({ testID, open, title, onClose, children, side }: {
  testID?: string; open: boolean; title: string; onClose: () => void; children: ReactNode; side?: 'bottom' | 'start';
}) {
  const t = useTheme();
  const start = side === 'start';
  const spring = useOpen(open, start ? 'drop' : 'sheet');
  return (
    <Modal visible={open} transparent animationType={MODAL_FADE} accessibilityLabel={title} onRequestClose={onClose} testID={testID ? `${testID}-modal` : undefined}>
      <View style={{ flex: 1, flexDirection: start ? 'row' : 'column', justifyContent: start ? 'flex-start' : 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.color.overlay }]} accessibilityRole="button" accessibilityLabel={`Close ${title}`}
                   onPress={onClose} />
        <Animated.View testID={testID} accessibilityViewIsModal {...panelRole(title)}
              style={[spring, { backgroundColor: t.color.surface, padding: 16, paddingBottom: 28, gap: 8, ...(start
                ? { width: '82%', maxWidth: 360, height: '100%' }
                : { maxHeight: '80%', borderTopLeftRadius: t.radius.card, borderTopRightRadius: t.radius.card }) }]}>
          <Heading t={t}>{title}</Heading>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ---------- Items (the web packs' ItemLike) ---------- */

/** An entry of a list as the web packs take it: a string, or an object named by its label (or title, value, id). */
export interface ListEntry {
  id?: string;
  label?: string;
  title?: string;
  value?: string | number;
  disabled?: boolean;
  [key: string]: unknown;
}

export type ItemLike = string | ListEntry;

/** The entries with an id (value, else id, label, title) and a label, as the web packs read them. */
export function toItems(items: ReadonlyArray<ItemLike> = []) {
  return items.map((o, index) => {
    if (typeof o !== 'object' || o === null) { return { id: String(o), key: String(o), label: String(o), disabled: false, index, source: o }; }
    const id = String(o.id ?? o.value ?? o.label ?? o.title ?? index);
    return { ...o, id, key: o.value !== undefined ? String(o.value) : id, label: String(o.label ?? o.title ?? o.value ?? id), disabled: !!o.disabled, index, source: o };
  });
}

/* ---------- Banner ---------- */


export interface BannerProps {
  testID: string;
  /** A short title above the message. */
  heading?: string;
  /** What happened and what to do next. */
  message: string;
  severity?: Severity;
  actionLabel?: string;
  onAction?: () => void;
  /** Shows a Dismiss button that hides the message (and calls onClose). */
  dismissible?: boolean;
  onClose?: () => void;
}

const TONE: Record<Severity, Tone> = { error: 'danger', warning: 'warning', confirmation: 'success', info: 'info' };

/** A message across the screen: errors and warnings are alerts and are announced, the rest are read in turn. */
export function Banner({ testID, heading, message, severity = 'info', actionLabel, onAction, dismissible, onClose }: BannerProps) {
  const t = useTheme();
  const [gone, setGone] = useState(false);
  if (gone) { return null; }
  const c = toneColors(t, TONE[severity]);
  const urgent = severity === 'error' || severity === 'warning';
  return (
    <Enter testID={testID} style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: t.radius.card, backgroundColor: c.bg, borderLeftWidth: 4,
      borderLeftColor: c.line, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, gap: 4 }} accessible role={urgent ? 'alert' : 'status'} accessibilityLiveRegion={urgent ? 'assertive' : 'polite'}>
        {heading ? <Text style={{ fontSize: 14, fontWeight: '700', color: c.fg }}>{heading}</Text> : null}
        <Text style={{ fontSize: 14, fontWeight: heading ? '400' : '600', color: heading ? t.color.textBody : c.fg }}>{message}</Text>
      </View>
      {actionLabel ? (
        <Touch testID={`${testID}-action`} label={actionLabel} onPress={onAction} style={{ paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.fg }}>{actionLabel}</Text>
        </Touch>
      ) : null}
      {dismissible ? (
        <Touch testID={`${testID}-close`} label="Dismiss" onPress={() => { setGone(true); onClose?.(); }} style={{ width: t.minTouch, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, color: c.fg }} importantForAccessibility="no">×</Text>
        </Touch>
      ) : null}
    </Enter>
  );
}

/* ---------- KeyValues ---------- */

export interface Row {
  label: string;
  value: string;
  /** Shows the value in the danger colour (a penalty) or bold (the total). */
  emphasis?: 'total' | 'negative';
}

export interface KeyValuesProps {
  testID: string;
  label?: string;
  rows: ReadonlyArray<Row>;
  actionLabel?: string;
  onAction?: () => void;
  /** The action is running: the button is busy and cannot be pressed twice. */
  busy?: boolean;
  children?: ReactNode;
}

/** Facts as "label: value" rows, each one stop for a screen reader, and one action under them. */
export function KeyValues({ testID, label, rows, actionLabel, onAction, busy, children }: KeyValuesProps) {
  const t = useTheme();
  return (
    <Enter testID={testID} style={panel(t)}>
      {label ? <Heading t={t}>{label}</Heading> : null}
      <View>
        {rows.map((r, i) => (
          <View key={r.label} accessible accessibilityLabel={`${r.label}: ${r.value}`}
                style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10,
                  borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: t.color.border }}>
            <Text style={{ fontSize: 14, color: t.color.textMuted }}>{r.label}</Text>
            <Text style={{ fontSize: 14, flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'],
              color: r.emphasis === 'negative' ? t.color.dangerText : t.color.text, fontWeight: r.emphasis === 'total' ? '700' : '500' }}>{r.value}</Text>
          </View>
        ))}
      </View>
      {children}
      {actionLabel ? <Button testID={`${testID}-action`} label={actionLabel} busy={busy} onAction={onAction} /> : null}
    </Enter>
  );
}

/* ---------- Tiles ---------- */

export interface Tile {
  id: string;
  title: string;
  value: string;
  note?: string;
  tone?: Tone;
}

export interface TilesProps {
  testID: string;
  label?: string;
  tiles: ReadonlyArray<Tile>;
  /** The tile picked for detail. */
  value?: string;
  onChange?: (id: string) => void;
}

/** A set of totals, two to a row; when onChange is set each tile is a button that picks it. */
export function Tiles({ testID, label, tiles, value, onChange }: TilesProps) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ gap: 10 }}>
      {label ? <Heading t={t}>{label}</Heading> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((x) => {
          const on = x.id === value;
          const body = (
            <>
              <Text style={{ fontSize: 13, color: t.color.textMuted }}>{x.title}</Text>
              <Roll on={x.value}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: x.tone ? toneColors(t, x.tone).fg : t.color.text, fontVariant: ['tabular-nums'] }}>{x.value}</Text>
              </Roll>
              {x.note ? <Text style={{ fontSize: 12.5, color: t.color.textMuted }}>{x.note}</Text> : null}
            </>
          );
          const box = [panel(t), { gap: 4, flexGrow: 1, flexBasis: '45%', ...(on ? { borderColor: t.color.primary, borderWidth: 1.5 } : {}) }];
          // Named by its own text (title, value, note), so the name always matches what is shown
          return onChange
            ? <Touch key={x.id} testID={`${testID}-${x.id}`} selected={on} onPress={() => onChange(x.id)} style={box}>{body}</Touch>
            : <Enter key={x.id} testID={`${testID}-${x.id}`} accessible style={box}>{body}</Enter>;
        })}
      </View>
    </View>
  );
}

/* ---------- ItemList (the web packs' Rows) ---------- */

export interface Item {
  id: string;
  title: string;
  /** A second line: the date, the account. */
  meta?: string;
  /** On the right: the amount, the kind. */
  value?: string;
  tone?: Tone;
  /** Shown in bold with a dot until read. */
  unread?: boolean;
}

export interface ItemListProps {
  testID: string;
  heading?: string;
  items: ReadonlyArray<Item>;
  /** The button on each row ("Pay", "Download"); it is named with the row, for example "Pay: Electricity". */
  actionLabel?: string;
  onAction?: (item: Item) => void;
  /** A second button on each row (Reject beside Approve). */
  secondaryLabel?: string;
  onSecondary?: (item: Item) => void;
  /** Which rows get the action; all by default. */
  showAction?: (item: Item) => boolean;
  /** Makes each row a button (open the item). */
  onSelect?: (item: Item) => void;
  emptyText?: string;
}

/** Rows with a title, a line under it, a value on the right and one action each. */
export function ItemList({ testID, heading, items, actionLabel, onAction, secondaryLabel, onSecondary, showAction, onSelect, emptyText = 'Nothing here yet.' }:
  ItemListProps) {
  const t = useTheme();
  return (
    <Enter testID={testID} style={[panel(t), { gap: 0, paddingVertical: 6 }]}>
      {heading ? <View style={{ paddingVertical: 8 }}><Heading t={t}>{heading}</Heading></View> : null}
      {items.length === 0 ? <Text style={{ fontSize: 14, color: t.color.textMuted, paddingVertical: 12 }}>{emptyText}</Text> : null}
      {items.map((x, i) => {
        const name = [x.unread ? 'Unread' : '', x.title, x.meta, x.value].filter(Boolean).join(', ');
        const text = (
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: x.unread ? '700' : '500', color: t.color.text }}>{x.unread ? '● ' : ''}{x.title}</Text>
            {x.meta ? <Text style={{ fontSize: 13, color: t.color.textMuted }}>{x.meta}</Text> : null}
          </View>
        );
        return (
          <Enter key={x.id} effect="settle" testID={`${testID}-${x.id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: t.minTouch + 8,
            borderTopWidth: i || heading ? StyleSheet.hairlineWidth : 0, borderColor: t.color.border }}>
            {onSelect
              ? <Touch testID={`${testID}-${x.id}-open`} label={name} onPress={() => onSelect(x)} style={{ flex: 1 }}>{text}</Touch>
              : <View style={{ flex: 1 }} accessible accessibilityLabel={name}>{text}</View>}
            {x.value ? <Text importantForAccessibility="no" style={{ fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'],
              color: x.tone ? toneColors(t, x.tone).fg : t.color.text }}>{x.value}</Text> : null}
            {secondaryLabel ? (
              <Touch testID={`${testID}-${x.id}-secondary`} label={`${secondaryLabel}: ${x.title}`} onPress={() => onSecondary?.(x)} style={{ paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.color.dangerText }}>{secondaryLabel}</Text>
              </Touch>
            ) : null}
            {actionLabel && (!showAction || showAction(x)) ? (
              <Touch testID={`${testID}-${x.id}-action`} label={`${actionLabel}: ${x.title}`} onPress={() => onAction?.(x)} style={{ paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: t.color.primaryText }}>{actionLabel}</Text>
              </Touch>
            ) : null}
          </Enter>
        );
      })}
    </Enter>
  );
}

/* ---------- Steps (the web packs' Stepper) ---------- */

export type StepState = 'done' | 'current' | 'next' | 'failed';
export interface StepItem extends ListEntry { state?: StepState }

export interface StepsProps {
  testID: string;
  /** Names the list of steps. */
  label?: string;
  steps: ReadonlyArray<string | StepItem>;
  /** The current step's id; the ones before it are done. A step's own state wins. */
  selectedStep?: string;
}

/** Where the customer is in a flow: done steps ticked, the current one marked and announced as "Step 2 of 3". */
export function Steps({ testID, label = 'Progress', steps, selectedStep }: StepsProps) {
  const t = useTheme();
  const list = toItems(steps);
  const at = list.findIndex((s) => s.id === selectedStep);
  const states = list.map((s, i) => ((s.source as StepItem).state ?? (i < at ? 'done' : i === at ? 'current' : 'next')) as StepState);
  const current = states.indexOf('current');
  const summary = states.every((s) => s === 'done') ? `All ${list.length} steps done`
    : current >= 0 ? `Step ${current + 1} of ${list.length}: ${list[current].label}` : `${list.length} steps`;
  const failed = states.indexOf('failed');
  return (
    <View testID={testID} accessible accessibilityRole="progressbar"
          accessibilityLabel={`${label}, ${summary}${failed >= 0 ? `, ${list[failed].label} failed` : ''}`}
          accessibilityValue={{ min: 0, max: list.length, now: states.filter((s) => s === 'done').length }} style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: t.color.textBody }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {list.map((step, i) => {
          const state = states[i];
          const done = state === 'done';
          const on = state === 'current';
          const bad = state === 'failed';
          const mark = bad ? t.color.danger : t.color.primary;
          return (
            <View key={step.id} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : done || on ? t.color.primary : t.color.border }} />
                <Pop on={on && selectedStep} style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
                  borderColor: done || on || bad ? mark : t.color.borderStrong, backgroundColor: done || bad ? mark : t.color.surface }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: done || bad ? t.color.onPrimary : on ? t.color.primaryText : t.color.textMuted }}>
                    {done ? '✓' : bad ? '!' : i + 1}
                  </Text>
                </Pop>
                <View style={{ flex: 1, height: 2, backgroundColor: i === list.length - 1 ? 'transparent' : done ? t.color.primary : t.color.border }} />
              </View>
              <Text style={{ fontSize: 12, textAlign: 'center', color: on ? t.color.text : t.color.textMuted, fontWeight: on ? '700' : '500' }}>{step.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ---------- TimelineList (the web packs' Timeline) ---------- */

export interface TimelineItem {
  id?: string;
  label: string;
  /** Who and when. */
  meta?: string;
  /** done (ticked), current (marked), pending (grey) or failed. Without a state, an event is done. */
  state?: 'done' | 'current' | 'pending' | 'failed';
}

export interface TimelineListProps {
  testID: string;
  label?: string;
  items: ReadonlyArray<TimelineItem>;
}

/** Events in order down a line, each one stop for a screen reader with its state. */
export function TimelineList({ testID, label, items }: TimelineListProps) {
  const t = useTheme();
  const said = { done: 'done', current: 'in progress', pending: 'not yet', failed: 'failed' } as const;
  return (
    <Enter testID={testID} style={panel(t)}>
      {label ? <Heading t={t}>{label}</Heading> : null}
      {items.map((e, i) => {
        const state = e.state ?? 'done';
        const dot = state === 'done' ? t.color.success : state === 'current' ? t.color.primary : state === 'failed' ? t.color.danger : t.color.borderStrong;
        return (
          <Enter key={e.id ?? `${e.label}-${i}`} effect="settle" accessible accessibilityLabel={`${e.label}${e.meta ? `, ${e.meta}` : ''}, ${said[state]}`}
                style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center', width: 14 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 4, backgroundColor: state === 'pending' ? t.color.surface : dot, borderWidth: 2,
                borderColor: dot }} />
              {i < items.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: t.color.border, marginTop: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 12, gap: 2 }}>
              <Text style={{ fontSize: 14.5, fontWeight: state === 'current' ? '700' : '600', color: state === 'pending' ? t.color.textMuted : t.color.text }}>{e.label}</Text>
              {e.meta ? <Text style={{ fontSize: 13, color: t.color.textMuted }}>{e.meta}</Text> : null}
            </View>
          </Enter>
        );
      })}
    </Enter>
  );
}

/* ---------- ProgressList ---------- */

export interface Meter {
  label: string;
  value: number;
  max: number;
}

export interface ProgressListProps {
  testID: string;
  label?: string;
  items: ReadonlyArray<Meter>;
  /** Shows the numbers as money in this currency; without it they are plain numbers. */
  currency?: string;
  /** What the numbers are: "used" for budgets and limits (over max turns red), "saved" for goals. */
  measure?: 'used' | 'saved' | 'score';
}

/** Bars of how much is used or saved, each a progress bar with its numbers for screen readers. */
export function ProgressList({ testID, label, items, currency, measure = 'used' }: ProgressListProps) {
  const t = useTheme();
  const show = (n: number) => (currency ? formatAmount(n, currency) : String(n));
  return (
    <Enter testID={testID} style={panel(t)}>
      {label ? <Heading t={t}>{label}</Heading> : null}
      {items.map((m) => {
        const share = m.max > 0 ? m.value / m.max : 0;
        const over = measure === 'used' && share > 1;
        const text = measure === 'score' ? `${show(m.value)} of ${show(m.max)}` : `${show(m.value)} of ${show(m.max)} ${measure}`;
        return (
          // Named by its label (as oj-progress-bar by its label); the numbers are its value, read after the name
          <View key={m.label} testID={`${testID}-${m.label}`} accessible accessibilityRole="progressbar" accessibilityLabel={m.label}
                aria-valuemin={0} aria-valuemax={m.max} aria-valuenow={Math.min(m.value, m.max)} aria-valuetext={`${text}${over ? ', over the limit' : ''}`}
                style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontSize: 14, color: t.color.text, fontWeight: '500' }}>{m.label}</Text>
              <Text style={{ fontSize: 13, color: over ? t.color.dangerText : t.color.textMuted, fontVariant: ['tabular-nums'] }}>{text}</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: t.color.surface3, overflow: 'hidden' }}>
              <Grow testID={`${testID}-${m.label}-fill`} share={Math.min(share, 1)} style={{ height: '100%', borderRadius: 4,
                backgroundColor: over ? t.color.danger : share > 0.85 && measure === 'used' ? t.color.warning : t.color.primary }} />
            </View>
          </View>
        );
      })}
    </Enter>
  );
}

/* ---------- Bars ---------- */

export interface Bar {
  label: string;
  value: number;
}

export interface BarsProps {
  testID: string;
  label: string;
  bars: ReadonlyArray<Bar>;
  currency?: string;
  /** The bar picked; its amount shows above the chart. */
  value?: string;
  onChange?: (label: string) => void;
  /** Lays the bars across (modules by count) instead of up (months by amount). */
  horizontal?: boolean;
}

/** A bar chart from plain views (no drawing library): each bar is a button that reads its label and amount. */
export function Bars({ testID, label, bars, currency, value, onChange, horizontal }: BarsProps) {
  const t = useTheme();
  const [own, setOwn] = useState<string>();
  const picked = value ?? own;
  const top = Math.max(1, ...bars.map((b) => b.value));
  const show = (n: number) => (currency ? formatAmount(n, currency) : String(n));
  const chosen = bars.find((b) => b.label === picked);
  const pick = (l: string) => { setOwn(l); onChange?.(l); };
  return (
    <Enter testID={testID} style={panel(t)}>
      <Heading t={t}>{label}</Heading>
      <Text testID={`${testID}-picked`} accessibilityLiveRegion="polite" style={{ fontSize: 13, color: t.color.textMuted }}>
        {chosen ? `${chosen.label}: ${show(chosen.value)}${currency ? ` ${currency}` : ''}` : 'Tap a bar for its amount.'}
      </Text>
      <View style={horizontal ? { gap: 6 } : { flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 8 }}>
        {bars.map((b) => {
          const on = b.label === picked;
          const size = Math.max(0.04, b.value / top);
          const bar = <Grow share={size} vertical={!horizontal} style={{ ...(horizontal ? { height: 14 } : { width: '100%' }), borderRadius: 4,
            backgroundColor: on ? t.color.primary : t.color.primarySoft, borderWidth: 1, borderColor: t.color.primary }} />;
          return (
            <Touch key={b.label} testID={`${testID}-${b.label}`} label={horizontal ? undefined : `${b.label}, ${show(b.value)}`} selected={on} onPress={() => pick(b.label)}
                   style={horizontal ? { flexDirection: 'row', alignItems: 'center', gap: 8 } : { flex: 1, height: '100%', justifyContent: 'flex-end', gap: 4 }}>
              {horizontal ? <Text style={{ width: 80, fontSize: 12.5, color: t.color.textBody }}>{b.label}</Text> : null}
              {/* Horizontal: the bar's share is of the space left by the label and the value, so the value stays inside the card */}
              {horizontal ? <View style={{ flex: 1 }}>{bar}</View> : bar}
              {horizontal ? <Text style={{ fontSize: 12.5, color: t.color.textMuted }}>{show(b.value)}</Text>
                : <Text style={{ fontSize: 11.5, textAlign: 'center', color: t.color.textMuted }}>{b.label}</Text>}
            </Touch>
          );
        })}
      </View>
    </Enter>
  );
}

/* ---------- Segment and Chips ---------- */

export interface SegmentProps extends FieldProps<string> {
  options: ReadonlyArray<ItemLike>;
}

/** One of a few options side by side (a segmented control), with the radio role so screen readers say "1 of 3". */
export function Segment(props: SegmentProps) {
  const { testID, label, value, onChange, readOnly, disabled, helpText, error } = props;
  const t = useTheme();
  const s = styles(t);
  const list = toItems(props.options);
  const index = list.findIndex((o) => o.key === value);
  const at = useSlide(Math.max(index, 0));
  return (
    <Enter testID={testID} style={s.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={s.label} importantForAccessibility="no">{label}</Text>
      <Shake error={error} style={[{ padding: 3, borderRadius: t.radius.control + 2, backgroundColor: t.color.surface3 }, part(t, 'segmented', 'track')]}>
      <View style={{ flexDirection: 'row' }}>
        {index >= 0 ? <Animated.View testID={`${testID}-marker`} pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, width: `${100 / list.length}%`,
          left: at.interpolate({ inputRange: [0, list.length], outputRange: ['0%', '100%'] }), borderRadius: t.radius.control,
          backgroundColor: t.color.surface }, part(t, 'segmented', 'marker')]} /> : null}
        {list.map((o) => {
          const on = o.key === value;
          return (
            <Touch key={o.key} testID={`${testID}-option-${o.key}`} role="radio" label={o.label} selected={on} disabled={disabled || readOnly || o.disabled}
                   onPress={() => onChange?.(o.key)} style={[{ flex: 1, alignItems: 'center', paddingHorizontal: 8, borderRadius: t.radius.control,
                     minHeight: t.minTouch - 4 }, part(t, 'segmented', 'option')]}>
              <Text style={[{ fontSize: 14, textAlign: 'center', fontWeight: on ? '700' : '500', color: on ? t.color.primaryText : t.color.textBody }, part(t, 'segmented', 'text', { on })]}>{o.label}</Text>
            </Touch>
          );
        })}
      </View>
      </Shake>
      {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : helpText ? <Text style={s.help}>{helpText}</Text> : null}
    </Enter>
  );
}

export interface ChipsProps extends FieldProps<string[]> {
  options: ReadonlyArray<ItemLike>;
  /** Several chips at once (the default); false keeps one at a time (re-categorise a transaction). */
  multiple?: boolean;
}

/** Tags to narrow a list: each chip is a checkbox (a radio when not multiple) and wraps onto more lines. */
export function Chips(props: ChipsProps) {
  const { testID, label, value, onChange, readOnly, disabled, helpText, error, multiple = true } = props;
  const single = !multiple;
  const t = useTheme();
  const s = styles(t);
  const list = toItems(props.options);
  const chosen = value ?? [];
  const flip = (v: string) => onChange?.(single ? [v] : chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v]);
  return (
    <View testID={testID} style={s.field} accessibilityRole={single ? 'radiogroup' : undefined} accessibilityLabel={label}>
      <Text style={s.label} importantForAccessibility="no">{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map((o) => {
          const on = chosen.includes(o.key);
          const off = !!(disabled || readOnly || o.disabled);
          return (
            <Press key={o.key} testID={`${testID}-option-${o.key}`} accessibilityRole={single ? 'radio' : 'checkbox'} accessibilityLabel={o.label}
                       accessibilityState={{ checked: on, disabled: off }} disabled={off} onPress={() => flip(o.key)}
                       style={[{ minHeight: t.minTouch - 4, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999,
                         borderWidth: 1, borderColor: on ? t.color.primary : t.color.borderStrong, backgroundColor: on ? t.color.primarySoft : t.color.surface,
                         opacity: off ? 0.5 : 1 }, part(t, 'chips', 'chip', { on })]} hitSlop={4}>
              <Pop on={on}>
                <Text style={[{ fontSize: 14, fontWeight: on ? '600' : '500', color: on ? t.color.primaryText : t.color.textBody }, part(t, 'chips', 'text', { on })]}>{on ? '✓ ' : ''}{o.label}</Text>
              </Pop>
            </Press>
          );
        })}
      </View>
      {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : helpText ? <Text style={s.help}>{helpText}</Text> : null}
    </View>
  );
}

/* ---------- CodeBoxes ---------- */

export interface CodeBoxesProps extends FieldProps<string> {
  /** How many digits. */
  length?: number;
  /** Hides the digits (a PIN). */
  secure?: boolean;
  /** Called once all the digits are in. */
  onComplete?: (code: string) => void;
}

/**
 * A code typed into one box per digit. It is one input underneath (the platforms' one-time-code autofill and paste work),
 * digits only, and the value is never kept by the component.
 */
export function CodeBoxes(props: CodeBoxesProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, length = 6, secure, onComplete } = props;
  const t = useTheme();
  const s = styles(t);
  const f = useField(props, value);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const code = (value ?? '').slice(0, length);
  const change = (x: string) => {
    const digits = x.replace(/\D/g, '').slice(0, length);
    onChange?.(digits);
    if (digits.length === length) { onComplete?.(digits); }
  };
  return (
    <View testID={testID} style={s.field}>
      <Text style={s.label} importantForAccessibility="no">{label}{required ? <Text style={s.req}> *</Text> : null}</Text>
      <Shake error={f.error}>
      <Pressable accessible={false} onPress={() => input.current?.focus()} style={[{ flexDirection: 'row', gap: 8 }, part(t, 'code', 'cells')]}>
        {Array.from({ length }, (_, i) => (
          <Pop key={i} on={code[i] ?? ''} importantForAccessibility="no-hide-descendants"
                style={[{ flex: 1, maxWidth: 52, minHeight: t.minTouch + 4, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.control,
                  borderWidth: f.focused && i === code.length ? 2 : t.border, backgroundColor: disabled ? t.color.surface3 : t.color.surface,
                  borderColor: f.error ? t.color.danger : f.focused && i === code.length ? t.color.primary : t.color.borderStrong },
                  part(t, 'code', 'cell', { focused: f.focused && i === code.length })]}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: t.color.text, fontVariant: ['tabular-nums'] }}>{code[i] ? (secure ? '•' : code[i]) : ''}</Text>
          </Pop>
        ))}
        <TextInput ref={input} testID={`${testID}-input`} value={code} onChangeText={change} maxLength={length} keyboardType="number-pad"
                   autoComplete={secure ? 'off' : 'one-time-code'} textContentType={secure ? 'none' : 'oneTimeCode'} secureTextEntry={secure}
                   editable={!readOnly && !disabled} accessibilityLabel={`${label}, ${length} digits`} accessibilityHint={f.error || helpText}
                   aria-required={required} aria-invalid={!!f.error} onFocus={f.onFocus} onBlur={f.onBlur} caretHidden
                   style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent' }} />
      </Pressable>
      </Shake>
      {f.error
        ? <Text testID={`${testID}-error`} style={s.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{f.error}</Text>
        : helpText ? <Text style={s.help}>{helpText}</Text> : null}
    </View>
  );
}

/* ---------- SliderControl ---------- */

export interface SliderControlProps extends FieldProps<number> {
  min?: number;
  /** 100 unless set. */
  max?: number;
  step?: number;
  /** Shown before the value and the scale ("USD"). */
  prefix?: string;
  /** Digits after the point; 0 unless set. */
  decimals?: number;
  /** How the value is read and shown; overrides prefix and decimals. */
  format?: (n: number) => string;
  /** A line under the value (what it means: "You could borrow 120,000.00"). */
  note?: string;
}

/**
 * A value on a scale (React Native has no slider of its own): drag the thumb or tap the track, and screen readers
 * swipe up and down to step it (the adjustable role).
 */
export function SliderControl(props: SliderControlProps) {
  const { testID, label, value, onChange, readOnly, disabled, helpText, error, min = 0, max = 100, step = 1, prefix, decimals = 0, format, note } = props;
  const t = useTheme();
  const s = styles(t);
  const width = useRef(1);
  const show = format ?? ((n: number) => {
    const [whole, part] = n.toFixed(decimals).split('.');
    return `${prefix ? `${prefix} ` : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${part ? `.${part}` : ''}`;
  });
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round((n - min) / step) * step + min));
  const current = clamp(value ?? min);
  const off = !!(disabled || readOnly);
  const latest = useRef({ onChange, current });
  latest.current = { onChange, current };
  const at = (x: number) => {
    const n = clamp(min + (Math.max(0, Math.min(x, width.current)) / width.current) * (max - min));
    if (n !== latest.current.current) { latest.current.onChange?.(n); }
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => at(e.nativeEvent.locationX),
    onPanResponderMove: (e) => at(e.nativeEvent.locationX),
  })).current;
  const share = max > min ? (current - min) / (max - min) : 0;
  return (
    <View testID={testID} style={s.field}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={s.label} importantForAccessibility="no">{label}</Text>
        <Text testID={`${testID}-value`} style={{ fontSize: 18, fontWeight: '700', color: t.color.text, fontVariant: ['tabular-nums'] }}
              importantForAccessibility="no">{show(current)}</Text>
      </View>
      <View testID={`${testID}-input`} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityHint={error || helpText}
            accessibilityValue={{ min, max, now: current, text: show(current) }} accessibilityState={{ disabled: off }}
            aria-valuemin={min} aria-valuemax={max} aria-valuenow={current} aria-valuetext={show(current)}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => { if (!off) { onChange?.(clamp(current + (e.nativeEvent.actionName === 'increment' ? step : -step))); } }}
            onLayout={(e) => { width.current = Math.max(1, e.nativeEvent.layout.width); }}
            {...(off ? {} : pan.panHandlers)} style={{ height: t.minTouch, justifyContent: 'center', opacity: off ? 0.5 : 1 }}>
        <Shake error={error}>
        <View style={[{ height: 6, borderRadius: 3, backgroundColor: t.color.surface3 }, part(t, SLIDERS, 'track')]}>
          <View style={[{ width: `${share * 100}%`, height: 6, borderRadius: 3, backgroundColor: t.color.primary }, part(t, SLIDERS, 'fill')]} />
        </View>
        {/* stepped: a tick at each step, up to 20 */}
        {variantOf(t, SLIDERS) === 'ticks' && (max - min) / step <= 20
          ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -1, flexDirection: 'row', justifyContent: 'space-between' }}>
            {Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => <View key={i} style={{ width: 2, height: 8, borderRadius: 1, backgroundColor: t.color.borderStrong }} />)}
          </View> : null}
        <View pointerEvents="none" style={[{ position: 'absolute', top: -9, left: `${share * 100}%`, marginLeft: -12, width: 24, height: 24, borderRadius: 12,
          backgroundColor: t.color.surface, borderWidth: 2, borderColor: t.color.primary }, part(t, SLIDERS, 'thumb')]} />
        {/* the value rides above the thumb */}
        {variantOf(t, SLIDERS) === 'bubble'
          ? <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', bottom: 16, left: `${share * 100}%`, transform: [{ translateX: '-50%' }],
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: t.color.primary }}>
            <Text style={{ color: t.color.onPrimary, fontSize: 12, fontWeight: '700' }}>{show(current)}</Text>
          </View> : null}
        </Shake>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} importantForAccessibility="no-hide-descendants">
        <Text style={s.help}>{show(min)}</Text>
        <Text style={s.help}>{show(max)}</Text>
      </View>
      {note ? <Text testID={`${testID}-note`} style={{ fontSize: 14, color: t.color.textBody, marginTop: 4 }} accessibilityLiveRegion="polite">{note}</Text> : null}
      {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : helpText ? <Text style={s.help}>{helpText}</Text> : null}
    </View>
  );
}

/* ---------- InfoCard ---------- */

export interface InfoCardProps {
  testID: string;
  title: string;
  body?: string;
  /** A tag on the card: "New", "Offer". */
  badge?: string;
  /** A link at the foot: "Apply now". */
  actionLabel?: string;
  onAction?: () => void;
}

/** A card with a title, a line, a tag and one link (a product, an offer, the relationship manager). */
export function InfoCard({ testID, title, body, badge, actionLabel, onAction }: InfoCardProps) {
  const t = useTheme();
  const c = toneColors(t, 'info');
  return (
    <Enter testID={testID} style={panel(t)}>
      {badge ? <Text style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', color: c.fg, backgroundColor: c.bg, paddingHorizontal: 8,
        paddingVertical: 3, borderRadius: 999 }}>{badge}</Text> : null}
      <Heading t={t}>{title}</Heading>
      {body ? <Text style={{ fontSize: 14, color: t.color.textBody }}>{body}</Text> : null}
      {actionLabel ? (
        <Touch testID={`${testID}-action`} label={`${actionLabel}, ${title}`} role="link" onPress={onAction}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.color.primaryText }}>{actionLabel} →</Text>
        </Touch>
      ) : null}
    </Enter>
  );
}

/** A bar or meter that grows to its share (0 to 1). */
function Grow({ testID, share, vertical, style }: { testID?: string; share: number; vertical?: boolean; style: object }) {
  const size = useGrow(share);
  return <Animated.View testID={testID} style={[style, vertical ? { height: size } : { width: size }]} />;
}
