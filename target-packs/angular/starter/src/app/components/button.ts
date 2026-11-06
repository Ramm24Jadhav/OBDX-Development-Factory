import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type Chroming = 'callToAction' | 'solid' | 'outlined' | 'borderless' | 'danger';

/** Sets where the ripple starts (the motion class decides whether it shows). */
function ripple(event: MouseEvent): void {
  const b = event.currentTarget as HTMLElement | null;
  if (!b) { return; }
  const r = b.getBoundingClientRect();
  b.style.setProperty('--bx-x', `${event.clientX - r.left}px`);
  b.style.setProperty('--bx-y', `${event.clientY - r.top}px`);
}

/** A button (oj-button): callToAction is the screen's main action. Icons go in the startIcon and endIcon slots. */
@Component({
  selector: 'bx-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: inline-block' },
  template: `
    <button [type]="type()" [class]="css()" [attr.data-testid]="testID() || null" [disabled]="disabled() || busy()" [attr.aria-busy]="busy() || null"
            (click)="press($event)">
      <ng-content select="[startIcon]" /><span class="bx-btn-label">{{ label() }}</span><ng-content select="[endIcon]" />
    </button>
  `,
})
export class Button {
  readonly label = input.required<string>();
  readonly chroming = input<Chroming>('callToAction');
  readonly size = input<'' | 'sm'>('');
  readonly disabled = input(false);
  /** Shows the button busy and stops a second press (a payment must not go twice). */
  readonly busy = input(false);
  readonly type = input<'button' | 'submit'>('button');
  readonly testID = input('');
  readonly action = output<MouseEvent>();
  protected readonly css = computed(() => `bx-btn bx-btn--${this.chroming()}` + (this.size() ? ` bx-btn--${this.size()}` : ''));

  protected press(event: MouseEvent): void {
    ripple(event);
    this.action.emit(event);
  }
}

/** A button with only an icon (oj-button display="icons"); the label names it for screen readers and shows as the tooltip. */
@Component({
  selector: 'bx-icon-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: inline-block' },
  template: `
    <button type="button" [class]="css()" [attr.data-testid]="testID() || null" [disabled]="disabled()" [attr.aria-label]="label()" [title]="label()"
            (click)="press($event)">
      <ng-content><span [class]="'bx-icon bx-icon--' + icon()" aria-hidden="true"></span></ng-content>
    </button>
  `,
})
export class IconButton {
  readonly label = input.required<string>();
  readonly icon = input<'more' | 'close'>('more');
  readonly chroming = input<Chroming>('borderless');
  readonly size = input<'' | 'sm'>('');
  readonly disabled = input(false);
  readonly testID = input('');
  readonly action = output<MouseEvent>();
  protected readonly css = computed(() => `bx-btn bx-btn--${this.chroming()} bx-btn--icon` + (this.size() ? ` bx-btn--${this.size()}` : ''));

  protected press(event: MouseEvent): void {
    ripple(event);
    this.action.emit(event);
  }
}
