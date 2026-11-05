/*
 * Modernization history: every run in the workspace with its change and result, runs per week by result, a run's
 * steps, files and delivery in a side panel, the report as CSV and the runs' logs as a zip.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    const RESULT = { delivered: 'Delivered', open: 'In progress', rejected: 'Rejected', failed: 'Failed' };
    const groupOf = (state) => (state === 'delivered' ? 'delivered' : state === 'rejected' ? 'rejected' : state === 'failed' ? 'failed' : 'open');
    const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

    function HistoryViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.runs = ko.observableArray([]);
      self.range = ko.observable('90');
      self.result = ko.observable('all');
      self.query = ko.observable('');
      self.picked = ko.observable({});
      self.panelRun = ko.observable(null);
      self.panelChange = ko.observable(null);
      self.panelTab = ko.observable('steps');
      self.panelOpen = ko.observable(false);
      self.rangeOptions = [{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last year' }, { value: 'all', label: 'All time' }];

      const inRange = ko.pureComputed(() => {
        const days = self.range() === 'all' ? null : Number(self.range());
        const since = days ? Date.now() - days * 86400000 : 0;
        return self.runs().filter((r) => new Date(r.startedAt).getTime() >= since);
      });
      self.kpis = ko.pureComputed(() => {
        const list = inRange();
        const n = (g) => list.filter((r) => groupOf(r.state) === g).length;
        const screens = new Set();
        const modules = new Set();
        list.filter((r) => r.state === 'delivered').forEach((r) => { if (r.path === 'ui') { r.screens.forEach((s) => screens.add(s)); } else { modules.add(r.subject); } });
        return [['Runs', list.length], ['Delivered', n('delivered')], ['In progress', n('open')], ['Rejected or failed', n('rejected') + n('failed')],
          ['Screens upgraded', screens.size], ['Modules moved', modules.size]].map((k) => ({ k: k[0], v: String(k[1]) }));
      });
      // Runs per week, the last 8 weeks, by result
      self.series = [{ key: 'delivered', label: 'Delivered', tone: 'done' }, { key: 'open', label: 'In progress', tone: 'info' }, { key: 'problem', label: 'Rejected or failed', tone: 'failed' }];
      self.bars = ko.pureComputed(() => {
        const now = weekStart(new Date());
        const weeks = [];
        for (let i = 7; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - 7 * i); weeks.push(d); }
        return weeks.map((w) => {
          const end = new Date(w); end.setDate(end.getDate() + 7);
          const list = self.runs().filter((r) => { const t = new Date(r.startedAt); return t >= w && t < end; });
          return { label: w.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
            values: { delivered: list.filter((r) => r.state === 'delivered').length, open: list.filter((r) => groupOf(r.state) === 'open').length,
              problem: list.filter((r) => r.state === 'rejected' || r.state === 'failed').length } };
        });
      });
      self.barSummary = ko.pureComputed(() => 'Runs started in each of the last 8 weeks: ' + self.bars().map((b) => b.label + ' ' + (b.values.delivered + b.values.open + b.values.problem)).join(', '));
      self.byResult = ko.pureComputed(() => {
        const list = inRange();
        return ['all', 'delivered', 'open', 'rejected', 'failed'].map((g) => {
          const n = g === 'all' ? list.length : list.filter((r) => groupOf(r.state) === g).length;
          return { label: g === 'all' ? 'All runs' : RESULT[g], n: n, pct: list.length ? Math.round(100 * n / list.length) + '%' : '—',
            pressed: ko.pureComputed(() => (self.result() === g ? 'true' : 'false')), css: ko.pureComputed(() => 'factory-mc-facet' + (self.result() === g ? ' is-on' : '')), pick: () => self.result(g) };
        });
      });
      const shown = ko.pureComputed(() => {
        const q = self.query().trim().toLowerCase();
        return inRange().filter((r) => (self.result() === 'all' || groupOf(r.state) === self.result())
          && (!q || (r.subject + ' ' + (r.changeTitle || '') + ' ' + (r.technology || '') + ' ' + (r.startedBy || '')).toLowerCase().indexOf(q) >= 0));
      });
      self.pager = ui.pages(shown, 10, [10, 25, 50]);
      const took = (r) => {
        if (!r.finishedAt && r.state !== 'delivered') { return '—'; }
        const end = r.finishedAt ? new Date(r.finishedAt) : null;
        if (!end) { return '—'; }
        const h = Math.round((end - new Date(r.startedAt)) / 3600000);
        return h < 24 ? h + ' h' : Math.round(h / 24) + ' days';
      };
      self.rows = ko.pureComputed(() => self.pager.rows().map((r) => {
        const pill = mz.runPill(r.state);
        const on = ko.pureComputed(() => !!self.picked()[r.id]);
        return { id: r.id, subject: r.subject, change: r.changeTitle || '—', path: r.path === 'ui' ? 'UI path' : 'Migration', technology: r.technology || (r.path === 'ui' ? 'Premium JET' : '—'),
          when: ui.when(r.startedAt), by: r.startedBy || '', took: took(r), state: pill.text, css: pill.css, outcome: r.state === 'delivered' ? (r.deliveredRevision ? 'r' + r.deliveredRevision : 'Delivered') : r.state === 'rejected' ? (r.message || '') : '',
          checked: on, toggle: () => { const n = Object.assign({}, self.picked()); if (n[r.id]) { delete n[r.id]; } else { n[r.id] = true; } self.picked(n); return true; },
          open: () => openPanel(r),
          menu: [{ value: 'workspace', label: 'Open the change' }, { value: 'review', label: 'Open in Review' }, { value: 'log', label: 'Download the log' }],
          menuAction: (event) => {
            const v = event.detail.value;
            if (v === 'workspace') { mz.open('modernization-workspace', { runId: r.id }); } else if (v === 'review') { mz.open('modernization-review', { runId: r.id }); }
            else { window.location.href = 'api/workspaces/' + self.workspaceId() + '/modernization/history/logs.zip?runs=' + r.id; }
          } };
      }));
      const openPanel = (r) => {
        self.panelRun(r);
        self.panelChange(null);
        self.panelTab('steps');
        self.panelOpen(true);
        if (r.changeId) { api.get('changes/' + r.changeId).then((c) => self.panelChange(c)).catch(() => null); }
      };
      self.panelTabs = ko.pureComputed(() => ui.tabs(self.panelTab, [{ value: 'steps', label: 'Run details' }, { value: 'files', label: 'Files produced' }, { value: 'delivery', label: 'Delivery log' }]));
      self.panelSteps = ko.pureComputed(() => (self.panelChange() ? self.panelChange().events : []).map((e) => ({ when: ui.when(e.at), text: e.text, by: e.by || '' })));
      self.panelFiles = ko.pureComputed(() => (self.panelChange() ? self.panelChange().files : []).map((f) => ({ path: f.path, action: f.action === 'create' ? 'New' : 'Changed', check: f.checkStatus || 'NOT_CHECKED' })));
      self.panelDelivery = ko.pureComputed(() => {
        const c = self.panelChange();
        const r = self.panelRun();
        if (!c || !r) { return []; }
        return [['State', mz.runPill(r.state).text], ['SVN branch', c.branchUrl || 'Not delivered'], ['Delivered revision', c.deliveredRevision ? 'r' + c.deliveredRevision : '—'],
          ['Builds', c.builds.length ? c.builds.map((b) => (b.buildNumber ? '#' + b.buildNumber : '') + ' ' + (b.result || 'running')).join(', ') : 'None'],
          ['Reason', r.state === 'rejected' ? r.message : '—']].map((x) => ({ k: x[0], v: x[1] }));
      });
      self.closePanel = () => self.panelOpen(false);
      self.panelToReview = () => { const r = self.panelRun(); self.panelOpen(false); mz.open('modernization-review', { runId: r.id }); };
      self.panelLog = () => { window.location.href = 'api/workspaces/' + self.workspaceId() + '/modernization/history/logs.zip?runs=' + self.panelRun().id; };
      self.csvHref = ko.pureComputed(() => (self.workspaceId() ? 'api/workspaces/' + self.workspaceId() + '/modernization/history.csv' : '#'));
      self.logsHref = ko.pureComputed(() => {
        const ids = Object.keys(self.picked());
        return self.workspaceId() ? 'api/workspaces/' + self.workspaceId() + '/modernization/history/logs.zip' + (ids.length ? '?' + ids.map((i) => 'runs=' + i).join('&') : '') : '#';
      });
      self.logsLabel = ko.pureComputed(() => { const n = Object.keys(self.picked()).length; return n ? 'Export the logs of ' + n + (n === 1 ? ' run' : ' runs') : 'Export run logs'; });
      self.newRun = () => mz.open('modernization-path');

      const load = (id) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        api.get('workspaces/' + id + '/modernization/runs').then((list) => { self.runs(list); self.error(null); })
          .catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe((id) => { self.picked({}); load(id); });
      self.connected = () => {
        accUtils.announce('Modernization history loaded.', 'assertive');
        document.title = 'Modernization history';
        mz.take();
        load(self.workspaceId());
      };
      self.disconnected = () => sub.dispose();
    }

    return HistoryViewModel;
  }
);
