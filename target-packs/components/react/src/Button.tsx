import { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';

export type Chroming = 'callToAction' | 'solid' | 'outlined' | 'borderless' | 'danger';

interface BaseProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onClick'> {
  testID?: string;
  chroming?: Chroming;
  size?: 'sm';
  onAction?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export interface ButtonProps extends BaseProps {
  label: string;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  /** Shows the button busy and stops a second press (a payment must not go twice). */
  busy?: boolean;
}

function css(chroming: Chroming, size?: string, extra?: string) {
  return `bx-btn bx-btn--${chroming}` + (size ? ` bx-btn--${size}` : '') + (extra ? ` ${extra}` : '');
}

/** Sets where the ripple starts (the motion class decides whether it shows). */
function ripple(event: MouseEvent<HTMLButtonElement>) {
  const b = event.currentTarget;
  const r = b.getBoundingClientRect();
  b.style.setProperty('--bx-x', `${event.clientX - r.left}px`);
  b.style.setProperty('--bx-y', `${event.clientY - r.top}px`);
}

/** A button (oj-button): callToAction is the primary action of a screen. */
export function Button({ testID, label, chroming = 'callToAction', size, startIcon, endIcon, busy, disabled, onAction, className, type, ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type ?? 'button'} className={css(chroming, size, className)} data-testid={testID} disabled={disabled || busy}
            aria-busy={busy || undefined} onClick={(e) => { ripple(e); onAction?.(e); }}>
      {startIcon}
      <span className="bx-btn-label">{label}</span>
      {endIcon}
    </button>
  );
}

export interface IconButtonProps extends BaseProps {
  /** What the button does; screen readers read it and it shows as the tooltip. */
  label: string;
  icon?: 'more' | 'close' | ReactNode;
}

/** A button with only an icon (oj-button display="icons"); the label names it. */
export function IconButton({ testID, label, icon = 'more', chroming = 'borderless', size, disabled, onAction, className, type, ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type ?? 'button'} className={css(chroming, size, `bx-btn--icon${className ? ` ${className}` : ''}`)} data-testid={testID}
            disabled={disabled} aria-label={label} title={label} onClick={(e) => { ripple(e); onAction?.(e); }}>
      {typeof icon === 'string' ? <span className={`bx-icon bx-icon--${icon}`} aria-hidden="true" /> : icon}
    </button>
  );
}
