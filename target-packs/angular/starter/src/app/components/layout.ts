import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/*
 * The starter's own parts around the premium components: the frame of a screen, a titled group of fields, and
 * a value to show and not edit (the text area and switch are the pack's bx-text-area and bx-switch now). Same skin.
 */

/** The frame of a screen, with its title and, at the bottom, its actions (put them in an element with "actions"). */
@Component({
  selector: 'obdx-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="obdx-screen">
      <h1 class="obdx-title">{{ title() }}</h1>
      <ng-content />
      <div class="obdx-actions"><ng-content select="[actions]" /></div>
    </main>
  `,
  styles: `
    .obdx-screen { max-width: 960px; margin: 0 auto; padding: 24px 16px 40px; box-sizing: border-box; }
    .obdx-title { margin: 0 0 16px; font-size: 22px; font-weight: 700; color: var(--bx-text); }
    .obdx-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; margin-top: 8px; }
  `,
})
export class Screen {
  readonly title = input.required<string>();
}

/** A titled group of fields, in up to three columns on wide screens. */
@Component({
  selector: 'obdx-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="obdx-section">
      @if (title()) { <h2 class="obdx-section-title">{{ title() }}</h2> }
      <div [class]="grid()"><ng-content /></div>
    </section>
  `,
  styles: `
    .obdx-section { margin-bottom: 16px; padding: 16px; border-radius: var(--bx-radius-lg); background: var(--bx-surface); border: 1px solid var(--bx-border); }
    .obdx-section-title { margin: 0 0 12px; font-size: 15px; font-weight: 700; color: var(--bx-text); }
    .obdx-grid { display: grid; gap: 0 16px; grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 768px) { .obdx-columns-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .obdx-columns-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `,
})
export class Section {
  readonly title = input('');
  readonly columns = input(1);
  protected readonly grid = computed(() => `obdx-grid obdx-columns-${Math.min(Math.max(this.columns(), 1), 3)}`);
}

/** A value to show, not to edit. */
@Component({
  selector: 'obdx-read-only',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bx-field" [attr.data-testid]="testID() || null">
      <span class="bx-label">{{ label() }}</span>
      <span class="bx-control" style="padding:0 14px" [attr.data-testid]="testID() ? testID() + '-value' : null">{{ value() || '-' }}</span>
      @if (helpText()) { <span class="bx-help">{{ helpText() }}</span> }
    </div>
  `,
})
export class ReadOnlyField {
  readonly testID = input('');
  readonly label = input.required<string>();
  readonly value = input<string | null | undefined>('');
  readonly helpText = input('');
}
