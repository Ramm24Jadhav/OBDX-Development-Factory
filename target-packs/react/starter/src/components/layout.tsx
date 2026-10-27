import { ReactNode } from 'react';

/** A screen action: primary (the main one), secondary or link. */
export function Button({ testID, label, variant = 'secondary', disabled, onPress }: {
  testID: string; label: string; variant?: 'primary' | 'secondary' | 'link'; disabled?: boolean; onPress?: () => void;
}) {
  return (
    <button type="button" className={`obdx-button obdx-button-${variant}`} data-testid={testID} disabled={disabled} onClick={onPress}>
      {label}
    </button>
  );
}

/** A titled group of fields, in up to three columns on wide screens. */
export function Section({ title, columns = 1, children }: { title?: string; columns?: number; children: ReactNode }) {
  return (
    <section className="obdx-section">
      {title ? <h2 className="obdx-section-title">{title}</h2> : null}
      <div className={`obdx-grid obdx-columns-${Math.min(Math.max(columns, 1), 3)}`}>{children}</div>
    </section>
  );
}

/** The frame of a screen, with its title and, at the bottom, its actions. */
export function Screen({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="obdx-screen">
      <h1 className="obdx-title">{title}</h1>
      {children}
      {actions ? <div className="obdx-actions">{actions}</div> : null}
    </main>
  );
}
