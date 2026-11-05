/*
 * {{title}}: page built from the approved Screen Model "{{modelName}}" by the OBDX Development Factory.
 * Every field and action keeps its Screen Model id as testID.
 */
import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';

import { ApiError } from '../../api/client';
import { {{imports}} } from '../../components';
import { createForm } from '../../forms/form';
import { t } from '../../i18n';

@Component({
  selector: 'app-{{selector}}',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [{{imports}}],
  template: `
    <obdx-screen [title]="t('{{screenKey}}.title')">
{{sections}}      <div actions>
        @if (failure()) {
          <div class="bx-error" role="alert">{{ failure() }}</div>
        }
{{actions}}      </div>
    </obdx-screen>
  `,
})
export class {{Screen}}Page {
  /** Emits the id of a secondary or link action, for navigation. */
  readonly action = output<string>();
  /** Emits when the main action has succeeded. */
  readonly done = output<void>();
  protected readonly t = t;
{{optionLists}}  protected readonly form = createForm({
{{initialValues}}  }, {
{{rules}}  });
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | undefined>(undefined);

  protected async submit(): Promise<void> {
    if (!this.form.validate()) {
      return;
    }
    this.busy.set(true);
    this.failure.set(undefined);
    try {
      // Send this.form.snapshot() with the module's API file (src/app/api/{{module}}Api.ts).
      this.done.emit();
    } catch (e) {
      this.failure.set(e instanceof ApiError ? e.message : t('common.failed'));
    } finally {
      this.busy.set(false);
    }
  }
}
