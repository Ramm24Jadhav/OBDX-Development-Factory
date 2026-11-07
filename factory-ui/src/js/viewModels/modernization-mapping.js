/*
 * Component mapping (UI path, step 2): how one JET element in the code maps to its premium element, part by part (from
 * the JET mapping registry), a preview of both in four states and three widths, the bank's own markup next to the
 * converted markup, and what it touches (screens by module, journeys, test files). Make the change now starts a run
 * for this component on every screen; Add to the upgrade plan puts it in a wave.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', '../services/jetPack', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz, jetPack) {
    const KIND = { same: ['Same name', 'green'], renamed: ['Renamed', 'amber'], converted: ['Same name, value converts', 'amber'], dropped: ['Not carried over', 'grey'], hand: ['Needs a hand edit', 'red'] };
    /** What the preview draws for an element: a field, a choice, a button, a container ... */
    const previewKind = (element) => {
      const e = (element || '').replace('oj-', '');
      if (/^(input-text|input-password|input-number|text-area)$/.test(e)) { return 'field'; }
      if (/^(input-date|input-date-time|input-time)$/.test(e)) { return 'date'; }
      if (/^(select|combobox)/.test(e)) { return 'select'; }
      if (/^(button|menu-button)$/.test(e)) { return 'button'; }
      if (/^buttonset/.test(e)) { return 'segmented'; }
      if (e === 'checkboxset') { return 'check'; }
      if (e === 'radioset') { return 'radio'; }
      if (e === 'switch') { return 'switch'; }
      if (/^(tab-bar|navigation-list)$/.test(e)) { return 'tabs'; }
      if (e === 'train') { return 'train'; }
      if (/^(table|list-view|data-grid)$/.test(e)) { return 'table'; }
      if (/^(dialog|popup|messages)$/.test(e)) { return 'dialog'; }
      if (/^progress/.test(e) || /gauge/.test(e)) { return 'progress'; }
      return 'generic';
    };

    function MappingViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.data = ko.observable(null);
      self.tab = ko.observable('props');
      self.device = ko.observable('desktop');
      self.state = ko.observable('default');
      self.showCode = ko.observable(false);
      self.panelOpen = ko.observable(false);
      self.starting = ko.observable(false);
      self.steps = mz.steps('ui', 2);
      self.pathName = mz.pathName('ui');

      // The premium side shows the real bx- element in the workspace's component style once the pack is loaded
      self.packReady = jetPack.ready;
      self.style = ko.observable(null);
      self.premiumCss = ko.pureComputed(() => {
        const s = self.style();
        const own = s && d().component && s.components ? s.components[d().component] : null;
        const base = s ? s.defaults : null;
        const pick = (k) => (own && own[k] ? own[k] : base ? base[k] : null);
        return jetPack.styleClasses({ look: pick('look'), motion: own && own.motion ? own.motion : base ? base.motion : null, mode: pick('mode') }) + ' factory-mm-bx is-' + self.device();
      });
      self.realKinds = ['field', 'date', 'select', 'button', 'check', 'radio', 'tabs', 'table', 'dialog'];
      self.useReal = ko.pureComputed(() => self.packReady() && self.realKinds.indexOf(self.kind()) >= 0);
      self.pvMessages = ko.pureComputed(() => (self.state() === 'error' ? [{ severity: 'error', summary: self.hint(), detail: self.hint() }] : []));
      self.pvOptions = [{ value: 'S', label: 'Savings \u2022\u2022\u2022\u2022 4521' }, { value: 'C', label: 'Current \u2022\u2022\u2022\u2022 0187' }];
      self.pvChoice = ko.observable('S');
      self.pvChecks = ko.observable(['E']);
      self.pvCheckOptions = [{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }];
      self.pvTabs = [{ id: 'c', label: 'Current' }, { id: 's', label: 'Savings' }, { id: 'd', label: 'Deposits' }];
      self.pvTab = ko.observable('c');
      self.pvRows = [{ id: 1, date: '12 Nov', text: 'Electricity bill', amount: '-1,240.00' }, { id: 2, date: '11 Nov', text: 'Salary', amount: '85,000.00' }, { id: 3, date: '09 Nov', text: 'Card payment', amount: '-3,499.00' }];
      self.pvColumns = [{ headerText: 'Date', field: 'date' }, { headerText: 'Description', field: 'text' }, { headerText: 'Amount', field: 'amount', style: 'text-align:right' }];
      self.pvValue = ko.observable('Enter beneficiary name');
      self.pvDate = ko.observable('2026-11-12');
      self.sides = [{ key: 'jet', title: 'Today (Oracle JET)', badge: 'JET' }, { key: 'premium', title: 'Premium', badge: 'Premium pack' }];
      self.deviceOptions = [{ value: 'desktop', label: 'Desktop' }, { value: 'tablet', label: 'Tablet' }, { value: 'mobile', label: 'Mobile' }];
      self.stateOptions = [{ value: 'default', label: 'Default' }, { value: 'focus', label: 'Focus' }, { value: 'error', label: 'Error' }, { value: 'disabled', label: 'Disabled' }];

      const d = () => self.data() || {};
      self.title = ko.pureComputed(() => (self.data() ? 'How ' + d().element + ' maps to ' + d().premium + ', and what it touches.' : 'How a JET component maps to its premium one.'));
      self.statusPill = ko.pureComputed(() => mz.compatPill(d().compatibility));
      self.statusDetail = ko.pureComputed(() => {
        const l = d().legend;
        if (!l) { return ''; }
        const all = l.same + l.renamed + l.hand + l.unsupported;
        return l.hand + l.unsupported === 0 ? (all ? 'All ' + all + ' properties map' : mz.statusText(d().status)) : (l.hand + l.unsupported) + ' of ' + all + ' properties need attention';
      });
      self.effortCss = ko.pureComputed(() => ui.pill(d().effort || '', { Low: 'green', Medium: 'amber', High: 'red' }[d().effort]).css);
      self.positionText = ko.pureComputed(() => (self.data() ? d().position + ' of ' + d().count : ''));
      const go = (element) => { if (element) { load(self.workspaceId(), element); } };
      self.previous = () => go(d().previous);
      self.next = () => go(d().next);
      self.hasPrevious = ko.pureComputed(() => !!d().previous);
      self.hasNext = ko.pureComputed(() => !!d().next);

      // The preview: both sides draw the same kind of element in the chosen state and width
      self.kind = ko.pureComputed(() => previewKind(d().element));
      self.isKind = (k) => ko.pureComputed(() => self.kind() === k);
      self.previewCss = ko.pureComputed(() => 'factory-mm-preview is-' + self.device() + ' is-' + self.state());
      self.label = ko.pureComputed(() => ({ field: 'Beneficiary name', date: 'Transfer date', select: 'From account', button: 'Continue', segmented: 'Frequency', check: 'Notify me by',
        radio: 'Transfer type', switch: 'Save as a payee', tabs: 'Accounts', train: 'Payment steps', table: 'Recent transactions', dialog: 'Confirm the transfer', progress: 'Monthly budget' })[self.kind()] || d().element);
      self.hint = ko.pureComputed(() => (self.state() === 'error' ? 'Enter the name as it is on the account.' : 'As on the bank records, up to 35 characters.'));
      self.disabled = ko.pureComputed(() => self.state() === 'disabled');

      self.tabs = ko.pureComputed(() => ui.tabs(self.tab, [{ value: 'props', label: 'Property mapping' }, { value: 'events', label: 'Events and bindings' },
        { value: 'a11y', label: 'Accessibility' }, { value: 'screens', label: 'Affected screens', count: d().screens || 0 }, { value: 'code', label: 'Code comparison' }]));
      self.tabKey = (vm, event) => {
        const keys = ['props', 'events', 'a11y', 'screens', 'code'];
        const at = keys.indexOf(self.tab());
        const n = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (n < 0) { return true; }
        event.preventDefault();
        self.tab(keys[n]);
        const b = document.getElementById('mmTab-' + keys[n]);
        if (b) { b.focus(); }
        return false;
      };
      const parts = (list) => (list || []).map((p) => {
        const k = KIND[p.kind] || [p.kind, 'grey'];
        // The result: kept or mapped by the factory, or finished by a person
        const ok = p.kind !== 'hand' && p.kind !== 'dropped';
        return { from: p.from, to: p.to || '—', kind: k[0], css: ui.pill(k[0], k[1]).css, note: p.note || (p.kind === 'same' ? 'Works the same' : ''),
          result: ok ? '✓ ' + (p.kind === 'same' ? 'Kept' : 'Mapped') : p.kind === 'dropped' ? '— Not carried over' : '! A person finishes', resultCss: ok ? 'factory-mm-ok' : 'factory-mm-todo' };
      });
      self.props = ko.pureComputed(() => parts(d().properties));
      self.events = ko.pureComputed(() => parts(d().events));
      self.slots = ko.pureComputed(() => (d().slots || []).join(', ') || 'None');
      self.manual = ko.pureComputed(() => d().manual || []);
      self.legend = ko.pureComputed(() => {
        const l = d().legend;
        if (!l) { return []; }
        return [['Same name', l.same, 'var(--fx-success)'], ['Renamed or converted', l.renamed, 'var(--fx-warning)'], ['Needs a hand edit', l.hand, 'var(--fx-danger)'],
          ['Not carried over', l.unsupported, 'var(--fx-border-strong)']].map((x) => ({ label: x[0], n: x[1], style: { background: x[2] } }));
      });
      self.codeJet = ko.pureComputed(() => d().codeJet || 'The analysis found no markup to show for this element.');
      self.codePremium = ko.pureComputed(() => d().codePremium || (d().component ? 'The premium markup shows when the bank’s markup is found.' : 'There is no premium element: the screen keeps the JET element.'));
      self.codeFrom = ko.pureComputed(() => d().codeFrom || '');

      self.impact = ko.pureComputed(() => {
        if (!self.data()) { return []; }
        return [[mz.num(d().screens), 'Screens', '', true], [mz.num((d().modules || []).length), 'Modules', '', true],
          [mz.num((d().journeys || []).length), 'Journeys', (d().journeys || []).slice(0, 3).map((j) => j.name).join(', '), true],
          [mz.num((d().tests || []).length), 'Test files that use it', 'Found in the code', true],
          [d().effort, 'Effort', self.statusDetail(), false]].map((x) => ({ n: x[0], k: x[1], sub: x[2], link: x[3], open: () => self.panelOpen(true) }));
      });
      self.checks = ko.pureComputed(() => d().checks || []);
      self.moduleList = ko.pureComputed(() => (d().modules || []).map((m) => ({ module: m.module, uses: m.uses, count: m.screens.length,
        screens: m.screens.map((s) => ({ name: s.name, id: s.id, uses: s.uses })) })));
      self.journeys = ko.pureComputed(() => d().journeys || []);
      self.tests = ko.pureComputed(() => d().tests || []);
      self.testsShown = ko.pureComputed(() => self.tests().slice(0, 3));
      self.testsMore = ko.pureComputed(() => (self.tests().length > 3 ? '+' + (self.tests().length - 3) + ' more' : ''));
      self.allTests = ko.observable(false);
      self.testsList = ko.pureComputed(() => (self.allTests() ? self.tests() : self.testsShown()));
      self.showAllTests = () => self.allTests(true);
      self.allPassed = ko.pureComputed(() => self.manual().length === 0);
      self.viewAllChecks = () => self.tab('props');
      self.packVersion = ko.observable('');
      self.toInventory = () => mz.open('modernization-components');
      self.packMissing = ko.pureComputed(() => /pack|update/i.test(self.error() || ''));
      self.closePanel = () => self.panelOpen(false);
      self.exportList = () => {
        const lines = ['Module,Screen,Uses'];
        (d().modules || []).forEach((m) => m.screens.forEach((s) => lines.push([m.module, s.name, s.uses].map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(','))));
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = d().element + '-screens.csv';
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };

      self.back = () => mz.open('modernization-components');
      self.addToPlan = () => mz.open('modernization-upgrade', { components: [d().element] });
      self.makeChange = () => {
        if (!self.canManage() || self.starting()) { return; }
        self.starting(true);
        api.post('workspaces/' + self.workspaceId() + '/modernization/runs', { path: 'ui', components: [d().element] }).then((run) => {
          toast.success('Started: ' + d().element + ' on every screen, as one change.');
          mz.open('modernization-workspace', { runId: run.id });
        }).catch((e) => toast.error(ui.errorText(e))).then(() => self.starting(false));
      };
      self.canChange = ko.pureComputed(() => self.canManage() && !!d().component && d().compatibility !== 'custom' && !self.starting());
      self.moreItems = ko.pureComputed(() => [{ value: 'where', label: 'Where it is used' }, { value: 'code', label: self.showCode() ? 'Hide the code' : 'Show the code' },
        { value: 'next', label: 'Next component', disabled: !self.hasNext() }, { separator: true }, { value: 'plan', label: 'Add to the upgrade plan', disabled: !self.canManage() },
        { value: 'change', label: 'Make the change now', disabled: !self.canChange() }, { value: 'inventory', label: 'Back to the inventory' }]);
      self.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'next') { self.next(); } else if (v === 'plan') { self.addToPlan(); } else if (v === 'where') { self.panelOpen(true); }
        else if (v === 'code') { self.showCode(!self.showCode()); } else if (v === 'change') { self.makeChange(); } else { self.back(); }
      };

      const load = (id, element) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        api.get('workspaces/' + id + '/modernization/mapping' + (element ? '?element=' + encodeURIComponent(element) : '')).then((x) => {
          if (id === self.workspaceId()) { self.data(x); self.error(null); }
        }).catch((e) => { self.data(null); self.error(ui.errorText(e)); }).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe((id) => load(id));
      self.connected = () => {
        accUtils.announce('Component mapping loaded.', 'assertive');
        document.title = 'Component mapping';
        const asked = mz.take();
        if (asked.tab) { self.tab(asked.tab); }
        load(self.workspaceId(), asked.element);
        jetPack.load().catch(() => null);
        api.get('component-packs').then((c) => { const p = (c.packs || []).find((x) => x.id === 'jet-premium'); self.packVersion(p ? p.version : ''); }).catch(() => null);
        if (self.workspaceId()) { api.get('workspaces/' + self.workspaceId() + '/component-style').then((s) => self.style(s.style)).catch(() => null); }
      };
      self.disconnected = () => sub.dispose();
    }

    return MappingViewModel;
  }
);
