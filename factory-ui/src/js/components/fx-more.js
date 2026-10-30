/*
 * More of the factory's own elements (design system): <fx-multiselect>, <fx-radio-group>, <fx-segmented>,
 * <fx-date-range>, <fx-popover>, <fx-sheet>, <fx-resizer> and <fx-markdown>. Same rules as fx-elements.js: JET composites so
 * value="{{x}}" writes back, design-system markup and keyboard behaviour.
 */
define(['knockout', 'ojs/ojcomposite', './fx-elements', '../services/markdown', 'ojs/ojknockout'], function (ko, Composite, fx, markdown) {
  let seq = 0;
  const nextId = (p) => p + '-' + (++seq);
  const opts = (list) => (list || []).map((o) => (o !== null && typeof o === 'object'
    ? { value: o.value, label: o.label !== undefined ? String(o.label) : String(o.value), disabled: !!o.disabled, description: o.description || '' }
    : { value: o, label: String(o), disabled: false, description: '' }));
  const watch = (root, isOpen, close) => {
    const down = (e) => { if (isOpen() && !root.contains(e.target)) { close(); } };
    const scroll = (e) => { if (isOpen() && !(e.target && e.target.nodeType === 1 && root.contains(e.target))) { close(); } };
    document.addEventListener('mousedown', down, true);
    window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('mousedown', down, true); window.removeEventListener('scroll', scroll, true); };
  };
  const label = '<oj-bind-if test="[[$properties.label]]"><span :id="[[id + \'-l\']]" :class="[[$properties.hideLabel ? \'fx-label fx-visually-hidden\' : \'fx-label\']]"><oj-bind-text value="[[$properties.label]]"></oj-bind-text></span></oj-bind-if>';
  const help = '<oj-bind-if test="[[$properties.error]]"><span class="fx-error" role="alert"><span class="factory-nav-icon factory-ico-alert" aria-hidden="true"></span><oj-bind-text value="[[$properties.error]]"></oj-bind-text></span></oj-bind-if>'
    + '<oj-bind-if test="[[!$properties.error && $properties.help]]"><span class="fx-help"><oj-bind-text value="[[$properties.help]]"></oj-bind-text></span></oj-bind-if>';
  const base = {
    label: { type: 'string', value: '' }, hideLabel: { type: 'boolean', value: false }, help: { type: 'string', value: '' },
    error: { type: 'string', value: '' }, disabled: { type: 'boolean', value: false }
  };

  /* ---------- fx-multiselect: several values, shown as removable chips, with a searchable checklist ---------- */
  class MultiModel {
    constructor(c) {
      this.props = c.properties;
      this.element = c.element;
      this.id = nextId('fx-multi');
      this.open = ko.observable(false);
      this.query = ko.observable('');
      this.active = ko.observable(0);
      this.values = ko.pureComputed(() => (Array.isArray(this.props.value) ? this.props.value : []));
      this.list = ko.pureComputed(() => opts(this.props.options));
      this.chips = ko.pureComputed(() => this.list().filter((o) => this.values().indexOf(o.value) >= 0).map((o) => ({
        label: o.label, remove: () => this.toggleValue(o), removeLabel: 'Remove ' + o.label
      })));
      this.rows = ko.pureComputed(() => {
        const q = this.query().toLowerCase();
        return this.list().filter((o) => !q || o.label.toLowerCase().indexOf(q) >= 0).map((o, i) => {
          const on = this.values().indexOf(o.value) >= 0;
          return { id: this.id + '-o' + i, label: o.label, description: o.description, on: on, disabled: o.disabled,
            css: 'fx-option fx-option--check' + (on ? ' is-selected' : '') + (i === this.active() ? ' is-active' : '') + (o.disabled ? ' is-disabled' : ''),
            pick: () => this.toggleValue(o) };
        });
      });
      this.summary = ko.pureComputed(() => (this.chips().length ? '' : this.props.placeholder || 'Choose…'));
      this.activeId = ko.pureComputed(() => (this.open() && this.rows()[this.active()] ? this.rows()[this.active()].id : null));
      this.css = ko.pureComputed(() => 'fx-field' + (this.props.error ? ' is-error' : ''));
      this.toggle = () => (this.open() ? this.close() : this.show());
      this.onQuery = (e) => { this.query(e.target.value); this.active(0); };
      this.clearAll = () => { this.props.value = []; };
      this.onKey = (e) => {
        const rows = this.rows();
        if (e.key === 'ArrowDown') { e.preventDefault(); if (!this.open()) { this.show(); } else { this.active(Math.min(rows.length - 1, this.active() + 1)); } }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.active(Math.max(0, this.active() - 1)); }
        else if ((e.key === 'Enter' || (e.key === ' ' && e.target.tagName !== 'INPUT')) && this.open()) { e.preventDefault(); if (rows[this.active()]) { rows[this.active()].pick(); } }
        else if (e.key === 'Escape' && this.open()) { e.preventDefault(); this.close(true); }
        else if (e.key === 'Backspace' && !this.query() && this.values().length && e.target.tagName === 'INPUT') { this.props.value = this.values().slice(0, -1); }
        return true;
      };
    }
    connected() { this.unwatch = watch(this.element, this.open, () => this.close()); }
    disconnected() { if (this.unwatch) { this.unwatch(); } }
    toggleValue(o) {
      if (o.disabled) { return; }
      const v = this.values().slice();
      const at = v.indexOf(o.value);
      if (at >= 0) { v.splice(at, 1); } else { v.push(o.value); }
      this.props.value = v;
    }
    show() {
      if (this.props.disabled) { return; }
      this.query('');
      this.active(0);
      this.open(true);
      window.setTimeout(() => {
        const pop = this.element.querySelector('.fx-popup');
        if (pop) { fx.place(pop, this.element.querySelector('.fx-multi-box'), 'start'); }
        const s = this.element.querySelector('.fx-popup-search input');
        if (s) { s.focus(); }
      }, 0);
    }
    close(refocus) { this.open(false); if (refocus) { const b = this.element.querySelector('.fx-multi-box'); if (b) { b.focus(); } } }
  }
  Composite.register('fx-multiselect', {
    view: '<div :class="[[css]]">' + label
      + '<div class="fx-multi-box fx-select" role="combobox" tabindex="0" :aria-labelledby="[[$properties.label ? id + \'-l\' : null]]" :aria-label="[[$properties.label ? null : ($properties.placeholder || \'Choose\')]]"'
      + ' aria-haspopup="listbox" :aria-expanded="[[open() ? \'true\' : \'false\']]" :aria-controls="[[id + \'-list\']]" :aria-disabled="[[$properties.disabled ? \'true\' : null]]" on-click="[[toggle]]" on-keydown="[[onKey]]">'
      + '<oj-bind-for-each data="[[chips]]" as="c"><template><span class="fx-chip fx-chip--sm"><oj-bind-text value="[[c.data.label]]"></oj-bind-text>'
      + '<button type="button" class="fx-chip-remove" :aria-label="[[c.data.removeLabel]]" on-click="[[c.data.remove]]"><span class="factory-nav-icon factory-ico-x" aria-hidden="true"></span></button></span></template></oj-bind-for-each>'
      + '<span class="fx-multi-placeholder"><oj-bind-text value="[[summary]]"></oj-bind-text></span></div>'
      + '<oj-bind-if test="[[open()]]"><div class="fx-popup" role="presentation"><div class="fx-popup-search fx-control"><span class="factory-nav-icon factory-ico-search fx-control-icon" aria-hidden="true"></span>'
      + '<input class="fx-input" type="search" placeholder="Search…" aria-label="Search the options" :aria-activedescendant="[[activeId]]" on-input="[[onQuery]]" on-keydown="[[onKey]]"></div>'
      + '<ul class="fx-listbox" role="listbox" aria-multiselectable="true" :id="[[id + \'-list\']]">'
      + '<oj-bind-for-each data="[[rows]]" as="r"><template><li role="option" :id="[[r.data.id]]" :class="[[r.data.css]]" :aria-selected="[[r.data.on ? \'true\' : \'false\']]" :aria-disabled="[[r.data.disabled ? \'true\' : null]]" on-click="[[r.data.pick]]">'
      + '<span class="fx-checkmark" aria-hidden="true"></span><span class="fx-option-text"><oj-bind-text value="[[r.data.label]]"></oj-bind-text>'
      + '<oj-bind-if test="[[r.data.description]]"><span class="fx-option-desc"><oj-bind-text value="[[r.data.description]]"></oj-bind-text></span></oj-bind-if></span></li></template></oj-bind-for-each>'
      + '<oj-bind-if test="[[rows().length === 0]]"><li class="fx-option is-empty" role="presentation">No matches</li></oj-bind-if></ul>'
      + '<div class="fx-popup-foot"><button type="button" class="fx-btn fx-btn--link fx-btn--sm" on-click="[[clearAll]]">Clear</button><span class="fx-muted"><oj-bind-text value="[[values().length + \' selected\']]"></oj-bind-text></span></div></div></oj-bind-if>'
      + help + '</div>',
    viewModel: MultiModel,
    metadata: { properties: Object.assign({}, base, { value: { type: 'array', writeback: true, value: [] }, options: { type: 'array', value: [] }, placeholder: { type: 'string', value: '' } }) }
  });

  /* ---------- fx-radio-group: one of a few options (native radios, arrow keys move) ---------- */
  class RadioModel {
    constructor(c) {
      this.props = c.properties;
      this.id = nextId('fx-radio');
      this.rows = ko.pureComputed(() => opts(this.props.options).map((o, i) => ({
        id: this.id + '-' + i, label: o.label, description: o.description, disabled: o.disabled || this.props.disabled,
        checked: o.value === this.props.value, pick: () => { this.props.value = o.value; return true; }
      })));
      this.css = ko.pureComputed(() => 'fx-radio-group' + (this.props.inline ? ' fx-radio-group--inline' : ''));
    }
  }
  Composite.register('fx-radio-group', {
    view: '<fieldset :class="[[css]]"><oj-bind-if test="[[$properties.label]]"><legend :class="[[$properties.hideLabel ? \'fx-label fx-visually-hidden\' : \'fx-label\']]"><oj-bind-text value="[[$properties.label]]"></oj-bind-text></legend></oj-bind-if>'
      + '<oj-bind-for-each data="[[rows]]" as="r"><template><label class="fx-check" :for="[[r.data.id]]"><input type="radio" :id="[[r.data.id]]" :name="[[id]]" :checked="[[r.data.checked]]" :disabled="[[r.data.disabled]]" on-change="[[r.data.pick]]">'
      + '<span><oj-bind-text value="[[r.data.label]]"></oj-bind-text><oj-bind-if test="[[r.data.description]]"><span class="fx-option-desc"><oj-bind-text value="[[r.data.description]]"></oj-bind-text></span></oj-bind-if></span></label></template></oj-bind-for-each>'
      + help + '</fieldset>',
    viewModel: RadioModel,
    metadata: { properties: Object.assign({}, base, { value: { type: 'any', writeback: true }, options: { type: 'array', value: [] }, inline: { type: 'boolean', value: false } }) }
  });

  /* ---------- fx-segmented: a segmented control (one value; radiogroup semantics, arrow keys) ---------- */
  class SegmentedModel {
    constructor(c) {
      this.props = c.properties;
      this.element = c.element;
      this.id = nextId('fx-seg');
      this.rows = ko.pureComputed(() => opts(this.props.options).map((o) => ({
        label: o.label, value: o.value, disabled: o.disabled || this.props.disabled,
        checked: o.value === this.props.value ? 'true' : 'false', tab: o.value === this.props.value ? '0' : '-1',
        pick: () => { this.props.value = o.value; }
      })));
      this.onKey = (e) => {
        const list = this.rows().filter((r) => !r.disabled);
        const at = list.findIndex((r) => r.checked === 'true');
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (d && list.length) {
          e.preventDefault();
          const next = list[(at + d + list.length) % list.length];
          this.props.value = next.value;
          window.setTimeout(() => { const b = this.element.querySelector('[aria-checked="true"]'); if (b) { b.focus(); } }, 0);
        }
        return true;
      };
    }
  }
  Composite.register('fx-segmented', {
    view: '<div class="fx-toggle-group" role="radiogroup" :aria-label="[[$properties.label]]" on-keydown="[[onKey]]">'
      + '<oj-bind-for-each data="[[rows]]" as="r"><template><button type="button" role="radio" :aria-checked="[[r.data.checked]]" :aria-pressed="[[r.data.checked]]" :tabindex="[[r.data.tab]]" :disabled="[[r.data.disabled]]" on-click="[[r.data.pick]]">'
      + '<oj-bind-text value="[[r.data.label]]"></oj-bind-text></button></template></oj-bind-for-each></div>',
    viewModel: SegmentedModel,
    metadata: { properties: { value: { type: 'any', writeback: true }, options: { type: 'array', value: [] }, label: { type: 'string', value: '' }, disabled: { type: 'boolean', value: false } } }
  });

  /* ---------- fx-date-range: from and to (yyyy-mm-dd) with presets ---------- */
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
  const nice = (s) => { const d = parse(s); return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  class RangeModel {
    constructor(c) {
      this.props = c.properties;
      this.element = c.element;
      this.id = nextId('fx-range');
      this.open = ko.observable(false);
      this.text = ko.pureComputed(() => (this.props.from || this.props.to ? (nice(this.props.from) || '…') + ' – ' + (nice(this.props.to) || '…') : this.props.placeholder || 'All dates'));
      this.error = ko.pureComputed(() => (this.props.from && this.props.to && this.props.from > this.props.to ? 'The end date is before the start date.' : ''));
      this.toggle = () => (this.open() ? this.close() : this.show());
      const today = new Date();
      const days = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };
      this.presets = [
        { label: 'Today', from: iso(today), to: iso(today) },
        { label: 'Last 7 days', from: days(6), to: iso(today) },
        { label: 'Last 30 days', from: days(29), to: iso(today) },
        { label: 'This month', from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) },
        { label: 'All dates', from: '', to: '' }
      ].map((p) => Object.assign(p, { pick: () => { this.props.from = p.from; this.props.to = p.to; this.close(true); } }));
      this.fromChange = (e) => { this.props.from = e.detail.value; };
      this.toChange = (e) => { this.props.to = e.detail.value; };
      this.done = () => this.close(true);
      this.onKey = (e) => { if (e.key === 'Escape' && this.open()) { e.preventDefault(); this.close(true); } return true; };
    }
    connected() { this.unwatch = watch(this.element, this.open, () => this.close()); }
    disconnected() { if (this.unwatch) { this.unwatch(); } }
    show() {
      if (this.props.disabled) { return; }
      this.open(true);
      window.setTimeout(() => {
        const pop = this.element.querySelector('.fx-popup');
        if (pop) { fx.place(pop, this.element.querySelector('.fx-range-button'), 'start'); }
        const first = this.element.querySelector('.fx-range-presets button');
        if (first) { first.focus(); }
      }, 0);
    }
    close(refocus) { this.open(false); if (refocus) { const b = this.element.querySelector('.fx-range-button'); if (b) { b.focus(); } } }
  }
  Composite.register('fx-date-range', {
    view: '<div class="fx-field" on-keydown="[[onKey]]">' + label
      + '<button type="button" class="fx-select fx-select-button fx-range-button" aria-haspopup="dialog" :aria-expanded="[[open() ? \'true\' : \'false\']]" :aria-labelledby="[[$properties.label ? id + \'-l \' + id + \'-v\' : null]]" :disabled="[[$properties.disabled]]" on-click="[[toggle]]">'
      + '<span class="factory-nav-icon factory-ico-calendar" aria-hidden="true"></span><span class="fx-select-text" :id="[[id + \'-v\']]"><oj-bind-text value="[[text]]"></oj-bind-text></span></button>'
      + '<oj-bind-if test="[[open()]]"><div class="fx-popup fx-range-pop" role="dialog" aria-label="Choose a date range"><div class="fx-range-presets">'
      + '<oj-bind-for-each data="[[presets]]" as="p"><template><button type="button" class="fx-btn fx-btn--ghost fx-btn--sm" on-click="[[p.data.pick]]"><oj-bind-text value="[[p.data.label]]"></oj-bind-text></button></template></oj-bind-for-each></div>'
      + '<div class="fx-form fx-form--2"><fx-date label="From" value="[[$properties.from]]" max="[[$properties.to]]" on-value-changed="[[fromChange]]"></fx-date><fx-date label="To" value="[[$properties.to]]" min="[[$properties.from]]" on-value-changed="[[toChange]]"></fx-date></div>'
      + '<oj-bind-if test="[[error()]]"><span class="fx-error" role="alert"><oj-bind-text value="[[error]]"></oj-bind-text></span></oj-bind-if>'
      + '<div class="fx-popup-foot"><span></span><button type="button" class="fx-btn fx-btn--primary fx-btn--sm" on-click="[[done]]">Done</button></div></div></oj-bind-if>' + help + '</div>',
    viewModel: RangeModel,
    metadata: { properties: Object.assign({}, base, { from: { type: 'string', writeback: true, value: '' }, to: { type: 'string', writeback: true, value: '' }, placeholder: { type: 'string', value: '' } }) }
  });

  /* ---------- fx-popover: a button that opens rich content (slot) next to it ---------- */
  class PopoverModel {
    constructor(c) {
      this.props = c.properties;
      this.element = c.element;
      this.id = nextId('fx-pop');
      this.open = ko.observable(false);
      this.buttonCss = ko.pureComputed(() => 'fx-btn fx-btn--' + (this.props.variant || 'tertiary') + (this.props.size === 'sm' ? ' fx-btn--sm' : '') + (this.props.iconOnly ? ' fx-btn--icon' : ''));
      this.iconCss = ko.pureComputed(() => 'factory-nav-icon factory-ico-' + this.props.icon);
      this.toggle = () => (this.open() ? this.close(true) : this.show());
      this.onKey = (e) => { if (e.key === 'Escape' && this.open()) { e.preventDefault(); this.close(true); } return true; };
    }
    connected() { this.unwatch = watch(this.element, this.open, () => this.close()); }
    disconnected() { if (this.unwatch) { this.unwatch(); } }
    show() {
      this.open(true);
      window.setTimeout(() => {
        const pop = this.element.querySelector('.fx-popover');
        if (pop) { fx.place(pop, this.element.querySelector('button'), this.props.align || 'start'); pop.focus(); }
      }, 0);
    }
    close(refocus) { this.open(false); if (refocus) { const b = this.element.querySelector('button'); if (b) { b.focus(); } } }
  }
  Composite.register('fx-popover', {
    view: '<span class="fx-popover-wrap" on-keydown="[[onKey]]"><button type="button" :class="[[buttonCss]]" aria-haspopup="dialog" :aria-expanded="[[open() ? \'true\' : \'false\']]" :aria-controls="[[id]]"'
      + ' :aria-label="[[$properties.iconOnly ? $properties.label : null]]" on-click="[[toggle]]"><oj-bind-if test="[[$properties.icon]]"><span :class="[[iconCss]]" aria-hidden="true"></span></oj-bind-if>'
      + '<oj-bind-if test="[[!$properties.iconOnly]]"><oj-bind-text value="[[$properties.label]]"></oj-bind-text></oj-bind-if></button>'
      + '<div class="fx-popup fx-popover" role="dialog" tabindex="-1" :id="[[id]]" :aria-label="[[$properties.title || $properties.label]]" :hidden="[[!open()]]">'
      + '<oj-bind-if test="[[$properties.title]]"><strong class="fx-popover-title"><oj-bind-text value="[[$properties.title]]"></oj-bind-text></strong></oj-bind-if><oj-bind-slot></oj-bind-slot></div></span>',
    viewModel: PopoverModel,
    metadata: { properties: { label: { type: 'string', value: '' }, title: { type: 'string', value: '' }, icon: { type: 'string', value: '' }, iconOnly: { type: 'boolean', value: false },
      variant: { type: 'string', value: 'tertiary' }, size: { type: 'string', value: '' }, align: { type: 'string', value: 'start' } } }
  });

  /* ---------- fx-sheet: a side panel over the page for details and logs (slot); Escape closes ---------- */
  class SheetModel {
    constructor(c) {
      this.props = c.properties;
      this.element = c.element;
      this.titleId = nextId('fx-sheet');
      this.close = () => { this.props.open = false; };
      this.onBackdrop = (e) => { if (e.target === e.currentTarget) { this.close(); } };
      this.onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); this.close(); return false; }
        if (e.key === 'Tab') {
          const items = Array.from(this.element.querySelectorAll('.fx-sheet button, .fx-sheet a[href], .fx-sheet input, .fx-sheet select, .fx-sheet textarea, .fx-sheet [tabindex="0"]')).filter((x) => !x.disabled && x.offsetParent !== null);
          if (items.length) {
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        }
        return true;
      };
      this.css = ko.pureComputed(() => 'fx-sheet fx-sheet--' + (this.props.side || 'right') + (this.props.wide ? ' fx-sheet--wide' : ''));
    }
    propertyChanged(c) {
      if (c.property !== 'open') { return; }
      if (c.value) {
        this.opener = document.activeElement;
        window.setTimeout(() => { const b = this.element.querySelector('.fx-sheet-close'); if (b) { b.focus(); } }, 0);
      } else if (this.opener && document.body.contains(this.opener)) {
        this.opener.focus();
      }
    }
  }
  Composite.register('fx-sheet', {
    view: '<oj-bind-if test="[[$properties.open]]"><div class="fx-sheet-backdrop" on-mousedown="[[onBackdrop]]" on-keydown="[[onKey]]">'
      + '<aside :class="[[css]]" role="dialog" aria-modal="true" :aria-labelledby="[[titleId]]"><header class="fx-sheet-head"><div><h2 class="fx-sheet-title" :id="[[titleId]]"><oj-bind-text value="[[$properties.heading]]"></oj-bind-text></h2>'
      + '<oj-bind-if test="[[$properties.subtitle]]"><p class="fx-card-sub"><oj-bind-text value="[[$properties.subtitle]]"></oj-bind-text></p></oj-bind-if></div>'
      + '<button type="button" class="fx-btn fx-btn--ghost fx-btn--icon fx-btn--sm fx-sheet-close" aria-label="Close" on-click="[[close]]"><span class="factory-nav-icon factory-ico-x" aria-hidden="true"></span></button></header>'
      + '<div class="fx-sheet-body"><oj-bind-slot></oj-bind-slot></div></aside></div></oj-bind-if>',
    viewModel: SheetModel,
    metadata: { properties: { open: { type: 'boolean', writeback: true, value: false }, heading: { type: 'string', value: '' }, subtitle: { type: 'string', value: '' },
      side: { type: 'string', value: 'right' }, wide: { type: 'boolean', value: false } } }
  });

  /* ---------- fx-resizer: drag (or arrow keys) to resize the panel before it; the size is kept in this browser ---------- */
  // Put it between two grid columns; the grid uses var(--fx-pane, <default>) for the first column's width.
  class ResizerModel {
    constructor(c) {
      this.props = c.properties;
      this.element = c.element;
      this.now = ko.observable(0);
      this.key = () => 'factory.pane.' + (this.props.storageKey || 'default');
      this.onDown = (e) => {
        const container = this.container();
        if (!container) { return; }
        e.preventDefault();
        const box = container.getBoundingClientRect();
        const move = (ev) => this.set(ev.clientX - box.left - (this.props.offset || 0));
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('fx-resizing'); this.save(); };
        document.body.classList.add('fx-resizing');
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };
      this.onKey = (e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.set(this.current() - step); this.save(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this.set(this.current() + step); this.save(); }
        else if (e.key === 'Home') { e.preventDefault(); this.set(this.props.min); this.save(); }
        else if (e.key === 'End') { e.preventDefault(); this.set(this.props.max); this.save(); }
        else if (e.key === 'Enter') { e.preventDefault(); this.reset(); }
        return true;
      };
      this.onDouble = () => this.reset();
    }
    container() { return this.element.closest(this.props.container || '[data-fx-panes]'); }
    current() {
      const c = this.container();
      const prev = this.element.previousElementSibling;
      return prev ? prev.getBoundingClientRect().width : (c ? c.getBoundingClientRect().width / 3 : 300);
    }
    set(px) {
      const c = this.container();
      if (!c) { return; }
      const max = Math.min(this.props.max, c.getBoundingClientRect().width - (this.props.nextMin || 240));
      const v = Math.round(Math.max(this.props.min, Math.min(max, px)));
      c.style.setProperty(this.props.variable || '--fx-pane', v + 'px');
      this.now(v);
    }
    save() { try { window.localStorage.setItem(this.key(), String(this.now())); } catch (e) { /* kept for this visit */ } }
    reset() {
      const c = this.container();
      if (c) { c.style.removeProperty(this.props.variable || '--fx-pane'); }
      try { window.localStorage.removeItem(this.key()); } catch (e) { /* nothing kept */ }
      this.now(Math.round(this.current()));
    }
    bindingsApplied() {
      let saved = null;
      try { saved = Number(window.localStorage.getItem(this.key())); } catch (e) { saved = null; }
      if (saved) { this.set(saved); } else { this.now(Math.round(this.current())); }
    }
  }
  Composite.register('fx-resizer', {
    view: '<div class="fx-resizer" role="separator" tabindex="0" aria-orientation="vertical" :aria-label="[[$properties.label || \'Resize the panel\']]"'
      + ' :aria-valuenow="[[now]]" :aria-valuemin="[[$properties.min]]" :aria-valuemax="[[$properties.max]]" title="Drag to resize; double-click to reset"'
      + ' on-pointerdown="[[onDown]]" on-keydown="[[onKey]]" on-dblclick="[[onDouble]]"><span class="fx-resizer-grip" aria-hidden="true"></span></div>',
    viewModel: ResizerModel,
    metadata: { properties: { storageKey: { type: 'string', value: '' }, min: { type: 'number', value: 180 }, max: { type: 'number', value: 640 },
      container: { type: 'string', value: '' }, variable: { type: 'string', value: '' }, offset: { type: 'number', value: 0 }, label: { type: 'string', value: '' },
      nextMin: { type: 'number', value: 240 } } }
  });

  /* ---------- fx-markdown: Markdown text (an answer) rendered safely; [n] links to the element with id cite-prefix + n ---------- */
  class MarkdownModel {
    constructor(c) {
      this.props = c.properties;
      this.element = c.element;
      this.pending = false;
    }
    draw() {
      // While an answer streams in, the text changes many times a second: drawn at most once a frame
      if (this.pending) { return; }
      this.pending = true;
      let done = false;
      const run = () => {
        if (done) { return; }
        done = true;
        this.pending = false;
        const box = this.element.querySelector('.fx-md');
        if (box) { markdown.render(box, this.props.text, { sources: this.props.sources, citePrefix: this.props.citePrefix }); }
      };
      // The next frame, or a short timer when there is none (a page in a background tab gets no frames)
      window.requestAnimationFrame(run);
      setTimeout(run, 150);
    }
    bindingsApplied() { this.draw(); }
    propertyChanged() { this.draw(); }
  }
  Composite.register('fx-markdown', {
    view: '<div class="fx-md"></div>',
    viewModel: MarkdownModel,
    metadata: { properties: { text: { type: 'string', value: '' }, sources: { type: 'number', value: 0 }, citePrefix: { type: 'string', value: 'src-' } } }
  });

  return {};
});
