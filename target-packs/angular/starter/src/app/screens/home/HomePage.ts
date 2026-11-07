import { ChangeDetectionStrategy, Component } from '@angular/core';

import { Screen } from '../../components';
import { t } from '../../i18n';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Screen],
  template: `
    <obdx-screen [title]="t('home.title')">
      <p>{{ t('home.welcome') }}</p>
    </obdx-screen>
  `,
})
export class HomePage {
  protected readonly t = t;
}
