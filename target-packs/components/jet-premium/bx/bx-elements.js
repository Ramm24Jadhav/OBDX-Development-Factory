/*
 * Premium JET elements beyond the fields: <bx-button> and <bx-icon-button> (oj-button), <bx-dialog> (oj-dialog),
 * <bx-toast> (oj-messages), <bx-card>, <bx-tabs> (oj-tab-bar) and <bx-data-grid> (oj-table). The JET names stay:
 * on-oj-action, chroming, disabled; dialog-title, cancel-behavior, open(), close(), on-oj-open and on-oj-close; messages;
 * selection and on-selection-changed; data, columns and selection-mode.
 */
define(['ojs/ojcomposite', './bx-core'], function (Composite, bx) {
  'use strict';
  var ko = bx.ko;

  /* ---------- bx-button: chroming callToAction (primary), solid, outlined, borderless (ghost) or danger ---------- */
  function ButtonModel(context) {
    var self = this;
    self.props = context.properties;
    self.element = context.element;
    self.css = ko.pureComputed(function () {
      var c = self.props.chroming || 'callToAction';
      return 'bx-btn bx-btn--' + c + (self.props.display === 'icons' ? ' bx-btn--icon' : '') + (self.props.size ? ' bx-btn--' + self.props.size : '');
    });
    self.press = function (vm, event) {
      if (self.props.disabled) { return; }
      // A ripple where it was pressed (the motion class decides whether it shows)
      var b = event && event.currentTarget;
      if (b && event.clientX !== undefined) {
        var r = b.getBoundingClientRect();
        b.style.setProperty('--bx-x', (event.clientX - r.left) + 'px');
        b.style.setProperty('--bx-y', (event.clientY - r.top) + 'px');
      }
      bx.fire(self.element, 'ojAction', {});
    };
  }
  var buttonMeta = { properties: { label: { type: 'string', value: '' }, chroming: { type: 'string', value: 'callToAction' }, display: { type: 'string', value: 'all' },
    disabled: { type: 'boolean', value: false }, size: { type: 'string', value: '' } }, events: { ojAction: { bubbles: true } } };
  Composite.register('bx-button', {
    view: '<button type="button" :class="[[css]]" :disabled="[[$properties.disabled]]" :aria-label="[[$properties.display === \'icons\' ? $properties.label : null]]" on-click="[[press]]">'
      + '<oj-bind-slot name="startIcon"></oj-bind-slot><span class="bx-btn-label"><oj-bind-slot><oj-bind-text value="[[$properties.label]]"></oj-bind-text></oj-bind-slot></span>'
      + '<oj-bind-slot name="endIcon"></oj-bind-slot></button>',
    viewModel: ButtonModel, metadata: buttonMeta
  });
  Composite.register('bx-icon-button', {
    view: '<button type="button" :class="[[css() + \' bx-btn--icon\']]" :disabled="[[$properties.disabled]]" :aria-label="[[$properties.label]]" :title="[[$properties.label]]" on-click="[[press]]">'
      + '<oj-bind-slot><span :class="[[\'bx-icon bx-icon--\' + ($properties.icon || \'more\')]]" aria-hidden="true"></span></oj-bind-slot></button>',
    viewModel: ButtonModel,
    metadata: { properties: { label: { type: 'string', value: '' }, icon: { type: 'string', value: 'more' }, chroming: { type: 'string', value: 'borderless' },
      disabled: { type: 'boolean', value: false }, size: { type: 'string', value: '' } }, events: { ojAction: { bubbles: true } } }
  });

  /* ---------- bx-dialog: modal, focus kept inside and given back, Escape closes unless cancel-behavior is none ---------- */
  function DialogModel(context) {
    var self = this;
    self.props = context.properties;
    self.element = context.element;
    self.id = bx.nextId('bx-dialog');
    self.shown = ko.observable(false);
    var opener = null;
    var focusables = function () {
      var box = self.element.querySelector('.bx-dialog');
      return box ? Array.prototype.slice.call(box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(function (x) { return !x.disabled; }) : [];
    };
    self.open = function () {
      if (self.shown()) { return; }
      opener = document.activeElement;
      self.shown(true);
      bx.fire(self.element, 'ojOpen', {});
      window.setTimeout(function () {
        var first = self.element.querySelector(self.props.initialFocus === 'firstFocusable' ? '.bx-dialog-body button, .bx-dialog-body input, .bx-dialog-body select, .bx-dialog-footer button' : '.bx-dialog');
        if (first) { first.focus(); }
      }, 0);
    };
    self.close = function () {
      if (!self.shown()) { return; }
      var before = new CustomEvent('ojBeforeClose', { bubbles: true, cancelable: true, detail: {} });
      if (!self.element.dispatchEvent(before)) { return; }
      self.shown(false);
      bx.fire(self.element, 'ojClose', {});
      if (opener && opener.focus) { opener.focus(); }
    };
    self.isOpen = function () { return self.shown(); };
    self.onKey = function (vm, event) {
      if (event.key === 'Escape' && self.props.cancelBehavior !== 'none') { event.preventDefault(); self.close(); return false; }
      if (event.key === 'Tab') {
        var list = focusables();
        if (list.length) {
          var first = list[0];
          var last = list[list.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); return false; }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); return false; }
        }
      }
      return true;
    };
    self.backdrop = function () { if (self.props.modality !== 'modal' && self.props.cancelBehavior !== 'none') { self.close(); } };
    self.cancel = function () { self.close(); };
  }
  Composite.register('bx-dialog', {
    view: '<oj-bind-if test="[[shown()]]"><div class="bx-dialog-backdrop" on-click="[[backdrop]]"></div>'
      + '<div class="bx-dialog" role="dialog" aria-modal="true" tabindex="-1" :aria-labelledby="[[id + \'-title\']]" on-keydown="[[onKey]]">'
      + '<div class="bx-dialog-header"><oj-bind-slot name="header"><h2 class="bx-dialog-title" :id="[[id + \'-title\']]"><oj-bind-text value="[[$properties.dialogTitle]]"></oj-bind-text></h2></oj-bind-slot>'
      + '<oj-bind-if test="[[$properties.cancelBehavior !== \'none\']]"><button type="button" class="bx-btn bx-btn--borderless bx-btn--icon" aria-label="Close" on-click="[[cancel]]"><span aria-hidden="true">×</span></button></oj-bind-if></div>'
      + '<div class="bx-dialog-body"><oj-bind-slot name="body"><oj-bind-slot></oj-bind-slot></oj-bind-slot></div>'
      + '<div class="bx-dialog-footer"><oj-bind-slot name="footer"></oj-bind-slot></div></div></oj-bind-if>',
    viewModel: DialogModel,
    metadata: { properties: { dialogTitle: { type: 'string', value: '' }, cancelBehavior: { type: 'string', value: 'icon' }, modality: { type: 'string', value: 'modal' },
      initialFocus: { type: 'string', value: 'auto' }, dragAffordance: { type: 'string', value: 'none' }, resizeBehavior: { type: 'string', value: 'none' }, position: { type: 'object', value: {} } },
    methods: { open: {}, close: {}, isOpen: {} }, events: { ojOpen: { bubbles: true }, ojClose: { bubbles: true }, ojBeforeClose: { bubbles: true, cancelable: true } } }
  });

  /* ---------- bx-toast: oj-messages' messages, announced politely (errors assertively), closing on time or by hand ---------- */
  function ToastModel(context) {
    var self = this;
    self.props = context.properties;
    self.element = context.element;
    self.closed = ko.observableArray([]);
    var timers = {};
    self.items = ko.pureComputed(function () {
      return (self.props.messages || []).map(function (m, i) {
        var key = m.id || i + ':' + (m.summary || '') + (m.detail || '');
        return { key: key, m: m };
      }).filter(function (x) { return self.closed.indexOf(x.key) < 0; }).map(function (x) {
        var m = x.m;
        var severity = m.severity || 'info';
        var timeout = m.autoTimeout === undefined ? (severity === 'error' ? 0 : 5000) : m.autoTimeout === -1 ? 0 : m.autoTimeout;
        if (timeout > 0 && !timers[x.key]) { timers[x.key] = window.setTimeout(function () { dismiss(x.key, m); }, timeout); }
        return { summary: m.summary || '', detail: m.detail || '', css: 'bx-toast is-' + severity, role: severity === 'error' ? 'alert' : 'status',
          canClose: m.closeAffordance !== 'none', close: function () { dismiss(x.key, m); }, icon: severity === 'error' ? '!' : severity === 'warning' ? '!' : severity === 'confirmation' ? '✓' : 'i' };
      });
    });
    var dismiss = function (key, message) {
      window.clearTimeout(timers[key]);
      delete timers[key];
      self.closed.push(key);
      bx.fire(self.element, 'ojClose', { message: message });
    };
    self.regionCss = ko.pureComputed(function () { return 'bx-toasts is-' + (self.props.display === 'notification' ? 'notification' : 'general') + ' at-' + (self.props.position && self.props.position.my ? 'custom' : 'top'); });
  }
  Composite.register('bx-toast', {
    view: '<div :class="[[regionCss]]"><oj-bind-for-each data="[[items]]" as="t"><template><div :class="[[t.data.css]]" :role="[[t.data.role]]">'
      + '<span class="bx-toast-icon" aria-hidden="true"><oj-bind-text value="[[t.data.icon]]"></oj-bind-text></span>'
      + '<span class="bx-toast-text"><strong><oj-bind-text value="[[t.data.summary]]"></oj-bind-text></strong><oj-bind-if test="[[t.data.detail]]"><span><oj-bind-text value="[[t.data.detail]]"></oj-bind-text></span></oj-bind-if></span>'
      + '<oj-bind-if test="[[t.data.canClose]]"><button type="button" class="bx-btn bx-btn--borderless bx-btn--icon bx-btn--sm" aria-label="Close the message" on-click="[[t.data.close]]"><span aria-hidden="true">×</span></button></oj-bind-if>'
      + '</div></template></oj-bind-for-each></div>',
    viewModel: ToastModel,
    metadata: { properties: { messages: { type: 'Array<Object>', value: [] }, display: { type: 'string', value: 'general' }, position: { type: 'object', value: {} } },
      events: { ojClose: { bubbles: true } } }
  });

  /* ---------- bx-card: a raised surface with an optional heading and actions; interactive cards are buttons ---------- */
  function CardModel(context) {
    var self = this;
    self.props = context.properties;
    self.element = context.element;
    self.css = ko.pureComputed(function () { return 'bx-card' + (self.props.interactive ? ' is-interactive' : '') + (self.props.selected ? ' is-selected' : ''); });
    self.press = function () { if (self.props.interactive) { bx.fire(self.element, 'ojAction', {}); } };
    self.key = function (vm, event) { if (self.props.interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); self.press(); return false; } return true; };
  }
  Composite.register('bx-card', {
    view: '<div :class="[[css]]" :role="[[$properties.interactive ? \'button\' : null]]" :tabindex="[[$properties.interactive ? \'0\' : null]]" on-click="[[press]]" on-keydown="[[key]]">'
      + '<oj-bind-if test="[[$properties.heading]]"><div class="bx-card-head"><h3 class="bx-card-title"><oj-bind-text value="[[$properties.heading]]"></oj-bind-text></h3>'
      + '<oj-bind-if test="[[$properties.subheading]]"><span class="bx-card-sub"><oj-bind-text value="[[$properties.subheading]]"></oj-bind-text></span></oj-bind-if></div></oj-bind-if>'
      + '<div class="bx-card-body"><oj-bind-slot></oj-bind-slot></div><div class="bx-card-actions"><oj-bind-slot name="actions"></oj-bind-slot></div></div>',
    viewModel: CardModel,
    metadata: { properties: { heading: { type: 'string', value: '' }, subheading: { type: 'string', value: '' }, interactive: { type: 'boolean', value: false },
      selected: { type: 'boolean', value: false } }, events: { ojAction: { bubbles: true } } }
  });

  /* ---------- bx-tabs: a tablist; arrow keys, Home and End move; selection writes back ---------- */
  function TabsModel(context) {
    var self = this;
    self.props = context.properties;
    self.element = context.element;
    self.id = bx.nextId('bx-tabs');
    self.loaded = ko.observableArray([]);
    var load = function () {
      if (self.props.data) {
        bx.fromData(self.props.data, self.props.itemText || 'label', 'id').then(function (l) { self.loaded(l); });
      } else {
        self.loaded((self.props.options || []).map(function (o) { return { value: o.id !== undefined ? o.id : o.value, label: o.label, disabled: !!o.disabled }; }));
      }
    };
    load();
    self.propertyChanged = function (d) { if (d.property === 'data' || d.property === 'options') { load(); } };
    self.tabs = ko.pureComputed(function () {
      return self.loaded().map(function (t, i) {
        var on = self.props.selection === t.value;
        return { key: String(t.value), label: t.label, disabled: t.disabled, selected: on ? 'true' : 'false', tab: on ? '0' : '-1', css: 'bx-tab' + (on ? ' is-on' : ''), index: i,
          pick: function () { if (!t.disabled) { self.select(t.value); } } };
      });
    });
    self.select = function (value) {
      if (self.props.selection === value) { return; }
      self.props.selection = value;
    };
    self.onKey = function (vm, event) {
      var list = self.loaded().filter(function (t) { return !t.disabled; });
      var at = -1;
      list.forEach(function (t, i) { if (t.value === self.props.selection) { at = i; } });
      var next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (at + 1) % list.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (at - 1 + list.length) % list.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : -1;
      if (next < 0 || !list.length) { return true; }
      event.preventDefault();
      self.select(list[next].value);
      window.setTimeout(function () { var b = self.element.querySelector('.bx-tab.is-on'); if (b) { b.focus(); } }, 0);
      return false;
    };
  }
  Composite.register('bx-tabs', {
    view: '<div :class="[[\'bx-tabs is-\' + ($properties.edge || \'top\')]]" role="tablist" :aria-label="[[$properties.label]]" on-keydown="[[onKey]]">'
      + '<oj-bind-for-each data="[[tabs]]" as="t"><template><button type="button" role="tab" :class="[[t.data.css]]" :aria-selected="[[t.data.selected]]" :tabindex="[[t.data.tab]]"'
      + ' :disabled="[[t.data.disabled]]" on-click="[[t.data.pick]]"><oj-bind-text value="[[t.data.label]]"></oj-bind-text></button></template></oj-bind-for-each>'
      + '<span class="bx-tabs-ink" aria-hidden="true"></span></div>',
    viewModel: TabsModel,
    metadata: { properties: { selection: { type: 'any', writeback: true }, options: { type: 'Array<Object>', value: [] }, data: { type: 'object' }, itemText: { type: 'any' },
      edge: { type: 'string', value: 'top' }, display: { type: 'string', value: 'all' }, label: { type: 'string', value: '' }, overflow: { type: 'string', value: 'hidden' },
      layout: { type: 'string', value: 'stretch' } } }
  });

  /* ---------- bx-data-grid: oj-table's data and columns, sortable headers, single or multiple row selection ---------- */
  function GridModel(context) {
    var self = this;
    self.props = context.properties;
    self.element = context.element;
    self.id = bx.nextId('bx-grid');
    self.rowsData = ko.observableArray([]);
    self.sortField = ko.observable(null);
    self.sortAsc = ko.observable(true);
    var load = function () {
      var d = self.props.data;
      if (Array.isArray(d)) { self.rowsData(d.slice()); return; }
      if (d && typeof d.fetchFirst === 'function') {
        var out = [];
        var it = d.fetchFirst({ size: -1 })[Symbol.asyncIterator]();
        var step = function () { return it.next().then(function (r) { if (r.value && r.value.data) { out = out.concat(r.value.data); } return r.done ? out : step(); }); };
        step().then(function (rows) { self.rowsData(rows); });
        return;
      }
      self.rowsData([]);
    };
    load();
    self.propertyChanged = function (d) { if (d.property === 'data') { load(); } };
    var keyOf = function (row, i) { var k = self.props.keyAttributes; return k && row[k] !== undefined ? row[k] : i; };
    self.columns = ko.pureComputed(function () {
      return (self.props.columns || []).map(function (c, i) {
        var field = c.field;
        var on = self.sortField() === field;
        var sortable = c.sortable !== 'disabled' && field;
        return { header: c.headerText || field || '', field: field, align: c.style && /right/.test(c.style) ? 'right' : c.headerClassName === 'oj-helper-text-align-end' || c.align === 'end' ? 'right' : 'left',
          sortable: !!sortable, sort: on ? (self.sortAsc() ? 'ascending' : 'descending') : 'none', mark: on ? (self.sortAsc() ? '↑' : '↓') : '',
          css: 'bx-th' + (sortable ? ' is-sortable' : '') + (on ? ' is-sorted' : '') + (c.style && /right/.test(c.style) || c.align === 'end' ? ' is-end' : ''), index: i,
          toggle: function () {
            if (!sortable) { return; }
            if (self.sortField() === field) { self.sortAsc(!self.sortAsc()); } else { self.sortField(field); self.sortAsc(true); }
            bx.fire(self.element, 'ojSort', { header: field, direction: self.sortAsc() ? 'ascending' : 'descending' });
          } };
      });
    });
    self.rows = ko.pureComputed(function () {
      var list = self.rowsData().map(function (row, i) { return { row: row, key: keyOf(row, i) }; });
      var f = self.sortField();
      if (f) {
        var asc = self.sortAsc() ? 1 : -1;
        list.sort(function (a, b) {
          var x = a.row[f];
          var y = b.row[f];
          if (typeof x === 'number' && typeof y === 'number') { return (x - y) * asc; }
          return String(x === undefined || x === null ? '' : x).localeCompare(String(y === undefined || y === null ? '' : y)) * asc;
        });
      }
      var mode = self.props.selectionMode && self.props.selectionMode.row;
      var selected = self.props.selected && self.props.selected.row ? self.props.selected.row : [];
      return list.map(function (x) {
        var on = selected.indexOf(x.key) >= 0;
        return { key: x.key, cells: self.columns().map(function (c) { var v = c.field ? x.row[c.field] : ''; return { text: v === null || v === undefined ? '' : String(v), align: c.align, css: c.align === 'right' ? 'bx-td is-end' : 'bx-td' }; }),
          selectable: !!mode && mode !== 'none', checked: on, css: 'bx-tr' + (on ? ' is-selected' : ''),
          toggle: function () {
            if (!mode || mode === 'none') { return true; }
            var next = mode === 'single' ? (on ? [] : [x.key]) : on ? selected.filter(function (k) { return k !== x.key; }) : selected.concat([x.key]);
            self.props.selected = { row: next, column: [] };
            return true;
          } };
      });
    });
    self.empty = ko.pureComputed(function () { return self.rowsData().length === 0; });
    self.selectable = ko.pureComputed(function () { var m = self.props.selectionMode && self.props.selectionMode.row; return !!m && m !== 'none'; });
  }
  Composite.register('bx-data-grid', {
    view: '<div class="bx-grid-wrap"><table class="bx-grid" :aria-label="[[$properties.accessibility && $properties.accessibility.label ? $properties.accessibility.label : null]]">'
      + '<oj-bind-if test="[[$properties.caption]]"><caption><oj-bind-text value="[[$properties.caption]]"></oj-bind-text></caption></oj-bind-if><thead><tr>'
      + '<oj-bind-if test="[[selectable()]]"><th scope="col" class="bx-th bx-th-check"><span class="bx-visually-hidden">Select Row</span></th></oj-bind-if>'
      + '<oj-bind-for-each data="[[columns]]" as="c"><template><th scope="col" :class="[[c.data.css]]" :aria-sort="[[c.data.sortable ? c.data.sort : null]]">'
      + '<oj-bind-if test="[[c.data.sortable]]"><button type="button" class="bx-sort" on-click="[[c.data.toggle]]"><oj-bind-text value="[[c.data.header]]"></oj-bind-text><span aria-hidden="true"><oj-bind-text value="[[c.data.mark]]"></oj-bind-text></span></button></oj-bind-if>'
      + '<oj-bind-if test="[[!c.data.sortable]]"><oj-bind-text value="[[c.data.header]]"></oj-bind-text></oj-bind-if></th></template></oj-bind-for-each></tr></thead>'
      + '<tbody><oj-bind-for-each data="[[rows]]" as="r"><template><tr :class="[[r.data.css]]">'
      + '<oj-bind-if test="[[r.data.selectable]]"><td class="bx-td bx-td-check"><input type="checkbox" class="bx-check" aria-label="Select the row" :checked="[[r.data.checked]]" on-click="[[r.data.toggle]]"/></td></oj-bind-if>'
      + '<oj-bind-for-each data="[[r.data.cells]]" as="c"><template><td :class="[[c.data.css]]"><oj-bind-text value="[[c.data.text]]"></oj-bind-text></td></template></oj-bind-for-each>'
      + '</tr></template></oj-bind-for-each></tbody></table>'
      + '<oj-bind-if test="[[empty()]]"><div class="bx-grid-empty"><oj-bind-slot name="noData"><oj-bind-text value="[[$properties.translations && $properties.translations.msgNoData ? $properties.translations.msgNoData : \'No data to show.\']]"></oj-bind-text></oj-bind-slot></div></oj-bind-if></div>',
    viewModel: GridModel,
    metadata: { properties: { data: { type: 'any' }, columns: { type: 'Array<Object>', value: [] }, selectionMode: { type: 'object', value: {} },
      selected: { type: 'object', writeback: true, value: { row: [], column: [] } }, keyAttributes: { type: 'string' }, caption: { type: 'string', value: '' },
      accessibility: { type: 'object', value: {} }, translations: { type: 'object', value: {} }, display: { type: 'string', value: 'list' },
      scrollPolicy: { type: 'string', value: 'auto' }, horizontalGridVisible: { type: 'string', value: 'auto' }, verticalGridVisible: { type: 'string', value: 'auto' } },
    events: { ojSort: { bubbles: true } } }
  });

  return {};
});
