import { ChangeDetectionStrategy, Component, Directive, computed, forwardRef, input } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldBase, FieldMessage, Option, toOptions } from './field';

// One template for both groups (the compiler needs a plain string): the input's type comes from the class
const TEMPLATE = `
  <fieldset [class]="groupClass()" [attr.data-testid]="testID() || null" [attr.aria-describedby]="describedBy()"
            [attr.aria-invalid]="message() ? true : null" [attr.aria-required]="required() || null">
    <legend class="bx-label">{{ label() }}@if (required()) {<span class="bx-req" aria-hidden="true"> *</span>}</legend>
    <div [class]="horizontal() ? 'bx-choices is-row' : 'bx-choices'">
      @for (o of rows(); track o.value; let i = $index) {
        <label [class]="o.css" [attr.for]="id + '-' + i">
          <input [type]="inputType" class="bx-choice-input" [id]="id + '-' + i" [name]="id" [value]="o.value" [checked]="o.on" [disabled]="o.off"
                 [attr.data-testid]="testID() ? testID() + '-option-' + o.value : null" (change)="pick(o.value)" (blur)="blur()" />
          <span class="bx-choice-mark" aria-hidden="true"></span>
          <span class="bx-choice-label">{{ o.label }}</span>
        </label>
      }
    </div>
    <bx-field-message [id]="id" [error]="message()" [helpText]="helpText()" />
  </fieldset>
`;

@Directive()
abstract class ChoiceBase<T> extends FieldBase<T> {
  readonly options = input<ReadonlyArray<string | Option>>([]);
  /** Choices side by side instead of one per line. */
  readonly horizontal = input(false);
  protected abstract picked(v: string): boolean;
  protected readonly groupClass = computed(() => 'bx-field' + (this.message() ? ' is-error' : '') + (this.isDisabled() ? ' is-disabled' : '')
    + (this.readOnly() ? ' is-readonly' : ''));
  protected readonly rows = computed(() => toOptions(this.options()).map((o) => {
    const on = this.picked(o.value);
    const off = this.isDisabled() || !!o.disabled;
    return { ...o, on, off, css: 'bx-choice' + (on ? ' is-on' : '') + (off ? ' is-disabled' : '') };
  }));
}

/** Choose any number of options, shown as cards (oj-checkboxset). The value is the list of chosen values. */
@Component({
  selector: 'bx-checkbox-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldMessage],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CheckboxGroup), multi: true }],
  template: TEMPLATE,
})
export class CheckboxGroup extends ChoiceBase<string[]> {
  protected readonly inputType = 'checkbox';
  protected picked(v: string): boolean { return (this.value() ?? []).includes(v); }

  protected pick(v: string): void {
    if (this.readOnly()) { return; }
    this.touched.set(true);
    const list = this.value() ?? [];
    this.change(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }
}

/** Choose one of a few options, all visible, shown as cards (oj-radioset). */
@Component({
  selector: 'bx-choice-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldMessage],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RadioGroup), multi: true }],
  template: TEMPLATE,
})
export class RadioGroup extends ChoiceBase<string> {
  protected readonly inputType = 'radio';
  protected picked(v: string): boolean { return this.value() === v; }

  protected pick(v: string): void {
    if (this.readOnly()) { return; }
    this.touched.set(true);
    this.change(v);
  }
}
