/*
 * Premium JET fields: <bx-text-field> (oj-input-text), <bx-amount> (oj-input-number with a currency), <bx-select>
 * (oj-select-single and oj-select-one), <bx-checkbox-group> (oj-checkboxset), <bx-choice-group> (oj-radioset) and
 * <bx-date> (oj-input-date). Each keeps the JET attribute and event names: value (writeback), raw-value, label-hint,
 * placeholder, required, disabled, readonly, validators, converter, messages-custom, help.instruction; valueChanged and
 * rawValueChanged fire as on the JET element, and validate(), reset() and showMessages() are there too.
 */
define(['ojs/ojcomposite', './bx-core'], function (Composite, bx) {
  'use strict';
  var ko = bx.ko;
  var extend = function (a, b) { var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; }); Object.keys(b).forEach(function (k) { o[k] = b[k]; }); return o; };
  var METHODS = { validate: {}, reset: {}, showMessages: {} };

  /* ---------- bx-text-field ---------- */
  function TextFieldModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.typed = ko.observable(null);
    self.text = ko.pureComputed(function () { return self.typed() !== null ? self.typed() : bx.format(self.props.converter, self.props.value); });
    self.maxLength = ko.pureComputed(function () { var l = self.props.length || {}; return l.max ? l.max : null; });
    var length = function (s) { return String(s || '').length; };
    self.counter = ko.pureComputed(function () { var m = self.maxLength(); return m && length(self.text()) ? length(self.text()) + ' / ' + m : ''; });
    self.showClear = ko.pureComputed(function () { return self.props.clearIcon === 'always' || (self.props.clearIcon === 'conditional' && !!self.text() && !self.props.disabled && !self.props.readonly); });
    self.onInput = function (event) {
      self.typed(event.target.value);
      self.props.rawValue = event.target.value;
      return true;
    };
    // Commits the typed text as the value; false when the converter could not parse it (its message shows)
    self.commit = function () {
      if (self.typed() === null) { return true; }
      var text = self.typed();
      try {
        var parsed = text === '' ? (self.props.converter ? null : '') : bx.parse(self.props.converter, text);
        self.typed(null);
        self.props.value = parsed;
        self.check(true);
        return true;
      } catch (e) {
        var m = e && (e.getMessage ? e.getMessage() : e.message);
        self.validationError(m && typeof m === 'object' ? (m.detail || m.summary) : (m || 'Enter a valid value.'));
        self.shown(true);
        self.props.valid = 'invalidShown';
        return false;
      }
    };
    self.onBlur = function () { self.focused(false); if (self.commit()) { self.check(true); } return true; };
    self.onKey = function (event) { if (event.key === 'Enter') { self.commit(); } return true; };
    self.clear = function () { self.typed(null); self.props.rawValue = ''; self.props.value = self.props.converter ? null : ''; self.check(true); };
  }
  Composite.register('bx-text-field', {
    view: bx.fieldView('<input class="bx-input" :id="[[id]]" :value="[[text]]" :placeholder="[[$properties.placeholder]]" :disabled="[[$properties.disabled]]"'
      + ' :readonly="[[$properties.readonly]]" :aria-required="[[$properties.required ? \'true\' : null]]" :aria-invalid="[[invalid]]" :aria-describedby="[[describedBy]]"'
      + ' :maxlength="[[maxLength]]" :autocomplete="[[$properties.autocomplete]]" :type="[[$properties.type || \'text\']]" :inputmode="[[$properties.inputmode]]"'
      + ' on-input="[[onInput]]" on-focus="[[onFocus]]" on-blur="[[onBlur]]" on-keydown="[[onKey]]"/>'
      + '<oj-bind-if test="[[showClear()]]"><button type="button" class="bx-clear" aria-label="Clear" on-click="[[clear]]"><span aria-hidden="true">×</span></button></oj-bind-if>'
      + '<oj-bind-if test="[[counter()]]"><span class="bx-counter" aria-hidden="true"><oj-bind-text value="[[counter]]"></oj-bind-text></span></oj-bind-if>'),
    viewModel: TextFieldModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'any', writeback: true }, rawValue: { type: 'string', writeback: true, readOnly: true },
      converter: { type: 'object' }, autocomplete: { type: 'string', value: 'off' }, clearIcon: { type: 'string', value: 'never' }, virtualKeyboard: { type: 'string', value: 'auto' },
      length: { type: 'object', value: {}, properties: { max: { type: 'number' }, countBy: { type: 'string', value: 'codePoint' } } },
      type: { type: 'string', value: 'text' }, inputmode: { type: 'string' } }), methods: METHODS }
  });

  /* ---------- bx-amount: a number with the currency beside it ---------- */
  function AmountModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.typed = ko.observable(null);
    var decimals = function () { return self.props.currency === 'JPY' || self.props.currency === 'KWD' ? (self.props.currency === 'KWD' ? 3 : 0) : 2; };
    self.text = ko.pureComputed(function () {
      if (self.typed() !== null) { return self.typed(); }
      var v = self.props.value;
      if (v === null || v === undefined || v === '') { return ''; }
      if (self.props.converter) { return bx.format(self.props.converter, v); }
      var n = Number(v);
      return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: decimals(), maximumFractionDigits: decimals() }) : String(v);
    });
    self.onInput = function (event) { self.typed(event.target.value); self.props.rawValue = event.target.value; return true; };
    self.commit = function () {
      if (self.typed() === null) { return; }
      var text = self.typed().trim();
      var n = text === '' ? null : self.props.converter ? bx.parse(self.props.converter, text) : Number(text.replace(/[^0-9.-]/g, ''));
      self.typed(null);
      if (n !== null && !Number.isFinite(Number(n))) { self.validationError('Enter an amount, for example 1,250.00.'); self.shown(true); return; }
      self.props.value = n;
      var message = '';
      if (n !== null && self.props.min !== null && self.props.min !== undefined && n < self.props.min) { message = 'Enter at least ' + self.props.min + '.'; }
      if (n !== null && self.props.max !== null && self.props.max !== undefined && n > self.props.max) { message = 'Enter at most ' + self.props.max + '.'; }
      if (message) { self.validationError(message); self.shown(true); self.props.valid = 'invalidShown'; } else { self.check(true); }
    };
    self.onBlur = function () { self.focused(false); self.commit(); return true; };
    self.onKey = function (event) { if (event.key === 'Enter') { self.commit(); } return true; };
  }
  Composite.register('bx-amount', {
    view: bx.fieldView('<oj-bind-if test="[[$properties.currency]]"><span class="bx-affix" aria-hidden="true"><oj-bind-text value="[[$properties.currency]]"></oj-bind-text></span></oj-bind-if>'
      + '<input class="bx-input bx-num" :id="[[id]]" inputmode="decimal" :value="[[text]]" :placeholder="[[$properties.placeholder]]" :disabled="[[$properties.disabled]]"'
      + ' :readonly="[[$properties.readonly]]" :aria-required="[[$properties.required ? \'true\' : null]]" :aria-invalid="[[invalid]]" :aria-describedby="[[describedBy]]"'
      + ' on-input="[[onInput]]" on-focus="[[onFocus]]" on-blur="[[onBlur]]" on-keydown="[[onKey]]"/>', 'bx-control--affix'),
    viewModel: AmountModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'number', writeback: true }, rawValue: { type: 'string', writeback: true, readOnly: true },
      currency: { type: 'string', value: '' }, converter: { type: 'object' }, min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number', value: 1 } }), methods: METHODS }
  });

  /* ---------- bx-select: one value from options or a DataProvider, with search past ten ---------- */
  function SelectModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.loaded = ko.observableArray([]);
    var load = function () {
      if (self.props.data) {
        bx.fromData(self.props.data, self.props.itemText, self.props.optionsKeys && self.props.optionsKeys.value).then(function (list) { self.loaded(list); });
      } else {
        self.loaded(bx.options(self.props.options));
      }
    };
    load();
    self.propertyChanged = function (detail) { if (detail.property === 'options' || detail.property === 'data') { load(); } };
    self.choices = ko.pureComputed(function () {
      return self.loaded().map(function (o, i) { return { index: String(i), label: o.label, disabled: o.disabled, selected: o.value === self.props.value }; });
    });
    self.selectedIndex = ko.pureComputed(function () {
      var at = -1;
      self.loaded().forEach(function (o, i) { if (o.value === self.props.value) { at = i; } });
      return at < 0 ? '' : String(at);
    });
    self.onChange = function (event) {
      var o = event.target.value === '' ? null : self.loaded()[Number(event.target.value)];
      var value = o ? o.value : null;
      self.props.value = value;
      self.props.valueItem = o ? { key: o.value, data: o } : null;
      self.check(true);
      return true;
    };
  }
  Composite.register('bx-select', {
    view: bx.fieldView('<select class="bx-input bx-select" :id="[[id]]" :disabled="[[$properties.disabled || $properties.readonly]]" :aria-required="[[$properties.required ? \'true\' : null]]"'
      + ' :aria-invalid="[[invalid]]" :aria-describedby="[[describedBy]]" on-change="[[onChange]]" on-focus="[[onFocus]]" on-blur="[[onBlur]]">'
      + '<option value="" :selected="[[selectedIndex() === \'\']]"><oj-bind-text value="[[$properties.placeholder || \'Choose\']]"></oj-bind-text></option>'
      + '<oj-bind-for-each data="[[choices]]" as="o"><template><option :value="[[o.data.index]]" :disabled="[[o.data.disabled]]" :selected="[[o.data.selected]]"><oj-bind-text value="[[o.data.label]]"></oj-bind-text></option></template></oj-bind-for-each>'
      + '</select><span class="bx-caret" aria-hidden="true"></span>'),
    viewModel: SelectModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'any', writeback: true }, valueItem: { type: 'object', writeback: true }, options: { type: 'Array<Object>', value: [] },
      optionsKeys: { type: 'object', value: {} }, data: { type: 'object' }, itemText: { type: 'any' }, minimumResultsForSearch: { type: 'number', value: 10 } }), methods: METHODS }
  });

  /* ---------- bx-checkbox-group and bx-choice-group: choices as cards ---------- */
  function ChoiceModel(multiple) {
    return function (context) {
      var self = this;
      bx.fieldState(self, context, function () { return self.props.value; });
      self.name = bx.nextId('bx-choice');
      var current = function () { return multiple ? (Array.isArray(self.props.value) ? self.props.value : []) : self.props.value; };
      self.rows = ko.pureComputed(function () {
        return bx.options(self.props.options).map(function (o, i) {
          var on = multiple ? current().indexOf(o.value) >= 0 : current() === o.value;
          return { id: self.name + '-' + i, label: o.label, disabled: o.disabled || self.props.disabled || self.props.readonly, checked: on,
            css: 'bx-choice' + (on ? ' is-on' : '') + (o.disabled || self.props.disabled ? ' is-disabled' : ''),
            pick: function () {
              if (o.disabled || self.props.disabled || self.props.readonly) { return true; }
              if (multiple) {
                var list = current().slice();
                var at = list.indexOf(o.value);
                if (at >= 0) { list.splice(at, 1); } else { list.push(o.value); }
                self.props.value = list;
              } else {
                self.props.value = o.value;
              }
              self.check(true);
              return true;
            } };
        });
      });
    };
  }
  var choiceView = function (type) {
    return '<fieldset :class="[[fieldCss]]" :aria-describedby="[[describedBy]]" :aria-invalid="[[invalid]]"><oj-bind-if test="[[$properties.labelHint]]"><legend class="bx-label">'
      + '<oj-bind-text value="[[$properties.labelHint]]"></oj-bind-text><oj-bind-if test="[[$properties.required]]"><span class="bx-req" aria-hidden="true"> *</span></oj-bind-if></legend></oj-bind-if>'
      + '<div :class="[[\'bx-choices\' + ($properties.layout === \'horizontal\' ? \' is-row\' : \'\')]]"><oj-bind-for-each data="[[rows]]" as="r"><template>'
      + '<label :class="[[r.data.css]]" :for="[[r.data.id]]"><input type="' + type + '" class="bx-choice-input" :id="[[r.data.id]]" :name="[[name]]" :checked="[[r.data.checked]]" :disabled="[[r.data.disabled]]" on-click="[[r.data.pick]]"/>'
      + '<span class="bx-choice-mark" aria-hidden="true"></span><span class="bx-choice-label"><oj-bind-text value="[[r.data.label]]"></oj-bind-text></span></label></template></oj-bind-for-each></div>'
      + '<oj-bind-if test="[[error()]]"><span class="bx-error" :id="[[id + \'-err\']]" role="alert"><span class="bx-error-icon" aria-hidden="true">!</span><oj-bind-text value="[[error]]"></oj-bind-text></span></oj-bind-if>'
      + '<oj-bind-if test="[[!error() && help()]]"><span class="bx-help" :id="[[id + \'-help\']]"><oj-bind-text value="[[help]]"></oj-bind-text></span></oj-bind-if></fieldset>';
  };
  var choiceMeta = function (multiple) {
    return { properties: extend(bx.FIELD, { value: { type: multiple ? 'Array<any>' : 'any', writeback: true }, options: { type: 'Array<Object>', value: [] }, labelledBy: { type: 'string' },
      layout: { type: 'string', value: 'vertical' } }), methods: METHODS };
  };
  Composite.register('bx-checkbox-group', { view: choiceView('checkbox'), viewModel: ChoiceModel(true), metadata: choiceMeta(true) });
  Composite.register('bx-choice-group', { view: choiceView('radio'), viewModel: ChoiceModel(false), metadata: choiceMeta(false) });

  /* ---------- bx-date: an ISO date (yyyy-mm-dd), the browser's own picker ---------- */
  function DateModel(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.iso = ko.pureComputed(function () { var v = self.props.value; return v ? String(v).slice(0, 10) : ''; });
    self.display = ko.pureComputed(function () { return self.props.converter && self.props.value ? bx.format(self.props.converter, self.props.value) : ''; });
    self.minIso = ko.pureComputed(function () { return self.props.min ? String(self.props.min).slice(0, 10) : null; });
    self.maxIso = ko.pureComputed(function () { return self.props.max ? String(self.props.max).slice(0, 10) : null; });
    self.onChange = function (event) {
      var v = event.target.value || null;
      var message = '';
      if (v && self.props.min && v < String(self.props.min).slice(0, 10)) { message = 'Choose ' + String(self.props.min).slice(0, 10) + ' or later.'; }
      if (v && self.props.max && v > String(self.props.max).slice(0, 10)) { message = 'Choose ' + String(self.props.max).slice(0, 10) + ' or earlier.'; }
      var disabled = self.props.disabledDays;
      if (v && typeof disabled === 'function' && disabled(v)) { message = 'This day cannot be chosen.'; }
      if (v && Array.isArray(disabled) && disabled.indexOf(v) >= 0) { message = 'This day cannot be chosen.'; }
      self.props.value = v;
      if (message) { self.validationError(message); self.shown(true); self.props.valid = 'invalidShown'; } else { self.check(true); }
      return true;
    };
  }
  Composite.register('bx-date', {
    view: bx.fieldView('<input type="date" class="bx-input" :id="[[id]]" :value="[[iso]]" :min="[[minIso]]"'
      + ' :max="[[maxIso]]" :disabled="[[$properties.disabled]]" :readonly="[[$properties.readonly]]"'
      + ' :aria-required="[[$properties.required ? \'true\' : null]]" :aria-invalid="[[invalid]]" :aria-describedby="[[describedBy]]"'
      + ' on-change="[[onChange]]" on-focus="[[onFocus]]" on-blur="[[onBlur]]"/>'
      + '<oj-bind-if test="[[display()]]"><span class="bx-counter" aria-hidden="true"><oj-bind-text value="[[display]]"></oj-bind-text></span></oj-bind-if>'),
    viewModel: DateModel,
    metadata: { properties: extend(bx.FIELD, { value: { type: 'string', writeback: true }, min: { type: 'string' }, max: { type: 'string' }, converter: { type: 'object' },
      disabledDays: { type: 'any' }, pickerAttributes: { type: 'object', value: {} } }), methods: METHODS }
  });

  return {};
});
