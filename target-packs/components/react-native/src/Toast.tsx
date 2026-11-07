import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';

import { IconButton } from './Button';
import { Enter } from './motion';
import { Theme, useTheme } from './theme';

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
}

const ICON: Record<Severity, string> = { error: '!', warning: '!', confirmation: '✓', info: 'i' };
const tone = (t: Theme, s: Severity) => (s === 'error' ? t.color.danger : s === 'warning' ? t.color.warning : s === 'confirmation' ? t.color.success : t.color.info);

/**
 * Messages (oj-messages): each new one is announced (errors first and assertively); errors stay until closed, others
 * close after five seconds. The screen owns the list; onClose says which one to remove.
 */
export function Toast({ messages, onClose, testID }: ToastProps) {
  const t = useTheme();
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
    <View testID={testID} style={{ gap: 10 }} pointerEvents="box-none">
      {messages.map((m) => {
        const severity = m.severity ?? 'info';
        return (
          <Enter key={m.id} effect="slide-down" testID={`toast-${m.id}`}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: t.radius.card, backgroundColor: t.raised,
                  borderWidth: t.border, borderColor: t.line, borderLeftWidth: 4, borderLeftColor: tone(t, severity), ...t.elevation(2) }}>
            <View importantForAccessibility="no-hide-descendants"
                  style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tone(t, severity), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{ICON[severity]}</Text>
            </View>
            {/* The message is one stop for a screen reader; the close button stays its own */}
            <View style={{ flex: 1, gap: 2 }} accessible accessibilityRole={severity === 'error' ? 'alert' : undefined}
                  accessibilityLiveRegion={severity === 'error' ? 'assertive' : 'polite'}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.color.text }}>{m.summary}</Text>
              {m.detail ? <Text style={{ fontSize: 14, color: t.color.textBody }}>{m.detail}</Text> : null}
            </View>
            <IconButton label="Close the message" icon="close" onAction={() => onClose(m)} />
          </Enter>
        );
      })}
    </View>
  );
}
