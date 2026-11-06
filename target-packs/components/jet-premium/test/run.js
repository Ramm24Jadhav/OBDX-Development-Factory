/*
 * Tests of the premium JET pack's elements, with Node alone: a small AMD loader, a stand-in for ojs/ojcomposite that
 * keeps each registration, and Knockout from the factory UI's node_modules (or KNOCKOUT=<path>). The view models run as
 * JET runs them; the views are checked for the markup accessibility needs (labels, names, roles, scopes). Rendering in a
 * browser (axe, visuals) is a separate gate.
 *   node target-packs/components/jet-premium/test/run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BX = path.join(__dirname, '..', 'bx');
const koPath = process.env.KNOCKOUT || path.join(__dirname, '..', '..', '..', '..', 'factory-ui', 'node_modules', 'knockout', 'build', 'output', 'knockout-latest.js');
const ko = require(koPath);
const registry = {};
const timers = [];
global.window = { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) { timers[id - 1].fn = null; } } };
global.document = { activeElement: null };
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; this.cancelable = !!(init || {}).cancelable; this.defaultPrevented = false; }
  preventDefault() { if (this.cancelable) { this.defaultPrevented = true; } } };

const modules = {};
function load(file) {
  if (modules[file]) { return modules[file]; }
  const source = fs.readFileSync(file, 'utf8');
  let result;
  const define = (deps, factory) => {
    const args = deps.map((d) => {
      if (d === 'knockout') { return ko; }
      if (d === 'ojs/ojcomposite') { return { register: (name, descriptor) => { registry[name] = descriptor; } }; }
      return load(path.join(path.dirname(file), d.replace(/^\.\//, '') + '.js'));
    });
    result = factory.apply(null, args);
  };
  new Function('define', source)(define);
  modules[file] = result;
  return result;
}
load(path.join(BX, 'bx.js'));

/** A view model with the element's metadata defaults, the given properties, and a fake element that keeps its events. */
function create(name, props) {
  const d = registry[name];
  const properties = {};
  Object.keys(d.metadata.properties || {}).forEach((k) => {
    const v = d.metadata.properties[k].value;
    properties[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  });
  Object.assign(properties, props || {});
  // JET backs a composite's properties with observables, so the view models' computeds follow them
  const backed = {};
  Object.keys(properties).concat(Object.keys(d.metadata.properties || {})).forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(backed, k)) { return; }
    const o = ko.observable(properties[k]);
    Object.defineProperty(backed, k, { get: () => o(), set: (v) => o(v), enumerable: true });
  });
  Object.keys(properties).forEach((k) => { backed[k] = properties[k]; });
  const events = [];
  const element = { dispatchEvent: (e) => { events.push(e); return !e.defaultPrevented; }, querySelector: () => null, querySelectorAll: () => [] };
  const vm = new d.viewModel({ properties: backed, element: element });
  return { vm, props: backed, events, view: d.view };
}

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; } catch (e) { failures.push(name + ': ' + e.message); }
}
function eq(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { throw new Error((what || 'value') + ' was ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected)); }
}
const input = (value) => ({ target: { value: value } });

const FOUNDATION = ['bx-button', 'bx-icon-button', 'bx-text-field', 'bx-amount', 'bx-select', 'bx-checkbox-group', 'bx-choice-group', 'bx-date', 'bx-dialog', 'bx-toast', 'bx-card', 'bx-tabs', 'bx-data-grid'];
const FORMS = ['bx-text-area', 'bx-password', 'bx-number-input', 'bx-currency-picker', 'bx-multi-select', 'bx-switch', 'bx-date-range', 'bx-search', 'bx-autocomplete', 'bx-document-upload'];
const ELEMENTS = FOUNDATION.concat(FORMS);
test('every foundation and forms element registers', () => eq(ELEMENTS.filter((e) => !registry[e]), [], 'missing'));
test('bx.js lists every element', () => eq(load(path.join(BX, 'bx.js')).elements, ELEMENTS, 'elements'));

test('bx-text-field: raw-value as typed, value on blur, required and JET validators', () => {
  const t = create('bx-text-field', { labelHint: 'Beneficiary name', required: true,
    validators: [{ validate: (v) => { if (v.length > 5) { throw new Error('Up to 5 characters.'); } } }] });
  t.vm.onInput(input('Asha'));
  eq(t.props.rawValue, 'Asha', 'raw-value');
  eq(t.props.value, undefined, 'value before blur');
  t.vm.onBlur();
  eq(t.props.value, 'Asha', 'value after blur');
  eq(t.vm.error(), '', 'no error');
  t.vm.onInput(input('Asha Sharma'));
  t.vm.onKey({ key: 'Enter' });
  eq(t.vm.error(), 'Up to 5 characters.', 'validator message');
  eq(t.props.valid, 'invalidShown', 'valid');
  t.vm.clear();
  eq(t.vm.error(), 'Beneficiary name is required.', 'required message');
  t.vm.reset();
  eq(t.props.valid, 'valid', 'valid after reset');
});
test('bx-text-field: a converter formats and parses; messages-custom wins', () => {
  const converter = { format: (v) => v.toUpperCase(), parse: (s) => { if (s === 'bad') { throw { getMessage: () => ({ summary: 'Not a code' }) }; } return s.toLowerCase(); } };
  const t = create('bx-text-field', { value: 'abc', converter: converter });
  eq(t.vm.text(), 'ABC', 'formatted');
  t.vm.onInput(input('XYZ'));
  t.vm.onBlur();
  eq(t.props.value, 'xyz', 'parsed');
  t.vm.onInput(input('bad'));
  t.vm.onBlur();
  eq(t.vm.error(), 'Not a code', 'converter error');
  t.props.messagesCustom = [{ severity: 'error', summary: 'Server says no' }];
  eq(t.vm.error(), 'Server says no', 'custom message');
});
test('bx-amount: number value, min and max', () => {
  const a = create('bx-amount', { currency: 'INR', min: 1, max: 100000 });
  a.vm.onInput(input('1,250.5'));
  a.vm.onBlur();
  eq(a.props.value, 1250.5, 'value');
  eq(a.vm.text(), (1250.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'two decimals');
  a.vm.onInput(input('0'));
  a.vm.onBlur();
  eq(a.vm.error(), 'Enter at least 1.', 'min');
});
test('bx-select: options and value-item', () => {
  const s = create('bx-select', { options: [{ value: 'S1', label: 'Savings' }, { value: 'C1', label: 'Current' }], value: 'C1' });
  eq(s.vm.selectedIndex(), '1', 'selected');
  s.vm.onChange(input('0'));
  eq(s.props.value, 'S1', 'value');
  eq(s.props.valueItem.key, 'S1', 'value item');
  s.vm.onChange(input(''));
  eq(s.props.value, null, 'cleared');
});
test('bx-checkbox-group and bx-choice-group: toggling', () => {
  const c = create('bx-checkbox-group', { options: ['Email', 'SMS'], value: [] });
  c.vm.rows()[0].pick();
  c.vm.rows()[1].pick();
  eq(c.props.value, ['Email', 'SMS'], 'two on');
  c.vm.rows()[0].pick();
  eq(c.props.value, ['SMS'], 'one off');
  const r = create('bx-choice-group', { options: [{ value: 'own', label: 'Own account' }, { value: 'other', label: 'Another bank' }], value: 'own' });
  r.vm.rows()[1].pick();
  eq(r.props.value, 'other', 'radio');
  const d = create('bx-choice-group', { options: ['a'], disabled: true, value: null });
  d.vm.rows()[0].pick();
  eq(d.props.value, null, 'disabled');
});
test('bx-date: ISO value, min and disabled days', () => {
  const d = create('bx-date', { min: '2026-11-01', disabledDays: ['2026-11-15'] });
  d.vm.onChange(input('2026-10-31'));
  eq(d.vm.error(), 'Choose 2026-11-01 or later.', 'min');
  d.vm.onChange(input('2026-11-15'));
  eq(d.vm.error(), 'This day cannot be chosen.', 'disabled day');
  d.vm.onChange(input('2026-11-12'));
  eq([d.props.value, d.vm.error()], ['2026-11-12', ''], 'ok');
});
test('bx-button: ojAction unless disabled', () => {
  const b = create('bx-button', { label: 'Pay' });
  b.vm.press(null, {});
  eq(b.events.map((e) => e.type), ['ojAction'], 'events');
  b.props.disabled = true;
  b.vm.press(null, {});
  eq(b.events.length, 1, 'no event when disabled');
  eq(create('bx-button', { chroming: 'outlined' }).vm.css(), 'bx-btn bx-btn--outlined', 'chroming');
});
test('bx-dialog: open, Escape closes, ojBeforeClose can stop it, cancel-behavior none keeps it', () => {
  const d = create('bx-dialog', { dialogTitle: 'Confirm' });
  d.vm.open();
  eq(d.vm.isOpen(), true, 'open');
  d.vm.onKey(null, { key: 'Escape', preventDefault: () => {} });
  eq(d.vm.isOpen(), false, 'closed by Escape');
  eq(d.events.map((e) => e.type), ['ojOpen', 'ojBeforeClose', 'ojClose'], 'events');
  d.vm.open();
  d.element = null;
  const stop = create('bx-dialog', {});
  stop.vm.open();
  const original = stop.vm.element.dispatchEvent;
  stop.vm.element.dispatchEvent = (e) => { if (e.type === 'ojBeforeClose') { e.preventDefault(); } return original(e); };
  stop.vm.close();
  eq(stop.vm.isOpen(), true, 'kept open');
  const fixed = create('bx-dialog', { cancelBehavior: 'none' });
  fixed.vm.open();
  fixed.vm.onKey(null, { key: 'Escape', preventDefault: () => {} });
  eq(fixed.vm.isOpen(), true, 'Escape ignored');
});
test('bx-toast: messages, errors stay, others close on time', () => {
  timers.length = 0;
  const t = create('bx-toast', { messages: [{ severity: 'confirmation', summary: 'Saved' }, { severity: 'error', summary: 'Failed', detail: 'Try again' }] });
  eq(t.vm.items().map((i) => [i.summary, i.role]), [['Saved', 'status'], ['Failed', 'alert']], 'items');
  eq(timers.filter((x) => x.fn).map((x) => x.ms), [5000], 'one timer');
  timers[0].fn();
  eq(t.vm.items().map((i) => i.summary), ['Failed'], 'after the timer');
  t.vm.items()[0].close();
  eq(t.events.map((e) => e.type), ['ojClose', 'ojClose'], 'closed');
});
test('bx-tabs: selection, keys skip disabled tabs', () => {
  const t = create('bx-tabs', { options: [{ id: 'a', label: 'Current' }, { id: 'b', label: 'Savings', disabled: true }, { id: 'c', label: 'Deposits' }], selection: 'a' });
  t.vm.onKey(null, { key: 'ArrowRight', preventDefault: () => {} });
  eq(t.props.selection, 'c', 'skips the disabled tab');
  t.vm.onKey(null, { key: 'Home', preventDefault: () => {} });
  eq(t.props.selection, 'a', 'home');
  eq(t.vm.tabs().map((x) => x.selected), ['true', 'false', 'false'], 'aria-selected');
});
test('bx-data-grid: sort by a column, select rows', () => {
  const g = create('bx-data-grid', { data: [{ id: 1, name: 'Rent', amount: 900 }, { id: 2, name: 'Coffee', amount: 4 }, { id: 3, name: 'Books', amount: 40 }],
    columns: [{ headerText: 'Name', field: 'name' }, { headerText: 'Amount', field: 'amount', style: 'text-align:right' }], keyAttributes: 'id', selectionMode: { row: 'multiple' } });
  g.vm.columns()[1].toggle();
  eq(g.vm.rows().map((r) => r.key), [2, 3, 1], 'ascending');
  g.vm.columns()[1].toggle();
  eq(g.vm.rows().map((r) => r.key), [1, 3, 2], 'descending');
  eq(g.vm.columns()[1].sort, 'descending', 'aria-sort');
  g.vm.rows()[0].toggle();
  g.vm.rows()[1].toggle();
  eq(g.props.selected.row, [1, 3], 'selected');
  eq(g.events.map((e) => e.detail.direction), ['ascending', 'descending'], 'ojSort');
  eq(create('bx-data-grid', { data: [] }).vm.empty(), true, 'empty');
});

// ---------- The forms wave ----------
const key = (k) => ({ key: k, preventDefault: () => {} });
test('bx-text-area: value on blur, length.max counter', () => {
  const t = create('bx-text-area', { labelHint: 'Remarks', length: { max: 100 } });
  t.vm.onInput(input('Rent\nNovember'));
  eq(t.props.rawValue, 'Rent\nNovember', 'raw-value');
  eq(t.vm.counter(), '13 / 100', 'counter');
  t.vm.onBlur();
  eq(t.props.value, 'Rent\nNovember', 'value');
  const r = create('bx-text-area', { labelHint: 'Reason', required: true });
  r.vm.onInput(input(''));
  r.vm.onBlur();
  eq(r.vm.error(), 'Reason is required.', 'required');
});
test('bx-password: masked, Show and Hide with aria-pressed, mask-icon hidden', () => {
  const p = create('bx-password', { labelHint: 'Password', value: 's3cret', autocomplete: 'new-password' });
  eq(p.vm.type(), 'password', 'masked');
  eq(p.vm.revealLabel(), 'Show Password', 'label');
  p.vm.toggle();
  eq([p.vm.type(), p.vm.pressed(), p.vm.revealLabel()], ['text', 'true', 'Hide Password'], 'shown');
  eq(create('bx-password', { maskIcon: 'hidden' }).vm.canReveal(), false, 'mask-icon hidden');
  if (!/:autocomplete="\[\[\$properties\.autocomplete\]\]"/.test(p.view)) { throw new Error('autocomplete not bound'); }
});
test('bx-number-input: steps, arrow keys, min and max, not a number', () => {
  const n = create('bx-number-input', { labelHint: 'Copies', value: 2, min: 1, max: 3 });
  n.vm.up();
  eq(n.props.value, 3, 'up');
  eq(n.vm.atMax(), true, 'at max');
  n.vm.up();
  eq(n.props.value, 3, 'stays at max');
  n.vm.onKey(key('ArrowDown'));
  eq(n.props.value, 2, 'arrow down');
  n.vm.onInput(input('abc'));
  n.vm.onBlur();
  eq(n.vm.error(), 'Enter a number.', 'not a number');
  n.vm.onInput(input('9'));
  n.vm.onBlur();
  eq([n.vm.error(), n.props.value], ['Enter 3 or less.', 2], 'max');
  eq(create('bx-number-input', { step: 0.5, value: 1 }).vm.up() || undefined, undefined, 'step');
});
test('bx-currency-picker: code with its name, own list', () => {
  const c = create('bx-currency-picker', { labelHint: 'Currency' });
  c.vm.onChange(input('EUR'));
  eq([c.props.value, c.vm.name()], ['EUR', 'Euro'], 'picked');
  eq(c.vm.choices().filter((o) => o.selected).map((o) => o.text), ['EUR · Euro'], 'selected option');
  eq(create('bx-currency-picker', { currencies: [{ value: 'OMR', label: 'Omani rial' }] }).vm.choices().length, 1, 'own currencies');
});
test('bx-multi-select: keyboard picks, chips, Backspace and remove', () => {
  const options = [{ value: 'S', label: 'Savings' }, { value: 'C', label: 'Current' }, { value: 'D', label: 'Deposits' }];
  const m = create('bx-multi-select', { labelHint: 'Accounts', options: options });
  m.vm.onFocus();
  m.vm.onKey(key('ArrowDown'));
  eq(m.vm.activeId(), m.vm.listId + '-0', 'active descendant');
  m.vm.onKey(key('Enter'));
  eq(m.props.value, ['S'], 'first');
  m.vm.onInput(input('dep'));
  eq(m.vm.rows().map((r) => r.label), ['Deposits'], 'filtered');
  m.vm.onKey(key('ArrowDown'));
  m.vm.onKey(key('Enter'));
  eq(m.props.value, ['S', 'D'], 'second');
  eq(m.vm.chips().map((c) => c.remove), ['Remove Savings', 'Remove Deposits'], 'chip names');
  m.vm.chips()[0].drop();
  eq(m.props.value, ['D'], 'removed');
  m.vm.onKey(key('Backspace'));
  eq(m.props.value, [], 'backspace');
  m.vm.onKey(key('Escape'));
  eq(m.vm.expanded(), 'false', 'closed');
});
test('bx-switch: role switch, flips, read only stays', () => {
  const s = create('bx-switch', { labelHint: 'Paperless statements' });
  eq(s.vm.checked(), 'false', 'off');
  s.vm.flip();
  eq([s.props.value, s.vm.checked()], [true, 'true'], 'on');
  const r = create('bx-switch', { value: true, readonly: true });
  r.vm.flip();
  eq(r.props.value, true, 'read only');
  if (!/role="switch"/.test(s.view) || !/:aria-checked="\[\[checked\]\]"/.test(s.view)) { throw new Error('switch role'); }
});
test('bx-date-range: end before start, max-days, both written', () => {
  const d = create('bx-date-range', { labelHint: 'Statement period', maxDays: 31 });
  d.vm.onFrom(input('2026-10-10'));
  d.vm.onTo(input('2026-10-01'));
  eq(d.vm.error(), 'The end date is before the start date.', 'order');
  d.vm.onTo(input('2026-12-01'));
  eq(d.vm.error(), 'Choose at most 31 days.', 'max-days');
  d.vm.onTo(input('2026-10-31'));
  eq([d.vm.error(), d.props.value, d.props.valid], ['', { from: '2026-10-10', to: '2026-10-31' }, 'valid'], 'range');
  eq(d.vm.toMin(), '2026-10-10', 'to min');
});
test('bx-search: Enter fires ojSearch, Escape and Clear empty it', () => {
  const s = create('bx-search', { labelHint: 'Search transactions', value: 'rent' });
  s.vm.onKey(key('Enter'));
  eq(s.events.map((e) => [e.type, e.detail.value]), [['ojSearch', 'rent']], 'ojSearch');
  s.vm.onKey(key('Escape'));
  eq(s.props.value, '', 'escape');
  s.vm.onInput(input('atm'));
  s.vm.clear();
  eq(s.props.value, '', 'clear');
  if (!/role="search"/.test(s.view) || !/type="search"/.test(s.view)) { throw new Error('search landmark'); }
});
test('bx-autocomplete: suggestions, arrows and Enter pick, a choice is required unless free-text', () => {
  const payees = [{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }];
  const a = create('bx-autocomplete', { labelHint: 'Payee', options: payees });
  a.vm.onInput(input('asha'));
  eq(a.vm.rows().map((r) => r.label), ['Asha Sharma', 'Asha Patel'], 'suggestions');
  a.vm.onKey(key('ArrowDown'));
  a.vm.onKey(key('ArrowDown'));
  eq(a.vm.activeId(), a.vm.listId + '-1', 'active');
  a.vm.onKey(key('Enter'));
  eq([a.props.value, a.vm.text()], ['P3', 'Asha Patel'], 'picked');
  a.vm.onInput(input('Nobody'));
  a.vm.onBlur();
  eq(a.vm.error(), 'Choose one of the suggestions.', 'no match');
  const f = create('bx-autocomplete', { options: payees, freeText: true });
  f.vm.onInput(input('Nobody'));
  f.vm.onBlur();
  eq(f.props.value, 'Nobody', 'free text');
});
test('bx-document-upload: accept and max-size, ojSelect and ojInvalidSelect, remove', () => {
  const u = create('bx-document-upload', { labelHint: 'Proof of address', accept: ['.pdf', 'image/*'], maxSize: 1048576 });
  u.vm.add([{ name: 'statement.pdf', type: 'application/pdf', size: 4 }]);
  eq([u.props.value.map((f) => f.name), u.vm.rows()[0].size], [['statement.pdf'], '4 B'], 'added');
  u.vm.add([{ name: 'setup.exe', type: 'application/octet-stream', size: 2 }]);
  eq(u.vm.error(), 'setup.exe is not a file type this accepts (.pdf, image/*).', 'type');
  u.vm.add([{ name: 'scan.png', type: 'image/png', size: 3145728 }]);
  eq(u.vm.error(), 'scan.png is larger than 1.0 MB.', 'size');
  eq(u.events.map((e) => e.type), ['ojSelect', 'ojInvalidSelect', 'ojInvalidSelect'], 'events');
  u.vm.rows()[0].drop();
  eq(u.props.value, [], 'removed');
  const many = create('bx-document-upload', { selectionMode: 'multiple' });
  many.vm.add([{ name: 'a.pdf', size: 1 }]);
  many.vm.add([{ name: 'b.pdf', size: 1 }]);
  eq(many.props.value.length, 2, 'multiple');
});
test('forms fields tie their label and messages to the control', () => {
  ['bx-text-area', 'bx-password', 'bx-number-input', 'bx-currency-picker', 'bx-multi-select', 'bx-search', 'bx-autocomplete'].forEach((e) => {
    const v = registry[e].view;
    if (!/<label class="bx-label" :for="\[\[id\]\]"/.test(v)) { throw new Error(e + ': no label for the control'); }
    if (!/:aria-describedby="\[\[describedBy\]\]"/.test(v) || !/:aria-invalid="\[\[invalid\]\]"/.test(v)) { throw new Error(e + ': messages not tied'); }
  });
  ['bx-multi-select', 'bx-autocomplete'].forEach((e) => { if (!/role="combobox"/.test(registry[e].view) || !/role="listbox"/.test(registry[e].view)) { throw new Error(e + ': combobox roles'); } });
  if (!/<fieldset/.test(registry['bx-date-range'].view) || !/<legend/.test(registry['bx-date-range'].view)) { throw new Error('date range: no fieldset'); }
});

// The markup accessibility needs, in every view
const views = ELEMENTS.map((e) => [e, registry[e] ? registry[e].view : '']);
test('every button in a view has type="button" and a name', () => {
  const bad = [];
  views.forEach(([e, v]) => (v.match(/<button\b[^>]*>/g) || []).forEach((b) => { if (!/type="button"/.test(b)) { bad.push(e + ': ' + b.slice(0, 50)); } }));
  eq(bad, [], 'buttons without type');
  if (!/:aria-label="\[\[\$properties\.label\]\]"/.test(registry['bx-icon-button'].view)) { throw new Error('the icon button has no name'); }
});
test('fields tie their label and messages to the control', () => {
  ['bx-text-field', 'bx-amount', 'bx-select', 'bx-date'].forEach((e) => {
    const v = registry[e].view;
    if (!/<label class="bx-label" :for="\[\[id\]\]"/.test(v)) { throw new Error(e + ': no label for the control'); }
    if (!/:aria-describedby="\[\[describedBy\]\]"/.test(v) || !/:aria-invalid="\[\[invalid\]\]"/.test(v)) { throw new Error(e + ': messages not tied'); }
    if (!/role="alert"/.test(v)) { throw new Error(e + ': errors not announced'); }
  });
  ['bx-checkbox-group', 'bx-choice-group'].forEach((e) => { if (!/<fieldset/.test(registry[e].view) || !/<legend/.test(registry[e].view)) { throw new Error(e + ': no fieldset and legend'); } });
});
test('dialog, tabs, grid and toasts have their roles', () => {
  if (!/role="dialog" aria-modal="true"/.test(registry['bx-dialog'].view)) { throw new Error('dialog role'); }
  if (!/role="tablist"/.test(registry['bx-tabs'].view) || !/role="tab"/.test(registry['bx-tabs'].view)) { throw new Error('tab roles'); }
  if (!/<th scope="col"/.test(registry['bx-data-grid'].view) || !/:aria-sort=/.test(registry['bx-data-grid'].view)) { throw new Error('grid headers'); }
  if (!/:role="\[\[t\.data\.role\]\]"/.test(registry['bx-toast'].view)) { throw new Error('toast live roles'); }
});
test('a view model value joined with text in a binding is called, not used bare (it would print the function)', () => {
  const bad = [];
  views.forEach(([e, v]) => (v.match(/\[\[[^\]]*\]\]/g) || []).filter((x) => x.includes('+')).forEach((x) => {
    const bare = x.slice(2, -2).replace(/\\?'[^']*\\?'/g, "''").match(/(^|[^.\w$])([A-Za-z_]\w*)\b(?!\s*[(.])/g) || [];
    bare.map((t) => t.replace(/^[^A-Za-z_]/, '')).filter((t) => !['id', 'name', 'true', 'false', 'null', 'undefined'].includes(t)).forEach((t) => bad.push(e + ': ' + x));
  }));
  eq(bad, [], 'bare view model values joined with text');
});

test('views use only bindings JET 6 has (no function literals, no new, no $parent)', () => {
  const bad = views.filter(([, v]) => /\[\[[^\]]*(function\s*\(|=>|\bnew\s|\$parent)/.test(v)).map(([e]) => e);
  eq(bad, [], 'views with bindings JET cannot run');
});

const css = fs.readFileSync(path.join(BX, 'bx.css'), 'utf8');
test('the skin has every design option and motion of the component style', () => {
  const need = ['elevated', 'soft', 'glass', 'outline', 'vivid', 'pill', 'brutal', 'redwood'].filter((l) => l !== 'elevated').map((l) => '.bx-look-' + l)
    .concat(['lift', 'glow', 'shine'].map((m) => '.bx-motion-hover-' + m), ['press', 'ripple', 'bounce'].map((m) => '.bx-motion-click-' + m),
      ['fadeup', 'scale', 'slide', 'blur'].map((m) => '.bx-motion-scroll-' + m), ['.bx-dark', 'prefers-reduced-motion']);
  eq(need.filter((n) => css.indexOf(n) < 0), [], 'missing in bx.css');
});

console.log('Premium JET pack: ' + passed + ' passed' + (failures.length ? ', ' + failures.length + ' failed' : '') + '.');
failures.forEach((f) => console.log('  FAILED ' + f));
if (process.argv.indexOf('--json') > 0) { fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ passed: passed, failed: failures }, null, 2)); }
process.exit(failures.length ? 1 : 0);
