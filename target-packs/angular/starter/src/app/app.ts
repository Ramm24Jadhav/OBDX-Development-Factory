import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { styleClasses } from './components';

/** The app shell: the component style saved in the factory goes on the root, the screens in the outlet. */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `<div [class]="root"><router-outlet /></div>`,
})
export class App {
  // The look of the bank's component style (Component factory); --bx-brand on :root sets the bank's colour
  protected readonly root = styleClasses({ look: 'elevated' });
}
