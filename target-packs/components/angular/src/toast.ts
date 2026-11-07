import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, untracked } from '@angular/core';

import { ToastVariant, vx } from './variants';

export type Severity = 'error' | 'warning' | 'confirmation' | 'info';

export interface Message {
  id: string;
  severity?: Severity;
  summary: string;
  detail?: string;
  /** Milliseconds before it closes by itself; 0 keeps it. Errors stay until closed unless set. */
  autoTimeout?: number;
}

const ICON: Record<Severity, string> = { error: '!', warning: '!', confirmation: '✓', info: 'i' };

/**
 * Messages (oj-messages): errors are announced at once and stay until closed; others are announced politely and close
 * after five seconds. The screen owns the list; (closed) says which one to remove.
 */
@Component({
  selector: 'bx-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="'bx-toasts is-' + display() + ' ' + vx('toast', variant())" [attr.data-testid]="testID() || null">
      @for (m of messages(); track m.id) {
        <div [class]="'bx-toast is-' + (m.severity || 'info')" [attr.role]="m.severity === 'error' ? 'alert' : 'status'">
          <span class="bx-toast-icon" aria-hidden="true">{{ icon(m) }}</span>
          <span class="bx-toast-text"><strong>{{ m.summary }}</strong>@if (m.detail) {<span>{{ m.detail }}</span>}</span>
          <button type="button" class="bx-btn bx-btn--borderless bx-btn--icon bx-btn--sm" aria-label="Close the message" (click)="closed.emit(m)">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      }
    </div>
  `,
})
export class Toast {
  readonly messages = input<ReadonlyArray<Message>>([]);
  readonly display = input<'notification' | 'general'>('notification');
  /** The style: standard, snackbar, stacked or pill. */
  readonly variant = input<ToastVariant>('standard');
  protected readonly vx = vx;
  readonly testID = input('');
  readonly closed = output<Message>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    effect(() => {
      const list = this.messages();
      untracked(() => {
        const live = new Set(list.map((m) => m.id));
        list.forEach((m) => {
          const timeout = m.autoTimeout ?? ((m.severity ?? 'info') === 'error' ? 0 : 5000);
          if (timeout > 0 && !this.timers.has(m.id)) {
            this.timers.set(m.id, setTimeout(() => { this.timers.delete(m.id); this.closed.emit(m); }, timeout));
          }
        });
        this.timers.forEach((t, id) => { if (!live.has(id)) { clearTimeout(t); this.timers.delete(id); } });
      });
    });
    inject(DestroyRef).onDestroy(() => { this.timers.forEach((t) => clearTimeout(t)); this.timers.clear(); });
  }

  protected icon(m: Message): string { return ICON[m.severity ?? 'info']; }
}
