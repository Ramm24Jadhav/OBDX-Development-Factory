import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, model, untracked } from '@angular/core';
import { DialogVariant } from './variants-v2';

import { nextId } from './field';

/**
 * A modal dialog (oj-dialog): the CDK focus trap moves focus in, keeps it inside and gives it back to what had it
 * before; Escape and the backdrop close it unless cancelBehavior is 'none'. Content goes in the default slot, buttons
 * in [footer].
 */
@Component({
  selector: 'bx-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule],
  template: `
    @if (open()) {
      <div class="bx-dialog-backdrop" (click)="cancel()"></div>
      <div [class]="'bx-dialog' + vcls()" [attr.role]="variant() === 'alert' ? 'alertdialog' : 'dialog'" aria-modal="true" tabindex="-1" [attr.aria-labelledby]="id + '-title'"
           [attr.aria-describedby]="description() ? id + '-desc' : null" [attr.data-testid]="testID() || null"
           cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (keydown.escape)="cancel()">
        <div class="bx-dialog-header">
          <h2 class="bx-dialog-title" [id]="id + '-title'">{{ dialogTitle() }}</h2>
          @if (cancelBehavior() === 'icon') {
            <button type="button" class="bx-btn bx-btn--borderless bx-btn--icon" aria-label="Close" (click)="cancel()"><span aria-hidden="true">×</span></button>
          }
        </div>
        <div class="bx-dialog-body">
          @if (description()) { <p class="bx-help" [id]="id + '-desc'">{{ description() }}</p> }
          <ng-content />
        </div>
        <div class="bx-dialog-footer"><ng-content select="[footer]" /></div>
      </div>
    }
  `,
})
export class Dialog {
  /** Two-way: [(open)]. */
  readonly open = model(false);
  readonly dialogTitle = input.required<string>();
  readonly description = input('');
  /** 'none' keeps it open on Escape and backdrop clicks and hides the close button (a step that must be answered). */
  readonly cancelBehavior = input<'icon' | 'escape' | 'none'>('icon');
  readonly testID = input('');
  /** The style variant (variants/v2.json); the component's own look when left out. */
  readonly variant = input<'' | DialogVariant>('');
  protected readonly vcls = computed(() => (this.variant() && this.variant() !== 'default' ? ` bx-v-${this.variant()}` : ''));
  readonly id = nextId('bx-dialog');
  private opener: HTMLElement | null = null;
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    // The CDK trap gives focus back only when it captured it; remember who had it, and give it back on close
    effect(() => {
      const open = this.open();
      untracked(() => {
        if (open) {
          this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          // When the trap finds nothing it can focus, the dialog itself takes focus, so a screen reader starts inside it
          setTimeout(() => {
            const box = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('.bx-dialog');
            if (box && !box.contains(document.activeElement)) { box.focus(); }
          }, 0);
        } else if (this.opener) {
          const back = this.opener;
          this.opener = null;
          queueMicrotask(() => { if (back.isConnected) { back.focus(); } });
        }
      });
    });
  }

  cancel(): void {
    if (this.cancelBehavior() !== 'none') { this.open.set(false); }
  }
}
