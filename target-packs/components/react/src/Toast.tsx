import { useEffect, useRef } from 'react';

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
  /** 'notification' floats at the top right; 'general' sits in the page. */
  display?: 'notification' | 'general';
  testID?: string;
}

const ICON: Record<Severity, string> = { error: '!', warning: '!', confirmation: '✓', info: 'i' };

/**
 * Messages (oj-messages): errors are announced at once and stay until closed; others are announced politely and close
 * after five seconds. The screen owns the list; onClose says which one to remove.
 */
export function Toast({ messages, onClose, display = 'notification', testID }: ToastProps) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const live = new Set(messages.map((m) => m.id));
    messages.forEach((m) => {
      const severity = m.severity ?? 'info';
      const timeout = m.autoTimeout ?? (severity === 'error' ? 0 : 5000);
      if (timeout > 0 && !timers.current.has(m.id)) {
        timers.current.set(m.id, setTimeout(() => { timers.current.delete(m.id); close.current(m); }, timeout));
      }
    });
    timers.current.forEach((t, id) => { if (!live.has(id)) { clearTimeout(t); timers.current.delete(id); } });
  }, [messages]);
  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); timers.current.clear(); }, []);
  return (
    <div className={`bx-toasts is-${display}`} data-testid={testID}>
      {messages.map((m) => {
        const severity = m.severity ?? 'info';
        return (
          <div key={m.id} className={`bx-toast is-${severity}`} role={severity === 'error' ? 'alert' : 'status'}>
            <span className="bx-toast-icon" aria-hidden="true">{ICON[severity]}</span>
            <span className="bx-toast-text"><strong>{m.summary}</strong>{m.detail ? <span>{m.detail}</span> : null}</span>
            <button type="button" className="bx-btn bx-btn--borderless bx-btn--icon bx-btn--sm" aria-label="Close the message" onClick={() => onClose(m)}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
