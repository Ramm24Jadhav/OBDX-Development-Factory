/*
 * The forms wave: TextArea, PasswordField, NumberInput, CurrencySelector, MultiSelect, Toggle, DateRangePicker,
 * SearchField, Autocomplete and FileUpload. The same inputs as the foundation fields (testID, label, [(value)], required,
 * readOnly, disabled, helpText, placeholder, error), a ControlValueAccessor each, and the markup of the JET and React packs.
 */
import { ChangeDetectionStrategy, Component, computed, forwardRef, input, output, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldBase, FieldMessage, FieldShell, Option, isEmpty, nextId, toOptions } from './field';
import { play } from './motion';

/* ---------- TextArea (oj-text-area) ---------- */

/** Several lines of text, with a counter when there is a limit. */
@Component({
  selector: 'bx-text-area',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldShell],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TextArea), multi: true }],
  template: `
    <bx-field-shell [field]="this" [multiline]="true">
      <textarea class="bx-input bx-textarea" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [value]="value() ?? ''" [rows]="rows()"
                [attr.placeholder]="placeholder() || null" [disabled]="isDisabled()" [readOnly]="readOnly()" [attr.maxlength]="maxLength() ?? null"
                [attr.aria-required]="required() || null" [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
                (focus)="focus()" (blur)="blur()" (input)="change($any($event.target).value)"></textarea>
      @if (maxLength()) {
        <span class="bx-counter" aria-hidden="true">{{ (value() ?? '').length }}/{{ maxLength() }}</span>
      }
    </bx-field-shell>
  `,
})
export class TextArea extends FieldBase<string> {
  readonly maxLength = input<number>();
  readonly rows = input(3);
}

/* ---------- PasswordField (oj-input-password) ---------- */

/** A secret: masked, never filled from the browser's history, with Show and Hide. */
@Component({
  selector: 'bx-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldShell],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PasswordField), multi: true }],
  template: `
    <bx-field-shell [field]="this">
      <input class="bx-input" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [type]="shown() ? 'text' : 'password'"
             [value]="value() ?? ''" [attr.placeholder]="placeholder() || null" [disabled]="isDisabled()" [readOnly]="readOnly()"
             [attr.autocomplete]="autoComplete()" spellcheck="false" autocapitalize="off" [attr.aria-required]="required() || null"
             [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
             (focus)="focus()" (blur)="blur()" (input)="change($any($event.target).value)" />
      @if (revealable() && !isDisabled()) {
        <button type="button" class="bx-reveal" [attr.aria-pressed]="shown()" [attr.aria-label]="(shown() ? 'Hide ' : 'Show ') + label()"
                (click)="shown.set(!shown())">{{ shown() ? 'Hide' : 'Show' }}</button>
      }
    </bx-field-shell>
  `,
})
export class PasswordField extends FieldBase<string> {
  /** current-password to sign in, new-password to set one (password managers read it). */
  readonly autoComplete = input<'current-password' | 'new-password' | 'one-time-code'>('current-password');
  readonly revealable = input(true);
  protected readonly shown = signal(false);
}

/* ---------- NumberInput (oj-input-number) ---------- */

/** A number, with - and + steppers and the arrow keys; the value is a number or null when empty. */
@Component({
  selector: 'bx-number-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldShell],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NumberInput), multi: true }],
  template: `
    <bx-field-shell [field]="this">
      @if (steppable()) {
        <button type="button" class="bx-step" [attr.aria-label]="'Decrease ' + label()" [disabled]="atMin()" (click)="nudge(-step())">−</button>
      }
      <input class="bx-input bx-num" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [attr.inputmode]="decimals() ? 'decimal' : 'numeric'"
             autocomplete="off" [value]="shownText()" [attr.placeholder]="placeholder() || null" [disabled]="isDisabled()" [readOnly]="readOnly()"
             [attr.aria-required]="required() || null" [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
             (focus)="focus()" (blur)="blur(); commit()" (keydown)="key($event)" (input)="typed.set($any($event.target).value)" />
      @if (steppable()) {
        <button type="button" class="bx-step" [attr.aria-label]="'Increase ' + label()" [disabled]="atMax()" (click)="nudge(step())">+</button>
      }
    </bx-field-shell>
  `,
})
export class NumberInput extends FieldBase<number | null> {
  readonly min = input<number>();
  readonly max = input<number>();
  readonly step = input(1);
  /** Digits after the point; 0 for whole numbers. */
  readonly decimals = input(0);
  protected readonly typed = signal<string | null>(null);
  protected readonly shownText = computed(() => { const v = this.value(); return this.typed() ?? (v === null || v === undefined ? '' : String(v)); });
  protected readonly steppable = computed(() => !this.readOnly() && !this.isDisabled());
  protected readonly atMin = computed(() => { const m = this.min(); const v = this.value(); return m !== undefined && v !== null && v !== undefined && v <= m; });
  protected readonly atMax = computed(() => { const m = this.max(); const v = this.value(); return m !== undefined && v !== null && v !== undefined && v >= m; });

  private round(n: number): number { const d = this.decimals(); return Math.round(n * 10 ** d) / 10 ** d; }

  private set(n: number | null): void {
    const min = this.min();
    const max = this.max();
    this.own.set(n !== null && min !== undefined && n < min ? `Enter ${min} or more.` : n !== null && max !== undefined && n > max ? `Enter ${max} or less.` : '');
    this.change(n);
  }

  protected commit(): void {
    const t = this.typed();
    if (t === null) { return; }
    const text = t.trim();
    this.typed.set(null);
    if (text === '') { this.set(null); return; }
    const n = Number(text);
    if (!Number.isFinite(n)) { this.own.set(this.decimals() ? 'Enter a number, for example 12.5.' : 'Enter a whole number.'); return; }
    this.set(this.round(n));
  }

  protected nudge(by: number): void {
    const min = this.min();
    const max = this.max();
    const base = this.value() ?? (min ?? 0) - by;
    const next = this.round(base + by);
    this.typed.set(null);
    this.set(min !== undefined && next < min ? min : max !== undefined && next > max ? max : next);
    play(document.getElementById(this.id), 'roll');
  }

  protected key(e: KeyboardEvent): void {
    if (e.key === 'Enter') { this.commit(); }
    if (this.steppable() && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); this.nudge(e.key === 'ArrowUp' ? this.step() : -this.step()); }
  }
}

/* ---------- CurrencySelector (oj-select-single of currencies) ---------- */

/** Common ISO 4217 currencies with their names; pass currencies for the bank's own list. */
export const CURRENCIES: ReadonlyArray<Option> = [
  { value: 'INR', label: 'Indian rupee' }, { value: 'USD', label: 'US dollar' }, { value: 'EUR', label: 'Euro' }, { value: 'GBP', label: 'Pound sterling' },
  { value: 'AED', label: 'UAE dirham' }, { value: 'SAR', label: 'Saudi riyal' }, { value: 'SGD', label: 'Singapore dollar' }, { value: 'JPY', label: 'Japanese yen' },
  { value: 'KWD', label: 'Kuwaiti dinar' }, { value: 'AUD', label: 'Australian dollar' }, { value: 'CAD', label: 'Canadian dollar' }, { value: 'CHF', label: 'Swiss franc' },
];

/** One currency, shown by its code with its name beside it. */
@Component({
  selector: 'bx-currency-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldShell],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CurrencySelector), multi: true }],
  template: `
    <bx-field-shell [field]="this">
      <select class="bx-input bx-select" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [disabled]="isDisabled() || readOnly()"
              [attr.aria-required]="required() || null" [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
              (focus)="focus()" (blur)="blur()" (change)="touched.set(true); change($any($event.target).value)">
        <option value="" [selected]="!value()">{{ placeholder() || 'Choose a currency' }}</option>
        @for (c of currencies(); track c.value) {
          <option [value]="c.value" [disabled]="!!c.disabled" [selected]="c.value === value()">{{ c.value }} · {{ c.label }}</option>
        }
      </select>
      @if (name()) { <span class="bx-currency-name" aria-hidden="true">{{ name() }}</span> }
      <span class="bx-caret" aria-hidden="true"></span>
    </bx-field-shell>
  `,
})
export class CurrencySelector extends FieldBase<string> {
  readonly currencies = input<ReadonlyArray<Option>>(CURRENCIES);
  protected readonly name = computed(() => this.currencies().find((c) => c.value === this.value())?.label ?? '');
}

/* ---------- The list under a combobox (MultiSelect, Autocomplete) ---------- */

class Listbox {
  readonly id = nextId('bx-list');
  readonly open = signal(false);
  readonly active = signal(-1);

  constructor(private readonly items: () => Option[], private readonly pick: (o: Option) => void) {}

  optionId(i: number): string { return `${this.id}-${i}`; }

  activeId(): string | null { return this.open() && this.active() >= 0 ? this.optionId(this.active()) : null; }

  private enabled(): number[] { return this.items().map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0); }

  private move(by: number): void {
    const e = this.enabled();
    if (!e.length) { return; }
    const at = e.indexOf(this.active());
    this.active.set(e[(at + by + e.length) % e.length] ?? e[0]);
  }

  /** Handles the keys of the combobox pattern; true when the key was the list's. */
  key(e: KeyboardEvent): boolean {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!this.open()) { this.open.set(true); this.active.set(this.enabled()[0] ?? -1); } else { this.move(1); } return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (this.open()) { this.move(-1); } return true; }
    if (e.key === 'Enter' && this.open() && this.active() >= 0) { e.preventDefault(); this.pick(this.items()[this.active()]); return true; }
    if (e.key === 'Escape' && this.open()) { e.preventDefault(); this.open.set(false); this.active.set(-1); return true; }
    return false;
  }
}

/* ---------- MultiSelect (oj-select-many) ---------- */

/** Several values from a list: the chosen ones as chips (each with Remove), the rest in a list to filter and pick. */
@Component({
  selector: 'bx-multi-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldMessage],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MultiSelect), multi: true }],
  template: `
    <div [class]="fieldClass()" [attr.data-testid]="testID() || null">
      <label class="bx-label" [attr.for]="id" [id]="id + '-label'">{{ label() }}@if (required()) {<span class="bx-req" aria-hidden="true"> *</span>}</label>
      <div class="bx-control">
        <div class="bx-chips">
          @for (c of chips(); track c.value) {
            <span class="bx-chip">{{ c.label }}
              @if (editable()) {
                <button type="button" class="bx-chip-remove" [attr.aria-label]="'Remove ' + c.label" (click)="drop(c.value)">×</button>
              }
            </span>
          }
          @if (editable()) {
            <input class="bx-input" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" role="combobox" aria-autocomplete="list" autocomplete="off"
                   [attr.aria-expanded]="list.open()" [attr.aria-controls]="list.id" [attr.aria-activedescendant]="list.activeId()"
                   [attr.aria-required]="required() || null" [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
                   [value]="query()" [attr.placeholder]="chosen().length ? null : placeholder() || 'Choose'"
                   (focus)="focus(); list.open.set(true)" (blur)="blur(); list.open.set(false)" (keydown)="key($event)"
                   (input)="query.set($any($event.target).value); list.open.set(true); list.active.set(-1)" />
          }
        </div>
        @if (list.open() && editable()) {
          <ul class="bx-listbox" role="listbox" aria-multiselectable="true" [id]="list.id" [attr.aria-label]="label()">
            @if (left().length === 0) { <li class="bx-option-empty" role="presentation">Nothing more to choose</li> }
            @for (o of left(); track o.value; let i = $index) {
              <li role="option" aria-selected="false" [id]="list.optionId(i)" [attr.aria-disabled]="o.disabled || null"
                  [class]="i === list.active() ? 'bx-option is-active' : 'bx-option'" (mousedown)="$event.preventDefault(); pick(o)">{{ o.label }}</li>
            }
          </ul>
        }
      </div>
      <bx-field-message [id]="id" [error]="message()" [helpText]="helpText()" />
    </div>
  `,
})
export class MultiSelect extends FieldBase<string[]> {
  readonly options = input<ReadonlyArray<string | Option>>([]);
  protected readonly query = signal('');
  protected readonly all = computed(() => toOptions(this.options()));
  protected readonly chosen = computed(() => this.value() ?? []);
  protected readonly left = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.all().filter((o) => !this.chosen().includes(o.value) && o.label.toLowerCase().includes(q));
  });
  protected readonly chips = computed(() => this.chosen().map((v) => ({ value: v, label: this.all().find((o) => o.value === v)?.label ?? v })));
  protected readonly editable = computed(() => !this.readOnly() && !this.isDisabled());
  protected readonly list = new Listbox(() => this.left(), (o) => this.pick(o));

  protected pick(o: Option): void {
    if (o.disabled) { return; }
    this.change([...this.chosen(), o.value]);
    this.query.set('');
    this.list.active.set(-1);
  }

  protected drop(v: string): void { this.change(this.chosen().filter((x) => x !== v)); }

  protected key(e: KeyboardEvent): void {
    if (e.key === 'Backspace' && this.query() === '' && this.chosen().length) { this.change(this.chosen().slice(0, -1)); return; }
    this.list.key(e);
  }
}

/* ---------- Toggle (oj-switch) ---------- */

/** On or off, as a switch the screen reader announces as on or off. */
@Component({
  selector: 'bx-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldMessage],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Toggle), multi: true }],
  template: `
    <div [class]="fieldClass()" [attr.data-testid]="testID() || null">
      <div class="bx-switch-row">
        <span class="bx-switch-label" [id]="id + '-label'">{{ label() }}</span>
        <button type="button" role="switch" class="bx-switch" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [attr.aria-checked]="!!value()"
                [attr.aria-labelledby]="id + '-label'" [attr.aria-describedby]="describedBy()" [attr.aria-readonly]="readOnly() || null"
                [disabled]="isDisabled()" (click)="flip()" (blur)="blur()"></button>
      </div>
      <bx-field-message [id]="id" [error]="message()" [helpText]="helpText()" />
    </div>
  `,
})
export class Toggle extends FieldBase<boolean> {
  protected flip(): void { if (!this.readOnly()) { this.change(!this.value()); } }
}

/* ---------- DateRangePicker (two oj-input-date) ---------- */

export interface DateRange {
  from: string;
  to: string;
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

/** A period: from and to (ISO dates), the to day not before the from day, within min, max and maxDays. */
@Component({
  selector: 'bx-date-range',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldMessage],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateRangePicker), multi: true }],
  template: `
    <fieldset [class]="message() ? 'bx-field is-error' : 'bx-field'" [attr.data-testid]="testID() || null">
      <legend class="bx-label">{{ label() }}@if (required()) {<span class="bx-req" aria-hidden="true"> *</span>}</legend>
      <div class="bx-range">
        @for (p of parts(); track p.key) {
          <div [class]="partClass()">
            <label class="bx-label" [attr.for]="id + '-' + p.key">{{ p.label }}</label>
            <div class="bx-control">
              <input type="date" class="bx-input" [id]="id + '-' + p.key" [attr.data-testid]="testID() ? testID() + '-' + p.key : null" [value]="p.value"
                     [attr.min]="p.min || null" [attr.max]="p.max || null" [disabled]="isDisabled()" [readOnly]="readOnly()"
                     [attr.aria-required]="required() || null" [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
                     (blur)="blur()" (change)="set(p.key, $any($event.target).value)" (input)="set(p.key, $any($event.target).value)" />
            </div>
          </div>
        }
      </div>
      <bx-field-message [id]="id" [error]="message()" [helpText]="helpText()" />
    </fieldset>
  `,
})
export class DateRangePicker extends FieldBase<DateRange> {
  readonly min = input('');
  readonly max = input('');
  readonly fromLabel = input('From');
  readonly toLabel = input('To');
  /** The longest range allowed, in days (a statement period, for example). */
  readonly maxDays = input<number>();
  protected readonly range = computed(() => this.value() ?? { from: '', to: '' });
  private readonly rangeError = computed(() => {
    const r = this.range();
    const most = this.maxDays();
    return r.from && r.to && r.to < r.from ? 'The end date is before the start date.'
      : r.from && r.to && most !== undefined && days(r.from, r.to) > most ? `Choose at most ${most} days.` : '';
  });
  override readonly message = computed(() => this.error() || this.rangeError()
    || (this.touched() && this.required() && (!this.range().from || !this.range().to) ? `${this.label()} is required.` : ''));
  protected readonly partClass = computed(() => 'bx-field' + (this.message() ? ' is-error' : '') + (this.isDisabled() ? ' is-disabled' : '')
    + (this.readOnly() ? ' is-readonly' : ''));
  protected readonly parts = computed(() => {
    const r = this.range();
    return [
      { key: 'from' as const, label: this.fromLabel(), value: r.from, min: this.min(), max: r.to || this.max() },
      { key: 'to' as const, label: this.toLabel(), value: r.to, min: r.from || this.min(), max: this.max() },
    ];
  });

  protected set(key: 'from' | 'to', v: string): void { this.change({ ...this.range(), [key]: v }); }
}

/* ---------- SearchField (oj-input-text as a search) ---------- */

/** A search box in a search landmark: Enter searches (search), Escape or the clear button empties it. */
@Component({
  selector: 'bx-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldShell],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchField), multi: true }],
  template: `
    <div role="search">
      <bx-field-shell [field]="this">
        <span class="bx-search-icon" aria-hidden="true"></span>
        <input type="search" class="bx-input bx-search" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [value]="value() ?? ''"
               [attr.placeholder]="placeholder() || null" [disabled]="isDisabled()" autocomplete="off" enterkeyhint="search"
               [attr.aria-describedby]="describedBy()" (focus)="focus()" (blur)="blur()" (keydown)="key($event)" (input)="change($any($event.target).value)" />
        @if (value() && !isDisabled()) {
          <button type="button" class="bx-clear" [attr.aria-label]="'Clear ' + label()" (click)="change('')"><span aria-hidden="true">×</span></button>
        }
      </bx-field-shell>
    </div>
  `,
})
export class SearchField extends FieldBase<string> {
  /** Emitted on Enter with the text, to run the search (ojSearch). */
  readonly search = output<string>();

  protected key(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.preventDefault(); this.search.emit(this.value() ?? ''); }
    if (e.key === 'Escape' && this.value()) { e.preventDefault(); this.change(''); }
  }
}

/* ---------- Autocomplete (oj-combobox-one) ---------- */

/** One value with suggestions as the customer types (the ARIA combobox pattern): arrows move, Enter picks, Escape closes. */
@Component({
  selector: 'bx-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldMessage],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Autocomplete), multi: true }],
  template: `
    <div [class]="fieldClass()" [attr.data-testid]="testID() || null">
      <label class="bx-label" [attr.for]="id" [id]="id + '-label'">{{ label() }}@if (required()) {<span class="bx-req" aria-hidden="true"> *</span>}</label>
      <div class="bx-control">
        <input class="bx-input" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" role="combobox" aria-autocomplete="list" autocomplete="off"
               [attr.aria-expanded]="list.open() && !readOnly()" [attr.aria-controls]="list.id" [attr.aria-activedescendant]="list.activeId()"
               [attr.aria-required]="required() || null" [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
               [value]="text()" [attr.placeholder]="placeholder() || null" [disabled]="isDisabled()" [readOnly]="readOnly()"
               (focus)="focus()" (blur)="leave()" (keydown)="key($event)"
               (input)="typed.set($any($event.target).value); own.set(''); list.open.set(true); list.active.set(-1)" />
        <span class="bx-caret" aria-hidden="true"></span>
        @if (list.open() && !readOnly() && !isDisabled()) {
          <ul class="bx-listbox" role="listbox" [id]="list.id" [attr.aria-label]="label()">
            @if (matches().length === 0) { <li class="bx-option-empty" role="presentation">No match</li> }
            @for (o of matches(); track o.value; let i = $index) {
              <li role="option" [id]="list.optionId(i)" [attr.aria-selected]="o.value === value()" [attr.aria-disabled]="o.disabled || null"
                  [class]="i === list.active() ? 'bx-option is-active' : 'bx-option'" (mousedown)="$event.preventDefault(); pick(o)">{{ o.label }}</li>
            }
          </ul>
        }
      </div>
      <bx-field-message [id]="id" [error]="message()" [helpText]="helpText()" />
    </div>
  `,
})
export class Autocomplete extends FieldBase<string> {
  readonly options = input<ReadonlyArray<string | Option>>([]);
  /** Accept text that is not one of the options (a new payee name, for example). */
  readonly freeText = input(false);
  protected readonly typed = signal<string | null>(null);
  protected readonly all = computed(() => toOptions(this.options()));
  protected readonly text = computed(() => this.typed() ?? (this.all().find((o) => o.value === this.value())?.label ?? this.value() ?? ''));
  protected readonly matches = computed(() => {
    const q = (this.typed() ?? '').trim().toLowerCase();
    return this.all().filter((o) => o.label.toLowerCase().includes(q));
  });
  protected readonly list = new Listbox(() => this.matches(), (o) => this.pick(o));

  protected pick(o: Option): void {
    if (o.disabled) { return; }
    this.change(o.value);
    this.typed.set(null);
    this.own.set('');
    this.list.open.set(false);
    this.list.active.set(-1);
  }

  // A method, not an expression: Angular cancels the key when a handler expression returns false
  protected key(e: KeyboardEvent): void { if (!this.readOnly()) { this.list.key(e); } }

  protected leave(): void {
    this.blur();
    this.list.open.set(false);
    const t = this.typed();
    if (t === null) { return; }
    const exact = this.all().find((o) => o.label.toLowerCase() === t.trim().toLowerCase());
    if (exact) { this.pick(exact); return; }
    this.typed.set(null);
    if (t.trim() === '') { this.change(''); return; }
    if (this.freeText()) { this.change(t.trim()); return; }
    this.typed.set(t);
    this.own.set('Choose one of the suggestions.');
  }
}

/* ---------- FileUpload (oj-file-picker) ---------- */

export function fileSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Documents to send: a button (or drop on the area) to add them, the list with each file's size and Remove. */
@Component({
  selector: 'bx-document-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldMessage],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FileUpload), multi: true }],
  template: `
    <div [class]="message() ? 'bx-field is-error' : isDisabled() ? 'bx-field is-disabled' : 'bx-field'" [attr.data-testid]="testID() || null">
      <span class="bx-label" [id]="id + '-label'">{{ label() }}@if (required()) {<span class="bx-req" aria-hidden="true"> *</span>}</span>
      <div [class]="over() ? 'bx-drop is-over' : 'bx-drop'" (dragover)="$event.preventDefault(); over.set(!isDisabled())" (dragleave)="over.set(false)"
           (drop)="$event.preventDefault(); over.set(false); isDisabled() || add($event.dataTransfer?.files ?? null)">
        <input #picker type="file" class="bx-visually-hidden" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [attr.accept]="accept() || null"
               [multiple]="multiple()" [disabled]="isDisabled()" aria-hidden="true" tabindex="-1"
               (change)="picked($event)" />
        <button type="button" class="bx-drop-button" [disabled]="isDisabled()" [attr.aria-describedby]="id + '-label' + (describedBy() ? ' ' + describedBy() : '')"
                (click)="picker.click()">{{ multiple() ? 'Add files' : 'Choose a file' }}</button>
        <span class="bx-drop-hint">{{ hint() }}</span>
      </div>
      @if (files().length) {
        <ul class="bx-files" [attr.aria-label]="label() + ': chosen files'">
          @for (f of files(); track $index; let i = $index) {
            <li class="bx-file">
              <span class="bx-file-name">{{ f.name }}</span><span class="bx-file-size">{{ size(f.size) }}</span>
              @if (!isDisabled()) {
                <button type="button" class="bx-chip-remove" [attr.aria-label]="'Remove ' + f.name" (click)="remove(i)">×</button>
              }
            </li>
          }
        </ul>
      }
      <bx-field-message [id]="id" [error]="message()" [helpText]="helpText()" />
    </div>
  `,
})
export class FileUpload extends FieldBase<File[]> {
  /** File types, as for an input: .pdf,.jpg or image/* */
  readonly accept = input('');
  readonly multiple = input(false);
  /** The largest file, in bytes. */
  readonly maxSize = input<number>();
  protected readonly over = signal(false);
  protected readonly files = computed(() => this.value() ?? []);
  protected readonly hint = computed(() => {
    const parts = [this.accept() ? this.accept().replace(/,/g, ', ') : '', this.maxSize() !== undefined ? `up to ${fileSize(this.maxSize()!)}` : ''].filter(Boolean);
    return `or drop ${this.multiple() ? 'them' : 'it'} here${parts.length ? ' · ' + parts.join(', ') : ''}`;
  });
  override readonly message = computed(() => this.error() || this.own() || (this.touched() && this.required() && isEmpty(this.files()) ? `${this.label()} is required.` : ''));
  protected readonly size = fileSize;

  private allowed(f: File): boolean {
    const accept = this.accept();
    return !accept || accept.split(',').map((a) => a.trim().toLowerCase()).some((a) =>
      a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : f.type === a);
  }

  protected add(list: FileList | null): void {
    this.touched.set(true);
    if (!list || !list.length) { return; }
    const picked = Array.from(list);
    const wrongType = picked.find((f) => !this.allowed(f));
    const max = this.maxSize();
    const tooBig = picked.find((f) => max !== undefined && f.size > max);
    if (wrongType) { this.own.set(`${wrongType.name} is not a file type this accepts (${this.accept()}).`); return; }
    if (tooBig) { this.own.set(`${tooBig.name} is larger than ${fileSize(max!)}.`); return; }
    this.own.set('');
    this.change(this.multiple() ? [...this.files(), ...picked] : picked.slice(0, 1));
  }

  protected picked(e: Event): void {
    const el = e.target as HTMLInputElement;
    this.add(el.files);
    el.value = '';
  }

  protected remove(i: number): void { this.change(this.files().filter((_, j) => j !== i)); }
}
