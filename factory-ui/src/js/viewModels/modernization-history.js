/*
 * Modernization history: every run in the workspace, by result (completed, with problems, failed, running), with the
 * average run and how many finished runs completed, runs per week by result, a donut of the results that filters the
 * runs, and four tabs: the runs (search by name, change or SVN branch), one run's details (steps with how long each
 * took, what it produced, its results and delivery), every file the runs produced, and the delivery log. The report
 * downloads as CSV and the runs' logs as a zip.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    const CATEGORY = { completed: ['Completed', 'green', '✓', 'var(--fx-success)'], problems: ['With problems', 'amber', '!', 'var(--fx-warning)'],
      failed: ['Failed', 'red', '✕', 'var(--fx-danger)'], running: ['Running', 'blue', '…', 'var(--fx-primary)'] };
    const ORDER = ['completed', 'problems', 'failed', 'running'];
    const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    const took = (m) => (m === null || m === undefined ? '—' : m < 60 ? m + ' min' : m < 1440 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : Math.round(m / 1440) + ' days');
    const pathLabel = (p) => (p === 'ui' ? 'Component upgrade' : 'Migration');

    function HistoryViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.rowsAll = ko.observableArray([]);
      self.range = ko.observable('90');
      self.result = ko.observable('all');
      self.query = ko.observable('');
      self.picked = ko.observable({});
      self.tab = ko.observable('runs');
      self.current = ko.observable(null);
      self.panelOpen = ko.observable(false);
      self.rangeOptions = [{ value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last year' }, { value: 'all', label: 'All time' }];

      const inRange = ko.pureComputed(() => {
        const days = self.range() === 'all' ? null : Number(self.range());
        const since = days ? Date.now() - days * 86400000 : 0;
        return self.rowsAll().filter((r) => new Date(r.run.startedAt).getTime() >= since);
      });
      const count = (list, c) => list.filter((r) => r.category === c).length;
      self.kpis = ko.pureComputed(() => {
        const list = inRange();
        const finished = list.filter((r) => r.category !== 'running');
        const avg = finished.length ? Math.round(finished.reduce((n, r) => n + r.minutes, 0) / finished.length) : null;
        return [['Runs', String(list.length), 'blue'], ['Completed', String(count(list, 'completed')), 'green'], ['With problems', String(count(list, 'problems')), 'amber'],
          ['Failed', String(count(list, 'failed')), 'red'], ['Running', String(count(list, 'running')), 'blue'], ['Average run', took(avg), 'blue'],
          ['Of finished runs completed', finished.length ? Math.round(100 * count(list, 'completed') / finished.length) + '%' : '—', 'green']]
          .map((k) => ({ k: k[0], v: k[1], css: 'fx-kpi factory-mu-tile factory-mh-kpi is-' + k[2] }));
      });

      // Runs per week, the last 8 weeks, by result
      self.series = ORDER.map((c) => ({ key: c, label: CATEGORY[c][0], tone: c === 'completed' ? 'success' : c === 'problems' ? 'warning' : c === 'failed' ? 'failed' : 'done' }));
      self.bars = ko.pureComputed(() => {
        const now = weekStart(new Date());
        const weeks = [];
        for (let i = 7; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - 7 * i); weeks.push(d); }
        return weeks.map((w) => {
          const end = new Date(w); end.setDate(end.getDate() + 7);
          const list = self.rowsAll().filter((r) => { const t = new Date(r.run.startedAt); return t >= w && t < end; });
          const values = {};
          ORDER.forEach((c) => { values[c] = count(list, c); });
          return { label: w.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), values: values };
        });
      });
      self.barSummary = ko.pureComputed(() => 'Runs started in each of the last 8 weeks: ' + self.bars().map((b) => b.label + ' ' + ORDER.reduce((n, c) => n + b.values[c], 0)).join(', '));

      // By result: a donut and the categories, which filter the runs
      self.total = ko.pureComputed(() => inRange().length);
      self.donut = ko.pureComputed(() => {
        const list = inRange();
        if (!list.length) { return { background: 'var(--fx-surface-3)' }; }
        let at = 0;
        const parts = ORDER.map((c) => { const from = at; at += 100 * count(list, c) / list.length; return CATEGORY[c][3] + ' ' + from + '% ' + at + '%'; });
        return { background: 'conic-gradient(' + parts.join(', ') + ')' };
      });
      self.donutLabel = ko.pureComputed(() => ORDER.map((c) => CATEGORY[c][0] + ' ' + count(inRange(), c)).join(', '));
      self.byResult = ko.pureComputed(() => {
        const list = inRange();
        return ORDER.map((c) => {
          const n = count(list, c);
          return { label: CATEGORY[c][0], n: n, pct: list.length ? Math.round(100 * n / list.length) + '%' : '—', dot: { background: CATEGORY[c][3] },
            pressed: self.result() === c ? 'true' : 'false', css: 'factory-mc-facet' + (self.result() === c ? ' is-on' : ''), pick: () => self.result(self.result() === c ? 'all' : c) };
        });
      });
      self.filterName = ko.pureComputed(() => (self.result() === 'all' ? '' : 'Only: ' + CATEGORY[self.result()][0]));
      self.clearFilter = () => self.result('all');

      const shown = ko.pureComputed(() => {
        const q = self.query().trim().toLowerCase();
        return inRange().filter((r) => (self.result() === 'all' || r.category === self.result())
          && (!q || [r.run.subject, r.run.changeTitle, r.run.technology, r.run.startedBy, r.branch].join(' ').toLowerCase().indexOf(q) >= 0));
      });
      self.pager = ui.pages(shown, 10, [10, 25, 50]);
      const pill = (c) => ui.pill(CATEGORY[c][2] + ' ' + CATEGORY[c][0], CATEGORY[c][1]);
      const branchName = (b) => (b ? b.replace(/^.*?\/(branches|tags)\//, '$1/') : '—');
      self.rows = ko.pureComputed(() => self.pager.rows().map((r) => {
        const on = ko.pureComputed(() => !!self.picked()[r.run.id]);
        return { id: r.run.id, subject: r.run.subject, change: r.run.changeTitle || '—', hasChange: !!r.run.changeId, openChange: () => mz.open('modernization-workspace', { runId: r.run.id }),
          path: pathLabel(r.run.path), technology: r.run.technology || (r.run.path === 'ui' ? 'Premium JET pack' : '—'), branch: branchName(r.branch),
          when: ui.when(r.run.startedAt), by: r.run.startedBy || '', took: took(r.minutes), state: pill(r.category).text, css: pill(r.category).css, outcome: r.outcome,
          checked: on, toggle: () => { const n = Object.assign({}, self.picked()); if (n[r.run.id]) { delete n[r.run.id]; } else { n[r.run.id] = true; } self.picked(n); return true; },
          open: () => openPanel(r), details: () => { self.current(r); self.tab('details'); },
          menu: [{ value: 'details', label: 'Run details' }, { value: 'workspace', label: 'Open the change' }, { value: 'review', label: 'Open in Review' }, { value: 'log', label: 'Download the log' }],
          menuAction: (event) => {
            const v = event.detail.value;
            if (v === 'details') { self.current(r); self.tab('details'); } else if (v === 'workspace') { mz.open('modernization-workspace', { runId: r.run.id }); }
            else if (v === 'review') { mz.open('modernization-review', { runId: r.run.id }); } else { window.location.href = logHref([r.run.id]); }
          } };
      }));
      const logHref = (ids) => 'api/workspaces/' + self.workspaceId() + '/modernization/history/logs.zip' + (ids.length ? '?' + ids.map((i) => 'runs=' + i).join('&') : '');

      // Page tabs
      self.tabs = ko.pureComputed(() => ui.tabs(self.tab, [{ value: 'runs', label: 'Runs', count: shown().length }, { value: 'details', label: 'Run details' },
        { value: 'files', label: 'Files produced' }, { value: 'delivery', label: 'Delivery log' }]));
      const TAB_KEYS = ['runs', 'details', 'files', 'delivery'];
      self.tabKey = (vm, event) => {
        const at = TAB_KEYS.indexOf(self.tab());
        const n = event.key === 'ArrowRight' ? (at + 1) % TAB_KEYS.length : event.key === 'ArrowLeft' ? (at + TAB_KEYS.length - 1) % TAB_KEYS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TAB_KEYS.length - 1 : -1;
        if (n < 0) { return true; }
        event.preventDefault();
        self.tab(TAB_KEYS[n]);
        const b = document.getElementById('mhTab-' + TAB_KEYS[n]);
        if (b) { b.focus(); }
        return false;
      };
      self.runOptions = ko.pureComputed(() => inRange().map((r) => ({ value: r.run.id, label: r.run.subject + ' · ' + ui.when(r.run.startedAt) })));
      self.currentId = ko.pureComputed({ read: () => (self.current() ? self.current().run.id : null), write: (id) => self.current(self.rowsAll().find((r) => r.run.id === id) || null) });

      // One run: steps with durations, what it produced, results, delivery (the Run details tab and the side panel)
      const sections = (r) => {
        if (!r) { return null; }
        return {
          title: r.run.subject + (r.run.changeTitle ? ' · ' + r.run.changeTitle : ''),
          state: pill(r.category).text, css: pill(r.category).css,
          steps: r.steps.map((s) => ({ text: s.text, by: s.by ? ' · ' + s.by : '', when: ui.when(s.at), took: s.minutes === null || s.minutes === undefined ? '' : took(s.minutes) })),
          produced: [['Files changed', r.files], ['Screens', r.screens], ['Files with problems', r.fileProblems]].map((x) => ({ k: x[0], v: String(x[1]) })),
          results: [['Tests', r.testsTotal === null || r.testsTotal === undefined ? (r.buildNumber ? 'No test report' : 'No build yet') : r.testsPassed + ' of ' + r.testsTotal + ' passed'],
            ['Build', r.buildNumber ? '#' + r.buildNumber + ' ' + (r.buildResult || 'running') : '—'], ['Took', took(r.minutes)], ['Outcome', r.outcome]].map((x) => ({ k: x[0], v: x[1] })),
          delivery: [['SVN branch', r.branch || 'Not delivered'], ['Delivered', r.run.deliveredRevision ? 'r' + r.run.deliveredRevision + ' · ' + ui.when(r.run.finishedAt) : '—'],
            ['Started by', r.run.startedBy || '—']].concat(r.run.state === 'rejected' ? [['Reason', r.run.message || '—']] : []).map((x) => ({ k: x[0], v: x[1] }))
        };
      };
      self.detailOf = ko.pureComputed(() => sections(self.current()));
      self.panel = ko.pureComputed(() => sections(self.panelOpen() ? self.current() : null));
      const openPanel = (r) => { self.current(r); self.panelOpen(true); };
      self.closePanel = () => self.panelOpen(false);
      self.toReview = () => { const r = self.current(); self.panelOpen(false); mz.open('modernization-review', { runId: r.run.id }); };
      self.runLog = () => { window.location.href = logHref([self.current().run.id]); };

      // Every file the runs produced, and every delivery
      self.fileQuery = ko.observable('');
      self.fileRows = ko.pureComputed(() => {
        const q = self.fileQuery().trim().toLowerCase();
        const out = [];
        shown().forEach((r) => r.producedFiles.forEach((f) => {
          if (!q || f.path.toLowerCase().indexOf(q) >= 0) {
            const s = f.check === 'FAILED' ? ['Problems', 'red'] : f.check === 'PASSED' ? ['Passed', 'green'] : f.check === 'WARNING' ? ['Warning', 'amber'] : ['Not checked', 'grey'];
            out.push({ path: f.path, run: r.run.subject, action: f.action === 'create' ? 'New' : 'Changed', check: s[0], css: ui.pill(s[0], s[1]).css });
          }
        }));
        return out.slice(0, 500);
      });
      self.deliveries = ko.pureComputed(() => inRange().filter((r) => r.run.deliveredRevision || r.run.state === 'rejected').slice().sort((a, b) => new Date(b.run.finishedAt || b.run.startedAt) - new Date(a.run.finishedAt || a.run.startedAt))
        .map((r) => ({ when: ui.when(r.run.finishedAt || r.run.startedAt), run: r.run.subject, branch: branchName(r.branch), revision: r.run.deliveredRevision ? 'r' + r.run.deliveredRevision : '—',
          result: r.run.state === 'rejected' ? 'Rejected' : 'Delivered', css: ui.pill(r.run.state === 'rejected' ? 'Rejected' : 'Delivered', r.run.state === 'rejected' ? 'red' : 'green').css, by: r.run.startedBy || '' })));

      self.csvHref = ko.pureComputed(() => (self.workspaceId() ? 'api/workspaces/' + self.workspaceId() + '/modernization/history.csv' : '#'));
      self.logsHref = ko.pureComputed(() => (self.workspaceId() ? logHref(Object.keys(self.picked())) : '#'));
      self.logsLabel = ko.pureComputed(() => { const n = Object.keys(self.picked()).length; return n ? 'Export the logs of ' + n + (n === 1 ? ' run' : ' runs') : 'Export run logs'; });
      self.newRun = () => mz.open('modernization-path');

      const load = (id) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        api.get('workspaces/' + id + '/modernization/history').then((list) => {
          self.rowsAll(list);
          self.error(null);
          if (!self.current() && list.length) { self.current(list[0]); }
        }).catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
      self.tryAgain = () => load(self.workspaceId());
      const sub = self.workspaceId.subscribe((id) => { self.picked({}); self.current(null); load(id); });
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
