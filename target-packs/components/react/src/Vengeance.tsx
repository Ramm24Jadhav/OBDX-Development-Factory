/*
 * Showcase components ported from Vengeance UI (https://github.com/Ashutoshx7/VengenceUI): the share sheet, glass dock,
 * aurora hero, reveal loader, border beam and masked avatars, rewritten on the pack's own parts and bx- classes (no
 * framer-motion, GSAP or Tailwind), with the same markup as bx-vengeance.js in the premium JET pack. Under reduced
 * motion each shows its end state at once.
 *
 * MIT License
 *
 * Copyright (c) 2025-2026 Ashutoshx7
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
 * Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';

import { Sheet, initials } from './G1';
import { reducedMotion } from './motion';

const stagger = (i: number) => `bx-d-${Math.max(0, Math.min(i, 19))}`;

/* ---------- ShareSheet ---------- */

export type ShareChannel = 'copy' | 'email' | 'sms' | 'system';
export interface ShareSheetProps {
  testID?: string;
  /** The trigger button's text. */
  label?: string;
  heading?: string;
  /** What is shared: a reference, account details or a receipt line. */
  text: string;
  /** A link shared with the text (http or https only). */
  url?: string;
  onShare?: (channel: ShareChannel) => void;
}

const safeUrl = (u?: string) => { try { return u && /^https?:$/.test(new URL(u).protocol) ? u : ''; } catch { return ''; } };
/** The text and link as one message. */
export const shareBody = (text: string, url?: string) => [text, safeUrl(url)].filter(Boolean).join('\n');

/** A bottom sheet of ways to share: copy, email, messages and the device's own share. */
export function ShareSheet({ testID, label = 'Share', heading = 'Share', text, url, onShare }: ShareSheetProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const body = shareBody(text, url);
  const system = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const done = (c: ShareChannel, msg = '') => { setNote(msg); onShare?.(c); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(body); done('copy', 'Copied. Paste it anywhere.'); } catch { setNote('Could not copy. Select the text and copy it yourself.'); }
  };
  const go = (c: 'email' | 'sms') => {
    const q = encodeURIComponent(body);
    window.location.assign(c === 'email' ? `mailto:?subject=${encodeURIComponent(heading)}&body=${q}` : `sms:?body=${q}`);
    done(c);
  };
  const share = () => navigator.share({ title: heading, text, url: safeUrl(url) || undefined }).then(() => done('system'), () => setNote(''));
  const items: [ShareChannel, string, string, () => void][] = [['copy', 'Copy', '⧉', copy], ['email', 'Email', '✉', () => go('email')], ['sms', 'Messages', '✆', () => go('sms')]];
  if (system) { items.push(['system', 'More', '⋯', share]); }
  return (
    <span className="bx-share" data-testid={testID}>
      <button type="button" className="bx-btn bx-btn--outlined bx-share-trigger" onClick={() => { setNote(''); setOpen(true); }}><span aria-hidden="true">⇪</span> {label}</button>
      <Sheet open={open} onOpenChange={setOpen} heading={heading} position="bottom">
        <p className="bx-share-text">{body}</p>
        <ul className="bx-share-grid">
          {items.map(([c, name, icon, act], i) => <li key={c} className={stagger(i * 2)}><button type="button" className="bx-share-dest" onClick={act}><span className={`bx-share-icon is-${c}`} aria-hidden="true">{icon}</span><span>{name}</span></button></li>)}
        </ul>
        <p className="bx-share-note" role="status">{note}</p>
      </Sheet>
    </span>
  );
}

/* ---------- GlassDock ---------- */

export interface DockEntry { id: string; label: string; icon?: string }
export interface GlassDockProps { testID?: string; label?: string; items: ReadonlyArray<DockEntry>; value?: string; onAction?: (id: string) => void }

/** A frosted dock of shortcuts; the one under the pointer lifts and one label glides above it. */
export function GlassDock({ testID, label = 'Shortcuts', items, value, onAction }: GlassDockProps) {
  const [at, setAt] = useState<number | null>(null);
  const [from, setFrom] = useState<'left' | 'right' | ''>('');
  const point = (i: number) => { setFrom(at === null || at === i ? '' : i > at ? 'right' : 'left'); setAt(i); };
  return (
    <nav className="bx-glass-dock" aria-label={label} data-testid={testID} onPointerLeave={() => setAt(null)}
         onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setAt(null); } }}>
      {at !== null && items[at] ? <span className={'bx-dock-label is-at-' + Math.min(at, 9)} aria-hidden="true"><span key={items[at].id} className={from ? 'is-from-' + from : ''}>{items[at].label}</span></span> : null}
      <ul>
        {items.map((o, i) => (
          <li key={o.id}>
            <button type="button" className="bx-dock-item" aria-label={o.label} aria-current={o.id === value ? 'page' : undefined}
                    onPointerEnter={() => point(i)} onFocus={() => point(i)} onClick={() => onAction?.(o.id)}>
              <span className="bx-dock-icon" aria-hidden="true">{o.icon ?? o.label.charAt(0)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ---------- AuroraHero ---------- */

export interface AuroraHeroProps { testID?: string; heading: string; text?: string; still?: boolean; children?: ReactNode }

/** A hero with drifting bands of light behind fluted glass and the heading on top. */
export function AuroraHero({ testID, heading, text, still, children }: AuroraHeroProps) {
  return (
    <section className={'bx-aurora-hero' + (still ? ' is-still' : '')} data-testid={testID}>
      <span className="bx-aurora-bands" aria-hidden="true" /><span className="bx-aurora-flutes" aria-hidden="true" />
      <div className="bx-aurora-content"><h2 className="bx-aurora-title">{heading}</h2>{text ? <p className="bx-aurora-text">{text}</p> : null}{children}</div>
    </section>
  );
}

/* ---------- RevealLoader ---------- */

export type RevealOrder = 'start' | 'end' | 'center' | 'edges';
export type RevealExit = 'down' | 'up' | 'fade' | 'shrink';
export interface RevealLoaderProps {
  testID?: string;
  /** The word on the curtain, the bank's name or Loading. */
  text?: string;
  /** While true the curtain covers the content; false lifts it. */
  loading?: boolean;
  order?: RevealOrder;
  exit?: RevealExit;
  onComplete?: () => void;
  children?: ReactNode;
}

const BARS = 10;
/** The stagger step of bar i for an order (0 to 9). */
export const revealStep = (i: number, order: RevealOrder = 'start') =>
  order === 'end' ? BARS - 1 - i : order === 'center' ? Math.floor(Math.abs(i - (BARS - 1) / 2)) : order === 'edges' ? 4 - Math.floor(Math.abs(i - (BARS - 1) / 2)) : i;

/** A curtain of bars and a word over the content; when loading ends the bars lift one after another. */
export function RevealLoader({ testID, text = 'Loading', loading = true, order = 'start', exit = 'down', onComplete, children }: RevealLoaderProps) {
  const [gone, setGone] = useState(!loading);
  const done = useRef(onComplete);
  done.current = onComplete;
  useEffect(() => {
    if (loading) { setGone(false); return undefined; }
    const t = setTimeout(() => { setGone(true); done.current?.(); }, reducedMotion() ? 0 : 1500);
    return () => clearTimeout(t);
  }, [loading]);
  return (
    <div className={`bx-reveal is-${exit}` + (loading ? '' : ' is-lifting')} data-testid={testID}>
      <div className="bx-reveal-content" aria-busy={loading || undefined} inert={!gone || undefined}>{children}</div>
      {gone ? null : (
        <div className="bx-reveal-curtain" role="status">
          {Array.from({ length: BARS }, (_, i) => <span key={i} className={`bx-reveal-bar ${stagger(revealStep(i, order) * 2)}`} aria-hidden="true" />)}
          <span className="bx-reveal-word">{text.split('').map((c, i) => <span key={i} className={`bx-ch ${stagger(i)}`} aria-hidden="true">{c === ' ' ? ' ' : c}</span>)}<span className="bx-visually-hidden">{text}</span></span>
        </div>
      )}
    </div>
  );
}

/* ---------- BorderBeam ---------- */

export interface BorderBeamProps { testID?: string; /** Seconds for one lap. */ duration?: number; still?: boolean; children?: ReactNode }

/** A card with a light that runs round its border, to draw the eye to an offer or a pending task. */
export function BorderBeam({ testID, duration = 8, still, children }: BorderBeamProps) {
  const lap = Math.min(Math.max(Math.round(duration), 2), 20);
  return <div className={`bx-card bx-border-beam is-lap-${lap}` + (still ? ' is-still' : '')} data-testid={testID}><span className="bx-beam" aria-hidden="true" />{children}</div>;
}

/* ---------- MaskedAvatars ---------- */

export interface Person { name: string; src?: string }
export interface MaskedAvatarsProps { testID?: string; label?: string; people: ReadonlyArray<Person>; /** Shown before the rest are counted. */ max?: number }

/** People as overlapping avatars, each cut out where the next one sits; the one under the pointer lifts and shows its name. */
export function MaskedAvatars({ testID, label = 'People', people, max = 5 }: MaskedAvatarsProps) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <ul className="bx-masked-avatars" aria-label={label} data-testid={testID}>
      {shown.map((p, i) => (
        <li key={`${p.name}-${i}`} className={'bx-masked-avatar' + (i < shown.length - 1 || rest ? ' is-cut' : '')}>
          <span className="bx-masked-face" role="img" aria-label={p.name} tabIndex={0}>
            {p.src ? <img className="bx-avatar" src={p.src} alt="" /> : <span className="bx-avatar" aria-hidden="true">{initials(p.name)}</span>}
          </span>
          <span className="bx-masked-name" aria-hidden="true">{p.name}</span>
        </li>
      ))}
      {rest > 0 ? <li className="bx-masked-avatar is-more"><span className="bx-avatar" aria-label={`and ${rest} more`}>+{rest}</span></li> : null}
    </ul>
  );
}
