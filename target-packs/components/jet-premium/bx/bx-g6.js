/*
 * Premium JET elements, group 6 (dashboard widgets): the retail widgets bx-overview, bx-quick-insights,
 * bx-recent-transactions, bx-bills-widget, bx-spend-analysis, bx-goals, bx-budgets, bx-calculators, bx-credit-score,
 * bx-rewards, bx-financial-advisor, bx-special-offers, bx-credit-cards-overview, bx-loans-overview and
 * bx-delinquency-notice; and the corporate ones bx-financial-overview, bx-position-by-currency, bx-credit-line-usage,
 * bx-bills-receivable-payable, bx-trade-instruments, bx-reports, bx-accounts-corp, bx-corporate-limits,
 * bx-transactions-widget, bx-last-5-payments, bx-bulk-file-upload, bx-quick-links-corp, bx-work-snapshot,
 * bx-notifications-widget, bx-pending-for-action, bx-my-limits and bx-pending-approvals.
 * A widget shows what the screen gives it and says what was pressed; the dashboard fetches and arranges them.
 */
define(['ojs/ojcomposite', './bx-core', './bx-g1', './bx-g2', './bx-g4', './bx-g5', './bx-forms'], function (Composite, bx, g1, g2, g4, g5) {
  'use strict';
  var ko = bx.ko;
  var k = g1.kit;
  var txt = k.txt, iff = k.iff, each = k.each, list = k.list, base = k.base, register = k.register, str = k.str, arr = k.arr;
  var kinds = {};

  /* ---------- tab summary: a figure per tab, and View all ---------- */
  function TabSummaryKind(context) {
    var self = this;
    base(self, context, 'bx-tabsum');
    var pick = function () { var l = list(self.props.items); var on = l.filter(function (o) { return o.id === String(self.props.selection); })[0]; return on || l[0]; };
    self.tabs = ko.pureComputed(function () {
      var current = pick();
      return list(self.props.items).map(function (o) {
        var on = !!current && o.id === current.id;
        return { label: o.label, tabId: self.id + '-t' + o.i, selected: on ? 'true' : 'false', tab: on ? '0' : '-1', css: 'bx-tab' + (on ? ' is-on' : ''),
          choose: function () { self.props.selection = o.id; } };
      });
    });
    self.current = ko.pureComputed(function () { var c = pick(); return c ? { summary: String(c.summary || ''), tabId: self.id + '-t' + c.i } : { summary: '', tabId: '' }; });
    self.onKey = function (event) {
      var l = list(self.props.items);
      var c = pick();
      var next = k.arrow(event.key, c ? c.i : 0, l.length);
      if (next < 0) { return true; }
      event.preventDefault();
      self.props.selection = l[next].id;
      k.focusLater(self, '.bx-tab.is-on');
      return false;
    };
    self.act = function () { var c = pick(); bx.fire(self.element, 'ojAction', { value: c ? c.id : '' }); };
  }
  kinds.tabsum = { model: TabSummaryKind, events: k.ACTION, props: { heading: str(), items: arr(), selection: { type: 'any', writeback: true }, actionLabel: str('View all') },
    view: '<section class="bx-panel bx-tabsum" :aria-labelledby="[[id]]"><h3 class="bx-panel-title" :id="[[id]]">' + txt('$properties.heading') + '</h3>'
      + '<div class="bx-tabs" role="tablist" :aria-labelledby="[[id]]" on-keydown="[[onKey]]">' + each('tabs', 't', '<button type="button" role="tab" :id="[[t.data.tabId]]" :class="[[t.data.css]]"'
        + ' :aria-selected="[[t.data.selected]]" :tabindex="[[t.data.tab]]" :aria-controls="[[id + \'-panel\']]" on-click="[[t.data.choose]]">' + txt('t.data.label') + '</button>') + '</div>'
      + '<div class="bx-tabsum-panel" role="tabpanel" :id="[[id + \'-panel\']]" :aria-labelledby="[[current().tabId]]"><p class="bx-tabsum-figure">' + txt('current().summary') + '</p>'
      + iff('$properties.actionLabel', '<button type="button" class="bx-thing-action" on-click="[[act]]">' + txt('$properties.actionLabel') + '</button>') + '</div></section>' };

  /* ---------- upload widget: a file for bulk payments, its template, and Upload ---------- */
  function UploadWidgetKind(context) {
    var self = this;
    base(self, context, 'bx-upw');
    self.onValue = function (event) { if (!event.detail || event.detail.updatedFrom !== 'external') { self.props.value = event.detail ? event.detail.value : []; } return true; };
    self.none = ko.pureComputed(function () { return !(self.props.value || []).length; });
    self.upload = function () { if (!self.none()) { bx.fire(self.element, 'ojAction', { action: 'upload', value: self.props.value }); } };
    self.template = function () { bx.fire(self.element, 'ojAction', { action: 'template' }); };
  }
  kinds.uploadw = { model: UploadWidgetKind, events: k.ACTION,
    props: { heading: str('Bulk file upload'), labelHint: str('Payments file'), accept: { type: 'Array<string>', value: ['.csv', '.xlsx'] }, value: { type: 'Array<Object>', value: [], writeback: true },
      templateLabel: str('Download the template'), actionLabel: str('Upload') },
    view: '<section class="bx-panel" :aria-labelledby="[[id]]"><h3 class="bx-panel-title" :id="[[id]]">' + txt('$properties.heading') + '</h3>'
      + '<bx-document-upload label-hint="[[$properties.labelHint]]" accept="[[$properties.accept]]" value="[[$properties.value]]" on-value-changed="[[onValue]]"></bx-document-upload>'
      + '<div class="bx-kv-actions"><button type="button" class="bx-btn bx-btn--borderless" on-click="[[template]]">' + txt('$properties.templateLabel') + '</button>'
      + '<button type="button" class="bx-btn bx-btn--callToAction" :disabled="[[none]]" on-click="[[upload]]">' + txt('$properties.actionLabel') + '</button></div></section>' };

  /* ---------- group 6 ---------- */
  var g = g1.kinds, h = g2.kinds, c = g4.kinds, d = g5.kinds;
  var elements = [
    register('bx-overview', h.tiles, { heading: 'Overview' }),
    register('bx-quick-insights', g.rows, { heading: 'Worth a look', actionLabel: 'Act', emptyText: 'Nothing needs you today.' }),
    register('bx-recent-transactions', h.tx, { heading: 'Recent transactions' }),
    register('bx-bills-widget', g.rows, { heading: 'Bills', actionLabel: 'Pay now', emptyText: 'No bills due.' }),
    register('bx-spend-analysis', c.chart, { heading: 'Where your money went' }),
    register('bx-goals', c.meters, { heading: 'Goals' }),
    register('bx-budgets', c.meters, { heading: 'Budgets' }),
    register('bx-calculators', d.calc, { heading: 'Calculators', mode: 'loan' }),
    register('bx-credit-score', c.meters, { heading: 'Credit score', warnAt: 101 }),
    register('bx-rewards', h.tiles, { heading: 'Rewards', interactive: false }),
    register('bx-financial-advisor', h.card, { actionLabel: 'Send a message' }),
    register('bx-special-offers', h.card, { actionLabel: 'Apply now' }),
    register('bx-credit-cards-overview', h.tiles, { heading: 'Credit cards' }),
    register('bx-loans-overview', h.tiles, { heading: 'Loans' }),
    register('bx-delinquency-notice', g.alert, { severity: 'error', heading: 'Payment overdue', actionLabel: 'Pay now' }),
    register('bx-financial-overview', h.tiles, { heading: 'Financial position', interactive: false }),
    register('bx-position-by-currency', c.chart, { heading: 'Position by currency' }),
    register('bx-credit-line-usage', c.meters, { heading: 'Credit lines' }),
    register('bx-bills-receivable-payable', h.tiles, { heading: 'Trade bills' }),
    register('bx-trade-instruments', g.rows, { heading: 'Expiring soon', actionLabel: 'View', emptyText: 'Nothing expires soon.' }),
    register('bx-reports', g.rows, { heading: 'Reports', actionLabel: 'Download', emptyText: 'No reports yet.' }),
    register('bx-accounts-corp', kinds.tabsum, { heading: 'Accounts' }),
    register('bx-corporate-limits', c.meters, { heading: 'Limits' }),
    register('bx-transactions-widget', kinds.tabsum, { heading: 'Transactions' }),
    register('bx-last-5-payments', g.rows, { heading: 'Last 5 payments', actionLabel: 'Repeat', emptyText: 'No payments yet.' }),
    register('bx-bulk-file-upload', kinds.uploadw),
    register('bx-quick-links-corp', h.quick, { label: 'Quick links' }),
    register('bx-work-snapshot', h.tiles, { heading: 'Today\'s work' }),
    register('bx-notifications-widget', g.rows, { heading: 'Notifications', actionLabel: 'Read', emptyText: 'No notifications.' }),
    register('bx-pending-for-action', c.chart, { heading: 'Pending for action' }),
    register('bx-my-limits', c.meters, { heading: 'My limits' }),
    register('bx-pending-approvals', g.rows, { heading: 'Pending approvals', actionLabel: 'Approve', emptyText: 'Nothing is waiting for you.' })
  ];

  return { elements: elements, kinds: kinds };
});
