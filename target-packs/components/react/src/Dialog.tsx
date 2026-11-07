import * as RadixDialog from '@radix-ui/react-dialog';
import MuiDialog from '@mui/material/Dialog';
import { ReactNode, useId, useRef } from 'react';

import { DialogVariant, isMaterial, vc } from './variants-v2';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** A line under the title that says what the dialog is for; read by screen readers. */
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** 'none' keeps the dialog open on Escape and outside clicks, and hides the close button (a step that must be answered). */
  cancelBehavior?: 'icon' | 'escape' | 'none';
  testID?: string;
  /** Where the dialog is drawn (a preview panel); the page's body when left out. Drawn in a panel, it does not lock the rest of the page. */
  container?: HTMLElement | null;
  /** The style variant (variants/v2.json): basic is a Material dialog, alert is read out as an alert, sheet, side and fullscreen change where it sits. */
  variant?: DialogVariant;
}

/**
 * A modal dialog (oj-dialog), on Radix Dialog: focus moves in and stays inside, goes back to the button that opened it,
 * Escape closes unless cancelBehavior is 'none', and the page behind is hidden from screen readers.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, cancelBehavior = 'icon', testID, container, variant }: DialogProps) {
  const locked = cancelBehavior === 'none';
  const ids = useId();
  // Radix gives focus back only to its own trigger; screens open dialogs from their own buttons, so remember who had it
  // (taken while rendering the open, before Radix moves focus into the dialog)
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    opener.current = document.activeElement;
  }
  wasOpen.current = open;
  if (isMaterial('dialog', variant)) {
    // MUI gives focus back to the element that had it, closes on Escape and the backdrop (reported through onClose), and labels the paper
    return (
      <MuiDialog open={open} onClose={() => { if (!locked) { onOpenChange(false); } }} container={container ?? undefined} disableScrollLock={!!container}
                 aria-labelledby={`${ids}-t`} aria-describedby={description ? `${ids}-d` : undefined}
                 slotProps={{ paper: { className: 'bx-dialog' + vc('dialog', variant), 'data-testid': testID } as object, backdrop: { className: 'bx-dialog-backdrop' } as object }}>
        <div className="bx-dialog-header">
          <h2 className="bx-dialog-title" id={`${ids}-t`}>{title}</h2>
          {cancelBehavior === 'icon'
            ? <button type="button" className="bx-btn bx-btn--borderless bx-btn--icon" aria-label="Close" onClick={() => onOpenChange(false)}><span aria-hidden="true">×</span></button>
            : null}
        </div>
        <div className="bx-dialog-body">
          {description ? <p className="bx-help" id={`${ids}-d`}>{description}</p> : null}
          {children}
        </div>
        {footer ? <div className="bx-dialog-footer">{footer}</div> : null}
      </MuiDialog>
    );
  }
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange} modal={!container}>
      <RadixDialog.Portal container={container ?? undefined}>
        {container ? (open ? <div className="bx-dialog-backdrop" aria-hidden="true" /> : null) : <RadixDialog.Overlay className="bx-dialog-backdrop" />}
        <RadixDialog.Content className={'bx-dialog' + vc('dialog', variant)} data-testid={testID} role={variant === 'alert' ? 'alertdialog' : 'dialog'} {...(description ? {} : { 'aria-describedby': undefined })}
                             onEscapeKeyDown={(e) => { if (locked) { e.preventDefault(); } }}
                             onPointerDownOutside={(e) => { if (locked) { e.preventDefault(); } }}
                             onInteractOutside={(e) => { if (locked) { e.preventDefault(); } }}
                             onCloseAutoFocus={(e) => { if (opener.current && opener.current.isConnected) { e.preventDefault(); opener.current.focus(); } }}>
          <div className="bx-dialog-header">
            <RadixDialog.Title className="bx-dialog-title">{title}</RadixDialog.Title>
            {cancelBehavior === 'icon'
              ? <RadixDialog.Close className="bx-btn bx-btn--borderless bx-btn--icon" aria-label="Close"><span aria-hidden="true">×</span></RadixDialog.Close>
              : null}
          </div>
          <div className="bx-dialog-body">
            {description ? <RadixDialog.Description className="bx-help">{description}</RadixDialog.Description> : null}
            {children}
          </div>
          {footer ? <div className="bx-dialog-footer">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
