/*
 * Premium JET elements, group 7: five categories of effects, our own components written clean-room (no code taken,
 * ported or translated from any effects library). Text effects: bx-rolling-digits, bx-count-up, bx-split-flap-board,
 * bx-reveal-digits, bx-blur-in-text, bx-text-reveal, bx-rotating-text, bx-shimmer-text, bx-gradient-text,
 * bx-typed-text, bx-focus-word, bx-scroll-float-text. Motion: bx-fade-in-content, bx-scroll-reveal, bx-scroll-expand,
 * bx-edge-blur, bx-glare-hover, bx-magnetic-button, bx-highlight-border, bx-click-burst, bx-marquee. Showcase:
 * bx-animated-list, bx-spotlight-card, bx-tilt-card, bx-flip-card, bx-card-stack, bx-glow-border-card, bx-bento-grid,
 * bx-carousel, bx-elastic-slider, bx-option-wheel, bx-pill-nav, bx-dock-nav, bx-card-nav, bx-staggered-menu,
 * bx-document-folder, bx-scroll-stack, bx-profile-card, bx-glass-panel. Backdrops: bx-gradient-backdrop,
 * bx-soft-aurora, bx-silk-backdrop, bx-dot-grid, bx-line-waves, bx-light-beams, bx-topography, bx-particle-backdrop.
 * Micro interactions: bx-slide-to-confirm, bx-hold-to-confirm, bx-otp-slots, bx-receipt-tear, bx-success-check,
 * bx-swipe-row, bx-swipe-toast, bx-bell-toggle, bx-squish-switch, bx-jelly-radio, bx-glide-select, bx-rubber-segment,
 * bx-scrub-field, bx-budget-gauge, bx-status-mark, bx-favourite-heart, bx-peek-rating, bx-warm-tooltip, bx-prompt-bar,
 * bx-voice-pill, bx-call-chip, bx-lattice-loader.
 * Every effect is CSS, the Web Animations API or a few timers; text that moves is also there whole for screen readers;
 * under reduced motion each shows its end state at once. Pointer effects set CSS variables on the element itself.
 */
define(['ojs/ojcomposite', './bx-core', './bx-motion', './bx-g1', './bx-g2', './bx-g3', './bx-g5'], function (Composite, bx, motion, g1, g2, g3, g5) {
  'use strict';
  var ko = bx.ko;
  var k = g1.kit;
  var txt = k.txt, iff = k.iff, each = k.each, list = k.list, base = k.base, register = k.register, str = k.str, bool = k.bool, num = k.num, arr = k.arr;
  var money = g2.kit.money;
  var kinds = {};
  var hidden = function (expr) { return '<span class="bx-visually-hidden">' + txt(expr) + '</span>'; };
  /** A stagger step class (bx-d-0 to bx-d-19), so delays need no inline style. */
  var d = function (i) { return 'bx-d-' + Math.min(i, 19); };
  var chars = function (text) { return String(text || '').split('').map(function (c, i) { return { ch: c === ' ' ? ' ' : c, css: 'bx-ch ' + d(i) }; }); };
  var words = function (text) { return String(text || '').split(/\s+/).filter(Boolean).map(function (w, i) { return { w: w, css: 'bx-word ' + d(i) }; }); };
  /** Repeats fn every ms until stop() or the element leaves the page; nothing under reduced motion. */
  var every = function (vm, ms, fn) {
    var t = null;
    var run = function () { t = window.setTimeout(function () { t = null; if (fn() !== false) { run(); } }, ms); };
    vm.disconnected = function () { if (t) { window.clearTimeout(t); t = null; } };
    if (!motion.reducedMotion()) { run(); }
    return vm.disconnected;
  };
  /** A kind with its view inside a wrapper of an effect class. */
  var wrap = function (kind, css) { var w = k.copy(kind); w.view = '<div class="' + css + '">' + kind.view + '</div>'; return w; };
  /** Sets CSS variables from where the pointer is over the element (0 to 1 across, 0 to 1 down). */
  var pointer = function (event, names) {
    var el = event.currentTarget;
    if (!el || !el.getBoundingClientRect || !el.style) { return; }
    var r = el.getBoundingClientRect();
    var x = r.width ? (event.clientX - r.left) / r.width : 0.5;
    var y = r.height ? (event.clientY - r.top) / r.height : 0.5;
    names(el.style, x, y);
  };

  /* ---------- text effects ---------- */
  function RollingKind(context) {
    var self = this;
    base(self, context, 'bx-roll');
    self.text = ko.pureComputed(function () { return money(self.props.value, self.props.currency); });
    self.cols = ko.pureComputed(function () {
      return self.text().split('').map(function (c) { var digit = c >= '0' && c <= '9'; return { digit: digit, ch: c, css: 'bx-roll-strip is-d-' + (digit ? c : '0') }; });
    });
  }
  kinds.rolling = { model: RollingKind, props: { value: { type: 'any', value: 0 }, currency: str() },
    view: '<span class="bx-rolling">' + hidden('text') + '<span class="bx-rolling-face" aria-hidden="true">' + each('cols', 'c', iff('c.data.digit', '<span class="bx-roll-col"><span :class="[[c.data.css]]">'
      + '<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></span></span>')
      + iff('!c.data.digit', '<span class="bx-roll-sep">' + txt('c.data.ch') + '</span>')) + '</span></span>' };

  function CountKind(context) {
    var self = this;
    base(self, context, 'bx-count');
    var target = function () { return Number(self.props.value) || 0; };
    self.now = ko.observable(motion.reducedMotion() ? target() : Number(self.props.from) || 0);
    var fmt = function (n) { return money(Math.round(n * 100) / 100, self.props.currency) || String(n); };
    self.shown = ko.pureComputed(function () { return (self.props.prefix || '') + fmt(self.now()) + (self.props.suffix || ''); });
    self.final = ko.pureComputed(function () { return (self.props.prefix || '') + fmt(target()) + (self.props.suffix || ''); });
    var steps = 30;
    var step = 0;
    var start = self.now();
    every(self, Math.max(10, Math.round((self.props.duration || 1200) / steps)), function () {
      step += 1;
      var p = step / steps;
      self.now(start + (target() - start) * (1 - Math.pow(1 - p, 3)));
      if (step >= steps) { self.now(target()); return false; }
      return true;
    });
  }
  kinds.count = { model: CountKind, props: { value: num(0), from: num(0), duration: num(1200), currency: str(), prefix: str(), suffix: str() },
    view: '<span class="bx-count-up">' + hidden('final') + '<span aria-hidden="true">' + txt('shown') + '</span></span>' };

  function FlapKind(context) {
    var self = this;
    base(self, context, 'bx-flap');
    self.rows = ko.pureComputed(function () {
      return list(self.props.items).map(function (o) { var v = String(o.value !== undefined ? o.value : ''); return { label: o.label, said: o.label + ' ' + v, tiles: chars(v) }; });
    });
  }
  kinds.flap = { model: FlapKind, props: { heading: str(), items: arr() },
    view: '<section class="bx-panel bx-flap" :aria-label="[[$properties.heading || null]]">' + iff('$properties.heading', '<h3 class="bx-panel-title">' + txt('$properties.heading') + '</h3>')
      + '<ul class="bx-flap-rows">' + each('rows', 'r', '<li class="bx-flap-row">' + hidden('r.data.said') + '<span class="bx-flap-label" aria-hidden="true">' + txt('r.data.label') + '</span>'
        + '<span class="bx-flap-tiles" aria-hidden="true">' + each('r.data.tiles', 't', '<span :class="[[t.data.css + \' bx-flap-tile\']]">' + txt('t.data.ch') + '</span>') + '</span></li>') + '</ul></section>' };

  function RevealKind(context) {
    var self = this;
    base(self, context, 'bx-reveal');
    self.shown = ko.observable(false);
    self.text = ko.pureComputed(function () { return self.shown() ? String(self.props.value || '') : g3.kit.masked(self.props.value); });
    self.tiles = ko.pureComputed(function () { return chars(self.text()); });
    self.toggleText = ko.pureComputed(function () { return self.shown() ? 'Hide' : 'Show'; });
    self.toggleName = ko.pureComputed(function () { return (self.shown() ? 'Hide ' : 'Show ') + (self.props.label || 'the number'); });
    self.pressed = ko.pureComputed(function () { return self.shown() ? 'true' : 'false'; });
    self.toggle = function () { self.shown(!self.shown()); };
  }
  kinds.reveal = { model: RevealKind, props: { label: str('Account number'), value: str() },
    view: '<div class="bx-field bx-reveal-digits"><span class="bx-label" :id="[[id]]">' + txt('$properties.label') + '</span><div class="bx-control is-readonly" role="group" :aria-labelledby="[[id]]">'
      + '<span class="bx-input bx-mono bx-sensitive-value">' + hidden('text') + '<span aria-hidden="true">' + each('tiles', 't', '<span :class="[[t.data.css]]">' + txt('t.data.ch') + '</span>') + '</span></span>'
      + '<button type="button" class="bx-reveal" :aria-pressed="[[pressed]]" :aria-label="[[toggleName]]" on-click="[[toggle]]">' + txt('toggleText') + '</button></div></div>' };

  function WordsKind(context) {
    var self = this;
    base(self, context, 'bx-words');
    self.words = ko.pureComputed(function () { return words(self.props.text); });
    self.chars = ko.pureComputed(function () { return chars(self.props.text); });
  }
  kinds.blurin = { model: WordsKind, props: { text: str() },
    view: '<p class="bx-fx-text bx-blur-in">' + hidden('$properties.text') + '<span aria-hidden="true">' + each('words', 'w', '<span :class="[[w.data.css]]">' + txt('w.data.w') + '</span> ') + '</span></p>' };
  kinds.floattext = { model: WordsKind, props: { text: str() },
    view: '<p class="bx-fx-text bx-scroll-float">' + hidden('$properties.text') + '<span aria-hidden="true">' + each('chars', 'c', '<span :class="[[c.data.css]]">' + txt('c.data.ch') + '</span>') + '</span></p>' };
  var plainText = function (css) { return { model: WordsKind, props: { text: str(), animated: bool(true) }, view: '<span :class="[[\'bx-fx-text ' + css + '\' + ($properties.animated ? \' is-animated\' : \'\')]]">' + txt('$properties.text') + '</span>' }; };
  kinds.textreveal = plainText('bx-text-reveal');
  kinds.shimmer = plainText('bx-shimmer-text');
  kinds.gradient = plainText('bx-gradient-text');

  function RotatingKind(context) {
    var self = this;
    base(self, context, 'bx-rot');
    self.at = ko.observable(0);
    self.word = ko.pureComputed(function () { var w = self.props.words || []; return w.length ? String(w[self.at() % w.length]) : ''; });
    // A new row for each word, so its entry animation plays again
    self.shown = ko.pureComputed(function () { return [{ word: self.word(), at: self.at() }]; });
    self.all = ko.pureComputed(function () { var w = (self.props.words || []).map(String); return (self.props.prefix ? self.props.prefix + ' ' : '') + (w.length > 1 ? w.slice(0, -1).join(', ') + ' or ' + w[w.length - 1] : w.join('')); });
    every(self, self.props.interval || 2200, function () { self.at(self.at() + 1); return true; });
  }
  kinds.rotating = { model: RotatingKind, props: { prefix: str(), words: arr(), interval: num(2200) },
    view: '<span class="bx-fx-text bx-rotating">' + hidden('all') + '<span aria-hidden="true">' + iff('$properties.prefix', txt('$properties.prefix') + ' ')
      + '' + each('shown', 'w', '<span class="bx-rotating-word">' + txt('w.data.word') + '</span>') + '</span></span>' };

  function TypedKind(context) {
    var self = this;
    base(self, context, 'bx-typed');
    var full = function () { return String(self.props.text || ''); };
    self.count = ko.observable(motion.reducedMotion() ? full().length : 0);
    self.shown = ko.pureComputed(function () { return full().slice(0, self.count()); });
    self.typing = ko.pureComputed(function () { return self.count() < full().length; });
    every(self, self.props.speed || 35, function () { if (self.count() >= full().length) { return false; } self.count(self.count() + 1); return true; });
  }
  kinds.typed = { model: TypedKind, props: { text: str(), speed: num(35) },
    view: '<span class="bx-fx-text bx-typed">' + hidden('$properties.text') + '<span aria-hidden="true">' + txt('shown') + '<span :class="[[typing() ? \'bx-caret is-typing\' : \'bx-caret\']]"></span></span></span>' };

  function FocusKind(context) {
    var self = this;
    base(self, context, 'bx-focusw');
    self.at = ko.observable(0);
    self.words = ko.pureComputed(function () { var l = words(self.props.text); return l.map(function (w, i) { return { w: w.w, css: 'bx-word' + (i === self.at() % Math.max(1, l.length) ? ' is-focus' : '') }; }); });
    every(self, self.props.interval || 1800, function () { self.at(self.at() + 1); return true; });
  }
  kinds.focusword = { model: FocusKind, props: { text: str(), interval: num(1800) },
    view: '<p class="bx-fx-text bx-focus-word">' + hidden('$properties.text') + '<span aria-hidden="true">' + each('words', 'w', '<span :class="[[w.data.css]]">' + txt('w.data.w') + '</span> ') + '</span></p>' };

  /* ---------- motion: wrappers for the screen's own content ---------- */
  function WrapKind(context) {
    var self = this;
    base(self, context, 'bx-wrap');
    self.css = ko.pureComputed(function () { return 'bx-fx ' + self.props.effectClass + (self.props.effect ? ' is-' + self.props.effect : '') + (self.props.delay ? ' ' + d(self.props.delay) : ''); });
  }
  var wrapper = function (effectClass, extra) {
    var props = { effectClass: str(effectClass), effect: str(extra || ''), delay: num(0) };
    return { model: WrapKind, props: props, view: '<div :class="[[css]]"><oj-bind-slot></oj-bind-slot></div>' };
  };
  kinds.fadein = wrapper('bx-fade-in', 'fadeup');
  kinds.expand = wrapper('bx-scroll-expand');
  kinds.edgeblur = wrapper('bx-edge-blur');
  kinds.glare = wrapper('bx-glare');
  kinds.highlight = wrapper('bx-highlight-border');
  kinds.glass = wrapper('bx-glass-panel');
  kinds.glow = wrapper('bx-glow-card');

  function RevealOnScrollKind(context) {
    var self = this;
    base(self, context, 'bx-sr');
    self.inView = ko.observable(motion.reducedMotion() || typeof window.IntersectionObserver !== 'function');
    self.css = ko.pureComputed(function () { return 'bx-fx bx-scroll-reveal is-' + (self.props.effect || 'fadeup') + (self.inView() ? ' is-in' : ''); });
    var seen = null;
    self.connected = function () {
      if (self.inView() || !self.element.querySelector) { return; }
      seen = new window.IntersectionObserver(function (entries) { if (entries.some(function (e) { return e.isIntersecting; })) { self.inView(true); seen.disconnect(); } }, { threshold: 0.15 });
      var el = self.element.querySelector('.bx-scroll-reveal');
      if (el) { seen.observe(el); } else { self.inView(true); }
    };
    self.disconnected = function () { if (seen) { seen.disconnect(); } };
  }
  kinds.scrollreveal = { model: RevealOnScrollKind, props: { effect: str('fadeup') }, view: '<div :class="[[css]]"><oj-bind-slot></oj-bind-slot></div>' };

  function MagneticKind(context) {
    var self = this;
    base(self, context, 'bx-mag');
    self.move = function (event) { pointer(event, function (s, x, y) { s.setProperty('--bx-mx', ((x - 0.5) * 12).toFixed(1) + 'px'); s.setProperty('--bx-my', ((y - 0.5) * 10).toFixed(1) + 'px'); }); return true; };
    self.leave = function (event) { var s = event.currentTarget && event.currentTarget.style; if (s) { s.setProperty('--bx-mx', '0px'); s.setProperty('--bx-my', '0px'); } return true; };
    self.press = function () { if (!self.props.disabled) { bx.fire(self.element, 'ojAction', {}); } };
  }
  kinds.magnetic = { model: MagneticKind, events: k.ACTION, props: { label: str(), disabled: bool() },
    view: '<button type="button" class="bx-btn bx-btn--callToAction bx-magnetic" :disabled="[[$properties.disabled]]" on-pointermove="[[move]]" on-pointerleave="[[leave]]" on-click="[[press]]">'
      + '<span class="bx-btn-label">' + txt('$properties.label') + '</span></button>' };

  function BurstKind(context) {
    var self = this;
    base(self, context, 'bx-burst');
    self.burst = function (event) {
      var host = event.currentTarget;
      if (!host || !host.ownerDocument || motion.reducedMotion()) { return true; }
      var r = host.getBoundingClientRect();
      for (var i = 0; i < 8; i++) {
        var p = host.ownerDocument.createElement('span');
        p.className = 'bx-burst-dot bx-burst-' + i;
        p.setAttribute('aria-hidden', 'true');
        p.style.left = (event.clientX - r.left) + 'px';
        p.style.top = (event.clientY - r.top) + 'px';
        host.appendChild(p);
        window.setTimeout(function (el) { return function () { if (el.parentNode) { el.parentNode.removeChild(el); } }; }(p), 700);
      }
      return true;
    };
  }
  kinds.burst = { model: BurstKind, props: {}, view: '<div class="bx-fx bx-click-burst" on-click="[[burst]]"><oj-bind-slot></oj-bind-slot></div>' };

  function MarqueeKind(context) {
    var self = this;
    base(self, context, 'bx-marq');
    self.paused = ko.observable(motion.reducedMotion());
    self.items = ko.pureComputed(function () { return list(self.props.items).map(function (o) { return { label: o.label }; }); });
    self.css = ko.pureComputed(function () { return 'bx-marquee-track is-' + (self.props.speed || 'normal') + (self.paused() ? ' is-paused' : ''); });
    self.toggleText = ko.pureComputed(function () { return self.paused() ? 'Play' : 'Pause'; });
    self.toggle = function () { self.paused(!self.paused()); };
  }
  kinds.marquee = { model: MarqueeKind, props: { label: str('Updates'), items: arr(), speed: str('normal') },
    view: '<section class="bx-marquee" :aria-label="[[$properties.label]]"><div class="bx-marquee-window"><div :class="[[css]]"><ul class="bx-marquee-list">'
      + each('items', 'm', '<li>' + txt('m.data.label') + '</li>') + '</ul><ul class="bx-marquee-list" aria-hidden="true">' + each('items', 'm', '<li>' + txt('m.data.label') + '</li>') + '</ul></div></div>'
      + '<button type="button" class="bx-btn bx-btn--borderless bx-btn--sm bx-marquee-toggle" on-click="[[toggle]]">' + txt('toggleText') + '</button></section>' };

  /* ---------- showcase ---------- */
  function StaggerListKind(context) {
    var self = this;
    base(self, context, 'bx-alist');
    self.rows = ko.pureComputed(function () { return list(self.props.items).map(function (o, i) { return { title: o.title !== undefined ? String(o.title) : o.label, meta: o.meta || '', css: 'bx-row bx-alist-item ' + d(i) }; }); });
  }
  kinds.alist = { model: StaggerListKind, props: { label: str(), items: arr() },
    view: '<ul class="bx-rows bx-animated-list" :aria-label="[[$properties.label || null]]">' + each('rows', 'r', '<li :class="[[r.data.css]]"><span class="bx-row-main"><strong>' + txt('r.data.title') + '</strong>'
      + iff('r.data.meta', '<span class="bx-row-meta">' + txt('r.data.meta') + '</span>') + '</span></li>') + '</ul>' };

  function PointerCardKind(context) {
    var self = this;
    base(self, context, 'bx-pcard');
    self.move = function (event) {
      pointer(event, function (s, x, y) {
        s.setProperty('--bx-sx', Math.round(x * 100) + '%');
        s.setProperty('--bx-sy', Math.round(y * 100) + '%');
        s.setProperty('--bx-rx', ((0.5 - y) * 8).toFixed(2) + 'deg');
        s.setProperty('--bx-ry', ((x - 0.5) * 10).toFixed(2) + 'deg');
      });
      return true;
    };
    self.leave = function (event) { var s = event.currentTarget && event.currentTarget.style; if (s) { s.setProperty('--bx-rx', '0deg'); s.setProperty('--bx-ry', '0deg'); } return true; };
  }
  var pointerCard = function (css) {
    return { model: PointerCardKind, props: { heading: str(), text: str() },
      view: '<article class="bx-card ' + css + '" :aria-labelledby="[[id]]" on-pointermove="[[move]]" on-pointerleave="[[leave]]"><h3 class="bx-card-title" :id="[[id]]">' + txt('$properties.heading') + '</h3>'
        + iff('$properties.text', '<p class="bx-thing-text">' + txt('$properties.text') + '</p>') + '<oj-bind-slot></oj-bind-slot></article>' };
  };
  kinds.spotlight = pointerCard('bx-spotlight-card');
  kinds.tilt = pointerCard('bx-tilt-card');
  kinds.glowcard = pointerCard('bx-glow-border-card');

  function FlipKind(context) {
    var self = this;
    base(self, context, 'bx-flip');
    self.css = ko.pureComputed(function () { return 'bx-flip-card' + (self.props.flipped ? ' is-flipped' : ''); });
    self.frontHidden = ko.pureComputed(function () { return self.props.flipped ? 'true' : null; });
    self.backHidden = ko.pureComputed(function () { return self.props.flipped ? null : 'true'; });
    self.flip = function () { self.props.flipped = !self.props.flipped; k.focusLater(self, self.props.flipped ? '.bx-flip-back .bx-flip-button' : '.bx-flip-front .bx-flip-button'); };
  }
  kinds.flip = { model: FlipKind, props: { heading: str(), front: str(), back: str(), flipped: { type: 'boolean', value: false, writeback: true }, backLabel: str('Show details'), frontLabel: str('Back') },
    view: '<div :class="[[css]]"><div class="bx-flip-inner"><section class="bx-card bx-flip-face bx-flip-front" :aria-hidden="[[frontHidden]]" :aria-labelledby="[[id]]"><h3 class="bx-card-title" :id="[[id]]">'
      + txt('$properties.heading') + '</h3><p class="bx-thing-text">' + txt('$properties.front') + '</p><button type="button" class="bx-thing-action bx-flip-button" :tabindex="[[$properties.flipped ? \'-1\' : null]]"'
      + ' on-click="[[flip]]">' + txt('$properties.backLabel') + '</button></section><section class="bx-card bx-flip-face bx-flip-back" :aria-hidden="[[backHidden]]" :aria-label="[[$properties.heading]]">'
      + '<p class="bx-thing-text">' + txt('$properties.back') + '</p><button type="button" class="bx-thing-action bx-flip-button" :tabindex="[[$properties.flipped ? null : \'-1\']]" on-click="[[flip]]">'
      + txt('$properties.frontLabel') + '</button></section></div></div>' };

  function DeckKind(context) {
    var self = this;
    base(self, context, 'bx-deck');
    var n = function () { return (self.props.items || []).length; };
    self.cards = ko.pureComputed(function () {
      var at = self.props.index || 0;
      return list(self.props.items).map(function (o, i) {
        var depth = (i - at + n()) % Math.max(1, n());
        return { title: o.title !== undefined ? String(o.title) : o.label, text: o.text || '', css: 'bx-card bx-deck-card is-depth-' + Math.min(depth, 3), hidden: depth === 0 ? null : 'true', top: depth === 0 };
      });
    });
    self.where = ko.pureComputed(function () { return n() ? 'Card ' + ((self.props.index || 0) + 1) + ' of ' + n() : ''; });
    self.next = function () { if (n()) { self.props.index = ((self.props.index || 0) + 1) % n(); } };
    self.prev = function () { if (n()) { self.props.index = ((self.props.index || 0) - 1 + n()) % n(); } };
  }
  kinds.deck = { model: DeckKind, props: { label: str('Cards'), items: arr(), index: { type: 'number', value: 0, writeback: true } },
    view: '<section class="bx-card-stack" :aria-label="[[$properties.label]]"><div class="bx-deck">' + each('cards', 'c', '<article :class="[[c.data.css]]" :aria-hidden="[[c.data.hidden]]">'
      + '<h3 class="bx-card-title">' + txt('c.data.title') + '</h3><p class="bx-thing-text">' + txt('c.data.text') + '</p></article>') + '</div>'
      + '<div class="bx-deck-controls"><button type="button" class="bx-page" aria-label="Previous card" on-click="[[prev]]">‹</button><span role="status">' + txt('where') + '</span>'
      + '<button type="button" class="bx-page" aria-label="Next card" on-click="[[next]]">›</button></div></section>' };

  function BentoKind(context) {
    var self = this;
    base(self, context, 'bx-bento');
    self.tiles = ko.pureComputed(function () {
      return list(self.props.items).map(function (o, i) {
        return { title: o.title !== undefined ? String(o.title) : o.label, text: o.text || '', value: o.figure || '', css: 'bx-bento-tile is-' + (o.size || 'sm') + ' ' + d(i),
          open: function () { bx.fire(self.element, 'ojAction', { item: o }); } };
      });
    });
  }
  var bentoBody = '<span class="bx-tile-label">' + txt('t.data.title') + '</span>' + iff('t.data.value', '<span class="bx-tile-value">' + txt('t.data.value') + '</span>')
    + iff('t.data.text', '<span class="bx-tile-meta">' + txt('t.data.text') + '</span>');
  kinds.bento = { model: BentoKind, events: k.ACTION, props: { label: str(), items: arr(), interactive: bool() },
    view: '<ul class="bx-bento" :aria-label="[[$properties.label || null]]">' + each('tiles', 't', '<li :class="[[t.data.css]]">' + iff('$properties.interactive', '<button type="button" class="bx-bento-button" on-click="[[t.data.open]]">'
      + bentoBody + '</button>') + iff('!$properties.interactive', '<div class="bx-bento-body">' + bentoBody + '</div>') + '</li>') + '</ul>' };

  function CarouselKind(context) {
    var self = this;
    base(self, context, 'bx-car');
    var n = function () { return (self.props.slides || []).length; };
    self.slides = ko.pureComputed(function () {
      var at = self.props.index || 0;
      return list(self.props.slides).map(function (o, i) {
        return { title: o.title !== undefined ? String(o.title) : o.label, text: o.text || '', of: (i + 1) + ' of ' + n(), css: 'bx-slide' + (i === at ? ' is-on' : ''), hidden: i !== at,
          dot: 'bx-dot' + (i === at ? ' is-on' : ''), dotName: 'Slide ' + (i + 1), current: i === at ? 'true' : null, go: function () { self.props.index = i; } };
      });
    });
    self.next = function () { if (n()) { self.props.index = ((self.props.index || 0) + 1) % n(); } };
    self.prev = function () { if (n()) { self.props.index = ((self.props.index || 0) - 1 + n()) % n(); } };
  }
  kinds.carousel = { model: CarouselKind, props: { label: str('Highlights'), slides: arr(), index: { type: 'number', value: 0, writeback: true } },
    view: '<section class="bx-carousel" aria-roledescription="carousel" :aria-label="[[$properties.label]]"><div class="bx-slides" aria-live="polite">'
      + each('slides', 's', '<div :class="[[s.data.css]]" role="group" aria-roledescription="slide" :aria-label="[[s.data.of]]" :hidden="[[s.data.hidden]]"><h3 class="bx-card-title">' + txt('s.data.title')
        + '</h3><p class="bx-thing-text">' + txt('s.data.text') + '</p></div>') + '</div><div class="bx-deck-controls"><button type="button" class="bx-page" aria-label="Previous slide" on-click="[[prev]]">‹</button>'
      + '<span class="bx-dots">' + each('slides', 's', '<button type="button" :class="[[s.data.dot]]" :aria-label="[[s.data.dotName]]" :aria-current="[[s.data.current]]" on-click="[[s.data.go]]"></button>')
      + '</span><button type="button" class="bx-page" aria-label="Next slide" on-click="[[next]]">›</button></div></section>' };

  function WheelKind(context) {
    var self = this;
    base(self, context, 'bx-wheel');
    self.options = ko.pureComputed(function () {
      return list(self.props.options).map(function (o, i) {
        var v = o.value !== undefined ? String(o.value) : o.id;
        var on = v === String(self.props.value);
        return { label: o.label, key: self.id + '-o' + i, selected: on ? 'true' : 'false', css: 'bx-wheel-option' + (on ? ' is-on' : ''), pick: function () { self.props.value = o.value !== undefined ? o.value : o.id; } };
      });
    });
    self.active = ko.pureComputed(function () { var l = self.options(); var on = l.filter(function (o) { return o.selected === 'true'; })[0]; return on ? on.key : null; });
    self.onKey = function (event) {
      var l = list(self.props.options);
      var at = -1;
      l.forEach(function (o, i) { if ((o.value !== undefined ? String(o.value) : o.id) === String(self.props.value)) { at = i; } });
      var next = k.arrow(event.key, at < 0 ? 0 : at, l.length);
      if (next < 0) { return true; }
      event.preventDefault();
      self.props.value = l[next].value !== undefined ? l[next].value : l[next].id;
      return false;
    };
  }
  kinds.wheel = { model: WheelKind, props: { labelHint: str(), options: arr(), value: { type: 'any', writeback: true } },
    view: '<div class="bx-field bx-option-wheel"><span class="bx-label" :id="[[id]]">' + txt('$properties.labelHint') + '</span><ul class="bx-wheel" role="listbox" tabindex="0" :aria-labelledby="[[id]]"'
      + ' :aria-activedescendant="[[active]]" on-keydown="[[onKey]]">' + each('options', 'o', '<li role="option" :id="[[o.data.key]]" :class="[[o.data.css]]" :aria-selected="[[o.data.selected]]" on-click="[[o.data.pick]]">'
      + txt('o.data.label') + '</li>') + '</ul></div>' };

  function CardNavKind(context) {
    var self = this;
    base(self, context, 'bx-cnav');
    self.items = ko.pureComputed(function () {
      return list(self.props.items).map(function (o, i) { return { title: o.title !== undefined ? String(o.title) : o.label, text: o.text || '', css: 'bx-card-nav-item ' + d(i), go: function () { bx.fire(self.element, 'ojAction', { value: o.id }); } }; });
    });
  }
  kinds.cardnav = { model: CardNavKind, events: k.ACTION, props: { label: str('Explore'), items: arr() },
    view: '<nav class="bx-card-nav" :aria-label="[[$properties.label]]"><ul>' + each('items', 'c', '<li :class="[[c.data.css]]"><button type="button" class="bx-card-nav-button" on-click="[[c.data.go]]">'
      + '<strong>' + txt('c.data.title') + '</strong>' + iff('c.data.text', '<span>' + txt('c.data.text') + '</span>') + '</button></li>') + '</ul></nav>' };

  function FolderKind(context) {
    var self = this;
    base(self, context, 'bx-folder');
    self.css = ko.pureComputed(function () { return 'bx-folder' + (self.props.open ? ' is-open' : ''); });
    self.expanded = ko.pureComputed(function () { return self.props.open ? 'true' : 'false'; });
    self.count = ko.pureComputed(function () { var n = (self.props.items || []).length; return n + (n === 1 ? ' document' : ' documents'); });
    self.docs = ko.pureComputed(function () {
      return list(self.props.items).map(function (o, i) { var t = o.title !== undefined ? String(o.title) : o.label; return { title: t, meta: o.meta || '', css: 'bx-row ' + d(i), name: 'Open ' + t, open: function () { bx.fire(self.element, 'ojAction', { item: o }); } }; });
    });
    self.toggle = function () { self.props.open = !self.props.open; };
  }
  kinds.folder = { model: FolderKind, events: k.ACTION, props: { heading: str('Documents'), items: arr(), open: { type: 'boolean', value: false, writeback: true } },
    view: '<section :class="[[css]]"><button type="button" class="bx-folder-tab" :aria-expanded="[[expanded]]" :aria-controls="[[id]]" on-click="[[toggle]]"><span class="bx-folder-icon" aria-hidden="true"></span>'
      + '<span class="bx-row-main"><strong>' + txt('$properties.heading') + '</strong><span class="bx-row-meta">' + txt('count') + '</span></span></button>'
      + iff('$properties.open', '<ul class="bx-rows bx-folder-docs" :id="[[id]]">' + each('docs', 'f', '<li :class="[[f.data.css]]"><span class="bx-row-main"><strong>' + txt('f.data.title') + '</strong>'
        + iff('f.data.meta', '<span class="bx-row-meta">' + txt('f.data.meta') + '</span>') + '</span><button type="button" class="bx-btn bx-btn--borderless bx-btn--sm" :aria-label="[[f.data.name]]" on-click="[[f.data.open]]">Open</button></li>')
        + '</ul>') + '</section>' };

  function ScrollStackKind(context) {
    var self = this;
    base(self, context, 'bx-sstack');
    self.cards = ko.pureComputed(function () { return list(self.props.items).map(function (o, i) { return { title: o.title !== undefined ? String(o.title) : o.label, text: o.text || '', css: 'bx-card bx-scroll-stack-card is-n-' + Math.min(i, 9) }; }); });
  }
  kinds.scrollstack = { model: ScrollStackKind, props: { label: str(), items: arr() },
    view: '<ul class="bx-scroll-stack" :aria-label="[[$properties.label || null]]">' + each('cards', 'c', '<li :class="[[c.data.css]]"><h3 class="bx-card-title">' + txt('c.data.title') + '</h3>'
      + '<p class="bx-thing-text">' + txt('c.data.text') + '</p></li>') + '</ul>' };

  function ProfileKind(context) {
    var self = this;
    base(self, context, 'bx-prof');
    self.initials = ko.pureComputed(function () { return k.initials(self.props.name); });
    self.rows = ko.pureComputed(function () { return list(self.props.items).map(function (o) { return { label: o.label, value: o.value !== undefined ? String(o.value) : '' }; }); });
    self.act = function () { bx.fire(self.element, 'ojAction', {}); };
  }
  kinds.profile = { model: ProfileKind, events: k.ACTION, props: { name: str(), jobTitle: str(), src: str(), items: arr(), actionLabel: str() },
    view: '<article class="bx-card bx-profile-card" :aria-labelledby="[[id]]"><div class="bx-profile-head">' + iff('$properties.src', '<img class="bx-avatar is-lg" :src="[[$properties.src]]" alt=""/>')
      + iff('!$properties.src', '<span class="bx-avatar is-lg" aria-hidden="true">' + txt('initials') + '</span>') + '<span class="bx-row-main"><h3 class="bx-card-title" :id="[[id]]">' + txt('$properties.name') + '</h3>'
      + iff('$properties.jobTitle', '<span class="bx-row-meta">' + txt('$properties.jobTitle') + '</span>') + '</span></div>'
      + iff('rows().length', '<dl class="bx-kv-list">' + each('rows', 'r', '<div class="bx-kv-row"><dt>' + txt('r.data.label') + '</dt><dd>' + txt('r.data.value') + '</dd></div>') + '</dl>')
      + iff('$properties.actionLabel', '<button type="button" class="bx-btn bx-btn--outlined" on-click="[[act]]">' + txt('$properties.actionLabel') + '</button>') + '</article>' };

  /* ---------- backdrops: a decorative layer behind the screen's content ---------- */
  function BackdropKind(context) {
    var self = this;
    base(self, context, 'bx-bd');
    self.css = ko.pureComputed(function () { return 'bx-backdrop is-' + self.props.look + (self.props.still ? ' is-still' : ''); });
  }
  var backdrop = function (look) { return { model: BackdropKind, props: { look: str(look), still: bool() }, view: '<div :class="[[css]]"><span class="bx-backdrop-layer" aria-hidden="true"></span><div class="bx-backdrop-content"><oj-bind-slot></oj-bind-slot></div></div>' }; };
  ['gradient', 'aurora', 'silk', 'dots', 'waves', 'beams', 'topography'].forEach(function (look) { kinds['bd-' + look] = backdrop(look); });

  function ParticlesKind(context) {
    var self = this;
    base(self, context, 'bx-parts');
    var dots = [];
    var draw = function (canvas) {
      var c = canvas && canvas.getContext ? canvas.getContext('2d') : null;
      if (!c) { return false; }
      var w = canvas.width = canvas.clientWidth || 300;
      var h = canvas.height = canvas.clientHeight || 160;
      if (!dots.length) { for (var i = 0; i < (self.props.count || 40); i++) { dots.push({ x: Math.random() * w, y: Math.random() * h, r: 1 + Math.random() * 2, v: 0.15 + Math.random() * 0.35 }); } }
      c.clearRect(0, 0, w, h);
      c.fillStyle = window.getComputedStyle ? window.getComputedStyle(canvas).color : '#4f46e5';
      dots.forEach(function (p) { p.y -= p.v; if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; } c.globalAlpha = 0.35; c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill(); });
      return true;
    };
    self.connected = function () {
      var canvas = self.element.querySelector ? self.element.querySelector('canvas') : null;
      if (!draw(canvas)) { return; }
      if (!motion.reducedMotion() && !self.props.still) { every(self, 40, function () { return draw(canvas); }); }
    };
  }
  kinds.particles = { model: ParticlesKind, props: { count: num(40), still: bool() },
    view: '<div class="bx-backdrop is-particles"><canvas class="bx-backdrop-layer" aria-hidden="true"></canvas><div class="bx-backdrop-content"><oj-bind-slot></oj-bind-slot></div></div>' };

  /* ---------- micro interactions ---------- */
  function SlideConfirmKind(context) {
    var self = this;
    base(self, context, 'bx-slide');
    self.done = ko.observable(false);
    self.drag = ko.observable(null);
    self.css = ko.pureComputed(function () { return 'bx-slide-confirm' + (self.done() ? ' is-done' : '') + (self.drag() !== null ? ' is-dragging' : ''); });
    self.text = ko.pureComputed(function () { return self.done() ? self.props.doneLabel : self.props.label; });
    self.name = ko.pureComputed(function () { return self.done() ? self.props.doneLabel : self.props.label + ': slide, or press to confirm'; });
    var confirm = function () { if (self.done() || self.props.disabled) { return; } self.done(true); bx.fire(self.element, 'ojAction', {}); };
    self.confirm = confirm;
    self.down = function (event) {
      if (self.done() || self.props.disabled || !event.currentTarget || !event.currentTarget.parentNode) { return true; }
      var track = event.currentTarget.parentNode.getBoundingClientRect();
      self.drag({ x: event.clientX, width: track.width - event.currentTarget.getBoundingClientRect().width });
      if (event.currentTarget.setPointerCapture && event.pointerId !== undefined) { event.currentTarget.setPointerCapture(event.pointerId); }
      return true;
    };
    self.move = function (event) {
      var g = self.drag();
      if (!g || !event.currentTarget) { return true; }
      var dx = Math.max(0, Math.min(g.width, event.clientX - g.x));
      event.currentTarget.style.setProperty('--bx-slide', dx + 'px');
      g.last = dx;
      return true;
    };
    self.up = function (event) {
      var g = self.drag();
      self.drag(null);
      if (event.currentTarget && event.currentTarget.style) { event.currentTarget.style.setProperty('--bx-slide', '0px'); }
      self.dragged = !!(g && g.last !== undefined && g.last > 4);
      if (g && g.last !== undefined && g.last >= g.width * 0.9) { confirm(); }
      return true;
    };
    // A press (or Enter) confirms too, so no one has to drag; the click after a drag is not a press
    self.click = function () { if (self.dragged) { self.dragged = false; return; } confirm(); };
  }
  kinds.slideconfirm = { model: SlideConfirmKind, events: k.ACTION, props: { label: str('Slide to pay'), doneLabel: str('Paid'), disabled: bool() },
    view: '<div :class="[[css]]"><span class="bx-slide-text" aria-hidden="true">' + txt('text') + '</span><button type="button" class="bx-slide-handle" :aria-label="[[name]]" :disabled="[[$properties.disabled]]"'
      + ' on-pointerdown="[[down]]" on-pointermove="[[move]]" on-pointerup="[[up]]" on-click="[[click]]"><span aria-hidden="true">' + iff('done()', '✓') + iff('!done()', '›') + '</span></button>'
      + iff('done()', '<span class="bx-visually-hidden" role="status">' + txt('$properties.doneLabel') + '</span>') + '</div>' };

  function HoldKind(context) {
    var self = this;
    base(self, context, 'bx-hold');
    self.holding = ko.observable(false);
    self.done = ko.observable(false);
    var t = null;
    var stop = function () { if (t) { window.clearTimeout(t); t = null; } self.holding(false); };
    self.start = function (event) {
      if (self.done() || self.props.disabled || t) { return true; }
      if (event && event.currentTarget && event.currentTarget.style) { event.currentTarget.style.setProperty('--bx-hold', (self.props.duration || 1500) + 'ms'); }
      self.holding(true);
      t = window.setTimeout(function () { t = null; self.holding(false); self.done(true); bx.fire(self.element, 'ojAction', {}); }, self.props.duration || 1500);
      return true;
    };
    self.cancel = function () { stop(); return true; };
    self.onKey = function (event) { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); self.start(event); return false; } return true; };
    self.onKeyUp = function (event) { if (event.key === ' ' || event.key === 'Enter') { self.cancel(); } return true; };
    self.disconnected = stop;
    self.css = ko.pureComputed(function () { return 'bx-btn bx-btn--callToAction bx-hold' + (self.holding() ? ' is-holding' : '') + (self.done() ? ' is-done' : ''); });
    self.hint = ko.pureComputed(function () { return 'Press and hold for ' + Math.round((self.props.duration || 1500) / 100) / 10 + ' seconds'; });
    self.text = ko.pureComputed(function () { return self.done() ? self.props.doneLabel : self.props.label; });
  }
  kinds.hold = { model: HoldKind, events: k.ACTION, props: { label: str('Hold to confirm'), doneLabel: str('Confirmed'), duration: num(1500), disabled: bool() },
    view: '<button type="button" :class="[[css]]" :disabled="[[$properties.disabled]]" :aria-describedby="[[id]]" on-pointerdown="[[start]]" on-pointerup="[[cancel]]" on-pointerleave="[[cancel]]"'
      + ' on-keydown="[[onKey]]" on-keyup="[[onKeyUp]]"><span class="bx-hold-fill" aria-hidden="true"></span><span class="bx-btn-label">' + txt('text') + '</span></button>'
      + '<span class="bx-visually-hidden" :id="[[id]]">' + txt('hint') + '</span>' + iff('done()', '<span class="bx-visually-hidden" role="status">' + txt('$properties.doneLabel') + '</span>') };

  function CheckKind(context) {
    var self = this;
    base(self, context, 'bx-chk');
    self.css = ko.pureComputed(function () { return 'bx-status-mark is-' + (self.props.status || 'success') + k.variants.vx(self.props.variant); });
    self.checkCss = ko.pureComputed(function () { return 'bx-success-check' + k.variants.vx(self.props.variant); });
    self.glyph = ko.pureComputed(function () { return { success: '', error: '!', pending: '', info: 'i' }[self.props.status || 'success']; });
  }
  kinds.successcheck = { model: CheckKind, props: { label: str('Done'), text: str(), status: str('success'), variant: str('default') },
    view: '<div :class="[[checkCss]]" role="status"><svg class="bx-check-svg" viewBox="0 0 52 52" aria-hidden="true" focusable="false"><circle class="bx-check-ring" cx="26" cy="26" r="24"></circle>'
      + '<path class="bx-check-tick" d="M15 27 l7 7 l15 -16"></path></svg><strong class="bx-receipt-title">' + txt('$properties.label') + '</strong>' + iff('$properties.text', '<span class="bx-thing-text">' + txt('$properties.text') + '</span>') + '</div>' };
  kinds.statusmark = { model: CheckKind, props: { label: str(), status: str('success'), variant: str('default') },
    view: '<span :class="[[css]]"><span class="bx-status-mark-icon" aria-hidden="true">' + txt('glyph') + '</span><span>' + txt('$properties.label') + '</span></span>' };

  function SwipeRowKind(context) {
    var self = this;
    base(self, context, 'bx-swipe');
    self.open = ko.observable(false);
    self.css = ko.pureComputed(function () { return 'bx-swipe-row' + (self.open() ? ' is-open' : ''); });
    self.actions = ko.pureComputed(function () {
      return list(self.props.actions).map(function (o) {
        return { label: o.label, name: o.label + ': ' + self.props.heading, css: 'bx-swipe-action' + (o.tone ? ' is-' + o.tone : ''), go: function () { self.open(false); bx.fire(self.element, 'ojAction', { value: o.value !== undefined ? o.value : o.id }); } };
      });
    });
    var x0 = null;
    self.down = function (event) { x0 = event.clientX; return true; };
    self.up = function (event) { if (x0 !== null) { var dx = event.clientX - x0; if (dx < -40) { self.open(true); } else if (dx > 40) { self.open(false); } } x0 = null; return true; };
  }
  kinds.swiperow = { model: SwipeRowKind, events: k.ACTION, props: { heading: str(), meta: str(), value: str(), actions: arr() },
    view: '<div :class="[[css]]" on-pointerdown="[[down]]" on-pointerup="[[up]]"><div class="bx-swipe-actions">' + each('actions', 'a', '<button type="button" :class="[[a.data.css]]" :aria-label="[[a.data.name]]"'
      + ' on-click="[[a.data.go]]">' + txt('a.data.label') + '</button>') + '</div><div class="bx-row bx-swipe-face"><span class="bx-row-main"><strong>' + txt('$properties.heading') + '</strong>'
      + iff('$properties.meta', '<span class="bx-row-meta">' + txt('$properties.meta') + '</span>') + '</span>' + iff('$properties.value', '<span class="bx-row-value">' + txt('$properties.value') + '</span>') + '</div></div>' };

  function SwipeToastKind(context) {
    var self = this;
    base(self, context, 'bx-stoast');
    self.gone = ko.observable(false);
    var x0 = null;
    var close = function () { self.gone(true); bx.fire(self.element, 'ojClose', {}); };
    self.close = close;
    self.down = function (event) { x0 = event.clientX; return true; };
    self.up = function (event) { if (x0 !== null && Math.abs(event.clientX - x0) > 60) { close(); } x0 = null; return true; };
    self.css = ko.pureComputed(function () { return 'bx-toast bx-swipe-toast is-' + (self.props.severity || 'info') + k.variants.vx(self.props.variant); });
  }
  kinds.swipetoast = { model: SwipeToastKind, events: { ojClose: { bubbles: true } }, props: { message: str(), severity: str('confirmation'), variant: str('default') },
    view: iff('!gone()', '<div :class="[[css]]" role="status" on-pointerdown="[[down]]" on-pointerup="[[up]]"><span class="bx-toast-icon" aria-hidden="true">✓</span><span class="bx-toast-text">'
      + txt('$properties.message') + '</span><button type="button" class="bx-btn bx-btn--borderless bx-btn--icon bx-btn--sm" aria-label="Close the message" on-click="[[close]]"><span aria-hidden="true">×</span></button></div>') };

  function PressToggleKind(context) {
    var self = this;
    base(self, context, 'bx-ptog');
    self.pressed = ko.pureComputed(function () { return self.props.value ? 'true' : 'false'; });
    self.css = ko.pureComputed(function () { return 'bx-press-toggle ' + self.props.look + (self.props.value ? ' is-on' : ''); });
    self.name = ko.pureComputed(function () { return [self.props.label, self.props.name].filter(Boolean).join(' '); });
    self.toggle = function () { if (!self.props.disabled) { self.props.value = !self.props.value; } };
  }
  var pressToggle = function (look, glyph, labelDefault) {
    return { model: PressToggleKind, props: { label: str(labelDefault), name: str(), value: { type: 'boolean', value: false, writeback: true }, disabled: bool(), look: str(look) },
      view: '<button type="button" :class="[[css]]" :aria-pressed="[[pressed]]" :aria-label="[[name]]" :disabled="[[$properties.disabled]]" on-click="[[toggle]]"><span class="bx-press-glyph" aria-hidden="true">'
        + glyph + '</span></button>' };
  };
  kinds.bell = pressToggle('bx-bell', '🔔', 'Alerts');
  kinds.heart = pressToggle('bx-heart', '♥', 'Favourite');

  function ScrubKind(context) {
    var self = this;
    base(self, context, 'bx-scrub');
    var clamp = function (n) { var lo = self.props.min, hi = self.props.max; if (lo !== undefined && lo !== null && n < lo) { n = lo; } if (hi !== undefined && hi !== null && n > hi) { n = hi; } return n; };
    var x0 = null, v0 = 0;
    self.onInput = function (event) { var n = Number(event.target.value); if (isFinite(n)) { self.props.value = clamp(n); } return true; };
    self.down = function (event) { x0 = event.clientX; v0 = Number(self.props.value) || 0; if (event.currentTarget && event.currentTarget.setPointerCapture && event.pointerId !== undefined) { event.currentTarget.setPointerCapture(event.pointerId); } return true; };
    self.move = function (event) { if (x0 === null) { return true; } var stepN = Math.round((event.clientX - x0) / 8); self.props.value = clamp(v0 + stepN * (self.props.step || 1)); return true; };
    self.up = function () { x0 = null; return true; };
    self.shown = ko.pureComputed(function () { return money(Number(self.props.value) || 0, self.props.currency); });
  }
  kinds.scrub = { model: ScrubKind, props: { labelHint: str('Amount'), value: { type: 'number', value: 0, writeback: true }, min: num(0), max: { type: 'number' }, step: num(10), currency: str() },
    view: '<div class="bx-field bx-scrub"><div class="bx-slider-head"><label class="bx-label" :for="[[id]]">' + txt('$properties.labelHint') + '</label><span class="bx-scrub-handle" aria-hidden="true"'
      + ' on-pointerdown="[[down]]" on-pointermove="[[move]]" on-pointerup="[[up]]">⇔</span></div><div class="bx-control">' + iff('$properties.currency', '<span class="bx-affix" aria-hidden="true">' + txt('$properties.currency') + '</span>')
      + '<input type="number" class="bx-input bx-num" inputmode="decimal" :id="[[id]]" :value="[[$properties.value]]" :min="[[$properties.min]]" :max="[[$properties.max]]" :step="[[$properties.step]]"'
      + ' on-input="[[onInput]]"/></div><span class="bx-help">Drag the arrows, or type</span></div>' };

  function GaugeKind(context) {
    var self = this;
    base(self, context, 'bx-gauge');
    var share = function () { var m = Number(self.props.max) || 0; return m > 0 ? Math.max(0, Math.min(1, (Number(self.props.value) || 0) / m)) : 0; };
    self.offset = ko.pureComputed(function () { return String(Math.round(126 * (1 - share()) * 10) / 10); });
    self.over = ko.pureComputed(function () { return (Number(self.props.value) || 0) > (Number(self.props.max) || 0); });
    self.text = ko.pureComputed(function () {
      var u = self.props.unit ? ' ' + self.props.unit : '';
      return Number(self.props.value).toLocaleString() + u + ' of ' + Number(self.props.max).toLocaleString() + u + (self.over() ? ', over budget' : '');
    });
    self.css = ko.pureComputed(function () { return 'bx-gauge' + k.variants.vx(self.props.variant) + (self.over() ? ' is-over' : share() >= 0.9 ? ' is-near' : ''); });
    self.ring = ko.pureComputed(function () { return String(k.variants.ringOffset(share(), 40)); });
    self.now = ko.pureComputed(function () { return String(Math.min(Number(self.props.value) || 0, Number(self.props.max) || 0)); });
  }
  kinds.gauge = { model: GaugeKind, props: { label: str('Budget'), value: num(0), max: num(100), unit: str(), variant: str('default') },
    view: '<div :class="[[css]]" role="progressbar" aria-valuemin="0" :aria-valuemax="[[$properties.max]]" :aria-valuenow="[[now]]" :aria-valuetext="[[text]]" :aria-labelledby="[[id]]">'
      + iff('$properties.variant === \'ring\'', '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle class="bx-gauge-track" cx="50" cy="50" r="40"></circle>'
        + '<circle class="bx-gauge-fill" cx="50" cy="50" r="40" stroke-dasharray="251.3" :stroke-dashoffset="[[ring]]"></circle></svg>')
      + iff('$properties.variant !== \'ring\'', '<svg viewBox="0 0 100 56" aria-hidden="true" focusable="false"><path class="bx-gauge-track" d="M10 50 A40 40 0 0 1 90 50"></path><path class="bx-gauge-fill" d="M10 50 A40 40 0 0 1 90 50"'
        + ' :stroke-dashoffset="[[offset]]"></path></svg>') + '<span class="bx-gauge-label" :id="[[id]]">' + txt('$properties.label') + '</span><span class="bx-gauge-text">' + txt('text') + '</span></div>' };

  function PromptKind(context) {
    var self = this;
    base(self, context, 'bx-prompt');
    self.draft = ko.observable('');
    self.off = ko.pureComputed(function () { return !self.draft().trim() || self.props.busy; });
    self.chips = ko.pureComputed(function () { return list(self.props.suggestions).map(function (o) { return { label: o.label, use: function () { self.draft(o.label); k.focusLater(self, '.bx-prompt-input'); } }; }); });
    self.onDraft = function (event) { self.draft(event.target.value); return true; };
    self.send = function () { if (self.off()) { return; } var t = self.draft().trim(); self.draft(''); bx.fire(self.element, 'ojAction', { text: t }); };
    self.onKey = function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); self.send(); return false; } return true; };
  }
  kinds.prompt = { model: PromptKind, events: k.ACTION, props: { label: str('Ask the assistant'), placeholder: str('Ask about your accounts'), suggestions: arr(), busy: bool() },
    view: '<div class="bx-prompt-bar"><div class="bx-chip-row" role="group" :aria-label="[[\'Suggestions for \' + $properties.label]]">' + each('chips', 'c', '<button type="button" class="bx-filter-chip" on-click="[[c.data.use]]">'
      + txt('c.data.label') + '</button>') + '</div><div class="bx-prompt-row"><div class="bx-control"><span class="bx-prompt-spark" aria-hidden="true">✦</span><input class="bx-input bx-prompt-input" :aria-label="[[$properties.label]]"'
      + ' :placeholder="[[$properties.placeholder]]" :value="[[draft]]" on-input="[[onDraft]]" on-keydown="[[onKey]]"/></div><button type="button" class="bx-btn bx-btn--callToAction" :disabled="[[off]]"'
      + ' :aria-busy="[[$properties.busy ? \'true\' : null]]" on-click="[[send]]">Ask</button></div></div>' };

  function VoiceKind(context) {
    var self = this;
    base(self, context, 'bx-voice');
    self.pressed = ko.pureComputed(function () { return self.props.listening ? 'true' : 'false'; });
    self.text = ko.pureComputed(function () { return self.props.listening ? self.props.listeningLabel : self.props.label; });
    self.css = ko.pureComputed(function () { return 'bx-voice-pill' + (self.props.listening ? ' is-listening' : ''); });
    self.toggle = function () { self.props.listening = !self.props.listening; bx.fire(self.element, 'ojAction', { listening: self.props.listening }); };
  }
  kinds.voice = { model: VoiceKind, events: k.ACTION, props: { label: str('Speak'), listeningLabel: str('Listening… press to stop'), listening: { type: 'boolean', value: false, writeback: true } },
    view: '<button type="button" :class="[[css]]" :aria-pressed="[[pressed]]" on-click="[[toggle]]"><span class="bx-voice-waves" aria-hidden="true"><span></span><span></span><span></span></span>'
      + '<span>' + txt('text') + '</span></button>' };

  function CallKind(context) {
    var self = this;
    base(self, context, 'bx-call');
    self.href = ko.pureComputed(function () { return 'tel:' + String(self.props.number || '').replace(/[^\d+]/g, ''); });
    self.name = ko.pureComputed(function () { return self.props.label + ', ' + self.props.number; });
  }
  kinds.call = { model: CallKind, props: { label: str('Call the bank'), number: str() },
    view: '<a class="bx-call-chip" :href="[[href]]" :aria-label="[[name]]"><span class="bx-call-icon" aria-hidden="true">✆</span><span>' + txt('$properties.label') + '</span></a>' };

  // the lattice is the default look; the other variants are the spinner's loaders
  function LatticeKind(context) { g1.kinds.spinner.model.call(this, context); }
  kinds.lattice = { model: LatticeKind, props: { label: str('Loading'), size: str('md'), variant: str('default'), orbState: str('working') },
    view: iff('mark() !== \'standard\'', g1.kinds.spinner.view) + iff('mark() === \'standard\'', '<span class="bx-lattice" role="status"><span class="bx-lattice-grid" aria-hidden="true"><span class="bx-d-0"></span><span class="bx-d-2"></span><span class="bx-d-4"></span><span class="bx-d-2"></span>'
      + '<span class="bx-d-4"></span><span class="bx-d-6"></span><span class="bx-d-4"></span><span class="bx-d-6"></span><span class="bx-d-8"></span></span>' + hidden('$properties.label') + '</span>') };

  /* ---------- group 7 ---------- */
  var g = g1.kinds, h = g2.kinds, c = g3.kinds, e = g5.kinds;
  var elements = [
    register('bx-rolling-digits', kinds.rolling), register('bx-count-up', kinds.count), register('bx-split-flap-board', kinds.flap, { heading: 'Exchange rates' }),
    register('bx-reveal-digits', kinds.reveal), register('bx-blur-in-text', kinds.blurin), register('bx-text-reveal', kinds.textreveal), register('bx-rotating-text', kinds.rotating),
    register('bx-shimmer-text', kinds.shimmer), register('bx-gradient-text', kinds.gradient, { animated: false }), register('bx-typed-text', kinds.typed), register('bx-focus-word', kinds.focusword),
    register('bx-scroll-float-text', kinds.floattext),
    register('bx-fade-in-content', kinds.fadein), register('bx-scroll-reveal', kinds.scrollreveal), register('bx-scroll-expand', kinds.expand), register('bx-edge-blur', kinds.edgeblur),
    register('bx-glare-hover', kinds.glare), register('bx-magnetic-button', kinds.magnetic), register('bx-highlight-border', kinds.highlight), register('bx-click-burst', kinds.burst),
    register('bx-marquee', kinds.marquee),
    register('bx-animated-list', kinds.alist), register('bx-spotlight-card', kinds.spotlight), register('bx-tilt-card', kinds.tilt), register('bx-flip-card', kinds.flip),
    register('bx-card-stack', kinds.deck), register('bx-glow-border-card', kinds.glowcard), register('bx-bento-grid', kinds.bento), register('bx-carousel', kinds.carousel),
    register('bx-elastic-slider', wrap(g.slider, 'bx-fx-elastic'), { labelHint: 'Amount', max: 10000, step: 50 }), register('bx-option-wheel', kinds.wheel),
    register('bx-pill-nav', wrap(g.nav, 'bx-fx-pill-nav')), register('bx-dock-nav', wrap(h.quick, 'bx-fx-dock'), { label: 'Dock' }), register('bx-card-nav', kinds.cardnav),
    register('bx-staggered-menu', wrap(g.menu, 'bx-fx-stagger-menu'), { label: 'Menu' }), register('bx-document-folder', kinds.folder), register('bx-scroll-stack', kinds.scrollstack),
    register('bx-profile-card', kinds.profile), register('bx-glass-panel', kinds.glass),
    register('bx-gradient-backdrop', kinds['bd-gradient']), register('bx-soft-aurora', kinds['bd-aurora']), register('bx-silk-backdrop', kinds['bd-silk']), register('bx-dot-grid', kinds['bd-dots']),
    register('bx-line-waves', kinds['bd-waves']), register('bx-light-beams', kinds['bd-beams']), register('bx-topography', kinds['bd-topography']), register('bx-particle-backdrop', kinds.particles),
    register('bx-slide-to-confirm', kinds.slideconfirm), register('bx-hold-to-confirm', kinds.hold), register('bx-otp-slots', wrap(c.code, 'bx-fx-otp'), { labelHint: 'Enter the code', length: 6 }),
    register('bx-receipt-tear', wrap(h.receipt, 'bx-fx-torn'), { heading: 'Payment sent' }), register('bx-success-check', kinds.successcheck), register('bx-swipe-row', kinds.swiperow),
    register('bx-swipe-toast', kinds.swipetoast), register('bx-bell-toggle', kinds.bell), register('bx-squish-switch', wrap(c.toggle, 'bx-fx-squish')),
    register('bx-jelly-radio', wrap(h.choice, 'bx-fx-jelly')), register('bx-glide-select', wrap(g.segmented, 'bx-fx-glide')), register('bx-rubber-segment', wrap(g.segmented, 'bx-fx-rubber')),
    register('bx-scrub-field', kinds.scrub), register('bx-budget-gauge', kinds.gauge), register('bx-status-mark', kinds.statusmark), register('bx-favourite-heart', kinds.heart),
    register('bx-peek-rating', wrap(e.rating, 'bx-fx-peek'), { labelHint: 'How was it?' }), register('bx-warm-tooltip', wrap(g.tooltip, 'bx-fx-warm')), register('bx-prompt-bar', kinds.prompt),
    register('bx-voice-pill', kinds.voice), register('bx-call-chip', kinds.call), register('bx-lattice-loader', kinds.lattice)
  ];

  return { elements: elements, kinds: kinds, kit: { chars: chars, words: words, stagger: d } };
});
