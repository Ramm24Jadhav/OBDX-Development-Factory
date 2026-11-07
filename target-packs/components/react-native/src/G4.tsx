/*
 * Group 4: insights, approvals and settings (the liquidity components have no React Native name and are left out).
 * Charts are plain views; approvals ask for a reason before a rejection; nothing here decides a rule of the bank.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from './Button';
import { CheckboxGroup } from './Choices';
import { Dropdown } from './Dropdown';
import { TextArea, Toggle } from './Forms';
import { formatAmount } from './TextField';
import { FieldProps, Option } from './field';
import { Banner, BannerProps, Bars, BarsProps, Chips, ChipsProps, TimelineItem, Item, ItemList, KeyValues, KeyValuesProps, ProgressList, ProgressListProps,
  Segment, SegmentProps, TimelineList } from './parts';
import { useTheme } from './theme';
import type { TimelineVariant } from './variants';

/* ---------- BarChart, ProgressBar, SavingsGoal, SpendCategories, TransactionLimits ---------- */

/** Spending by month: tap a bar for the amount. */
export function BarChart(props: BarsProps) {
  return <Bars {...props} />;
}

/** How much of each budget is used; over budget turns red and says so. */
export function ProgressBar(props: ProgressListProps) {
  return <ProgressList {...props} />;
}

export interface SavingsGoalProps {
  testID: string;
  label: string;
  saved: number;
  target: number;
  currency?: string;
  /** Add money to the goal. */
  onAdd?: () => void;
  /** The style: default, linear, ring or segmented. */
  variant?: ProgressListProps['variant'];
}

/** Progress towards a goal, with what is left to save. */
export function SavingsGoal({ testID, label, saved, target, currency, onAdd, variant }: SavingsGoalProps) {
  const t = useTheme();
  const left = Math.max(0, target - saved);
  return (
    <View testID={testID} style={{ gap: 8 }}>
      <ProgressList testID={`${testID}-bar`} items={[{ label, value: saved, max: target }]} currency={currency} measure="saved" variant={variant} />
      <Text style={{ fontSize: 13.5, color: t.color.textBody }}>
        {left ? `${formatAmount(left, currency)}${currency ? ` ${currency}` : ''} to go.` : 'Goal reached.'}
      </Text>
      {onAdd ? <Button testID={`${testID}-add`} label="Add money" chroming="outlined" onAction={onAdd} /> : null}
    </View>
  );
}

/** Re-categorise a transaction: one category at a time. */
export function SpendCategories(props: Omit<ChipsProps, 'multiple'>) {
  return <Chips {...props} multiple={false} />;
}

/** What is used of each limit today. */
export function TransactionLimits(props: ProgressListProps) {
  return <ProgressList {...props} />;
}

/* ---------- ApprovalQueue ---------- */

export interface Approval extends Item {
  /** Prioritized items come first and say so. */
  priority?: boolean;
}

export interface ApprovalQueueProps {
  testID: string;
  label?: string;
  items: ReadonlyArray<Approval>;
  onApprove: (item: Approval) => void;
  onReject?: (item: Approval) => void;
  /** Opens one for its details. */
  onSelect?: (item: Approval) => void;
}

/** Items waiting for this approver, prioritized ones first, each with Approve and Reject. */
export function ApprovalQueue({ testID, label = 'Pending for approval', items, onApprove, onReject, onSelect }: ApprovalQueueProps) {
  const sorted = [...items].sort((a, b) => Number(!!b.priority) - Number(!!a.priority))
    .map((x) => ({ ...x, title: x.priority ? `${x.title} · prioritized` : x.title }));
  const find = (i: Item) => items.find((x) => x.id === i.id)!;
  return <ItemList testID={testID} heading={`${label}, ${items.length}`} items={sorted} actionLabel="Approve" onAction={(i) => onApprove(find(i))}
                   secondaryLabel={onReject ? 'Reject' : undefined} onSecondary={(i) => onReject?.(find(i))}
                   onSelect={onSelect ? (i) => onSelect(find(i)) : undefined} emptyText="Nothing is waiting for you." />;
}

/* ---------- ApprovalDetail ---------- */

export interface ApprovalDetailProps extends Omit<KeyValuesProps, 'actionLabel' | 'onAction' | 'children'> {
  onApprove: () => void;
  /** Called with the reason; a rejection always has one. */
  onReject: (reason: string) => void;
  /** Sends it back to the maker with the reason. */
  onSendBack?: (reason: string) => void;
}

/** Everything the approver needs, then one decision; Reject and Send back ask for the reason first. */
export function ApprovalDetail({ testID, onApprove, onReject, onSendBack, busy, ...props }: ApprovalDetailProps) {
  const [mode, setMode] = useState<'decide' | 'reject' | 'back'>('decide');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const send = () => {
    setTried(true);
    if (!reason.trim()) { return; }
    (mode === 'reject' ? onReject : onSendBack!)(reason.trim());
  };
  return (
    <KeyValues {...props} testID={testID}>
      {mode === 'decide' ? (
        <View style={{ gap: 8 }}>
          <Button testID={`${testID}-approve`} label="Approve" busy={busy} onAction={onApprove} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button testID={`${testID}-reject`} label="Reject" chroming="danger" disabled={busy} onAction={() => setMode('reject')} /></View>
            {onSendBack ? <View style={{ flex: 1 }}><Button testID={`${testID}-back`} label="Send back" chroming="outlined" disabled={busy}
                                                              onAction={() => setMode('back')} /></View> : null}
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <TextArea testID={`${testID}-reason`} label={mode === 'reject' ? 'Why are you rejecting it?' : 'What should the maker change?'} value={reason}
                    onChange={setReason} required maxLength={300} error={tried && !reason.trim() ? 'Give a reason; the maker sees it.' : undefined} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="Cancel" chroming="outlined" onAction={() => { setMode('decide'); setTried(false); }} /></View>
            <View style={{ flex: 1 }}><Button testID={`${testID}-send`} label={mode === 'reject' ? 'Reject' : 'Send back'} busy={busy}
                                              chroming={mode === 'reject' ? 'danger' : 'callToAction'} onAction={send} /></View>
          </View>
        </View>
      )}
    </KeyValues>
  );
}

/* ---------- ApprovalJourney and SessionSummary ---------- */

export interface JourneyProps {
  testID: string;
  label?: string;
  items: ReadonlyArray<TimelineItem>;
  /** The style: default, compact, cards or horizontal. */
  variant?: TimelineVariant;
}

/** Who approved, and who is next (the next level takes state "current"). */
export function ApprovalJourney({ label = 'Approval journey', ...props }: JourneyProps) {
  return <TimelineList {...props} label={label} />;
}

/** Recent sign-ins, to spot one that was not the customer. */
export function SessionSummary({ label = 'Recent sign-ins', ...props }: JourneyProps) {
  return <TimelineList {...props} label={label} />;
}

/* ---------- ModificationNotice ---------- */

/** Sent back to the maker, with the reason and Modify it. */
export function ModificationNotice({ actionLabel = 'Modify it', ...props }: Omit<BannerProps, 'severity'>) {
  return <Banner {...props} severity="warning" actionLabel={actionLabel} />;
}

/* ---------- Profile ---------- */

/** Name, contact details and address, with Edit profile. Mask the mobile number before passing it. */
export function Profile({ actionLabel = 'Edit profile', ...props }: KeyValuesProps) {
  return <KeyValues {...props} actionLabel={actionLabel} />;
}

/* ---------- Settings: SignInOptions, CodeDelivery, Appearance, LanguagePicker, AlertSubscriptions, DoNotDisturb ---------- */

export interface ChoicesProps extends FieldProps<string[]> {
  options: ReadonlyArray<string | Option>;
}

/** Passkey, facial ID, soft token: the ways the customer can sign in. */
export function SignInOptions(props: ChoicesProps) {
  return <CheckboxGroup {...props} />;
}

/** Which alerts to get. */
export function AlertSubscriptions(props: ChoicesProps) {
  return <CheckboxGroup {...props} />;
}

export type SettingProps = Omit<SegmentProps, 'options'> & { options?: SegmentProps['options'] };

/** Where one-time codes are sent. */
export function CodeDelivery({ options = ['SMS', 'Email', 'App'], ...props }: SettingProps) {
  return <Segment {...props} options={options} />;
}

/** Light, dark or as the device (value light, dark or system). */
export function Appearance({ options = [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }], ...props }:
  SettingProps) {
  return <Segment {...props} options={options} />;
}

export interface LanguagePickerProps extends FieldProps<string> {
  /** Each language by its code, named in its own language. */
  languages?: ReadonlyArray<Option>;
}

/** The language of the app; each is named in its own language so a customer can always find theirs. */
export function LanguagePicker({ languages = [{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }, { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' }], ...props }: LanguagePickerProps) {
  return <Dropdown {...props} options={languages} />;
}

/** Quiet hours for notifications. */
export function DoNotDisturb(props: FieldProps<boolean>) {
  return <Toggle {...props} />;
}

/* ---------- Devices and Consents ---------- */

export interface Device extends Item {
  /** The device in the customer's hand cannot remove itself. */
  current?: boolean;
}

export interface DevicesProps {
  testID: string;
  label?: string;
  devices: ReadonlyArray<Device>;
  onRemove: (device: Device) => void;
}

/** Devices that can sign in, with Remove on all but this one. */
export function Devices({ testID, label = 'Registered devices', devices, onRemove }: DevicesProps) {
  const items = devices.map((d) => ({ ...d, title: d.current ? `${d.title} · this device` : d.title }));
  return <ItemList testID={testID} heading={label} items={items} actionLabel="Remove" showAction={(i) => !devices.find((d) => d.id === i.id)?.current}
                   onAction={(i) => onRemove(devices.find((d) => d.id === i.id)!)} />;
}

export interface ConsentsProps {
  testID: string;
  label?: string;
  consents: ReadonlyArray<Item>;
  onRevoke: (consent: Item) => void;
}

/** Apps that can read the accounts, with Revoke. */
export function Consents({ testID, label = 'Access and consent', consents, onRevoke }: ConsentsProps) {
  return <ItemList testID={testID} heading={label} items={consents} actionLabel="Revoke" onAction={onRevoke} emptyText="No app can read your accounts." />;
}
