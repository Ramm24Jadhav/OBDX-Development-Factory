/*
 * Premium JET elements, group 2 (accounts, payments, deposits): bx-account-picker, bx-account-summary,
 * bx-balance-card, bx-account-card, bx-account-details, bx-iban, bx-quick-actions, bx-payee-list,
 * bx-beneficiary-card, bx-payment-form, bx-transfer-summary, bx-payment-status, bx-transaction-list,
 * bx-transaction-filter, bx-transaction-details, bx-repeat, bx-receipt, bx-upcoming-bills, bx-td-summary, bx-new-td,
 * bx-maturity-instructions, bx-td-topup and bx-td-redemption.
 * No business logic and nothing kept: amounts, balances and masked numbers come from the screen; an amount shows the
 * decimals of its currency; the IBAN check is the ISO 13616 checksum only.
 */
define(['ojs/ojcomposite', './bx-core', './bx-g1'], function (Composite, bx, g1) {
  'use strict';
  var ko = bx.ko;
  var k = g1.kit;
  var txt = k.txt, iff = k.iff, each = k.each, list = k.list, base = k.base, register = k.register, str = k.str, bool = k.bool, arr = k.arr;
  var kinds = {};

  /** Digits after the point for a currency (ISO 4217). */
  var decimalsOf = function (currency) {
    if (!currency) { return 2; }
    if (['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF'].indexOf(currency) >= 0) { return 0; }
    if (['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD'].indexOf(currency) >= 0) { return 3; }
    return 2;
  };
  /** An amount with its currency's decimals and the code after it; text is shown as given. */
  var money = function (amount, currency) {
    if (amount === null || amount === undefined || amount === '') { return ''; }
    if (typeof amount !== 'number') { return String(amount); }
    var d = decimalsOf(currency);
    return amount.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) + (currency ? ' ' + currency : '');
  };
  /** The ISO 13616 checksum of an IBAN (spaces ignored): true when it is well formed. */
  var ibanValid = function (text) {
    var s = String(text || '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) { return false; }
    var moved = s.slice(4) + s.slice(0, 4);
    var rest = 0;
    for (var i = 0; i < moved.length; i++) {
      var c = moved.charAt(i);
      var digits = c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c;
      for (var j = 0; j < digits.length; j++) { rest = (rest * 10 + Number(digits.charAt(j))) % 97; }
    }
    return rest === 1;
  };
  var ibanGroups = function (text) { return String(text || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim(); };

  /* ---------- picker: a native select of accounts, the chosen one's detail under it ---------- */
  function PickerKind(context) {
    var self = this;
    base(self, context, 'bx-pick');
    self.options = ko.pureComputed(function () {
      return list(self.props.options).map(function (o) { return { value: o.value !== undefined ? String(o.value) : o.id, label: o.label, selected: (o.value !== undefined ? String(o.value) : o.id) === String(self.props.value) }; });
    });
    self.detail = ko.pureComputed(function () {
      var o = list(self.props.options).filter(function (x) { return (x.value !== undefined ? String(x.value) : x.id) === String(self.props.value); })[0];
      return self.props.helpText || (o && o.meta ? String(o.meta) : '');
    });
    self.onChange = function (event) { self.props.value = event.target.value; };
  }
  kinds.picker = { model: PickerKind,
    props: { labelHint: str(), options: arr(), value: { type: 'any', writeback: true }, placeholder: str('Choose'), required: bool(), disabled: bool(), helpText: str() },
    view: '<div class="bx-field"><label class="bx-label" :for="[[id]]">' + txt('$properties.labelHint') + iff('$properties.required', '<span class="bx-req" aria-hidden="true"> *</span>') + '</label>'
      + '<div class="bx-control"><select class="bx-input bx-select" :id="[[id]]" :disabled="[[$properties.disabled]]" :aria-required="[[$properties.required ? \'true\' : null]]"'
      + ' :aria-describedby="[[detail() ? id + \'-help\' : null]]" on-change="[[onChange]]"><option value="">' + txt('$properties.placeholder') + '</option>'
      + each('options', 'o', '<option :value="[[o.data.value]]" :selected="[[o.data.selected]]">' + txt('o.data.label') + '</option>') + '</select><span class="bx-caret" aria-hidden="true"></span></div>'
      + iff('detail()', '<span class="bx-help" :id="[[id + \'-help\']]">' + txt('detail') + '</span>') + '</div>' };

  /* ---------- tiles: a figure each (accounts, deposits, loans); pick one for detail ---------- */
  function TilesKind(context) {
    var self = this;
    base(self, context, 'bx-tiles');
    self.tiles = ko.pureComputed(function () {
      return list(self.props.items).map(function (o) {
        return { label: o.label, value: o.value !== undefined && o.label !== undefined ? String(o.value) : '', meta: o.meta || '', css: 'bx-tile' + (o.tone ? ' is-' + o.tone : ''),
          open: function () { bx.fire(self.element, 'ojAction', { item: o }); } };
      });
    });
  }
  var tileBody = '<span class="bx-tile-label">' + txt('t.data.label') + '</span><span class="bx-tile-value">' + txt('t.data.value') + '</span>'
    + iff('t.data.meta', '<span class="bx-tile-meta">' + txt('t.data.meta') + '</span>');
  kinds.tiles = { model: TilesKind, events: k.ACTION, props: { heading: str(), items: arr(), interactive: bool(true) },
    view: '<section class="bx-tiles-wrap" :aria-label="[[$properties.heading || null]]">' + iff('$properties.heading', '<h3 class="bx-panel-title">' + txt('$properties.heading') + '</h3>')
      + '<ul class="bx-tiles">' + each('tiles', 't', '<li>' + iff('$properties.interactive', '<button type="button" :class="[[t.data.css + \' is-interactive\']]" on-click="[[t.data.open]]">' + tileBody + '</button>')
        + iff('!$properties.interactive', '<div :class="[[t.data.css]]">' + tileBody + '</div>') + '</li>') + '</ul></section>' };

  /* ---------- balance: an account's balance, hidden on request ---------- */
  function BalanceKind(context) {
    var self = this;
    base(self, context, 'bx-bal');
    self.shown = ko.pureComputed(function () { return self.props.amountHidden ? '••••••' : money(self.props.amount, self.props.currency); });
    self.toggleText = ko.pureComputed(function () { return self.props.amountHidden ? 'Show balance' : 'Hide balance'; });
    self.pressed = ko.pureComputed(function () { return self.props.amountHidden ? 'false' : 'true'; });
    self.toggle = function () { self.props.amountHidden = !self.props.amountHidden; };
  }
  kinds.balance = { model: BalanceKind, props: { label: str(), amount: { type: 'any' }, currency: str(), meta: str(), hideable: bool(true), amountHidden: { type: 'boolean', value: false, writeback: true } },
    view: '<section class="bx-balance" :aria-labelledby="[[id]]"><div class="bx-balance-head"><h3 class="bx-balance-label" :id="[[id]]">' + txt('$properties.label') + '</h3>'
      + iff('$properties.hideable', '<button type="button" class="bx-reveal" :aria-pressed="[[pressed]]" on-click="[[toggle]]">' + txt('toggleText') + '</button>') + '</div>'
      + '<p class="bx-balance-amount">' + txt('shown') + '</p>' + iff('$properties.meta && !$properties.amountHidden', '<p class="bx-balance-meta">' + txt('$properties.meta') + '</p>') + '</section>' };

  /* ---------- card: a thing to act on (an account, a payee, a product), with a badge and an action ---------- */
  function CardKind(context) {
    var self = this;
    base(self, context, 'bx-thing');
    self.act = function () { bx.fire(self.element, 'ojAction', {}); };
    self.actionName = ko.pureComputed(function () { return (self.props.actionLabel || '').replace(/\s*→$/, '') + ': ' + (self.props.heading || ''); });
  }
  kinds.card = { model: CardKind, events: k.ACTION, props: { heading: str(), text: str(), badge: str(), actionLabel: str() },
    view: '<article class="bx-card bx-thing" :aria-labelledby="[[id]]"><div class="bx-thing-head"><h3 class="bx-card-title" :id="[[id]]">' + txt('$properties.heading') + '</h3>'
      + iff('$properties.badge', '<span class="bx-badge is-info">' + txt('$properties.badge') + '</span>') + '</div>'
      + iff('$properties.text', '<p class="bx-thing-text">' + txt('$properties.text') + '</p>') + '<oj-bind-slot></oj-bind-slot>'
      + iff('$properties.actionLabel', '<button type="button" class="bx-thing-action" :aria-label="[[actionName]]" on-click="[[act]]">' + txt('$properties.actionLabel') + '</button>') + '</article>' };

  /* ---------- kv: details as label and value, with the main action ---------- */
  function KvKind(context) {
    var self = this;
    base(self, context, 'bx-kv');
    self.rows = ko.pureComputed(function () {
      return list(self.props.items).map(function (o) { return { label: o.label, value: o.value !== undefined && o.label !== undefined ? String(o.value) : '', css: 'bx-kv-row' + (o.total ? ' is-total' : '') }; });
    });
    self.act = function () { if (!self.props.busy) { bx.fire(self.element, 'ojAction', {}); } };
    self.busyAttr = ko.pureComputed(function () { return self.props.busy ? 'true' : null; });
  }
  kinds.kv = { model: KvKind, events: k.ACTION, props: { heading: str(), items: arr(), actionLabel: str(), busy: bool() },
    view: '<section class="bx-panel bx-kv" :aria-label="[[$properties.heading || null]]">' + iff('$properties.heading', '<h3 class="bx-panel-title">' + txt('$properties.heading') + '</h3>')
      + '<dl class="bx-kv-list">' + each('rows', 'r', '<div :class="[[r.data.css]]"><dt>' + txt('r.data.label') + '</dt><dd>' + txt('r.data.value') + '</dd></div>') + '</dl>'
      + iff('$properties.actionLabel', '<div class="bx-kv-actions"><button type="button" class="bx-btn bx-btn--callToAction" :disabled="[[$properties.busy]]" :aria-busy="[[busyAttr]]" on-click="[[act]]">'
        + txt('$properties.actionLabel') + '</button></div>') + '</section>' };

  /* ---------- iban: an account number in groups of four, checked with the ISO checksum when the customer leaves it ---------- */
  function IbanKind(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.typed = ko.observable(null);
    self.text = ko.pureComputed(function () { return self.typed() !== null ? self.typed() : ibanGroups(self.props.value); });
    self.ok = ko.pureComputed(function () { return !!self.props.value && ibanValid(self.props.value); });
    self.onInput = function (event) { self.typed(event.target.value); return true; };
    self.onBlur = function () {
      self.focused(false);
      if (self.typed() !== null) {
        var t = self.typed().replace(/\s+/g, '').toUpperCase();
        self.typed(null);
        self.shown(true);
        if (t && !ibanValid(t)) { self.validationError('Check the IBAN: it starts with the country code, for example GB29 NWBK 6016 1331 9268 19.'); self.props.valid = 'invalidShown'; return true; }
        self.validationError('');
        self.props.value = t;
      }
      self.check(true);
      return true;
    };
  }
  kinds.iban = { model: IbanKind, methods: { validate: {}, reset: {}, showMessages: {} },
    props: (function () { var p = k.copy(bx.FIELD); p.value = { type: 'string', writeback: true }; return p; }()),
    view: bx.fieldView('<input class="bx-input bx-mono" :id="[[id]]" :value="[[text]]" :disabled="[[$properties.disabled]]" :readonly="[[$properties.readonly]]" :placeholder="[[$properties.placeholder]]"'
      + ' :aria-required="[[$properties.required ? \'true\' : null]]" :aria-invalid="[[invalid]]" :aria-describedby="[[describedBy]]" autocomplete="off" spellcheck="false" autocapitalize="characters"'
      + ' on-input="[[onInput]]" on-focus="[[onFocus]]" on-blur="[[onBlur]]"/>' + iff('ok() && !error()', '<span class="bx-check-mark" aria-hidden="true">✓</span>')) };

  /* ---------- quick: shortcuts as tiles of an icon and a word ---------- */
  function QuickKind(context) {
    var self = this;
    base(self, context, 'bx-quick');
    self.items = ko.pureComputed(function () {
      return list(self.props.items).map(function (o) { return { label: o.label, icon: o.icon || '•', go: function () { bx.fire(self.element, 'ojAction', { value: o.value !== undefined ? o.value : o.id }); } }; });
    });
  }
  kinds.quick = { model: QuickKind, events: k.ACTION, props: { label: str('Quick actions'), items: arr() },
    view: '<nav class="bx-quick" :aria-label="[[$properties.label]]"><ul>' + each('items', 'q', '<li><button type="button" class="bx-quick-item" on-click="[[q.data.go]]">'
      + '<span class="bx-quick-icon" aria-hidden="true">' + txt('q.data.icon') + '</span><span>' + txt('q.data.label') + '</span></button></li>') + '</ul></nav>' };

  /* ---------- payees: the saved payees, found by name, picked to pay ---------- */
  function PayeesKind(context) {
    var self = this;
    base(self, context, 'bx-payees');
    self.query = ko.observable('');
    self.rows = ko.pureComputed(function () {
      var q = self.query().trim().toLowerCase();
      return list(self.props.items).filter(function (o) { return !q || String(o.name || o.label).toLowerCase().indexOf(q) >= 0; }).map(function (o) {
        var name = String(o.name || o.label);
        return { name: name, meta: o.meta || '', initials: k.initials(name), pick: function () { bx.fire(self.element, 'ojAction', { item: o }); } };
      });
    });
    self.none = ko.pureComputed(function () { return self.rows().length === 0; });
    self.onQuery = function (event) { self.query(event.target.value); return true; };
  }
  kinds.payees = { model: PayeesKind, events: k.ACTION, props: { heading: str('Payees'), items: arr(), searchable: bool(true), emptyText: str('No payees match.') },
    view: '<section class="bx-panel" :aria-labelledby="[[id]]"><h3 class="bx-panel-title" :id="[[id]]">' + txt('$properties.heading') + '</h3>'
      + iff('$properties.searchable', '<div class="bx-control bx-payee-search"><span class="bx-search-icon" aria-hidden="true"></span><input type="search" class="bx-input bx-search"'
        + ' :aria-label="[[\'Search \' + $properties.heading]]" placeholder="Name" :value="[[query]]" on-input="[[onQuery]]"/></div>')
      + iff('none()', '<p class="bx-panel-empty" role="status">' + txt('$properties.emptyText') + '</p>')
      + '<ul class="bx-rows">' + each('rows', 'p', '<li class="bx-row"><button type="button" class="bx-payee" on-click="[[p.data.pick]]"><span class="bx-avatar is-sm" aria-hidden="true">' + txt('p.data.initials') + '</span>'
        + '<span class="bx-row-main"><strong>' + txt('p.data.name') + '</strong>' + iff('p.data.meta', '<span class="bx-row-meta">' + txt('p.data.meta') + '</span>') + '</span></button></li>') + '</ul></section>' };

  /* ---------- form: the screen's fields in a titled step, a summary, and Submit and Cancel ---------- */
  function FormKind(context) {
    var self = this;
    base(self, context, 'bx-form');
    self.rows = ko.pureComputed(function () { return list(self.props.items).map(function (o) { return { label: o.label, value: o.value !== undefined ? String(o.value) : '' }; }); });
    self.busyAttr = ko.pureComputed(function () { return self.props.busy ? 'true' : null; });
    self.submit = function () { if (!self.props.busy) { bx.fire(self.element, 'ojAction', { action: 'submit' }); } };
    self.cancel = function () { bx.fire(self.element, 'ojAction', { action: 'cancel' }); };
  }
  kinds.form = { model: FormKind, events: k.ACTION, props: { heading: str(), items: arr(), submitLabel: str('Continue'), cancelLabel: str(), busy: bool() },
    view: '<section class="bx-card bx-form" :aria-labelledby="[[id]]"><h3 class="bx-card-title" :id="[[id]]">' + txt('$properties.heading') + '</h3><div class="bx-form-body"><oj-bind-slot></oj-bind-slot></div>'
      + iff('rows().length', '<dl class="bx-kv-list">' + each('rows', 'r', '<div class="bx-kv-row"><dt>' + txt('r.data.label') + '</dt><dd>' + txt('r.data.value') + '</dd></div>') + '</dl>')
      + '<div class="bx-kv-actions">' + iff('$properties.cancelLabel', '<button type="button" class="bx-btn bx-btn--borderless" on-click="[[cancel]]">' + txt('$properties.cancelLabel') + '</button>')
      + '<button type="button" class="bx-btn bx-btn--callToAction" :disabled="[[$properties.busy]]" :aria-busy="[[busyAttr]]" on-click="[[submit]]">' + txt('$properties.submitLabel') + '</button></div></section>' };

  /* ---------- transactions: what came in and went out, newest first ---------- */
  function TxKind(context) {
    var self = this;
    base(self, context, 'bx-tx');
    self.rows = ko.pureComputed(function () {
      return list(self.props.items).map(function (o) {
        var n = typeof o.amount === 'number' ? o.amount : Number(String(o.amount || '0').replace(/[^\d.-]/g, ''));
        var currency = o.currency || self.props.currency;
        var shown = typeof o.amount === 'number' ? (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n), currency) : String(o.amount || '');
        var name = String(o.description || o.label);
        return { name: name, meta: [o.date, o.meta].filter(Boolean).join(' · '), amount: shown, css: 'bx-tx-amount' + (n > 0 ? ' is-in' : ''),
          direction: n > 0 ? 'Money in' : n < 0 ? 'Money out' : '', initials: k.initials(name), open: function () { bx.fire(self.element, 'ojAction', { item: o }); } };
      });
    });
    self.empty = ko.pureComputed(function () { return self.rows().length === 0; });
  }
  var txBody = '<span class="bx-avatar is-sm" aria-hidden="true">' + txt('t.data.initials') + '</span><span class="bx-row-main"><strong>' + txt('t.data.name') + '</strong>'
    + iff('t.data.meta', '<span class="bx-row-meta">' + txt('t.data.meta') + '</span>') + '</span><span :class="[[t.data.css]]"><span class="bx-visually-hidden">' + txt('t.data.direction') + '</span>'
    + txt('t.data.amount') + '</span>';
  kinds.tx = { model: TxKind, events: k.ACTION, props: { heading: str('Transactions'), items: arr(), currency: str(), interactive: bool(true), emptyText: str('No transactions in this period.') },
    view: '<section class="bx-panel" :aria-labelledby="[[id]]"><h3 class="bx-panel-title" :id="[[id]]">' + txt('$properties.heading') + '</h3>'
      + iff('empty()', '<p class="bx-panel-empty">' + txt('$properties.emptyText') + '</p>')
      + '<ul class="bx-rows">' + each('rows', 't', '<li class="bx-row">' + iff('$properties.interactive', '<button type="button" class="bx-payee bx-tx" on-click="[[t.data.open]]">' + txBody + '</button>')
        + iff('!$properties.interactive', '<div class="bx-payee bx-tx">' + txBody + '</div>') + '</li>') + '</ul></section>' };

  /* ---------- receipt: done, the amount, the details and what to do with it ---------- */
  function ReceiptKind(context) {
    var self = this;
    base(self, context, 'bx-receipt');
    self.amountText = ko.pureComputed(function () { return money(self.props.amount, self.props.currency); });
    self.rows = ko.pureComputed(function () { return list(self.props.items).map(function (o) { return { label: o.label, value: o.value !== undefined ? String(o.value) : '' }; }); });
  }
  kinds.receipt = { model: ReceiptKind, props: { heading: str('Done'), amount: { type: 'any' }, currency: str(), items: arr(), reference: str() },
    view: '<section class="bx-card bx-receipt" :aria-labelledby="[[id]]"><span class="bx-receipt-mark" aria-hidden="true">✓</span><h3 class="bx-receipt-title" :id="[[id]]">' + txt('$properties.heading') + '</h3>'
      + iff('amountText()', '<p class="bx-receipt-amount">' + txt('amountText') + '</p>') + iff('$properties.reference', '<p class="bx-receipt-ref">Reference <span class="bx-mono">' + txt('$properties.reference') + '</span></p>')
      + iff('rows().length', '<dl class="bx-kv-list">' + each('rows', 'r', '<div class="bx-kv-row"><dt>' + txt('r.data.label') + '</dt><dd>' + txt('r.data.value') + '</dd></div>') + '</dl>')
      + '<div class="bx-kv-actions"><oj-bind-slot></oj-bind-slot></div></section>' };

  /* ---------- choice: one option as a card, with a line under each ---------- */
  function ChoiceKind(context) {
    var self = this;
    base(self, context, 'bx-cho');
    self.items = ko.pureComputed(function () {
      return list(self.props.options).map(function (o, i) {
        var v = o.value !== undefined ? String(o.value) : o.id;
        var on = v === String(self.props.value);
        return { label: o.label, meta: o.meta || '', key: self.id + '-' + i, on: on, css: 'bx-choice' + (on ? ' is-on' : '') + (o.disabled ? ' is-disabled' : ''), disabled: o.disabled,
          pick: function () { if (!o.disabled) { self.props.value = o.value !== undefined ? o.value : o.id; } return true; } };
      });
    });
  }
  kinds.choice = { model: ChoiceKind, props: { labelHint: str(), options: arr(), value: { type: 'any', writeback: true }, required: bool() },
    view: '<fieldset class="bx-field"><legend class="bx-label">' + txt('$properties.labelHint') + iff('$properties.required', '<span class="bx-req" aria-hidden="true"> *</span>') + '</legend>'
      + '<div class="bx-choices">' + each('items', 'c', '<label :class="[[c.data.css]]"><input type="radio" class="bx-choice-input" :id="[[c.data.key]]" :name="[[id]]" :checked="[[c.data.on]]"'
        + ' :disabled="[[c.data.disabled]]" on-change="[[c.data.pick]]"/><span class="bx-choice-mark" aria-hidden="true"></span><span class="bx-choice-text"><span class="bx-choice-label">' + txt('c.data.label') + '</span>'
        + iff('c.data.meta', '<span class="bx-choice-meta">' + txt('c.data.meta') + '</span>') + '</span></label>') + '</div></fieldset>' };

  /* ---------- group 2 ---------- */
  var g = g1.kinds;
  var elements = [
    register('bx-account-picker', kinds.picker, { labelHint: 'From account' }),
    register('bx-account-summary', kinds.tiles, { heading: 'Your accounts' }),
    register('bx-balance-card', kinds.balance),
    register('bx-account-card', kinds.card, { actionLabel: 'View details' }),
    register('bx-account-details', kinds.kv, { heading: 'Account details' }),
    register('bx-iban', kinds.iban, { labelHint: 'Account number (IBAN)' }),
    register('bx-quick-actions', kinds.quick),
    register('bx-payee-list', kinds.payees),
    register('bx-beneficiary-card', kinds.card, { actionLabel: 'Pay now' }),
    register('bx-payment-form', kinds.form, { heading: 'Payment', submitLabel: 'Review payment' }),
    register('bx-transfer-summary', kinds.kv, { heading: 'Check the transfer', actionLabel: 'Confirm transfer' }),
    register('bx-payment-status', g.steps, { label: 'Payment status' }),
    register('bx-transaction-list', kinds.tx),
    register('bx-transaction-filter', g.chips, { labelHint: 'Show' }),
    register('bx-transaction-details', kinds.kv, { heading: 'Transaction' }),
    register('bx-repeat', g.segmented, { labelHint: 'Repeat', options: ['Once', 'Weekly', 'Monthly'], value: 'Once' }),
    register('bx-receipt', kinds.receipt, { heading: 'Payment sent' }),
    register('bx-upcoming-bills', g.rows, { heading: 'Upcoming bills', actionLabel: 'Pay', emptyText: 'No bills due.' }),
    register('bx-td-summary', kinds.tiles, { heading: 'Deposits' }),
    register('bx-new-td', kinds.form, { heading: 'New deposit', submitLabel: 'Review deposit' }),
    register('bx-maturity-instructions', kinds.choice, { labelHint: 'At maturity' }),
    register('bx-td-topup', kinds.kv, { heading: 'Top up the deposit', actionLabel: 'Top up' }),
    register('bx-td-redemption', kinds.kv, { heading: 'Redeem the deposit', actionLabel: 'Redeem' })
  ];

  return { elements: elements, kinds: kinds, kit: { decimalsOf: decimalsOf, money: money, ibanValid: ibanValid, ibanGroups: ibanGroups } };
});
