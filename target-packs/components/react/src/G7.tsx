/*
 * Group 7: text effects, motion, showcase, backdrops and micro interactions, our own components written clean-room (no
 * code taken, ported or translated from any effects library), the same markup and bx- classes as bx-g7.js in the
 * premium JET pack. Every effect is CSS, the Web Animations API or a few timers; text that moves is also there whole
 * for screen readers; under reduced motion each shows its end state at once.
 */
import { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';

import { ActionMenu, ActionMenuProps, SegmentsProps, SideNav, SideNavProps, Slider, SliderProps, ToggleGroup, Tooltip, arrow, initials } from './G1';
import { ChoiceCards, ChoiceCardsProps, Detail, DetailList, QuickActions, QuickActionsProps, ReceiptProps, TransactionReceipt, money } from './G2';
import { CodeInput, CodeProps, Setting, SettingProps, masked } from './G3';
import { FeedbackRating, RatingProps } from './G5';
import { reducedMotion } from './motion';

type Opt<P, K extends keyof P> = Omit<P, K> & Partial<Pick<P, K>>;
type Vars = CSSProperties & Record<`--${string}`, string>;

/** A stagger step class (bx-d-0 to bx-d-19), so delays need no inline style. */
export const stagger = (i: number) => `bx-d-${Math.min(i, 19)}`;
const chars = (text: string) => (text || '').split('').map((c, i) => ({ ch: c === ' ' ? ' ' : c, css: `bx-ch ${stagger(i)}` }));
const words = (text: string) => (text || '').split(/\s+/).filter(Boolean);

/** Calls fn every ms while it returns true; nothing under reduced motion. */
function useEvery(ms: number, fn: () => boolean, deps: unknown[]) {
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    if (reducedMotion()) { return undefined; }
    let t: ReturnType<typeof setTimeout> | null = null;
    const run = () => { t = setTimeout(() => { if (f.current()) { run(); } }, ms); };
    run();
    return () => { if (t) { clearTimeout(t); } };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Sets CSS variables from where the pointer is over the element (0 to 1 across and down). */
function pointer(e: PointerEvent<HTMLElement>, set: (s: CSSStyleDeclaration, x: number, y: number) => void) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  set(el.style, r.width ? (e.clientX - r.left) / r.width : 0.5, r.height ? (e.clientY - r.top) / r.height : 0.5);
}

const Hidden = ({ children }: { children: ReactNode }) => <span className="bx-visually-hidden">{children}</span>;

/* ---------- text effects ---------- */

/** A number whose digits roll to their place when it changes. */
export function RollingDigits({ testID, value, currency }: { testID?: string; value: number | string; currency?: string }) {
  const text = money(value, currency);
  return (
    <span className="bx-rolling" data-testid={testID}><Hidden>{text}</Hidden>
      <span className="bx-rolling-face" aria-hidden="true">
        {text.split('').map((c, i) => (c >= '0' && c <= '9'
          ? <span key={i} className="bx-roll-col"><span className={`bx-roll-strip is-d-${c}`}>{'0123456789'.split('').map((n) => <span key={n}>{n}</span>)}</span></span>
          : <span key={i} className="bx-roll-sep">{c}</span>))}
      </span>
    </span>
  );
}

export interface CountUpProps { testID?: string; value: number; from?: number; duration?: number; currency?: string; prefix?: string; suffix?: string }
/** Counts up to a figure; screen readers hear the figure once. */
export function CountUp({ testID, value, from = 0, duration = 1200, currency, prefix = '', suffix = '' }: CountUpProps) {
  const [now, setNow] = useState(reducedMotion() ? value : from);
  const step = useRef(0);
  const fmt = (n: number) => prefix + (money(Math.round(n * 100) / 100, currency) || String(n)) + suffix;
  useEvery(Math.max(10, Math.round(duration / 30)), () => {
    step.current += 1;
    const p = step.current / 30;
    setNow(p >= 1 ? value : from + (value - from) * (1 - (1 - p) ** 3));
    return p < 1;
  }, [value]);
  return <span className="bx-count-up" data-testid={testID}><Hidden>{fmt(value)}</Hidden><span aria-hidden="true">{fmt(now)}</span></span>;
}

/** Rates on flip tiles, each row read as a whole. */
export function SplitFlapBoard({ testID, heading = 'Exchange rates', items }: { testID?: string; heading?: string; items: ReadonlyArray<{ label: string; value: string }> }) {
  return (
    <section className="bx-panel bx-flap" aria-label={heading || undefined} data-testid={testID}>
      {heading ? <h3 className="bx-panel-title">{heading}</h3> : null}
      <ul className="bx-flap-rows">
        {items.map((o) => (
          <li key={o.label} className="bx-flap-row"><Hidden>{`${o.label} ${o.value}`}</Hidden><span className="bx-flap-label" aria-hidden="true">{o.label}</span>
            <span className="bx-flap-tiles" aria-hidden="true">{chars(o.value).map((t, i) => <span key={i} className={`${t.css} bx-flap-tile`}>{t.ch}</span>)}</span></li>
        ))}
      </ul>
    </section>
  );
}

/** An account number masked to its last four digits; Show reveals it digit by digit. */
export function RevealDigits({ testID, label = 'Account number', value }: { testID?: string; label?: string; value: string }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const text = shown ? value : masked(value);
  return (
    <div className="bx-field bx-reveal-digits" data-testid={testID}>
      <span className="bx-label" id={id}>{label}</span>
      <div className="bx-control is-readonly" role="group" aria-labelledby={id}>
        <span className="bx-input bx-mono bx-sensitive-value"><Hidden>{text}</Hidden><span aria-hidden="true">{chars(text).map((t, i) => <span key={`${shown}${i}`} className={t.css}>{t.ch}</span>)}</span></span>
        <button type="button" className="bx-reveal" aria-pressed={shown} aria-label={`${shown ? 'Hide' : 'Show'} ${label}`} onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
      </div>
    </div>
  );
}

/** Words that come into focus one after another. */
export function BlurInText({ testID, text }: { testID?: string; text: string }) {
  return <p className="bx-fx-text bx-blur-in" data-testid={testID}><Hidden>{text}</Hidden><span aria-hidden="true">{words(text).map((w, i) => <span key={i} className={`bx-word ${stagger(i)}`}>{w} </span>)}</span></p>;
}
/** Text that a sliding edge uncovers. */
export function TextReveal({ testID, text, animated = true }: { testID?: string; text: string; animated?: boolean }) {
  return <span className={'bx-fx-text bx-text-reveal' + (animated ? ' is-animated' : '')} data-testid={testID}>{text}</span>;
}

export interface RotatingTextProps { testID?: string; prefix?: string; words: ReadonlyArray<string>; interval?: number }
/** One word after another after a fixed start; screen readers hear all the words once. */
export function RotatingText({ testID, prefix, words: list, interval = 2200 }: RotatingTextProps) {
  const [at, setAt] = useState(0);
  useEvery(interval, () => { setAt((n) => n + 1); return true; }, [interval]);
  const all = (prefix ? `${prefix} ` : '') + (list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}` : list.join(''));
  return (
    <span className="bx-fx-text bx-rotating" data-testid={testID}><Hidden>{all}</Hidden>
      <span aria-hidden="true">{prefix ? `${prefix} ` : ''}<span key={at} className="bx-rotating-word">{list.length ? list[at % list.length] : ''}</span></span>
    </span>
  );
}
/** Text with a light that runs across it. */
export function ShimmerText({ testID, text, animated = true }: { testID?: string; text: string; animated?: boolean }) {
  return <span className={'bx-fx-text bx-shimmer-text' + (animated ? ' is-animated' : '')} data-testid={testID}>{text}</span>;
}
/** Text in the brand gradient, still or moving. */
export function GradientText({ testID, text, animated = false }: { testID?: string; text: string; animated?: boolean }) {
  return <span className={'bx-fx-text bx-gradient-text' + (animated ? ' is-animated' : '')} data-testid={testID}>{text}</span>;
}

/** Text typed out letter by letter (the assistant's answer); screen readers hear it whole. */
export function TypedText({ testID, text, speed = 35 }: { testID?: string; text: string; speed?: number }) {
  const [count, setCount] = useState(reducedMotion() ? text.length : 0);
  const at = useRef(count);
  useEffect(() => { at.current = reducedMotion() ? text.length : 0; setCount(at.current); }, [text]);
  useEvery(speed, () => { at.current = Math.min(text.length, at.current + 1); setCount(at.current); return at.current < text.length; }, [text, speed]);
  const typing = count < text.length;
  return <span className="bx-fx-text bx-typed" data-testid={testID}><Hidden>{text}</Hidden><span aria-hidden="true">{text.slice(0, count)}<span className={'bx-caret' + (typing ? ' is-typing' : '')} /></span></span>;
}

/** A sentence with one word in focus at a time. */
export function FocusWord({ testID, text, interval = 1800 }: { testID?: string; text: string; interval?: number }) {
  const [at, setAt] = useState(0);
  useEvery(interval, () => { setAt((n) => n + 1); return true; }, [interval]);
  const list = words(text);
  return <p className="bx-fx-text bx-focus-word" data-testid={testID}><Hidden>{text}</Hidden><span aria-hidden="true">{list.map((w, i) => <span key={i} className={'bx-word' + (i === at % Math.max(1, list.length) ? ' is-focus' : '')}>{w} </span>)}</span></p>;
}
/** Letters that float up as the text scrolls into view. */
export function ScrollFloatText({ testID, text }: { testID?: string; text: string }) {
  return <p className="bx-fx-text bx-scroll-float" data-testid={testID}><Hidden>{text}</Hidden><span aria-hidden="true">{chars(text).map((c, i) => <span key={i} className={c.css}>{c.ch}</span>)}</span></p>;
}

/* ---------- motion: wrappers for the screen's own content ---------- */

type Entry = 'fadeup' | 'scale' | 'slide' | 'blur';
export interface WrapProps { testID?: string; children?: ReactNode }

/** Content that fades, scales, slides or sharpens in when it appears. */
export function FadeInContent({ testID, effect = 'fadeup', delay = 0, children }: WrapProps & { effect?: Entry; delay?: number }) {
  return <div className={`bx-fx bx-fade-in is-${effect}` + (delay ? ` ${stagger(delay)}` : '')} data-testid={testID}>{children}</div>;
}

/** Content that comes in when it scrolls into view (shown at once without IntersectionObserver or under reduced motion). */
export function ScrollReveal({ testID, effect = 'fadeup', children }: WrapProps & { effect?: Entry }) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(() => reducedMotion() || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen || !box.current) { return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(box.current);
    return () => io.disconnect();
  }, [seen]);
  return <div ref={box} className={`bx-fx bx-scroll-reveal is-${effect}` + (seen ? ' is-in' : '')} data-testid={testID}>{children}</div>;
}
const wrapper = (css: string) => function Wrapper({ testID, children }: WrapProps) { return <div className={`bx-fx ${css}`} data-testid={testID}>{children}</div>; };
/** Content that grows to full width as it scrolls into view. */
export const ScrollExpand = wrapper('bx-scroll-expand');
/** A scrolling area whose top and bottom edges fade. */
export const EdgeBlur = wrapper('bx-edge-blur');
/** Content with a glare that crosses it on hover and focus. */
export const GlareHover = wrapper('bx-glare');
/** Content inside a moving gradient border. */
export const HighlightBorder = wrapper('bx-highlight-border');
/** A frosted glass panel. */
export const GlassPanel = wrapper('bx-glass-panel');

/** A primary button that leans toward the pointer. */
export function MagneticButton({ testID, label, disabled, onAction }: { testID?: string; label: string; disabled?: boolean; onAction?: () => void }) {
  return (
    <button type="button" className="bx-btn bx-btn--callToAction bx-magnetic" data-testid={testID} disabled={disabled}
            onPointerMove={(e) => pointer(e, (s, x, y) => { s.setProperty('--bx-mx', `${((x - 0.5) * 12).toFixed(1)}px`); s.setProperty('--bx-my', `${((y - 0.5) * 10).toFixed(1)}px`); })}
            onPointerLeave={(e) => { e.currentTarget.style.setProperty('--bx-mx', '0px'); e.currentTarget.style.setProperty('--bx-my', '0px'); }} onClick={onAction}>
      <span className="bx-btn-label">{label}</span>
    </button>
  );
}

/** Content where a click sends out a small burst of dots (decoration only). */
export function ClickBurst({ testID, children }: WrapProps) {
  const burst = (e: MouseEvent<HTMLDivElement>) => {
    if (reducedMotion()) { return; }
    const host = e.currentTarget;
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
  };
  return <div className="bx-fx bx-click-burst" data-testid={testID} onClick={burst}>{children}</div>;
}

/** Items that scroll past; it stops on hover and focus, and Pause stops it for good. */
export function Marquee({ testID, label = 'Updates', items, speed = 'normal' }: { testID?: string; label?: string; items: ReadonlyArray<string>; speed?: 'slow' | 'normal' }) {
  const [paused, setPaused] = useState(reducedMotion());
  return (
    <section className="bx-marquee" aria-label={label} data-testid={testID}>
      <div className="bx-marquee-window">
        <div className={`bx-marquee-track is-${speed}` + (paused ? ' is-paused' : '')}>
          <ul className="bx-marquee-list">{items.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <ul className="bx-marquee-list" aria-hidden="true">{items.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      </div>
      <button type="button" className="bx-btn bx-btn--borderless bx-btn--sm bx-marquee-toggle" onClick={() => setPaused(!paused)}>{paused ? 'Play' : 'Pause'}</button>
    </section>
  );
}

/* ---------- showcase ---------- */

export interface ListEntry { title: string; meta?: string }
/** A list whose rows come in one after another. */
export function AnimatedList({ testID, label, items }: { testID?: string; label?: string; items: ReadonlyArray<string | ListEntry> }) {
  return (
    <ul className="bx-rows bx-animated-list" aria-label={label || undefined} data-testid={testID}>
      {items.map((x, i) => { const o = typeof x === 'string' ? { title: x } : x; return <li key={i} className={`bx-row bx-alist-item ${stagger(i)}`}><span className="bx-row-main"><strong>{o.title}</strong>{o.meta ? <span className="bx-row-meta">{o.meta}</span> : null}</span></li>; })}
    </ul>
  );
}

export interface FxCardProps { testID?: string; heading: string; text?: string; children?: ReactNode }
const pointerCard = (css: string) => function FxCard({ testID, heading, text, children }: FxCardProps) {
  const id = useId();
  return (
    <article className={`bx-card ${css}`} aria-labelledby={id} data-testid={testID}
             onPointerMove={(e) => pointer(e, (s, x, y) => { s.setProperty('--bx-sx', `${Math.round(x * 100)}%`); s.setProperty('--bx-sy', `${Math.round(y * 100)}%`);
               s.setProperty('--bx-rx', `${((0.5 - y) * 8).toFixed(2)}deg`); s.setProperty('--bx-ry', `${((x - 0.5) * 10).toFixed(2)}deg`); })}
             onPointerLeave={(e) => { e.currentTarget.style.setProperty('--bx-rx', '0deg'); e.currentTarget.style.setProperty('--bx-ry', '0deg'); }}>
      <h3 className="bx-card-title" id={id}>{heading}</h3>{text ? <p className="bx-thing-text">{text}</p> : null}{children}
    </article>
  );
};
/** A card with a light that follows the pointer. */
export const SpotlightCard = pointerCard('bx-spotlight-card');
/** A card that tilts toward the pointer. */
export const TiltCard = pointerCard('bx-tilt-card');
/** A card with a glowing border. */
export const GlowBorderCard = pointerCard('bx-glow-border-card');

export interface FlipCardProps { testID?: string; heading: string; front: string; back: string; flipped?: boolean; onFlippedChange?: (flipped: boolean) => void; backLabel?: string; frontLabel?: string }
/** A card that turns over to show its details; the face turned away is hidden from screen readers and the keyboard. */
export function FlipCard({ testID, heading, front, back, flipped, onFlippedChange, backLabel = 'Show details', frontLabel = 'Back' }: FlipCardProps) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState(false);
  const on = flipped ?? own;
  const flip = () => { setOwn(!on); onFlippedChange?.(!on); setTimeout(() => box.current?.querySelector<HTMLElement>(on ? '.bx-flip-front .bx-flip-button' : '.bx-flip-back .bx-flip-button')?.focus(), 0); };
  return (
    <div className={'bx-flip-card' + (on ? ' is-flipped' : '')} ref={box} data-testid={testID}>
      <div className="bx-flip-inner">
        <section className="bx-card bx-flip-face bx-flip-front" aria-hidden={on || undefined} aria-labelledby={id}>
          <h3 className="bx-card-title" id={id}>{heading}</h3><p className="bx-thing-text">{front}</p>
          <button type="button" className="bx-thing-action bx-flip-button" tabIndex={on ? -1 : undefined} onClick={flip}>{backLabel}</button>
        </section>
        <section className="bx-card bx-flip-face bx-flip-back" aria-hidden={!on || undefined} aria-label={heading}>
          <p className="bx-thing-text">{back}</p>
          <button type="button" className="bx-thing-action bx-flip-button" tabIndex={on ? undefined : -1} onClick={flip}>{frontLabel}</button>
        </section>
      </div>
    </div>
  );
}

export interface DeckItem { title: string; text?: string }
/** Cards stacked one behind another; Next and Previous go round, and the position is said. */
export function CardStack({ testID, label = 'Cards', items }: { testID?: string; label?: string; items: ReadonlyArray<DeckItem> }) {
  const [at, setAt] = useState(0);
  const n = items.length;
  return (
    <section className="bx-card-stack" aria-label={label} data-testid={testID}>
      <div className="bx-deck">
        {items.map((o, i) => { const depth = (i - at + n) % Math.max(1, n); return (
          <article key={i} className={`bx-card bx-deck-card is-depth-${Math.min(depth, 3)}`} aria-hidden={depth !== 0 || undefined}><h3 className="bx-card-title">{o.title}</h3><p className="bx-thing-text">{o.text}</p></article>
        ); })}
      </div>
      <div className="bx-deck-controls">
        <button type="button" className="bx-page" aria-label="Previous card" onClick={() => setAt((at - 1 + n) % Math.max(1, n))}>‹</button>
        <span role="status">{n ? `Card ${at + 1} of ${n}` : ''}</span>
        <button type="button" className="bx-page" aria-label="Next card" onClick={() => setAt((at + 1) % Math.max(1, n))}>›</button>
      </div>
    </section>
  );
}

export interface BentoTile { id: string; title: string; text?: string; figure?: string; size?: 'sm' | 'wide' | 'tall' | 'lg' }
/** A dashboard of tiles of different sizes; with onAction each opens. */
export function BentoGrid({ testID, label, items, onAction }: { testID?: string; label?: string; items: ReadonlyArray<BentoTile>; onAction?: (tile: BentoTile) => void }) {
  return (
    <ul className="bx-bento" aria-label={label || undefined} data-testid={testID}>
      {items.map((o, i) => {
        const body = <><span className="bx-tile-label">{o.title}</span>{o.figure ? <span className="bx-tile-value">{o.figure}</span> : null}{o.text ? <span className="bx-tile-meta">{o.text}</span> : null}</>;
        return <li key={o.id} className={`bx-bento-tile is-${o.size ?? 'sm'} ${stagger(i)}`}>{onAction ? <button type="button" className="bx-bento-button" onClick={() => onAction(o)}>{body}</button> : <div className="bx-bento-body">{body}</div>}</li>;
      })}
    </ul>
  );
}

/** Slides one at a time with Previous, Next and a dot each; nothing moves by itself. */
export function Carousel({ testID, label = 'Highlights', slides }: { testID?: string; label?: string; slides: ReadonlyArray<DeckItem> }) {
  const [at, setAt] = useState(0);
  const n = slides.length;
  return (
    <section className="bx-carousel" aria-roledescription="carousel" aria-label={label} data-testid={testID}>
      <div className="bx-slides" aria-live="polite">
        {slides.map((o, i) => <div key={i} className={'bx-slide' + (i === at ? ' is-on' : '')} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${n}`} hidden={i !== at}>
          <h3 className="bx-card-title">{o.title}</h3><p className="bx-thing-text">{o.text}</p></div>)}
      </div>
      <div className="bx-deck-controls">
        <button type="button" className="bx-page" aria-label="Previous slide" onClick={() => setAt((at - 1 + n) % Math.max(1, n))}>‹</button>
        <span className="bx-dots">{slides.map((_, i) => <button key={i} type="button" className={'bx-dot' + (i === at ? ' is-on' : '')} aria-label={`Slide ${i + 1}`} aria-current={i === at || undefined} onClick={() => setAt(i)} />)}</span>
        <button type="button" className="bx-page" aria-label="Next slide" onClick={() => setAt((at + 1) % Math.max(1, n))}>›</button>
      </div>
    </section>
  );
}

/** An amount on a range whose thumb stretches as it moves. */
export function ElasticSlider(p: Opt<SliderProps, 'label' | 'value'> & { value: number }) { return <div className="bx-fx-elastic"><Slider label="Amount" max={10000} step={50} {...p} /></div>; }

export interface WheelProps { testID?: string; label: string; options: ReadonlyArray<string>; value: string; onChange?: (value: string) => void }
/** A picker that turns like a wheel (a listbox): arrow keys move, the chosen option is in the middle. */
export function OptionWheel({ testID, label, options, value, onChange }: WheelProps) {
  const id = useId();
  const key = (e: KeyboardEvent) => {
    const next = arrow(e.key, Math.max(0, options.indexOf(value)), options.length);
    if (next >= 0) { e.preventDefault(); onChange?.(options[next]); }
  };
  return (
    <div className="bx-field bx-option-wheel" data-testid={testID}>
      <span className="bx-label" id={id}>{label}</span>
      <ul className="bx-wheel" role="listbox" tabIndex={0} aria-labelledby={id} aria-activedescendant={options.includes(value) ? `${id}-o${options.indexOf(value)}` : undefined} onKeyDown={key}>
        {options.map((o, i) => <li key={o} role="option" id={`${id}-o${i}`} className={'bx-wheel-option' + (o === value ? ' is-on' : '')} aria-selected={o === value} onClick={() => onChange?.(o)}>{o}</li>)}
      </ul>
    </div>
  );
}

/** Sections in a row of pills; the current one is raised. */
export function PillNav(p: SideNavProps) { return <div className="bx-fx-pill-nav"><SideNav {...p} /></div>; }
/** Shortcuts in a dock that swell under the pointer. */
export function DockNav(p: Opt<QuickActionsProps, 'label'>) { return <div className="bx-fx-dock"><QuickActions label="Dock" {...p} /></div>; }

export interface CardNavItem { id: string; title: string; text?: string }
/** Sections as cards that lift on hover and focus. */
export function CardNav({ testID, label = 'Explore', items, onAction }: { testID?: string; label?: string; items: ReadonlyArray<CardNavItem>; onAction?: (id: string) => void }) {
  return (
    <nav className="bx-card-nav" aria-label={label} data-testid={testID}>
      <ul>{items.map((o, i) => <li key={o.id} className={`bx-card-nav-item ${stagger(i)}`}><button type="button" className="bx-card-nav-button" onClick={() => onAction?.(o.id)}><strong>{o.title}</strong>{o.text ? <span>{o.text}</span> : null}</button></li>)}</ul>
    </nav>
  );
}
/** A menu whose items come in one after another. */
export function StaggeredMenu(p: ActionMenuProps) { return <div className="bx-fx-stagger-menu"><ActionMenu label="Menu" {...p} /></div>; }

export interface FolderDoc { id: string; title: string; meta?: string }
/** A folder that opens to show its documents, each to open. */
export function DocumentFolder({ testID, heading = 'Documents', items, onAction }: { testID?: string; heading?: string; items: ReadonlyArray<FolderDoc>; onAction?: (doc: FolderDoc) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <section className={'bx-folder' + (open ? ' is-open' : '')} data-testid={testID}>
      <button type="button" className="bx-folder-tab" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="bx-folder-icon" aria-hidden="true" /><span className="bx-row-main"><strong>{heading}</strong><span className="bx-row-meta">{items.length} {items.length === 1 ? 'document' : 'documents'}</span></span>
      </button>
      {open ? (
        <ul className="bx-rows bx-folder-docs" id={id}>
          {items.map((o, i) => <li key={o.id} className={`bx-row ${stagger(i)}`}><span className="bx-row-main"><strong>{o.title}</strong>{o.meta ? <span className="bx-row-meta">{o.meta}</span> : null}</span>
            <button type="button" className="bx-btn bx-btn--borderless bx-btn--sm" aria-label={`Open ${o.title}`} onClick={() => onAction?.(o)}>Open</button></li>)}
        </ul>
      ) : null}
    </section>
  );
}

/** Cards that stack as the page scrolls. */
export function ScrollStack({ testID, label, items }: { testID?: string; label?: string; items: ReadonlyArray<DeckItem> }) {
  return <ul className="bx-scroll-stack" aria-label={label || undefined} data-testid={testID}>{items.map((o, i) => <li key={i} className={`bx-card bx-scroll-stack-card is-n-${Math.min(i, 9)}`}><h3 className="bx-card-title">{o.title}</h3><p className="bx-thing-text">{o.text}</p></li>)}</ul>;
}

export interface ProfileCardProps { testID?: string; name: string; jobTitle?: string; src?: string; items?: ReadonlyArray<Detail>; actionLabel?: string; onAction?: () => void }
/** A person with their photo or initials, their role and details. */
export function ProfileCard({ testID, name, jobTitle, src, items = [], actionLabel, onAction }: ProfileCardProps) {
  const id = useId();
  return (
    <article className="bx-card bx-profile-card" aria-labelledby={id} data-testid={testID}>
      <div className="bx-profile-head">
        {src ? <img className="bx-avatar is-lg" src={src} alt="" /> : <span className="bx-avatar is-lg" aria-hidden="true">{initials(name)}</span>}
        <span className="bx-row-main"><h3 className="bx-card-title" id={id}>{name}</h3>{jobTitle ? <span className="bx-row-meta">{jobTitle}</span> : null}</span>
      </div>
      {items.length ? <DetailList items={items} /> : null}
      {actionLabel ? <button type="button" className="bx-btn bx-btn--outlined" onClick={onAction}>{actionLabel}</button> : null}
    </article>
  );
}

/* ---------- backdrops ---------- */

export interface BackdropProps { testID?: string; still?: boolean; children?: ReactNode }
const backdrop = (look: string) => function Backdrop({ testID, still, children }: BackdropProps) {
  return <div className={`bx-backdrop is-${look}` + (still ? ' is-still' : '')} data-testid={testID}><span className="bx-backdrop-layer" aria-hidden="true" /><div className="bx-backdrop-content">{children}</div></div>;
};
/** A soft moving gradient behind the content. */
export const GradientBackdrop = backdrop('gradient');
/** Slow coloured light behind the content. */
export const SoftAurora = backdrop('aurora');
/** Folds of colour like silk. */
export const SilkBackdrop = backdrop('silk');
/** A fading grid of dots. */
export const DotGrid = backdrop('dots');
/** Lines like waves. */
export const LineWaves = backdrop('waves');
/** Beams of light from the top. */
export const LightBeams = backdrop('beams');
/** Contour lines like a map. */
export const Topography = backdrop('topography');

/** Specks drifting up on a canvas; still under reduced motion. */
export function ParticleBackdrop({ testID, count = 40, still, children }: BackdropProps & { count?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const c = el?.getContext?.('2d');
    if (!el || !c) { return undefined; }
    const dots = Array.from({ length: count }, () => ({ x: Math.random() * (el.clientWidth || 300), y: Math.random() * (el.clientHeight || 160), r: 1 + Math.random() * 2, v: 0.15 + Math.random() * 0.35 }));
    const draw = () => {
      const w = (el.width = el.clientWidth || 300);
      const h = (el.height = el.clientHeight || 160);
      c.clearRect(0, 0, w, h);
      c.fillStyle = getComputedStyle(el).color;
      dots.forEach((p) => { p.y -= p.v; if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; } c.globalAlpha = 0.35; c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill(); });
    };
    draw();
    if (still || reducedMotion()) { return undefined; }
    const t = setInterval(draw, 40);
    return () => clearInterval(t);
  }, [count, still]);
  return <div className="bx-backdrop is-particles" data-testid={testID}><canvas ref={canvas} className="bx-backdrop-layer" aria-hidden="true" /><div className="bx-backdrop-content">{children}</div></div>;
}

/* ---------- micro interactions ---------- */

export interface SlideConfirmProps { testID?: string; label?: string; doneLabel?: string; disabled?: boolean; onConfirm?: () => void }
/** Slide the handle to the end to confirm; pressing it (or Enter) confirms too, so no one has to drag. */
export function SlideToConfirm({ testID, label = 'Slide to pay', doneLabel = 'Paid', disabled, onConfirm }: SlideConfirmProps) {
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; width: number; last: number } | null>(null);
  const dragged = useRef(false);
  const confirm = () => { if (!done && !disabled) { setDone(true); onConfirm?.(); } };
  return (
    <div className={'bx-slide-confirm' + (done ? ' is-done' : '') + (dragging ? ' is-dragging' : '')} data-testid={testID}>
      <span className="bx-slide-text" aria-hidden="true">{done ? doneLabel : label}</span>
      <button type="button" className="bx-slide-handle" aria-label={done ? doneLabel : `${label}: slide, or press to confirm`} disabled={disabled}
              onPointerDown={(e) => { if (done || disabled) { return; } const t = e.currentTarget.parentElement!.getBoundingClientRect(); drag.current = { x: e.clientX, width: t.width - e.currentTarget.getBoundingClientRect().width, last: 0 }; setDragging(true); e.currentTarget.setPointerCapture?.(e.pointerId); }}
              onPointerMove={(e) => { const g = drag.current; if (!g) { return; } g.last = Math.max(0, Math.min(g.width, e.clientX - g.x)); e.currentTarget.style.setProperty('--bx-slide', `${g.last}px`); }}
              onPointerUp={(e) => { const g = drag.current; drag.current = null; setDragging(false); e.currentTarget.style.setProperty('--bx-slide', '0px'); dragged.current = !!g && g.last > 4; if (g && g.last >= g.width * 0.9) { confirm(); } }}
              onClick={() => { if (dragged.current) { dragged.current = false; return; } confirm(); }}>
        <span aria-hidden="true">{done ? '✓' : '›'}</span>
      </button>
      {done ? <span className="bx-visually-hidden" role="status">{doneLabel}</span> : null}
    </div>
  );
}

export interface HoldProps { testID?: string; label?: string; doneLabel?: string; duration?: number; disabled?: boolean; onConfirm?: () => void }
/** Press and hold (or hold Space or Enter) for the duration to confirm; letting go early cancels. */
export function HoldToConfirm({ testID, label = 'Hold to confirm', doneLabel = 'Confirmed', duration = 1500, disabled, onConfirm }: HoldProps) {
  const id = useId();
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (t.current) { clearTimeout(t.current); } }, []);
  const start = () => { if (done || disabled || t.current) { return; } setHolding(true); t.current = setTimeout(() => { t.current = null; setHolding(false); setDone(true); onConfirm?.(); }, duration); };
  const cancel = () => { if (t.current) { clearTimeout(t.current); t.current = null; } setHolding(false); };
  return (
    <>
      <button type="button" className={'bx-btn bx-btn--callToAction bx-hold' + (holding ? ' is-holding' : '') + (done ? ' is-done' : '')} data-testid={testID} disabled={disabled}
              aria-describedby={id} style={{ '--bx-hold': `${duration}ms` } as Vars} onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel}
              onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { cancel(); } }}>
        <span className="bx-hold-fill" aria-hidden="true" /><span className="bx-btn-label">{done ? doneLabel : label}</span>
      </button>
      <span className="bx-visually-hidden" id={id}>{`Press and hold for ${Math.round(duration / 100) / 10} seconds`}</span>
      {done ? <span className="bx-visually-hidden" role="status">{doneLabel}</span> : null}
    </>
  );
}

/** A one-time code in rounded slots that pop as they fill. */
export function OtpSlots(p: Opt<CodeProps, 'label'>) { return <div className="bx-fx-otp"><CodeInput label="Enter the code" {...p} /></div>; }
/** A receipt with a torn edge that rises in. */
export function ReceiptTear(p: ReceiptProps) { return <div className="bx-fx-torn"><TransactionReceipt {...p} /></div>; }

/** A tick that draws itself, with what was done (said once). */
export function SuccessCheck({ testID, label = 'Done', text }: { testID?: string; label?: string; text?: string }) {
  return (
    <div className="bx-success-check" role="status" data-testid={testID}>
      <svg className="bx-check-svg" viewBox="0 0 52 52" aria-hidden="true" focusable="false"><circle className="bx-check-ring" cx="26" cy="26" r="24" /><path className="bx-check-tick" d="M15 27 l7 7 l15 -16" /></svg>
      <strong className="bx-receipt-title">{label}</strong>{text ? <span className="bx-thing-text">{text}</span> : null}
    </div>
  );
}

export interface SwipeAction { value: string; label: string; tone?: 'danger' }
export interface SwipeRowProps { testID?: string; heading: string; meta?: string; value?: string; actions: ReadonlyArray<SwipeAction>; onAction?: (value: string) => void }
/** A row whose actions show when it is swiped left, and to the keyboard when focus is in it. */
export function SwipeRow({ testID, heading, meta, value, actions, onAction }: SwipeRowProps) {
  const [open, setOpen] = useState(false);
  const x0 = useRef<number | null>(null);
  return (
    <div className={'bx-swipe-row' + (open ? ' is-open' : '')} data-testid={testID} onPointerDown={(e) => { x0.current = e.clientX; }}
         onPointerUp={(e) => { if (x0.current !== null) { const dx = e.clientX - x0.current; if (dx < -40) { setOpen(true); } else if (dx > 40) { setOpen(false); } } x0.current = null; }}>
      <div className="bx-swipe-actions">{actions.map((a) => <button key={a.value} type="button" className={'bx-swipe-action' + (a.tone ? ` is-${a.tone}` : '')} aria-label={`${a.label}: ${heading}`} onClick={() => { setOpen(false); onAction?.(a.value); }}>{a.label}</button>)}</div>
      <div className="bx-row bx-swipe-face"><span className="bx-row-main"><strong>{heading}</strong>{meta ? <span className="bx-row-meta">{meta}</span> : null}</span>{value ? <span className="bx-row-value">{value}</span> : null}</div>
    </div>
  );
}

/** A message the customer can swipe away, or close. */
export function SwipeToast({ testID, message, severity = 'confirmation', onClose }: { testID?: string; message: string; severity?: 'error' | 'warning' | 'confirmation' | 'info'; onClose?: () => void }) {
  const [gone, setGone] = useState(false);
  const x0 = useRef<number | null>(null);
  if (gone) { return null; }
  const close = () => { setGone(true); onClose?.(); };
  return (
    <div className={`bx-toast bx-swipe-toast is-${severity}`} role="status" data-testid={testID} onPointerDown={(e) => { x0.current = e.clientX; }}
         onPointerUp={(e) => { if (x0.current !== null && Math.abs(e.clientX - x0.current) > 60) { close(); } x0.current = null; }}>
      <span className="bx-toast-icon" aria-hidden="true">✓</span><span className="bx-toast-text">{message}</span>
      <button type="button" className="bx-btn bx-btn--borderless bx-btn--icon bx-btn--sm" aria-label="Close the message" onClick={close}><span aria-hidden="true">×</span></button>
    </div>
  );
}

export interface PressToggleProps { testID?: string; label?: string; name?: string; value: boolean; onChange?: (value: boolean) => void; disabled?: boolean }
const pressToggle = (look: string, glyph: string, labelDefault: string) => function PressToggle({ testID, label = labelDefault, name, value, onChange, disabled }: PressToggleProps) {
  return (
    <button type="button" className={`bx-press-toggle ${look}` + (value ? ' is-on' : '')} data-testid={testID} aria-pressed={value} aria-label={[label, name].filter(Boolean).join(' ')} disabled={disabled}
            onClick={() => onChange?.(!value)}><span className="bx-press-glyph" aria-hidden="true">{glyph}</span></button>
  );
};
/** Alerts on or off; the bell rings when they go on. */
export const BellToggle = pressToggle('bx-bell', '🔔', 'Alerts');
/** A payee as a favourite; the heart pops. */
export const FavouriteHeart = pressToggle('bx-heart', '♥', 'Favourite');

/** A switch whose knob squishes as it is pressed. */
export function SquishSwitch(p: SettingProps) { return <div className="bx-fx-squish"><Setting {...p} /></div>; }
/** Radio cards whose mark wobbles when chosen. */
export function JellyRadio(p: ChoiceCardsProps) { return <div className="bx-fx-jelly"><ChoiceCards {...p} /></div>; }
/** A segmented choice whose highlight glides. */
export function GlideSelect(p: SegmentsProps) { return <div className="bx-fx-glide"><ToggleGroup {...p} /></div>; }
/** A segmented choice that gives like rubber when pressed. */
export function RubberSegment(p: SegmentsProps) { return <div className="bx-fx-rubber"><ToggleGroup {...p} /></div>; }

export interface ScrubProps { testID?: string; label?: string; value: number; onChange?: (value: number) => void; min?: number; max?: number; step?: number; currency?: string }
/** An amount typed, or dragged left and right by the arrows beside the label. */
export function ScrubField({ testID, label = 'Amount', value, onChange, min = 0, max, step = 10, currency }: ScrubProps) {
  const id = useId();
  const g = useRef<{ x: number; v: number } | null>(null);
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, n));
  return (
    <div className="bx-field bx-scrub" data-testid={testID}>
      <div className="bx-slider-head"><label className="bx-label" htmlFor={id}>{label}</label>
        <span className="bx-scrub-handle" aria-hidden="true" onPointerDown={(e) => { g.current = { x: e.clientX, v: value }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
              onPointerMove={(e) => { if (g.current) { onChange?.(clamp(g.current.v + Math.round((e.clientX - g.current.x) / 8) * step)); } }} onPointerUp={() => { g.current = null; }}>⇔</span></div>
      <div className="bx-control">{currency ? <span className="bx-affix" aria-hidden="true">{currency}</span> : null}
        <input type="number" className="bx-input bx-num" inputMode="decimal" id={id} value={value} min={min} max={max} step={step} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) { onChange?.(clamp(n)); } }} /></div>
      <span className="bx-help">Drag the arrows, or type</span>
    </div>
  );
}

export interface GaugeProps { testID?: string; label?: string; value: number; max: number; unit?: string }
/** A half-circle gauge of a budget; over the budget it turns red and says so. */
export function BudgetGauge({ testID, label = 'Budget', value, max, unit }: GaugeProps) {
  const id = useId();
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const over = value > max;
  const u = unit ? ` ${unit}` : '';
  const text = `${value.toLocaleString()}${u} of ${max.toLocaleString()}${u}` + (over ? ', over budget' : '');
  return (
    <div className={'bx-gauge' + (over ? ' is-over' : share >= 0.9 ? ' is-near' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-valuetext={text}
         aria-labelledby={id} data-testid={testID}>
      <svg viewBox="0 0 100 56" aria-hidden="true" focusable="false"><path className="bx-gauge-track" d="M10 50 A40 40 0 0 1 90 50" /><path className="bx-gauge-fill" d="M10 50 A40 40 0 0 1 90 50" strokeDashoffset={Math.round(126 * (1 - share) * 10) / 10} /></svg>
      <span className="bx-gauge-label" id={id}>{label}</span><span className="bx-gauge-text">{text}</span>
    </div>
  );
}

/** A status as a mark and a word: success, error, pending or info. */
export function StatusMark({ testID, label, status = 'success' }: { testID?: string; label: string; status?: 'success' | 'error' | 'pending' | 'info' }) {
  return <span className={`bx-status-mark is-${status}`} data-testid={testID}><span className="bx-status-mark-icon" aria-hidden="true">{status === 'error' ? '!' : status === 'info' ? 'i' : ''}</span><span>{label}</span></span>;
}
/** Stars that lift as the pointer passes over them. */
export function PeekRating(p: RatingProps) { return <div className="bx-fx-peek"><FeedbackRating {...p} /></div>; }
/** A tooltip in warm colours. */
export function WarmTooltip(p: { testID?: string; label: string; text: string }) { return <div className="bx-fx-warm"><Tooltip {...p} /></div>; }

export interface PromptBarProps { testID?: string; label?: string; placeholder?: string; suggestions?: ReadonlyArray<string>; busy?: boolean; onAsk?: (text: string) => void }
/** The assistant's question box with suggestions; Enter or Ask sends. */
export function PromptBar({ testID, label = 'Ask the assistant', placeholder = 'Ask about your accounts', suggestions = [], busy, onAsk }: PromptBarProps) {
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const off = !draft.trim() || busy;
  const send = () => { if (off) { return; } const t = draft.trim(); setDraft(''); onAsk?.(t); };
  return (
    <div className="bx-prompt-bar" data-testid={testID}>
      <div className="bx-chip-row" role="group" aria-label={`Suggestions for ${label}`}>{suggestions.map((s) => <button key={s} type="button" className="bx-filter-chip" onClick={() => { setDraft(s); input.current?.focus(); }}>{s}</button>)}</div>
      <div className="bx-prompt-row">
        <div className="bx-control"><span className="bx-prompt-spark" aria-hidden="true">✦</span>
          <input ref={input} className="bx-input bx-prompt-input" aria-label={label} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} /></div>
        <button type="button" className="bx-btn bx-btn--callToAction" disabled={off} aria-busy={busy || undefined} onClick={send}>Ask</button>
      </div>
    </div>
  );
}

/** Speak to the assistant: pressed while listening; the screen does the listening. */
export function VoicePill({ testID, label = 'Speak', listeningLabel = 'Listening… press to stop', listening, onListeningChange }: { testID?: string; label?: string; listeningLabel?: string; listening: boolean; onListeningChange?: (on: boolean) => void }) {
  return (
    <button type="button" className={'bx-voice-pill' + (listening ? ' is-listening' : '')} data-testid={testID} aria-pressed={listening} onClick={() => onListeningChange?.(!listening)}>
      <span className="bx-voice-waves" aria-hidden="true"><span /><span /><span /></span><span>{listening ? listeningLabel : label}</span>
    </button>
  );
}

/** A chip that calls the bank (a tel: link). */
export function CallChip({ testID, label = 'Call the bank', number }: { testID?: string; label?: string; number: string }) {
  return <a className="bx-call-chip" href={`tel:${number.replace(/[^\d+]/g, '')}`} aria-label={`${label}, ${number}`} data-testid={testID}><span className="bx-call-icon" aria-hidden="true">✆</span><span>{label}</span></a>;
}

/** Waiting: a grid of squares that pulse, said once. */
export function LatticeLoader({ testID, label = 'Loading' }: { testID?: string; label?: string }) {
  return <span className="bx-lattice" role="status" data-testid={testID}><span className="bx-lattice-grid" aria-hidden="true">{[0, 2, 4, 2, 4, 6, 4, 6, 8].map((n, i) => <span key={i} className={`bx-d-${n}`} />)}</span><Hidden>{label}</Hidden></span>;
}

