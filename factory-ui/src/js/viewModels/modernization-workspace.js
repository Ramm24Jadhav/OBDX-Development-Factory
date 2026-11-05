/*
 * Migration workspace (step 4 of both paths, Build and validate): one run's change, file by file. The source (Oracle
 * JET) beside the new code, the differences, the change's builds and log, the components and dependencies of the run's
 * screens and the 8 OBDX rules with the factory's check results. The plan is approved here; a file can be written again
 * with a note; Run the tests starts the Jenkins build and opens Validation.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui', '../services/toast',
        '../services/modernization', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, toast, mz, pageRequests) {
    const BUSY = ['ANALYZING', 'GENERATING'];
    const STEP_NAMES = ['Analyse the impact', 'Approve the plan', 'Write the code', 'Check the files', 'Deliver to SVN'];

    function WorkspaceViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.canApprove = ko.pureComputed(() => !!self.workspaceId() && session.can(self.workspaceId(), 'APPROVE'));
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.runs = ko.observableArray([]);
      self.runId = ko.observable(null);
      self.detail = ko.observable(null);
      self.change = ko.observable(null);
      self.file = ko.observable(null);
      self.content = ko.observable(null);
      self.query = ko.observable('');
      self.layout = ko.observable('split');
      self.tab = ko.observable('code');
      self.bottomTab = ko.observable('components');
      self.note = ko.observable('');
      self.copied = ko.observable('');
      self.briefOpen = ko.observable(false);
      self.layoutOptions = [{ value: 'split', label: 'Side by side' }, { value: 'stacked', label: 'One above the other' }];

      const run = ko.pureComputed(() => (self.detail() ? self.detail().run : null));
      self.run = run;
      self.path = ko.pureComputed(() => (run() ? run().path : 'ui'));
      self.steps = ko.pureComputed(() => mz.steps(self.path(), 4));
      self.pathName = ko.pureComputed(() => mz.pathName(self.path()));
      self.runOptions = ko.pureComputed(() => self.runs().map((r) => ({ value: r.id, label: r.subject + ' · ' + (mz.RUN[r.state] || [r.state])[0] })));
      self.runPill = ko.pureComputed(() => (run() ? mz.runPill(run().state) : null));
      self.status = ko.pureComputed(() => (self.change() ? self.change().status : null));
      self.busy = ko.pureComputed(() => BUSY.indexOf(self.status()) >= 0);
      self.title = ko.pureComputed(() => (run() ? (run().path === 'migration' ? 'The ' + run().subject + ' module, converted file by file.' : run().subject + ', upgraded screen by screen.') : 'A run’s change, file by file.'));
      self.facts = ko.pureComputed(() => {
        const r = run();
        const c = self.change();
        if (!r) { return []; }
        const done = self.pipeline().filter((s) => s.state === 'done').length;
        return [[r.path === 'migration' ? 'Module' : 'Wave', r.subject], ['Change', c ? c.title : 'Starting'], ['Conversion', r.path === 'migration' ? 'Oracle JET → ' + (r.technology || 'new app') : 'Oracle JET → premium JET'],
          ['Source', c && c.baseRevision ? 'r' + c.baseRevision : '—'], ['Delivered to', c && c.branchUrl ? c.branchUrl : 'Not yet'], ['Progress', done + ' of 5 steps']].map((x) => ({ k: x[0], v: x[1] }));
      });

      self.pipeline = ko.pureComputed(() => {
        const c = self.change();
        const s = c ? c.status : null;
        const planned = c && c.plan && c.plan.items ? c.plan.items.length : 0;
        const checked = c ? c.files.filter((f) => f.checkStatus && f.checkStatus !== 'NOT_CHECKED') : [];
        const failed = c ? c.files.filter((f) => f.checkStatus === 'FAILED').length : 0;
        const st = (done, now) => (done ? 'done' : now ? 'now' : 'todo');
        const delivered = s === 'DELIVERED' || (s === 'CLOSED' && c.closedReason === 'MERGED');
        const out = [
          st(s && s !== 'ANALYZING', s === 'ANALYZING'), st(c && !!c.planApprovedAt, s === 'PLAN_READY'), st(s === 'GENERATED' || delivered, s === 'GENERATING'),
          st((s === 'GENERATED' || delivered) && checked.length > 0 && failed === 0, s === 'GENERATED' && (checked.length === 0 || failed > 0)), st(delivered, false)
        ];
        const text = [s === 'ANALYZING' ? 'Running' : planned + ' files planned', c && c.planApprovedAt ? 'By ' + c.planApprovedBy : s === 'PLAN_READY' ? 'Waiting for approval' : '',
          c ? c.files.filter((f) => f.status === 'GENERATED' || f.status === 'EDITED').length + ' written' : '', failed ? failed + ' with problems' : checked.length ? 'All passed' : '',
          delivered ? 'r' + (c.deliveredRevision || '') : ''];
        return STEP_NAMES.map((n, i) => ({ name: n, state: out[i], text: text[i], css: 'factory-mw-step is-' + out[i], mark: out[i] === 'done' ? '✓' : out[i] === 'now' ? '…' : String(i + 1) }));
      });

      // Files, grouped by folder
      self.tree = ko.pureComputed(() => {
        const c = self.change();
        if (!c) { return []; }
        const q = self.query().trim().toLowerCase();
        const groups = {};
        c.files.filter((f) => !q || f.path.toLowerCase().indexOf(q) >= 0).forEach((f) => {
          const at = f.path.lastIndexOf('/');
          const dir = at > 0 ? f.path.substring(0, at) : '.';
          (groups[dir] = groups[dir] || []).push(f);
        });
        return Object.keys(groups).sort().map((dir) => ({ dir: dir, files: groups[dir].map((f) => {
          const on = self.file() === f.path;
          const check = f.checkStatus === 'FAILED' ? 'is-failed' : f.checkStatus === 'PASSED' ? 'is-passed' : f.checkStatus === 'WARNING' ? 'is-warn' : '';
          return { path: f.path, name: f.path.substring(f.path.lastIndexOf('/') + 1), action: f.action === 'create' ? 'New' : 'Changed', css: 'factory-mw-file ' + check + (on ? ' is-on' : ''),
            current: on ? 'true' : null, mark: f.checkStatus === 'FAILED' ? '!' : f.checkStatus === 'PASSED' ? '✓' : '', pick: () => openFile(f.path) };
        }) }));
      });
      self.fileCount = ko.pureComputed(() => {
        const c = self.change();
        if (!c) { return ''; }
        const written = c.files.filter((f) => f.status === 'GENERATED' || f.status === 'EDITED').length;
        return written + ' of ' + c.files.length + ' written';
      });
      const openFile = (path) => {
        self.file(path);
        self.content(null);
        if (!path || !self.change()) { return; }
        api.get('changes/' + self.change().id + '/file?path=' + encodeURIComponent(path)).then((x) => { if (self.file() === path) { self.content(x); } })
          .catch((e) => toast.error(ui.errorText(e)));
      };
      self.fileOptions = ko.pureComputed(() => (self.change() ? self.change().files.map((f) => ({ value: f.path, label: f.path })) : []));
      self.fileChanged = (event) => openFile(event.detail.value);
      self.source = ko.pureComputed(() => (self.content() ? (self.content().original || 'A new file: there is no source for it.') : ''));
      self.generated = ko.pureComputed(() => (self.content() ? (self.content().generated || 'Not written yet.') : ''));
      self.diff = ko.pureComputed(() => (self.content() ? self.content().diff || 'No differences.' : ''));
      self.fileInfo = ko.pureComputed(() => {
        const c = self.change();
        const f = c ? c.files.find((x) => x.path === self.file()) : null;
        return f ? (f.purpose || '') + (f.checkMessage ? ' · ' + f.checkMessage : '') : '';
      });
      self.copy = (which) => () => {
        const text = which === 'source' ? self.source() : self.generated();
        if (navigator.clipboard) { navigator.clipboard.writeText(text).then(() => { self.copied(which); window.setTimeout(() => self.copied(''), 1500); }); }
      };
      self.copySource = self.copy('source');
      self.copyNew = self.copy('new');

      self.tabs = ko.pureComputed(() => ui.tabs(self.tab, [{ value: 'code', label: 'Code' }, { value: 'diff', label: 'Differences' }, { value: 'tests', label: 'Tests' }, { value: 'log', label: 'Log' }]));
      self.bottomTabs = ko.pureComputed(() => ui.tabs(self.bottomTab, [{ value: 'components', label: 'Components' }, { value: 'dependencies', label: 'Dependencies' }, { value: 'rules', label: 'Security rules' }]));
      const keyed = (obs, keys, prefix) => (vm, event) => {
        const at = keys.indexOf(obs());
        const n = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (n < 0) { return true; }
        event.preventDefault();
        obs(keys[n]);
        const b = document.getElementById(prefix + keys[n]);
        if (b) { b.focus(); }
        return false;
      };
      self.tabKey = keyed(self.tab, ['code', 'diff', 'tests', 'log'], 'mwTab-');
      self.bottomKey = keyed(self.bottomTab, ['components', 'dependencies', 'rules'], 'mwBTab-');
      self.builds = ko.pureComputed(() => (self.change() ? self.change().builds : []).map((b) => ({ round: b.round, number: b.buildNumber ? '#' + b.buildNumber : '—', result: b.result || 'Running',
        css: ui.pill(b.result || 'Running', b.result === 'SUCCESS' ? 'green' : b.result ? 'red' : 'blue').css, when: ui.when(b.startedAt), errors: (b.errors || []).slice(0, 3).join(' · ') })));
      self.events = ko.pureComputed(() => (self.change() ? self.change().events : []).slice().reverse().map((e) => ({ when: ui.when(e.at), by: e.by || '', text: e.text })));
      self.componentRows = ko.pureComputed(() => (self.detail() ? self.detail().components : []).map((c) => ({ element: c.element, premium: c.premium || 'Stays as it is', uses: c.uses,
        css: mz.compatPill(c.compatibility).css, compat: mz.compatPill(c.compatibility).text })));
      self.dependencyRows = ko.pureComputed(() => (self.detail() ? self.detail().dependencies : []).map((d) => ({ module: d.module, state: d.state === 'delivered' ? 'Moved' : d.state === 'in-progress' ? 'In progress' : 'Not yet',
        css: ui.pill('', d.state === 'delivered' ? 'green' : d.state === 'in-progress' ? 'amber' : 'grey').css })));
      self.ruleRows = ko.pureComputed(() => (self.detail() ? self.detail().rules : []).map((r) => ({ id: r.id, text: r.text, result: r.result === 'passed' ? 'Passed' : r.result === 'failed' ? 'Problems in ' + r.failing.length + ' files' : 'Not checked yet',
        css: ui.pill('', r.result === 'passed' ? 'green' : r.result === 'failed' ? 'red' : 'grey').css })));
      self.risks = ko.pureComputed(() => (self.change() && self.change().plan ? self.change().plan.risks || [] : []));
      self.summary = ko.pureComputed(() => (self.change() && self.change().plan ? self.change().plan.summary : ''));
      self.brief = ko.pureComputed(() => (self.detail() ? self.detail().brief || '' : ''));
      self.message = ko.pureComputed(() => (self.change() ? self.change().message : run() ? run().message : ''));

      // Actions
      self.approve = () => {
        const c = self.change();
        api.post('changes/' + c.id + '/approve-plan' + (c.plan && c.plan.incomplete ? '?incomplete=true' : '')).then((x) => { self.change(x); toast.success('Plan approved: the factory writes the code now.'); poll(); })
          .catch((e) => toast.error(ui.errorText(e)));
      };
      self.analyzeAgain = () => api.post('changes/' + self.change().id + '/analyze').then((x) => { self.change(x); poll(); }).catch((e) => toast.error(ui.errorText(e)));
      self.writeAgain = () => {
        if (!self.file()) { return; }
        api.post('changes/' + self.change().id + '/regenerate', { path: self.file(), note: self.note().trim() || null }).then((x) => {
          self.change(x); self.note('');
          toast.success('Writing ' + self.file() + ' again. The steps show it running.');
          poll();
        }).catch((e) => toast.error(ui.errorText(e)));
      };
      self.runTests = () => api.post('changes/' + self.change().id + '/build').then(() => {
        toast.success('The Jenkins build started.');
        mz.open('modernization-validation', { runId: self.runId() });
      }).catch((e) => toast.error(ui.errorText(e)));
      self.compare = () => mz.open('modernization-review', { runId: self.runId() });
      self.validation = () => mz.open('modernization-validation', { runId: self.runId() });
      self.back = () => mz.open(self.path() === 'migration' ? 'modernization-planner' : 'modernization-upgrade');
      self.openInChanges = () => { pageRequests.change(self.change().id); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' })); };
      self.generated2 = ko.pureComputed(() => self.status() === 'GENERATED');
      self.moreItems = ko.pureComputed(() => [{ value: 'changes', label: 'Open in Changes', disabled: !self.change() }, { value: 'review', label: 'Compare source and new', disabled: !self.generated2() },
        { value: 'validation', label: 'Validation', disabled: !self.change() }, { value: 'brief', label: 'Show the brief' }]);
      self.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'changes') { self.openInChanges(); } else if (v === 'review') { self.compare(); } else if (v === 'validation') { self.validation(); } else { self.briefOpen(true); }
      };
      self.closeBrief = () => self.briefOpen(false);
      self.openBrief = () => self.briefOpen(true);
      self.pickRun = (event) => { const id = event.detail.value; if (id && id !== self.runId()) { loadRun(id); } };

      let timer = null;
      const poll = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (!self.change() || !self.busy()) { return; }
          refresh().then(poll);
        }, 4000);
      };
      const refresh = () => {
        const c = self.change();
        if (!c) { return Promise.resolve(); }
        return api.get('changes/' + c.id).then((x) => {
          const was = self.status();
          self.change(x);
          if (was !== x.status && self.file()) { openFile(self.file()); }
          if (!self.file() && x.files.length) { openFile(x.files[0].path); }
        }).catch(() => null);
      };
      const loadRun = (id) => {
        self.runId(id);
        self.change(null);
        self.file(null);
        self.content(null);
        return api.get('workspaces/' + self.workspaceId() + '/modernization/runs/' + id + '/detail').then((d) => {
          self.detail(d);
          if (!d.run.changeId) { return null; }
          return api.get('changes/' + d.run.changeId).then((c) => {
            self.change(c);
            if (c.files.length) { openFile(c.files[0].path); }
            poll();
          });
        }).catch((e) => self.error(ui.errorText(e)));
      };
      const load = (id) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        const asked = mz.take();
        api.get('workspaces/' + id + '/modernization/runs').then((list) => {
          self.runs(list);
          const pick = asked.runId || (list.find((r) => r.open) || list[0] || {}).id;
          self.error(list.length ? null : 'No run yet. Start a wave on the Upgrade plan or a module on the Migration planner.');
          return pick ? loadRun(pick) : null;
        }).catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe((id) => load(id));
      self.connected = () => {
        accUtils.announce('Migration workspace loaded.', 'assertive');
        document.title = 'Migration workspace';
        load(self.workspaceId());
      };
      self.disconnected = () => { sub.dispose(); window.clearTimeout(timer); };
    }

    return WorkspaceViewModel;
  }
);
