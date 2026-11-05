import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** A card: a heading, the content (default slot) and actions ([actions]). With interactive, the whole card is a button. */
@Component({
  selector: 'bx-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="css()" [attr.data-testid]="testID() || null" [attr.role]="interactive() ? 'button' : null" [attr.tabindex]="interactive() ? 0 : null"
         [attr.aria-pressed]="interactive() && selected() !== undefined ? selected() : null"
         (click)="press()" (keydown.enter)="key($event)" (keydown.space)="key($event)">
      @if (heading()) {
        <div class="bx-card-head">
          <h3 class="bx-card-title">{{ heading() }}</h3>
          @if (subheading()) { <span class="bx-card-sub">{{ subheading() }}</span> }
        </div>
      }
      <div class="bx-card-body"><ng-content /></div>
      <div class="bx-card-actions"><ng-content select="[actions]" /></div>
    </div>
  `,
})
export class Card {
  readonly heading = input('');
  readonly subheading = input('');
  /** Makes the whole card a button (an account to open). Do not put other buttons in it then. */
  readonly interactive = input(false);
  readonly selected = input<boolean | undefined>(undefined);
  readonly testID = input('');
  readonly action = output<void>();
  protected readonly css = computed(() => 'bx-card' + (this.interactive() ? ' is-interactive' : '') + (this.selected() ? ' is-selected' : ''));

  protected press(): void { if (this.interactive()) { this.action.emit(); } }

  protected key(event: Event): void {
    if (!this.interactive()) { return; }
    event.preventDefault();
    this.action.emit();
  }
}
