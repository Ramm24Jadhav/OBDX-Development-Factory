import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import saved from './component-style.json';
import { ComponentStyle, styleClasses } from './components';

// The Component factory's brand swatches; "workspace" keeps --bx-brand as the bank sets it
const BRANDS: Record<string, string | undefined> = { indigo: '#4f46e5', emerald: '#059669', burgundy: '#9f1239', gold: '#b45309' };
const style = saved.defaults;
const motion = Object.fromEntries(Object.entries(style.motion ?? {}).filter(([, v]) => v !== 'none'));

/** The app shell: the component style saved in the factory goes on the root, the screens in the outlet. */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `<div [class]="root" [style]="brand"><router-outlet /></div>`,
})
export class App {
  // The bank's component style from component-style.json (the Component factory's look, motion, mode and brand)
  protected readonly root = styleClasses({ look: style.look, motion, mode: style.mode } as ComponentStyle);
  protected readonly brand = BRANDS[style.brand] ? { '--bx-brand': BRANDS[style.brand], '--bx-brand-2': BRANDS[style.brand] } : {};
}
