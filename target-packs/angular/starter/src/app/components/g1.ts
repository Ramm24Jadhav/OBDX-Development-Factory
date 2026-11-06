/*
 * Group 1 (the rest of the foundation, layout, data and feedback), the same markup and bx- classes as bx-g1.js in the
 * premium JET pack. The kinds here (rows, steps, timeline, alert, segments, chips, menu, accordion) are abstract bases
 * with a shared template; the later groups extend them with their own selector and defaults.
 */
import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, Directive, ElementRef, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';

import { Button } from './button';
import { nextId } from './field';

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
export interface ListItem extends Item { id: string; label: string; index: number }

export function toItems(items: ReadonlyArray<ItemLike> = []): ListItem[] {
  return items.map((o, index) => {
    if (typeof o !== 'object' || o === null) { return { id: String(o), label: String(o), index }; }
    const id = String(o.id ?? o.value ?? o.label ?? o.title ?? index);
    return { ...o, id, label: String(o.label ?? o.title ?? o.value ?? id), index };
  });
}

/** The value an item stands for: its value, else its id. */
export const valueOf = (o: ListItem): string => (o.value !== undefined ? String(o.value) : o.id);

/** The next index for arrow keys, Home and End in a list of n; -1 when the key is not one of them. */
export function arrow(key: string, at: number, n: number): number {
  if (!n) { return -1; }
  return key === 'ArrowRight' || key === 'ArrowDown' ? (at + 1) % n : key === 'ArrowLeft' || key === 'ArrowUp' ? (at - 1 + n) % n
    : key === 'Home' ? 0 : key === 'End' ? n - 1 : -1;
}

export function initials(name = ''): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';
}

/** What every component of the groups shares: a testID and the host element. */
@Directive()
export abstract class Part {
  readonly testID = input('');
  readonly id = nextId('bx');
  protected readonly host = inject(ElementRef<HTMLElement>);
  protected focusLater(selector: string): void {
    setTimeout(() => (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(selector)?.focus(), 0);
  }
}

/* ---------- SecondaryButton ---------- */

/** A second, quieter action (oj-button chroming outlined). */
@Component({
  selector: 'bx-secondary-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  template: `<bx-button [label]="label()" chroming="outlined" [disabled]="disabled()" [busy]="busy()" [testID]="testID()" (action)="action.emit($event)" />`,
})
export class SecondaryButton {
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly busy = input(false);
  readonly testID = input('');
  readonly action = output<MouseEvent>();
}

/* ---------- Slider ---------- */

export const SLIDER = `
  <div class="bx-field bx-slider" [attr.data-testid]="testID() || null">
    <div class="bx-slider-head">
      <label class="bx-label" [attr.for]="id">{{ name() }}</label>
      <output class="bx-slider-value" [attr.for]="id">{{ shown() }}</output>
    </div>
    <input type="range" class="bx-range-input" [id]="id" [min]="min()" [max]="top()" [step]="by()" [value]="value()" [disabled]="disabled()"
           [attr.aria-valuetext]="shown()" [attr.aria-describedby]="helpText() ? id + '-help' : null" (input)="value.set(+$any($event.target).value)" />
    <div class="bx-slider-scale" aria-hidden="true"><span>{{ ends().min }}</span><span>{{ ends().max }}</span></div>
    @if (helpText()) { <span class="bx-help" [id]="id + '-help'">{{ helpText() }}</span> }
  </div>`;

@Directive()
export abstract class SliderBase extends Part {
  /** Leave out for the component's own label, max and step. */
  readonly label = input<string | undefined>(undefined);
  protected readonly defaults: { label?: string; max?: number; step?: number } = {};
  protected readonly name = computed(() => this.label() ?? this.defaults.label ?? '');
  protected readonly top = computed(() => this.max() ?? this.defaults.max ?? 100);
  protected readonly by = computed(() => this.step() ?? this.defaults.step ?? 1);
  readonly value = model(0);
  readonly min = input(0);
  readonly max = input<number | undefined>(undefined);
  readonly step = input<number | undefined>(undefined);
  /** Shown before the value, for example the currency code. */
  readonly prefix = input('');
  readonly decimals = input(0);
  readonly disabled = input(false);
  readonly helpText = input('');
  private readonly p = computed(() => (this.prefix() ? `${this.prefix()} ` : ''));
  protected readonly shown = computed(() => this.p() + Number(this.value() || 0).toLocaleString(undefined, { maximumFractionDigits: this.decimals() }));
  protected readonly ends = computed(() => ({ min: this.p() + this.min().toLocaleString(), max: this.p() + this.top().toLocaleString() }));
}

/** An amount or a count on a range, the value shown beside the label. */
@Component({ selector: 'bx-savings-slider', changeDetection: ChangeDetectionStrategy.OnPush, template: SLIDER })
export class Slider extends SliderBase { protected override readonly defaults = { max: 20000, step: 500 }; }

/* ---------- ToggleGroup (segmented) ---------- */

export const SEGMENTS = `
  <div class="bx-field bx-segmented-field" [attr.data-testid]="testID() || null">
    <span class="bx-label" [id]="id + '-label'">{{ name() }}</span>
    <div class="bx-segmented" role="radiogroup" [attr.aria-labelledby]="id + '-label'" (keydown)="key($event)">
      @for (o of rows(); track o.id) {
        <button type="button" role="radio" [class]="o.css" [attr.aria-checked]="o.on" [attr.tabindex]="o.tab" [disabled]="o.off" (click)="pick(o)">{{ o.label }}</button>
      }
    </div>
  </div>`;

@Directive()
export abstract class SegmentsBase extends Part {
  /** Leave out for the component's own label and options. */
  readonly label = input<string | undefined>(undefined);
  readonly options = input<ReadonlyArray<ItemLike> | undefined>(undefined);
  protected readonly defaults: { label?: string; options?: ReadonlyArray<ItemLike> } = {};
  protected readonly name = computed(() => this.label() ?? this.defaults.label ?? '');
  protected readonly choices = computed(() => this.options() ?? this.defaults.options ?? []);
  readonly value = model('');
  readonly disabled = input(false);
  protected readonly rows = computed(() => {
    const list = toItems(this.choices());
    const picked = list.some((o) => valueOf(o) === this.value());
    return list.map((o, i) => {
      const on = valueOf(o) === this.value();
      return { ...o, on, off: !!o.disabled || this.disabled(), tab: on || (!picked && i === 0) ? 0 : -1, css: 'bx-segment' + (on ? ' is-on' : '') };
    });
  });
  protected pick(o: ListItem): void { if (!o.disabled && !this.disabled()) { this.value.set(valueOf(o)); } }
  protected key(e: KeyboardEvent): void {
    const live = toItems(this.choices()).filter((o) => !o.disabled);
    const next = arrow(e.key, Math.max(0, live.findIndex((o) => valueOf(o) === this.value())), live.length);
    if (next < 0 || this.disabled()) { return; }
    e.preventDefault();
    this.value.set(valueOf(live[next]));
    this.focusLater('.bx-segment.is-on');
  }
}

/** One of a few options (oj-buttonset-one), as radios that look like a segmented control; arrow keys move. */
@Component({ selector: 'bx-segmented', changeDetection: ChangeDetectionStrategy.OnPush, template: SEGMENTS })
export class ToggleGroup extends SegmentsBase {}

/* ---------- chips (filters that turn on and off) ---------- */

export const CHIPS = `
  <div class="bx-filter" role="group" [attr.aria-labelledby]="id + '-label'" [attr.data-testid]="testID() || null">
    <span class="bx-label" [id]="id + '-label'">{{ legend() }}</span>
    <div class="bx-chip-row">
      @for (o of rows(); track o.id) {
        <button type="button" [class]="o.css" [attr.aria-pressed]="o.on" [disabled]="!!o.disabled" (click)="toggle(o)">{{ o.label }}</button>
      }
    </div>
  </div>`;

@Directive()
export abstract class ChipsBase extends Part {
  /** Names the group; leave out for the component's own. */
  readonly label = input<string | undefined>(undefined);
  protected readonly defaultLabel: string = 'Filter';
  protected readonly legend = computed(() => this.label() ?? this.defaultLabel);
  readonly options = input<ReadonlyArray<ItemLike>>([]);
  readonly value = model<string[]>([]);
  /** Several at once (the default), or one. */
  readonly multiple = input(true);
  protected readonly rows = computed(() => toItems(this.options()).map((o) => {
    const on = this.value().includes(valueOf(o));
    return { ...o, on, css: 'bx-filter-chip' + (on ? ' is-on' : '') };
  }));
  protected toggle(o: ListItem): void {
    const v = valueOf(o);
    const now = this.value();
    this.value.set(now.includes(v) ? now.filter((x) => x !== v) : this.multiple() ? [...now, v] : [v]);
  }
}

/* ---------- ActionMenu ---------- */

export interface MenuItem extends Item { danger?: boolean }

/** A button that opens a list of actions (oj-menu-button); arrows move, Escape closes and gives focus back. */
@Component({
  selector: 'bx-action-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bx-menu" [attr.data-testid]="testID() || null">
      <button type="button" class="bx-btn bx-btn--outlined bx-menu-button" aria-haspopup="menu" [attr.aria-expanded]="open()" [attr.aria-controls]="id"
              [disabled]="disabled()" (click)="toggle()" (keydown.arrowdown)="$event.preventDefault(); show()">
        <span class="bx-btn-label">{{ label() }}</span><span class="bx-menu-caret" aria-hidden="true"></span>
      </button>
      @if (open()) {
        <ul class="bx-menu-list" role="menu" [id]="id" [attr.aria-label]="label()" (keydown)="key($event)">
          @for (o of rows(); track o.id) {
            <li role="menuitem" tabindex="-1" [class]="o.css" [attr.aria-disabled]="o.disabled ? true : null" (click)="pick(o)"
                (keydown.enter)="pick(o)" (keydown.space)="$event.preventDefault(); pick(o)">{{ o.label }}</li>
          }
        </ul>
      }
    </div>`,
})
export class ActionMenu extends Part {
  /** The button's text. */
  readonly label = input('More');
  readonly items = input<ReadonlyArray<string | MenuItem>>([]);
  readonly disabled = input(false);
  readonly action = output<string>();
  protected readonly open = signal(false);
  protected readonly rows = computed(() => toItems(this.items()).map((o) => ({ ...o, css: 'bx-menu-item' + ((o as MenuItem).danger ? ' is-danger' : '') })));
  private live(): HTMLElement[] {
    return Array.from((this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.bx-menu-item:not([aria-disabled="true"])'));
  }
  protected show(): void { this.open.set(true); setTimeout(() => this.live()[0]?.focus(), 0); }
  protected toggle(): void { if (this.open()) { this.open.set(false); } else { this.show(); } }
  private close(refocus: boolean): void { this.open.set(false); if (refocus) { this.focusLater('.bx-menu-button'); } }
  protected pick(o: ListItem): void { if (!o.disabled) { this.close(true); this.action.emit(valueOf(o)); } }
  protected key(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Tab') { this.close(e.key === 'Escape'); return; }
    const l = this.live();
    const next = arrow(e.key, l.indexOf(document.activeElement as HTMLElement), l.length);
    if (next >= 0) { e.preventDefault(); l[next].focus(); }
  }
}

/* ---------- accordion ---------- */

export interface PanelItem { id?: string; title: string; body?: string }

export const ACCORDION = `
  <div class="bx-accordion" [attr.data-testid]="testID() || null">
    @for (o of rows(); track o.key) {
      <div [class]="o.on ? 'bx-acc-item is-open' : 'bx-acc-item'">
        <h3 class="bx-acc-head">
          <button type="button" class="bx-acc-button" [id]="o.head" [attr.aria-expanded]="o.on" [attr.aria-controls]="o.panel" (click)="toggle(o.key)">
            <span>{{ o.title }}</span><span class="bx-acc-icon" aria-hidden="true"></span>
          </button>
        </h3>
        @if (o.on) { <div class="bx-acc-panel" role="region" [id]="o.panel" [attr.aria-labelledby]="o.head">{{ o.body }}</div> }
      </div>
    }
  </div>`;

@Directive()
export abstract class AccordionBase extends Part {
  readonly items = input<ReadonlyArray<PanelItem>>([]);
  /** The open sections' ids (or titles): [(expanded)]. */
  readonly expanded = model<string[]>([]);
  /** Several sections open at once. */
  readonly multiple = input(false);
  protected readonly rows = computed(() => this.items().map((o, i) => {
    const key = o.id ?? o.title;
    return { key, title: o.title, body: o.body ?? '', on: this.expanded().includes(key), head: `${this.id}-${i}-h`, panel: `${this.id}-${i}-p` };
  }));
  protected toggle(key: string): void {
    const open = this.expanded();
    this.expanded.set(open.includes(key) ? open.filter((x) => x !== key) : this.multiple() ? [...open, key] : [key]);
  }
}

/* ---------- Stepper (oj-train) ---------- */

export type StepState = 'done' | 'current' | 'next' | 'failed';
export interface StepItem extends Item { state?: StepState }

export const STEPS = `
  <ol class="bx-steps" [attr.aria-label]="name()" [attr.data-testid]="testID() || null">
    @for (s of rows(); track s.id) {
      <li [class]="'bx-step-item is-' + s.state" [attr.aria-current]="s.state === 'current' ? 'step' : null">
        <span class="bx-step-mark" aria-hidden="true">{{ s.mark }}</span>
        <span class="bx-step-label">{{ s.label }}</span>
        <span class="bx-visually-hidden">{{ s.status }}</span>
      </li>
    }
  </ol>`;

@Directive()
export abstract class StepsBase extends Part {
  /** Names the list of steps; leave out for the component's own. */
  readonly label = input<string | undefined>(undefined);
  protected readonly defaultLabel: string = 'Progress';
  protected readonly name = computed(() => this.label() ?? this.defaultLabel);
  readonly steps = input<ReadonlyArray<string | StepItem>>([]);
  /** The current step's id; the ones before it are done. */
  readonly selectedStep = input('');
  protected readonly rows = computed(() => {
    const list = toItems(this.steps());
    const at = list.findIndex((s) => s.id === this.selectedStep());
    return list.map((s, i) => {
      const state: StepState = (s as StepItem).state ?? (i < at ? 'done' : i === at ? 'current' : 'next');
      return { ...s, state, mark: state === 'done' ? '✓' : state === 'failed' ? '!' : String(i + 1),
        status: state === 'done' ? 'done' : state === 'current' ? 'current step' : state === 'failed' ? 'failed' : 'not started' };
    });
  });
}

/** Done, current and next steps of a journey. */
@Component({ selector: 'bx-stepper', changeDetection: ChangeDetectionStrategy.OnPush, template: STEPS })
export class Stepper extends StepsBase {}

/* ---------- Breadcrumb and SideNav ---------- */

/** Where the page sits; the earlier pages are links, the last one is the page. */
@Component({
  selector: 'bx-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="bx-crumbs" [attr.aria-label]="label()" [attr.data-testid]="testID() || null">
      <ol>
        @for (o of rows(); track o.id; let last = $last) {
          <li>
            @if (!last) {
              <button type="button" class="bx-crumb" (click)="go(o)">{{ o.label }}</button><span class="bx-crumb-sep" aria-hidden="true">/</span>
            } @else {
              <span class="bx-crumb is-here" aria-current="page">{{ o.label }}</span>
            }
          </li>
        }
      </ol>
    </nav>`,
})
export class Breadcrumb extends Part {
  readonly label = input('Breadcrumb');
  readonly items = input<ReadonlyArray<ItemLike>>([]);
  readonly action = output<string>();
  protected readonly rows = computed(() => toItems(this.items()));
  protected go(o: ListItem): void { this.action.emit(valueOf(o)); }
}

export interface NavItem extends Item { badge?: string | number }

/** The sections of the app (oj-navigation-list); the chosen one is the current page. [(selection)]. */
@Component({
  selector: 'bx-side-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="bx-nav" [attr.aria-label]="label()" [attr.data-testid]="testID() || null">
      <ul>
        @for (o of rows(); track o.id) {
          <li>
            <button type="button" [class]="o.on ? 'bx-nav-item is-on' : 'bx-nav-item'" [attr.aria-current]="o.on ? 'page' : null" [disabled]="!!o.disabled" (click)="pick(o)">
              <span>{{ o.label }}</span>@if (o.badge !== undefined) {<span class="bx-nav-badge">{{ o.badge }}</span>}
            </button>
          </li>
        }
      </ul>
    </nav>`,
})
export class SideNav extends Part {
  readonly label = input('Main');
  readonly items = input<ReadonlyArray<string | NavItem>>([]);
  readonly selection = model('');
  protected readonly rows = computed(() => toItems(this.items()).map((o) => ({ ...o, badge: (o as NavItem).badge, on: valueOf(o) === this.selection() })));
  protected pick(o: ListItem): void { this.selection.set(valueOf(o)); }
}

/* ---------- Sheet (oj-popup) ---------- */

/** A panel from the side or the bottom: the CDK focus trap keeps focus inside; Escape and the backdrop close it. [(open)]. */
@Component({
  selector: 'bx-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule],
  template: `
    @if (open()) {
      <div class="bx-dialog-backdrop" (click)="close()"></div>
      <div [class]="'bx-sheet is-' + position()" role="dialog" aria-modal="true" tabindex="-1" [attr.aria-labelledby]="id + '-title'" [attr.data-testid]="testID() || null"
           cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (keydown.escape)="close()">
        <div class="bx-dialog-header">
          <h2 class="bx-dialog-title" [id]="id + '-title'">{{ heading() }}</h2>
          <button type="button" class="bx-btn bx-btn--borderless bx-btn--icon" aria-label="Close" (click)="close()"><span aria-hidden="true">×</span></button>
        </div>
        <div class="bx-dialog-body"><ng-content /></div>
        <div class="bx-dialog-footer"><ng-content select="[footer]" /></div>
      </div>
    }`,
})
export class Sheet extends Part {
  readonly open = model(false);
  readonly heading = input.required<string>();
  /** From the side (end) or the bottom. */
  readonly position = input<'end' | 'bottom'>('end');
  private opener: HTMLElement | null = null;

  constructor() {
    super();
    effect(() => {
      const open = this.open();
      untracked(() => {
        if (open) {
          this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setTimeout(() => {
            const box = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('.bx-sheet');
            if (box && !box.contains(document.activeElement)) { box.focus(); }
          }, 0);
        } else if (this.opener) {
          const back = this.opener;
          this.opener = null;
          queueMicrotask(() => { if (back.isConnected) { back.focus(); } });
        }
      });
    });
  }

  close(): void { this.open.set(false); }
}

/* ---------- layout: Grid and Divider ---------- */

/** A responsive layout of columns (fewer on narrow screens). */
@Component({
  selector: 'bx-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class]="'bx-layout-grid is-cols-' + columns() + ' is-gap-' + gap()" [attr.data-testid]="testID() || null"><ng-content /></div>`,
})
export class Grid extends Part {
  readonly columns = input<1 | 2 | 3 | 4 | 'auto'>('auto');
  readonly gap = input<'sm' | 'md' | 'lg'>('md');
}

/** A line between parts, with an optional label. */
@Component({
  selector: 'bx-divider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (label()) {
      <div class="bx-divider has-label" role="separator" [attr.aria-label]="label()" [attr.data-testid]="testID() || null"><span aria-hidden="true">{{ label() }}</span></div>
    } @else {
      <hr class="bx-divider" [attr.data-testid]="testID() || null" />
    }`,
})
export class Divider extends Part {
  readonly label = input('');
}

/* ---------- Pagination (oj-paging-control) ---------- */

/** The pages to show: the first, the last and the ones around this page; 0 is a gap. */
export function pagesAround(page: number, count: number): number[] {
  const out: number[] = [];
  for (let p = 1; p <= count; p++) {
    if (p === 1 || p === count || Math.abs(p - page) <= 1) { out.push(p); } else if (out[out.length - 1] !== 0) { out.push(0); }
  }
  return out;
}

/** Previous, the pages around this one, next. [(page)]. */
@Component({
  selector: 'bx-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="bx-pages" [attr.aria-label]="label()" [attr.data-testid]="testID() || null">
      <button type="button" class="bx-page" aria-label="Previous page" [disabled]="page() <= 1" (click)="go(page() - 1)">‹</button>
      @for (p of pages(); track $index) {
        @if (p === 0) {
          <span class="bx-page-gap" aria-hidden="true">…</span>
        } @else {
          <button type="button" [class]="p === page() ? 'bx-page is-on' : 'bx-page'" [attr.aria-label]="'Page ' + p" [attr.aria-current]="p === page() ? 'page' : null"
                  (click)="go(p)">{{ p }}</button>
        }
      }
      <button type="button" class="bx-page" aria-label="Next page" [disabled]="page() >= count()" (click)="go(page() + 1)">›</button>
    </nav>`,
})
export class Pagination extends Part {
  readonly label = input('Pages');
  readonly page = model(1);
  readonly pageCount = input(1);
  protected readonly count = computed(() => Math.max(1, this.pageCount()));
  protected readonly pages = computed(() => pagesAround(this.page(), this.count()));
  protected go(p: number): void { const n = Math.min(this.count(), Math.max(1, p)); if (n !== this.page()) { this.page.set(n); } }
}

/* ---------- data: StatusBadge, Timeline, Spinner, EmptyState, Tooltip ---------- */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** A status in a word. */
@Component({
  selector: 'bx-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'bx-badge is-' + tone()" [attr.data-testid]="testID() || null"><span class="bx-badge-dot" aria-hidden="true"></span>{{ label() }}</span>`,
})
export class StatusBadge extends Part {
  readonly label = input.required<string>();
  readonly tone = input<Tone>('neutral');
}

export interface TimelineItem { id?: string; label: string; meta?: string; state?: 'done' | 'current' | 'pending' | 'failed' }

export const TIMELINE = `
  <ol class="bx-timeline" [attr.aria-label]="name()" [attr.data-testid]="testID() || null">
    @for (o of rows(); track $index) {
      <li [class]="'bx-tl-item is-' + o.state" [attr.aria-current]="o.state === 'current' ? 'step' : null">
        <span class="bx-tl-dot" aria-hidden="true"></span>
        <span class="bx-tl-text"><strong>{{ o.label }}</strong>@if (o.meta) {<span class="bx-tl-meta">{{ o.meta }}</span>}
          @if (o.status) {<span class="bx-tl-status">{{ o.status }}</span>}</span>
      </li>
    }
  </ol>`;

@Directive()
export abstract class TimelineBase extends Part {
  readonly label = input<string | undefined>(undefined);
  protected readonly defaultLabel: string = 'Timeline';
  protected readonly name = computed(() => this.label() ?? this.defaultLabel);
  readonly items = input<ReadonlyArray<TimelineItem>>([]);
  protected readonly rows = computed(() => this.items().map((o) => {
    const state = o.state ?? 'done';
    return { ...o, state, status: state === 'done' ? '' : state === 'current' ? 'In progress' : state === 'failed' ? 'Failed' : 'Not yet' };
  }));
}

/** Events in order, with who and when. */
@Component({ selector: 'bx-timeline', changeDetection: ChangeDetectionStrategy.OnPush, template: TIMELINE })
export class Timeline extends TimelineBase {}

/** Waiting: a turning circle, said to screen readers once. */
@Component({
  selector: 'bx-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="bx-spinner-wrap" role="status" [attr.data-testid]="testID() || null"><span [class]="'bx-spinner is-' + size()" aria-hidden="true"></span><span class="bx-visually-hidden">{{ label() }}</span></span>`,
})
export class Spinner extends Part {
  readonly label = input('Loading');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
}

/** Nothing to show yet, and what to do. */
@Component({
  selector: 'bx-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bx-empty" [attr.data-testid]="testID() || null">
      <span class="bx-empty-icon" aria-hidden="true">{{ icon() }}</span>
      <h3 class="bx-empty-title">{{ heading() }}</h3>
      @if (text()) { <p class="bx-empty-text">{{ text() }}</p> }
      @if (actionLabel()) { <button type="button" class="bx-btn bx-btn--outlined" (click)="action.emit()">{{ actionLabel() }}</button> }
    </div>`,
})
export class EmptyState extends Part {
  readonly heading = input.required<string>();
  readonly text = input('');
  readonly actionLabel = input('');
  readonly icon = input('○');
  readonly action = output<void>();
}

/** A short note on a term, on hover and focus; Escape hides it. */
@Component({
  selector: 'bx-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="bx-tooltip" [attr.data-testid]="testID() || null" (mouseenter)="open.set(true)" (mouseleave)="open.set(false)">
      <span>{{ label() }}</span>
      <button type="button" class="bx-tip-button" [attr.aria-label]="'About ' + label()" [attr.aria-describedby]="id" (focus)="open.set(true)" (blur)="open.set(false)"
              (keydown.escape)="open.set(false)">i</button>
      <span class="bx-tip" role="tooltip" [id]="id" [hidden]="!open()">{{ text() }}</span>
    </span>`,
})
export class Tooltip extends Part {
  readonly label = input.required<string>();
  readonly text = input.required<string>();
  protected readonly open = signal(false);
}

/* ---------- alert (oj-messages in the page) ---------- */

export type Severity = 'error' | 'warning' | 'confirmation' | 'info';
const ICON: Record<Severity, string> = { error: '!', warning: '!', confirmation: '✓', info: 'i' };

export const ALERT = `
  @if (!gone()) {
    <div [class]="'bx-alert is-' + sev()" [attr.role]="sev() === 'error' ? 'alert' : 'status'" [attr.data-testid]="testID() || null">
      <span class="bx-alert-icon" aria-hidden="true">{{ icon() }}</span>
      <div class="bx-alert-text">@if (heading()) {<strong>{{ heading() }}</strong>}<span>{{ message() }}</span></div>
      @if (actionLabel()) { <button type="button" class="bx-alert-action" (click)="action.emit()">{{ actionLabel() }}</button> }
      @if (dismissible()) {
        <button type="button" class="bx-btn bx-btn--borderless bx-btn--icon bx-btn--sm" aria-label="Dismiss" (click)="dismiss()"><span aria-hidden="true">×</span></button>
      }
    </div>
  }`;

@Directive()
export abstract class AlertBase extends Part {
  readonly heading = input('');
  readonly message = input.required<string>();
  /** Leave out for the component's own severity. */
  readonly severity = input<Severity | ''>('');
  readonly actionLabel = input('');
  /** Shows Dismiss; the alert hides and (closed) tells the screen. */
  readonly dismissible = input(false);
  readonly action = output<void>();
  readonly closed = output<void>();
  protected readonly defaultSeverity: Severity = 'info';
  protected readonly gone = signal(false);
  protected readonly sev = computed<Severity>(() => this.severity() || this.defaultSeverity);
  protected readonly icon = computed(() => ICON[this.sev()]);
  protected dismiss(): void { this.gone.set(true); this.closed.emit(); }
}

/** A message with its severity: errors are announced at once, the others politely. */
@Component({ selector: 'bx-alert-banner', changeDetection: ChangeDetectionStrategy.OnPush, template: ALERT })
export class Alert extends AlertBase {}
/** What went wrong and what to do. */
@Component({ selector: 'bx-error-message', changeDetection: ChangeDetectionStrategy.OnPush, template: ALERT })
export class ErrorMessage extends AlertBase { protected override readonly defaultSeverity: Severity = 'error'; }
/** That it worked, and what next. */
@Component({ selector: 'bx-success-message', changeDetection: ChangeDetectionStrategy.OnPush, template: ALERT })
export class SuccessMessage extends AlertBase { protected override readonly defaultSeverity: Severity = 'confirmation'; }

/* ---------- rows: a list of items, each with what it is, when, a value and an action ---------- */

export interface RowItem { id?: string; title: string; meta?: string; value?: string; tone?: Tone; unread?: boolean; [key: string]: unknown }

export const ROWS = `
  <section class="bx-panel" [attr.aria-label]="head() || null" [attr.data-testid]="testID() || null">
    @if (head()) { <h3 class="bx-panel-title">{{ head() }}</h3> }
    @if (items().length === 0) {
      <p class="bx-panel-empty">{{ emptyText() }}</p>
    } @else {
      <ul class="bx-rows">
        @for (o of items(); track $index) {
          <li [class]="rowClass(o)">
            <span class="bx-row-main"><strong>{{ o.title }}</strong>@if (o.meta) {<span class="bx-row-meta">{{ o.meta }}</span>}</span>
            @if (o.value) { <span class="bx-row-value">{{ o.value }}</span> }
            @if (act()) {
              <button type="button" class="bx-btn bx-btn--borderless bx-btn--sm" [attr.aria-label]="act() + ': ' + o.title" (click)="action.emit(o)">{{ act() }}</button>
            }
          </li>
        }
      </ul>
    }
  </section>`;

@Directive()
export abstract class RowsBase extends Part {
  /** Leave out for the component's own heading. */
  readonly heading = input<string | undefined>(undefined);
  readonly items = input<ReadonlyArray<RowItem>>([]);
  /** The button on each row (its name says which row); leave out for the component's own. */
  readonly actionLabel = input<string | undefined>(undefined);
  readonly emptyText = input('Nothing here yet.');
  readonly action = output<RowItem>();
  protected readonly defaults: { heading?: string; actionLabel?: string } = {};
  protected readonly head = computed(() => this.heading() ?? this.defaults.heading ?? '');
  protected readonly act = computed(() => this.actionLabel() ?? this.defaults.actionLabel ?? '');
  protected rowClass(o: RowItem): string { return 'bx-row' + (o.tone ? ` is-${o.tone}` : '') + (o.unread ? ' is-unread' : ''); }
}

/** Alerts and notices for the customer, each with Read. */
@Component({ selector: 'bx-notification-panel', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class NotificationPanel extends RowsBase { protected override readonly defaults = { heading: 'Notifications', actionLabel: 'Read' }; }

/** Group 1's components, for a screen's imports. */
export const G1_COMPONENTS = [SecondaryButton, Slider, ToggleGroup, ActionMenu, Stepper, Breadcrumb, SideNav, Sheet, Grid, Divider, Pagination, StatusBadge, Timeline,
  Spinner, EmptyState, Tooltip, Alert, ErrorMessage, SuccessMessage, NotificationPanel] as const;
