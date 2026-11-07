import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';

import { IconButton } from './Button';
import { Enter } from './motion';
import { Theme, useTheme } from './theme';
import { Touch } from './parts';
import { ToastVariant, toastLook } from './variants';

export type Severity = 'error' | 'warning' | 'confirmation' | 'info';

export interface Message {
  id: string;
  severity?: Severity;
  summary: string;
  detail?: string;
  /** Milliseconds before it closes by itself; 0 keeps it. Errors stay until closed unless set. */
  autoTimeout?: number;
}

export interface ToastProps {
  messages: ReadonlyArray<Message>;
  onClose: (message: Message) => void;
  testID?: string;
  /** The style: default, snackbar, stacked or pill. */
  variant?: ToastVariant;
}

const ICON: Record<Severity, string> = { error: '!', warning: '!', confirmation: '✓', info: 'i' };
const tone = (t: Theme, s: Severity) => (s === 'error' ? t.color.danger : s === 'warning' ? t.color.warning : s === 'confirmation' ? t.color.success : t.color.info);

/**
 * Messages (oj-messages): each new one is announced (errors first and assertively); errors stay until closed, others
 * close after five seconds. The screen owns the list; onClose says which one to remove.
 */
export function Toast({ messages, onClose, testID, variant = 'default' }: ToastProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const said = useRef(new Set<string>());
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const live = new Set(messages.map((m) => m.id));
    messages.forEach((m) => {
      const severity = m.severity ?? 'info';
      if (!said.current.has(m.id)) {
        said.current.add(m.id);
        AccessibilityInfo.announceForAccessibility(`${m.summary}${m.detail ? `. ${m.detail}` : ''}`);
      }
      const timeout = m.autoTimeout ?? (severity === 'error' ? 0 : 5000);
      if (timeout > 0 && !timers.current.has(m.id)) {
        timers.current.set(m.id, setTimeout(() => { timers.current.delete(m.id); close.current(m); }, timeout));
      }
    });
    timers.current.forEach((x, id) => { if (!live.has(id)) { clearTimeout(x); timers.current.delete(id); } });
  }, [messages]);
  useEffect(() => () => { timers.current.forEach((x) => clearTimeout(x)); timers.current.clear(); }, []);
  return (
    <Pressable testID={testID} style={{ gap: variant === 'stacked' ? 6 : 10 }} accessible={false} onPress={variant === 'stacked' ? () => setOpen(!open) : undefined}>
      {messages.map((m, i) => {
        const severity = m.severity ?? 'info';
        const look = toastLook(t, variant, tone(t, severity));
        return (
          <Enter key={m.id} effect="slide-down" testID={`toast-${m.id}`}
                style={{ flexDirection: 'row', alignItems: variant === 'pill' ? 'center' : 'flex-start', gap: 12, padding: 12, ...look.box,
                  // the stack: older messages sit a little narrower behind the newest
                  // the stack: older messages tuck behind the newest until the stack is tapped open
                  ...(variant === 'stacked' && i > 0 && !open ? { marginTop: -52, marginHorizontal: Math.min(i, 2) * 8, opacity: 0.9 } : {}), zIndex: messages.length - i }}>
            <View importantForAccessibility="no-hide-descendants"
                  style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tone(t, severity), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{ICON[severity]}</Text>
            </View>
            {/* The message is one stop for a screen reader; the close button stays its own */}
            <View style={{ flex: 1, gap: 2 }} accessible accessibilityRole={severity === 'error' ? 'alert' : undefined}
                  accessibilityLiveRegion={severity === 'error' ? 'assertive' : 'polite'}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: look.fg }}>{m.summary}</Text>
              {m.detail ? <Text style={{ fontSize: 14, color: look.body }}>{m.detail}</Text> : null}
            </View>
            {variant === 'snackbar'
              ? <Touch label="Close the message" onPress={() => onClose(m)} style={{ width: t.minTouch, alignItems: 'center' }}><Text style={{ fontSize: 18, color: look.fg }}>×</Text></Touch>
              : <IconButton label="Close the message" icon="close" onAction={() => onClose(m)} />}
          </Enter>
        );
      })}
    </Pressable>
  );
}
