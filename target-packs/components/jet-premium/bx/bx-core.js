/*
 * Premium Oracle JET pack (obdx-jet): what every bx- element shares. Works on Oracle JET 6 to 19: elements register
 * with ojs/ojcomposite's register(name, {view, viewModel, metadata}), views use only oj-bind-* and :attr bindings, and
 * no CSS or text loader plugin is needed (bx.css is linked once by the app).
 */
define(['knockout', './bx-variants'], function (ko, VARIANTS) {
  'use strict';
  var seq = 0;

  /** A unique id for the element's inner parts. */
  function nextId(prefix) {
    seq += 1;
    return (prefix || 'bx') + '-' + seq;
  }

  /** Options as [{value, label, disabled}], from strings, objects, or {value, label} lists. */
  function options(list) {
    return (list || []).map(function (o) {
      if (o !== null && typeof o === 'object') {
        return { value: o.value, label: o.label !== undefined ? String(o.label) : String(o.value), disabled: !!o.disabled };
      }
      return { value: o, label: String(o), disabled: false };
    });
  }

  /** Reads a JET DataProvider (fetchFirst) or an array into options; label from itemText (a field name or a function). */
  function fromData(data, itemText, keyAttributes) {
    var text = function (row) {
      if (typeof itemText === 'function') { return String(itemText({ data: row })); }
      if (typeof itemText === 'string' && row && row[itemText] !== undefined) { return String(row[itemText]); }
      return row && row.label !== undefined ? String(row.label) : String(row && row.value !== undefined ? row.value : row);
    };
    var key = function (row) {
      if (keyAttributes && row && row[keyAttributes] !== undefined) { return row[keyAttributes]; }
      return row && row.value !== undefined ? row.value : row;
    };
    if (!data) { return Promise.resolve([]); }
    if (Array.isArray(data)) {
      return Promise.resolve(data.map(function (row) { return { value: key(row), label: text(row), disabled: !!(row && row.disabled) }; }));
    }
    if (typeof data.fetchFirst === 'function') {
      var out = [];
      var iterator = data.fetchFirst({ size: -1 })[Symbol.asyncIterator]();
      var step = function () {
        return iterator.next().then(function (r) {
          if (r.value && r.value.data) {
            r.value.data.forEach(function (row, i) {
              var k = r.value.metadata && r.value.metadata[i] ? r.value.metadata[i].key : key(row);
              out.push({ value: k, label: text(row), disabled: !!(row && row.disabled) });
            });
          }
          return r.done ? out : step();
        });
      };
      return step();
    }
    return Promise.resolve([]);
  }

  /**
   * Runs JET validators on a value: each is an object with validate(value) that throws (JET's way) or a function that
   * returns false or a message. Returns the first message, or ''. A required empty value gives the required message.
   */
  function validate(value, required, validators, label) {
    var empty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (required && empty) {
      return (label ? label + ' is required.' : 'This field is required.');
    }
    if (empty) { return ''; }
    var list = validators || [];
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      try {
        if (v && typeof v.validate === 'function') {
          v.validate(value);
        } else if (typeof v === 'function') {
          var r = v(value);
          if (r === false) { return 'Enter a valid value.'; }
          if (typeof r === 'string' && r) { return r; }
        }
      } catch (e) {
        var m = e && (e.getMessage ? e.getMessage() : e.message);
        if (m && typeof m === 'object') { return m.detail || m.summary || 'Enter a valid value.'; }
        return m || 'Enter a valid value.';
      }
    }
    return '';
  }

  /** The first error among messages-custom ({severity, summary, detail}), or ''. */
  function customMessage(messages) {
    var list = messages || [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m && (m.severity === 'error' || m.severity === 'fatal' || m.severity === undefined)) { return m.detail || m.summary || ''; }
    }
    return '';
  }

  /** Formats a value with a JET converter (format), or as text. */
  function format(converter, value) {
    if (value === null || value === undefined || value === '') { return ''; }
    if (converter && typeof converter.format === 'function') {
      try { return String(converter.format(value)); } catch (e) { return String(value); }
    }
    return String(value);
  }

  /** Parses text with a JET converter (parse); throws the converter's error. */
  function parse(converter, text) {
    if (converter && typeof converter.parse === 'function') { return converter.parse(text); }
    return text;
  }

  /** The help text: help.instruction (JET) or help-hints.definition. */
  function helpText(props) {
    var help = props.help || {};
    var hints = props.helpHints || {};
    return help.instruction || hints.definition || '';
  }

  /** Properties every field takes, with the JET names. */
  var FIELD = {
    labelHint: { type: 'string', value: '' },
    labelEdge: { type: 'string', value: 'inside' },
    placeholder: { type: 'string', value: '' },
    required: { type: 'boolean', value: false },
    disabled: { type: 'boolean', value: false },
    readonly: { type: 'boolean', value: false },
    validators: { type: 'Array<Object>', value: [] },
    asyncValidators: { type: 'Array<Object>', value: [] },
    messagesCustom: { type: 'Array<Object>', value: [], writeback: true },
    help: { type: 'object', value: {}, properties: { instruction: { type: 'string', value: '' } } },
    helpHints: { type: 'object', value: {}, properties: { definition: { type: 'string', value: '' }, source: { type: 'string', value: '' } } },
    displayOptions: { type: 'object', value: {} },
    valid: { type: 'string', value: 'valid', writeback: true, readOnly: true }
  };

  /** The shell of a field: a floating label, the control (inner), help and error. */
  function fieldView(inner, extraClass) {
    return '<div :class="[[fieldCss]]">'
      + '<oj-bind-if test="[[$properties.labelHint && $properties.labelEdge !== \'none\']]"><label class="bx-label" :for="[[id]]" :id="[[id + \'-label\']]">'
      + '<oj-bind-text value="[[$properties.labelHint]]"></oj-bind-text><oj-bind-if test="[[$properties.required]]"><span class="bx-req" aria-hidden="true"> *</span></oj-bind-if></label></oj-bind-if>'
      + '<div class="bx-control ' + (extraClass || '') + '">' + inner + '</div>'
      + '<oj-bind-if test="[[error()]]"><span class="bx-error" :id="[[id + \'-err\']]" role="alert"><span class="bx-error-icon" aria-hidden="true">!</span><oj-bind-text value="[[error]]"></oj-bind-text></span></oj-bind-if>'
      + '<oj-bind-if test="[[!error() && help()]]"><span class="bx-help" :id="[[id + \'-help\']]"><oj-bind-text value="[[help]]"></oj-bind-text></span></oj-bind-if>'
      + '</div>';
  }

  /** Field state shared by every field view model: error, help, css, and validate/reset/showMessages. */
  function fieldState(vm, context, getValue) {
    vm.props = context.properties;
    vm.element = context.element;
    vm.id = nextId('bx-field');
    vm.shown = ko.observable(false);
    vm.validationError = ko.observable('');
    vm.focused = ko.observable(false);
    vm.error = ko.pureComputed(function () { return customMessage(vm.props.messagesCustom) || (vm.shown() ? vm.validationError() : ''); });
    vm.help = ko.pureComputed(function () { return helpText(vm.props); });
    vm.describedBy = ko.pureComputed(function () { return vm.error() ? vm.id + '-err' : vm.help() ? vm.id + '-help' : null; });
    vm.invalid = ko.pureComputed(function () { return vm.error() ? 'true' : null; });
    vm.fieldCss = ko.pureComputed(function () {
      return 'bx-field' + (vm.error() ? ' is-error' : '') + (vm.focused() ? ' is-focus' : '') + (vm.props.disabled ? ' is-disabled' : '') + (vm.props.readonly ? ' is-readonly' : '');
    });
    vm.check = function (show) {
      var message = validate(getValue(), vm.props.required, vm.props.validators, vm.props.labelHint);
      vm.validationError(message);
      if (show) { vm.shown(true); }
      vm.props.valid = message ? (vm.shown() ? 'invalidShown' : 'invalidHidden') : 'valid';
      return message;
    };
    vm.validate = function () { return Promise.resolve(vm.check(true) ? 'invalid' : 'valid'); };
    vm.showMessages = function () { vm.check(true); };
    vm.reset = function () { vm.shown(false); vm.validationError(''); vm.props.valid = 'valid'; };
    // Like the JET fields, valid is known from the start: invalidHidden for an empty required field, without showing it
    vm.bindingsApplied = function () { vm.check(false); };
    vm.onFocus = function () { vm.focused(true); return true; };
    vm.onBlur = function () { vm.focused(false); vm.check(true); return true; };
  }

  /** Dispatches a JET-style event (ojAction, ojClose ...) from an element. */
  function fire(element, name, detail) {
    element.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail || {} }));
  }

  /** Puts bx-<kind>--<variant> on the element for a variant it takes, and takes off the one before. */
  function applyVariant(element, kind, ids, variant) {
    if (!element || !element.classList) { return; }
    ids.forEach(function (v) { element.classList.remove('bx-' + kind + '--' + v); });
    if (variant && ids.indexOf(variant) >= 0) { element.classList.add('bx-' + kind + '--' + variant); }
  }

  /**
   * Wraps ojs/ojcomposite so every element in the variant table (bx-variants, from variants/*.json) takes a variant
   * property: an empty variant keeps the pack's own look; the others add bx-<kind>--<variant> to the element.
   */
  function withVariants(Composite) {
    return { register: function (name, descriptor) {
      var entry = VARIANTS[name];
      if (!entry) { return Composite.register(name, descriptor); }
      var kind = entry[0];
      var ids = entry[1];
      var metadata = Object.assign({}, descriptor.metadata);
      metadata.properties = Object.assign({}, metadata.properties, { variant: { type: 'string', value: '', enumValues: [''].concat(ids) } });
      var Model = descriptor.viewModel;
      var Wrapped = function (context) {
        var vm = Model ? new Model(context) : {};
        var changed = vm.propertyChanged;
        applyVariant(context.element, kind, ids, context.properties.variant);
        vm.propertyChanged = function (detail) {
          if (detail.property === 'variant') { applyVariant(context.element, kind, ids, detail.value); }
          return changed ? changed.apply(vm, arguments) : undefined;
        };
        return vm;
      };
      return Composite.register(name, Object.assign({}, descriptor, { viewModel: Wrapped, metadata: metadata }));
    } };
  }

  return { nextId: nextId, options: options, fromData: fromData, validate: validate, customMessage: customMessage, format: format, parse: parse,
    helpText: helpText, FIELD: FIELD, fieldView: fieldView, fieldState: fieldState, fire: fire, ko: ko,
    variants: VARIANTS, withVariants: withVariants };
});
