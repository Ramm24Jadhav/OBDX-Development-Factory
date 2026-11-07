import { KeyboardEvent, ReactNode } from 'react';

import { Surface } from './Material';
import { CardVariant, vc } from './variants-v2';

export interface CardProps {
  heading?: string;
  subheading?: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** Makes the whole card a button (an account to open, a beneficiary to pick). Do not put other buttons in it then. */
  onAction?: () => void;
  selected?: boolean;
  testID?: string;
  /** The style variant (variants/v2.json); the card's own look when left out. */
  variant?: CardVariant;
}

/** A card: a heading, the content and actions. */
export function Card({ heading, subheading, children, actions, onAction, selected, testID, variant }: CardProps) {
  const interactive = !!onAction;
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAction?.(); }
  };
  return (
    <Surface as="div" kind="card" variant={variant} className={'bx-card' + vc('card', variant) + (interactive ? ' is-interactive' : '') + (selected ? ' is-selected' : '')} data-testid={testID}
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
    </Surface>
  );
}
