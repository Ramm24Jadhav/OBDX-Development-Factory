import { ComponentChildren, h } from 'preact';
import 'oj-c/button';
import 'oj-c/form-layout';

/** A page: its title, the sections, and the actions (with a failure message) at the end. */
export function Screen({ title, actions, children }: { title: string; actions?: ComponentChildren; children: ComponentChildren }) {
  return (
    <main class="obdx-screen oj-web-applayout-max-width oj-web-applayout-content">
      <h1 class="oj-typography-heading-md">{title}</h1>
      {children}
      {actions ? <div class="obdx-actions oj-flex oj-sm-justify-content-flex-end">{actions}</div> : null}
    </main>
  );
}

/** A group of fields with an optional title, in columns on wide screens (oj-c-form-layout). */
export function Section({ title, columns = 1, children }: { title?: string; columns?: number; children: ComponentChildren }) {
  return (
    <section class="obdx-section">
      {title ? <h2 class="oj-typography-heading-sm">{title}</h2> : null}
      <oj-c-form-layout maxColumns={Math.min(Math.max(columns, 1), 4) as 1 | 2 | 3 | 4}>{children}</oj-c-form-layout>
    </section>
  );
}

/** primary: the screen's main action (callToAction); secondary: outlined; link: borderless. */
export function Button({ testID, label, variant = 'secondary', disabled, onPress }: {
  testID: string; label: string; variant?: 'primary' | 'secondary' | 'link'; disabled?: boolean; onPress?: () => void;
}) {
  const chroming = variant === 'primary' ? 'callToAction' : variant === 'link' ? 'borderless' : 'outlined';
  return (
    <span class="obdx-button" data-testid={testID}>
      <oj-c-button label={label} chroming={chroming} disabled={disabled} onojAction={() => onPress?.()} />
    </span>
  );
}
