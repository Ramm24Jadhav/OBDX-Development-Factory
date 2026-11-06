import { ChangeDetectionStrategy, Component, computed, forwardRef, input } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { FieldBase, FieldShell, Option, toOptions } from './field';

/** Choose one option from a list (oj-select-single, oj-select-one): the native select, so every screen reader and phone knows it. */
@Component({
  selector: 'bx-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldShell],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Dropdown), multi: true }],
  template: `
    <bx-field-shell [field]="this">
      <select class="bx-input bx-select" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [disabled]="isDisabled() || readOnly()"
              [attr.aria-required]="required() || null" [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()"
              (focus)="focus()" (blur)="blur()" (change)="touched.set(true); change($any($event.target).value)">
        <option value="" [selected]="!value()">{{ placeholder() || 'Choose' }}</option>
        @for (o of list(); track o.value) {
          <option [value]="o.value" [disabled]="!!o.disabled" [selected]="o.value === value()">{{ o.label }}</option>
        }
      </select>
      <span class="bx-caret" aria-hidden="true"></span>
    </bx-field-shell>
  `,
})
export class Dropdown extends FieldBase<string> {
  readonly options = input<ReadonlyArray<string | Option>>([]);
  protected readonly list = computed(() => toOptions(this.options()));
}
