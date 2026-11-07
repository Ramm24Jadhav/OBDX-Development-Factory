import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldBase, FieldShell } from './field';
import { VARIANT } from './variant';

/** One line of text (oj-input-text). */
@Component({
  selector: 'bx-text-field', hostDirectives: VARIANT,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldShell],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TextField), multi: true }],
  template: `
    <bx-field-shell [field]="this">
      <input class="bx-input" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [value]="value() ?? ''"
             [attr.placeholder]="placeholder() || null" [disabled]="isDisabled()" [readOnly]="readOnly()" [attr.maxlength]="maxLength() ?? null"
             [attr.inputmode]="inputMode() || null" [attr.autocomplete]="autoComplete()" [attr.aria-required]="required() || null"
             [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
             (focus)="focus()" (blur)="blur()" (input)="change($any($event.target).value)" />
      @if (clearable() && value() && !readOnly() && !isDisabled()) {
        <button type="button" class="bx-clear" [attr.aria-label]="'Clear ' + label()" (click)="change('')"><span aria-hidden="true">×</span></button>
      }
      @if (maxLength()) {
        <span class="bx-counter" aria-hidden="true">{{ (value() ?? '').length }}/{{ maxLength() }}</span>
      }
    </bx-field-shell>
  `,
})
export class TextField extends FieldBase<string> {
  readonly maxLength = input<number>();
  readonly clearable = input(false);
  readonly inputMode = input<'text' | 'numeric' | 'decimal' | 'email' | 'tel' | ''>('');
  readonly autoComplete = input('off');
}

/** Decimals a currency uses (ISO 4217); two unless listed. */
export function decimalsOf(currency?: string): number {
  if (!currency) { return 2; }
  if (['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF'].includes(currency)) { return 0; }
  if (['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD'].includes(currency)) { return 3; }
  return 2;
}

export function formatAmount(value: number | null | undefined, currency?: string, locale?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) { return ''; }
  const d = decimalsOf(currency);
  return value.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** A money amount (oj-input-number with a currency): a number, formatted with the currency's decimals when the customer leaves. */
@Component({
  selector: 'bx-amount', hostDirectives: VARIANT,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldShell],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AmountInput), multi: true }],
  template: `
    <bx-field-shell [field]="this">
      @if (currency()) { <span class="bx-affix" aria-hidden="true">{{ currency() }}</span> }
      <input class="bx-input bx-num" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" inputmode="decimal" autocomplete="off"
             [value]="shown()" [attr.placeholder]="placeholder() || null" [disabled]="isDisabled()" [readOnly]="readOnly()"
             [attr.aria-required]="required() || null" [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
             [attr.aria-label]="currency() ? label() + ' in ' + currency() : null"
             (focus)="focus()" (blur)="blur(); commit()" (keydown.enter)="commit()" (input)="typed.set($any($event.target).value)" />
    </bx-field-shell>
  `,
})
export class AmountInput extends FieldBase<number | null> {
  readonly currency = input('');
  readonly min = input<number>();
  readonly max = input<number>();
  readonly locale = input<string>();
  protected readonly typed = signal<string | null>(null);
  protected readonly shown = computed(() => this.typed() ?? formatAmount(this.value(), this.currency(), this.locale()));

  protected commit(): void {
    const t = this.typed();
    if (t === null) { return; }
    const text = t.trim();
    this.typed.set(null);
    if (text === '') { this.own.set(''); this.change(null); return; }
    const n = Number(text.replace(/[^0-9.-]/g, ''));
    const c = this.currency();
    if (!Number.isFinite(n) || !/[0-9]/.test(text)) { this.own.set(`Enter an amount, for example ${formatAmount(1250, c, this.locale())}.`); return; }
    const d = decimalsOf(c);
    const rounded = Math.round(n * 10 ** d) / 10 ** d;
    const min = this.min();
    const max = this.max();
    this.own.set(min !== undefined && rounded < min ? `Enter at least ${formatAmount(min, c, this.locale())}.`
      : max !== undefined && rounded > max ? `Enter at most ${formatAmount(max, c, this.locale())}.` : '');
    this.change(rounded);
  }
}
