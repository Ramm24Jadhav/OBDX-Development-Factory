import { KeyboardEvent, ReactNode } from 'react';

export interface CardProps {
  heading?: string;
  subheading?: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** Makes the whole card a button (an account to open, a beneficiary to pick). Do not put other buttons in it then. */
  onAction?: () => void;
  selected?: boolean;
  /** A style variant from variants.json; the default look when left out. */
  variant?: 'outlined';
  testID?: string;
}

/** A card: a heading, the content and actions. */
export function Card({ heading, subheading, children, actions, onAction, selected, variant, testID }: CardProps) {
  const interactive = !!onAction;
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAction?.(); }
  };
  return (
    <div className={'bx-card' + (variant ? ' bx-v-' + variant : '') + (interactive ? ' is-interactive' : '') + (selected ? ' is-selected' : '')} data-testid={testID}
         role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-pressed={interactive && selected !== undefined ? selected : undefined}
         onClick={onAction} onKeyDown={key}>
      {heading ? (
        <div className="bx-card-head">
          <h3 className="bx-card-title">{heading}</h3>
          {subheading ? <span className="bx-card-sub">{subheading}</span> : null}
        </div>
      ) : null}
      <div className="bx-card-body">{children}</div>
      {actions ? <div className="bx-card-actions">{actions}</div> : null}
    </div>
  );
}
