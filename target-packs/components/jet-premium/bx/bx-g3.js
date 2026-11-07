/*
 * Premium JET elements, group 3 (loans, cards, security): bx-loan-summary, bx-loan-repayment, bx-loan-schedule,
 * bx-promise-to-pay, bx-disbursement, bx-card-tile, bx-card-list, bx-activate-card, bx-convert-emi, bx-redeem-points,
 * bx-spend-limit, bx-card-controls, bx-block-card, bx-reset-pin, bx-raise-dispute, bx-add-on-card, bx-card-statements,
 * bx-otp, bx-biometric, bx-session-timeout, bx-secure-confirmation, bx-sensitive, bx-kyc-steps and bx-fraud-alert.
 * Nothing secret is kept: a code or PIN lives only in the field until the screen takes it, a card number is shown
 * masked (the last four digits), and the biometric prompt only asks; the screen talks to the device and the bank.
 */
define(['ojs/ojcomposite', './bx-core', './bx-g1', './bx-g2'], function (Composite, bx, g1, g2) {
  'use strict';
  var ko = bx.ko;
  var k = g1.kit;
  var txt = k.txt, iff = k.iff, each = k.each, list = k.list, base = k.base, register = k.register, str = k.str, bool = k.bool, num = k.num, arr = k.arr;
  var kinds = {};
  /** The last four digits behind dots, as banks show a card or account number. */
  var masked = function (number) { var d = String(number || '').replace(/\D/g, ''); return d ? '•••• ' + d.slice(-4) : ''; };

  /* ---------- schedule: a table of dates and amounts ---------- */
  function ScheduleKind(context) {
    var self = this;
    base(self, context, 'bx-sched');
    self.cols = ko.pureComputed(function () {
      return (self.props.columns || []).map(function (c) { return { header: c.headerText, css: 'bx-th' + (c.align === 'end' ? ' is-end' : '') }; });
    });
    self.rows = ko.pureComputed(function () {
      return (self.props.rows || []).map(function (r) {
        return { css: 'bx-tr' + (r.status ? ' is-' + r.status : ''), cells: (self.props.columns || []).map(function (c) { return { text: r[c.field] === undefined ? '' : String(r[c.field]), css: 'bx-td' + (c.align === 'end' ? ' is-end' : '') }; }) };
      });
    });
  }
  kinds.schedule = { model: ScheduleKind,
    props: { caption: str(), columns: { type: 'Array<Object>', value: [{ field: 'date', headerText: 'Due date' }, { field: 'amount', headerText: 'Instalment', align: 'end' }] }, rows: arr() },
    view: '<div class="bx-grid-wrap"><table class="bx-grid"><caption>' + txt('$properties.caption') + '</caption><thead><tr>' + each('cols', 'c', '<th scope="col" :class="[[c.data.css]]">' + txt('c.data.header') + '</th>')
      + '</tr></thead><tbody>' + each('rows', 'r', '<tr :class="[[r.data.css]]">' + each('r.data.cells', 'x', '<td :class="[[x.data.css]]">' + txt('x.data.text') + '</td>') + '</tr>') + '</tbody></table></div>' };

  /* ---------- card face: the card's picture with the number masked, frozen when blocked ---------- */
  function CardFaceKind(context) {
    var self = this;
    base(self, context, 'bx-cardface');
    self.number = ko.pureComputed(function () { return masked(self.props.number); });
    self.css = ko.pureComputed(function () { return 'bx-card-face' + (self.props.frozen ? ' is-frozen' : ''); });
    self.name = ko.pureComputed(function () { return [self.props.label, self.props.network, 'ending ' + String(self.props.number || '').replace(/\D/g, '').slice(-4), self.props.frozen ? 'blocked' : ''].filter(Boolean).join(', '); });
  }
  kinds.cardface = { model: CardFaceKind, props: { label: str(), number: str(), holder: str(), expiry: str(), network: str(), frozen: bool() },
    view: '<div :class="[[css]]" role="img" :aria-label="[[name]]"><span class="bx-card-face-label" aria-hidden="true">' + txt('$properties.label') + '</span>'
      + '<span class="bx-card-face-number bx-mono" aria-hidden="true">' + txt('number') + '</span><span class="bx-card-face-foot" aria-hidden="true"><span>' + txt('$properties.holder') + '</span><span>'
      + txt('$properties.expiry') + '</span><strong>' + txt('$properties.network') + '</strong></span>' + iff('$properties.frozen', '<span class="bx-card-face-lock" aria-hidden="true">Blocked</span>') + '</div>' };

  /* ---------- code: a one-time code, activation code or PIN in slots; masked for a PIN ---------- */
  function CodeKind(context) {
    var self = this;
    bx.fieldState(self, context, function () { return self.props.value; });
    self.slots = ko.pureComputed(function () {
      var v = String(self.props.value || '');
      var out = [];
      for (var i = 0; i < (self.props.length || 6); i++) {
        var c = v.charAt(i);
        out.push({ ch: c ? (self.props.masked ? '•' : c) : '', css: 'bx-slot' + (c ? ' is-filled' : '') + (i === v.length && self.focused() ? ' is-next' : '') });
      }
      return out;
    });
    self.type = ko.pureComputed(function () { return self.props.masked ? 'password' : 'text'; });
    self.auto = ko.pureComputed(function () { return self.props.masked ? 'off' : 'one-time-code'; });
    self.onInput = function (event) {
      var v = String(event.target.value || '').replace(self.props.digitsOnly === false ? /\s/g : /\D/g, '').slice(0, self.props.length || 6);
      if (event.target.value !== v) { event.target.value = v; }
      self.props.value = v;
      if (v.length === (self.props.length || 6)) { bx.fire(self.element, 'ojComplete', { value: v }); }
      return true;
    };
    self.resend = function () { bx.fire(self.element, 'ojAction', {}); };
  }
  kinds.code = { model: CodeKind, events: { ojComplete: { bubbles: true }, ojAction: { bubbles: true } }, methods: { validate: {}, reset: {}, showMessages: {} },
    props: (function () { var p = k.copy(bx.FIELD); p.value = { type: 'string', writeback: true, value: '' }; p.length = num(6); p.masked = bool(); p.digitsOnly = bool(true); p.actionLabel = str(); return p; }()),
    view: '<div :class="[[fieldCss() + \' bx-code\']]"><label class="bx-label" :for="[[id]]">' + txt('$properties.labelHint') + '</label><div class="bx-slots">'
      + '<input class="bx-code-input" :id="[[id]]" :type="[[type]]" :value="[[$properties.value]]" :maxlength="[[$properties.length]]" inputmode="numeric" :autocomplete="[[auto]]"'
      + ' :disabled="[[$properties.disabled]]" :aria-required="[[$properties.required ? \'true\' : null]]" :aria-invalid="[[invalid]]" :aria-describedby="[[describedBy]]" spellcheck="false"'
      + ' on-input="[[onInput]]" on-focus="[[onFocus]]" on-blur="[[onBlur]]"/>' + each('slots', 's', '<span :class="[[s.data.css]]" aria-hidden="true">' + txt('s.data.ch') + '</span>') + '</div>'
      + iff('error()', '<span class="bx-error" :id="[[id + \'-err\']]" role="alert"><span class="bx-error-icon" aria-hidden="true">!</span>' + txt('error') + '</span>')
      + iff('!error() && help()', '<span class="bx-help" :id="[[id + \'-help\']]">' + txt('help') + '</span>')
      + iff('$properties.actionLabel', '<button type="button" class="bx-alert-action bx-code-action" on-click="[[resend]]">' + txt('$properties.actionLabel') + '</button>') + '</div>' };

  /* ---------- checks: several settings, each a switch (or a checkbox) ---------- */
  function ChecksKind(context) {
    var self = this;
    base(self, context, 'bx-checks');
    self.items = ko.pureComputed(function () {
      var value = (self.props.value || []).map(String);
      return list(self.props.options).map(function (o, i) {
        var v = o.value !== undefined ? String(o.value) : o.id;
        var on = value.indexOf(v) >= 0;
        return { label: o.label, meta: o.meta || '', key: self.id + '-' + i, on: on, checked: on ? 'true' : 'false', disabled: o.disabled || self.props.disabled,
          toggle: function () {
            if (o.disabled || self.props.disabled) { return true; }
            var now = (self.props.value || []).slice();
            self.props.value = on ? now.filter(function (x) { return String(x) !== v; }) : now.concat([o.value !== undefined ? o.value : o.id]);
            return true;
          } };
      });
    });
  }
  kinds.checks = { model: ChecksKind, props: { labelHint: str(), options: arr(), value: { type: 'Array<any>', value: [], writeback: true }, control: str('switch'), disabled: bool() },
    view: '<fieldset class="bx-field bx-checks"><legend class="bx-label">' + txt('$properties.labelHint') + '</legend>'
      + each('items', 'c', '<div class="bx-switch-row">' + iff('$properties.control === \'switch\'', '<span class="bx-choice-text"><span class="bx-switch-label" :id="[[c.data.key]]">' + txt('c.data.label') + '</span>'
        + iff('c.data.meta', '<span class="bx-choice-meta">' + txt('c.data.meta') + '</span>') + '</span><button type="button" role="switch" class="bx-switch" :aria-checked="[[c.data.checked]]"'
        + ' :aria-labelledby="[[c.data.key]]" :disabled="[[c.data.disabled]]" on-click="[[c.data.toggle]]"></button>')
        + iff('$properties.control !== \'switch\'', '<label :class="[[c.data.on ? \'bx-choice is-on\' : \'bx-choice\']]"><input type="checkbox" class="bx-choice-input" :checked="[[c.data.on]]"'
          + ' :disabled="[[c.data.disabled]]" on-change="[[c.data.toggle]]"/><span class="bx-choice-mark" aria-hidden="true"></span><span class="bx-choice-label">' + txt('c.data.label') + '</span></label>')
        + '</div>') + '</fieldset>' };

  /* ---------- toggle: one setting with what it means when on ---------- */
  function ToggleKind(context) {
    var self = this;
    base(self, context, 'bx-toggle');
    self.checked = ko.pureComputed(function () { return self.props.value ? 'true' : 'false'; });
    self.note = ko.pureComputed(function () { return self.props.value ? self.props.onText : self.props.offText; });
    self.toggle = function () { if (!self.props.disabled) { self.props.value = !self.props.value; } };
  }
  kinds.toggle = { model: ToggleKind, props: { labelHint: str(), value: { type: 'boolean', value: false, writeback: true }, onText: str(), offText: str(), disabled: bool(), tone: str() },
    view: '<div :class="[[\'bx-field bx-toggle\' + ($properties.value && $properties.tone ? \' is-\' + $properties.tone : \'\')]]"><div class="bx-switch-row"><span class="bx-switch-label" :id="[[id]]">' + txt('$properties.labelHint') + '</span>'
      + '<button type="button" role="switch" class="bx-switch" :aria-checked="[[checked]]" :aria-labelledby="[[id]]" :aria-describedby="[[note() ? id + \'-note\' : null]]" :disabled="[[$properties.disabled]]"'
      + ' on-click="[[toggle]]"></button></div>' + iff('note()', '<span class="bx-help" role="status" :id="[[id + \'-note\']]">' + txt('note') + '</span>') + '</div>' };

  /* ---------- challenge: ask for a biometric or a passkey; the screen does the asking ---------- */
  function ChallengeKind(context) {
    var self = this;
    base(self, context, 'bx-chal');
    self.icon = ko.pureComputed(function () { return { face: '☺', fingerprint: '◉', passkey: '⚿' }[self.props.method] || '◉'; });
    self.failed = ko.pureComputed(function () { return self.props.state === 'failed'; });
    self.waiting = ko.pureComputed(function () { return self.props.state === 'waiting'; });
    self.go = function () { if (!self.waiting()) { bx.fire(self.element, 'ojAction', { action: 'verify' }); } };
    self.other = function () { bx.fire(self.element, 'ojAction', { action: 'other' }); };
  }
  kinds.challenge = { model: ChallengeKind, events: k.ACTION,
    props: { heading: str('Confirm it is you'), text: str(), method: str('fingerprint'), actionLabel: str('Use fingerprint'), otherLabel: str('Use a code instead'), state: str('ready'),
      failedText: str('That did not work. Try again, or use a code.') },
    view: '<section class="bx-card bx-challenge" :aria-labelledby="[[id]]"><span :class="[[\'bx-challenge-icon\' + (waiting() ? \' is-waiting\' : \'\')]]" aria-hidden="true">' + txt('icon') + '</span>'
      + '<h3 class="bx-card-title" :id="[[id]]">' + txt('$properties.heading') + '</h3>' + iff('$properties.text', '<p class="bx-thing-text">' + txt('$properties.text') + '</p>')
      + iff('failed()', '<p class="bx-error" role="alert"><span class="bx-error-icon" aria-hidden="true">!</span>' + txt('$properties.failedText') + '</p>')
      + '<div class="bx-kv-actions"><button type="button" class="bx-btn bx-btn--borderless" on-click="[[other]]">' + txt('$properties.otherLabel') + '</button>'
      + '<button type="button" class="bx-btn bx-btn--callToAction" :aria-busy="[[waiting() ? \'true\' : null]]" on-click="[[go]]">' + txt('$properties.actionLabel') + '</button></div></section>' };

  /* ---------- timeout: the session is about to end; stay or sign out ---------- */
  function TimeoutKind(context) {
    var self = this;
    base(self, context, 'bx-timeout');
    self.left = ko.observable(self.props.seconds || 60);
    var timer = null;
    var stop = function () { if (timer) { window.clearTimeout(timer); timer = null; } };
    var tick = function () {
      timer = window.setTimeout(function () {
        timer = null;
        self.left(Math.max(0, self.left() - 1));
        if (self.left() === 0) { self.props.open = false; bx.fire(self.element, 'ojAction', { action: 'expired' }); } else { tick(); }
      }, 1000);
    };
    self.start = function () { stop(); self.left(self.props.seconds || 60); tick(); k.focusLater(self, '.bx-timeout-stay'); };
    if (self.props.open) { self.start(); }
    self.propertyChanged = function (d) { if (d.property === 'open') { if (d.value) { self.start(); } else { stop(); } } };
    self.disconnected = stop;
    self.text = ko.pureComputed(function () {
      var s = self.left();
      return 'For your security you will be signed out in ' + (s >= 60 ? Math.ceil(s / 60) + (s >= 120 ? ' minutes.' : ' minute.') : s + (s === 1 ? ' second.' : ' seconds.'));
    });
    // Said once when it opens and again in the last ten seconds, not every second
    self.spoken = ko.pureComputed(function () { var s = self.left(); return s === (self.props.seconds || 60) || s === 10 ? self.text() : ''; });
    self.stay = function () { stop(); self.props.open = false; bx.fire(self.element, 'ojAction', { action: 'stay' }); };
    self.signOut = function () { stop(); self.props.open = false; bx.fire(self.element, 'ojAction', { action: 'signOut' }); };
    self.vclass = k.variants.vclass(self);
    self.ring = ko.pureComputed(function () { return k.variants.ringOffset(self.left() / (self.props.seconds || 60), 20); });
  }
  kinds.timeout = { model: TimeoutKind, events: k.ACTION, props: { open: { type: 'boolean', value: false, writeback: true }, seconds: num(60), heading: str('Are you still there?'), variant: str('default') },
    view: iff('$properties.open', '<div class="bx-dialog-backdrop"></div><div :class="[[\'bx-dialog bx-timeout\' + vclass()]]" role="alertdialog" aria-modal="true" tabindex="-1" :aria-labelledby="[[id + \'-t\']]" :aria-describedby="[[id + \'-d\']]">'
      + '<div class="bx-dialog-header"><h2 class="bx-dialog-title" :id="[[id + \'-t\']]">' + txt('$properties.heading') + '</h2></div><div class="bx-dialog-body">'
      + iff('$properties.variant === \'countdown\'', '<span class="bx-countdown" aria-hidden="true"><svg viewBox="0 0 44 44" focusable="false"><circle class="bx-countdown-track" cx="22" cy="22" r="20"></circle>'
        + '<circle class="bx-countdown-fill" cx="22" cy="22" r="20" stroke-dasharray="125.7" :stroke-dashoffset="[[ring]]"></circle></svg><span class="bx-countdown-num">' + txt('left') + '</span></span>')
      + '<p :id="[[id + \'-d\']]">' + txt('text') + '</p>'
      + '<span class="bx-visually-hidden" aria-live="assertive">' + txt('spoken') + '</span></div><div class="bx-dialog-footer"><button type="button" class="bx-btn bx-btn--borderless" on-click="[[signOut]]">Sign out</button>'
      + '<button type="button" class="bx-btn bx-btn--callToAction bx-timeout-stay" on-click="[[stay]]">Stay signed in</button></div></div>') };

  /* ---------- sensitive: a number shown masked, shown in full on request ---------- */
  function SensitiveKind(context) {
    var self = this;
    base(self, context, 'bx-sens');
    self.shown = ko.observable(false);
    self.text = ko.pureComputed(function () { return self.shown() ? String(self.props.value || '') : masked(self.props.value); });
    self.toggleText = ko.pureComputed(function () { return self.shown() ? 'Hide' : 'Show'; });
    self.toggleName = ko.pureComputed(function () { return (self.shown() ? 'Hide ' : 'Show ') + (self.props.label || 'the number'); });
    self.pressed = ko.pureComputed(function () { return self.shown() ? 'true' : 'false'; });
    self.toggle = function () { self.shown(!self.shown()); };
  }
  kinds.sensitive = { model: SensitiveKind, props: { label: str(), value: str() },
    view: '<div class="bx-field bx-sensitive"><span class="bx-label" :id="[[id]]">' + txt('$properties.label') + '</span><div class="bx-control is-readonly" role="group" :aria-labelledby="[[id]]"><span class="bx-input bx-mono bx-sensitive-value">'
      + txt('text') + '</span><button type="button" class="bx-reveal" :aria-pressed="[[pressed]]" :aria-label="[[toggleName]]" on-click="[[toggle]]">' + txt('toggleText') + '</button></div></div>' };

  /* ---------- group 3 ---------- */
  var g = g1.kinds;
  var h = g2.kinds;
  var elements = [
    register('bx-loan-summary', h.tiles, { heading: 'Your loans' }),
    register('bx-loan-repayment', h.form, { heading: 'Repay a loan', submitLabel: 'Review repayment' }),
    register('bx-loan-schedule', kinds.schedule, { caption: 'Repayment schedule' }),
    register('bx-promise-to-pay', h.kv, { heading: 'Promise to pay', actionLabel: 'Make the promise' }),
    register('bx-disbursement', g.timeline, { label: 'Disbursements' }),
    register('bx-card-tile', kinds.cardface),
    register('bx-card-list', h.tiles, { heading: 'Your cards' }),
    register('bx-activate-card', kinds.code, { labelHint: 'Enter the activation code', length: 6 }),
    register('bx-convert-emi', g.segmented, { labelHint: 'Pay over', options: ['3 months', '6 months', '12 months'] }),
    register('bx-redeem-points', g.slider, { labelHint: 'Points to redeem', max: 12400, step: 100 }),
    register('bx-spend-limit', g.slider, { labelHint: 'Daily card limit', max: 10000, step: 100 }),
    register('bx-card-controls', kinds.checks, { labelHint: 'Allow' }),
    register('bx-block-card', kinds.toggle, { labelHint: 'Block the card', onText: 'The card is blocked: payments and withdrawals are refused until you unblock it.', tone: 'danger' }),
    register('bx-reset-pin', kinds.code, { labelHint: 'Choose a new PIN', length: 4, masked: true }),
    register('bx-raise-dispute', h.form, { heading: 'Raise a dispute', submitLabel: 'Raise dispute' }),
    register('bx-add-on-card', h.form, { heading: 'Add-on card', submitLabel: 'Apply' }),
    register('bx-card-statements', g.rows, { heading: 'Statements', actionLabel: 'Download', emptyText: 'No statements yet.' }),
    register('bx-otp', kinds.code, { labelHint: 'Enter the code', length: 6, actionLabel: 'Send a new code' }),
    register('bx-biometric', kinds.challenge),
    register('bx-session-timeout', kinds.timeout),
    register('bx-secure-confirmation', h.kv, { heading: 'Confirm the payment', actionLabel: 'Confirm with the code' }),
    register('bx-sensitive', kinds.sensitive, { label: 'Card number' }),
    register('bx-kyc-steps', g.steps, { label: 'Verify your identity', steps: ['ID', 'Selfie', 'Address'] }),
    register('bx-fraud-alert', g.alert, { severity: 'error', heading: 'Was this you?', actionLabel: 'Review it' })
  ];

  return { elements: elements, kinds: kinds, kit: { masked: masked } };
});
