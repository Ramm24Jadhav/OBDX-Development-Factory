import { ChangeDetectionStrategy, Component, computed, forwardRef, input } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldBase, FieldShell } from './field';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function display(iso: string, locale?: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A date as yyyy-mm-dd (oj-input-date), the browser's date picker, with min, max and blocked days checked. */
@Component({
  selector: 'bx-date',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldShell],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePicker), multi: true }],
  template: `
    <bx-field-shell [field]="this">
      <input type="date" class="bx-input" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [value]="value() ?? ''"
             [attr.min]="min() || null" [attr.max]="max() || null" [disabled]="isDisabled()" [readOnly]="readOnly()"
             [attr.aria-required]="required() || null" [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
             (focus)="focus()" (blur)="blur()" (change)="pick($any($event.target).value)" (input)="pick($any($event.target).value)" />
      @if (shown()) { <span class="bx-counter" aria-hidden="true">{{ shown() }}</span> }
    </bx-field-shell>
  `,
})
export class DatePicker extends FieldBase<string> {
  /** Earliest and latest dates, as yyyy-mm-dd. */
  readonly min = input('');
  readonly max = input('');
  /** Days that cannot be chosen (bank holidays): a list of yyyy-mm-dd or a test. */
  readonly disabledDays = input<ReadonlyArray<string> | ((iso: string) => boolean)>([]);
  readonly locale = input<string>();
  protected readonly shown = computed(() => { const v = this.value(); return v && ISO.test(v) ? display(v, this.locale()) : ''; });

  protected pick(iso: string): void {
    this.own.set(this.check(iso));
    this.change(iso);
  }

  private check(iso: string): string {
    if (!iso) { return ''; }
    if (!ISO.test(iso)) { return 'Enter a date as dd/mm/yyyy.'; }
    if (this.min() && iso < this.min()) { return `Choose ${display(this.min(), this.locale())} or later.`; }
    if (this.max() && iso > this.max()) { return `Choose ${display(this.max(), this.locale())} or earlier.`; }
    const days = this.disabledDays();
    const blocked = typeof days === 'function' ? days(iso) : days.includes(iso);
    return blocked ? 'That day is not available. Choose another day.' : '';
  }
}
