/*
 * Group 1 (the rest of the foundation, layout, data and feedback), the same markup and bx- classes as bx-g1.js in the
 * premium JET pack. The kinds here (Rows, StepTrack, TimelineList, AlertBox, Segments, ChipFilter, Menu, Panels) are
 * reused by the later groups, which give them their own names and defaults.
 */
import MuiAccordion from '@mui/material/Accordion';
import MuiAccordionDetails from '@mui/material/AccordionDetails';
import MuiAccordionSummary from '@mui/material/AccordionSummary';
import MuiBreadcrumbs from '@mui/material/Breadcrumbs';
import MuiDivider from '@mui/material/Divider';
import MuiList from '@mui/material/List';
import MuiListItemButton from '@mui/material/ListItemButton';
import MuiMenu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import MuiPagination from '@mui/material/Pagination';
import * as RadixDialog from '@radix-ui/react-dialog';
import { ElementType, KeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';

import { Button, ButtonProps } from './Button';
import { Lens } from './lens';
import { AccordionVariant, CrumbsVariant, DialogVariant, DividerVariant, GridVariant, MenuVariant, NavVariant, PagesVariant, collapse, isMaterial, vc } from './variants-v2';

/* ---------- items: strings or objects, each with an id and a label ---------- */

export interface Item {
  id?: string;
  label?: string;
  title?: string;
  value?: string | number;
  disabled?: boolean;
  [key: string]: unknown;
}
export type ItemLike = string | Item;
export interface ListItem extends Item { id: string; label: string; index: number; source: ItemLike }

export function toItems(items: ReadonlyArray<ItemLike> = []): ListItem[] {
  return items.map((o, index) => {
    if (typeof o !== 'object' || o === null) { return { id: String(o), label: String(o), index, source: o }; }
    const id = String(o.id ?? o.value ?? o.label ?? o.title ?? index);
    return { ...o, id, label: String(o.label ?? o.title ?? o.value ?? id), index, source: o };
  });
}

/** The value an item stands for: its value, else its id. */
const valueOf = (o: ListItem) => (o.value !== undefined ? String(o.value) : o.id);

/** The next index for arrow keys, Home and End in a list of n; -1 when the key is not one of them. */
export function arrow(key: string, at: number, n: number): number {
  if (!n) { return -1; }
  return key === 'ArrowRight' || key === 'ArrowDown' ? (at + 1) % n : key === 'ArrowLeft' || key === 'ArrowUp' ? (at - 1 + n) % n
    : key === 'Home' ? 0 : key === 'End' ? n - 1 : -1;
}

export function initials(name = ''): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';
}

/* ---------- buttons ---------- */

/** A second, quieter action (oj-button chroming outlined). */
export function SecondaryButton(props: Omit<ButtonProps, 'chroming'>) { return <Button {...props} chroming="outlined" />; }
/** An action that deletes or cancels (oj-button chroming danger). */
export function DestructiveButton(props: Omit<ButtonProps, 'chroming'>) { return <Button {...props} chroming="danger" />; }

/* ---------- Slider ---------- */

export interface SliderProps {
  testID?: string;
  label: string;
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shown before the value, for example the currency code. */
  prefix?: string;
  decimals?: number;
  disabled?: boolean;
  helpText?: string;
}

/** An amount or a count on a range, the value shown beside the label. */
export function Slider({ testID, label, value, onChange, min = 0, max = 100, step = 1, prefix, decimals = 0, disabled, helpText }: SliderProps) {
  const id = useId();
  const p = prefix ? `${prefix} ` : '';
  const shown = p + Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: decimals });
  return (
    <div className="bx-field bx-slider" data-testid={testID}>
      <div className="bx-slider-head">
        <label className="bx-label" htmlFor={id}>{label}</label>
        <output className="bx-slider-value" htmlFor={id}>{shown}</output>
      </div>
      <input type="range" className="bx-range-input" id={id} min={min} max={max} step={step} value={value} disabled={disabled} aria-valuetext={shown}
             aria-describedby={helpText ? `${id}-help` : undefined} onChange={(e) => onChange?.(Number(e.target.value))} />
      <div className="bx-slider-scale" aria-hidden="true"><span>{p + min.toLocaleString()}</span><span>{p + max.toLocaleString()}</span></div>
      {helpText ? <span className="bx-help" id={`${id}-help`}>{helpText}</span> : null}
    </div>
  );
}

/* ---------- ToggleGroup (segmented) ---------- */

export interface SegmentsProps {
  testID?: string;
  label: string;
  options: ReadonlyArray<ItemLike>;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

/** One of a few options (oj-buttonset-one), as radios that look like a segmented control; arrow keys move. */
export function ToggleGroup({ testID, label, options, value, onChange, disabled }: SegmentsProps) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const list = toItems(options);
  const picked = list.some((o) => valueOf(o) === value);
  const key = (e: KeyboardEvent) => {
    const live = list.filter((o) => !o.disabled);
    const next = arrow(e.key, Math.max(0, live.findIndex((o) => valueOf(o) === value)), live.length);
    if (next < 0 || disabled) { return; }
    e.preventDefault();
    onChange?.(valueOf(live[next]));
    setTimeout(() => box.current?.querySelector<HTMLElement>('.bx-segment.is-on')?.focus(), 0);
  };
  return (
    <div className="bx-field bx-segmented-field" data-testid={testID}>
      <span className="bx-label" id={`${id}-label`}>{label}</span>
      <div className="bx-segmented" role="radiogroup" aria-labelledby={`${id}-label`} ref={box} onKeyDown={key}>
        <Lens />
        {list.map((o, i) => {
          const on = valueOf(o) === value;
          return (
            <button key={o.id} type="button" role="radio" className={'bx-segment' + (on ? ' is-on' : '')} aria-checked={on} tabIndex={on || (!picked && i === 0) ? 0 : -1}
                    disabled={o.disabled || disabled} onClick={() => onChange?.(valueOf(o))}>{o.label}</button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- FilterChips ---------- */

export interface ChipsProps {
  testID?: string;
  label: string;
  options: ReadonlyArray<ItemLike>;
  value: string[];
  onChange?: (value: string[]) => void;
  /** Several at once (the default), or one. */
  multiple?: boolean;
}

/** Filters that turn on and off. */
export function FilterChips({ testID, label, options, value, onChange, multiple = true }: ChipsProps) {
  const id = useId();
  return (
    <div className="bx-filter" role="group" aria-labelledby={`${id}-label`} data-testid={testID}>
      <span className="bx-label" id={`${id}-label`}>{label}</span>
      <div className="bx-chip-row">
        {toItems(options).map((o) => {
          const v = valueOf(o);
          const on = value.includes(v);
          return (
            <button key={o.id} type="button" className={'bx-filter-chip' + (on ? ' is-on' : '')} aria-pressed={on} disabled={o.disabled}
                    onClick={() => onChange?.(on ? value.filter((x) => x !== v) : multiple ? [...value, v] : [v])}>{o.label}</button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- ActionMenu ---------- */

export interface MenuItem extends Item { danger?: boolean }

export interface ActionMenuProps {
  testID?: string;
  /** The button's text. */
  label?: string;
  items: ReadonlyArray<string | MenuItem>;
  onAction?: (value: string) => void;
  disabled?: boolean;
  /** The style variant (variants/v2.json); list is a Material menu. */
  variant?: MenuVariant;
}

/** A button that opens a list of actions (oj-menu-button); arrows move, Escape closes and gives focus back. */
export function ActionMenu({ testID, label = 'More', items, onAction, disabled, variant }: ActionMenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const live = () => Array.from(box.current?.querySelectorAll<HTMLElement>('.bx-menu-item:not([aria-disabled="true"])') ?? []);
  useEffect(() => { if (open) { live()[0]?.focus(); } }, [open]);
  const close = (refocus: boolean) => { setOpen(false); if (refocus) { box.current?.querySelector<HTMLElement>('.bx-menu-button')?.focus(); } };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Tab') { close(e.key === 'Escape'); return; }
    const l = live();
    const next = arrow(e.key, l.indexOf(document.activeElement as HTMLElement), l.length);
    if (next >= 0) { e.preventDefault(); l[next].focus(); }
  };
  const mui = isMaterial('menu', variant);
  return (
    <div className={'bx-menu' + vc('menu', variant)} ref={box} data-testid={testID}>
      <button type="button" ref={button} className="bx-btn bx-btn--outlined bx-menu-button" aria-haspopup="menu" aria-expanded={open} aria-controls={id} disabled={disabled}
              onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}>
        <Lens /><span className="bx-btn-label">{label}</span><span className="bx-menu-caret" aria-hidden="true" />
      </button>
      {mui ? (
        // MUI's menu list: arrows, Home, End and typing a letter move; Escape and Tab close it and focus goes back to the button
        <MuiMenu open={open} anchorEl={button.current} onClose={() => close(true)} className={'bx-menu-pop' + vc('menu', variant)}
                 slotProps={{ list: { id, 'aria-label': label, className: 'bx-menu-list' } as object }}>
          {toItems(items).map((o) => (
            <MuiMenuItem key={o.id} disabled={o.disabled} className={'bx-menu-item' + ((o as MenuItem).danger ? ' is-danger' : '')}
                         onClick={() => { close(true); onAction?.(valueOf(o)); }}>{o.label}</MuiMenuItem>
          ))}
        </MuiMenu>
      ) : open ? (
        <ul className="bx-menu-list" role="menu" id={id} aria-label={label} onKeyDown={key}>
          {toItems(items).map((o) => (
            <li key={o.id} role="menuitem" tabIndex={-1} className={'bx-menu-item' + ((o as MenuItem).danger ? ' is-danger' : '')} aria-disabled={o.disabled || undefined}
                onClick={() => { if (!o.disabled) { close(true); onAction?.(valueOf(o)); } }}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !o.disabled) { e.preventDefault(); close(true); onAction?.(valueOf(o)); } }}>{o.label}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------- Accordion ---------- */

export interface PanelItem { id?: string; title: string; body?: ReactNode }

export interface AccordionProps {
  testID?: string;
  items: ReadonlyArray<PanelItem>;
  /** The open sections' ids; leave out to let the accordion keep them. */
  expanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  /** Several sections open at once. */
  multiple?: boolean;
  /** The style variant (variants/v2.json); separated is a Material accordion. */
  variant?: AccordionVariant;
}

/** Sections that open and close (oj-collapsible): a button with aria-expanded and a region for each. */
export function Accordion({ testID, items, expanded, onExpandedChange, multiple, variant }: AccordionProps) {
  const id = useId();
  const [own, setOwn] = useState<string[]>([]);
  const open = expanded ?? own;
  const mui = isMaterial('accordion', variant);
  return (
    <div className={'bx-accordion' + vc('accordion', variant)} data-testid={testID}>
      {items.map((o, i) => {
        const key = o.id ?? o.title;
        const on = open.includes(key);
        const toggle = () => {
          const next = on ? open.filter((x) => x !== key) : multiple ? [...open, key] : [key];
          setOwn(next);
          onExpandedChange?.(next);
        };
        if (mui) {
          // MUI ties the summary button and the region from the summary's id and aria-controls
          return (
            <MuiAccordion key={key} expanded={on} onChange={toggle} disableGutters className={'bx-acc-item' + (on ? ' is-open' : '')}
                          slotProps={{ heading: { className: 'bx-acc-head' }, transition: { unmountOnExit: true } }}>
              <MuiAccordionSummary id={`${id}-${i}-h`} aria-controls={`${id}-${i}-p`} className="bx-acc-button" expandIcon={<span className="bx-acc-icon" aria-hidden="true" />}>
                <span>{o.title}</span>
              </MuiAccordionSummary>
              <MuiAccordionDetails className="bx-acc-panel">{o.body}</MuiAccordionDetails>
            </MuiAccordion>
          );
        }
        return (
          <div key={key} className={'bx-acc-item' + (on ? ' is-open' : '')}>
            <h3 className="bx-acc-head">
              <button type="button" className="bx-acc-button" id={`${id}-${i}-h`} aria-expanded={on} aria-controls={`${id}-${i}-p`} onClick={toggle}>
                <span>{o.title}</span><span className="bx-acc-icon" aria-hidden="true" />
              </button>
            </h3>
            {on ? <div className="bx-acc-panel" role="region" id={`${id}-${i}-p`} aria-labelledby={`${id}-${i}-h`}>{o.body}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Stepper (oj-train) ---------- */

export type StepState = 'done' | 'current' | 'next' | 'failed';
export interface StepItem extends Item { state?: StepState }

export interface StepperProps {
  testID?: string;
  /** Names the list of steps. */
  label?: string;
  steps: ReadonlyArray<string | StepItem>;
  /** The current step's id; the ones before it are done. */
  selectedStep?: string;
}

/** Done, current and next steps of a journey. */
export function Stepper({ testID, label = 'Progress', steps, selectedStep }: StepperProps) {
  const list = toItems(steps);
  const at = list.findIndex((s) => s.id === selectedStep);
  return (
    <ol className="bx-steps" aria-label={label} data-testid={testID}>
      {list.map((s, i) => {
        const state = (s as StepItem).state ?? (i < at ? 'done' : i === at ? 'current' : 'next');
        return (
          <li key={s.id} className={`bx-step-item is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="bx-step-mark" aria-hidden="true">{state === 'done' ? '✓' : state === 'failed' ? '!' : i + 1}</span>
            <span className="bx-step-label">{s.label}</span>
            <span className="bx-visually-hidden">{state === 'done' ? 'done' : state === 'current' ? 'current step' : state === 'failed' ? 'failed' : 'not started'}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Breadcrumb and SideNav ---------- */

export interface BreadcrumbProps { testID?: string; label?: string; items: ReadonlyArray<ItemLike>; onAction?: (value: string) => void;
  /** The style variant (variants/v2.json); chevron is Material breadcrumbs, collapsed hides the middle pages behind a button. */
  variant?: CrumbsVariant }

/** Where the page sits; the earlier pages are links, the last one is the page. */
export function Breadcrumb({ testID, label = 'Breadcrumb', items, onAction, variant }: BreadcrumbProps) {
  const [full, setFull] = useState(false);
  const list = toItems(items);
  const crumb = (o: ListItem, last: boolean) => (last
    ? <span className="bx-crumb is-here" aria-current="page">{o.label}</span>
    : <button type="button" className="bx-crumb" onClick={() => onAction?.(valueOf(o))}>{o.label}</button>);
  if (isMaterial('crumbs', variant)) {
    return (
      <MuiBreadcrumbs aria-label={label} separator="›" className={'bx-crumbs' + vc('crumbs', variant)} data-testid={testID}>
        {list.map((o, i) => <span key={o.id}>{crumb(o, i === list.length - 1)}</span>)}
      </MuiBreadcrumbs>
    );
  }
  const shown = variant === 'collapsed' ? collapse(list, full) : list;
  return (
    <nav className={'bx-crumbs' + vc('crumbs', variant)} aria-label={label} data-testid={testID}>
      <ol>
        {shown.map((o, i) => (
          <li key={o ? o.id : 'more'}>
            {o ? crumb(o, i === shown.length - 1)
              : <button type="button" className="bx-crumb bx-crumb-more" aria-label="Show the full path" onClick={() => setFull(true)}>…</button>}
            {i < shown.length - 1 ? <span className="bx-crumb-sep" aria-hidden="true">/</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface NavItem extends Item { badge?: string | number }
export interface SideNavProps { testID?: string; label?: string; items: ReadonlyArray<string | NavItem>; selection?: string; onSelectionChange?: (value: string) => void;
  /** The style variant (variants/v2.json); drawer is a Material navigation list. */
  variant?: NavVariant }

/** The sections of the app (oj-navigation-list); the chosen one is the current page. */
export function SideNav({ testID, label = 'Main', items, selection, onSelectionChange, variant }: SideNavProps) {
  const mui = isMaterial('nav', variant);
  const Ul = (mui ? MuiList : 'ul') as ElementType;
  const Btn = (mui ? MuiListItemButton : 'button') as ElementType;
  return (
    <nav className={'bx-nav' + vc('nav', variant)} aria-label={label} data-testid={testID}>
      <Ul>
        {toItems(items).map((o) => {
          const on = valueOf(o) === selection;
          const badge = (o as NavItem).badge;
          return (
            <li key={o.id}>
              <Btn {...(mui ? { component: 'button', selected: on } : {})} type="button" className={'bx-nav-item' + (on ? ' is-on' : '')} aria-current={on ? 'page' : undefined}
                   disabled={o.disabled} onClick={() => onSelectionChange?.(valueOf(o))}>
                <span>{o.label}</span>{badge !== undefined ? <span className="bx-nav-badge">{badge}</span> : null}
              </Btn>
            </li>
          );
        })}
      </Ul>
    </nav>
  );
}

/* ---------- Sheet (oj-popup) ---------- */

export interface SheetProps {
  testID?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string;
  /** From the side (end) or the bottom. */
  position?: 'end' | 'bottom';
  children?: ReactNode;
  footer?: ReactNode;
  container?: HTMLElement | null;
  /** The style variant (variants/v2.json); alert is read out as an alert. */
  variant?: DialogVariant;
}

/** A panel from the side or the bottom, on Radix Dialog: focus moves in and stays, Escape and the backdrop close it. */
export function Sheet({ testID, open, onOpenChange, heading, position = 'end', children, footer, container, variant }: SheetProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal container={container ?? undefined}>
        <RadixDialog.Overlay className="bx-dialog-backdrop" />
        <RadixDialog.Content className={`bx-sheet is-${position}` + vc('dialog', variant)} data-testid={testID} aria-describedby={undefined} role={variant === 'alert' ? 'alertdialog' : 'dialog'}>
          <div className="bx-dialog-header">
            <RadixDialog.Title className="bx-dialog-title">{heading}</RadixDialog.Title>
            <RadixDialog.Close className="bx-btn bx-btn--borderless bx-btn--icon" aria-label="Close"><span aria-hidden="true">×</span></RadixDialog.Close>
          </div>
          <div className="bx-dialog-body">{children}</div>
          {footer ? <div className="bx-dialog-footer">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/* ---------- layout: Grid, Divider, Avatar ---------- */

export interface GridProps { testID?: string; columns?: 1 | 2 | 3 | 4 | 'auto'; gap?: 'sm' | 'md' | 'lg'; children?: ReactNode; /** The style variant (variants/v2.json). */ variant?: GridVariant }
/** A responsive layout of columns (fewer on narrow screens). */
export function Grid({ testID, columns = 'auto', gap = 'md', children, variant }: GridProps) {
  return <div className={`bx-layout-grid is-cols-${columns} is-gap-${gap}` + vc('grid', variant)} data-testid={testID}>{children}</div>;
}

/** A line between parts, with an optional label. */
export function Divider({ testID, label, variant }: { testID?: string; label?: string; /** The style variant (variants/v2.json); full, inset and middle are Material dividers. */ variant?: DividerVariant }) {
  if (isMaterial('divider', variant)) {
    const v = variant === 'full' ? 'fullWidth' : (variant as 'inset' | 'middle');
    return label
      ? <MuiDivider variant={v} role="separator" aria-label={label} className={'bx-divider has-label' + vc('divider', variant)} data-testid={testID}><span aria-hidden="true">{label}</span></MuiDivider>
      : <MuiDivider variant={v} className={'bx-divider' + vc('divider', variant)} data-testid={testID} />;
  }
  return label
    ? <div className={'bx-divider has-label' + vc('divider', variant)} role="separator" aria-label={label} data-testid={testID}><span aria-hidden="true">{label}</span></div>
    : <hr className={'bx-divider' + vc('divider', variant)} data-testid={testID} />;
}

export interface AvatarProps { testID?: string; name: string; src?: string; size?: 'sm' | 'md' | 'lg' }
/** A photo, or the initials of a name; the name is what a screen reader says. */
export function Avatar({ testID, name, src, size = 'md' }: AvatarProps) {
  return src
    ? <img className={`bx-avatar is-${size}`} src={src} alt={name} data-testid={testID} />
    : <span className={`bx-avatar is-${size}`} role="img" aria-label={name} data-testid={testID}><span aria-hidden="true">{initials(name)}</span></span>;
}

/* ---------- Pagination (oj-paging-control) ---------- */

export interface PaginationProps { testID?: string; label?: string; page: number; pageCount: number; onPageChange?: (page: number) => void;
  /** The style variant (variants/v2.json); rounded and outlined are Material pagination, compact says Page x of y. */
  variant?: PagesVariant }

/** The pages to show: the first, the last and the ones around this page; 0 is a gap. */
export function pagesAround(page: number, count: number): number[] {
  const out: number[] = [];
  for (let p = 1; p <= count; p++) {
    if (p === 1 || p === count || Math.abs(p - page) <= 1) { out.push(p); } else if (out[out.length - 1] !== 0) { out.push(0); }
  }
  return out;
}

/** Previous, the pages around this one, next. */
export function Pagination({ testID, label = 'Pages', page, pageCount, onPageChange, variant }: PaginationProps) {
  const count = Math.max(1, pageCount);
  const go = (p: number) => { const n = Math.min(count, Math.max(1, p)); if (n !== page) { onPageChange?.(n); } };
  if (isMaterial('pages', variant)) {
    return (
      <MuiPagination count={count} page={page} onChange={(_e: unknown, p: number) => go(p)} shape="rounded" variant={variant === 'outlined' ? 'outlined' : 'text'}
                     aria-label={label} className={'bx-pages' + vc('pages', variant)} data-testid={testID}
                     getItemAriaLabel={(type: string, p: number | null) => (type === 'page' ? `Page ${p}` : type === 'previous' ? 'Previous page' : type === 'next' ? 'Next page' : type === 'first' ? 'First page' : 'Last page')} />
    );
  }
  const prev = <button type="button" className="bx-page" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>‹</button>;
  const next = <button type="button" className="bx-page" aria-label="Next page" disabled={page >= count} onClick={() => go(page + 1)}>›</button>;
  if (variant === 'compact') {
    return <nav className="bx-pages bx-v-compact" aria-label={label} data-testid={testID}>{prev}<span className="bx-page-status">Page {page} of {count}</span>{next}</nav>;
  }
  return (
    <nav className={'bx-pages' + vc('pages', variant)} aria-label={label} data-testid={testID}>
      <button type="button" className="bx-page" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>‹</button>
      {pagesAround(page, count).map((p, i) => (p === 0
        ? <span key={`gap${i}`} className="bx-page-gap" aria-hidden="true">…</span>
        : <button key={p} type="button" className={'bx-page' + (p === page ? ' is-on' : '')} aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined}
                  onClick={() => go(p)}>{p}</button>))}
      <button type="button" className="bx-page" aria-label="Next page" disabled={page >= count} onClick={() => go(page + 1)}>›</button>
    </nav>
  );
}

/* ---------- data: StatusBadge, Timeline, Spinner, Skeleton, EmptyState, Tooltip ---------- */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
/** A status in a word. */
export function StatusBadge({ testID, label, tone = 'neutral' }: { testID?: string; label: string; tone?: Tone }) {
  return <span className={`bx-badge is-${tone}`} data-testid={testID}><span className="bx-badge-dot" aria-hidden="true" />{label}</span>;
}

export interface TimelineItem { id?: string; label: string; meta?: string; state?: 'done' | 'current' | 'pending' | 'failed' }
export interface TimelineProps { testID?: string; label?: string; items: ReadonlyArray<TimelineItem> }

/** Events in order, with who and when. */
export function Timeline({ testID, label = 'Timeline', items }: TimelineProps) {
  return (
    <ol className="bx-timeline" aria-label={label} data-testid={testID}>
      {items.map((o, i) => {
        const state = o.state ?? 'done';
        const status = state === 'done' ? '' : state === 'current' ? 'In progress' : state === 'failed' ? 'Failed' : 'Not yet';
        return (
          <li key={o.id ?? i} className={`bx-tl-item is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="bx-tl-dot" aria-hidden="true" />
            <span className="bx-tl-text"><strong>{o.label}</strong>{o.meta ? <span className="bx-tl-meta">{o.meta}</span> : null}
              {status ? <span className="bx-tl-status">{status}</span> : null}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Waiting: a turning circle, said to screen readers once. */
export function Spinner({ testID, label = 'Loading', size = 'md' }: { testID?: string; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  return <span className="bx-spinner-wrap" role="status" data-testid={testID}><span className={`bx-spinner is-${size}`} aria-hidden="true" /><span className="bx-visually-hidden">{label}</span></span>;
}

/** Where content is coming: grey lines that shimmer. */
export function Skeleton({ testID, label = 'Loading', lines = 3, shape = 'text' }: { testID?: string; label?: string; lines?: number; shape?: 'text' | 'card' | 'circle' }) {
  const n = Math.max(1, lines);
  return (
    <div className={`bx-skeleton is-${shape}`} role="status" aria-busy="true" data-testid={testID}>
      <span className="bx-visually-hidden">{label}</span>
      {shape !== 'text' ? <span className="bx-skel-block" aria-hidden="true" /> : null}
      {Array.from({ length: n }, (_, i) => <span key={i} className={'bx-skel-line' + (i === n - 1 && n > 1 ? ' is-short' : '')} aria-hidden="true" />)}
    </div>
  );
}

export interface EmptyStateProps { testID?: string; heading: string; text?: string; actionLabel?: string; onAction?: () => void; icon?: string }
/** Nothing to show yet, and what to do. */
export function EmptyState({ testID, heading, text, actionLabel, onAction, icon = '○' }: EmptyStateProps) {
  return (
    <div className="bx-empty" data-testid={testID}>
      <span className="bx-empty-icon" aria-hidden="true">{icon}</span>
      <h3 className="bx-empty-title">{heading}</h3>
      {text ? <p className="bx-empty-text">{text}</p> : null}
      {actionLabel ? <button type="button" className="bx-btn bx-btn--outlined" onClick={onAction}>{actionLabel}</button> : null}
    </div>
  );
}

/** A short note on a term, on hover and focus; Escape hides it. */
export function Tooltip({ testID, label, text }: { testID?: string; label: string; text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="bx-tooltip" data-testid={testID} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span>{label}</span>
      <button type="button" className="bx-tip-button" aria-label={`About ${label}`} aria-describedby={id} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); } }}>i</button>
      <span className="bx-tip" role="tooltip" id={id} hidden={!open}>{text}</span>
    </span>
  );
}

/* ---------- Alert (oj-messages in the page) ---------- */

export type Severity = 'error' | 'warning' | 'confirmation' | 'info';
const ICON: Record<Severity, string> = { error: '!', warning: '!', confirmation: '✓', info: 'i' };

export interface AlertProps {
  testID?: string;
  heading?: string;
  message: string;
  severity?: Severity;
  actionLabel?: string;
  onAction?: () => void;
  /** Shows Dismiss; the alert hides and onClose tells the screen. */
  dismissible?: boolean;
  onClose?: () => void;
}

/** A message with its severity: errors are announced at once, the others politely. */
export function Alert({ testID, heading, message, severity = 'info', actionLabel, onAction, dismissible, onClose }: AlertProps) {
  const [gone, setGone] = useState(false);
  if (gone) { return null; }
  return (
    <div className={`bx-alert is-${severity}`} role={severity === 'error' ? 'alert' : 'status'} data-testid={testID}>
      <span className="bx-alert-icon" aria-hidden="true">{ICON[severity]}</span>
      <div className="bx-alert-text">{heading ? <strong>{heading}</strong> : null}<span>{message}</span></div>
      {actionLabel ? <button type="button" className="bx-alert-action" onClick={onAction}>{actionLabel}</button> : null}
      {dismissible
        ? <button type="button" className="bx-btn bx-btn--borderless bx-btn--icon bx-btn--sm" aria-label="Dismiss" onClick={() => { setGone(true); onClose?.(); }}><span aria-hidden="true">×</span></button>
        : null}
    </div>
  );
}
/** What went wrong and what to do (an error message). */
export function ErrorMessage(props: Omit<AlertProps, 'severity'>) { return <Alert {...props} severity="error" />; }
/** That it worked, and what next. */
export function SuccessMessage(props: Omit<AlertProps, 'severity'>) { return <Alert {...props} severity="confirmation" />; }

/* ---------- Rows: a list of items, each with what it is, when, a value and an action ---------- */

export interface RowItem { id?: string; title: string; meta?: string; value?: string; tone?: Tone; unread?: boolean; [key: string]: unknown }

export interface RowsProps {
  testID?: string;
  heading?: string;
  items: ReadonlyArray<RowItem>;
  /** The button on each row; its name says which row. */
  actionLabel?: string;
  onAction?: (item: RowItem) => void;
  emptyText?: string;
}

export function Rows({ testID, heading, items, actionLabel, onAction, emptyText = 'Nothing here yet.' }: RowsProps) {
  return (
    <section className="bx-panel" aria-label={heading || undefined} data-testid={testID}>
      {heading ? <h3 className="bx-panel-title">{heading}</h3> : null}
      {items.length === 0 ? <p className="bx-panel-empty">{emptyText}</p> : (
        <ul className="bx-rows">
          {items.map((o, i) => (
            <li key={o.id ?? i} className={'bx-row' + (o.tone ? ` is-${o.tone}` : '') + (o.unread ? ' is-unread' : '')}>
              <span className="bx-row-main"><strong>{o.title}</strong>{o.meta ? <span className="bx-row-meta">{o.meta}</span> : null}</span>
              {o.value ? <span className="bx-row-value">{o.value}</span> : null}
              {actionLabel
                ? <button type="button" className="bx-btn bx-btn--borderless bx-btn--sm" aria-label={`${actionLabel}: ${o.title}`} onClick={() => onAction?.(o)}>{actionLabel}</button>
                : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Alerts and notices for the customer, each with Read. */
export function NotificationPanel(props: Partial<RowsProps> & Pick<RowsProps, 'items'>) { return <Rows heading="Notifications" actionLabel="Read" {...props} />; }
