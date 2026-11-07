/*
 * Premium JET elements ported from Vengeance UI (https://github.com/Ashutoshx7/VengenceUI): bx-share-sheet,
 * bx-glass-dock, bx-aurora-hero, bx-reveal-loader, bx-border-beam and bx-masked-avatars, rewritten as Knockout
 * composites on the pack's kit and bx- classes (no framer-motion, GSAP or Tailwind), with the same markup as
 * Vengeance.tsx in the React pack. Only APIs JET 6 has. Under reduced motion each shows its end state at once.
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
define(['ojs/ojcomposite', './bx-core', './bx-motion', './bx-g1'], function (Composite, bx, motion, g1) {
  'use strict';
  var ko = bx.ko;
  var k = g1.kit;
  var txt = k.txt, iff = k.iff, each = k.each, base = k.base, register = k.register, str = k.str, bool = k.bool, num = k.num, arr = k.arr;
  var kinds = {};
  var d = function (i) { return 'bx-d-' + Math.max(0, Math.min(i, 19)); };

  /* ---------- bx-share-sheet: a bottom sheet of ways to share ---------- */
  var safeUrl = function (u) { try { return u && /^https?:$/.test(new URL(u).protocol) ? u : ''; } catch (e) { return ''; } };
  var shareBody = function (text, url) { return [text, safeUrl(url)].filter(Boolean).join('\n'); };
  function ShareKind(context) {
    var self = this;
    base(self, context, 'bx-share');
    self.open = ko.observable(false);
    self.note = ko.observable('');
    self.body = ko.pureComputed(function () { return shareBody(self.props.text, self.props.url); });
    var done = function (c, msg) { self.note(msg || ''); bx.fire(self.element, 'ojShare', { channel: c }); };
    var act = function (c) {
      var body = self.body();
      if (c === 'copy') {
        var fail = function () { self.note('Could not copy. Select the text and copy it yourself.'); };
        try { navigator.clipboard.writeText(body).then(function () { done('copy', 'Copied. Paste it anywhere.'); }, fail); } catch (e) { fail(); }
      } else if (c === 'system') {
        navigator.share({ title: self.props.heading, text: self.props.text, url: safeUrl(self.props.url) || undefined }).then(function () { done('system'); }, function () { self.note(''); });
      } else {
        var q = encodeURIComponent(body);
        window.location.assign(c === 'email' ? 'mailto:?subject=' + encodeURIComponent(self.props.heading) + '&body=' + q : 'sms:?body=' + q);
        done(c);
      }
    };
    self.dests = ko.pureComputed(function () {
      var l = [['copy', 'Copy', '⧉'], ['email', 'Email', '✉'], ['sms', 'Messages', '✆']];
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') { l.push(['system', 'More', '⋯']); }
      return l.map(function (o, i) { return { id: o[0], name: o[1], icon: o[2], css: d(i * 2), iconCss: 'bx-share-icon is-' + o[0], act: function () { act(o[0]); } }; });
    });
    self.show = function () { self.note(''); self.open(true); };
    self.css = ko.pureComputed(function () { return 'bx-share' + bx.variantClass(self.props.variant); });
    self.bodyCss = ko.pureComputed(function () { return 'bx-share-body' + bx.variantClass(self.props.variant); });
  }
  kinds.share = { model: ShareKind, events: { ojShare: { bubbles: true } }, props: { label: str('Share'), heading: str('Share'), text: str(), url: str(), variant: str() },
    view: '<span :class="[[css]]"><button type="button" class="bx-btn bx-btn--outlined bx-share-trigger" on-click="[[show]]"><span aria-hidden="true">⇪</span> ' + txt('$properties.label') + '</button>'
      + '<bx-sheet open="{{open}}" heading="[[$properties.heading]]" position="bottom"><div :class="[[bodyCss]]"><p class="bx-share-text">' + txt('body') + '</p>'
      + '<ul class="bx-share-grid">' + each('dests', 's', '<li :class="[[s.data.css]]"><button type="button" class="bx-share-dest" on-click="[[s.data.act]]"><span :class="[[s.data.iconCss]]" aria-hidden="true">'
        + txt('s.data.icon') + '</span><span>' + txt('s.data.name') + '</span></button></li>') + '</ul>'
      + '<p class="bx-share-note" role="status">' + txt('note') + '</p></div></bx-sheet></span>' };

  /* ---------- bx-glass-dock: a frosted dock; one label glides to the shortcut under the pointer ---------- */
  function DockKind(context) {
    var self = this;
    base(self, context, 'bx-dock');
    self.at = ko.observable(null);
    var from = ko.observable('');
    var point = function (i) { var at = self.at(); from(at === null || at === i ? '' : i > at ? 'right' : 'left'); self.at(i); };
    self.items = ko.pureComputed(function () {
      return k.list(self.props.items).map(function (o, i) {
        return { id: o.id, label: o.label, icon: o.icon || o.label.charAt(0), current: o.id === self.props.value ? 'page' : null,
          point: function () { point(i); }, act: function () { bx.fire(self.element, 'ojAction', { value: o.id }); } };
      });
    });
    // One entry, rebuilt when the shortcut changes, so the label's slide plays again
    self.label = ko.pureComputed(function () {
      var i = self.at();
      var o = i === null ? null : self.items()[i];
      return o ? [{ text: o.label, from: from() ? 'is-from-' + from() : '' }] : [];
    });
    // The label stays while it moves (so it glides); its text is rebuilt
    self.labelCss = ko.pureComputed(function () { return 'bx-dock-label is-at-' + Math.min(self.at() || 0, 9); });
    self.css = ko.pureComputed(function () { return 'bx-glass-dock' + bx.variantClass(self.props.variant); });
    self.leave = function () { self.at(null); };
    self.focusOut = function (event) { if (!event.currentTarget.contains(event.relatedTarget)) { self.at(null); } };
  }
  kinds.dock = { model: DockKind, events: k.ACTION, props: { label: str('Shortcuts'), items: arr(), value: str(), variant: str() },
    view: '<nav :class="[[css]]" :aria-label="[[$properties.label]]" on-pointerleave="[[leave]]" on-focusout="[[focusOut]]">'
      + iff('at() !== null', '<span :class="[[labelCss]]" aria-hidden="true">' + each('label', 'l', '<span :class="[[l.data.from]]">' + txt('l.data.text') + '</span>') + '</span>')
      + '<ul>' + each('items', 'o', '<li><button type="button" class="bx-dock-item" :aria-label="[[o.data.label]]" :aria-current="[[o.data.current]]" on-pointerenter="[[o.data.point]]"'
        + ' on-focus="[[o.data.point]]" on-click="[[o.data.act]]"><span class="bx-dock-icon" aria-hidden="true">' + txt('o.data.icon') + '</span></button></li>') + '</ul></nav>' };

  /* ---------- bx-aurora-hero: bands of light behind fluted glass, the heading on top ---------- */
  function AuroraKind(context) {
    var self = this;
    base(self, context, 'bx-aurora');
    self.css = ko.pureComputed(function () { return 'bx-aurora-hero' + bx.variantClass(self.props.variant) + (self.props.still ? ' is-still' : ''); });
  }
  kinds.aurora = { model: AuroraKind, props: { heading: str(), text: str(), still: bool(), variant: str() },
    view: '<section :class="[[css]]"><span class="bx-aurora-bands" aria-hidden="true"></span><span class="bx-aurora-flutes" aria-hidden="true"></span><div class="bx-aurora-content">'
      + '<h2 class="bx-aurora-title">' + txt('$properties.heading') + '</h2>' + iff('$properties.text', '<p class="bx-aurora-text">' + txt('$properties.text') + '</p>')
      + '<oj-bind-slot></oj-bind-slot></div></section>' };

  /* ---------- bx-reveal-loader: a curtain of bars over the content that lifts when loading ends ---------- */
  var BARS = 10;
  var revealStep = function (i, order) {
    var mid = Math.floor(Math.abs(i - (BARS - 1) / 2));
    return order === 'end' ? BARS - 1 - i : order === 'center' ? mid : order === 'edges' ? 4 - mid : i;
  };
  function RevealKind(context) {
    var self = this;
    base(self, context, 'bx-reveal');
    var timer = null;
    self.gone = ko.observable(!self.props.loading);
    self.css = ko.pureComputed(function () { return 'bx-reveal is-' + (self.props.exit || 'down') + bx.variantClass(self.props.variant) + (self.props.loading ? '' : ' is-lifting'); });
    self.busy = ko.pureComputed(function () { return self.props.loading ? 'true' : null; });
    self.inert = ko.pureComputed(function () { return self.gone() ? null : true; });
    self.bars = ko.pureComputed(function () { var l = []; for (var i = 0; i < BARS; i++) { l.push('bx-reveal-bar ' + d(revealStep(i, self.props.order) * 2)); } return l; });
    self.chars = ko.pureComputed(function () { return String(self.props.text || '').split('').map(function (c, i) { return { ch: c === ' ' ? ' ' : c, css: 'bx-ch ' + d(i) }; }); });
    var clear = function () { if (timer) { window.clearTimeout(timer); timer = null; } };
    var lift = function () {
      clear();
      if (self.props.loading) { self.gone(false); return; }
      timer = window.setTimeout(function () { timer = null; self.gone(true); bx.fire(self.element, 'ojComplete', {}); }, motion.reducedMotion() ? 0 : 1500);
    };
    self.propertyChanged = function (e) { if (e.property === 'loading') { lift(); } };
    self.disconnected = clear;
  }
  kinds.reveal = { model: RevealKind, events: { ojComplete: { bubbles: true } }, props: { text: str('Loading'), loading: bool(true), order: str('start'), exit: str('down'), variant: str() },
    view: '<div :class="[[css]]"><div class="bx-reveal-content" :aria-busy="[[busy]]" :inert="[[inert]]"><oj-bind-slot></oj-bind-slot></div>'
      + iff('!gone()', '<div class="bx-reveal-curtain" role="status">' + each('bars', 'b', '<span :class="[[b.data]]" aria-hidden="true"></span>')
        + '<span class="bx-reveal-word">' + each('chars', 'c', '<span :class="[[c.data.css]]" aria-hidden="true">' + txt('c.data.ch') + '</span>')
        + '<span class="bx-visually-hidden">' + txt('$properties.text') + '</span></span></div>') + '</div>' };

  /* ---------- bx-border-beam: a light that runs round a card's border ---------- */
  function BeamKind(context) {
    var self = this;
    base(self, context, 'bx-beam');
    self.css = ko.pureComputed(function () {
      var lap = Math.min(Math.max(Math.round(Number(self.props.duration) || 8), 2), 20);
      return 'bx-card bx-border-beam is-lap-' + lap + bx.variantClass(self.props.variant) + (self.props.still ? ' is-still' : '');
    });
  }
  kinds.beam = { model: BeamKind, props: { duration: num(8), still: bool(), variant: str() },
    view: '<div :class="[[css]]"><span class="bx-beam" aria-hidden="true"></span><oj-bind-slot></oj-bind-slot></div>' };

  /* ---------- bx-masked-avatars: overlapping avatars, each cut where the next sits ---------- */
  function MaskedKind(context) {
    var self = this;
    base(self, context, 'bx-masked');
    var max = function () { var m = Number(self.props.max); return m > 0 ? m : 5; };
    self.rest = ko.pureComputed(function () { return Math.max(0, (self.props.people || []).length - max()); });
    self.css = ko.pureComputed(function () { return 'bx-masked-avatars' + bx.variantClass(self.props.variant); });
    self.restLabel = ko.pureComputed(function () { return 'and ' + self.rest() + ' more'; });
    self.restText = ko.pureComputed(function () { return '+' + self.rest(); });
    self.shown = ko.pureComputed(function () {
      var l = (self.props.people || []).slice(0, max());
      return l.map(function (p, i) { return { name: p.name, src: p.src || '', initials: k.initials(p.name), css: 'bx-masked-avatar' + (i < l.length - 1 || self.rest() ? ' is-cut' : '') }; });
    });
  }
  kinds.masked = { model: MaskedKind, props: { label: str('People'), people: arr(), max: num(5), variant: str() },
    view: '<ul :class="[[css]]" :aria-label="[[$properties.label]]">' + each('shown', 'p', '<li :class="[[p.data.css]]"><span class="bx-masked-face" role="img" :aria-label="[[p.data.name]]" tabindex="0">'
      + iff('p.data.src', '<img class="bx-avatar" :src="[[p.data.src]]" alt=""/>') + iff('!p.data.src', '<span class="bx-avatar" aria-hidden="true">' + txt('p.data.initials') + '</span>')
      + '</span><span class="bx-masked-name" aria-hidden="true">' + txt('p.data.name') + '</span></li>')
      + iff('rest() > 0', '<li class="bx-masked-avatar is-more"><span class="bx-avatar" :aria-label="[[restLabel]]">' + txt('restText') + '</span></li>') + '</ul>' };

  var elements = [
    register('bx-share-sheet', kinds.share), register('bx-glass-dock', kinds.dock), register('bx-aurora-hero', kinds.aurora), register('bx-reveal-loader', kinds.reveal),
    register('bx-border-beam', kinds.beam), register('bx-masked-avatars', kinds.masked)
  ];

  return { elements: elements, kinds: kinds, kit: { shareBody: shareBody, revealStep: revealStep } };
});
