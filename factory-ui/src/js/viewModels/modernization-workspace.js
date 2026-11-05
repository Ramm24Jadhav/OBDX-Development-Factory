/*
 * Migration workspace (step 4 of both paths, Build and validate): one run's change, file by file. The source (Oracle
 * JET) beside the new code, the differences, the change's builds and log, the components and dependencies of the run's
 * screens and the 8 OBDX rules with the factory's check results. The plan is approved here; a file can be written again
 * with a note; Run the tests starts the Jenkins build and opens Validation. The files show as a folder tree with what is
 * written; the panes carry line numbers and the components each side uses; the Assistant tab is the conversation (the
 * request, what the factory did, the notes it was given); What it touches counts the change's reach.
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
      self.bottomTab = ko.observable('touches');
      self.closed = ko.observable({});
      self.delivery = ko.observable(null);
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
        const written = c ? c.files.filter((f) => f.status === 'GENERATED' || f.status === 'EDITED').length : 0;
        const d = self.delivery();
        return [[r.path === 'migration' ? 'Module' : 'Wave', r.subject, c ? c.title : 'Starting'], ['Target', r.technology || (r.path === 'ui' ? 'Premium JET pack' : '—'), r.path === 'migration' ? 'Oracle JET → ' + (r.technology || 'new app') : 'Oracle JET → premium JET'],
          ['Source', c && c.baseRevision ? 'trunk @ r' + c.baseRevision : '—', 'the revision the change was read from'],
          ['Target branch', c && c.branchUrl ? c.branchUrl.replace(/^.*?\/(branches|trunk)/, '$1') : d ? d.branch : 'Made when delivered', c && c.branchUrl ? 'delivered' : 'on delivery'],
          ['In progress', done + ' of 5 steps', ''], ['New files', written + ' written', c ? 'of ' + c.files.length + ' planned' : '']].map((x) => ({ k: x[0], v: x[1], sub: x[2] }));
      });
      self.doneSteps = ko.pureComputed(() => self.pipeline().filter((s) => s.state === 'done').length);
      self.progress = ko.pureComputed(() => ({ width: (100 * self.doneSteps() / 5) + '%' }));

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
        // How long each step took, from the change's events (analysis, plan approved, files written, checked, delivered)
        const ev = c ? c.events || [] : [];
        const at = (re) => { const e = ev.find((x) => re.test(x.text)); return e ? new Date(e.at).getTime() : null; };
        const marks = [c ? new Date(c.createdAt).getTime() : null, at(/plan (is )?ready|planned|analys/i), c && c.planApprovedAt ? new Date(c.planApprovedAt).getTime() : null,
          at(/written|generated/i), at(/check/i), at(/deliver/i)];
        const took = (i) => (marks[i] && marks[i + 1] && marks[i + 1] >= marks[i] ? Math.max(1, Math.round((marks[i + 1] - marks[i]) / 60000)) : null);
        const fmt = (m) => (m === null ? '' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min');
        return STEP_NAMES.map((n, i) => ({ name: n, state: out[i], text: text[i], css: 'factory-mw-step is-' + out[i], mark: out[i] === 'done' ? '✓' : out[i] === 'now' ? '…' : String(i + 1),
          time: out[i] === 'done' ? fmt(took(i)) : '', stateText: out[i] === 'done' ? 'Done' : out[i] === 'now' ? 'Now' : 'To do' }));
      });

      // Files as a folder tree (folders open; a click closes one), with what is written and what the checks found
      self.tree = ko.pureComputed(() => {
        const c = self.change();
        if (!c) { return []; }
        const q = self.query().trim().toLowerCase();
        const root = { dirs: {}, files: [], count: 0 };
        c.files.filter((f) => !q || f.path.toLowerCase().indexOf(q) >= 0).forEach((f) => {
          let node = root;
          node.count++;
          f.path.split('/').slice(0, -1).forEach((p) => { node.dirs[p] = node.dirs[p] || { dirs: {}, files: [], count: 0 }; node = node.dirs[p]; node.count++; });
          node.files.push(f);
        });
        const rows = [];
        const walk = (node, depth, prefix) => {
          Object.keys(node.dirs).sort().forEach((name) => {
            const key = prefix + name + '/';
            const open = !self.closed()[key];
            rows.push({ folder: true, file: false, name: name + ' (' + node.dirs[name].count + ')', caret: open ? '⌄' : '›', open: open ? 'true' : 'false', pad: { paddingLeft: (4 + depth * 13) + 'px' },
              toggle: () => { const x = Object.assign({}, self.closed()); x[key] = open; self.closed(x); } });
            if (open) { walk(node.dirs[name], depth + 1, key); }
          });
          node.files.forEach((f) => {
            const on = self.file() === f.path;
            const written = f.status === 'GENERATED' || f.status === 'EDITED';
            rows.push({ folder: false, file: true, path: f.path, name: f.path.substring(f.path.lastIndexOf('/') + 1), pad: { paddingLeft: (4 + depth * 13) + 'px' },
              mark: f.action === 'create' ? 'A' : 'M', markCss: 'factory-mr-mark ' + (f.action === 'create' ? 'is-new' : 'is-changed'), markName: f.action === 'create' ? 'New file' : 'Changed file',
              check: f.checkStatus === 'FAILED' ? '!' : written ? '✓' : '', checkName: f.checkStatus === 'FAILED' ? 'has problems' : written ? 'written' : 'not written yet',
              css: 'factory-mr-file' + (on ? ' is-on' : '') + (f.checkStatus === 'FAILED' ? ' is-failed' : written ? ' is-written' : ''), current: on ? 'true' : null, pick: () => openFile(f.path) });
          });
        };
        walk(root, 0, '');
        return rows;
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
      const numbered = (text) => (text || '').split('\n').map((t, i) => ({ n: i + 1, t: t }));
      self.sourceLines = ko.pureComputed(() => numbered(self.source()));
      self.newLines = ko.pureComputed(() => numbered(self.generated()));
      // The components each side uses: JET elements (oj-, bx-) and, in the new code, capitalised component tags
      const tags = (text, re) => { const out = []; let m; const r = new RegExp(re, 'g'); while ((m = r.exec(text || '')) && out.length < 6) { if (out.indexOf(m[1]) < 0) { out.push(m[1]); } } return out; };
      self.sourceTags = ko.pureComputed(() => tags(self.content() ? self.content().original : '', '<((?:oj|bx)-[a-z-]+)'));
      self.newTags = ko.pureComputed(() => tags(self.content() ? self.content().generated : '', '<((?:bx|oj)-[a-z-]+|[A-Z][A-Za-z]+)[\\s/>]'));
      self.techName = ko.pureComputed(() => (run() && run().technology ? run().technology : 'premium JET'));
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

      self.tabs = ko.pureComputed(() => ui.tabs(self.tab, [{ value: 'code', label: 'Code' }, { value: 'assistant', label: 'Assistant' }, { value: 'diff', label: 'Differences' }, { value: 'tests', label: 'Tests' }, { value: 'log', label: 'Log' }]));
      self.bottomTabs = ko.pureComputed(() => ui.tabs(self.bottomTab, [{ value: 'touches', label: 'What it touches' }, { value: 'components', label: 'Components' }, { value: 'dependencies', label: 'Dependencies' }, { value: 'rules', label: 'Security rules' }]));
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
      self.tabKey = keyed(self.tab, ['code', 'assistant', 'diff', 'tests', 'log'], 'mwTab-');
      self.bottomKey = keyed(self.bottomTab, ['touches', 'components', 'dependencies', 'rules'], 'mwBTab-');
      // The conversation: what was asked, what the factory did, and the notes it was given, in order
      self.conversation = ko.pureComputed(() => {
        const c = self.change();
        const r = run();
        if (!c || !r) { return []; }
        const me = session.user() ? session.user().displayName || session.user().username : '';
        const out = [{ who: r.startedBy || 'You', css: 'factory-mw-say is-you', text: (self.brief() || '').split('\n').find((l) => l.trim()) || 'Move ' + r.subject + '.', when: ui.when(r.startedAt) }];
        (c.events || []).forEach((e) => {
          const person = e.by && !/factory/i.test(e.by);
          out.push({ who: person ? (e.by === me ? 'You' : e.by) : 'Factory', css: 'factory-mw-say ' + (person ? 'is-you' : 'is-factory'), text: e.text, when: ui.when(e.at) });
        });
        return out;
      });
      self.doneList = ko.pureComputed(() => {
        const c = self.change();
        if (!c) { return []; }
        const written = c.files.filter((f) => f.status === 'GENERATED' || f.status === 'EDITED');
        const comps = self.detail() ? self.detail().components : [];
        const out = [];
        if (c.plan && c.plan.items) { out.push('Read the source and planned ' + c.plan.items.length + ' files'); }
        comps.filter((x) => x.premium).slice(0, 3).forEach((x) => out.push(x.element + ' became ' + x.premium));
        if (written.length) { out.push('Wrote ' + written.reduce((n, f) => n + (f.linesAdded || 0), 0) + ' lines in ' + written.length + ' files'); }
        const deps = self.detail() ? self.detail().dependencies : [];
        if (deps.length) { out.push('Found ' + deps.length + (deps.length === 1 ? ' dependency: ' : ' dependencies: ') + deps.map((d) => d.module).join(', ')); }
        return out;
      });
      self.assistantState = ko.pureComputed(() => (self.busy() ? ui.pill('Working', 'blue') : self.status() === 'FAILED' ? ui.pill('Stopped', 'red') : self.status() === 'PLAN_READY' ? ui.pill('Waiting for approval', 'amber') : ui.pill('Ready', 'green')));
      self.request = ko.pureComputed(() => self.conversation().length ? self.conversation()[0].text : '');
      self.diffRows = ko.pureComputed(() => (self.change() ? self.change().files : []).map((f) => ({ path: f.path, added: '+' + (f.linesAdded || 0), removed: '−' + (f.linesRemoved || 0),
        note: f.checkMessage || f.purpose || '', open: () => { self.tab('code'); openFile(f.path); } })));
      self.testFiles = ko.pureComputed(() => (self.change() ? self.change().files : []).filter((f) => /(test|spec)s?[./]|__tests__/i.test(f.path)).map((f) => {
        const written = f.status === 'GENERATED' || f.status === 'EDITED';
        return { path: f.path, state: written ? 'Written' : 'Not written yet', css: ui.pill('', written ? 'green' : 'grey').css, open: () => { self.tab('code'); openFile(f.path); } };
      }));
      self.impact = ko.pureComputed(() => {
        const c = self.change();
        const d = self.detail();
        if (!c || !d) { return []; }
        const rules = d.rules || [];
        const passed = rules.filter((r) => r.result === 'passed').length;
        return [['Files changed', String(c.files.length), 'in this ' + (self.path() === 'migration' ? 'module' : 'wave'), ''],
          ['Components replaced', String(d.components.filter((x) => x.premium).length), 'JET to the new components', ''],
          ['Screens affected', String(d.screenNames.length), 'in this run', ''],
          ['OBDX rules', passed + ' of ' + rules.length, 'checks passed', passed === rules.length ? 'is-good' : 'is-warn'],
          ['For a person', String(self.risks().length), self.risks().length === 1 ? 'thing to check' : 'things to check', self.risks().length ? 'is-warn' : '']].map((x) => ({ k: x[0], v: x[1], sub: x[2], css: 'factory-mw-impact ' + x[3] }));
      });
      self.builds = ko.pureComputed(() => (self.change() ? self.change().builds : []).map((b) => ({ round: b.round, number: b.buildNumber ? '#' + b.buildNumber : '—', result: b.result || 'Running',
        css: ui.pill(b.result || 'Running', b.result === 'SUCCESS' ? 'green' : b.result ? 'red' : 'blue').css, when: ui.when(b.startedAt), errors: (b.errors || []).slice(0, 3).join(' · ') })));
      self.events = ko.pureComputed(() => (self.change() ? self.change().events : []).slice().reverse().map((e) => ({ when: ui.when(e.at), by: e.by || '', text: e.text })));
      self.componentRows = ko.pureComputed(() => (self.detail() ? self.detail().components : []).map((c) => ({ element: c.element, premium: c.premium || 'Stays as it is', uses: c.uses,
        css: mz.compatPill(c.compatibility).css, compat: mz.compatPill(c.compatibility).text })));
      self.dependencyRows = ko.pureComputed(() => {
        const mods = (self.detail() ? self.detail().dependencies : []).map((d) => ({ module: d.module, kind: 'Module', state: d.state === 'delivered' ? 'Moved' : d.state === 'in-progress' ? 'In progress' : 'Not yet',
          css: ui.pill('', d.state === 'delivered' ? 'green' : d.state === 'in-progress' ? 'amber' : 'grey').css }));
        const c = self.change();
        const item = c && c.plan && c.plan.items ? c.plan.items.find((i) => i.path === self.file()) : null;
        const files = (item && item.basedOn ? item.basedOn : []).map((p) => ({ module: p, kind: 'File', state: 'In the code', css: ui.pill('', 'grey').css }));
        return files.concat(mods);
      });
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
            api.get('changes/' + c.id + '/delivery').then((x) => self.delivery(x)).catch(() => self.delivery(null));
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
      self.toPlanner = () => mz.open('modernization-planner');
      self.toUpgrade = () => mz.open('modernization-upgrade');
      self.disconnected = () => { sub.dispose(); window.clearTimeout(timer); };
    }

    return WorkspaceViewModel;
  }
);
