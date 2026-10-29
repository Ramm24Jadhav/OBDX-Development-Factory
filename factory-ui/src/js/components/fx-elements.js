/*
 * The factory's own form and menu elements (design system), in place of Oracle JET's visual components:
 *   <fx-input>, <fx-textarea>, <fx-select>, <fx-date>, <fx-time>, <fx-switch>, <fx-menu-button>.
 * They are JET composite components only so that pages can bind them like JET elements (value="{{x}}" writes back);
 * the markup and styles are the design system's (fx-field, fx-input, fx-menu ...). See docs/DESIGN-SYSTEM.md.
 */
define(['knockout', 'ojs/ojcomposite', 'ojs/ojknockout'], function (ko, Composite) {
  let seq = 0;
  const nextId = (prefix) => prefix + '-' + (++seq);
  const MONTHS = Array.from({ length: 12 }, (x, i) => new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' }));
  const WEEKDAYS = Array.from({ length: 7 }, (x, i) => new Date(2023, 0, 1 + i).toLocaleString(undefined, { weekday: 'narrow' }));

  // Shared field properties: label (or hide-label to keep it for screen readers only), help text and an error message
  const fieldProps = {
    label: { type: 'string', value: '' },
    hideLabel: { type: 'boolean', value: false },
    help: { type: 'string', value: '' },
    error: { type: 'string', value: '' },
    required: { type: 'boolean', value: false },
    disabled: { type: 'boolean', value: false },
    readonly: { type: 'boolean', value: false },
    placeholder: { type: 'string', value: '' }
  };
  const fieldHead = '<oj-bind-if test="[[$properties.label]]"><label :for="[[id]]" :class="[[$properties.hideLabel ? \'fx-label fx-visually-hidden\' : \'fx-label\']]">'
    + '<oj-bind-text value="[[$properties.label]]"></oj-bind-text><oj-bind-if test="[[$properties.required]]"><span class="fx-req" aria-hidden="true">*</span></oj-bind-if></label></oj-bind-if>';
  const fieldFoot = '<oj-bind-if test="[[$properties.error]]"><span class="fx-error" :id="[[id + \'-msg\']]" role="alert"><span class="factory-nav-icon factory-ico-alert" aria-hidden="true"></span><oj-bind-text value="[[$properties.error]]"></oj-bind-text></span></oj-bind-if>'
    + '<oj-bind-if test="[[!$properties.error && $properties.help]]"><span class="fx-help" :id="[[id + \'-msg\']]"><oj-bind-text value="[[$properties.help]]"></oj-bind-text></span></oj-bind-if>';
  const describedBy = ':aria-describedby="[[$properties.error || $properties.help ? id + \'-msg\' : null]]" :aria-invalid="[[$properties.error ? \'true\' : null]]"';
  const fieldClass = (props) => 'fx-field' + (props.error ? ' is-error' : '');

  // Popups (select lists, calendars, menus) are positioned against the viewport so cards and tables do not clip them
  function place(popup, anchor, align) {
    const r = anchor.getBoundingClientRect();
    // The minimum width first, then measure: setting it after measuring changed the width the position was worked out
    // from, so menus aligned to a button's end opened short of it
    popup.style.minWidth = r.width + 'px';
    const width = popup.offsetWidth;
    let left = align === 'end' ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom;
    popup.style.left = left + 'px';
    if (below < popup.offsetHeight + 12 && r.top > popup.offsetHeight + 12) {
      popup.style.top = (r.top - popup.offsetHeight - 6) + 'px';
    } else {
      popup.style.top = (r.bottom + 6) + 'px';
    }
  }
  // Closes an open popup on an outside click, scrolling the page or resizing
  function watchOutside(root, isOpen, close) {
    const onDown = (e) => { if (isOpen() && !root.contains(e.target)) { close(); } };
    const onScroll = (e) => { if (isOpen() && !(e.target && e.target.nodeType === 1 && root.contains(e.target))) { close(); } };
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }

  /* ---------- fx-input: text, password, email, search, number, url ---------- */
  class InputModel {
    constructor(context) {
      this.props = context.properties;
      this.element = context.element;
      this.id = context.properties.inputId || nextId('fx-input');
      this.shown = ko.observable(false);
      this.kind = ko.pureComputed(() => (this.props.type === 'password' && this.shown() ? 'text' : this.props.type || 'text'));
      this.iconCss = ko.pureComputed(() => 'factory-nav-icon fx-control-icon factory-ico-' + this.props.icon);
      this.css = ko.pureComputed(() => fieldClass(this.props));
      this.controlCss = ko.pureComputed(() => 'fx-control' + (this.props.icon ? ' fx-control--icon' : '') + (this.props.type === 'password' || this.props.clearable ? ' fx-control--end' : ''));
      this.onInput = (event) => {
        const v = event.target.value;
        this.props.value = this.props.type === 'number' ? (v === '' ? null : Number(v)) : v;
      };
      this.onKey = (event) => {
        if (event.key === 'Enter') {
          this.element.dispatchEvent(new CustomEvent('fxEnter', { bubbles: true, detail: { value: this.props.value } }));
        }
        return true;
      };
      this.toggleShown = () => this.shown(!this.shown());
      this.clear = () => {
        const box = this.element.querySelector('input.fx-input');
        this.props.value = '';
        if (box) { box.value = ''; box.focus(); }
      };
      this.shownLabel = ko.pureComputed(() => (this.shown() ? 'Hide the password' : 'Show the password'));
      this.eyeCss = ko.pureComputed(() => 'factory-nav-icon ' + (this.shown() ? 'factory-ico-x' : 'factory-ico-eye'));
    }
    focus() { const i = this.element.querySelector('input'); if (i) { i.focus(); } }
    // A value set by the page after the person typed must reach the box itself (the attribute binding does not)
    propertyChanged(context) {
      if (context.property === 'value' && context.updatedFrom !== 'internal') {
        const i = this.element.querySelector('input.fx-input');
        const v = context.value === null || context.value === undefined ? '' : String(context.value);
        if (i && i.value !== v) { i.value = v; }
      }
    }
  }
  Composite.register('fx-input', {
    view: '<div :class="[[css]]">' + fieldHead
      + '<div :class="[[controlCss]]"><oj-bind-if test="[[$properties.icon]]"><span :class="[[iconCss]]" aria-hidden="true"></span></oj-bind-if>'
      + '<input class="fx-input" :id="[[id]]" :type="[[kind]]" :value="[[$properties.value === null || $properties.value === undefined ? \'\' : $properties.value]]" on-input="[[onInput]]" on-keydown="[[onKey]]"'
      + ' :placeholder="[[$properties.placeholder]]" :disabled="[[$properties.disabled]]" :readonly="[[$properties.readonly]]" :required="[[$properties.required]]"'
      + ' :maxlength="[[$properties.maxlength || null]]" :min="[[$properties.min]]" :max="[[$properties.max]]" :step="[[$properties.step]]"'
      + ' :autocomplete="[[$properties.autocomplete || \'off\']]" :name="[[$properties.name]]" :aria-label="[[$properties.label ? null : $properties.placeholder]]" ' + describedBy + '>'
      + '<span class="fx-control-end">'
      + '<oj-bind-if test="[[$properties.clearable && $properties.value]]"><button type="button" class="fx-btn fx-btn--ghost fx-btn--icon fx-btn--sm" aria-label="Clear" on-click="[[clear]]"><span class="factory-nav-icon factory-ico-x" aria-hidden="true"></span></button></oj-bind-if>'
      + '<oj-bind-if test="[[$properties.type === \'password\']]"><button type="button" class="fx-btn fx-btn--ghost fx-btn--icon fx-btn--sm" :aria-label="[[shownLabel]]" :aria-pressed="[[shown() ? \'true\' : \'false\']]" on-click="[[toggleShown]]"><span :class="[[eyeCss]]" aria-hidden="true"></span></button></oj-bind-if>'
      + '</span></div>' + fieldFoot + '</div>',
    viewModel: InputModel,
    metadata: {
      properties: Object.assign({}, fieldProps, {
        value: { type: 'any', writeback: true, value: '' },
        type: { type: 'string', value: 'text' },
        icon: { type: 'string', value: '' },
        clearable: { type: 'boolean', value: false },
        maxlength: { type: 'number' },
        min: { type: 'string' }, max: { type: 'string' }, step: { type: 'string' },
        autocomplete: { type: 'string', value: '' },
        name: { type: 'string', value: '' },
        inputId: { type: 'string', value: '' }
      }),
      methods: { focus: {} },
      events: { fxEnter: {} }
    }
  });

  /* ---------- fx-textarea ---------- */
  class TextareaModel {
    constructor(context) {
      this.props = context.properties;
      this.id = context.properties.inputId || nextId('fx-textarea');
      this.css = ko.pureComputed(() => fieldClass(this.props));
      this.areaCss = ko.pureComputed(() => 'fx-textarea' + (this.props.mono ? ' fx-code' : ''));
      this.onInput = (event) => { this.props.value = event.target.value; };
      this.count = ko.pureComputed(() => String((this.props.value || '').length) + (this.props.maxlength ? ' / ' + this.props.maxlength : ''));
      this.element = context.element;
    }
    // A text area takes its value as content, not as an attribute: fill it once it is rendered
    bindingsApplied() { this.fill(this.props.value); }
    fill(value) {
      const area = this.element.querySelector('textarea');
      const v = value || '';
      if (area && area.value !== v) { area.value = v; }
    }
    propertyChanged(context) {
      if (context.property === 'value' && context.updatedFrom !== 'internal') {
        const a = this.element.querySelector('textarea');
        const v = context.value || '';
        if (a && a.value !== v) { a.value = v; }
      }
    }
  }
  Composite.register('fx-textarea', {
    view: '<div :class="[[css]]"><div class="fx-row fx-field-head">' + fieldHead
      + '<oj-bind-if test="[[$properties.counter]]"><span class="fx-counter" aria-live="polite"><oj-bind-text value="[[count]]"></oj-bind-text></span></oj-bind-if></div>'
      + '<textarea :class="[[areaCss]]" :id="[[id]]" :rows="[[$properties.rows]]" :value="[[$properties.value || \'\']]" on-input="[[onInput]]" :placeholder="[[$properties.placeholder]]"'
      + ' :disabled="[[$properties.disabled]]" :readonly="[[$properties.readonly]]" :required="[[$properties.required]]" :maxlength="[[$properties.maxlength || null]]"'
      + ' :aria-label="[[$properties.label ? null : $properties.placeholder]]" spellcheck="true" ' + describedBy + '></textarea>' + fieldFoot + '</div>',
    viewModel: TextareaModel,
    metadata: {
      properties: Object.assign({}, fieldProps, {
        value: { type: 'string', writeback: true, value: '' },
        rows: { type: 'number', value: 4 },
        maxlength: { type: 'number' },
        counter: { type: 'boolean', value: false },
        mono: { type: 'boolean', value: false },
        inputId: { type: 'string', value: '' }
      })
    }
  });

  /* ---------- fx-select: one value from a list; optional search ---------- */
  // options: [{value, label, disabled?, description?}] or plain strings; or data: an ArrayDataProvider (JET), read once
  function normalise(list) {
    return (list || []).map((o) => (o !== null && typeof o === 'object' ? { value: o.value, label: o.label !== undefined ? String(o.label) : String(o.value), disabled: !!o.disabled, description: o.description || '' }
      : { value: o, label: String(o), disabled: false, description: '' }));
  }
  class SelectModel {
    constructor(context) {
      this.props = context.properties;
      this.element = context.element;
      this.id = nextId('fx-select');
      this.open = ko.observable(false);
      this.query = ko.observable('');
      this.active = ko.observable(-1);
      this.fromData = ko.observableArray([]);
      this.list = ko.pureComputed(() => (this.props.options && this.props.options.length ? normalise(this.props.options) : this.fromData()));
      this.filtered = ko.pureComputed(() => {
        const q = this.query().toLowerCase();
        return this.list().filter((o) => !q || o.label.toLowerCase().indexOf(q) >= 0);
      });
      this.rows = ko.pureComputed(() => this.filtered().map((o, i) => ({
        option: o, id: this.id + '-o' + i, label: o.label, description: o.description, disabled: o.disabled,
        selected: o.value === this.props.value,
        css: 'fx-option' + (o.value === this.props.value ? ' is-selected' : '') + (i === this.active() ? ' is-active' : '') + (o.disabled ? ' is-disabled' : ''),
        pick: () => this.pick(o)
      })));
      this.current = ko.pureComputed(() => this.list().find((o) => o.value === this.props.value));
      this.shownText = ko.pureComputed(() => (this.current() ? this.current().label : this.props.placeholder || 'Select…'));
      this.buttonCss = ko.pureComputed(() => 'fx-select fx-select-button' + (this.current() ? '' : ' is-placeholder') + (this.open() ? ' is-open' : '') + (this.props.readonly ? ' is-readonly' : ''));
      this.css = ko.pureComputed(() => fieldClass(this.props));
      this.activeId = ko.pureComputed(() => (this.open() && this.active() >= 0 && this.rows()[this.active()] ? this.rows()[this.active()].id : null));
      this.toggle = () => (this.open() ? this.close() : this.show());
      this.onKey = (event) => {
        const rows = this.rows();
        const move = (d) => {
          if (!this.open()) { this.show(); return; }
          let i = this.active();
          for (let n = 0; n < rows.length; n++) { i = (i + d + rows.length) % rows.length; if (!rows[i].disabled) { break; } }
          this.active(i);
          this.scrollActive();
        };
        if (event.key === 'ArrowDown') { event.preventDefault(); move(1); } else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
        else if (event.key === 'Enter' || (event.key === ' ' && !this.props.searchable)) {
          event.preventDefault();
          if (this.open() && rows[this.active()]) { this.pick(rows[this.active()].option); } else { this.show(); }
        } else if (event.key === 'Escape' && this.open()) { event.preventDefault(); this.close(true); }
        else if (event.key === 'Tab') { this.close(); }
        else if (!this.props.searchable && event.key.length === 1) {
          // Type-ahead: jump to the next option starting with the key
          const k = event.key.toLowerCase();
          const start = this.active() + 1;
          const order = rows.slice(start).concat(rows.slice(0, start));
          const hit = order.find((r) => r.label.toLowerCase().startsWith(k));
          if (hit) { this.active(rows.indexOf(hit)); if (!this.open()) { this.pick(hit.option, true); } else { this.scrollActive(); } }
        }
        return true;
      };
      this.onQuery = (event) => { this.query(event.target.value); this.active(this.rows().findIndex((r) => !r.disabled)); };
      this.loadData = () => {
        const data = this.props.data;
        if (!data || typeof data.fetchFirst !== 'function') { return; }
        const it = data.fetchFirst({ size: -1 })[Symbol.asyncIterator]();
        const all = [];
        const step = () => it.next().then((r) => {
          (r.value && r.value.data ? r.value.data : []).forEach((d) => all.push({ value: d.value, label: d.label !== undefined ? d.label : d.value }));
          if (!r.done) { return step(); }
          this.fromData(normalise(all));
          return null;
        });
        step().catch(() => null);
      };
    }
    connected() {
      this.loadData();
      const data = this.props.data;
      if (data && typeof data.addEventListener === 'function') { this.dataListener = () => this.loadData(); data.addEventListener('mutate', this.dataListener); data.addEventListener('refresh', this.dataListener); }
      this.unwatch = watchOutside(this.element, this.open, () => this.close());
    }
    disconnected() {
      if (this.unwatch) { this.unwatch(); }
      const data = this.props.data;
      if (this.dataListener && data && typeof data.removeEventListener === 'function') { data.removeEventListener('mutate', this.dataListener); data.removeEventListener('refresh', this.dataListener); }
    }
    propertyChanged(context) {
      if (context.property === 'data') { this.loadData(); }
    }
    show() {
      if (this.props.disabled || this.props.readonly) { return; }
      this.query('');
      this.open(true);
      const sel = this.rows().findIndex((r) => r.selected);
      this.active(sel >= 0 ? sel : this.rows().findIndex((r) => !r.disabled));
      window.setTimeout(() => {
        const pop = this.element.querySelector('.fx-popup');
        if (pop) { place(pop, this.element.querySelector('.fx-select-button'), 'start'); }
        const search = this.element.querySelector('.fx-popup-search input');
        if (search) { search.focus(); }
        this.scrollActive();
      }, 0);
    }
    close(refocus) {
      this.open(false);
      if (refocus) { const b = this.element.querySelector('.fx-select-button'); if (b) { b.focus(); } }
    }
    pick(option, keepClosed) {
      if (option.disabled) { return; }
      this.props.value = option.value;
      if (!keepClosed) { this.close(true); }
    }
    scrollActive() {
      window.setTimeout(() => { const a = this.element.querySelector('.fx-option.is-active'); if (a && a.scrollIntoView) { a.scrollIntoView({ block: 'nearest' }); } }, 0);
    }
  }
  Composite.register('fx-select', {
    view: '<div :class="[[css]]">' + fieldHead
      + '<button type="button" :id="[[id]]" :class="[[buttonCss]]" role="combobox" aria-haspopup="listbox" :aria-expanded="[[open() ? \'true\' : \'false\']]" :aria-controls="[[id + \'-list\']]"'
      + ' :aria-activedescendant="[[activeId]]" :disabled="[[$properties.disabled]]" :aria-label="[[$properties.label ? null : ($properties.placeholder || \'Select\')]]" on-click="[[toggle]]" on-keydown="[[onKey]]" ' + describedBy + '>'
      + '<span class="fx-select-text"><oj-bind-text value="[[shownText]]"></oj-bind-text></span></button>'
      + '<oj-bind-if test="[[open()]]"><div class="fx-popup" role="presentation">'
      + '<oj-bind-if test="[[$properties.searchable]]"><div class="fx-popup-search fx-control"><span class="factory-nav-icon factory-ico-search fx-control-icon" aria-hidden="true"></span>'
      + '<input class="fx-input" type="search" placeholder="Search…" aria-label="Search the options" :aria-controls="[[id + \'-list\']]" :aria-activedescendant="[[activeId]]" on-input="[[onQuery]]" on-keydown="[[onKey]]"></div></oj-bind-if>'
      + '<ul class="fx-listbox" role="listbox" :id="[[id + \'-list\']]" :aria-labelledby="[[id]]">'
      + '<oj-bind-for-each data="[[rows]]" as="r"><template><li role="option" :id="[[r.data.id]]" :class="[[r.data.css]]" :aria-selected="[[r.data.selected ? \'true\' : \'false\']]" :aria-disabled="[[r.data.disabled ? \'true\' : null]]" on-click="[[r.data.pick]]">'
      + '<span class="fx-option-text"><oj-bind-text value="[[r.data.label]]"></oj-bind-text><oj-bind-if test="[[r.data.description]]"><span class="fx-option-desc"><oj-bind-text value="[[r.data.description]]"></oj-bind-text></span></oj-bind-if></span>'
      + '<oj-bind-if test="[[r.data.selected]]"><span class="factory-nav-icon factory-ico-check" aria-hidden="true"></span></oj-bind-if></li></template></oj-bind-for-each>'
      + '<oj-bind-if test="[[rows().length === 0]]"><li class="fx-option is-empty" role="presentation">No matches</li></oj-bind-if></ul></div></oj-bind-if>'
      + fieldFoot + '</div>',
    viewModel: SelectModel,
    metadata: {
      properties: Object.assign({}, fieldProps, {
        value: { type: 'any', writeback: true },
        options: { type: 'array', value: [] },
        data: { type: 'object' },
        searchable: { type: 'boolean', value: false }
      })
    }
  });

  /* ---------- fx-date: ISO date (yyyy-mm-dd) with a calendar ---------- */
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parseIso = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  class DateModel {
    constructor(context) {
      this.props = context.properties;
      this.element = context.element;
      this.id = nextId('fx-date');
      this.open = ko.observable(false);
      const start = parseIso(this.props.value) || new Date();
      this.month = ko.observable(new Date(start.getFullYear(), start.getMonth(), 1));
      this.focusDay = ko.observable(iso(start));
      this.typed = ko.observable(null);
      this.badInput = ko.observable(false);
      this.shown = ko.pureComputed(() => {
        if (this.typed() !== null) { return this.typed(); }
        const d = parseIso(this.props.value);
        return d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      });
      this.css = ko.pureComputed(() => fieldClass({ error: this.props.error || this.badInput() }));
      this.errorText = ko.pureComputed(() => this.props.error || (this.badInput() ? 'Enter a date like 2026-10-31.' : ''));
      this.title = ko.pureComputed(() => MONTHS[this.month().getMonth()] + ' ' + this.month().getFullYear());
      this.weekdays = WEEKDAYS;
      this.days = ko.pureComputed(() => {
        const m = this.month();
        const first = new Date(m.getFullYear(), m.getMonth(), 1);
        const offset = first.getDay();
        const min = parseIso(this.props.min);
        const max = parseIso(this.props.max);
        const today = iso(new Date());
        return Array.from({ length: 42 }, (x, i) => {
          const d = new Date(m.getFullYear(), m.getMonth(), 1 - offset + i);
          const key = iso(d);
          const off = (min && d < min) || (max && d > max);
          return {
            key: key, n: d.getDate(), off: !!off,
            label: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
            css: 'fx-day' + (d.getMonth() !== m.getMonth() ? ' is-outside' : '') + (key === this.props.value ? ' is-selected' : '') + (key === today ? ' is-today' : '')
              + (key === this.focusDay() ? ' is-active' : '') + (off ? ' is-disabled' : ''),
            tab: key === this.focusDay() ? '0' : '-1',
            pick: () => { if (!off) { this.choose(key); } }
          };
        });
      });
      this.weeks = ko.pureComputed(() => [0, 1, 2, 3, 4, 5].map((w) => ({ days: this.days().slice(w * 7, w * 7 + 7) })));
      this.toggle = () => (this.open() ? this.close() : this.show());
      this.prev = () => this.shiftMonth(-1);
      this.next = () => this.shiftMonth(1);
      this.today = () => this.choose(iso(new Date()));
      this.clear = () => { this.props.value = ''; this.typed(null); this.close(true); };
      this.onType = (event) => { this.typed(event.target.value); this.badInput(false); };
      this.onBlur = () => this.commitTyped();
      this.onFieldKey = (event) => {
        if (event.key === 'Enter') { this.commitTyped(); } else if (event.key === 'ArrowDown' && event.altKey) { this.show(); } else if (event.key === 'Escape') { this.close(); }
        return true;
      };
      this.onGridKey = (event) => {
        const d = parseIso(this.focusDay()) || new Date();
        const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (moves[event.key] !== undefined) {
          event.preventDefault();
          d.setDate(d.getDate() + moves[event.key]);
          this.focusDay(iso(d));
          if (d.getMonth() !== this.month().getMonth()) { this.month(new Date(d.getFullYear(), d.getMonth(), 1)); }
          window.setTimeout(() => { const a = this.element.querySelector('.fx-day.is-active'); if (a) { a.focus(); } }, 0);
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const day = this.days().find((x) => x.key === this.focusDay());
          if (day && !day.off) { this.choose(day.key); }
        } else if (event.key === 'Escape') { event.preventDefault(); this.close(true); }
        return true;
      };
    }
    connected() { this.unwatch = watchOutside(this.element, this.open, () => this.close()); }
    disconnected() { if (this.unwatch) { this.unwatch(); } }
    commitTyped() {
      const t = this.typed();
      if (t === null) { return; }
      if (t.trim() === '') { this.props.value = ''; this.typed(null); return; }
      let d = parseIso(t.trim());
      if (!d) { const p = Date.parse(t); d = isNaN(p) ? null : new Date(p); }
      if (!d) { this.badInput(true); return; }
      this.typed(null);
      this.choose(iso(d), true);
    }
    shiftMonth(n) {
      const m = this.month();
      this.month(new Date(m.getFullYear(), m.getMonth() + n, 1));
      const d = parseIso(this.focusDay()) || m;
      this.focusDay(iso(new Date(this.month().getFullYear(), this.month().getMonth(), Math.min(d.getDate(), 28))));
    }
    show() {
      if (this.props.disabled || this.props.readonly) { return; }
      const d = parseIso(this.props.value) || new Date();
      this.month(new Date(d.getFullYear(), d.getMonth(), 1));
      this.focusDay(iso(d));
      this.open(true);
      window.setTimeout(() => {
        const pop = this.element.querySelector('.fx-popup');
        if (pop) { place(pop, this.element.querySelector('.fx-control'), 'start'); }
        const a = this.element.querySelector('.fx-day.is-active');
        if (a) { a.focus(); }
      }, 0);
    }
    close(refocus) {
      this.open(false);
      if (refocus) { const i = this.element.querySelector('input'); if (i) { i.focus(); } }
    }
    choose(key, keepFocus) {
      const min = parseIso(this.props.min);
      const max = parseIso(this.props.max);
      const d = parseIso(key);
      if ((min && d < min) || (max && d > max)) { this.badInput(true); return; }
      this.badInput(false);
      this.props.value = key;
      this.close(!keepFocus);
    }
  }
  Composite.register('fx-date', {
    view: '<div :class="[[css]]">' + fieldHead
      + '<div class="fx-control fx-control--end"><input class="fx-input" :id="[[id]]" :value="[[shown]]" on-input="[[onType]]" on-blur="[[onBlur]]" on-keydown="[[onFieldKey]]"'
      + ' :placeholder="[[$properties.placeholder || \'yyyy-mm-dd\']]" :disabled="[[$properties.disabled]]" :readonly="[[$properties.readonly]]" :required="[[$properties.required]]" autocomplete="off"'
      + ' :aria-label="[[$properties.label ? null : \'Date\']]" :aria-invalid="[[errorText() ? \'true\' : null]]">'
      + '<span class="fx-control-end"><button type="button" class="fx-btn fx-btn--ghost fx-btn--icon fx-btn--sm" aria-label="Choose a date" :aria-expanded="[[open() ? \'true\' : \'false\']]" :disabled="[[$properties.disabled || $properties.readonly]]" on-click="[[toggle]]">'
      + '<span class="factory-nav-icon factory-ico-calendar" aria-hidden="true"></span></button></span></div>'
      + '<oj-bind-if test="[[open()]]"><div class="fx-popup fx-calendar" role="dialog" aria-modal="false" :aria-label="[[\'Choose a date, \' + title()]]">'
      + '<div class="fx-calendar-head"><button type="button" class="fx-btn fx-btn--ghost fx-btn--icon fx-btn--sm" aria-label="Previous month" on-click="[[prev]]"><span class="fx-chev fx-chev--left" aria-hidden="true"></span></button>'
      + '<strong aria-live="polite"><oj-bind-text value="[[title]]"></oj-bind-text></strong>'
      + '<button type="button" class="fx-btn fx-btn--ghost fx-btn--icon fx-btn--sm" aria-label="Next month" on-click="[[next]]"><span class="fx-chev" aria-hidden="true"></span></button></div>'
      + '<table class="fx-calendar-grid" role="grid" on-keydown="[[onGridKey]]"><thead><tr><oj-bind-for-each data="[[weekdays]]" as="w"><template><th scope="col"><oj-bind-text value="[[w.data]]"></oj-bind-text></th></template></oj-bind-for-each></tr></thead>'
      + '<tbody><oj-bind-for-each data="[[weeks]]" as="wk"><template><tr><oj-bind-for-each data="[[wk.data.days]]" as="d"><template><td role="gridcell">'
      + '<button type="button" :class="[[d.data.css]]" :tabindex="[[d.data.tab]]" :aria-label="[[d.data.label]]" :aria-pressed="[[d.data.key === $properties.value ? \'true\' : \'false\']]" :disabled="[[d.data.off]]" on-click="[[d.data.pick]]">'
      + '<oj-bind-text value="[[d.data.n]]"></oj-bind-text></button></td></template></oj-bind-for-each></tr></template></oj-bind-for-each></tbody></table>'
      + '<div class="fx-calendar-foot"><button type="button" class="fx-btn fx-btn--link fx-btn--sm" on-click="[[clear]]">Clear</button><button type="button" class="fx-btn fx-btn--secondary fx-btn--sm" on-click="[[today]]">Today</button></div>'
      + '</div></oj-bind-if>'
      + '<oj-bind-if test="[[errorText()]]"><span class="fx-error" role="alert"><span class="factory-nav-icon factory-ico-alert" aria-hidden="true"></span><oj-bind-text value="[[errorText]]"></oj-bind-text></span></oj-bind-if>'
      + '<oj-bind-if test="[[!errorText() && $properties.help]]"><span class="fx-help"><oj-bind-text value="[[$properties.help]]"></oj-bind-text></span></oj-bind-if></div>',
    viewModel: DateModel,
    metadata: {
      properties: Object.assign({}, fieldProps, {
        value: { type: 'string', writeback: true, value: '' },
        min: { type: 'string', value: '' },
        max: { type: 'string', value: '' }
      })
    }
  });

  /* ---------- fx-time: HH:MM (also accepts JET's "Thh:mm:ss" and writes it back the same way) ---------- */
  class TimeModel {
    constructor(context) {
      this.props = context.properties;
      this.id = nextId('fx-time');
      this.css = ko.pureComputed(() => fieldClass(this.props));
      this.shown = ko.pureComputed(() => { const m = /(\d{2}):(\d{2})/.exec(this.props.value || ''); return m ? m[1] + ':' + m[2] : ''; });
      this.onInput = (event) => {
        const v = event.target.value;
        this.props.value = !v ? '' : String(this.props.value || '').charAt(0) === 'T' ? 'T' + v + ':00' : v;
      };
    }
  }
  Composite.register('fx-time', {
    view: '<div :class="[[css]]">' + fieldHead
      + '<div class="fx-control">'
      + '<input class="fx-input" type="time" :id="[[id]]" :value="[[shown]]" on-input="[[onInput]]" :disabled="[[$properties.disabled]]" :readonly="[[$properties.readonly]]" :required="[[$properties.required]]"'
      + ' :aria-label="[[$properties.label ? null : \'Time\']]" ' + describedBy + '></div>' + fieldFoot + '</div>',
    viewModel: TimeModel,
    metadata: { properties: Object.assign({}, fieldProps, { value: { type: 'string', writeback: true, value: '' } }) }
  });

  /* ---------- fx-switch: on / off ---------- */
  class SwitchModel {
    constructor(context) {
      this.props = context.properties;
      this.id = nextId('fx-switch');
      this.checkedText = ko.pureComputed(() => (this.props.value ? 'true' : 'false'));
      this.flip = () => { if (!this.props.disabled && !this.props.readonly) { this.props.value = !this.props.value; } };
    }
  }
  Composite.register('fx-switch', {
    view: '<span class="fx-switch-wrap"><button type="button" class="fx-switch" role="switch" :id="[[id]]" :aria-checked="[[checkedText]]" :disabled="[[$properties.disabled]]"'
      + ' :aria-readonly="[[$properties.readonly ? \'true\' : null]]" :aria-label="[[$properties.label ? null : $properties.ariaLabel]]" :aria-labelledby="[[$properties.label ? id + \'-l\' : null]]" on-click="[[flip]]"></button>'
      + '<oj-bind-if test="[[$properties.label]]"><span class="fx-switch-label" :id="[[id + \'-l\']]"><oj-bind-text value="[[$properties.label]]"></oj-bind-text></span></oj-bind-if></span>',
    viewModel: SwitchModel,
    metadata: {
      properties: {
        value: { type: 'boolean', writeback: true, value: false },
        label: { type: 'string', value: '' },
        ariaLabel: { type: 'string', value: '' },
        disabled: { type: 'boolean', value: false },
        readonly: { type: 'boolean', value: false }
      }
    }
  });

  /* ---------- fx-menu-button: a button with a menu of actions ---------- */
  // items: [{value, label, icon?, disabled?, danger?, separator?, title?, id?}]; fires fxAction with detail {value}; button-id names the toggle
  class MenuButtonModel {
    constructor(context) {
      this.props = context.properties;
      this.element = context.element;
      this.id = context.properties.buttonId || nextId('fx-menu');
      this.open = ko.observable(false);
      this.buttonCss = ko.pureComputed(() => 'fx-btn fx-btn--' + (this.props.variant || 'secondary') + (this.props.size === 'sm' ? ' fx-btn--sm' : '')
        + (this.props.iconOnly ? ' fx-btn--icon' : '') + ' fx-menu-toggle');
      this.iconCss = ko.pureComputed(() => 'factory-nav-icon factory-ico-' + this.props.icon);
      this.rows = ko.pureComputed(() => (this.props.items || []).map((it) => ({
        separator: !!it.separator, label: it.label, value: it.value, disabled: !!it.disabled, title: it.title || null, itemId: it.id || null,
        css: it.danger ? 'fx-menu-danger' : '',
        iconCss: it.icon ? 'factory-nav-icon factory-ico-' + it.icon : '',
        run: () => this.choose(it)
      })));
      this.toggle = () => (this.open() ? this.close(true) : this.show());
      this.onKey = (event) => {
        const items = Array.from(this.element.querySelectorAll('.fx-menu [role="menuitem"]:not([disabled])'));
        const at = items.indexOf(document.activeElement);
        if (event.key === 'ArrowDown') { event.preventDefault(); if (!this.open()) { this.show(); } else if (items.length) { items[(at + 1) % items.length].focus(); } }
        else if (event.key === 'ArrowUp') { event.preventDefault(); if (items.length) { items[(at - 1 + items.length) % items.length].focus(); } }
        else if (event.key === 'Home' && items.length) { event.preventDefault(); items[0].focus(); }
        else if (event.key === 'End' && items.length) { event.preventDefault(); items[items.length - 1].focus(); }
        else if (event.key === 'Escape' && this.open()) { event.preventDefault(); this.close(true); }
        else if (event.key === 'Tab') { this.close(); }
        return true;
      };
    }
    connected() { this.unwatch = watchOutside(this.element, this.open, () => this.close()); }
    disconnected() { if (this.unwatch) { this.unwatch(); } }
    show() {
      if (this.props.disabled) { return; }
      this.open(true);
      window.setTimeout(() => {
        const pop = this.element.querySelector('.fx-menu');
        if (pop) { place(pop, this.element.querySelector('.fx-menu-toggle'), this.props.align || 'end'); }
        const first = this.element.querySelector('.fx-menu [role="menuitem"]:not([disabled])');
        if (first) { first.focus({ preventScroll: true }); }
      }, 0);
    }
    close(refocus) {
      this.open(false);
      if (refocus) { const b = this.element.querySelector('.fx-menu-toggle'); if (b) { b.focus(); } }
    }
    choose(item) {
      if (item.disabled) { return; }
      this.close(true);
      this.element.dispatchEvent(new CustomEvent('fxAction', { bubbles: true, detail: { value: item.value } }));
    }
  }
  Composite.register('fx-menu-button', {
    view: '<span class="fx-menu-wrap"><button type="button" :id="[[id]]" :class="[[buttonCss]]" aria-haspopup="menu" :aria-expanded="[[open() ? \'true\' : \'false\']]" :aria-controls="[[id + \'-menu\']]"'
      + ' :aria-label="[[$properties.iconOnly ? $properties.label : null]]" :title="[[$properties.iconOnly ? $properties.label : null]]" :disabled="[[$properties.disabled]]" on-click="[[toggle]]" on-keydown="[[onKey]]">'
      + '<oj-bind-if test="[[$properties.icon]]"><span :class="[[iconCss]]" aria-hidden="true"></span></oj-bind-if>'
      + '<oj-bind-if test="[[!$properties.iconOnly]]"><span><oj-bind-text value="[[$properties.label]]"></oj-bind-text></span><span class="fx-caret" aria-hidden="true"></span></oj-bind-if></button>'
      + '<oj-bind-if test="[[open()]]"><div class="fx-menu fx-menu--fixed" role="menu" :id="[[id + \'-menu\']]" :aria-labelledby="[[id]]" on-keydown="[[onKey]]">'
      + '<oj-bind-for-each data="[[rows]]" as="m"><template>'
      + '<oj-bind-if test="[[m.data.separator]]"><div class="fx-menu-sep" role="separator"></div></oj-bind-if>'
      + '<oj-bind-if test="[[!m.data.separator]]"><button type="button" role="menuitem" tabindex="-1" :id="[[m.data.itemId]]" :class="[[m.data.css]]" :disabled="[[m.data.disabled]]" :title="[[m.data.title]]" on-click="[[m.data.run]]">'
      + '<oj-bind-if test="[[m.data.iconCss]]"><span :class="[[m.data.iconCss]]" aria-hidden="true"></span></oj-bind-if><oj-bind-text value="[[m.data.label]]"></oj-bind-text></button></oj-bind-if>'
      + '</template></oj-bind-for-each></div></oj-bind-if></span>',
    viewModel: MenuButtonModel,
    metadata: {
      properties: {
        label: { type: 'string', value: '' },
        icon: { type: 'string', value: '' },
        iconOnly: { type: 'boolean', value: false },
        items: { type: 'array', value: [] },
        variant: { type: 'string', value: 'secondary' },
        size: { type: 'string', value: '' },
        align: { type: 'string', value: 'end' },
        disabled: { type: 'boolean', value: false },
        buttonId: { type: 'string', value: '' }
      },
      events: { fxAction: {} }
    }
  });

  return { place: place };
});
