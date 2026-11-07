/*
 * Group 7: text effects, motion, showcase, backdrops and micro interactions, our own components written clean-room (no
 * code taken, ported or translated from any effects library), the same markup and bx- classes as bx-g7.js in the
 * premium JET pack. Every effect is CSS, the Web Animations API or a few timers; text that moves is also there whole
 * for screen readers; under reduced motion each shows its end state at once.
 */
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Directive, afterNextRender, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';

import { FeedbackRating } from './g5';
import { ActionMenu, MenuItem, NavItem, Part, SEGMENTS, SLIDER, SegmentsBase, SideNav, SliderBase, Tooltip, arrow, initials } from './g1';
import { CHOICE, ChoiceBase, Detail, TransactionReceipt, money } from './g2';
import { OtpInput, SETTING, SettingBase, masked } from './g3';
import { QuickItem, QuickLinksWidget } from './g6';
import { reducedMotion } from './motion';
import { BoardVariant, PromptVariant, ReceiptVariant, SensitiveVariant, withVariant } from './variant';

/** A stagger step class (bx-d-0 to bx-d-19), so delays need no inline style. */
export const stagger = (i: number): string => `bx-d-${Math.min(i, 19)}`;
const chars = (text: string) => (text || '').split('').map((c, i) => ({ ch: c === ' ' ? ' ' : c, css: `bx-ch ${stagger(i)}` }));
const words = (text: string) => (text || '').split(/\s+/).filter(Boolean);

/** What the effects share: a timer loop that stops with the component and under reduced motion. */
@Directive()
export abstract class Fx extends Part {
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor() { super(); inject(DestroyRef).onDestroy(() => this.stop()); }
  /** Calls fn every ms while it returns true; nothing under reduced motion. */
  protected every(ms: number, fn: () => boolean): void {
    this.stop();
    if (reducedMotion()) { return; }
    const run = () => { this.timer = setTimeout(() => { this.timer = null; if (fn()) { run(); } }, ms); };
    run();
  }
  protected stop(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  /** Sets CSS variables from where the pointer is over the element (0 to 1 across and down). */
  protected pointer(e: PointerEvent, set: (s: CSSStyleDeclaration, x: number, y: number) => void): void {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    set(el.style, r.width ? (e.clientX - r.left) / r.width : 0.5, r.height ? (e.clientY - r.top) / r.height : 0.5);
  }
}

const OnPush = ChangeDetectionStrategy.OnPush;

/* ---------- text effects ---------- */

/** A number whose digits roll to their place when it changes. */
@Component({
  selector: 'bx-rolling-digits', changeDetection: OnPush,
  template: `<span class="bx-rolling" [attr.data-testid]="testID() || null"><span class="bx-visually-hidden">{{ text() }}</span><span class="bx-rolling-face" aria-hidden="true">
    @for (c of cols(); track $index) {
      @if (c.digit) { <span class="bx-roll-col"><span [class]="'bx-roll-strip is-d-' + c.ch">@for (n of digits; track n) {<span>{{ n }}</span>}</span></span> } @else { <span class="bx-roll-sep">{{ c.ch }}</span> }
    }</span></span>`,
})
export class RollingDigits extends Part {
  readonly value = input<number | string>(0);
  readonly currency = input('');
  protected readonly digits = '0123456789'.split('');
  protected readonly text = computed(() => money(this.value(), this.currency() || undefined));
  protected readonly cols = computed(() => this.text().split('').map((ch) => ({ ch, digit: ch >= '0' && ch <= '9' })));
}

/** Counts up to a figure; screen readers hear the figure once. */
@Component({
  selector: 'bx-count-up', changeDetection: OnPush,
  template: `<span class="bx-count-up" [attr.data-testid]="testID() || null"><span class="bx-visually-hidden">{{ fmt(value()) }}</span><span aria-hidden="true">{{ fmt(now()) }}</span></span>`,
})
export class CountUp extends Fx {
  readonly value = input(0);
  readonly from = input(0);
  readonly duration = input(1200);
  readonly currency = input('');
  readonly prefix = input('');
  readonly suffix = input('');
  protected readonly now = signal(0);
  constructor() {
    super();
    effect(() => {
      const target = this.value();
      const from = this.from();
      untracked(() => {
        if (reducedMotion()) { this.now.set(target); return; }
        this.now.set(from);
        let step = 0;
        this.every(Math.max(10, Math.round(this.duration() / 30)), () => {
          step += 1;
          const p = step / 30;
          this.now.set(p >= 1 ? target : from + (target - from) * (1 - (1 - p) ** 3));
          return p < 1;
        });
      });
    });
  }
  protected fmt(n: number): string { return this.prefix() + (money(Math.round(n * 100) / 100, this.currency() || undefined) || String(n)) + this.suffix(); }
}

export interface FlapRow { label: string; value: string }
/** Rates on flip tiles, each row read as a whole. */
@Component({
  selector: 'bx-split-flap-board', changeDetection: OnPush,
  template: `<section [class]="css()" [attr.aria-label]="heading() || null" [attr.data-testid]="testID() || null">
    @if (heading()) { <h3 class="bx-panel-title">{{ heading() }}</h3> }
    <ul class="bx-flap-rows">@for (r of rows(); track r.label) {
      <li class="bx-flap-row"><span class="bx-visually-hidden">{{ r.label }} {{ r.value }}</span><span class="bx-flap-label" aria-hidden="true">{{ r.label }}</span>
        <span class="bx-flap-tiles" aria-hidden="true">@for (t of r.tiles; track $index) {<span [class]="t.css + ' bx-flap-tile'">{{ t.ch }}</span>}</span></li>
    }</ul></section>`,
})
export class SplitFlapBoard extends Part {
  readonly heading = input('Exchange rates');
  readonly items = input<ReadonlyArray<FlapRow>>([]);
  readonly variant = input<BoardVariant | undefined>(undefined);
  protected readonly css = computed(() => withVariant('bx-panel bx-flap', this.variant()));
  protected readonly rows = computed(() => this.items().map((o) => ({ ...o, tiles: chars(o.value) })));
}

/** An account number masked to its last four digits; Show reveals it digit by digit. */
@Component({
  selector: 'bx-reveal-digits', changeDetection: OnPush,
  template: `<div [class]="css()" [attr.data-testid]="testID() || null"><span class="bx-label" [id]="id">{{ label() }}</span>
    <div class="bx-control is-readonly" role="group" [attr.aria-labelledby]="id"><span class="bx-input bx-mono bx-sensitive-value"><span class="bx-visually-hidden">{{ text() }}</span>
      <span aria-hidden="true">@for (t of tiles(); track $index) {<span [class]="t.css">{{ t.ch }}</span>}</span></span>
      <button type="button" class="bx-reveal" [attr.aria-pressed]="shown()" [attr.aria-label]="(shown() ? 'Hide ' : 'Show ') + label()" (click)="shown.set(!shown())">{{ shown() ? 'Hide' : 'Show' }}</button></div></div>`,
})
export class RevealDigits extends Part {
  readonly label = input('Account number');
  readonly value = input('');
  readonly variant = input<SensitiveVariant | undefined>(undefined);
  protected readonly css = computed(() => withVariant('bx-field bx-reveal-digits', this.variant()));
  protected readonly shown = signal(false);
  protected readonly text = computed(() => (this.shown() ? this.value() : masked(this.value())));
  protected readonly tiles = computed(() => chars(this.text()));
}

/** Words that come into focus one after another. */
@Component({
  selector: 'bx-blur-in-text', changeDetection: OnPush,
  template: `<p class="bx-fx-text bx-blur-in" [attr.data-testid]="testID() || null"><span class="bx-visually-hidden">{{ text() }}</span><span aria-hidden="true">@for (w of words(); track $index) {<span [class]="'bx-word ' + step($index)">{{ w }} </span>}</span></p>`,
})
export class BlurInText extends Part {
  readonly text = input('');
  protected readonly words = computed(() => words(this.text()));
  protected step(i: number): string { return stagger(i); }
}

@Directive()
abstract class StyledText extends Part {
  readonly text = input('');
  readonly animated = input<boolean | undefined>(undefined);
  protected readonly look: string = '';
  protected readonly defaultAnimated: boolean = true;
  protected readonly css = computed(() => `bx-fx-text ${this.look}` + ((this.animated() ?? this.defaultAnimated) ? ' is-animated' : ''));
}
const STYLED = `<span [class]="css()" [attr.data-testid]="testID() || null">{{ text() }}</span>`;
/** Text that a sliding edge uncovers. */
@Component({ selector: 'bx-text-reveal', changeDetection: OnPush, template: STYLED })
export class TextReveal extends StyledText { protected override readonly look = 'bx-text-reveal'; }
/** Text with a light that runs across it. */
@Component({ selector: 'bx-shimmer-text', changeDetection: OnPush, template: STYLED })
export class ShimmerText extends StyledText { protected override readonly look = 'bx-shimmer-text'; }
/** Text in the brand gradient, still or moving. */
@Component({ selector: 'bx-gradient-text', changeDetection: OnPush, template: STYLED })
export class GradientText extends StyledText { protected override readonly look = 'bx-gradient-text'; protected override readonly defaultAnimated = false; }

/** One word after another after a fixed start; screen readers hear all the words once. */
@Component({
  selector: 'bx-rotating-text', changeDetection: OnPush,
  template: `<span class="bx-fx-text bx-rotating" [attr.data-testid]="testID() || null"><span class="bx-visually-hidden">{{ all() }}</span><span aria-hidden="true">@if (prefix()) {<span>{{ prefix() }} </span>}
    @for (w of shown(); track w.at) {<span class="bx-rotating-word">{{ w.word }}</span>}</span></span>`,
})
export class RotatingText extends Fx {
  readonly prefix = input('');
  readonly words = input<ReadonlyArray<string>>([]);
  readonly interval = input(2200);
  protected readonly at = signal(0);
  protected readonly shown = computed(() => { const w = this.words(); return [{ word: w.length ? w[this.at() % w.length] : '', at: this.at() }]; });
  protected readonly all = computed(() => { const w = this.words(); return (this.prefix() ? `${this.prefix()} ` : '') + (w.length > 1 ? `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}` : w.join('')); });
  constructor() { super(); afterNextRender(() => this.every(this.interval(), () => { this.at.set(this.at() + 1); return true; })); }
}

/** Text typed out letter by letter (the assistant's answer); screen readers hear it whole. */
@Component({
  selector: 'bx-typed-text', changeDetection: OnPush,
  template: `<span class="bx-fx-text bx-typed" [attr.data-testid]="testID() || null"><span class="bx-visually-hidden">{{ text() }}</span><span aria-hidden="true">{{ text().slice(0, count()) }}<span [class]="count() < text().length ? 'bx-caret is-typing' : 'bx-caret'"></span></span></span>`,
})
export class TypedText extends Fx {
  readonly text = input('');
  readonly speed = input(35);
  protected readonly count = signal(0);
  constructor() {
    super();
    effect(() => {
      const t = this.text();
      untracked(() => {
        if (reducedMotion()) { this.count.set(t.length); return; }
        this.count.set(0);
        this.every(this.speed(), () => { this.count.set(Math.min(t.length, this.count() + 1)); return this.count() < t.length; });
      });
    });
  }
}

/** A sentence with one word in focus at a time. */
@Component({
  selector: 'bx-focus-word', changeDetection: OnPush,
  template: `<p class="bx-fx-text bx-focus-word" [attr.data-testid]="testID() || null"><span class="bx-visually-hidden">{{ text() }}</span><span aria-hidden="true">@for (w of list(); track $index) {<span [class]="$index === focus() ? 'bx-word is-focus' : 'bx-word'">{{ w }} </span>}</span></p>`,
})
export class FocusWord extends Fx {
  readonly text = input('');
  readonly interval = input(1800);
  protected readonly at = signal(0);
  protected readonly list = computed(() => words(this.text()));
  protected readonly focus = computed(() => this.at() % Math.max(1, this.list().length));
  constructor() { super(); afterNextRender(() => this.every(this.interval(), () => { this.at.set(this.at() + 1); return true; })); }
}

/** Letters that float up as the text scrolls into view. */
@Component({
  selector: 'bx-scroll-float-text', changeDetection: OnPush,
  template: `<p class="bx-fx-text bx-scroll-float" [attr.data-testid]="testID() || null"><span class="bx-visually-hidden">{{ text() }}</span><span aria-hidden="true">@for (c of chars(); track $index) {<span [class]="c.css">{{ c.ch }}</span>}</span></p>`,
})
export class ScrollFloatText extends Part {
  readonly text = input('');
  protected readonly chars = computed(() => chars(this.text()));
}

/* ---------- motion: wrappers for the screen's own content ---------- */

type Entry = 'fadeup' | 'scale' | 'slide' | 'blur';

/** Content that fades, scales, slides or sharpens in when it appears. */
@Component({ selector: 'bx-fade-in-content', changeDetection: OnPush, template: `<div [class]="'bx-fx bx-fade-in is-' + effect() + (delay() ? ' ' + step(delay()) : '')" [attr.data-testid]="testID() || null"><ng-content /></div>` })
export class FadeInContent extends Part {
  readonly effect = input<Entry>('fadeup');
  readonly delay = input(0);
  protected step(i: number): string { return stagger(i); }
}

/** Content that comes in when it scrolls into view (shown at once without IntersectionObserver or under reduced motion). */
@Component({ selector: 'bx-scroll-reveal', changeDetection: OnPush, template: `<div #box [class]="'bx-fx bx-scroll-reveal is-' + effect() + (seen() ? ' is-in' : '')" [attr.data-testid]="testID() || null"><ng-content /></div>` })
export class ScrollReveal extends Part {
  readonly effect = input<Entry>('fadeup');
  protected readonly seen = signal(reducedMotion() || typeof IntersectionObserver === 'undefined');
  private readonly box = viewChild<ElementRef<HTMLElement>>('box');
  constructor() {
    super();
    const destroyed = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.box()?.nativeElement;
      if (this.seen() || !el) { return; }
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { this.seen.set(true); io.disconnect(); } }, { threshold: 0.15 });
      io.observe(el);
      destroyed.onDestroy(() => io.disconnect());
    });
  }
}

const WRAP = `<div [class]="'bx-fx ' + look" [attr.data-testid]="testID() || null"><ng-content /></div>`;
@Directive()
abstract class Wrap extends Part { protected readonly look: string = ''; }
/** Content that grows to full width as it scrolls into view. */
@Component({ selector: 'bx-scroll-expand', changeDetection: OnPush, template: WRAP })
export class ScrollExpand extends Wrap { protected override readonly look = 'bx-scroll-expand'; }
/** A scrolling area whose top and bottom edges fade. */
@Component({ selector: 'bx-edge-blur', changeDetection: OnPush, template: WRAP })
export class EdgeBlur extends Wrap { protected override readonly look = 'bx-edge-blur'; }
/** Content with a glare that crosses it on hover and focus. */
@Component({ selector: 'bx-glare-hover', changeDetection: OnPush, template: WRAP })
export class GlareHover extends Wrap { protected override readonly look = 'bx-glare'; }
/** Content inside a moving gradient border. */
@Component({ selector: 'bx-highlight-border', changeDetection: OnPush, template: WRAP })
export class HighlightBorder extends Wrap { protected override readonly look = 'bx-highlight-border'; }
/** A frosted glass panel. */
@Component({ selector: 'bx-glass-panel', changeDetection: OnPush, template: WRAP })
export class GlassPanel extends Wrap { protected override readonly look = 'bx-glass-panel'; }

/** A primary button that leans toward the pointer. */
@Component({
  selector: 'bx-magnetic-button', changeDetection: OnPush,
  template: `<button type="button" class="bx-btn bx-btn--callToAction bx-magnetic" [attr.data-testid]="testID() || null" [disabled]="disabled()" (pointermove)="move($event)" (pointerleave)="leave($event)"
    (click)="action.emit()"><span class="bx-btn-label">{{ label() }}</span></button>`,
})
export class MagneticButton extends Fx {
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly action = output<void>();
  protected move(e: PointerEvent): void { this.pointer(e, (s, x, y) => { s.setProperty('--bx-mx', `${((x - 0.5) * 12).toFixed(1)}px`); s.setProperty('--bx-my', `${((y - 0.5) * 10).toFixed(1)}px`); }); }
  protected leave(e: PointerEvent): void { const s = (e.currentTarget as HTMLElement).style; s.setProperty('--bx-mx', '0px'); s.setProperty('--bx-my', '0px'); }
}

/** Content where a click sends out a small burst of dots (decoration only). */
@Component({ selector: 'bx-click-burst', changeDetection: OnPush, template: `<div class="bx-fx bx-click-burst" [attr.data-testid]="testID() || null" (click)="burst($event)"><ng-content /></div>` })
export class ClickBurst extends Part {
  protected burst(e: MouseEvent): void {
    if (reducedMotion()) { return; }
    const host = e.currentTarget as HTMLElement;
    const r = host.getBoundingClientRect();
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('span');
      p.className = `bx-burst-dot bx-burst-${i}`;
      p.setAttribute('aria-hidden', 'true');
      p.style.left = `${e.clientX - r.left}px`;
      p.style.top = `${e.clientY - r.top}px`;
      host.appendChild(p);
      setTimeout(() => p.remove(), 700);
    }
  }
}

/** Items that scroll past; it stops on hover and focus, and Pause stops it for good. */
@Component({
  selector: 'bx-marquee', changeDetection: OnPush,
  template: `<section class="bx-marquee" [attr.aria-label]="label()" [attr.data-testid]="testID() || null"><div class="bx-marquee-window"><div [class]="'bx-marquee-track is-' + speed() + (paused() ? ' is-paused' : '')">
    <ul class="bx-marquee-list">@for (m of items(); track $index) {<li>{{ m }}</li>}</ul><ul class="bx-marquee-list" aria-hidden="true">@for (m of items(); track $index) {<li>{{ m }}</li>}</ul></div></div>
    <button type="button" class="bx-btn bx-btn--borderless bx-btn--sm bx-marquee-toggle" (click)="paused.set(!paused())">{{ paused() ? 'Play' : 'Pause' }}</button></section>`,
})
export class Marquee extends Part {
  readonly label = input('Updates');
  readonly items = input<ReadonlyArray<string>>([]);
  readonly speed = input<'slow' | 'normal'>('normal');
  protected readonly paused = signal(reducedMotion());
}

/* ---------- showcase ---------- */

export interface ListEntry { title: string; meta?: string }
/** A list whose rows come in one after another. */
@Component({
  selector: 'bx-animated-list', changeDetection: OnPush,
  template: `<ul class="bx-rows bx-animated-list" [attr.aria-label]="label() || null" [attr.data-testid]="testID() || null">@for (o of rows(); track $index) {
    <li [class]="'bx-row bx-alist-item ' + o.step"><span class="bx-row-main"><strong>{{ o.title }}</strong>@if (o.meta) {<span class="bx-row-meta">{{ o.meta }}</span>}</span></li>}</ul>`,
})
export class AnimatedList extends Part {
  readonly label = input('');
  readonly items = input<ReadonlyArray<string | ListEntry>>([]);
  protected readonly rows = computed(() => this.items().map((x, i) => ({ ...(typeof x === 'string' ? { title: x } as ListEntry : x), step: stagger(i) })));
}

const FXCARD = `<article [class]="'bx-card ' + look" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null" (pointermove)="move($event)" (pointerleave)="leave($event)">
  <h3 class="bx-card-title" [id]="id">{{ heading() }}</h3>@if (text()) {<p class="bx-thing-text">{{ text() }}</p>}<ng-content /></article>`;
@Directive()
abstract class FxCard extends Fx {
  readonly heading = input.required<string>();
  readonly text = input('');
  protected readonly look: string = '';
  protected move(e: PointerEvent): void {
    this.pointer(e, (s, x, y) => { s.setProperty('--bx-sx', `${Math.round(x * 100)}%`); s.setProperty('--bx-sy', `${Math.round(y * 100)}%`);
      s.setProperty('--bx-rx', `${((0.5 - y) * 8).toFixed(2)}deg`); s.setProperty('--bx-ry', `${((x - 0.5) * 10).toFixed(2)}deg`); });
  }
  protected leave(e: PointerEvent): void { const s = (e.currentTarget as HTMLElement).style; s.setProperty('--bx-rx', '0deg'); s.setProperty('--bx-ry', '0deg'); }
}
/** A card with a light that follows the pointer. */
@Component({ selector: 'bx-spotlight-card', changeDetection: OnPush, template: FXCARD })
export class SpotlightCard extends FxCard { protected override readonly look = 'bx-spotlight-card'; }
/** A card that tilts toward the pointer. */
@Component({ selector: 'bx-tilt-card', changeDetection: OnPush, template: FXCARD })
export class TiltCard extends FxCard { protected override readonly look = 'bx-tilt-card'; }
/** A card with a glowing border. */
@Component({ selector: 'bx-glow-border-card', changeDetection: OnPush, template: FXCARD })
export class GlowBorderCard extends FxCard { protected override readonly look = 'bx-glow-border-card'; }

/** A card that turns over to show its details; the face turned away is hidden from screen readers and the keyboard. [(flipped)]. */
@Component({
  selector: 'bx-flip-card', changeDetection: OnPush,
  template: `<div [class]="flipped() ? 'bx-flip-card is-flipped' : 'bx-flip-card'" [attr.data-testid]="testID() || null"><div class="bx-flip-inner">
    <section class="bx-card bx-flip-face bx-flip-front" [attr.aria-hidden]="flipped() || null" [attr.aria-labelledby]="id"><h3 class="bx-card-title" [id]="id">{{ heading() }}</h3>
      <p class="bx-thing-text">{{ front() }}</p><button type="button" class="bx-thing-action bx-flip-button" [attr.tabindex]="flipped() ? -1 : null" (click)="flip()">{{ backLabel() }}</button></section>
    <section class="bx-card bx-flip-face bx-flip-back" [attr.aria-hidden]="!flipped() || null" [attr.aria-label]="heading()"><p class="bx-thing-text">{{ back() }}</p>
      <button type="button" class="bx-thing-action bx-flip-button" [attr.tabindex]="flipped() ? null : -1" (click)="flip()">{{ frontLabel() }}</button></section></div></div>`,
})
export class FlipCard extends Part {
  readonly heading = input.required<string>();
  readonly front = input('');
  readonly back = input('');
  readonly flipped = model(false);
  readonly backLabel = input('Show details');
  readonly frontLabel = input('Back');
  protected flip(): void { this.flipped.set(!this.flipped()); this.focusLater(this.flipped() ? '.bx-flip-back .bx-flip-button' : '.bx-flip-front .bx-flip-button'); }
}

export interface DeckItem { title: string; text?: string }
/** Cards stacked one behind another; Next and Previous go round, and the position is said. */
@Component({
  selector: 'bx-card-stack', changeDetection: OnPush,
  template: `<section class="bx-card-stack" [attr.aria-label]="label()" [attr.data-testid]="testID() || null"><div class="bx-deck">@for (c of cards(); track $index) {
    <article [class]="'bx-card bx-deck-card is-depth-' + c.depth" [attr.aria-hidden]="c.depth !== 0 || null"><h3 class="bx-card-title">{{ c.title }}</h3><p class="bx-thing-text">{{ c.text }}</p></article>}</div>
    <div class="bx-deck-controls"><button type="button" class="bx-page" aria-label="Previous card" (click)="go(-1)">‹</button><span role="status">{{ where() }}</span>
      <button type="button" class="bx-page" aria-label="Next card" (click)="go(1)">›</button></div></section>`,
})
export class CardStack extends Part {
  readonly label = input('Cards');
  readonly items = input<ReadonlyArray<DeckItem>>([]);
  readonly index = model(0);
  protected readonly cards = computed(() => { const n = Math.max(1, this.items().length); return this.items().map((o, i) => ({ ...o, depth: Math.min((i - this.index() + n) % n, 3) })); });
  protected readonly where = computed(() => (this.items().length ? `Card ${this.index() + 1} of ${this.items().length}` : ''));
  protected go(by: number): void { const n = this.items().length; if (n) { this.index.set((this.index() + by + n) % n); } }
}

export interface BentoTile { id: string; title: string; text?: string; figure?: string; size?: 'sm' | 'wide' | 'tall' | 'lg' }
/** A dashboard of tiles of different sizes; with interactive each opens. */
@Component({
  selector: 'bx-bento-grid', changeDetection: OnPush,
  template: `<ul class="bx-bento" [attr.aria-label]="label() || null" [attr.data-testid]="testID() || null">@for (o of tiles(); track o.id) {
    <li [class]="o.css">
      @if (interactive()) {
        <button type="button" class="bx-bento-button" (click)="action.emit(o)"><span class="bx-tile-label">{{ o.title }}</span>@if (o.figure) {<span class="bx-tile-value">{{ o.figure }}</span>}@if (o.text) {<span class="bx-tile-meta">{{ o.text }}</span>}</button>
      } @else {
        <div class="bx-bento-body"><span class="bx-tile-label">{{ o.title }}</span>@if (o.figure) {<span class="bx-tile-value">{{ o.figure }}</span>}@if (o.text) {<span class="bx-tile-meta">{{ o.text }}</span>}</div>
      }
    </li>}</ul>`,
})
export class BentoGrid extends Part {
  readonly label = input('');
  readonly items = input<ReadonlyArray<BentoTile>>([]);
  readonly interactive = input(false);
  readonly action = output<BentoTile>();
  protected readonly tiles = computed(() => this.items().map((o, i) => ({ ...o, css: `bx-bento-tile is-${o.size ?? 'sm'} ${stagger(i)}` })));
}

/** Slides one at a time with Previous, Next and a dot each; nothing moves by itself. [(index)]. */
@Component({
  selector: 'bx-carousel', changeDetection: OnPush,
  template: `<section class="bx-carousel" aria-roledescription="carousel" [attr.aria-label]="label()" [attr.data-testid]="testID() || null"><div class="bx-slides" aria-live="polite">
    @for (s of slides(); track $index) {<div [class]="$index === index() ? 'bx-slide is-on' : 'bx-slide'" role="group" aria-roledescription="slide" [attr.aria-label]="($index + 1) + ' of ' + slides().length"
      [hidden]="$index !== index()"><h3 class="bx-card-title">{{ s.title }}</h3><p class="bx-thing-text">{{ s.text }}</p></div>}</div>
    <div class="bx-deck-controls"><button type="button" class="bx-page" aria-label="Previous slide" (click)="go(-1)">‹</button><span class="bx-dots">@for (s of slides(); track $index) {
      <button type="button" [class]="$index === index() ? 'bx-dot is-on' : 'bx-dot'" [attr.aria-label]="'Slide ' + ($index + 1)" [attr.aria-current]="$index === index() || null" (click)="index.set($index)"></button>}</span>
      <button type="button" class="bx-page" aria-label="Next slide" (click)="go(1)">›</button></div></section>`,
})
export class Carousel extends Part {
  readonly label = input('Highlights');
  readonly slides = input<ReadonlyArray<DeckItem>>([]);
  readonly index = model(0);
  protected go(by: number): void { const n = this.slides().length; if (n) { this.index.set((this.index() + by + n) % n); } }
}

/** An amount on a range whose thumb stretches as it moves. [(value)]. */
@Component({ selector: 'bx-elastic-slider', changeDetection: OnPush, template: `<div class="bx-fx-elastic">${SLIDER}</div>` })
export class ElasticSlider extends SliderBase { protected override readonly defaults = { label: 'Amount', max: 10000, step: 50 }; }

/** A picker that turns like a wheel (a listbox): arrow keys move, the chosen option is in the middle. [(value)]. */
@Component({
  selector: 'bx-option-wheel', changeDetection: OnPush,
  template: `<div class="bx-field bx-option-wheel" [attr.data-testid]="testID() || null"><span class="bx-label" [id]="id">{{ label() }}</span>
    <ul class="bx-wheel" role="listbox" tabindex="0" [attr.aria-labelledby]="id" [attr.aria-activedescendant]="active()" (keydown)="key($event)">@for (o of options(); track o; let i = $index) {
      <li role="option" [id]="id + '-o' + i" [class]="o === value() ? 'bx-wheel-option is-on' : 'bx-wheel-option'" [attr.aria-selected]="o === value()" (click)="value.set(o)">{{ o }}</li>}</ul></div>`,
})
export class OptionWheel extends Part {
  readonly label = input.required<string>();
  readonly options = input<ReadonlyArray<string>>([]);
  readonly value = model('');
  protected readonly active = computed(() => { const i = this.options().indexOf(this.value()); return i >= 0 ? `${this.id}-o${i}` : null; });
  protected key(e: KeyboardEvent): void {
    const next = arrow(e.key, Math.max(0, this.options().indexOf(this.value())), this.options().length);
    if (next >= 0) { e.preventDefault(); this.value.set(this.options()[next]); }
  }
}

/** Sections in a row of pills; the current one is raised. [(selection)]. */
@Component({ selector: 'bx-pill-nav', changeDetection: OnPush, imports: [SideNav], template: `<div class="bx-fx-pill-nav"><bx-side-nav [testID]="testID()" [label]="label()" [items]="items()" [(selection)]="selection" /></div>` })
export class PillNav extends Part {
  readonly label = input('Main');
  readonly items = input<ReadonlyArray<string | NavItem>>([]);
  readonly selection = model('');
}
/** Shortcuts in a dock that swell under the pointer. */
@Component({ selector: 'bx-dock-nav', changeDetection: OnPush, imports: [QuickLinksWidget], template: `<div class="bx-fx-dock"><bx-quick-links-corp [testID]="testID()" [label]="label()" [items]="items()" (action)="action.emit($event)" /></div>` })
export class DockNav extends Part {
  readonly label = input('Dock');
  readonly items = input<ReadonlyArray<QuickItem>>([]);
  readonly action = output<string>();
}

export interface CardNavItem { id: string; title: string; text?: string }
/** Sections as cards that lift on hover and focus. */
@Component({
  selector: 'bx-card-nav', changeDetection: OnPush,
  template: `<nav class="bx-card-nav" [attr.aria-label]="label()" [attr.data-testid]="testID() || null"><ul>@for (o of items(); track o.id; let i = $index) {
    <li [class]="'bx-card-nav-item ' + step(i)"><button type="button" class="bx-card-nav-button" (click)="action.emit(o.id)"><strong>{{ o.title }}</strong>@if (o.text) {<span>{{ o.text }}</span>}</button></li>}</ul></nav>`,
})
export class CardNav extends Part {
  readonly label = input('Explore');
  readonly items = input<ReadonlyArray<CardNavItem>>([]);
  readonly action = output<string>();
  protected step(i: number): string { return stagger(i); }
}
/** A menu whose items come in one after another. */
@Component({ selector: 'bx-staggered-menu', changeDetection: OnPush, imports: [ActionMenu], template: `<div class="bx-fx-stagger-menu"><bx-action-menu [testID]="testID()" [label]="label()" [items]="items()" (action)="action.emit($event)" /></div>` })
export class StaggeredMenu extends Part {
  readonly label = input('Menu');
  readonly items = input<ReadonlyArray<string | MenuItem>>([]);
  readonly action = output<string>();
}

export interface FolderDoc { id: string; title: string; meta?: string }
/** A folder that opens to show its documents, each to open. [(open)]. */
@Component({
  selector: 'bx-document-folder', changeDetection: OnPush,
  template: `<section [class]="open() ? 'bx-folder is-open' : 'bx-folder'" [attr.data-testid]="testID() || null"><button type="button" class="bx-folder-tab" [attr.aria-expanded]="open()" [attr.aria-controls]="id" (click)="open.set(!open())">
    <span class="bx-folder-icon" aria-hidden="true"></span><span class="bx-row-main"><strong>{{ heading() }}</strong><span class="bx-row-meta">{{ items().length }} {{ items().length === 1 ? 'document' : 'documents' }}</span></span></button>
    @if (open()) {<ul class="bx-rows bx-folder-docs" [id]="id">@for (o of items(); track o.id; let i = $index) {<li [class]="'bx-row ' + step(i)"><span class="bx-row-main"><strong>{{ o.title }}</strong>
      @if (o.meta) {<span class="bx-row-meta">{{ o.meta }}</span>}</span><button type="button" class="bx-btn bx-btn--borderless bx-btn--sm" [attr.aria-label]="'Open ' + o.title" (click)="action.emit(o)">Open</button></li>}</ul>}</section>`,
})
export class DocumentFolder extends Part {
  readonly heading = input('Documents');
  readonly items = input<ReadonlyArray<FolderDoc>>([]);
  readonly open = model(false);
  readonly action = output<FolderDoc>();
  protected step(i: number): string { return stagger(i); }
}

/** Cards that stack as the page scrolls. */
@Component({
  selector: 'bx-scroll-stack', changeDetection: OnPush,
  template: `<ul class="bx-scroll-stack" [attr.aria-label]="label() || null" [attr.data-testid]="testID() || null">@for (o of items(); track $index) {
    <li [class]="'bx-card bx-scroll-stack-card is-n-' + ($index > 9 ? 9 : $index)"><h3 class="bx-card-title">{{ o.title }}</h3><p class="bx-thing-text">{{ o.text }}</p></li>}</ul>`,
})
export class ScrollStack extends Part {
  readonly label = input('');
  readonly items = input<ReadonlyArray<DeckItem>>([]);
}

/** A person with their photo or initials, their role and details. */
@Component({
  selector: 'bx-profile-card', changeDetection: OnPush,
  template: `<article class="bx-card bx-profile-card" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null"><div class="bx-profile-head">
    @if (src()) {<img class="bx-avatar is-lg" [src]="src()" alt="" />} @else {<span class="bx-avatar is-lg" aria-hidden="true">{{ initials() }}</span>}
    <span class="bx-row-main"><h3 class="bx-card-title" [id]="id">{{ name() }}</h3>@if (jobTitle()) {<span class="bx-row-meta">{{ jobTitle() }}</span>}</span></div>
    @if (items().length) {<dl class="bx-kv-list">@for (o of items(); track $index) {<div class="bx-kv-row"><dt>{{ o.label }}</dt><dd>{{ o.value }}</dd></div>}</dl>}
    @if (actionLabel()) {<button type="button" class="bx-btn bx-btn--outlined" (click)="action.emit()">{{ actionLabel() }}</button>}</article>`,
})
export class ProfileCard extends Part {
  readonly name = input.required<string>();
  readonly jobTitle = input('');
  readonly src = input('');
  readonly items = input<ReadonlyArray<Detail>>([]);
  readonly actionLabel = input('');
  readonly action = output<void>();
  protected readonly initials = computed(() => initials(this.name()));
}

/* ---------- backdrops ---------- */

const BACKDROP = `<div [class]="'bx-backdrop is-' + look + (still() ? ' is-still' : '')" [attr.data-testid]="testID() || null"><span class="bx-backdrop-layer" aria-hidden="true"></span><div class="bx-backdrop-content"><ng-content /></div></div>`;
@Directive()
abstract class Backdrop extends Part { readonly still = input(false); protected readonly look: string = ''; }
/** A soft moving gradient behind the content. */
@Component({ selector: 'bx-gradient-backdrop', changeDetection: OnPush, template: BACKDROP })
export class GradientBackdrop extends Backdrop { protected override readonly look = 'gradient'; }
/** Slow coloured light behind the content. */
@Component({ selector: 'bx-soft-aurora', changeDetection: OnPush, template: BACKDROP })
export class SoftAurora extends Backdrop { protected override readonly look = 'aurora'; }
/** Folds of colour like silk. */
@Component({ selector: 'bx-silk-backdrop', changeDetection: OnPush, template: BACKDROP })
export class SilkBackdrop extends Backdrop { protected override readonly look = 'silk'; }
/** A fading grid of dots. */
@Component({ selector: 'bx-dot-grid', changeDetection: OnPush, template: BACKDROP })
export class DotGrid extends Backdrop { protected override readonly look = 'dots'; }
/** Lines like waves. */
@Component({ selector: 'bx-line-waves', changeDetection: OnPush, template: BACKDROP })
export class LineWaves extends Backdrop { protected override readonly look = 'waves'; }
/** Beams of light from the top. */
@Component({ selector: 'bx-light-beams', changeDetection: OnPush, template: BACKDROP })
export class LightBeams extends Backdrop { protected override readonly look = 'beams'; }
/** Contour lines like a map. */
@Component({ selector: 'bx-topography', changeDetection: OnPush, template: BACKDROP })
export class Topography extends Backdrop { protected override readonly look = 'topography'; }

/** Specks drifting up on a canvas; still under reduced motion. */
@Component({
  selector: 'bx-particle-backdrop', changeDetection: OnPush,
  template: `<div class="bx-backdrop is-particles" [attr.data-testid]="testID() || null"><canvas #canvas class="bx-backdrop-layer" aria-hidden="true"></canvas><div class="bx-backdrop-content"><ng-content /></div></div>`,
})
export class ParticleBackdrop extends Fx {
  readonly count = input(40);
  readonly still = input(false);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  constructor() {
    super();
    afterNextRender(() => {
      const el = this.canvas()?.nativeElement;
      const c = el?.getContext?.('2d');
      if (!el || !c) { return; }
      const dots = Array.from({ length: this.count() }, () => ({ x: Math.random() * (el.clientWidth || 300), y: Math.random() * (el.clientHeight || 160), r: 1 + Math.random() * 2, v: 0.15 + Math.random() * 0.35 }));
      const draw = () => {
        const w = (el.width = el.clientWidth || 300);
        const h = (el.height = el.clientHeight || 160);
        c.clearRect(0, 0, w, h);
        c.fillStyle = getComputedStyle(el).color;
        dots.forEach((p) => { p.y -= p.v; if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; } c.globalAlpha = 0.35; c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill(); });
        return true;
      };
      draw();
      if (!this.still()) { this.every(40, draw); }
    });
  }
}

/* ---------- micro interactions ---------- */

/** Slide the handle to the end to confirm; pressing it (or Enter) confirms too, so no one has to drag. (confirmed). */
@Component({
  selector: 'bx-slide-to-confirm', changeDetection: OnPush,
  template: `<div [class]="'bx-slide-confirm' + (done() ? ' is-done' : '') + (dragging() ? ' is-dragging' : '')" [attr.data-testid]="testID() || null">
    <span class="bx-slide-text" aria-hidden="true">{{ done() ? doneLabel() : label() }}</span>
    <button type="button" class="bx-slide-handle" [attr.aria-label]="done() ? doneLabel() : label() + ': slide, or press to confirm'" [disabled]="disabled()"
            (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (click)="press()"><span aria-hidden="true">{{ done() ? '✓' : '›' }}</span></button>
    @if (done()) {<span class="bx-visually-hidden" role="status">{{ doneLabel() }}</span>}</div>`,
})
export class SlideToConfirm extends Part {
  readonly label = input('Slide to pay');
  readonly doneLabel = input('Paid');
  readonly disabled = input(false);
  readonly confirmed = output<void>();
  protected readonly done = signal(false);
  protected readonly dragging = signal(false);
  private drag: { x: number; width: number; last: number } | null = null;
  private dragged = false;
  private confirm(): void { if (!this.done() && !this.disabled()) { this.done.set(true); this.confirmed.emit(); } }
  protected down(e: PointerEvent): void {
    if (this.done() || this.disabled()) { return; }
    const h = e.currentTarget as HTMLElement;
    this.drag = { x: e.clientX, width: h.parentElement!.getBoundingClientRect().width - h.getBoundingClientRect().width, last: 0 };
    this.dragging.set(true);
    h.setPointerCapture?.(e.pointerId);
  }
  protected move(e: PointerEvent): void {
    if (!this.drag) { return; }
    this.drag.last = Math.max(0, Math.min(this.drag.width, e.clientX - this.drag.x));
    (e.currentTarget as HTMLElement).style.setProperty('--bx-slide', `${this.drag.last}px`);
  }
  protected up(e: PointerEvent): void {
    const g = this.drag;
    this.drag = null;
    this.dragging.set(false);
    (e.currentTarget as HTMLElement).style.setProperty('--bx-slide', '0px');
    this.dragged = !!g && g.last > 4;
    if (g && g.last >= g.width * 0.9) { this.confirm(); }
  }
  protected press(): void { if (this.dragged) { this.dragged = false; return; } this.confirm(); }
}

/** Press and hold (or hold Space or Enter) for the duration to confirm; letting go early cancels. (confirmed). */
@Component({
  selector: 'bx-hold-to-confirm', changeDetection: OnPush,
  template: `<button type="button" [class]="'bx-btn bx-btn--callToAction bx-hold' + (holding() ? ' is-holding' : '') + (done() ? ' is-done' : '')" [attr.data-testid]="testID() || null" [disabled]="disabled()"
    [attr.aria-describedby]="id" [style.--bx-hold]="duration() + 'ms'" (pointerdown)="start()" (pointerup)="cancel()" (pointerleave)="cancel()" (keydown)="key($event)" (keyup)="keyUp($event)">
    <span class="bx-hold-fill" aria-hidden="true"></span><span class="bx-btn-label">{{ done() ? doneLabel() : label() }}</span></button>
    <span class="bx-visually-hidden" [id]="id">{{ hint() }}</span>@if (done()) {<span class="bx-visually-hidden" role="status">{{ doneLabel() }}</span>}`,
})
export class HoldToConfirm extends Fx {
  readonly label = input('Hold to confirm');
  readonly doneLabel = input('Confirmed');
  readonly duration = input(1500);
  readonly disabled = input(false);
  readonly confirmed = output<void>();
  protected readonly holding = signal(false);
  protected readonly done = signal(false);
  protected readonly hint = computed(() => `Press and hold for ${Math.round(this.duration() / 100) / 10} seconds`);
  private t: ReturnType<typeof setTimeout> | null = null;
  protected start(): void {
    if (this.done() || this.disabled() || this.t) { return; }
    this.holding.set(true);
    this.t = setTimeout(() => { this.t = null; this.holding.set(false); this.done.set(true); this.confirmed.emit(); }, this.duration());
  }
  protected cancel(): void { if (this.t) { clearTimeout(this.t); this.t = null; } this.holding.set(false); }
  protected key(e: KeyboardEvent): void { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); this.start(); } }
  protected keyUp(e: KeyboardEvent): void { if (e.key === ' ' || e.key === 'Enter') { this.cancel(); } }
}

/** A one-time code in rounded slots that pop as they fill. [(value)]. */
@Component({ selector: 'bx-otp-slots', changeDetection: OnPush, imports: [OtpInput], template: `<div class="bx-fx-otp"><bx-otp [testID]="testID()" [label]="label()" [(value)]="value" [length]="length()" (completed)="completed.emit($event)" /></div>` })
export class OtpSlots extends Part {
  readonly label = input('Enter the code');
  readonly value = model('');
  readonly length = input(6);
  readonly completed = output<string>();
}
/** A receipt with a torn edge that rises in; actions in the default slot. */
@Component({ selector: 'bx-receipt-tear', changeDetection: OnPush, imports: [TransactionReceipt], template: `<div class="bx-fx-torn"><bx-receipt [testID]="testID()" [heading]="heading()" [amount]="amount()" [currency]="currency()" [items]="items()" [reference]="reference()"
  [variant]="variant()"><ng-content /></bx-receipt></div>` })
export class ReceiptTear extends Part {
  readonly heading = input('Payment sent');
  readonly amount = input<number | string>('');
  readonly currency = input('');
  readonly items = input<ReadonlyArray<Detail>>([]);
  readonly reference = input('');
  readonly variant = input<ReceiptVariant | undefined>(undefined);
}

/** A tick that draws itself, with what was done (said once). */
@Component({
  selector: 'bx-success-check', changeDetection: OnPush,
  template: `<div class="bx-success-check" role="status" [attr.data-testid]="testID() || null"><svg class="bx-check-svg" viewBox="0 0 52 52" aria-hidden="true" focusable="false"><circle class="bx-check-ring" cx="26" cy="26" r="24"></circle>
    <path class="bx-check-tick" d="M15 27 l7 7 l15 -16"></path></svg><strong class="bx-receipt-title">{{ label() }}</strong>@if (text()) {<span class="bx-thing-text">{{ text() }}</span>}</div>`,
})
export class SuccessCheck extends Part {
  readonly label = input('Done');
  readonly text = input('');
}

export interface SwipeAction { value: string; label: string; tone?: 'danger' }
/** A row whose actions show when it is swiped left, and to the keyboard when focus is in it. */
@Component({
  selector: 'bx-swipe-row', changeDetection: OnPush,
  template: `<div [class]="open() ? 'bx-swipe-row is-open' : 'bx-swipe-row'" [attr.data-testid]="testID() || null" (pointerdown)="x0 = $event.clientX" (pointerup)="up($event)">
    <div class="bx-swipe-actions">@for (a of actions(); track a.value) {<button type="button" [class]="a.tone ? 'bx-swipe-action is-' + a.tone : 'bx-swipe-action'" [attr.aria-label]="a.label + ': ' + heading()"
      (click)="open.set(false); action.emit(a.value)">{{ a.label }}</button>}</div>
    <div class="bx-row bx-swipe-face"><span class="bx-row-main"><strong>{{ heading() }}</strong>@if (meta()) {<span class="bx-row-meta">{{ meta() }}</span>}</span>@if (value()) {<span class="bx-row-value">{{ value() }}</span>}</div></div>`,
})
export class SwipeRow extends Part {
  readonly heading = input.required<string>();
  readonly meta = input('');
  readonly value = input('');
  readonly actions = input<ReadonlyArray<SwipeAction>>([]);
  readonly action = output<string>();
  protected readonly open = signal(false);
  protected x0: number | null = null;
  protected up(e: PointerEvent): void { if (this.x0 !== null) { const dx = e.clientX - this.x0; if (dx < -40) { this.open.set(true); } else if (dx > 40) { this.open.set(false); } } this.x0 = null; }
}

/** A message the customer can swipe away, or close. (closed). */
@Component({
  selector: 'bx-swipe-toast', changeDetection: OnPush,
  template: `@if (!gone()) {<div [class]="'bx-toast bx-swipe-toast is-' + severity()" role="status" [attr.data-testid]="testID() || null" (pointerdown)="x0 = $event.clientX" (pointerup)="up($event)">
    <span class="bx-toast-icon" aria-hidden="true">✓</span><span class="bx-toast-text">{{ message() }}</span>
    <button type="button" class="bx-btn bx-btn--borderless bx-btn--icon bx-btn--sm" aria-label="Close the message" (click)="close()"><span aria-hidden="true">×</span></button></div>}`,
})
export class SwipeToast extends Part {
  readonly message = input.required<string>();
  readonly severity = input<'error' | 'warning' | 'confirmation' | 'info'>('confirmation');
  readonly closed = output<void>();
  protected readonly gone = signal(false);
  protected x0: number | null = null;
  protected close(): void { this.gone.set(true); this.closed.emit(); }
  protected up(e: PointerEvent): void { if (this.x0 !== null && Math.abs(e.clientX - this.x0) > 60) { this.close(); } this.x0 = null; }
}

const PRESS = `<button type="button" [class]="'bx-press-toggle ' + look + (value() ? ' is-on' : '')" [attr.data-testid]="testID() || null" [attr.aria-pressed]="value()" [attr.aria-label]="fullName()" [disabled]="disabled()"
  (click)="value.set(!value())"><span class="bx-press-glyph" aria-hidden="true">{{ glyph }}</span></button>`;
@Directive()
abstract class PressToggle extends Part {
  readonly label = input<string | undefined>(undefined);
  readonly name = input('');
  readonly value = model(false);
  readonly disabled = input(false);
  protected readonly look: string = '';
  protected readonly glyph: string = '';
  protected readonly defaultLabel: string = '';
  protected readonly fullName = computed(() => [this.label() ?? this.defaultLabel, this.name()].filter(Boolean).join(' '));
}
/** Alerts on or off; the bell rings when they go on. [(value)]. */
@Component({ selector: 'bx-bell-toggle', changeDetection: OnPush, template: PRESS })
export class BellToggle extends PressToggle { protected override readonly look = 'bx-bell'; protected override readonly glyph = '🔔'; protected override readonly defaultLabel = 'Alerts'; }
/** A payee as a favourite; the heart pops. [(value)]. */
@Component({ selector: 'bx-favourite-heart', changeDetection: OnPush, template: PRESS })
export class FavouriteHeart extends PressToggle { protected override readonly look = 'bx-heart'; protected override readonly glyph = '♥'; protected override readonly defaultLabel = 'Favourite'; }

/** A switch whose knob squishes as it is pressed. [(value)]. */
@Component({ selector: 'bx-squish-switch', changeDetection: OnPush, template: `<div class="bx-fx-squish">${SETTING}</div>` })
export class SquishSwitch extends SettingBase {}
/** Radio cards whose mark wobbles when chosen. [(value)]. */
@Component({ selector: 'bx-jelly-radio', changeDetection: OnPush, template: `<div class="bx-fx-jelly">${CHOICE}</div>` })
export class JellyRadio extends ChoiceBase {}
/** A segmented choice whose highlight glides. [(value)]. */
@Component({ selector: 'bx-glide-select', changeDetection: OnPush, template: `<div class="bx-fx-glide">${SEGMENTS}</div>` })
export class GlideSelect extends SegmentsBase {}
/** A segmented choice that gives like rubber when pressed. [(value)]. */
@Component({ selector: 'bx-rubber-segment', changeDetection: OnPush, template: `<div class="bx-fx-rubber">${SEGMENTS}</div>` })
export class RubberSegment extends SegmentsBase {}

/** An amount typed, or dragged left and right by the arrows beside the label. [(value)]. */
@Component({
  selector: 'bx-scrub-field', changeDetection: OnPush,
  template: `<div class="bx-field bx-scrub" [attr.data-testid]="testID() || null"><div class="bx-slider-head"><label class="bx-label" [attr.for]="id">{{ label() }}</label>
    <span class="bx-scrub-handle" aria-hidden="true" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="g = null">⇔</span></div>
    <div class="bx-control">@if (currency()) {<span class="bx-affix" aria-hidden="true">{{ currency() }}</span>}<input type="number" class="bx-input bx-num" inputmode="decimal" [id]="id" [value]="value()"
      [attr.min]="min()" [attr.max]="max() ?? null" [attr.step]="step()" (input)="typed($event)" /></div><span class="bx-help">Drag the arrows, or type</span></div>`,
})
export class ScrubField extends Part {
  readonly label = input('Amount');
  readonly value = model(0);
  readonly min = input(0);
  readonly max = input<number | undefined>(undefined);
  readonly step = input(10);
  readonly currency = input('');
  protected g: { x: number; v: number } | null = null;
  private clamp(n: number): number { return Math.min(this.max() ?? Infinity, Math.max(this.min(), n)); }
  protected typed(e: Event): void { const n = Number((e.target as HTMLInputElement).value); if (Number.isFinite(n)) { this.value.set(this.clamp(n)); } }
  protected down(e: PointerEvent): void { this.g = { x: e.clientX, v: this.value() }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }
  protected move(e: PointerEvent): void { if (this.g) { this.value.set(this.clamp(this.g.v + Math.round((e.clientX - this.g.x) / 8) * this.step())); } }
}

/** A half-circle gauge of a budget; over the budget it turns red and says so. */
@Component({
  selector: 'bx-budget-gauge', changeDetection: OnPush,
  template: `<div [class]="css()" role="progressbar" aria-valuemin="0" [attr.aria-valuemax]="max()" [attr.aria-valuenow]="now()" [attr.aria-valuetext]="text()" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
    <svg viewBox="0 0 100 56" aria-hidden="true" focusable="false"><path class="bx-gauge-track" d="M10 50 A40 40 0 0 1 90 50"></path><path class="bx-gauge-fill" d="M10 50 A40 40 0 0 1 90 50" [attr.stroke-dashoffset]="offset()"></path></svg>
    <span class="bx-gauge-label" [id]="id">{{ label() }}</span><span class="bx-gauge-text">{{ text() }}</span></div>`,
})
export class BudgetGauge extends Part {
  readonly label = input('Budget');
  readonly value = input(0);
  readonly max = input(100);
  readonly unit = input('');
  private readonly share = computed(() => (this.max() > 0 ? Math.max(0, Math.min(1, this.value() / this.max())) : 0));
  protected readonly offset = computed(() => Math.round(126 * (1 - this.share()) * 10) / 10);
  protected readonly now = computed(() => Math.min(this.value(), this.max()));
  protected readonly text = computed(() => { const u = this.unit() ? ` ${this.unit()}` : ''; return `${this.value().toLocaleString()}${u} of ${this.max().toLocaleString()}${u}` + (this.value() > this.max() ? ', over budget' : ''); });
  protected readonly css = computed(() => 'bx-gauge' + (this.value() > this.max() ? ' is-over' : this.share() >= 0.9 ? ' is-near' : ''));
}

/** A status as a mark and a word: success, error, pending or info. */
@Component({
  selector: 'bx-status-mark', changeDetection: OnPush,
  template: `<span [class]="'bx-status-mark is-' + status()" [attr.data-testid]="testID() || null"><span class="bx-status-mark-icon" aria-hidden="true">{{ status() === 'error' ? '!' : status() === 'info' ? 'i' : '' }}</span><span>{{ label() }}</span></span>`,
})
export class StatusMark extends Part {
  readonly label = input.required<string>();
  readonly status = input<'success' | 'error' | 'pending' | 'info'>('success');
}
/** Stars that lift as the pointer passes over them. [(value)]. */
@Component({ selector: 'bx-peek-rating', changeDetection: OnPush, imports: [FeedbackRating], template: `<div class="bx-fx-peek"><bx-feedback [testID]="testID()" [label]="label()" [(value)]="value" /></div>` })
export class PeekRating extends Part {
  readonly label = input('How was it?');
  readonly value = model(0);
}
/** A tooltip in warm colours. */
@Component({ selector: 'bx-warm-tooltip', changeDetection: OnPush, imports: [Tooltip], template: `<div class="bx-fx-warm"><bx-tooltip [testID]="testID()" [label]="label()" [text]="text()" /></div>` })
export class WarmTooltip extends Part {
  readonly label = input.required<string>();
  readonly text = input.required<string>();
}

/** The assistant's question box with suggestions; Enter or Ask sends. (ask). */
@Component({
  selector: 'bx-prompt-bar', changeDetection: OnPush,
  template: `<div [class]="css()" [attr.data-testid]="testID() || null"><div class="bx-chip-row" role="group" [attr.aria-label]="'Suggestions for ' + label()">@for (s of suggestions(); track s) {
    <button type="button" class="bx-filter-chip" (click)="use(s)">{{ s }}</button>}</div><div class="bx-prompt-row"><div class="bx-control"><span class="bx-prompt-spark" aria-hidden="true">✦</span>
    <input class="bx-input bx-prompt-input" [attr.aria-label]="label()" [placeholder]="placeholder()" [value]="draft()" (input)="draft.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); send()" /></div>
    <button type="button" class="bx-btn bx-btn--callToAction" [disabled]="off()" [attr.aria-busy]="busy() || null" (click)="send()">Ask</button></div></div>`,
})
export class PromptBar extends Part {
  readonly label = input('Ask the assistant');
  readonly placeholder = input('Ask about your accounts');
  readonly suggestions = input<ReadonlyArray<string>>([]);
  readonly busy = input(false);
  readonly variant = input<PromptVariant | undefined>(undefined);
  readonly ask = output<string>();
  protected readonly css = computed(() => withVariant('bx-prompt-bar', this.variant()));
  protected readonly draft = signal('');
  protected readonly off = computed(() => !this.draft().trim() || this.busy());
  protected use(s: string): void { this.draft.set(s); this.focusLater('.bx-prompt-input'); }
  protected send(): void { if (this.off()) { return; } const t = this.draft().trim(); this.draft.set(''); this.ask.emit(t); }
}

/** Speak to the assistant: pressed while listening; the screen does the listening. [(listening)]. */
@Component({
  selector: 'bx-voice-pill', changeDetection: OnPush,
  template: `<button type="button" [class]="listening() ? 'bx-voice-pill is-listening' : 'bx-voice-pill'" [attr.data-testid]="testID() || null" [attr.aria-pressed]="listening()" (click)="listening.set(!listening())">
    <span class="bx-voice-waves" aria-hidden="true"><span></span><span></span><span></span></span><span>{{ listening() ? listeningLabel() : label() }}</span></button>`,
})
export class VoicePill extends Part {
  readonly label = input('Speak');
  readonly listeningLabel = input('Listening… press to stop');
  readonly listening = model(false);
}

/** A chip that calls the bank (a tel: link). */
@Component({
  selector: 'bx-call-chip', changeDetection: OnPush,
  template: `<a class="bx-call-chip" [href]="href()" [attr.aria-label]="label() + ', ' + number()" [attr.data-testid]="testID() || null"><span class="bx-call-icon" aria-hidden="true">✆</span><span>{{ label() }}</span></a>`,
})
export class CallChip extends Part {
  readonly label = input('Call the bank');
  readonly number = input.required<string>();
  protected readonly href = computed(() => `tel:${this.number().replace(/[^\d+]/g, '')}`);
}

/** Waiting: a grid of squares that pulse, said once. */
@Component({
  selector: 'bx-lattice-loader', changeDetection: OnPush,
  template: `<span class="bx-lattice" role="status" [attr.data-testid]="testID() || null"><span class="bx-lattice-grid" aria-hidden="true">@for (n of steps; track $index) {<span [class]="'bx-d-' + n"></span>}</span><span class="bx-visually-hidden">{{ label() }}</span></span>`,
})
export class LatticeLoader extends Part {
  readonly label = input('Loading');
  protected readonly steps = [0, 2, 4, 2, 4, 6, 4, 6, 8];
}

/** Group 7's components, for a screen's imports. */
export const G7_COMPONENTS = [RollingDigits, CountUp, SplitFlapBoard, RevealDigits, BlurInText, TextReveal, RotatingText, ShimmerText, GradientText, TypedText, FocusWord, ScrollFloatText,
  FadeInContent, ScrollReveal, ScrollExpand, EdgeBlur, GlareHover, MagneticButton, HighlightBorder, ClickBurst, Marquee, AnimatedList, SpotlightCard, TiltCard, FlipCard, CardStack,
  GlowBorderCard, BentoGrid, Carousel, ElasticSlider, OptionWheel, PillNav, DockNav, CardNav, StaggeredMenu, DocumentFolder, ScrollStack, ProfileCard, GlassPanel, GradientBackdrop,
  SoftAurora, SilkBackdrop, DotGrid, LineWaves, LightBeams, Topography, ParticleBackdrop, SlideToConfirm, HoldToConfirm, OtpSlots, ReceiptTear, SuccessCheck, SwipeRow, SwipeToast,
  BellToggle, SquishSwitch, JellyRadio, GlideSelect, RubberSegment, ScrubField, BudgetGauge, StatusMark, FavouriteHeart, PeekRating, WarmTooltip, PromptBar, VoicePill, CallChip,
  LatticeLoader] as const;
