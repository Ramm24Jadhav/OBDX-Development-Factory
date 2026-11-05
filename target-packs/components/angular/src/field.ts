import { ChangeDetectionStrategy, Component, Directive, computed, input, model, signal } from '@angular/core';
import { ControlValueAccessor } from '@angular/forms';

let seq = 0;

/** A unique id for a component's inner parts (labels, messages). */
export function nextId(prefix = 'obdx'): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/** An option for a dropdown or a choice group. Strings work too. */
export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

export function toOptions(list: ReadonlyArray<string | Option>): Option[] {
  return list.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * What every field shares: the same inputs as the React and React Native packs, the value as a model (two-way
 * [(value)]), and a ControlValueAccessor so [formControl] and ngModel work too. Validation rules come from the screen
 * (error); a field only checks required and its own format, and only after the customer leaves it.
 */
@Directive()
export abstract class FieldBase<T> implements ControlValueAccessor {
  /** The Screen Model component id; rendered as data-testid. */
  readonly testID = input('');
  readonly label = input.required<string>();
  readonly value = model<T>();
  readonly required = input(false);
  readonly readOnly = input(false);
  readonly disabled = input(false);
  readonly helpText = input('');
  readonly placeholder = input('');
  /** A message from the screen (validation rules, a server error). Shown in place of the field's own message. */
  readonly error = input('');

  readonly id = nextId('obdx-field');
  protected readonly touched = signal(false);
  protected readonly focused = signal(false);
  /** The field's own message (a bad amount, a blocked day). */
  protected readonly own = signal('');
  private readonly formDisabled = signal(false);

  readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  readonly message = computed(() => this.error() || this.own()
    || (this.touched() && this.required() && isEmpty(this.value()) ? `${this.label()} is required.` : ''));
  readonly describedBy = computed(() => (this.message() ? `${this.id}-err` : this.helpText() ? `${this.id}-help` : null));
  readonly fieldClass = computed(() => 'bx-field' + (this.message() ? ' is-error' : '') + (this.focused() ? ' is-focus' : '')
    + (this.isDisabled() ? ' is-disabled' : '') + (this.readOnly() ? ' is-readonly' : ''));

  private onChange: (v: T) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /** Sets the value from the customer: writes back and tells the form. */
  protected change(v: T): void {
    this.value.set(v);
    this.onChange(v);
  }

  focus(): void { this.focused.set(true); }

  blur(): void {
    this.focused.set(false);
    this.touched.set(true);
    this.onTouched();
  }

  writeValue(v: T): void { this.value.set(v); }
  registerOnChange(fn: (v: T) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.formDisabled.set(disabled); }
}

/** The message under a field: the error (announced) or the help text. */
@Component({
  selector: 'bx-field-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (error()) {
      <span class="bx-error" [id]="id() + '-err'" role="alert"><span class="bx-error-icon" aria-hidden="true">!</span>{{ error() }}</span>
    } @else if (helpText()) {
      <span class="bx-help" [id]="id() + '-help'">{{ helpText() }}</span>
    }
  `,
})
export class FieldMessage {
  readonly id = input.required<string>();
  readonly error = input('');
  readonly helpText = input('');
}

/** The shell of a field, the same markup as the premium JET pack so one skin serves every web pack. */
@Component({
  selector: 'bx-field-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldMessage],
  host: { style: 'display: contents' },
  template: `
    <div [class]="field().fieldClass()" [attr.data-testid]="field().testID() || null">
      <label class="bx-label" [attr.for]="field().id" [id]="field().id + '-label'">
        {{ field().label() }}@if (field().required()) {<span class="bx-req" aria-hidden="true"> *</span>}
      </label>
      <div class="bx-control"><ng-content /></div>
      <bx-field-message [id]="field().id" [error]="field().message()" [helpText]="field().helpText()" />
    </div>
  `,
})
export class FieldShell {
  readonly field = input.required<FieldBase<unknown>>();
}
