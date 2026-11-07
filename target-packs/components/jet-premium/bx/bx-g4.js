/*
 * Premium JET elements, group 4 (insights, approvals, liquidity, settings): bx-spending-chart, bx-budget-progress,
 * bx-savings-goal, bx-spend-categories, bx-approval-queue, bx-approval-detail, bx-approval-journey, bx-reroute,
 * bx-modification-requested, bx-pending-release, bx-structure-type, bx-account-structure, bx-structure-simulation,
 * bx-intercompany-limits, bx-sweep-monitor, bx-profile, bx-sign-in-options, bx-otp-delivery, bx-devices, bx-appearance,
 * bx-language, bx-alerts-subscription, bx-do-not-disturb, bx-consents, bx-transaction-limits and bx-session-summary.
 * Charts and meters show the figures the screen gives; bars are widths in steps of 5% (classes, no inline style), and
 * every figure is also text, so a screen reader hears the numbers.
 */
define(['ojs/ojcomposite', './bx-core', './bx-g1', './bx-g2', './bx-g3'], function (Composite, bx, g1, g2, g3) {
  'use strict';
  Composite = bx.withVariants(Composite);
  var ko = bx.ko;
  var k = g1.kit;
  var txt = k.txt, iff = k.iff, each = k.each, list = k.list, base = k.base, register = k.register, str = k.str, arr = k.arr;
  var kinds = {};
  /** A share as a width class in steps of 5%: bx-w-0 to bx-w-100. */
  var step = function (part, whole) { var p = whole > 0 ? Math.max(0, Math.min(1, part / whole)) : 0; return Math.round(p * 20) * 5; };
  var figure = function (n, unit) { var s = typeof n === 'number' ? n.toLocaleString() : String(n); return unit ? s + ' ' + unit : s; };

  /* ---------- chart: bars of figures, each with its label and value as text ---------- */
  function ChartKind(context) {
    var self = this;
    base(self, context, 'bx-chart');
    self.bars = ko.pureComputed(function () {
      var l = list(self.props.items);
      var top = self.props.max || Math.max.apply(null, l.map(function (o) { return Number(o.value) || 0; }).concat([0]));
      var dir = self.props.orientation === 'columns' ? 'h' : 'w';
      return l.map(function (o) {
        var v = Number(o.value) || 0;
        return { label: o.label, value: o.display !== undefined ? String(o.display) : figure(v, self.props.unit), css: 'bx-bar-fill bx-' + dir + '-' + step(v, top) + (o.tone ? ' is-' + o.tone : '') };
      });
    });
    self.css = ko.pureComputed(function () { return 'bx-chart is-' + (self.props.orientation === 'columns' ? 'columns' : 'bars'); });
  }
  kinds.chart = { model: ChartKind, props: { heading: str(), items: arr(), max: { type: 'number', value: 0 }, unit: str(), orientation: str('bars'), note: str() },
    view: '<figure :class="[[css]]" :aria-labelledby="[[id]]"><figcaption class="bx-panel-title" :id="[[id]]">' + txt('$properties.heading') + '</figcaption>'
      + '<ul class="bx-bars">' + each('bars', 'b', '<li class="bx-bar"><span class="bx-bar-label">' + txt('b.data.label') + '</span><span class="bx-bar-track" aria-hidden="true"><span :class="[[b.data.css]]"></span></span>'
        + '<span class="bx-bar-value">' + txt('b.data.value') + '</span></li>') + '</ul>' + iff('$properties.note', '<p class="bx-help">' + txt('$properties.note') + '</p>') + '</figure>' };

  /* ---------- meters: how much of each limit, budget or goal is used ---------- */
  function MetersKind(context) {
    var self = this;
    base(self, context, 'bx-meter');
    self.rows = ko.pureComputed(function () {
      return list(self.props.items).map(function (o) {
        var v = Number(o.value) || 0;
        var max = Number(o.max) || 0;
        var over = max > 0 && v > max;
        var unit = self.props.unit;
        var text = figure(v, unit) + ' of ' + figure(max, unit) + (over ? ', over by ' + figure(Math.round((v - max) * 100) / 100, unit) : '');
        return { label: o.label, text: text, now: String(Math.min(v, max)), max: String(max), key: self.id + '-' + o.i, over: over,
          css: 'bx-meter-fill bx-w-' + step(v, max) + (over ? ' is-over' : step(v, max) >= self.props.warnAt ? ' is-near' : '') };
      });
    });
  }
  kinds.meters = { model: MetersKind, props: { heading: str(), items: arr(), unit: str(), warnAt: { type: 'number', value: 90 } },
    view: '<section class="bx-panel bx-meters" :aria-label="[[$properties.heading || null]]">' + iff('$properties.heading', '<h3 class="bx-panel-title">' + txt('$properties.heading') + '</h3>')
      + each('rows', 'm', '<div class="bx-meter"><div class="bx-meter-head"><span :id="[[m.data.key]]">' + txt('m.data.label') + '</span><span :class="[[m.data.over ? \'bx-meter-text is-over\' : \'bx-meter-text\']]">'
        + txt('m.data.text') + '</span></div><div class="bx-meter-track" role="progressbar" aria-valuemin="0" :aria-valuemax="[[m.data.max]]" :aria-valuenow="[[m.data.now]]"'
        + ' :aria-valuetext="[[m.data.text]]" :aria-labelledby="[[m.data.key]]"><span :class="[[m.data.css]]"></span></div></div>') + '</section>' };

  /* ---------- group 4 ---------- */
  var g = g1.kinds, h = g2.kinds, c = g3.kinds;
  var elements = [
    register('bx-spending-chart', kinds.chart, { heading: 'Spending by month', orientation: 'columns' }),
    register('bx-budget-progress', kinds.meters, { heading: 'Budgets' }),
    register('bx-savings-goal', kinds.meters, { heading: 'Savings goal' }),
    register('bx-spend-categories', g.chips, { labelHint: 'Category', multiple: false }),
    register('bx-approval-queue', g.rows, { heading: 'Waiting for your approval', actionLabel: 'Review', emptyText: 'Nothing is waiting for you.' }),
    register('bx-approval-detail', h.kv, { heading: 'Approval', actionLabel: 'Approve' }),
    register('bx-approval-journey', g.timeline, { label: 'Approval journey' }),
    register('bx-reroute', h.picker, { labelHint: 'Re-route to' }),
    register('bx-modification-requested', g.alert, { severity: 'warning', heading: 'Sent back for changes', actionLabel: 'Modify it' }),
    register('bx-pending-release', g.rows, { heading: 'Approved, waiting for release', actionLabel: 'Release', emptyText: 'Nothing is waiting for release.' }),
    register('bx-structure-type', g.segmented, { labelHint: 'Structure', options: ['Sweep', 'Pool', 'Hybrid'] }),
    register('bx-account-structure', g.accordion, { multiple: true }),
    register('bx-structure-simulation', h.kv, { heading: 'Simulation', actionLabel: 'Run the simulation' }),
    register('bx-intercompany-limits', kinds.meters, { heading: 'Intercompany limits' }),
    register('bx-sweep-monitor', g.timeline, { label: 'Today\'s sweep' }),
    register('bx-profile', h.kv, { heading: 'Your profile', actionLabel: 'Edit profile' }),
    register('bx-sign-in-options', c.checks, { labelHint: 'Sign in with' }),
    register('bx-otp-delivery', g.segmented, { labelHint: 'Send codes by', options: ['SMS', 'Email', 'App'] }),
    register('bx-devices', g.rows, { heading: 'Your devices', actionLabel: 'Remove', emptyText: 'No devices registered.' }),
    register('bx-appearance', g.segmented, { labelHint: 'Theme', options: ['Light', 'Dark', 'System'], value: 'System' }),
    register('bx-language', h.picker, { labelHint: 'Language' }),
    register('bx-alerts-subscription', c.checks, { labelHint: 'Tell me about' }),
    register('bx-do-not-disturb', c.toggle, { labelHint: 'Quiet hours, 22:00 to 07:00', onText: 'Alerts wait until the quiet hours end; security alerts still come at once.' }),
    register('bx-consents', g.rows, { heading: 'Apps you have allowed', actionLabel: 'Revoke', emptyText: 'You have not allowed any apps.' }),
    register('bx-transaction-limits', kinds.meters, { heading: 'Your limits today' }),
    register('bx-session-summary', g.timeline, { label: 'Recent sign-ins' })
  ];

  return { elements: elements, kinds: kinds, kit: { step: step } };
});
