/*
 * Premium JET fields, the forms wave: <bx-text-area> (oj-text-area), <bx-password> (oj-input-password),
 * <bx-number-input> (oj-input-number), <bx-currency-picker> (oj-select-single of currencies), <bx-multi-select>
 * (oj-select-many), <bx-switch> (oj-switch), <bx-date-range> (two oj-input-date), <bx-search> (oj-input-text as a
 * search; ojSearch as oj-c-input-search fires it), <bx-autocomplete> (oj-combobox-one) and <bx-document-upload>
 * (oj-file-picker: accept, selection-mode, ojSelect and ojInvalidSelect). Each keeps the JET attribute and event names.
 */
define(['ojs/ojcomposite', './bx-core'], function (Composite, bx) {
  'use strict';
  var ko = bx.ko;
  var extend = function (a, b) { var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; }); Object.keys(b).forEach(function (k) { o[k] = b[k]; }); return o; };
  var METHODS = { validate: {}, reset: {}, showMessages: {} };
  var input = function (attrs, events) {
    return ':id="[[id]]" :disabled="[[$properties.disabled]]" :aria-required="[[$properties.required ? \'true\' : null]]" :aria-invalid="[[invalid]]"'
      + ' :aria-describedby="[[describedBy]]" ' + (attrs || '') + ' on-focus="[[onFocus]]" on-blur="[[onBlur]]" ' + (events || '');
  };

  /** Writes a value the JET way: only when it passes required, the validators and the field's own check. */
  var accept = function (vm, value, own) {
    var message = own || bx.validate(value, vm.props.required, vm.props.validators, vm.props.labelHint);
    vm.shown(true);
    if (message) { vm.validationError(message); vm.props.valid = 'invalidShown'; return false; }
    vm.validationError('');
    vm.props.value = value;
    vm.props.valid = 'valid';
    return true;
  };

  /* ---------- bx-text-area ---------- */
  function TextAreaModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.typed = ko.observable(null);
    self.text = ko.pureComputed(function () { return self.typed() !== null ? self.typed() : (self.props.value || ''); });
    self.maxLength = ko.pureComputed(function () { var l = self.props.length || {}; return l.max ? l.max : null; });
    self.counter = ko.pureComputed(function () { var m = self.maxLength(); return m ? self.text().length + ' / ' + m : ''; });
    self.onInput = function (event) { self.typed(event.target.value); self.props.rawValue = event.target.value; return true; };
    self.onBlur = function () { self.focused(false); if (self.typed() !== null) { var t = self.typed(); self.typed(null); accept(self, t, ''); } else { self.check(true); } return true; };
  }
  Composite.register('bx-text-area', {
    view: bx.fieldView('<textarea class="bx-input bx-textarea" ' + input(':rows="[[$properties.rows]]" :maxlength="[[maxLength]]" :readonly="[[$properties.readonly]]"'
      + ' :placeholder="[[$properties.placeholder]]" :value="[[text]]"', 'on-input="[[onInput]]"') + '></textarea>'
      + '<oj-bind-if test="[[counter()]]"><span class="bx-counter" aria-hidden="true"><oj-bind-text value="[[counter]]"></oj-bind-text></span></oj-bind-if>', 'is-multiline'),
    viewModel: TextAreaModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'string', writeback: true }, rawValue: { type: 'string', writeback: true, readOnly: true }, rows: { type: 'number', value: 3 },
      length: { type: 'object', value: {}, properties: { max: { type: 'number' }, counter: { type: 'string', value: 'remaining' } } } }), methods: METHODS }
  });

  /* ---------- bx-password: masked, Show and Hide (mask-icon), never from the browser's history ---------- */
  function PasswordModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.revealed = ko.observable(false);
    self.typed = ko.observable(null);
    self.text = ko.pureComputed(function () { return self.typed() !== null ? self.typed() : (self.props.value || ''); });
    self.type = ko.pureComputed(function () { return self.revealed() ? 'text' : 'password'; });
    self.canReveal = ko.pureComputed(function () { return self.props.maskIcon !== 'hidden' && !self.props.disabled; });
    self.revealLabel = ko.pureComputed(function () { return (self.revealed() ? 'Hide ' : 'Show ') + (self.props.labelHint || 'password'); });
    self.revealText = ko.pureComputed(function () { return self.revealed() ? 'Hide' : 'Show'; });
    self.pressed = ko.pureComputed(function () { return self.revealed() ? 'true' : 'false'; });
    self.toggle = function () { self.revealed(!self.revealed()); };
    self.onInput = function (event) { self.typed(event.target.value); self.props.rawValue = event.target.value; return true; };
    self.onBlur = function () { self.focused(false); if (self.typed() !== null) { var t = self.typed(); self.typed(null); accept(self, t, ''); } else { self.check(true); } return true; };
  }
  Composite.register('bx-password', {
    view: bx.fieldView('<input class="bx-input" ' + input(':type="[[type]]" :value="[[text]]" :readonly="[[$properties.readonly]]" :placeholder="[[$properties.placeholder]]"'
      + ' :autocomplete="[[$properties.autocomplete]]" spellcheck="false" autocapitalize="off"', 'on-input="[[onInput]]"') + '/>'
      + '<oj-bind-if test="[[canReveal()]]"><button type="button" class="bx-reveal" :aria-pressed="[[pressed]]" :aria-label="[[revealLabel]]" on-click="[[toggle]]">'
      + '<oj-bind-text value="[[revealText]]"></oj-bind-text></button></oj-bind-if>'),
    viewModel: PasswordModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'string', writeback: true }, rawValue: { type: 'string', writeback: true, readOnly: true },
      maskIcon: { type: 'string', value: 'visible' }, autocomplete: { type: 'string', value: 'current-password' } }), methods: METHODS }
  });

  /* ---------- bx-number-input: a number, with step buttons and the arrow keys ---------- */
  function NumberModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.typed = ko.observable(null);
    var has = function (n) { return n !== null && n !== undefined; };
    self.text = ko.pureComputed(function () {
      if (self.typed() !== null) { return self.typed(); }
      var v = self.props.value;
      return has(v) ? (self.props.converter ? bx.format(self.props.converter, v) : String(v)) : '';
    });
    var range = function (n) {
      if (n !== null && has(self.props.min) && n < self.props.min) { return 'Enter ' + self.props.min + ' or more.'; }
      if (n !== null && has(self.props.max) && n > self.props.max) { return 'Enter ' + self.props.max + ' or less.'; }
      return '';
    };
    self.commit = function () {
      if (self.typed() === null) { return; }
      var text = self.typed().trim();
      self.typed(null);
      var n = text === '' ? null : self.props.converter ? bx.parse(self.props.converter, text) : Number(text);
      if (n !== null && !isFinite(n)) { self.validationError('Enter a number.'); self.shown(true); self.props.valid = 'invalidShown'; return; }
      accept(self, n, range(n));
    };
    var nudge = function (by) {
      var base = has(self.props.value) ? self.props.value : (has(self.props.min) ? self.props.min - by : 0);
      var next = Math.round((base + by) * 1e9) / 1e9;
      if (has(self.props.min) && next < self.props.min) { next = self.props.min; }
      if (has(self.props.max) && next > self.props.max) { next = self.props.max; }
      self.typed(null);
      accept(self, next, '');
    };
    self.canStep = ko.pureComputed(function () { return !self.props.disabled && !self.props.readonly && self.props.stepButtons !== 'off'; });
    self.atMin = ko.pureComputed(function () { return has(self.props.min) && has(self.props.value) && self.props.value <= self.props.min; });
    self.atMax = ko.pureComputed(function () { return has(self.props.max) && has(self.props.value) && self.props.value >= self.props.max; });
    self.down = function () { nudge(-(self.props.step || 1)); };
    self.up = function () { nudge(self.props.step || 1); };
    self.decLabel = ko.pureComputed(function () { return 'Decrease ' + (self.props.labelHint || 'the number'); });
    self.incLabel = ko.pureComputed(function () { return 'Increase ' + (self.props.labelHint || 'the number'); });
    self.onInput = function (event) { self.typed(event.target.value); self.props.rawValue = event.target.value; return true; };
    self.onBlur = function () { self.focused(false); if (self.typed() !== null) { self.commit(); } else { self.check(true); } return true; };
    self.onKey = function (event) {
      if (event.key === 'Enter') { self.commit(); }
      if (self.canStep() && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { if (event.preventDefault) { event.preventDefault(); } nudge((event.key === 'ArrowUp' ? 1 : -1) * (self.props.step || 1)); return false; }
      return true;
    };
  }
  Composite.register('bx-number-input', {
    view: bx.fieldView('<oj-bind-if test="[[canStep()]]"><button type="button" class="bx-step" :aria-label="[[decLabel]]" :disabled="[[atMin]]" on-click="[[down]]">−</button></oj-bind-if>'
      + '<input class="bx-input bx-num" ' + input(':value="[[text]]" :readonly="[[$properties.readonly]]" :placeholder="[[$properties.placeholder]]" inputmode="decimal" autocomplete="off"',
        'on-input="[[onInput]]" on-keydown="[[onKey]]"') + '/>'
      + '<oj-bind-if test="[[canStep()]]"><button type="button" class="bx-step" :aria-label="[[incLabel]]" :disabled="[[atMax]]" on-click="[[up]]">+</button></oj-bind-if>'),
    viewModel: NumberModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'number', writeback: true }, rawValue: { type: 'string', writeback: true, readOnly: true },
      min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number', value: 1 }, converter: { type: 'object' }, stepButtons: { type: 'string', value: 'on' } }), methods: METHODS }
  });

  /* ---------- bx-currency-picker: one currency, its code with the name beside it ---------- */
  var CURRENCIES = [['INR', 'Indian rupee'], ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'Pound sterling'], ['AED', 'UAE dirham'], ['SAR', 'Saudi riyal'],
    ['SGD', 'Singapore dollar'], ['JPY', 'Japanese yen'], ['KWD', 'Kuwaiti dinar'], ['AUD', 'Australian dollar'], ['CAD', 'Canadian dollar'], ['CHF', 'Swiss franc']]
    .map(function (c) { return { value: c[0], label: c[1] }; });
  function CurrencyModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.list = ko.pureComputed(function () { var c = self.props.currencies; return c && c.length ? bx.options(c) : CURRENCIES; });
    self.choices = ko.pureComputed(function () {
      return self.list().map(function (o) { return { value: o.value, text: o.value + ' · ' + o.label, disabled: o.disabled, selected: o.value === self.props.value }; });
    });
    self.name = ko.pureComputed(function () { var o = self.list().filter(function (c) { return c.value === self.props.value; })[0]; return o ? o.label : ''; });
    self.noneSelected = ko.pureComputed(function () { return !self.props.value; });
    self.onChange = function (event) { self.props.value = event.target.value || null; self.check(true); return true; };
  }
  Composite.register('bx-currency-picker', {
    view: bx.fieldView('<select class="bx-input bx-select" ' + input(':disabled="[[$properties.disabled || $properties.readonly]]"', 'on-change="[[onChange]]"') + '>'
      + '<option value="" :selected="[[noneSelected]]"><oj-bind-text value="[[$properties.placeholder || \'Choose a currency\']]"></oj-bind-text></option>'
      + '<oj-bind-for-each data="[[choices]]" as="o"><template><option :value="[[o.data.value]]" :disabled="[[o.data.disabled]]" :selected="[[o.data.selected]]"><oj-bind-text value="[[o.data.text]]"></oj-bind-text></option></template></oj-bind-for-each>'
      + '</select><oj-bind-if test="[[name()]]"><span class="bx-currency-name" aria-hidden="true"><oj-bind-text value="[[name]]"></oj-bind-text></span></oj-bind-if><span class="bx-caret" aria-hidden="true"></span>'),
    viewModel: CurrencyModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'string', writeback: true }, currencies: { type: 'Array<Object>', value: [] } }), methods: METHODS }
  });

  /* ---------- The list under a combobox (bx-multi-select, bx-autocomplete) ---------- */
  function listbox(self, items, pick) {
    self.listId = bx.nextId('bx-list');
    self.open = ko.observable(false);
    self.active = ko.observable(-1);
    var enabled = function () { return items().map(function (o, i) { return o.disabled ? -1 : i; }).filter(function (i) { return i >= 0; }); };
    var move = function (by) {
      var e = enabled();
      if (!e.length) { return; }
      var at = e.indexOf(self.active());
      self.active(e[(at + by + e.length) % e.length]);
    };
    self.expanded = ko.pureComputed(function () { return self.open() ? 'true' : 'false'; });
    self.activeId = ko.pureComputed(function () { return self.open() && self.active() >= 0 ? self.listId + '-' + self.active() : null; });
    self.rows = ko.pureComputed(function () {
      return items().map(function (o, i) {
        return { id: self.listId + '-' + i, label: o.label, selected: o.selected ? 'true' : 'false', disabled: o.disabled ? 'true' : null,
          css: 'bx-option' + (i === self.active() ? ' is-active' : ''), down: function (event) { if (event && event.preventDefault) { event.preventDefault(); } pick(o); return false; } };
      });
    });
    self.empty = ko.pureComputed(function () { return items().length === 0; });
    self.listKey = function (event) {
      if (event.key === 'ArrowDown') { if (event.preventDefault) { event.preventDefault(); } if (!self.open()) { self.open(true); self.active(enabled()[0] === undefined ? -1 : enabled()[0]); } else { move(1); } return true; }
      if (event.key === 'ArrowUp') { if (event.preventDefault) { event.preventDefault(); } if (self.open()) { move(-1); } return true; }
      if (event.key === 'Enter' && self.open() && self.active() >= 0) { if (event.preventDefault) { event.preventDefault(); } pick(items()[self.active()]); return true; }
      if (event.key === 'Escape' && self.open()) { self.open(false); self.active(-1); return true; }
      return false;
    };
  }
  var listView = function (multiple, emptyText) {
    return '<oj-bind-if test="[[open() && !$properties.disabled && !$properties.readonly]]"><ul class="bx-listbox" role="listbox" :id="[[listId]]" :aria-label="[[$properties.labelHint]]"'
      + (multiple ? ' aria-multiselectable="true"' : '') + '>'
      + '<oj-bind-if test="[[empty()]]"><li class="bx-option-empty" role="presentation">' + emptyText + '</li></oj-bind-if>'
      + '<oj-bind-for-each data="[[rows]]" as="r"><template><li role="option" :id="[[r.data.id]]" :class="[[r.data.css]]" :aria-selected="[[r.data.selected]]"'
      + ' :aria-disabled="[[r.data.disabled]]" on-mousedown="[[r.data.down]]"><oj-bind-text value="[[r.data.label]]"></oj-bind-text></li></template></oj-bind-for-each></ul></oj-bind-if>';
  };
  var comboAttrs = 'role="combobox" aria-autocomplete="list" autocomplete="off" :aria-expanded="[[expanded]]" :aria-controls="[[listId]]" :aria-activedescendant="[[activeId]]"';

  /* ---------- bx-multi-select (oj-select-many): chips and a list to filter ---------- */
  function MultiSelectModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.query = ko.observable('');
    var chosen = function () { return Array.isArray(self.props.value) ? self.props.value : []; };
    self.all = ko.pureComputed(function () { return bx.options(self.props.options); });
    var left = ko.pureComputed(function () {
      var q = self.query().trim().toLowerCase();
      return self.all().filter(function (o) { return chosen().indexOf(o.value) < 0 && o.label.toLowerCase().indexOf(q) >= 0; });
    });
    var pick = function (o) { if (!o || o.disabled) { return; } self.props.value = chosen().concat([o.value]); self.query(''); self.active(-1); self.check(true); };
    listbox(self, left, pick);
    self.editable = ko.pureComputed(function () { return !self.props.disabled && !self.props.readonly; });
    self.chips = ko.pureComputed(function () {
      return chosen().map(function (v) {
        var o = self.all().filter(function (x) { return x.value === v; })[0];
        var label = o ? o.label : String(v);
        return { label: label, remove: 'Remove ' + label, drop: function () { self.props.value = chosen().filter(function (x) { return x !== v; }); self.check(true); } };
      });
    });
    self.hint = ko.pureComputed(function () { return chosen().length ? '' : (self.props.placeholder || 'Choose'); });
    self.onInput = function (event) { self.query(event.target.value); self.open(true); self.active(-1); return true; };
    self.onFocus = function () { self.focused(true); self.open(true); return true; };
    self.onBlur = function () { self.focused(false); self.open(false); self.check(true); return true; };
    self.onKey = function (event) {
      if (event.key === 'Backspace' && self.query() === '' && chosen().length) { self.props.value = chosen().slice(0, -1); return true; }
      return !self.listKey(event);
    };
  }
  Composite.register('bx-multi-select', {
    view: bx.fieldView('<div class="bx-chips"><oj-bind-for-each data="[[chips]]" as="c"><template><span class="bx-chip"><oj-bind-text value="[[c.data.label]]"></oj-bind-text>'
      + '<oj-bind-if test="[[editable()]]"><button type="button" class="bx-chip-remove" :aria-label="[[c.data.remove]]" on-click="[[c.data.drop]]">×</button></oj-bind-if></span></template></oj-bind-for-each>'
      + '<oj-bind-if test="[[editable()]]"><input class="bx-input" ' + input(comboAttrs + ' :value="[[query]]" :placeholder="[[hint]]"', 'on-input="[[onInput]]" on-keydown="[[onKey]]"') + '/></oj-bind-if></div>'
      + listView(true, 'Nothing more to choose')),
    viewModel: MultiSelectModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'Array<any>', writeback: true, value: [] }, options: { type: 'Array<Object>', value: [] } }), methods: METHODS }
  });

  /* ---------- bx-switch (oj-switch) ---------- */
  function SwitchModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.checked = ko.pureComputed(function () { return self.props.value ? 'true' : 'false'; });
    self.readonlyAttr = ko.pureComputed(function () { return self.props.readonly ? 'true' : null; });
    self.flip = function () { if (!self.props.readonly && !self.props.disabled) { self.props.value = !self.props.value; } };
  }
  Composite.register('bx-switch', {
    view: '<div :class="[[fieldCss]]"><div class="bx-switch-row"><span class="bx-switch-label" :id="[[id + \'-label\']]"><oj-bind-text value="[[$properties.labelHint]]"></oj-bind-text></span>'
      + '<button type="button" role="switch" class="bx-switch" :id="[[id]]" :aria-checked="[[checked]]" :aria-labelledby="[[id + \'-label\']]" :aria-describedby="[[describedBy]]"'
      + ' :aria-readonly="[[readonlyAttr]]" :disabled="[[$properties.disabled]]" on-click="[[flip]]"></button></div>'
      + '<oj-bind-if test="[[error()]]"><span class="bx-error" :id="[[id + \'-err\']]" role="alert"><span class="bx-error-icon" aria-hidden="true">!</span><oj-bind-text value="[[error]]"></oj-bind-text></span></oj-bind-if>'
      + '<oj-bind-if test="[[!error() && help()]]"><span class="bx-help" :id="[[id + \'-help\']]"><oj-bind-text value="[[help]]"></oj-bind-text></span></oj-bind-if></div>',
    viewModel: SwitchModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'boolean', writeback: true, value: false } }), methods: METHODS }
  });

  /* ---------- bx-date-range: from and to (ISO), the end not before the start, max-days ---------- */
  function DateRangeModel(context) {
    var self = this;
    var range = function () { var v = self.props.value || {}; return { from: v.from || '', to: v.to || '' }; };
    bx.fieldState(self, context, function () { var r = range(); return r.from && r.to ? r : null; });
    var days = function (a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); };
    self.own = ko.pureComputed(function () {
      var r = range();
      if (r.from && r.to && r.to < r.from) { return 'The end date is before the start date.'; }
      if (r.from && r.to && self.props.maxDays && days(r.from, r.to) > self.props.maxDays) { return 'Choose at most ' + self.props.maxDays + ' days.'; }
      return '';
    });
    var base = self.error;
    self.error = ko.pureComputed(function () { return base() || self.own(); });
    self.describedBy = ko.pureComputed(function () { return self.error() ? self.id + '-err' : self.help() ? self.id + '-help' : null; });
    self.invalid = ko.pureComputed(function () { return self.error() ? 'true' : null; });
    self.fromValue = ko.pureComputed(function () { return range().from; });
    self.toValue = ko.pureComputed(function () { return range().to; });
    self.toMin = ko.pureComputed(function () { return range().from || self.props.min || null; });
    self.fromMax = ko.pureComputed(function () { return range().to || self.props.max || null; });
    self.partCss = ko.pureComputed(function () { return 'bx-field' + (self.error() ? ' is-error' : '') + (self.props.disabled ? ' is-disabled' : '') + (self.props.readonly ? ' is-readonly' : ''); });
    var set = function (key, value) { var r = range(); r[key] = value; self.props.value = r; self.shown(true); self.props.valid = self.own() ? 'invalidShown' : 'valid'; };
    self.onFrom = function (event) { set('from', event.target.value); return true; };
    self.onTo = function (event) { set('to', event.target.value); return true; };
  }
  var datePart = function (key, which) {
    return '<div :class="[[partCss]]"><label class="bx-label" :for="[[id + \'-' + key + '\']]"><oj-bind-text value="[[$properties.' + key + 'Label]]"></oj-bind-text></label><div class="bx-control">'
      + '<input type="date" class="bx-input" :id="[[id + \'-' + key + '\']]" :value="[[' + key + 'Value]]" ' + which + ' :disabled="[[$properties.disabled]]" :readonly="[[$properties.readonly]]"'
      + ' :aria-required="[[$properties.required ? \'true\' : null]]" :aria-invalid="[[invalid]]" :aria-describedby="[[describedBy]]" on-change="[[on' + (key === 'from' ? 'From' : 'To') + ']]" on-blur="[[onBlur]]"/></div></div>';
  };
  Composite.register('bx-date-range', {
    view: '<fieldset :class="[[fieldCss]]"><legend class="bx-label"><oj-bind-text value="[[$properties.labelHint]]"></oj-bind-text><oj-bind-if test="[[$properties.required]]"><span class="bx-req" aria-hidden="true"> *</span></oj-bind-if></legend>'
      + '<div class="bx-range">' + datePart('from', ':min="[[$properties.min]]" :max="[[fromMax]]"') + datePart('to', ':min="[[toMin]]" :max="[[$properties.max]]"') + '</div>'
      + '<oj-bind-if test="[[error()]]"><span class="bx-error" :id="[[id + \'-err\']]" role="alert"><span class="bx-error-icon" aria-hidden="true">!</span><oj-bind-text value="[[error]]"></oj-bind-text></span></oj-bind-if>'
      + '<oj-bind-if test="[[!error() && help()]]"><span class="bx-help" :id="[[id + \'-help\']]"><oj-bind-text value="[[help]]"></oj-bind-text></span></oj-bind-if></fieldset>',
    viewModel: DateRangeModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'object', writeback: true, value: { from: '', to: '' } }, min: { type: 'string' }, max: { type: 'string' },
      maxDays: { type: 'number' }, fromLabel: { type: 'string', value: 'From' }, toLabel: { type: 'string', value: 'To' } }), methods: METHODS }
  });

  /* ---------- bx-search: Enter fires ojSearch (as oj-c-input-search), Escape and Clear empty it ---------- */
  function SearchModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return ''; });
    self.text = ko.pureComputed(function () { return self.props.value || ''; });
    self.clearLabel = ko.pureComputed(function () { return 'Clear ' + (self.props.labelHint || 'the search'); });
    self.showClear = ko.pureComputed(function () { return !!self.text() && !self.props.disabled; });
    self.onInput = function (event) { self.props.value = event.target.value; self.props.rawValue = event.target.value; return true; };
    self.clear = function () { self.props.value = ''; self.props.rawValue = ''; };
    self.onKey = function (event) {
      if (event.key === 'Enter') { bx.fire(self.element, 'ojSearch', { value: self.text() }); return false; }
      if (event.key === 'Escape' && self.text()) { self.clear(); return false; }
      return true;
    };
  }
  Composite.register('bx-search', {
    view: '<div role="search">' + bx.fieldView('<span class="bx-search-icon" aria-hidden="true"></span><input type="search" class="bx-input bx-search" '
      + input(':value="[[text]]" :placeholder="[[$properties.placeholder]]" autocomplete="off" enterkeyhint="search"', 'on-input="[[onInput]]" on-keydown="[[onKey]]"') + '/>'
      + '<oj-bind-if test="[[showClear()]]"><button type="button" class="bx-clear" :aria-label="[[clearLabel]]" on-click="[[clear]]"><span aria-hidden="true">×</span></button></oj-bind-if>') + '</div>',
    viewModel: SearchModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'string', writeback: true, value: '' }, rawValue: { type: 'string', writeback: true, readOnly: true } }),
      events: { ojSearch: {} }, methods: METHODS }
  });

  /* ---------- bx-autocomplete (oj-combobox-one): suggestions as the customer types ---------- */
  function AutocompleteModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.typed = ko.observable(null);
    self.all = ko.pureComputed(function () { return bx.options(self.props.options); });
    var labelOf = function (v) { var o = self.all().filter(function (x) { return x.value === v; })[0]; return o ? o.label : (v === null || v === undefined ? '' : String(v)); };
    self.text = ko.pureComputed(function () { return self.typed() !== null ? self.typed() : labelOf(self.props.value); });
    var matches = ko.pureComputed(function () {
      var q = (self.typed() || '').trim().toLowerCase();
      return self.all().filter(function (o) { return o.label.toLowerCase().indexOf(q) >= 0; })
        .map(function (o) { return { value: o.value, label: o.label, disabled: o.disabled, selected: o.value === self.props.value }; });
    });
    var pick = function (o) { if (!o || o.disabled) { return; } self.typed(null); self.open(false); self.active(-1); accept(self, o.value, ''); };
    listbox(self, matches, pick);
    self.onInput = function (event) { self.typed(event.target.value); self.props.rawValue = event.target.value; self.open(true); self.active(-1); return true; };
    self.onBlur = function () {
      self.focused(false);
      self.open(false);
      if (self.typed() === null) { self.check(true); return true; }
      var t = self.typed().trim();
      var exact = self.all().filter(function (o) { return o.label.toLowerCase() === t.toLowerCase(); })[0];
      if (exact) { pick(exact); return true; }
      if (t === '') { self.typed(null); accept(self, null, ''); return true; }
      if (self.props.freeText) { self.typed(null); accept(self, t, ''); return true; }
      self.validationError('Choose one of the suggestions.');
      self.shown(true);
      self.props.valid = 'invalidShown';
      return true;
    };
    self.onKey = function (event) { if (self.props.readonly) { return true; } return !self.listKey(event); };
  }
  Composite.register('bx-autocomplete', {
    view: bx.fieldView('<input class="bx-input" ' + input(comboAttrs + ' :value="[[text]]" :readonly="[[$properties.readonly]]" :placeholder="[[$properties.placeholder]]"',
      'on-input="[[onInput]]" on-keydown="[[onKey]]"') + '/><span class="bx-caret" aria-hidden="true"></span>' + listView(false, 'No match')),
    viewModel: AutocompleteModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'any', writeback: true }, rawValue: { type: 'string', writeback: true, readOnly: true }, options: { type: 'Array<Object>', value: [] },
      freeText: { type: 'boolean', value: false } }), methods: METHODS }
  });

  /* ---------- bx-document-upload (oj-file-picker): accept, selection-mode, ojSelect and ojInvalidSelect ---------- */
  var sizeText = function (b) { return b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; };
  function UploadModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.over = ko.observable(false);
    var list = function () { return Array.isArray(self.props.value) ? self.props.value : []; };
    var accepts = function () { var a = self.props.accept; return Array.isArray(a) ? a : a ? String(a).split(',') : []; };
    self.acceptAttr = ko.pureComputed(function () { return accepts().join(',') || null; });
    self.multiple = ko.pureComputed(function () { return self.props.selectionMode === 'multiple'; });
    self.buttonText = ko.pureComputed(function () { return self.multiple() ? 'Add files' : 'Choose a file'; });
    self.hint = ko.pureComputed(function () {
      var parts = [];
      if (accepts().length) { parts.push(accepts().join(', ')); }
      if (self.props.maxSize) { parts.push('up to ' + sizeText(self.props.maxSize)); }
      return 'or drop ' + (self.multiple() ? 'them' : 'it') + ' here' + (parts.length ? ' · ' + parts.join(', ') : '');
    });
    self.dropCss = ko.pureComputed(function () { return 'bx-drop' + (self.over() ? ' is-over' : ''); });
    var allowed = function (f) {
      var a = accepts();
      return !a.length || a.some(function (x) { x = x.trim().toLowerCase(); return x.charAt(0) === '.' ? f.name.toLowerCase().slice(-x.length) === x : x.slice(-2) === '/*' ? (f.type || '').indexOf(x.slice(0, -1)) === 0 : f.type === x; });
    };
    self.add = function (files) {
      var picked = Array.prototype.slice.call(files || []);
      if (!picked.length) { return; }
      var wrong = picked.filter(function (f) { return !allowed(f); })[0];
      var big = picked.filter(function (f) { return self.props.maxSize && f.size > self.props.maxSize; })[0];
      if (wrong || big) {
        self.validationError(wrong ? wrong.name + ' is not a file type this accepts (' + accepts().join(', ') + ').' : big.name + ' is larger than ' + sizeText(self.props.maxSize) + '.');
        self.shown(true);
        self.props.valid = 'invalidShown';
        bx.fire(self.element, 'ojInvalidSelect', { messages: [{ severity: 'error', summary: self.validationError(), detail: self.validationError() }] });
        return;
      }
      var next = self.multiple() ? list().concat(picked) : picked.slice(0, 1);
      self.validationError('');
      self.props.value = next;
      self.props.valid = 'valid';
      bx.fire(self.element, 'ojSelect', { files: picked });
    };
    self.rows = ko.pureComputed(function () {
      return list().map(function (f, i) {
        return { name: f.name, size: sizeText(f.size || 0), remove: 'Remove ' + f.name,
          drop: function () { self.props.value = list().filter(function (x, j) { return j !== i; }); self.check(true); } };
      });
    });
    self.buttonDescribedBy = ko.pureComputed(function () { return self.id + '-label' + (self.describedBy() ? ' ' + self.describedBy() : ''); });
    self.hasFiles = ko.pureComputed(function () { return list().length > 0; });
    self.filesLabel = ko.pureComputed(function () { return (self.props.labelHint || 'Files') + ': chosen files'; });
    self.choose = function () { var el = self.element.querySelector && self.element.querySelector('input[type=file]'); if (el) { el.click(); } };
    self.onPick = function (event) { self.add(event.target.files); event.target.value = ''; return true; };
    self.onOver = function (event) { if (event.preventDefault) { event.preventDefault(); } if (!self.props.disabled) { self.over(true); } return false; };
    self.onLeave = function () { self.over(false); return true; };
    self.onDrop = function (event) { if (event.preventDefault) { event.preventDefault(); } self.over(false); if (!self.props.disabled) { self.add(event.dataTransfer && event.dataTransfer.files); } return false; };
  }
  Composite.register('bx-document-upload', {
    view: '<div :class="[[fieldCss]]"><span class="bx-label" :id="[[id + \'-label\']]"><oj-bind-text value="[[$properties.labelHint]]"></oj-bind-text><oj-bind-if test="[[$properties.required]]"><span class="bx-req" aria-hidden="true"> *</span></oj-bind-if></span>'
      + '<div :class="[[dropCss]]" on-dragover="[[onOver]]" on-dragleave="[[onLeave]]" on-drop="[[onDrop]]">'
      + '<input type="file" class="bx-visually-hidden" tabindex="-1" :id="[[id]]" :accept="[[acceptAttr]]" :multiple="[[multiple]]" :disabled="[[$properties.disabled]]" aria-hidden="true"'
      + ' on-change="[[onPick]]"/>'
      + '<button type="button" class="bx-drop-button" :disabled="[[$properties.disabled]]" :aria-describedby="[[buttonDescribedBy]]" on-click="[[choose]]"><oj-bind-text value="[[buttonText]]"></oj-bind-text></button>'
      + '<span class="bx-drop-hint"><oj-bind-text value="[[hint]]"></oj-bind-text></span></div>'
      + '<oj-bind-if test="[[hasFiles()]]"><ul class="bx-files" :aria-label="[[filesLabel]]"><oj-bind-for-each data="[[rows]]" as="f"><template><li class="bx-file">'
      + '<span class="bx-file-name"><oj-bind-text value="[[f.data.name]]"></oj-bind-text></span><span class="bx-file-size"><oj-bind-text value="[[f.data.size]]"></oj-bind-text></span>'
      + '<oj-bind-if test="[[!$properties.disabled]]"><button type="button" class="bx-chip-remove" :aria-label="[[f.data.remove]]" on-click="[[f.data.drop]]">×</button></oj-bind-if></li></template></oj-bind-for-each></ul></oj-bind-if>'
      + '<oj-bind-if test="[[error()]]"><span class="bx-error" :id="[[id + \'-err\']]" role="alert"><span class="bx-error-icon" aria-hidden="true">!</span><oj-bind-text value="[[error]]"></oj-bind-text></span></oj-bind-if>'
      + '<oj-bind-if test="[[!error() && help()]]"><span class="bx-help" :id="[[id + \'-help\']]"><oj-bind-text value="[[help]]"></oj-bind-text></span></oj-bind-if></div>',
    viewModel: UploadModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'Array<Object>', writeback: true, value: [] }, accept: { type: 'Array<string>', value: [] },
      selectionMode: { type: 'string', value: 'single' }, maxSize: { type: 'number' } }), events: { ojSelect: {}, ojInvalidSelect: {} }, methods: METHODS }
  });

  return { currencies: CURRENCIES, sizeText: sizeText };
});
