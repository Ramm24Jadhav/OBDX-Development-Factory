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
const G1 = ['bx-secondary-button', 'bx-danger-button', 'bx-savings-slider', 'bx-segmented', 'bx-filter-chips', 'bx-action-menu', 'bx-accordion', 'bx-stepper', 'bx-breadcrumb',
  'bx-side-nav', 'bx-sheet', 'bx-grid', 'bx-divider', 'bx-avatar', 'bx-pagination', 'bx-status-badge', 'bx-timeline', 'bx-spinner', 'bx-skeleton', 'bx-empty-state', 'bx-tooltip',
  'bx-alert-banner', 'bx-error-message', 'bx-success-message', 'bx-notification-panel'];
const G2 = ['bx-account-picker', 'bx-account-summary', 'bx-balance-card', 'bx-account-card', 'bx-account-details', 'bx-iban', 'bx-quick-actions', 'bx-payee-list',
  'bx-beneficiary-card', 'bx-payment-form', 'bx-transfer-summary', 'bx-payment-status', 'bx-transaction-list', 'bx-transaction-filter', 'bx-transaction-details', 'bx-repeat',
  'bx-receipt', 'bx-upcoming-bills', 'bx-td-summary', 'bx-new-td', 'bx-maturity-instructions', 'bx-td-topup', 'bx-td-redemption'];
const G3 = ['bx-loan-summary', 'bx-loan-repayment', 'bx-loan-schedule', 'bx-promise-to-pay', 'bx-disbursement', 'bx-card-tile', 'bx-card-list', 'bx-activate-card',
  'bx-convert-emi', 'bx-redeem-points', 'bx-spend-limit', 'bx-card-controls', 'bx-block-card', 'bx-reset-pin', 'bx-raise-dispute', 'bx-add-on-card', 'bx-card-statements', 'bx-otp',
  'bx-biometric', 'bx-session-timeout', 'bx-secure-confirmation', 'bx-sensitive', 'bx-kyc-steps', 'bx-fraud-alert'];
const G4 = ['bx-spending-chart', 'bx-budget-progress', 'bx-savings-goal', 'bx-spend-categories', 'bx-approval-queue', 'bx-approval-detail', 'bx-approval-journey', 'bx-reroute',
  'bx-modification-requested', 'bx-pending-release', 'bx-structure-type', 'bx-account-structure', 'bx-structure-simulation', 'bx-intercompany-limits', 'bx-sweep-monitor', 'bx-profile',
  'bx-sign-in-options', 'bx-otp-delivery', 'bx-devices', 'bx-appearance', 'bx-language', 'bx-alerts-subscription', 'bx-do-not-disturb', 'bx-consents', 'bx-transaction-limits',
  'bx-session-summary'];
const G5 = ['bx-raise-request', 'bx-track-requests', 'bx-mailbox', 'bx-compose-mail', 'bx-e-receipts', 'bx-certificates', 'bx-statement-request', 'bx-statement-format',
  'bx-self-register', 'bx-fatca-crs', 'bx-product-showcase', 'bx-application-tracker', 'bx-terms-consent', 'bx-loan-calculator', 'bx-eligibility-calculator', 'bx-td-calculator',
  'bx-currency-converter', 'bx-goal-calculator', 'bx-locator', 'bx-live-chat', 'bx-feedback', 'bx-nominations', 'bx-faq'];
const G6 = ['bx-overview', 'bx-quick-insights', 'bx-recent-transactions', 'bx-bills-widget', 'bx-spend-analysis', 'bx-goals', 'bx-budgets', 'bx-calculators', 'bx-credit-score',
  'bx-rewards', 'bx-financial-advisor', 'bx-special-offers', 'bx-credit-cards-overview', 'bx-loans-overview', 'bx-delinquency-notice', 'bx-financial-overview', 'bx-position-by-currency',
  'bx-credit-line-usage', 'bx-bills-receivable-payable', 'bx-trade-instruments', 'bx-reports', 'bx-accounts-corp', 'bx-corporate-limits', 'bx-transactions-widget', 'bx-last-5-payments',
  'bx-bulk-file-upload', 'bx-quick-links-corp', 'bx-work-snapshot', 'bx-notifications-widget', 'bx-pending-for-action', 'bx-my-limits', 'bx-pending-approvals'];
const GROUPS = [G1, G2, G3, G4, G5, G6];
const ELEMENTS = FOUNDATION.concat(FORMS, ...GROUPS);
test('every foundation, forms and group element registers', () => eq(ELEMENTS.filter((e) => !registry[e]), [], 'missing'));
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

// Group 1: the rest of the foundation, layout, data and feedback
const types = (x) => x.events.map((e) => e.type);
test('g1 buttons: secondary is outlined, danger is danger; busy or disabled does not fire', () => {
  const s = create('bx-secondary-button', { label: 'Save for later' });
  const d = create('bx-danger-button', { label: 'Cancel payment', busy: true });
  s.vm.press();
  d.vm.press();
  eq([s.vm.css(), d.vm.css(), types(s), types(d), d.vm.busyAttr()], ['bx-btn bx-btn--outlined', 'bx-btn bx-btn--danger', ['ojAction'], [], 'true'], 'buttons');
});
test('g1 bx-savings-slider: the value with its currency, written back as a number', () => {
  const s = create('bx-savings-slider', { labelHint: 'Monthly saving', prefix: 'USD', value: 5000 });
  eq(s.vm.shown(), 'USD ' + (5000).toLocaleString(), 'shown');
  s.vm.onInput(input('5500'));
  eq(s.props.value, 5500, 'value');
});
test('g1 bx-segmented: a click and the arrow keys choose; one option is in the tab order', () => {
  const s = create('bx-segmented', { labelHint: 'Show', options: ['Day', 'Week', 'Month'], value: 'Week' });
  eq(s.vm.items().map((i) => i.tab), ['-1', '0', '-1'], 'tab order');
  s.vm.onKey(key('ArrowRight'));
  eq(s.props.value, 'Month', 'arrow');
  s.vm.items()[0].pick();
  eq([s.props.value, s.vm.items()[0].checked], ['Day', 'true'], 'click');
  eq(create('bx-segmented', { options: ['A', 'B'] }).vm.items()[0].tab, '0', 'first is focusable when none is chosen');
});
test('g1 bx-filter-chips: several turn on and off; single keeps one', () => {
  const c = create('bx-filter-chips', { options: ['Card', 'Transfer', 'Bills'] });
  c.vm.items()[0].toggle();
  c.vm.items()[2].toggle();
  eq(c.props.value, ['Card', 'Bills'], 'two on');
  c.vm.items()[0].toggle();
  eq([c.props.value, c.vm.items()[2].pressed], [['Bills'], 'true'], 'one off');
  const one = create('bx-filter-chips', { options: ['A', 'B'], multiple: false });
  one.vm.items()[0].toggle();
  one.vm.items()[1].toggle();
  eq(one.props.value, ['B'], 'single');
});
test('g1 bx-action-menu: opens, fires ojAction with the item, closes; Escape closes', () => {
  const m = create('bx-action-menu', { items: ['Download statement', { value: 'close', label: 'Close the account', danger: true }, { label: 'Off', disabled: true }] });
  m.vm.toggle();
  eq(m.vm.expanded(), 'true', 'open');
  m.vm.items()[2].pick();
  eq(types(m), [], 'disabled item');
  m.vm.items()[1].pick();
  eq([m.events[0].detail.value, m.vm.open(), m.vm.items()[1].css], ['close', false, 'bx-menu-item is-danger'], 'picked');
  m.vm.toggle();
  m.vm.onMenuKey(key('Escape'));
  eq(m.vm.open(), false, 'Escape');
});
test('g1 bx-accordion: one section at a time, or several when multiple', () => {
  const items = [{ id: 'a', title: 'How long?', body: 'Same day.' }, { id: 'b', title: 'Fees?', body: 'None.' }];
  const a = create('bx-accordion', { items: items });
  a.vm.items()[0].toggle();
  a.vm.items()[1].toggle();
  eq([a.props.expanded, a.vm.items()[1].expanded], [['b'], 'true'], 'single');
  const m = create('bx-accordion', { items: items, multiple: true });
  m.vm.items()[0].toggle();
  m.vm.items()[1].toggle();
  m.vm.items()[0].toggle();
  eq(m.props.expanded, ['b'], 'multiple');
});
test('g1 bx-stepper: done, current and next steps from selected-step', () => {
  const s = create('bx-stepper', { steps: ['Details', 'Review', 'Done'], selectedStep: 'Review' });
  eq(s.vm.items().map((i) => [i.css, i.mark, i.current]), [['bx-step-item is-done', '✓', null], ['bx-step-item is-current', '2', 'step'], ['bx-step-item is-next', '3', null]], 'states');
});
test('g1 bx-breadcrumb and bx-side-nav: the last crumb is the page; nav selection writes back', () => {
  const b = create('bx-breadcrumb', { items: ['Accounts', 'Savings ·· 4821', 'Statement'] });
  eq(b.vm.items().map((i) => i.last), [false, false, true], 'last');
  b.vm.items()[0].go();
  eq(b.events[0].detail.value, 'Accounts', 'go');
  const n = create('bx-side-nav', { items: ['Accounts', 'Payments', { id: 'cards', label: 'Cards', badge: 2 }], selection: 'Accounts' });
  n.vm.items()[2].pick();
  eq([n.props.selection, n.vm.items()[2].current, n.vm.items()[2].badge], ['cards', 'page', '2'], 'nav');
});
test('g1 bx-sheet: Close sets open to false and fires ojClose; Escape closes', () => {
  const s = create('bx-sheet', { heading: 'Filter transactions', open: true });
  s.vm.onKey(key('Escape'));
  eq([s.props.open, types(s)], [false, ['ojClose']], 'closed');
  s.vm.close();
  eq(types(s), ['ojClose'], 'only once');
});
test('g1 layout: grid columns and gap, divider label, avatar initials and photo', () => {
  eq(create('bx-grid', { columns: 3, gap: 'lg' }).vm.css(), 'bx-layout-grid is-cols-3 is-gap-lg', 'grid');
  eq([create('bx-avatar', { name: 'asha rao' }).vm.initials(), create('bx-avatar', {}).vm.initials()], ['AR', '?'], 'initials');
  if (!/<hr class="bx-divider"\/>/.test(registry['bx-divider'].view) || !/role="separator" :aria-label/.test(registry['bx-divider'].view)) { throw new Error('divider markup'); }
  if (!/:alt="\[\[\$properties\.name\]\]"/.test(registry['bx-avatar'].view) || !/role="img" :aria-label/.test(registry['bx-avatar'].view)) { throw new Error('avatar has no name'); }
});
test('g1 bx-pagination: first, last and the pages around the current one; next and previous stop at the ends', () => {
  const p = create('bx-pagination', { page: 5, pageCount: 9 });
  eq(p.vm.pages().map((x) => (x.gap ? '…' : x.label)), ['1', '…', '4', '5', '6', '…', '9'], 'pages');
  eq(p.vm.pages()[3].current, 'page', 'current');
  p.vm.next();
  eq(p.props.page, 6, 'next');
  const one = create('bx-pagination', { page: 1, pageCount: 1 });
  one.vm.prev();
  eq([one.props.page, one.vm.atFirst(), one.vm.atLast()], [1, true, true], 'ends');
});
test('g1 data: badge tone, timeline states, spinner and skeleton say they are loading', () => {
  eq(create('bx-status-badge', { label: 'Overdue', tone: 'danger' }).vm.css(), 'bx-badge is-danger', 'badge');
  const t = create('bx-timeline', { items: [{ label: 'Initiated', meta: '09:12 · A. Rao' }, { label: 'Approved', state: 'current' }, { label: 'Completed', state: 'pending' }] });
  eq(t.vm.items().map((i) => [i.css, i.status, i.current]), [['bx-tl-item is-done', '', null], ['bx-tl-item is-current', 'In progress', 'step'], ['bx-tl-item is-pending', 'Not yet', null]], 'timeline');
  ['bx-spinner', 'bx-skeleton'].forEach((e) => { if (!/role="status"/.test(registry[e].view) || !/bx-visually-hidden/.test(registry[e].view)) { throw new Error(e + ' is not announced'); } });
  eq(create('bx-skeleton', { lines: 2 }).vm.lines().map((l) => l.css), ['bx-skel-line', 'bx-skel-line is-short'], 'skeleton');
});
test('g1 bx-empty-state and bx-tooltip: the action fires; the tip shows on focus and hides on Escape', () => {
  const e = create('bx-empty-state', { heading: 'No payees yet', actionLabel: 'Add a payee' });
  e.vm.act();
  eq(types(e), ['ojAction'], 'action');
  const t = create('bx-tooltip', { label: 'Available balance', text: 'What you can spend now.' });
  t.vm.show();
  eq([t.vm.open(), t.vm.name()], [true, 'About Available balance'], 'shown');
  t.vm.onKey(key('Escape'));
  eq(t.vm.open(), false, 'Escape');
  if (!/role="tooltip" :id="\[\[id\]\]"/.test(registry['bx-tooltip'].view) || !/:aria-describedby="\[\[id\]\]"/.test(registry['bx-tooltip'].view)) { throw new Error('tooltip not tied'); }
});
test('g1 messages: errors are announced at once, others politely; the action and Dismiss fire', () => {
  const e = create('bx-error-message', { message: 'The amount is more than your daily limit.', actionLabel: 'Change the amount', dismissible: true });
  eq([e.vm.role(), e.vm.css(), e.vm.icon()], ['alert', 'bx-alert is-error', '!'], 'error');
  e.vm.act();
  e.vm.dismiss();
  eq([types(e), e.vm.dismissed()], [['ojAction', 'ojClose'], true], 'events');
  eq([create('bx-success-message', {}).vm.role(), create('bx-alert-banner', {}).vm.css()], ['status', 'bx-alert is-info'], 'others');
});
test('g1 bx-notification-panel: rows with their action named per row; empty text', () => {
  const n = create('bx-notification-panel', { items: [{ id: 'n1', title: 'Card payment due', meta: 'Due 18 Jan', value: '640.00', unread: true }] });
  const r = n.vm.rows()[0];
  eq([r.actionName, r.value, r.css], ['Read: Card payment due', '640.00', 'bx-row is-unread'], 'row');
  r.act();
  eq(n.events[0].detail.item.id, 'n1', 'action item');
  eq(create('bx-notification-panel', {}).vm.empty(), true, 'empty');
});
test('g1 views have their roles', () => {
  const has = (e, re) => { if (!re.test(registry[e].view)) { throw new Error(e + ': ' + re); } };
  has('bx-segmented', /role="radiogroup"[^>]*:aria-labelledby/);
  has('bx-segmented', /role="radio"/);
  has('bx-filter-chips', /:aria-pressed=/);
  has('bx-action-menu', /aria-haspopup="menu"/);
  has('bx-action-menu', /role="menuitem"/);
  has('bx-accordion', /:aria-controls=[^>]*on-click/);
  has('bx-accordion', /role="region"/);
  has('bx-breadcrumb', /<nav class="bx-crumbs" :aria-label/);
  has('bx-side-nav', /:aria-current="\[\[n\.data\.current\]\]"/);
  has('bx-sheet', /role="dialog" aria-modal="true"/);
  has('bx-pagination', /aria-label="Next page"/);
  has('bx-stepper', /<ol class="bx-steps" :aria-label/);
});

// Group 2: accounts, payments, deposits
const g2 = load(path.join(BX, 'bx-g2.js')).kit;
test('g2 amounts: the currency\'s decimals; text is shown as given', () => {
  eq([g2.money(1250, 'USD'), g2.money(1250, 'JPY'), g2.money(1.5, 'KWD'), g2.money('12,400.00'), g2.money(null)],
    [(1250).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ' USD', (1250).toLocaleString() + ' JPY', (1.5).toLocaleString(undefined, { minimumFractionDigits: 3 }) + ' KWD', '12,400.00', ''], 'money');
});
test('g2 bx-iban: groups of four, the ISO checksum on blur, a tick when valid', () => {
  eq([g2.ibanValid('GB29 NWBK 6016 1331 9268 19'), g2.ibanValid('GB28 NWBK 6016 1331 9268 19'), g2.ibanValid('12'), g2.ibanGroups('gb29nwbk60161331926819')],
    [true, false, false, 'GB29 NWBK 6016 1331 9268 19'], 'checks');
  const i = create('bx-iban', { required: true });
  i.vm.onInput(input('gb29 nwbk 6016 1331 9268 19'));
  i.vm.onBlur();
  eq([i.props.value, i.vm.text(), i.vm.ok(), i.vm.error()], ['GB29NWBK60161331926819', 'GB29 NWBK 6016 1331 9268 19', true, ''], 'valid');
  i.vm.onInput(input('GB28 NWBK 6016 1331 9268 19'));
  i.vm.onBlur();
  eq([i.vm.error().indexOf('Check the IBAN') === 0, i.props.value], [true, 'GB29NWBK60161331926819'], 'invalid keeps the last good value');
});
test('g2 bx-account-picker: the chosen account\'s detail is its help line', () => {
  const p = create('bx-account-picker', { options: [{ value: 's', label: 'Savings ·· 4821', meta: 'Available 12,150.00' }, { value: 'c', label: 'Current ·· 7730' }] });
  p.vm.onChange(input('s'));
  eq([p.props.value, p.vm.detail(), p.vm.options()[0].selected], ['s', 'Available 12,150.00', true], 'chosen');
});
test('g2 tiles, cards and details fire ojAction with what was picked', () => {
  const t = create('bx-account-summary', { items: [{ id: 'sav', label: 'Savings', value: '12,400.00', meta: 'Available 12,150.00' }] });
  t.vm.tiles()[0].open();
  eq([t.events[0].detail.item.id, t.vm.tiles()[0].value], ['sav', '12,400.00'], 'tile');
  const c = create('bx-beneficiary-card', { heading: 'A. Rao' });
  c.vm.act();
  eq([c.vm.actionName(), types(c)], ['Pay now: A. Rao', ['ojAction']], 'card');
  const d = create('bx-td-redemption', { items: [{ label: 'Principal', value: '25,000.00' }, { label: 'You receive', value: '25,549.90', total: true }], busy: true });
  d.vm.act();
  eq([d.vm.rows()[1].css, types(d)], ['bx-kv-row is-total', []], 'details busy');
});
test('g2 bx-balance-card: the amount in its currency, hidden and shown on request', () => {
  const b = create('bx-balance-card', { label: 'Savings ·· 4821', amount: 12400, currency: 'USD' });
  eq(b.vm.shown(), (12400).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ' USD', 'shown');
  b.vm.toggle();
  eq([b.vm.shown(), b.vm.toggleText(), b.props.hidden], ['••••••', 'Show balance', true], 'hidden');
});
test('g2 bx-payee-list: found by name, picked with ojAction', () => {
  const p = create('bx-payee-list', { items: [{ id: 'p1', name: 'A. Rao', meta: 'HSBC ·· 9268' }, { id: 'p2', name: 'J. Mehta' }] });
  p.vm.onQuery(input('meh'));
  eq(p.vm.rows().map((r) => r.name), ['J. Mehta'], 'filtered');
  p.vm.rows()[0].pick();
  eq(p.events[0].detail.item.id, 'p2', 'picked');
  p.vm.onQuery(input('zzz'));
  eq(p.vm.none(), true, 'none');
});
test('g2 bx-transaction-list: money in and out, the currency\'s decimals', () => {
  const t = create('bx-transaction-list', { currency: 'USD', items: [{ id: 't1', description: 'Coffee House', date: 'Today', amount: -4.5 }, { id: 't2', description: 'Salary', amount: 3200 }] });
  const r = t.vm.rows();
  eq([r[0].amount, r[0].direction, r[1].css, r[1].direction], ['−' + (4.5).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ' USD', 'Money out', 'bx-tx-amount is-in', 'Money in'], 'rows');
  r[0].open();
  eq(t.events[0].detail.item.id, 't1', 'open');
});
test('g2 forms: submit and cancel fire ojAction; busy stops a second submit', () => {
  const f = create('bx-payment-form', { cancelLabel: 'Cancel' });
  f.vm.submit();
  f.vm.cancel();
  eq(f.events.map((e) => e.detail.action), ['submit', 'cancel'], 'actions');
  const b = create('bx-new-td', { busy: true });
  b.vm.submit();
  eq([types(b), b.vm.busyAttr(), b.props.submitLabel], [[], 'true', 'Review deposit'], 'busy');
});
test('g2 reused kinds have their own defaults', () => {
  eq([create('bx-repeat', {}).props.value, create('bx-repeat', {}).vm.items().length, create('bx-upcoming-bills', {}).props.actionLabel, create('bx-payment-status', {}).props.label],
    ['Once', 3, 'Pay', 'Payment status'], 'defaults');
  const m = create('bx-maturity-instructions', { options: ['Renew principal and interest', 'Close and pay out'] });
  m.vm.items()[1].pick();
  eq([m.props.value, m.vm.items()[1].css], ['Close and pay out', 'bx-choice is-on'], 'choice');
  const r = create('bx-receipt', { amount: 1250, currency: 'USD', reference: 'FX-20391' });
  eq(r.vm.amountText(), (1250).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ' USD', 'receipt');
});
test('g2 views have their names and roles', () => {
  const has = (e, re) => { if (!re.test(registry[e].view)) { throw new Error(e + ': ' + re); } };
  has('bx-account-picker', /<label class="bx-label" :for="\[\[id\]\]"/);
  has('bx-iban', /:aria-describedby="\[\[describedBy\]\]"/);
  has('bx-iban', /role="alert"/);
  has('bx-payee-list', /:aria-label="\[\['Search ' \+ \$properties\.heading\]\]"/);
  has('bx-transaction-list', /bx-visually-hidden/);
  has('bx-account-details', /<dl class="bx-kv-list">/);
  has('bx-maturity-instructions', /<fieldset/);
  has('bx-quick-actions', /<nav class="bx-quick" :aria-label/);
  has('bx-beneficiary-card', /:aria-label="\[\[actionName\]\]"/);
});

// Group 3: loans, cards, security
const g3 = load(path.join(BX, 'bx-g3.js')).kit;
test('g3 a card number shows its last four digits only', () => {
  eq([g3.masked('4111 1111 1111 4821'), g3.masked(''), create('bx-card-tile', { number: '4111111111114821', label: 'Platinum', network: 'Visa', frozen: true }).vm.name()],
    ['•••• 4821', '', 'Platinum, Visa, ending 4821, blocked'], 'masked');
  const s = create('bx-sensitive', { value: '4111 1111 1111 4821' });
  eq([s.vm.text(), s.vm.toggleName()], ['•••• 4821', 'Show Card number'], 'masked first');
  s.vm.toggle();
  eq([s.vm.text(), s.vm.pressed()], ['4111 1111 1111 4821', 'true'], 'shown on request');
});
test('g3 bx-loan-schedule: a row per instalment, amounts on the right', () => {
  const t = create('bx-loan-schedule', { rows: [{ date: '05 Feb', amount: '412.00' }, { date: '05 Mar', amount: '412.00', status: 'due' }] });
  eq([t.vm.cols().map((c) => c.css), t.vm.rows()[1].css, t.vm.rows()[1].cells.map((c) => c.text)], [['bx-th', 'bx-th is-end'], 'bx-tr is-due', ['05 Mar', '412.00']], 'table');
  if (!/<caption>/.test(registry['bx-loan-schedule'].view) || !/<th scope="col"/.test(registry['bx-loan-schedule'].view)) { throw new Error('schedule headers'); }
});
test('g3 codes: digits only, slots filled, ojComplete at the last digit; a PIN is masked', () => {
  const o = create('bx-otp', {});
  const el = { value: '12a34' };
  o.vm.onInput({ target: el });
  eq([o.props.value, el.value, o.vm.slots().map((s) => s.ch).join(''), types(o)], ['1234', '1234', '1234', []], 'partial');
  o.vm.onInput(input('123456'));
  eq([types(o), o.events[0].detail.value, o.vm.auto()], [['ojComplete'], '123456', 'one-time-code'], 'complete');
  o.vm.resend();
  eq(types(o), ['ojComplete', 'ojAction'], 'resend');
  const p = create('bx-reset-pin', {});
  p.vm.onInput(input('98'));
  eq([p.vm.type(), p.vm.slots().map((s) => s.ch), p.vm.auto()], ['password', ['•', '•', '', ''], 'off'], 'pin');
});
test('g3 checks and toggles: card controls switch on and off; blocking says what it means', () => {
  const c = create('bx-card-controls', { options: ['Online payments', 'ATM withdrawals', 'Use abroad'], value: ['Online payments'] });
  c.vm.items()[2].toggle();
  c.vm.items()[0].toggle();
  eq([c.props.value, c.vm.items()[2].checked], [['Use abroad'], 'true'], 'controls');
  const b = create('bx-block-card', {});
  eq(b.vm.note(), '', 'no note when off');
  b.vm.toggle();
  eq([b.props.value, b.vm.checked(), b.vm.note().indexOf('The card is blocked') === 0], [true, 'true', true], 'blocked');
});
test('g3 bx-biometric: verify and the other way fire ojAction; waiting stops a second ask', () => {
  const b = create('bx-biometric', { state: 'waiting' });
  b.vm.go();
  b.vm.other();
  eq(b.events.map((e) => e.detail.action), ['other'], 'waiting');
  const f = create('bx-biometric', { state: 'failed' });
  f.vm.go();
  eq([f.vm.failed(), f.events[0].detail.action], [true, 'verify'], 'failed');
});
test('g3 bx-session-timeout: counts down, says it at the start and in the last ten seconds, signs out at zero', () => {
  timers.length = 0;
  const t = create('bx-session-timeout', { open: true, seconds: 12 });
  eq([t.vm.left(), t.vm.spoken().indexOf('12 seconds') > 0], [12, true], 'start');
  const run = () => { const next = timers.filter((x) => x.fn && x.ms === 1000).pop(); const fn = next.fn; next.fn = null; fn(); };
  run();
  eq([t.vm.left(), t.vm.spoken()], [11, ''], 'quiet');
  run();
  eq(t.vm.spoken().indexOf('10 seconds') > 0, true, 'last ten');
  for (let i = 0; i < 10; i++) { run(); }
  eq([t.props.open, t.events.map((e) => e.detail.action)], [false, ['expired']], 'expired');
  const s = create('bx-session-timeout', { open: true });
  s.vm.stay();
  eq([s.props.open, s.events[0].detail.action, s.vm.text()], [false, 'stay', 'For your security you will be signed out in 1 minute.'], 'stay');
  if (!/role="alertdialog" aria-modal="true"/.test(registry['bx-session-timeout'].view)) { throw new Error('alertdialog'); }
});
test('g3 reused kinds have their own defaults', () => {
  eq([create('bx-kyc-steps', {}).vm.items().length, create('bx-fraud-alert', {}).vm.role(), create('bx-convert-emi', {}).vm.items().length, create('bx-card-statements', {}).props.actionLabel,
    create('bx-redeem-points', {}).props.max, create('bx-loan-repayment', {}).props.submitLabel], [3, 'alert', 3, 'Download', 12400, 'Review repayment'], 'defaults');
});

// Group 4: insights, approvals, liquidity, settings
const g4 = load(path.join(BX, 'bx-g4.js')).kit;
test('g4 bars are widths in steps of 5%, never past the end', () => {
  eq([g4.step(320, 400), g4.step(1, 3), g4.step(500, 400), g4.step(5, 0), g4.step(-1, 10)], [80, 35, 100, 0, 0], 'steps');
});
test('g4 bx-spending-chart: bars against the largest value, the figure as text', () => {
  const c = create('bx-spending-chart', { unit: 'USD', items: [{ label: 'Oct', value: 820 }, { label: 'Nov', value: 1640 }, { label: 'Dec', value: 410, display: '410.00' }] });
  eq(c.vm.bars().map((b) => [b.css, b.value]), [['bx-bar-fill bx-h-50', '820 USD'], ['bx-bar-fill bx-h-100', (1640).toLocaleString() + ' USD'], ['bx-bar-fill bx-h-25', '410.00']], 'bars');
  eq(create('bx-spending-chart', { orientation: 'bars', max: 100, items: [{ label: 'A', value: 30 }] }).vm.bars()[0].css, 'bx-bar-fill bx-w-30', 'own max');
  if (!/<figure/.test(registry['bx-spending-chart'].view) || !/<figcaption/.test(registry['bx-spending-chart'].view)) { throw new Error('chart figure'); }
});
test('g4 meters: used of the limit, over by, near the end; the progressbar says it all', () => {
  const m = create('bx-budget-progress', { items: [{ label: 'Groceries', value: 320, max: 400 }, { label: 'Eating out', value: 210, max: 200 }, { label: 'Travel', value: 290, max: 300 }] });
  const r = m.vm.rows();
  eq(r.map((x) => x.css), ['bx-meter-fill bx-w-80', 'bx-meter-fill bx-w-100 is-over', 'bx-meter-fill bx-w-95 is-near'], 'classes');
  eq([r[1].text, r[1].now, r[1].max], ['210 of 200, over by 10', '200', '200'], 'over');
  if (!/role="progressbar"[^>]*:aria-valuetext/.test(registry['bx-budget-progress'].view)) { throw new Error('progressbar'); }
});
test('g4 reused kinds have their own defaults', () => {
  const s = create('bx-spend-categories', { options: ['Eating out', 'Groceries'] });
  s.vm.items()[0].toggle();
  s.vm.items()[1].toggle();
  eq(s.props.value, ['Groceries'], 'one category');
  eq([create('bx-appearance', {}).props.value, create('bx-otp-delivery', {}).vm.items().length, create('bx-modification-requested', {}).vm.role(), create('bx-account-structure', {}).props.multiple,
    create('bx-devices', {}).props.actionLabel, create('bx-reroute', {}).props.labelHint], ['System', 3, 'status', true, 'Remove', 'Re-route to'], 'defaults');
  const d = create('bx-do-not-disturb', {});
  d.vm.toggle();
  eq(d.vm.note().indexOf('Alerts wait') === 0, true, 'quiet hours');
});

// Group 5: service, documents, onboarding, calculators, help
const g5 = load(path.join(BX, 'bx-g5.js')).kit;
test('g5 the calculators\' formulas: an instalment, compound interest', () => {
  eq([Math.round(g5.instalment(100000, 12, 12) * 100) / 100, g5.instalment(1200, 0, 12), g5.instalment(0, 10, 12), Math.round(g5.maturity(10000, 8, 12, 4) * 100) / 100, g5.maturity(500, 8, 0)],
    [8884.88, 100, 0, 10824.32, 500], 'formulas');
});
test('g5 calculators work out as the customer types; the converter uses the screen\'s rate', () => {
  const l = create('bx-loan-calculator', { amount: 100000, rate: 12, months: 12, currency: 'USD' });
  eq(l.vm.result().main, (8884.88).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ' USD', 'loan');
  l.vm.onMonths(input('24'));
  eq(l.vm.result().value, 4707.35, 'retyped');
  const f = create('bx-currency-converter', { currency: 'USD', toCurrency: 'EUR', rate: 0.92 });
  eq([f.vm.result().main, f.vm.result().line, f.vm.isFx()], [(920).toLocaleString(undefined, { minimumFractionDigits: 2 }) + ' EUR', '1 USD = 0.92 EUR', true], 'fx');
  const t = create('bx-td-calculator', { currency: 'USD', rate: 8 });
  t.vm.act();
  eq([t.vm.title(), t.events[0].detail.result], ['At maturity', 10824.32], 'td');
});
test('g5 bx-statement-request: both days, in order, within max-days; then ojAction', () => {
  const s = create('bx-statement-request', { maxDays: 92 });
  s.vm.request();
  eq(s.vm.problem(), 'Choose the first and the last day.', 'empty');
  s.vm.onFrom(input('2025-12-31'));
  s.vm.onTo(input('2025-10-01'));
  s.vm.request();
  eq(s.vm.problem(), 'The last day is before the first. Swap them.', 'order');
  s.vm.onFrom(input('2025-01-01'));
  s.vm.request();
  eq(s.vm.problem(), 'Choose up to 92 days.', 'too long');
  s.vm.onFrom(input('2025-10-01'));
  s.vm.onTo(input('2025-12-31'));
  s.vm.request();
  eq([s.vm.problem(), s.events[0].detail.value], ['', { from: '2025-10-01', to: '2025-12-31' }], 'ok');
});
test('g5 compose, chat, locator and rating', () => {
  const m = create('bx-compose-mail', {});
  m.vm.send();
  m.vm.onInput(input('Please send a cheque book.'));
  m.vm.send();
  eq([types(m), m.events[0].detail.value, m.vm.count()], [['ojAction'], 'Please send a cheque book.', '26 / 500'], 'compose');
  const c = create('bx-live-chat', { messages: [{ from: 'agent', name: 'Priya', text: 'Hello, how can I help?', time: '10:02' }, { from: 'customer', text: 'My card is stuck.' }] });
  eq(c.vm.lines().map((x) => [x.who, x.css]), [['Priya', 'bx-msg'], ['You', 'bx-msg is-mine']], 'chat lines');
  c.vm.onDraft(input('  It is in the ATM  '));
  c.vm.onKey(key('Enter'));
  eq([c.events[0].detail.text, c.vm.draft()], ['It is in the ATM', ''], 'sent on Enter');
  const l = create('bx-locator', { items: [{ id: 'b1', name: 'London Bridge', type: 'branch', distance: '0.4 km' }, { id: 'a1', name: 'Borough ATM', type: 'atm' }] });
  l.vm.kinds()[2].pick();
  eq(l.vm.rows().map((r) => r.name), ['Borough ATM'], 'ATMs');
  l.vm.kinds()[0].pick();
  l.vm.onQuery(input('bridge'));
  eq([l.vm.rows().map((r) => r.meta), l.vm.rows()[0].actionName], [['Branch · 0.4 km'], 'Directions to London Bridge'], 'search');
  const r = create('bx-feedback', {});
  r.vm.stars()[3].pick();
  eq([r.props.value, r.vm.word(), r.vm.stars()[3].label, r.vm.stars().filter((s) => s.css === 'bx-star is-on').length], [4, 'Good', '4 stars, Good', 4], 'rating');
  if (!/role="log" aria-live="polite"/.test(registry['bx-live-chat'].view) || !/<fieldset class="bx-field bx-rating">/.test(registry['bx-feedback'].view)) { throw new Error('roles'); }
});
test('g5 reused kinds have their own defaults', () => {
  eq([create('bx-statement-format', {}).props.value, create('bx-self-register', {}).vm.items().length, create('bx-terms-consent', {}).props.control, create('bx-mailbox', {}).props.actionLabel],
    ['PDF', 4, 'checkbox', 'Open'], 'defaults');
});

// Group 6: dashboard widgets
test('g6 tab summaries: the first tab until one is chosen; arrows move; View all says which', () => {
  const a = create('bx-accounts-corp', { items: [{ id: 'casa', label: 'Current and savings', summary: '12 accounts · 3.4M' }, { id: 'td', label: 'Term deposits', summary: '4 deposits · 1.2M' }] });
  eq([a.vm.tabs().map((t) => t.selected), a.vm.current().summary], [['true', 'false'], '12 accounts · 3.4M'], 'first');
  a.vm.onKey(key('ArrowRight'));
  eq([a.props.selection, a.vm.current().summary, a.vm.current().tabId], ['td', '4 deposits · 1.2M', a.vm.tabs()[1].tabId], 'arrow');
  a.vm.act();
  eq(a.events[0].detail.value, 'td', 'view all');
  if (!/role="tablist"/.test(registry['bx-accounts-corp'].view) || !/role="tabpanel"/.test(registry['bx-accounts-corp'].view)) { throw new Error('tab roles'); }
});
test('g6 bx-bulk-file-upload: uses bx-document-upload; Upload needs a file; the template is asked for', () => {
  const u = create('bx-bulk-file-upload', {});
  u.vm.upload();
  eq(types(u), [], 'no file');
  u.vm.onValue({ detail: { value: [{ name: 'payroll.csv', size: 10 }], updatedFrom: 'internal' } });
  u.vm.upload();
  u.vm.template();
  eq(u.events.map((e) => e.detail.action), ['upload', 'template'], 'actions');
  if (!/<bx-document-upload /.test(registry['bx-bulk-file-upload'].view)) { throw new Error('upload not reused'); }
});
test('g6 widgets keep their kinds\' behaviour with their own defaults', () => {
  eq([create('bx-delinquency-notice', {}).vm.role(), create('bx-rewards', {}).props.interactive, create('bx-pending-approvals', {}).props.actionLabel, create('bx-calculators', {}).props.mode,
    create('bx-quick-links-corp', {}).props.label, create('bx-credit-score', { items: [{ label: 'Credit score', value: 742, max: 900 }] }).vm.rows()[0].css],
    ['alert', false, 'Approve', 'loan', 'Quick links', 'bx-meter-fill bx-w-80'], 'defaults');
});

// The motion layer (motion.json, bx.css and bx-motion.js)
const motionSpec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'motion.json'), 'utf8')).components;
const motion = load(path.join(BX, 'bx-motion.js'));
const MOTION_KEYS = ['enter', 'hover', 'press', 'change', 'open', 'error', 'loading', 'packs'];
test('motion.json has a motion for every element, built in the JET pack', () => {
  eq(ELEMENTS.filter((e) => { const m = motionSpec[e.slice(3)]; return !m || JSON.stringify(Object.keys(m)) !== JSON.stringify(MOTION_KEYS) || m.packs['jet-premium'] !== true; }), [], 'no or bad motion');
});
test('play() animates once, and not under reduced motion or without the Web Animations API', () => {
  const played = [];
  const el = { animate: (frames, options) => { played.push(options.duration); return {}; } };
  window.matchMedia = () => ({ matches: false });
  eq(motion.play(el, 'roll') !== null, true, 'plays');
  eq(motion.play({}, 'roll'), null, 'no API');
  eq(motion.play(el, 'nothing'), null, 'unknown effect');
  window.matchMedia = () => ({ matches: true });
  eq(motion.play(el, 'pop'), null, 'reduced motion');
  eq(played, [200], 'played');
  delete window.matchMedia;
});
test('bx-number-input: a step rolls the number in', () => {
  const played = [];
  const n = create('bx-number-input', { value: 2, max: 3 });
  n.vm.element.querySelector = (s) => (s === '.bx-num' ? { animate: (f, o) => { played.push(o.duration); } } : null);
  n.vm.up();
  eq([n.props.value, played.length], [3, 1], 'stepped and rolled');
});
test('the skin has the motion tokens, the effects and a reduced-motion rule for every bx- class', () => {
  const need = ['--bx-dur-fast', '--bx-dur-base', '--bx-dur-slow', '--bx-ease-standard', '--bx-ease-spring', '@keyframes bx-shake', '@keyframes bx-pop', '@keyframes bx-settle',
    '@keyframes bx-shimmer', '.bx-field.is-error .bx-control', '[class*="bx-"], [class*="bx-"]::before, [class*="bx-"]::after { animation: none !important; transition: none !important;'];
  eq(need.filter((n) => css.indexOf(n) < 0), [], 'missing in bx.css');
  // The effects animate from a start state, so with motion off the element shows its own (end) style
  const toFrames = (css.match(/@keyframes [\w-]+ \{[^}]*\bto\b/g) || []).map((k) => k.split(' ')[1]).filter((k) => !['bx-ripple', 'bx-shimmer', 'bx-spin', 'bx-skel'].includes(k));
  eq(toFrames, [], 'keyframes that end away from the element style');
});

console.log('Premium JET pack: ' + passed + ' passed' + (failures.length ? ', ' + failures.length + ' failed' : '') + '.');
failures.forEach((f) => console.log('  FAILED ' + f));
if (process.argv.indexOf('--json') > 0) { fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ passed: passed, failed: failures }, null, 2)); }
process.exit(failures.length ? 1 : 0);
