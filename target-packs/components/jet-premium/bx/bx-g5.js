/*
 * Premium JET elements, group 5 (service, documents, onboarding, calculators, help): bx-raise-request,
 * bx-track-requests, bx-mailbox, bx-compose-mail, bx-e-receipts, bx-certificates, bx-statement-request,
 * bx-statement-format, bx-self-register, bx-fatca-crs, bx-product-showcase, bx-application-tracker, bx-terms-consent,
 * bx-loan-calculator, bx-eligibility-calculator, bx-td-calculator, bx-currency-converter, bx-goal-calculator,
 * bx-locator, bx-live-chat, bx-feedback, bx-nominations and bx-faq.
 * The calculators are estimates with the standard formulas (an instalment, compound interest, an amount at a rate);
 * the rates come from the screen, and the bank's own figures come from its services.
 */
define(['ojs/ojcomposite', './bx-core', './bx-g1', './bx-g2', './bx-g3'], function (Composite, bx, g1, g2, g3) {
  'use strict';
  var ko = bx.ko;
  var k = g1.kit;
  var txt = k.txt, iff = k.iff, each = k.each, list = k.list, base = k.base, register = k.register, str = k.str, bool = k.bool, num = k.num, arr = k.arr;
  var money = g2.kit.money;
  var kinds = {};

  /** The monthly instalment of a loan: principal, yearly rate in %, months. */
  var instalment = function (principal, rate, months) {
    if (!(principal > 0) || !(months > 0)) { return 0; }
    var r = (rate || 0) / 1200;
    if (r === 0) { return principal / months; }
    var f = Math.pow(1 + r, months);
    return principal * r * f / (f - 1);
  };
  /** What a deposit is worth at the end: principal, yearly rate in %, months, compounding times a year. */
  var maturity = function (principal, rate, months, times) {
    if (!(principal > 0) || !(months > 0)) { return principal || 0; }
    var n = times || 4;
    return principal * Math.pow(1 + (rate || 0) / 100 / n, n * months / 12);
  };
  var round2 = function (n) { return Math.round(n * 100) / 100; };

  /* ---------- compose: a message to the bank, with a counter and Send ---------- */
  function ComposeKind(context) {
    var self = this;
    base(self, context, 'bx-compose');
    self.count = ko.pureComputed(function () { return String(self.props.value || '').length + ' / ' + self.props.maxLength; });
    self.empty = ko.pureComputed(function () { return !String(self.props.value || '').trim(); });
    self.off = ko.pureComputed(function () { return self.empty() || self.props.busy; });
    self.onInput = function (event) { self.props.value = event.target.value; return true; };
    self.send = function () { if (!self.off()) { bx.fire(self.element, 'ojAction', { value: self.props.value }); } };
  }
  kinds.compose = { model: ComposeKind, events: k.ACTION, props: { labelHint: str(), value: { type: 'string', value: '', writeback: true }, maxLength: num(500), sendLabel: str('Send'), busy: bool(), helpText: str() },
    view: '<div class="bx-field bx-compose"><label class="bx-label" :for="[[id]]">' + txt('$properties.labelHint') + '</label><div class="bx-control is-multiline">'
      + '<textarea class="bx-input bx-textarea" rows="5" :id="[[id]]" :value="[[$properties.value]]" :maxlength="[[$properties.maxLength]]" :aria-describedby="[[id + \'-count\']]" on-input="[[onInput]]"></textarea>'
      + '<span class="bx-counter" :id="[[id + \'-count\']]">' + txt('count') + '</span></div>' + iff('$properties.helpText', '<span class="bx-help">' + txt('$properties.helpText') + '</span>')
      + '<div class="bx-kv-actions"><button type="button" class="bx-btn bx-btn--callToAction" :disabled="[[off]]" :aria-busy="[[$properties.busy ? \'true\' : null]]" on-click="[[send]]">'
      + txt('$properties.sendLabel') + '</button></div></div>' };

  /* ---------- period: from and to dates, and Request ---------- */
  function PeriodKind(context) {
    var self = this;
    base(self, context, 'bx-period');
    self.problem = ko.observable('');
    var v = function () { return self.props.value || { from: '', to: '' }; };
    self.from = ko.pureComputed(function () { return v().from || ''; });
    self.to = ko.pureComputed(function () { return v().to || ''; });
    self.onFrom = function (event) { self.props.value = { from: event.target.value, to: v().to || '' }; self.problem(''); return true; };
    self.onTo = function (event) { self.props.value = { from: v().from || '', to: event.target.value }; self.problem(''); return true; };
    self.request = function () {
      var p = v();
      var days = p.from && p.to ? (Date.parse(p.to) - Date.parse(p.from)) / 86400000 : NaN;
      var msg = !p.from || !p.to ? 'Choose the first and the last day.' : days < 0 ? 'The last day is before the first. Swap them.'
        : self.props.maxDays && days + 1 > self.props.maxDays ? 'Choose up to ' + self.props.maxDays + ' days.' : '';
      self.problem(msg);
      if (!msg) { bx.fire(self.element, 'ojAction', { value: p }); }
    };
  }
  kinds.period = { model: PeriodKind, events: k.ACTION, props: { labelHint: str(), value: { type: 'object', value: { from: '', to: '' }, writeback: true }, min: str(), max: str(), maxDays: num(0), actionLabel: str('Request') },
    view: '<fieldset :class="[[problem() ? \'bx-field bx-period is-error\' : \'bx-field bx-period\']]" :aria-describedby="[[problem() ? id + \'-err\' : null]]"><legend class="bx-label">' + txt('$properties.labelHint') + '</legend>'
      + '<div class="bx-range"><div class="bx-field"><label class="bx-label" :for="[[id + \'-f\']]">From</label><div class="bx-control"><input type="date" class="bx-input" :id="[[id + \'-f\']]" :value="[[from]]"'
      + ' :min="[[$properties.min]]" :max="[[$properties.max]]" on-change="[[onFrom]]"/></div></div><div class="bx-field"><label class="bx-label" :for="[[id + \'-t\']]">To</label><div class="bx-control">'
      + '<input type="date" class="bx-input" :id="[[id + \'-t\']]" :value="[[to]]" :min="[[$properties.min]]" :max="[[$properties.max]]" on-change="[[onTo]]"/></div></div></div>'
      + iff('problem()', '<span class="bx-error" role="alert" :id="[[id + \'-err\']]"><span class="bx-error-icon" aria-hidden="true">!</span>' + txt('problem') + '</span>')
      + '<div class="bx-kv-actions"><button type="button" class="bx-btn bx-btn--callToAction" on-click="[[request]]">' + txt('$properties.actionLabel') + '</button></div></fieldset>' };

  /* ---------- calc: a loan, a deposit or an exchange, worked out as the customer types ---------- */
  function CalcKind(context) {
    var self = this;
    base(self, context, 'bx-calc');
    var n = function (v) { var x = Number(v); return isFinite(x) ? x : 0; };
    self.amount = ko.observable(self.props.amount);
    self.rateIn = ko.observable(self.props.rate);
    self.months = ko.observable(self.props.months);
    self.result = ko.pureComputed(function () {
      var a = n(self.amount()), r = n(self.rateIn()), m = n(self.months()), cur = self.props.currency;
      if (self.props.mode === 'fx') {
        var got = round2(a * n(self.props.rate));
        return { main: money(got, self.props.toCurrency), line: '1 ' + cur + ' = ' + n(self.props.rate) + ' ' + self.props.toCurrency, value: got };
      }
      if (self.props.mode === 'td') {
        var end = round2(maturity(a, r, m, self.props.compounding));
        return { main: money(end, cur), line: 'Interest ' + money(round2(end - a), cur), value: end };
      }
      var each = round2(instalment(a, r, m));
      return { main: money(each, cur), line: 'Total interest ' + money(round2(each * m - a), cur), value: each };
    });
    self.title = ko.pureComputed(function () { return { fx: 'You get', td: 'At maturity' }[self.props.mode] || 'Monthly instalment'; });
    self.isFx = ko.pureComputed(function () { return self.props.mode === 'fx'; });
    self.amountLabel = ko.pureComputed(function () { return (self.props.mode === 'fx' ? 'You send' : self.props.mode === 'td' ? 'Deposit' : 'Loan amount') + (self.props.currency ? ' (' + self.props.currency + ')' : ''); });
    self.onAmount = function (event) { self.amount(event.target.value); return true; };
    self.onRate = function (event) { self.rateIn(event.target.value); return true; };
    self.onMonths = function (event) { self.months(event.target.value); return true; };
    self.act = function () { bx.fire(self.element, 'ojAction', { amount: n(self.amount()), rate: n(self.rateIn()), months: n(self.months()), result: self.result().value }); };
  }
  var calcField = function (key, label, value, handler, extra) {
    return '<div class="bx-field"><label class="bx-label" :for="[[id + \'-' + key + '\']]">' + label + '</label><div class="bx-control"><input type="number" class="bx-input bx-num" inputmode="decimal"'
      + ' :id="[[id + \'-' + key + '\']]" :value="[[' + value + ']]" on-input="[[' + handler + ']]"' + (extra || '') + '/></div></div>';
  };
  kinds.calc = { model: CalcKind, events: k.ACTION,
    props: { heading: str('Loan calculator'), mode: str('loan'), amount: num(10000), rate: num(9.5), months: num(36), currency: str(), toCurrency: str(), compounding: num(4), actionLabel: str(),
      note: str('An estimate. The bank confirms the figures when you apply.') },
    view: '<section class="bx-card bx-calc" :aria-labelledby="[[id]]"><h3 class="bx-card-title" :id="[[id]]">' + txt('$properties.heading') + '</h3><div class="bx-calc-fields">'
      + '<div class="bx-field"><label class="bx-label" :for="[[id + \'-a\']]">' + txt('amountLabel') + '</label><div class="bx-control"><input type="number" class="bx-input bx-num" inputmode="decimal" min="0"'
      + ' :id="[[id + \'-a\']]" :value="[[amount]]" on-input="[[onAmount]]"/></div></div>'
      + iff('!isFx()', calcField('r', 'Rate (% a year)', 'rateIn', 'onRate', ' min="0" step="0.05"') + calcField('m', 'Months', 'months', 'onMonths', ' min="1" step="1"')) + '</div>'
      + '<div class="bx-calc-result" aria-live="polite"><span class="bx-calc-title">' + txt('title') + '</span><strong class="bx-calc-main">' + txt('result().main') + '</strong>'
      + '<span class="bx-calc-line">' + txt('result().line') + '</span></div><p class="bx-help">' + txt('$properties.note') + '</p>'
      + iff('$properties.actionLabel', '<div class="bx-kv-actions"><button type="button" class="bx-btn bx-btn--callToAction" on-click="[[act]]">' + txt('$properties.actionLabel') + '</button></div>') + '</section>' };

  /* ---------- locator: branches and ATMs near the customer, filtered by kind and name ---------- */
  function LocatorKind(context) {
    var self = this;
    base(self, context, 'bx-loc');
    self.query = ko.observable('');
    self.kind = ko.observable('all');
    self.kinds = ko.pureComputed(function () {
      return [['all', 'All'], ['branch', 'Branches'], ['atm', 'ATMs']].map(function (x) {
        return { label: x[1], pressed: self.kind() === x[0] ? 'true' : 'false', css: 'bx-filter-chip' + (self.kind() === x[0] ? ' is-on' : ''), pick: function () { self.kind(x[0]); } };
      });
    });
    self.rows = ko.pureComputed(function () {
      var q = self.query().trim().toLowerCase();
      return list(self.props.items).filter(function (o) {
        return (self.kind() === 'all' || o.type === self.kind()) && (!q || (String(o.name || o.label) + ' ' + (o.address || '')).toLowerCase().indexOf(q) >= 0);
      }).map(function (o) {
        var name = String(o.name || o.label);
        return { name: name, meta: [o.type === 'atm' ? 'ATM' : 'Branch', o.address, o.distance].filter(Boolean).join(' · '), hours: o.hours || '', actionName: 'Directions to ' + name,
          go: function () { bx.fire(self.element, 'ojAction', { item: o }); } };
      });
    });
    self.none = ko.pureComputed(function () { return self.rows().length === 0; });
    self.onQuery = function (event) { self.query(event.target.value); return true; };
  }
  kinds.locator = { model: LocatorKind, events: k.ACTION, props: { heading: str('Find a branch or ATM'), items: arr(), emptyText: str('Nothing matches. Try another name or area.') },
    view: '<section class="bx-panel bx-locator" :aria-labelledby="[[id]]"><h3 class="bx-panel-title" :id="[[id]]">' + txt('$properties.heading') + '</h3>'
      + '<div class="bx-control bx-payee-search"><span class="bx-search-icon" aria-hidden="true"></span><input type="search" class="bx-input bx-search" aria-label="Search by name or area" placeholder="Name or area"'
      + ' :value="[[query]]" on-input="[[onQuery]]"/></div><div class="bx-chip-row" role="group" aria-label="Show">' + each('kinds', 'c', '<button type="button" :class="[[c.data.css]]" :aria-pressed="[[c.data.pressed]]"'
      + ' on-click="[[c.data.pick]]">' + txt('c.data.label') + '</button>') + '</div>' + iff('none()', '<p class="bx-panel-empty" role="status">' + txt('$properties.emptyText') + '</p>')
      + '<ul class="bx-rows">' + each('rows', 'r', '<li class="bx-row"><span class="bx-row-main"><strong>' + txt('r.data.name') + '</strong><span class="bx-row-meta">' + txt('r.data.meta') + '</span>'
        + iff('r.data.hours', '<span class="bx-row-meta">' + txt('r.data.hours') + '</span>') + '</span><button type="button" class="bx-btn bx-btn--borderless bx-btn--sm" :aria-label="[[r.data.actionName]]"'
        + ' on-click="[[r.data.go]]">Directions</button></li>') + '</ul></section>' };

  /* ---------- chat: a conversation with the bank; new messages are announced ---------- */
  function ChatKind(context) {
    var self = this;
    base(self, context, 'bx-chat');
    self.draft = ko.observable('');
    self.lines = ko.pureComputed(function () {
      return list(self.props.messages).map(function (o) {
        var mine = o.from === 'customer';
        return { text: String(o.text || ''), who: mine ? 'You' : (o.name || 'The bank'), time: o.time || '', css: 'bx-msg' + (mine ? ' is-mine' : '') };
      });
    });
    self.off = ko.pureComputed(function () { return !self.draft().trim() || self.props.disabled; });
    self.onDraft = function (event) { self.draft(event.target.value); return true; };
    self.send = function () { if (self.off()) { return; } var t = self.draft().trim(); self.draft(''); bx.fire(self.element, 'ojAction', { text: t }); };
    self.onKey = function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); self.send(); return false; } return true; };
  }
  kinds.chat = { model: ChatKind, events: k.ACTION, props: { heading: str('Chat with us'), messages: arr(), typing: bool(), disabled: bool(), placeholder: str('Write a message') },
    view: '<section class="bx-panel bx-chat" :aria-labelledby="[[id]]"><h3 class="bx-panel-title" :id="[[id]]">' + txt('$properties.heading') + '</h3>'
      + '<div class="bx-chat-log" role="log" aria-live="polite" :aria-labelledby="[[id]]">' + each('lines', 'm', '<div :class="[[m.data.css]]"><span class="bx-msg-who">' + txt('m.data.who')
        + iff('m.data.time', ' · ' + txt('m.data.time')) + '</span><span class="bx-msg-text">' + txt('m.data.text') + '</span></div>') + '</div>'
      + iff('$properties.typing', '<p class="bx-chat-typing" role="status">The bank is writing…</p>')
      + '<div class="bx-chat-compose"><div class="bx-control"><input class="bx-input" :aria-label="[[$properties.placeholder]]" :placeholder="[[$properties.placeholder]]" :value="[[draft]]"'
      + ' :disabled="[[$properties.disabled]]" on-input="[[onDraft]]" on-keydown="[[onKey]]"/></div><button type="button" class="bx-btn bx-btn--callToAction" :disabled="[[off]]" on-click="[[send]]">Send</button></div></section>' };

  /* ---------- rating: one to five stars, as radios, and what was chosen ---------- */
  var WORDS = ['', 'Very poor', 'Poor', 'Fine', 'Good', 'Very good'];
  function RatingKind(context) {
    var self = this;
    base(self, context, 'bx-rate');
    self.stars = ko.pureComputed(function () {
      var v = self.props.value || 0;
      return [1, 2, 3, 4, 5].map(function (i) {
        var look = self.props.variant;
        return { key: self.id + '-' + i, label: i + (i === 1 ? ' star, ' : ' stars, ') + WORDS[i], on: i === v, css: 'bx-star' + (i <= v ? ' is-on' : '') + (i === v ? ' is-chosen' : ''),
          glyph: look === 'emoji' ? k.variants.FACES[i - 1] : look === 'numbers' ? String(i) : '★',
          pick: function () { self.props.value = i; return true; } };
      });
    });
    self.word = ko.pureComputed(function () { return WORDS[self.props.value || 0] || ''; });
    self.vclass = k.variants.vclass(self, 'rating');
  }
  kinds.rating = { model: RatingKind, props: { labelHint: str(), value: { type: 'number', value: 0, writeback: true }, variant: str('standard') },
    view: '<fieldset :class="[[\'bx-field bx-rating \' + vclass()]]"><legend class="bx-label">' + txt('$properties.labelHint') + '</legend><div class="bx-stars">'
      + each('stars', 's', '<label :class="[[s.data.css]]"><input type="radio" class="bx-visually-hidden" :name="[[id]]" :id="[[s.data.key]]" :checked="[[s.data.on]]" on-change="[[s.data.pick]]"/>'
        + '<span aria-hidden="true">' + txt('s.data.glyph') + '</span><span class="bx-visually-hidden">' + txt('s.data.label') + '</span></label>') + iff('word()', '<span class="bx-rating-word" aria-hidden="true">' + txt('word') + '</span>')
      + '</div></fieldset>' };

  /* ---------- group 5 ---------- */
  var g = g1.kinds, h = g2.kinds, c = g3.kinds;
  var elements = [
    register('bx-raise-request', h.form, { heading: 'Raise a request', submitLabel: 'Raise request' }),
    register('bx-track-requests', g.timeline, { label: 'Your request' }),
    register('bx-mailbox', g.rows, { heading: 'Messages', actionLabel: 'Open', emptyText: 'No messages.' }),
    register('bx-compose-mail', kinds.compose, { labelHint: 'Message to the bank' }),
    register('bx-e-receipts', g.rows, { heading: 'E-receipts', actionLabel: 'Download', emptyText: 'No receipts yet.' }),
    register('bx-certificates', g.rows, { heading: 'Certificates', actionLabel: 'Download', emptyText: 'No certificates yet.' }),
    register('bx-statement-request', kinds.period, { labelHint: 'Statement period' }),
    register('bx-statement-format', g.segmented, { labelHint: 'Format', options: ['PDF', 'CSV', 'Both'], value: 'PDF' }),
    register('bx-self-register', g.steps, { label: 'Register', steps: ['Details', 'Verify', 'Password', 'Done'] }),
    register('bx-fatca-crs', g.steps, { label: 'Tax self-certification', steps: ['Identity', 'Tax residency', 'Declaration', 'Review'] }),
    register('bx-product-showcase', h.card, { actionLabel: 'Apply now' }),
    register('bx-application-tracker', g.timeline, { label: 'Your application' }),
    register('bx-terms-consent', c.checks, { labelHint: 'Before you continue', control: 'checkbox' }),
    register('bx-loan-calculator', kinds.calc, { heading: 'Loan calculator', mode: 'loan' }),
    register('bx-eligibility-calculator', g.slider, { labelHint: 'Monthly income', max: 20000, step: 500 }),
    register('bx-td-calculator', kinds.calc, { heading: 'Deposit calculator', mode: 'td', amount: 10000, rate: 7, months: 12 }),
    register('bx-currency-converter', kinds.calc, { heading: 'Currency converter', mode: 'fx', amount: 1000, rate: 0.92, note: 'An estimate at today\'s rate. The rate is fixed when you send.' }),
    register('bx-goal-calculator', g.slider, { labelHint: 'Saving each month', max: 5000, step: 50 }),
    register('bx-locator', kinds.locator),
    register('bx-live-chat', kinds.chat),
    register('bx-feedback', kinds.rating, { labelHint: 'How was it?' }),
    register('bx-nominations', g.rows, { heading: 'Nominees', actionLabel: 'Edit', emptyText: 'No nominees yet.' }),
    register('bx-faq', g.accordion)
  ];

  return { elements: elements, kinds: kinds, kit: { instalment: instalment, maturity: maturity } };
});
