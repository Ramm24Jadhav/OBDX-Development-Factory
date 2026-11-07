/*
 * Premium JET elements, group 1 (the rest of the foundation, layout, data and feedback): bx-secondary-button,
 * bx-danger-button, bx-savings-slider, bx-segmented (oj-buttonset-one), bx-filter-chips, bx-action-menu
 * (oj-menu-button), bx-accordion (oj-collapsible), bx-stepper (oj-train), bx-breadcrumb, bx-side-nav
 * (oj-navigation-list), bx-sheet (oj-popup), bx-grid, bx-divider, bx-avatar, bx-pagination (oj-paging-control),
 * bx-status-badge, bx-timeline, bx-spinner, bx-skeleton, bx-empty-state, bx-tooltip, bx-alert-banner, bx-error-message,
 * bx-success-message (oj-messages) and bx-notification-panel.
 * The kinds here (buttons, slider, segmented, chips, menu, accordion, steps, timeline, alert, rows) are reused by the
 * later groups: each element is a kind with its own defaults, registered with kit.register(name, kind, defaults).
 */
define(['ojs/ojcomposite', './bx-core', './bx-motion'], function (Composite, bx, motion) {
  'use strict';
  Composite = bx.withVariants(Composite);
  var ko = bx.ko;

  /* ---------- the kit: view helpers, lists and registration ---------- */
  var txt = function (expr) { return '<oj-bind-text value="[[' + expr + ']]"></oj-bind-text>'; };
  var iff = function (test, html) { return '<oj-bind-if test="[[' + test + ']]">' + html + '</oj-bind-if>'; };
  var each = function (data, as, html) { return '<oj-bind-for-each data="[[' + data + ']]" as="' + as + '"><template>' + html + '</template></oj-bind-for-each>'; };
  var copy = function (o) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = o[k]; }); return r; };
  /** Items from strings or objects, each with an id and a label (label, title or value). */
  var list = function (items) {
    return (items || []).map(function (o, i) {
      if (o === null || typeof o !== 'object') { return { id: String(o), label: String(o), disabled: false, i: i }; }
      var r = copy(o);
      r.id = String(o.id !== undefined ? o.id : o.value !== undefined ? o.value : o.label !== undefined ? o.label : o.title !== undefined ? o.title : i);
      r.label = String(o.label !== undefined ? o.label : o.title !== undefined ? o.title : o.value !== undefined ? o.value : r.id);
      r.disabled = !!o.disabled;
      r.i = i;
      return r;
    });
  };
  /** Base props for a view model: the properties, the element and an id. */
  var base = function (vm, context, prefix) { vm.props = context.properties; vm.element = context.element; vm.id = bx.nextId(prefix || 'bx'); };
  /** Registers an element of a kind; defaults replace the kind's property defaults. */
  var register = function (name, kind, defaults) {
    var properties = {};
    Object.keys(kind.props).forEach(function (k) { properties[k] = copy(kind.props[k]); });
    Object.keys(defaults || {}).forEach(function (k) { properties[k] = copy(properties[k] || { type: 'any' }); properties[k].value = defaults[k]; });
    var metadata = { properties: properties };
    if (kind.events) { metadata.events = kind.events; }
    if (kind.methods) { metadata.methods = kind.methods; }
    Composite.register(name, { view: kind.view, viewModel: kind.model, metadata: metadata });
    return name;
  };
  var str = function (v) { return { type: 'string', value: v === undefined ? '' : v }; };
  var bool = function (v) { return { type: 'boolean', value: !!v }; };
  var num = function (v) { return { type: 'number', value: v }; };
  var arr = function () { return { type: 'Array<any>', value: [] }; };
  var ACTION = { ojAction: { bubbles: true } };
  /** Focus the element found by a selector, after the view renders. */
  var focusLater = function (vm, selector) {
    window.setTimeout(function () { var el = vm.element.querySelector ? vm.element.querySelector(selector) : null; if (el && el.focus) { el.focus(); } }, 0);
  };
  /** The next index for arrow keys, Home and End in a list of n; -1 when the key is not one of them. */
  var arrow = function (key, at, n) {
    if (!n) { return -1; }
    return key === 'ArrowRight' || key === 'ArrowDown' ? (at + 1) % n : key === 'ArrowLeft' || key === 'ArrowUp' ? (at - 1 + n) % n : key === 'Home' ? 0 : key === 'End' ? n - 1 : -1;
  };
  var SEVERITY_ICON = { error: '!', warning: '!', confirmation: '✓', info: 'i' };
  var initials = function (name) {
    return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '?';
  };

  var kinds = {};

  /* ---------- buttons: a quieter or a destructive action ---------- */
  function ButtonKind(context) {
    var self = this;
    base(self, context, 'bx-btn');
    self.css = ko.pureComputed(function () { return 'bx-btn bx-btn--' + (self.props.chroming || 'outlined'); });
    self.busyAttr = ko.pureComputed(function () { return self.props.busy ? 'true' : null; });
    self.off = ko.pureComputed(function () { return !!(self.props.disabled || self.props.busy); });
    self.press = function () { if (!self.off()) { bx.fire(self.element, 'ojAction', {}); } };
  }
  kinds.button = { model: ButtonKind, events: ACTION,
    props: { label: str(), chroming: str('outlined'), disabled: bool(), busy: bool() },
    view: '<button type="button" :class="[[css]]" :disabled="[[off]]" :aria-busy="[[busyAttr]]" on-click="[[press]]"><span class="bx-btn-label">' + txt('$properties.label') + '</span></button>' };

  /* ---------- slider: an amount or a count on a range, the value shown beside the label ---------- */
  function SliderKind(context) {
    var self = this;
    base(self, context, 'bx-slider');
    self.shown = ko.pureComputed(function () {
      var v = Number(self.props.value || 0);
      return (self.props.prefix ? self.props.prefix + ' ' : '') + v.toLocaleString(undefined, { maximumFractionDigits: self.props.decimals || 0 });
    });
    self.ends = ko.pureComputed(function () {
      var p = self.props.prefix ? self.props.prefix + ' ' : '';
      return { min: p + Number(self.props.min).toLocaleString(), max: p + Number(self.props.max).toLocaleString() };
    });
    // the filled share, for a variant that draws its own track (--bx-pct)
    self.pct = ko.pureComputed(function () {
      var lo = Number(self.props.min), hi = Number(self.props.max);
      return '--bx-pct: ' + (hi > lo ? Math.min(100, Math.max(0, (Number(self.props.value || 0) - lo) / (hi - lo) * 100)) : 0) + '%';
    });
    self.onInput = function (event) { self.props.value = Number(event.target.value); };
  }
  kinds.slider = { model: SliderKind,
    props: { labelHint: str(), value: { type: 'number', value: 0, writeback: true }, min: num(0), max: num(100), step: num(1), prefix: str(), decimals: num(0),
      disabled: bool(), helpText: str() },
    view: '<div class="bx-field bx-slider"><div class="bx-slider-head"><label class="bx-label" :for="[[id]]">' + txt('$properties.labelHint') + '</label>'
      + '<output class="bx-slider-value" :for="[[id]]">' + txt('shown') + '</output></div>'
      + '<input type="range" class="bx-range-input" :style="[[pct]]" :id="[[id]]" :min="[[$properties.min]]" :max="[[$properties.max]]" :step="[[$properties.step]]" :value="[[$properties.value]]"'
      + ' :disabled="[[$properties.disabled]]" :aria-valuetext="[[shown]]" :aria-describedby="[[$properties.helpText ? id + \'-help\' : null]]" on-input="[[onInput]]"/>'
      + '<div class="bx-slider-scale" aria-hidden="true"><span>' + txt('ends().min') + '</span><span>' + txt('ends().max') + '</span></div>'
      + iff('$properties.helpText', '<span class="bx-help" :id="[[id + \'-help\']]">' + txt('$properties.helpText') + '</span>') + '</div>' };

  /* ---------- segmented: one of a few options, as radios that look like a segmented control ---------- */
  function SegmentedKind(context) {
    var self = this;
    base(self, context, 'bx-seg');
    self.items = ko.pureComputed(function () {
      var l = list(self.props.options);
      var picked = l.some(function (o) { return o.id === String(self.props.value); });
      return l.map(function (o, i) {
        var on = o.id === String(self.props.value);
        return { label: o.label, disabled: o.disabled || self.props.disabled, checked: on ? 'true' : 'false', tab: on || (!picked && i === 0) ? '0' : '-1',
          css: 'bx-segment' + (on ? ' is-on' : ''), pick: function () { if (!o.disabled && !self.props.disabled) { self.props.value = o.value !== undefined ? o.value : o.id; } } };
      });
    });
    self.onKey = function (event) {
      var l = list(self.props.options).filter(function (o) { return !o.disabled; });
      var at = -1;
      l.forEach(function (o, i) { if (o.id === String(self.props.value)) { at = i; } });
      var next = arrow(event.key, at < 0 ? 0 : at, l.length);
      if (next < 0 || self.props.disabled) { return true; }
      event.preventDefault();
      self.props.value = l[next].value !== undefined ? l[next].value : l[next].id;
      focusLater(self, '.bx-segment.is-on');
      return false;
    };
  }
  kinds.segmented = { model: SegmentedKind,
    props: { labelHint: str(), options: arr(), value: { type: 'any', writeback: true }, disabled: bool() },
    view: '<div class="bx-field bx-segmented-field"><span class="bx-label" :id="[[id + \'-label\']]">' + txt('$properties.labelHint') + '</span>'
      + '<div class="bx-segmented" role="radiogroup" :aria-labelledby="[[id + \'-label\']]" on-keydown="[[onKey]]">'
      + each('items', 's', '<button type="button" role="radio" :class="[[s.data.css]]" :aria-checked="[[s.data.checked]]" :tabindex="[[s.data.tab]]" :disabled="[[s.data.disabled]]"'
        + ' on-click="[[s.data.pick]]">' + txt('s.data.label') + '</button>') + '</div></div>' };

  /* ---------- chips: filters that turn on and off (one or several) ---------- */
  function ChipsKind(context) {
    var self = this;
    base(self, context, 'bx-chips');
    self.items = ko.pureComputed(function () {
      var value = (self.props.value || []).map(String);
      return list(self.props.options).map(function (o) {
        var on = value.indexOf(o.id) >= 0;
        return { label: o.label, disabled: o.disabled, pressed: on ? 'true' : 'false', css: 'bx-filter-chip' + (on ? ' is-on' : ''),
          toggle: function () {
            if (o.disabled) { return; }
            var v = o.value !== undefined ? o.value : o.id;
            var now = (self.props.value || []).slice();
            var at = now.map(String).indexOf(o.id);
            self.props.value = at >= 0 ? now.filter(function (x, i) { return i !== at; }) : self.props.multiple ? now.concat([v]) : [v];
          } };
      });
    });
  }
  kinds.chips = { model: ChipsKind,
    props: { labelHint: str(), options: arr(), value: { type: 'Array<any>', value: [], writeback: true }, multiple: bool(true) },
    view: '<div class="bx-filter" role="group" :aria-labelledby="[[id + \'-label\']]"><span class="bx-label" :id="[[id + \'-label\']]">' + txt('$properties.labelHint') + '</span>'
      + '<div class="bx-chip-row">' + each('items', 'c', '<button type="button" :class="[[c.data.css]]" :aria-pressed="[[c.data.pressed]]" :disabled="[[c.data.disabled]]"'
        + ' on-click="[[c.data.toggle]]">' + txt('c.data.label') + '</button>') + '</div></div>' };

  /* ---------- menu: a button that opens a list of actions; arrows move, Escape closes ---------- */
  function MenuKind(context) {
    var self = this;
    base(self, context, 'bx-menu');
    self.open = ko.observable(false);
    self.expanded = ko.pureComputed(function () { return self.open() ? 'true' : 'false'; });
    self.items = ko.pureComputed(function () {
      return list(self.props.items).map(function (o) {
        return { label: o.label, disabled: o.disabled ? 'true' : null, css: 'bx-menu-item' + (o.danger ? ' is-danger' : ''),
          pick: function () { if (o.disabled) { return; } self.close(true); bx.fire(self.element, 'ojAction', { value: o.value !== undefined ? o.value : o.id }); } };
      });
    });
    var items = function () { return self.element.querySelectorAll ? Array.prototype.slice.call(self.element.querySelectorAll('.bx-menu-item:not([aria-disabled="true"])')) : []; };
    self.close = function (refocus) { self.open(false); if (refocus) { focusLater(self, '.bx-menu-button'); } };
    self.toggle = function () { if (self.props.disabled) { return; } self.open(!self.open()); if (self.open()) { focusLater(self, '.bx-menu-item:not([aria-disabled="true"])'); } };
    self.onButtonKey = function (event) {
      if (event.key === 'ArrowDown' && !self.props.disabled) { event.preventDefault(); self.open(true); focusLater(self, '.bx-menu-item:not([aria-disabled="true"])'); return false; }
      return true;
    };
    self.onMenuKey = function (event) {
      if (event.key === 'Escape' || event.key === 'Tab') { self.close(event.key === 'Escape'); return event.key === 'Tab'; }
      var l = items();
      var next = arrow(event.key, l.indexOf(document.activeElement), l.length);
      if (next < 0) { return true; }
      event.preventDefault();
      l[next].focus();
      return false;
    };
  }
  kinds.menu = { model: MenuKind, events: ACTION,
    props: { label: str('More'), items: arr(), disabled: bool() },
    view: '<div class="bx-menu"><button type="button" class="bx-btn bx-btn--outlined bx-menu-button" aria-haspopup="menu" :aria-expanded="[[expanded]]" :aria-controls="[[id]]"'
      + ' :disabled="[[$properties.disabled]]" on-click="[[toggle]]" on-keydown="[[onButtonKey]]"><span class="bx-btn-label">' + txt('$properties.label') + '</span><span class="bx-menu-caret" aria-hidden="true"></span></button>'
      + iff('open()', '<ul class="bx-menu-list" role="menu" :id="[[id]]" :aria-label="[[$properties.label]]" on-keydown="[[onMenuKey]]">'
        + each('items', 'm', '<li role="menuitem" tabindex="-1" :class="[[m.data.css]]" :aria-disabled="[[m.data.disabled]]" on-click="[[m.data.pick]]">' + txt('m.data.label') + '</li>') + '</ul>') + '</div>' };

  /* ---------- accordion: sections that open and close; several open at once when multiple ---------- */
  function AccordionKind(context) {
    var self = this;
    base(self, context, 'bx-acc');
    self.items = ko.pureComputed(function () {
      var open = (self.props.expanded || []).map(String);
      return list(self.props.items).map(function (o) {
        var on = open.indexOf(o.id) >= 0;
        var key = self.id + '-' + o.i;
        return { title: o.label, body: o.body || '', on: on, expanded: on ? 'true' : 'false', headId: key + '-h', panelId: key + '-p', css: 'bx-acc-item' + (on ? ' is-open' : ''),
          toggle: function () {
            var now = (self.props.expanded || []).map(String);
            self.props.expanded = on ? now.filter(function (x) { return x !== o.id; }) : self.props.multiple ? now.concat([o.id]) : [o.id];
          } };
      });
    });
  }
  kinds.accordion = { model: AccordionKind,
    props: { items: arr(), expanded: { type: 'Array<string>', value: [], writeback: true }, multiple: bool() },
    view: '<div class="bx-accordion">' + each('items', 'a', '<div :class="[[a.data.css]]"><h3 class="bx-acc-head"><button type="button" class="bx-acc-button" :id="[[a.data.headId]]"'
      + ' :aria-expanded="[[a.data.expanded]]" :aria-controls="[[a.data.panelId]]" on-click="[[a.data.toggle]]"><span>' + txt('a.data.title') + '</span><span class="bx-acc-icon" aria-hidden="true"></span></button></h3>'
      + iff('a.data.on', '<div class="bx-acc-panel" role="region" :id="[[a.data.panelId]]" :aria-labelledby="[[a.data.headId]]">' + txt('a.data.body') + '</div>') + '</div>') + '</div>' };

  /* ---------- steps (oj-train): done, current and next steps of a journey ---------- */
  function StepsKind(context) {
    var self = this;
    base(self, context, 'bx-steps');
    self.items = ko.pureComputed(function () {
      var l = list(self.props.steps);
      var at = -1;
      l.forEach(function (s, i) { if (s.id === String(self.props.selectedStep)) { at = i; } });
      return l.map(function (s, i) {
        var state = s.state || (i < at ? 'done' : i === at ? 'current' : 'next');
        return { label: s.label, mark: state === 'done' ? '✓' : state === 'failed' ? '!' : String(i + 1), current: state === 'current' ? 'step' : null,
          css: 'bx-step-item is-' + state, status: state === 'done' ? 'done' : state === 'current' ? 'current step' : state === 'failed' ? 'failed' : 'not started' };
      });
    });
  }
  kinds.steps = { model: StepsKind,
    props: { label: str('Progress'), steps: arr(), selectedStep: { type: 'string', value: '' } },
    view: '<ol class="bx-steps" :aria-label="[[$properties.label]]">' + each('items', 's', '<li :class="[[s.data.css]]" :aria-current="[[s.data.current]]">'
      + '<span class="bx-step-mark" aria-hidden="true">' + txt('s.data.mark') + '</span><span class="bx-step-label">' + txt('s.data.label') + '</span>'
      + '<span class="bx-visually-hidden">' + txt('s.data.status') + '</span></li>') + '</ol>' };

  /* ---------- breadcrumb: where the page sits; earlier pages are links ---------- */
  function CrumbsKind(context) {
    var self = this;
    base(self, context, 'bx-crumbs');
    self.items = ko.pureComputed(function () {
      var l = list(self.props.items);
      return l.map(function (o, i) {
        return { label: o.label, last: i === l.length - 1, go: function () { bx.fire(self.element, 'ojAction', { value: o.value !== undefined ? o.value : o.id }); } };
      });
    });
  }
  kinds.crumbs = { model: CrumbsKind, events: ACTION,
    props: { label: str('Breadcrumb'), items: arr() },
    view: '<nav class="bx-crumbs" :aria-label="[[$properties.label]]"><ol>' + each('items', 'c', '<li>' + iff('!c.data.last', '<button type="button" class="bx-crumb" on-click="[[c.data.go]]">'
      + txt('c.data.label') + '</button><span class="bx-crumb-sep" aria-hidden="true">/</span>') + iff('c.data.last', '<span class="bx-crumb is-here" aria-current="page">' + txt('c.data.label') + '</span>')
      + '</li>') + '</ol></nav>' };

  /* ---------- side nav (oj-navigation-list): the sections of the app; the chosen one is the current page ---------- */
  function NavKind(context) {
    var self = this;
    base(self, context, 'bx-nav');
    self.items = ko.pureComputed(function () {
      return list(self.props.items).map(function (o) {
        var on = o.id === String(self.props.selection);
        return { label: o.label, badge: o.badge !== undefined ? String(o.badge) : '', current: on ? 'page' : null, css: 'bx-nav-item' + (on ? ' is-on' : ''), disabled: o.disabled,
          pick: function () { if (!o.disabled) { self.props.selection = o.value !== undefined ? o.value : o.id; } } };
      });
    });
  }
  kinds.nav = { model: NavKind,
    props: { label: str('Main'), items: arr(), selection: { type: 'any', writeback: true } },
    view: '<nav class="bx-nav" :aria-label="[[$properties.label]]"><ul>' + each('items', 'n', '<li><button type="button" :class="[[n.data.css]]" :aria-current="[[n.data.current]]"'
      + ' :disabled="[[n.data.disabled]]" on-click="[[n.data.pick]]"><span>' + txt('n.data.label') + '</span>' + iff('n.data.badge', '<span class="bx-nav-badge">' + txt('n.data.badge') + '</span>')
      + '</button></li>') + '</ul></nav>' };

  /* ---------- sheet (oj-popup): a panel from the side or the bottom; Escape and the backdrop close it ---------- */
  function SheetKind(context) {
    var self = this;
    base(self, context, 'bx-sheet');
    var opener = null;
    self.css = ko.pureComputed(function () { return 'bx-sheet is-' + (self.props.position || 'end'); });
    self.close = function () {
      if (!self.props.open) { return; }
      self.props.open = false;
      bx.fire(self.element, 'ojClose', {});
      if (opener && opener.focus) { var o = opener; opener = null; window.setTimeout(function () { o.focus(); }, 0); }
    };
    self.propertyChanged = function (d) {
      if (d.property === 'open' && d.value) { opener = document.activeElement; focusLater(self, '.bx-sheet'); }
    };
    self.onKey = function (event) {
      if (event.key === 'Escape') { self.close(); return false; }
      if (event.key === 'Tab' && self.element.querySelectorAll) {
        var l = Array.prototype.slice.call(self.element.querySelectorAll('.bx-sheet button, .bx-sheet [href], .bx-sheet input, .bx-sheet select, .bx-sheet textarea, .bx-sheet [tabindex="0"]'));
        if (l.length && event.shiftKey && document.activeElement === l[0]) { event.preventDefault(); l[l.length - 1].focus(); return false; }
        if (l.length && !event.shiftKey && document.activeElement === l[l.length - 1]) { event.preventDefault(); l[0].focus(); return false; }
      }
      return true;
    };
  }
  kinds.sheet = { model: SheetKind, events: { ojClose: { bubbles: true } },
    props: { open: { type: 'boolean', value: false, writeback: true }, heading: str(), position: str('end') },
    view: iff('$properties.open', '<div class="bx-dialog-backdrop" on-click="[[close]]"></div><div :class="[[css]]" role="dialog" aria-modal="true" tabindex="-1"'
      + ' :aria-labelledby="[[id + \'-title\']]" on-keydown="[[onKey]]"><div class="bx-dialog-header"><h2 class="bx-dialog-title" :id="[[id + \'-title\']]">' + txt('$properties.heading') + '</h2>'
      + '<button type="button" class="bx-btn bx-btn--borderless bx-btn--icon" aria-label="Close" on-click="[[close]]"><span aria-hidden="true">×</span></button></div>'
      + '<div class="bx-dialog-body"><oj-bind-slot></oj-bind-slot></div><div class="bx-dialog-footer"><oj-bind-slot name="footer"></oj-bind-slot></div></div>') };

  /* ---------- grid: a responsive layout of columns ---------- */
  function GridKind(context) {
    var self = this;
    base(self, context, 'bx-grid');
    self.css = ko.pureComputed(function () { return 'bx-layout-grid is-cols-' + (self.props.columns || 'auto') + ' is-gap-' + (self.props.gap || 'md'); });
  }
  kinds.grid = { model: GridKind, props: { columns: { type: 'any', value: 'auto' }, gap: str('md') }, view: '<div :class="[[css]]"><oj-bind-slot></oj-bind-slot></div>' };

  /* ---------- divider: a line between parts, with an optional label ---------- */
  function DividerKind(context) { base(this, context, 'bx-divider'); }
  kinds.divider = { model: DividerKind, props: { label: str() },
    view: iff('!$properties.label', '<hr class="bx-divider"/>') + iff('$properties.label', '<div class="bx-divider has-label" role="separator" :aria-label="[[$properties.label]]">'
      + '<span aria-hidden="true">' + txt('$properties.label') + '</span></div>') };

  /* ---------- avatar: a photo, or the initials of a name ---------- */
  function AvatarKind(context) {
    var self = this;
    base(self, context, 'bx-avatar');
    self.initials = ko.pureComputed(function () { return initials(self.props.name); });
    self.css = ko.pureComputed(function () { return 'bx-avatar is-' + (self.props.size || 'md'); });
  }
  kinds.avatar = { model: AvatarKind, props: { name: str(), src: str(), size: str('md') },
    view: iff('$properties.src', '<img :class="[[css]]" :src="[[$properties.src]]" :alt="[[$properties.name]]"/>')
      + iff('!$properties.src', '<span :class="[[css]]" role="img" :aria-label="[[$properties.name]]"><span aria-hidden="true">' + txt('initials') + '</span></span>') };

  /* ---------- pagination (oj-paging-control): previous, the pages around this one, next ---------- */
  function PagesKind(context) {
    var self = this;
    base(self, context, 'bx-pages');
    var count = function () { return Math.max(1, self.props.pageCount || 1); };
    var go = function (p) { var n = Math.min(count(), Math.max(1, p)); if (n !== self.props.page) { self.props.page = n; } };
    self.pages = ko.pureComputed(function () {
      var n = count();
      var at = self.props.page || 1;
      var out = [];
      for (var p = 1; p <= n; p++) {
        if (p === 1 || p === n || Math.abs(p - at) <= 1) { out.push(p); } else if (out[out.length - 1] !== 0) { out.push(0); }
      }
      return out.map(function (p, i) {
        return { key: p || 'gap' + i, gap: p === 0, label: String(p), name: 'Page ' + p, current: p === at ? 'page' : null, css: 'bx-page' + (p === at ? ' is-on' : ''),
          pick: function () { go(p); } };
      });
    });
    self.atFirst = ko.pureComputed(function () { return (self.props.page || 1) <= 1; });
    self.atLast = ko.pureComputed(function () { return (self.props.page || 1) >= count(); });
    self.prev = function () { go((self.props.page || 1) - 1); };
    self.next = function () { go((self.props.page || 1) + 1); };
  }
  kinds.pages = { model: PagesKind,
    props: { label: str('Pages'), page: { type: 'number', value: 1, writeback: true }, pageCount: num(1) },
    view: '<nav class="bx-pages" :aria-label="[[$properties.label]]"><button type="button" class="bx-page" aria-label="Previous page" :disabled="[[atFirst]]" on-click="[[prev]]">‹</button>'
      + each('pages', 'p', iff('p.data.gap', '<span class="bx-page-gap" aria-hidden="true">…</span>') + iff('!p.data.gap', '<button type="button" :class="[[p.data.css]]" :aria-label="[[p.data.name]]"'
        + ' :aria-current="[[p.data.current]]" on-click="[[p.data.pick]]">' + txt('p.data.label') + '</button>'))
      + '<button type="button" class="bx-page" aria-label="Next page" :disabled="[[atLast]]" on-click="[[next]]">›</button></nav>' };

  /* ---------- badge: a status in a word (neutral, info, success, warning, danger) ---------- */
  function BadgeKind(context) {
    var self = this;
    base(self, context, 'bx-badge');
    self.css = ko.pureComputed(function () { return 'bx-badge is-' + (self.props.tone || 'neutral'); });
  }
  kinds.badge = { model: BadgeKind, props: { label: str(), tone: str('neutral') },
    view: '<span :class="[[css]]"><span class="bx-badge-dot" aria-hidden="true"></span>' + txt('$properties.label') + '</span>' };

  /* ---------- timeline: events in order, with who and when ---------- */
  function TimelineKind(context) {
    var self = this;
    base(self, context, 'bx-tl');
    self.items = ko.pureComputed(function () {
      return list(self.props.items).map(function (o) {
        var state = o.state || 'done';
        return { label: o.label, meta: o.meta || '', css: 'bx-tl-item is-' + state, current: state === 'current' ? 'step' : null,
          status: state === 'done' ? '' : state === 'current' ? 'In progress' : state === 'failed' ? 'Failed' : 'Not yet' };
      });
    });
  }
  kinds.timeline = { model: TimelineKind, props: { label: str('Timeline'), items: arr() },
    view: '<ol class="bx-timeline" :aria-label="[[$properties.label]]">' + each('items', 't', '<li :class="[[t.data.css]]" :aria-current="[[t.data.current]]"><span class="bx-tl-dot" aria-hidden="true"></span>'
      + '<span class="bx-tl-text"><strong>' + txt('t.data.label') + '</strong>' + iff('t.data.meta', '<span class="bx-tl-meta">' + txt('t.data.meta') + '</span>')
      + iff('t.data.status', '<span class="bx-tl-status">' + txt('t.data.status') + '</span>') + '</span></li>') + '</ol>' };

  /* ---------- spinner and skeleton: waiting, said to screen readers once ---------- */
  function SpinnerKind(context) {
    var self = this;
    base(self, context, 'bx-spin');
    self.css = ko.pureComputed(function () { return 'bx-spinner is-' + (self.props.size || 'md'); });
  }
  kinds.spinner = { model: SpinnerKind, props: { label: str('Loading'), size: str('md') },
    view: '<span class="bx-spinner-wrap" role="status"><span :class="[[css]]" aria-hidden="true"></span><span class="bx-visually-hidden">' + txt('$properties.label') + '</span></span>' };
  function SkeletonKind(context) {
    var self = this;
    base(self, context, 'bx-skel');
    self.lines = ko.pureComputed(function () {
      var n = Math.max(1, self.props.lines || 3);
      var out = [];
      for (var i = 0; i < n; i++) { out.push({ css: 'bx-skel-line' + (i === n - 1 && n > 1 ? ' is-short' : '') }); }
      return out;
    });
    self.css = ko.pureComputed(function () { return 'bx-skeleton is-' + (self.props.shape || 'text'); });
  }
  kinds.skeleton = { model: SkeletonKind, props: { label: str('Loading'), lines: num(3), shape: str('text') },
    view: '<div :class="[[css]]" role="status" aria-busy="true"><span class="bx-visually-hidden">' + txt('$properties.label') + '</span>'
      + iff('$properties.shape !== \'text\'', '<span class="bx-skel-block" aria-hidden="true"></span>') + each('lines', 'l', '<span :class="[[l.data.css]]" aria-hidden="true"></span>') + '</div>' };

  /* ---------- empty state: nothing to show yet, and what to do ---------- */
  function EmptyKind(context) {
    var self = this;
    base(self, context, 'bx-empty');
    self.act = function () { bx.fire(self.element, 'ojAction', {}); };
  }
  kinds.empty = { model: EmptyKind, events: ACTION, props: { heading: str(), text: str(), actionLabel: str(), icon: str('○') },
    view: '<div class="bx-empty"><span class="bx-empty-icon" aria-hidden="true">' + txt('$properties.icon') + '</span><h3 class="bx-empty-title">' + txt('$properties.heading') + '</h3>'
      + iff('$properties.text', '<p class="bx-empty-text">' + txt('$properties.text') + '</p>')
      + iff('$properties.actionLabel', '<button type="button" class="bx-btn bx-btn--outlined" on-click="[[act]]">' + txt('$properties.actionLabel') + '</button>') + '</div>' };

  /* ---------- tooltip: a short note on a term, on hover and focus; Escape hides it ---------- */
  function TooltipKind(context) {
    var self = this;
    base(self, context, 'bx-tip');
    self.open = ko.observable(false);
    self.name = ko.pureComputed(function () { return 'About ' + (self.props.label || 'this'); });
    self.show = function () { self.open(true); return true; };
    self.hide = function () { self.open(false); return true; };
    self.onKey = function (event) { if (event.key === 'Escape') { self.open(false); } return true; };
  }
  kinds.tooltip = { model: TooltipKind, props: { label: str(), text: str() },
    view: '<span class="bx-tooltip" on-mouseenter="[[show]]" on-mouseleave="[[hide]]"><span>' + txt('$properties.label') + '</span>'
      + '<button type="button" class="bx-tip-button" :aria-label="[[name]]" :aria-describedby="[[id]]" on-focus="[[show]]" on-blur="[[hide]]" on-keydown="[[onKey]]">i</button>'
      + '<span class="bx-tip" role="tooltip" :id="[[id]]" :hidden="[[!open()]]">' + txt('$properties.text') + '</span></span>' };

  /* ---------- alert (oj-messages in the page): a message with its severity, an action, and Dismiss ---------- */
  function AlertKind(context) {
    var self = this;
    base(self, context, 'bx-alert');
    self.dismissed = ko.observable(false);
    self.css = ko.pureComputed(function () { return 'bx-alert is-' + (self.props.severity || 'info'); });
    self.role = ko.pureComputed(function () { return self.props.severity === 'error' ? 'alert' : 'status'; });
    self.icon = ko.pureComputed(function () { return SEVERITY_ICON[self.props.severity] || 'i'; });
    self.act = function () { bx.fire(self.element, 'ojAction', {}); };
    self.dismiss = function () { self.dismissed(true); bx.fire(self.element, 'ojClose', {}); };
  }
  kinds.alert = { model: AlertKind, events: { ojAction: { bubbles: true }, ojClose: { bubbles: true } },
    props: { heading: str(), message: str(), severity: str('info'), actionLabel: str(), dismissible: bool() },
    view: iff('!dismissed()', '<div :class="[[css]]" :role="[[role]]"><span class="bx-alert-icon" aria-hidden="true">' + txt('icon') + '</span><div class="bx-alert-text">'
      + iff('$properties.heading', '<strong>' + txt('$properties.heading') + '</strong>') + '<span>' + txt('$properties.message') + '</span></div>'
      + iff('$properties.actionLabel', '<button type="button" class="bx-alert-action" on-click="[[act]]">' + txt('$properties.actionLabel') + '</button>')
      + iff('$properties.dismissible', '<button type="button" class="bx-btn bx-btn--borderless bx-btn--icon bx-btn--sm" aria-label="Dismiss" on-click="[[dismiss]]"><span aria-hidden="true">×</span></button>')
      + '</div>') };

  /* ---------- rows: a list of items, each with what it is, when, a value and an action ---------- */
  function RowsKind(context) {
    var self = this;
    base(self, context, 'bx-rows');
    self.rows = ko.pureComputed(function () {
      return list(self.props.items).map(function (o) {
        var title = o.title !== undefined ? String(o.title) : o.label;
        return { title: title, meta: o.meta || '', value: o.value !== undefined && o.title !== undefined ? String(o.value) : '', css: 'bx-row' + (o.tone ? ' is-' + o.tone : '') + (o.unread ? ' is-unread' : ''),
          actionName: (self.props.actionLabel || '') + ': ' + title,
          act: function () { bx.fire(self.element, 'ojAction', { item: o }); } };
      });
    });
    self.empty = ko.pureComputed(function () { return self.rows().length === 0; });
  }
  kinds.rows = { model: RowsKind, events: ACTION, props: { heading: str(), items: arr(), actionLabel: str(), emptyText: str('Nothing here yet.') },
    view: '<section class="bx-panel" :aria-label="[[$properties.heading || null]]">' + iff('$properties.heading', '<h3 class="bx-panel-title">' + txt('$properties.heading') + '</h3>')
      + iff('empty()', '<p class="bx-panel-empty">' + txt('$properties.emptyText') + '</p>')
      + iff('!empty()', '<ul class="bx-rows">' + each('rows', 'r', '<li :class="[[r.data.css]]"><span class="bx-row-main"><strong>' + txt('r.data.title') + '</strong>'
        + iff('r.data.meta', '<span class="bx-row-meta">' + txt('r.data.meta') + '</span>') + '</span>' + iff('r.data.value', '<span class="bx-row-value">' + txt('r.data.value') + '</span>')
        + iff('$properties.actionLabel', '<button type="button" class="bx-btn bx-btn--borderless bx-btn--sm" :aria-label="[[r.data.actionName]]" on-click="[[r.data.act]]">' + txt('$properties.actionLabel') + '</button>')
        + '</li>') + '</ul>') + '</section>' };

  /* ---------- group 1 ---------- */
  var elements = [
    register('bx-secondary-button', kinds.button, { chroming: 'outlined' }),
    register('bx-danger-button', kinds.button, { chroming: 'danger' }),
    register('bx-savings-slider', kinds.slider, { max: 20000, step: 500 }),
    register('bx-segmented', kinds.segmented),
    register('bx-filter-chips', kinds.chips),
    register('bx-action-menu', kinds.menu),
    register('bx-accordion', kinds.accordion),
    register('bx-stepper', kinds.steps),
    register('bx-breadcrumb', kinds.crumbs),
    register('bx-side-nav', kinds.nav),
    register('bx-sheet', kinds.sheet),
    register('bx-grid', kinds.grid),
    register('bx-divider', kinds.divider),
    register('bx-avatar', kinds.avatar),
    register('bx-pagination', kinds.pages),
    register('bx-status-badge', kinds.badge),
    register('bx-timeline', kinds.timeline),
    register('bx-spinner', kinds.spinner),
    register('bx-skeleton', kinds.skeleton),
    register('bx-empty-state', kinds.empty),
    register('bx-tooltip', kinds.tooltip),
    register('bx-alert-banner', kinds.alert, { severity: 'info' }),
    register('bx-error-message', kinds.alert, { severity: 'error' }),
    register('bx-success-message', kinds.alert, { severity: 'confirmation' }),
    register('bx-notification-panel', kinds.rows, { heading: 'Notifications', actionLabel: 'Read' })
  ];

  return { elements: elements, kinds: kinds,
    kit: { txt: txt, iff: iff, each: each, list: list, base: base, register: register, str: str, bool: bool, num: num, arr: arr, ACTION: ACTION,
      focusLater: focusLater, arrow: arrow, initials: initials, copy: copy, motion: motion } };
});
