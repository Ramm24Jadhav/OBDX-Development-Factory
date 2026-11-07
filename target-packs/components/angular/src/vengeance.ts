/*
 * Showcase components ported from Vengeance UI (https://github.com/Ashutoshx7/VengenceUI): the share sheet, glass dock,
 * aurora hero, reveal loader, border beam and masked avatars, rewritten on the pack's own parts and bx- classes (no
 * framer-motion, GSAP or Tailwind), with the same markup as Vengeance.tsx in the React pack and bx-vengeance.js in the
 * premium JET pack. Under reduced motion each shows its end state at once.
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
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';

import { Part, Sheet, initials } from './g1';
import { reducedMotion } from './motion';

const OnPush = ChangeDetectionStrategy.OnPush;
const stagger = (i: number): string => `bx-d-${Math.max(0, Math.min(i, 19))}`;
/** The class of a style variant (variants.json); nothing for the default look. */
const vc = (variant: string): string => (variant ? ' bx-v-' + variant : '');

/* ---------- ShareSheet ---------- */

export type ShareChannel = 'copy' | 'email' | 'sms' | 'system';
const safeUrl = (u?: string) => { try { return u && /^https?:$/.test(new URL(u).protocol) ? u : ''; } catch { return ''; } };
/** The text and link as one message. */
export const shareBody = (text: string, url?: string): string => [text, safeUrl(url)].filter(Boolean).join('\n');

/** A bottom sheet of ways to share: copy, email, messages and the device's own share. (share) says which. */
@Component({
  selector: 'bx-share-sheet', changeDetection: OnPush, imports: [Sheet],
  template: `<span [class]="'bx-share' + vc" [attr.data-testid]="testID() || null">
    <button type="button" class="bx-btn bx-btn--outlined bx-share-trigger" (click)="note.set(''); open.set(true)"><span aria-hidden="true">⇪</span> {{ label() }}</button>
    <bx-sheet [(open)]="open" [heading]="heading()" position="bottom"><div [class]="'bx-share-body' + vc">
      <p class="bx-share-text">{{ body() }}</p>
      <ul class="bx-share-grid">@for (d of dests(); track d.id) {<li [class]="d.css"><button type="button" class="bx-share-dest" (click)="act(d.id)"><span [class]="'bx-share-icon is-' + d.id" aria-hidden="true">{{ d.icon }}</span><span>{{ d.name }}</span></button></li>}</ul>
      <p class="bx-share-note" role="status">{{ note() }}</p>
    </div></bx-sheet></span>`,
})
export class ShareSheet extends Part {
  readonly label = input('Share');
  readonly heading = input('Share');
  readonly text = input.required<string>();
  readonly url = input('');
  readonly share = output<ShareChannel>();
  /** A style variant from variants.json; compact: icons in one row. */
  readonly variant = input<'' | 'compact'>('');
  protected get vc(): string { return vc(this.variant()); }
  protected readonly open = signal(false);
  protected readonly note = signal('');
  protected readonly body = computed(() => shareBody(this.text(), this.url()));
  protected readonly dests = computed(() => {
    const l: [ShareChannel, string, string][] = [['copy', 'Copy', '⧉'], ['email', 'Email', '✉'], ['sms', 'Messages', '✆']];
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { l.push(['system', 'More', '⋯']); }
    return l.map(([id, name, icon], i) => ({ id, name, icon, css: stagger(i * 2) }));
  });
  private done(c: ShareChannel, msg = ''): void { this.note.set(msg); this.share.emit(c); }
  protected async act(c: ShareChannel): Promise<void> {
    const body = this.body();
    if (c === 'copy') {
      try { await navigator.clipboard.writeText(body); this.done('copy', 'Copied. Paste it anywhere.'); } catch { this.note.set('Could not copy. Select the text and copy it yourself.'); }
    } else if (c === 'system') {
      navigator.share({ title: this.heading(), text: this.text(), url: safeUrl(this.url()) || undefined }).then(() => this.done('system'), () => this.note.set(''));
    } else {
      const q = encodeURIComponent(body);
      window.location.assign(c === 'email' ? `mailto:?subject=${encodeURIComponent(this.heading())}&body=${q}` : `sms:?body=${q}`);
      this.done(c);
    }
  }
}

/* ---------- GlassDock ---------- */

export interface DockEntry { id: string; label: string; icon?: string }

/** A frosted dock of shortcuts; the one under the pointer lifts and one label glides above it. (action) gives its id. */
@Component({
  selector: 'bx-glass-dock', changeDetection: OnPush,
  template: `<nav [class]="'bx-glass-dock' + vc" [attr.aria-label]="label()" [attr.data-testid]="testID() || null" (pointerleave)="at.set(null)" (focusout)="left($event)">
    @if (shown(); as s) {<span [class]="'bx-dock-label is-at-' + s.at" aria-hidden="true">@for (k of [s.key]; track k) {<span [class]="s.from ? 'is-from-' + s.from : ''">{{ s.label }}</span>}</span>}
    <ul>@for (o of items(); track o.id; let i = $index) {<li><button type="button" class="bx-dock-item" [attr.aria-label]="o.label"
      [attr.aria-current]="o.id === value() ? 'page' : null" (pointerenter)="point(i)" (focus)="point(i)" (click)="action.emit(o.id)">
      <span class="bx-dock-icon" aria-hidden="true">{{ o.icon || o.label.charAt(0) }}</span></button></li>}</ul></nav>`,
})
export class GlassDock extends Part {
  readonly label = input('Shortcuts');
  readonly items = input<ReadonlyArray<DockEntry>>([]);
  readonly value = input('');
  readonly action = output<string>();
  /** solid: an opaque dock. */
  readonly variant = input<'' | 'solid'>('');
  protected get vc(): string { return vc(this.variant()); }
  protected readonly at = signal<number | null>(null);
  private readonly from = signal<'left' | 'right' | ''>('');
  protected readonly shown = computed(() => {
    const i = this.at();
    const o = i === null ? undefined : this.items()[i];
    return o && i !== null ? { at: Math.min(i, 9), key: o.id, label: o.label, from: this.from() } : null;
  });
  /** Focus left the dock (not moved to another of its shortcuts). */
  protected left(e: FocusEvent): void { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) { this.at.set(null); } }
  protected point(i: number): void { const at = this.at(); this.from.set(at === null || at === i ? '' : i > at ? 'right' : 'left'); this.at.set(i); }
}

/* ---------- AuroraHero ---------- */

/** A hero with drifting bands of light behind fluted glass and the heading on top; projected content goes under the text. */
@Component({
  selector: 'bx-aurora-hero', changeDetection: OnPush,
  template: `<section [class]="'bx-aurora-hero' + vc + (still() ? ' is-still' : '')" [attr.data-testid]="testID() || null">
    <span class="bx-aurora-bands" aria-hidden="true"></span><span class="bx-aurora-flutes" aria-hidden="true"></span>
    <div class="bx-aurora-content"><h2 class="bx-aurora-title">{{ heading() }}</h2>@if (text()) {<p class="bx-aurora-text">{{ text() }}</p>}<ng-content /></div></section>`,
})
export class AuroraHero extends Part {
  readonly heading = input.required<string>();
  readonly text = input('');
  readonly still = input(false);
  /** centered: the heading in the middle. */
  readonly variant = input<'' | 'centered'>('');
  protected get vc(): string { return vc(this.variant()); }
}

/* ---------- RevealLoader ---------- */

export type RevealOrder = 'start' | 'end' | 'center' | 'edges';
export type RevealExit = 'down' | 'up' | 'fade' | 'shrink';
const BARS = 10;
/** The stagger step of bar i for an order (0 to 9). */
export const revealStep = (i: number, order: RevealOrder = 'start'): number =>
  order === 'end' ? BARS - 1 - i : order === 'center' ? Math.floor(Math.abs(i - (BARS - 1) / 2)) : order === 'edges' ? 4 - Math.floor(Math.abs(i - (BARS - 1) / 2)) : i;

/** A curtain of bars and a word over the content; when loading turns false the bars lift one after another, then (complete). */
@Component({
  selector: 'bx-reveal-loader', changeDetection: OnPush,
  template: `<div [class]="'bx-reveal is-' + exit() + vc + (loading() ? '' : ' is-lifting')" [attr.data-testid]="testID() || null">
    <div class="bx-reveal-content" [attr.aria-busy]="loading() || null" [attr.inert]="gone() ? null : ''"><ng-content /></div>
    @if (!gone()) {<div class="bx-reveal-curtain" role="status">@for (b of bars(); track $index) {<span [class]="b" aria-hidden="true"></span>}
      <span class="bx-reveal-word">@for (c of chars(); track $index) {<span [class]="c.css" aria-hidden="true">{{ c.ch }}</span>}<span class="bx-visually-hidden">{{ text() }}</span></span></div>}</div>`,
})
export class RevealLoader extends Part {
  readonly text = input('Loading');
  readonly loading = input(true);
  readonly order = input<RevealOrder>('start');
  readonly exit = input<RevealExit>('down');
  readonly complete = output<void>();
  /** gradient: the bars share one brand gradient. */
  readonly variant = input<'' | 'gradient'>('');
  protected get vc(): string { return vc(this.variant()); }
  protected readonly gone = signal(false);
  protected readonly bars = computed(() => Array.from({ length: BARS }, (_, i) => `bx-reveal-bar ${stagger(revealStep(i, this.order()) * 2)}`));
  protected readonly chars = computed(() => this.text().split('').map((c, i) => ({ ch: c === ' ' ? ' ' : c, css: `bx-ch ${stagger(i)}` })));
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => this.clear());
    effect(() => {
      const loading = this.loading();
      untracked(() => {
        this.clear();
        if (loading) { this.gone.set(false); return; }
        this.timer = setTimeout(() => { this.timer = null; this.gone.set(true); this.complete.emit(); }, reducedMotion() ? 0 : 1500);
      });
    });
  }
  private clear(): void { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
}

/* ---------- BorderBeam ---------- */

/** A card with a light that runs round its border, to draw the eye to an offer or a pending task. duration is seconds per lap. */
@Component({
  selector: 'bx-border-beam', changeDetection: OnPush,
  template: `<div [class]="'bx-card bx-border-beam is-lap-' + lap() + vc + (still() ? ' is-still' : '')" [attr.data-testid]="testID() || null"><span class="bx-beam" aria-hidden="true"></span><ng-content /></div>`,
})
export class BorderBeam extends Part {
  readonly duration = input(8);
  readonly still = input(false);
  /** double: two lights. */
  readonly variant = input<'' | 'double'>('');
  protected get vc(): string { return vc(this.variant()); }
  protected readonly lap = computed(() => Math.min(Math.max(Math.round(this.duration()), 2), 20));
}

/* ---------- MaskedAvatars ---------- */

export interface Person { name: string; src?: string }

/** People as overlapping avatars, each cut out where the next one sits; the one under the pointer lifts and shows its name. */
@Component({
  selector: 'bx-masked-avatars', changeDetection: OnPush,
  template: `<ul [class]="'bx-masked-avatars' + vc" [attr.aria-label]="label()" [attr.data-testid]="testID() || null">
    @for (p of shown(); track $index) {<li [class]="p.css"><span class="bx-masked-face" role="img" [attr.aria-label]="p.name" tabindex="0">
      @if (p.src) {<img class="bx-avatar" [src]="p.src" alt="" />} @else {<span class="bx-avatar" aria-hidden="true">{{ p.initials }}</span>}</span>
      <span class="bx-masked-name" aria-hidden="true">{{ p.name }}</span></li>}
    @if (rest() > 0) {<li class="bx-masked-avatar is-more"><span class="bx-avatar" [attr.aria-label]="'and ' + rest() + ' more'">+{{ rest() }}</span></li>}</ul>`,
})
export class MaskedAvatars extends Part {
  readonly label = input('People');
  readonly people = input<ReadonlyArray<Person>>([]);
  readonly max = input(5);
  /** ringed: a brand ring, no cut. */
  readonly variant = input<'' | 'ringed'>('');
  protected get vc(): string { return vc(this.variant()); }
  protected readonly rest = computed(() => Math.max(0, this.people().length - this.max()));
  protected readonly shown = computed(() => {
    const l = this.people().slice(0, this.max());
    return l.map((p, i) => ({ ...p, initials: initials(p.name), css: 'bx-masked-avatar' + (i < l.length - 1 || this.rest() ? ' is-cut' : '') }));
  });
}

export const VENGEANCE_COMPONENTS = [ShareSheet, GlassDock, AuroraHero, RevealLoader, BorderBeam, MaskedAvatars] as const;
