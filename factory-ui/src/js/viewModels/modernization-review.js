/*
 * Review and approval (step 5 of both paths): a run's change in three tabs. Changes: the files as a folder tree, before
 * and after side by side (a new file in one column) with the added lines marked, and what each file changes, touches,
 * depends on and is tested by. Checks: everything the factory and Jenkins checked. Comments: what was said, with a box
 * to add one. The four review steps (validation, the technical review, the security review, the approval) say who and
 * where each stands. Request changes sends notes back to the workspace for the chosen files and tells the reviewers;
 * Reject closes the change with a reason; Approve and deliver commits it to SVN once every step is done, then says what
 * happened and what comes next. Compare revisions shows what changed between two versions of the change.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui', '../services/toast',
        '../services/modernization', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, toast, mz, pageRequests) {
    function ReviewViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.canApprove = ko.pureComputed(() => !!self.workspaceId() && session.can(self.workspaceId(), 'APPROVE'));
      self.canComment = ko.pureComputed(() => !!self.workspaceId() && session.can(self.workspaceId(), 'COMMENT'));
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.detail = ko.observable(null);
      self.change = ko.observable(null);
      self.v = ko.observable(null);
      self.comments = ko.observableArray([]);
      self.file = ko.observable(null);
      self.content = ko.observable(null);
      self.query = ko.observable('');
      self.show = ko.observable('all');
      self.layout = ko.observable('split');
      self.stripTab = ko.observable('what');
      self.top = ko.observable('changes');
      self.closed = ko.observable({});
      self.dialog = ko.observable('');
      self.note = ko.observable('');
      self.reason = ko.observable('');
      self.allFiles = ko.observable(true);
      self.noteFiles = ko.observableArray([]);
      self.newComment = ko.observable('');
      self.closeAfter = ko.observable(false);
      self.pickCloseAfter = (event) => self.closeAfter(event.target.checked);
      self.closeNote = ko.observable('');
      self.delivered = ko.observable(null);
      self.deliverError = ko.observable('');
      self.delivery = ko.observable(null);
      self.planFact = ko.observable('');
      self.next = ko.observable(null);
      self.working = ko.observable(false);
      self.mzRun = mz.runPill;
      self.layoutOptions = [{ value: 'split', label: 'Side by side' }, { value: 'unified', label: 'One column' }];

      const run = ko.pureComputed(() => (self.detail() ? self.detail().run : null));
      self.run = run;
      self.path = ko.pureComputed(() => (run() ? run().path : 'ui'));
      self.steps = ko.pureComputed(() => mz.steps(self.path(), 5));
      self.pathName = ko.pureComputed(() => mz.pathName(self.path()));
      self.lead = ko.pureComputed(() => (run() ? run().subject + (run().technology ? ' · ' + run().technology : '') + ' · check the change, then approve it.' : ''));
      const files = ko.pureComputed(() => (self.change() ? self.change().files : []));
      const failed = ko.pureComputed(() => files().filter((f) => f.checkStatus === 'FAILED').length);
      const lastBuild = ko.pureComputed(() => { const b = self.change() ? self.change().builds : []; return b.length ? b[b.length - 1] : null; });
      const rules = ko.pureComputed(() => (self.detail() ? self.detail().rules : []));
      const rulesPassed = ko.pureComputed(() => rules().filter((r) => r.result === 'passed').length);
      const totals = ko.pureComputed(() => (self.v() ? self.v().totals : { total: 0, passed: 0, failed: 0, skipped: 0 }));
      const security = ko.pureComputed(() => (self.v() ? self.v().byType.security : { total: 0, failed: 0 }));

      // The summary strip: size, tests, security findings, OBDX rules
      self.sizeText = ko.pureComputed(() => {
        const d = self.detail();
        return d ? files().length + ' files · ' + d.screenNames.length + ' screens · ' + d.components.reduce((n, c) => n + c.uses, 0) + ' components' : '';
      });
      self.summary = ko.pureComputed(() => {
        if (!self.detail()) { return []; }
        const t = totals();
        const s = security();
        return [
          [t.total ? (t.failed ? '! ' + t.failed + ' of ' + t.total + ' tests failed' : '✓ ' + t.passed + ' of ' + t.total + ' tests passed') : lastBuild() ? 'Build ' + (lastBuild().result || 'running') + ', no test report' : 'No build yet',
            t.total ? (t.failed ? 'red' : 'green') : 'amber'],
          [s.total ? (s.failed ? '! ' + s.failed + ' security finding' + (s.failed === 1 ? '' : 's') : '✓ No security findings') : 'Security checks not run', s.total ? (s.failed ? 'amber' : 'green') : 'grey'],
          [(rulesPassed() === rules().length ? '✓ ' : '! ') + rulesPassed() + ' of ' + rules().length + ' OBDX rules', rulesPassed() === rules().length ? 'green' : 'amber'],
          [failed() ? '! ' + failed() + ' files with problems' : '✓ Every file passed the checks', failed() ? 'red' : 'green']].map((x) => ui.pill(x[0], x[1]));
      });

      // Changed files as a folder tree (folders open; a click closes or opens one)
      self.tree = ko.pureComputed(() => {
        const q = self.query().trim().toLowerCase();
        const list = files().filter((f) => (!q || f.path.toLowerCase().indexOf(q) >= 0) && (self.show() === 'all' || (self.show() === 'new' ? f.action === 'create' : f.action !== 'create')));
        const root = { dirs: {}, files: [], count: 0 };
        list.forEach((f) => {
          const parts = f.path.split('/');
          let node = root;
          node.count++;
          parts.slice(0, -1).forEach((p) => { node.dirs[p] = node.dirs[p] || { dirs: {}, files: [], count: 0 }; node = node.dirs[p]; node.count++; });
          node.files.push(f);
        });
        const rows = [];
        const walk = (node, depth, prefix) => {
          Object.keys(node.dirs).sort().forEach((name) => {
            const key = prefix + name + '/';
            const open = !self.closed()[key];
            rows.push({ folder: true, file: false, name: name + ' (' + node.dirs[name].count + ')', caret: open ? '⌄' : '›', open: open ? 'true' : 'false', pad: { paddingLeft: (4 + depth * 13) + 'px' },
              toggle: () => { const c = Object.assign({}, self.closed()); c[key] = open; self.closed(c); } });
            if (open) { walk(node.dirs[name], depth + 1, key); }
          });
          node.files.forEach((f) => {
            const on = self.file() === f.path;
            const added = f.action === 'create';
            rows.push({ folder: false, file: true, path: f.path, name: f.path.substring(f.path.lastIndexOf('/') + 1), pad: { paddingLeft: (4 + depth * 13) + 'px' },
              mark: added ? 'A' : 'M', markName: added ? 'New file' : 'Changed file', markCss: 'factory-mr-mark ' + (added ? 'is-new' : 'is-changed'),
              check: f.checkStatus === 'FAILED' ? '!' : '', lines: '+' + f.linesAdded + ' −' + f.linesRemoved,
              css: 'factory-mr-file' + (on ? ' is-on' : '') + (f.checkStatus === 'FAILED' ? ' is-failed' : ''), current: on ? 'true' : null, pick: () => openFile(f.path) });
          });
        };
        walk(root, 0, '');
        return rows;
      });
      self.filesMenu = [{ value: 'changed', label: 'Show only changed' }, { value: 'new', label: 'Show only new' }, { value: 'all', label: 'Show all' }, { separator: true }, { value: 'patch', label: 'Download the patch' }];
      self.filesAction = (event) => {
        const v = event.detail.value;
        if (v === 'patch') { window.location.href = 'api/changes/' + self.change().id + '/patch'; } else { self.show(v); }
      };
      const openFile = (path) => {
        self.file(path);
        self.content(null);
        api.get('changes/' + self.change().id + '/file?path=' + encodeURIComponent(path)).then((x) => { if (self.file() === path) { self.content(x); } }).catch((e) => toast.error(ui.errorText(e)));
      };
      const lines = (text) => (text || '').split('\n').map((t, i) => ({ n: i + 1, t: t }));
      // The new file's lines the diff adds, by line number
      const addedLines = ko.pureComputed(() => {
        const out = {};
        let n = 0;
        (self.content() ? self.content().diff || '' : '').split('\n').forEach((l) => {
          const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
          if (h) { n = Number(h[1]); return; }
          if (!n || l.startsWith('---') || l.startsWith('+++')) { return; }
          if (l.startsWith('+')) { out[n] = true; n++; } else if (!l.startsWith('-')) { n++; }
        });
        return out;
      });
      self.isNew = ko.pureComputed(() => !!self.content() && !self.content().original);
      self.split = ko.pureComputed(() => self.layout() === 'split' && !self.isNew());
      self.before = ko.pureComputed(() => (self.content() ? lines(self.content().original || '') : []));
      self.after = ko.pureComputed(() => {
        const add = addedLines();
        return self.content() ? lines(self.content().generated || '').map((l) => Object.assign(l, { sign: self.isNew() || add[l.n] ? '+' : '', css: self.isNew() || add[l.n] ? 'is-add' : '' })) : [];
      });
      self.afterTitle = ko.pureComputed(() => (self.isNew() ? 'New file' : 'After') + (run() && run().technology ? ' (' + run().technology + ')' : ''));
      self.unified = ko.pureComputed(() => (self.content() ? (self.content().diff || '').split('\n').map((t) => ({ t: t, css: t.startsWith('+') ? 'factory-diff-add' : t.startsWith('-') ? 'factory-diff-del' : t.startsWith('@@') ? 'factory-diff-hunk' : '' })) : []));
      self.fileState = ko.pureComputed(() => (self.file() ? ui.pill(self.isNew() ? 'New' : 'Changed', self.isNew() ? 'green' : 'blue') : null));
      const item = ko.pureComputed(() => {
        const c = self.change();
        return c && c.plan && c.plan.items ? c.plan.items.find((i) => i.path === self.file()) : null;
      });
      self.whatChanged = ko.pureComputed(() => (item() ? (item().purpose || '') + (item().details ? '\n\n' + item().details : '') : 'Pick a file.'));
      self.basedOn = ko.pureComputed(() => (item() && item().basedOn ? item().basedOn : []));
      self.dependencyRows = ko.pureComputed(() => (self.detail() ? self.detail().dependencies || [] : []).map((d) => ({ module: d.module, state: mz.runPill(d.state).text, css: mz.runPill(d.state).css })));
      self.fileTests = ko.pureComputed(() => {
        const name = (self.file() || '').replace(/^.*\//, '').replace(/\.[a-z]+$/i, '');
        const v = self.v();
        const suites = v && name ? v.suites.filter((s) => s.name.toLowerCase().indexOf(name.toLowerCase()) >= 0) : [];
        return suites.map((s) => ({ name: s.name, text: s.passed + ' of ' + s.total + ' passed', css: ui.pill(s.failed ? 'Failed' : 'Passed', s.failed ? 'red' : 'green').css, result: s.failed ? 'Failed' : 'Passed' }));
      });
      self.stripTabs = ko.pureComputed(() => ui.tabs(self.stripTab, [{ value: 'what', label: 'What changed and why' }, { value: 'touches', label: 'What it touches' },
        { value: 'deps', label: 'Dependencies' }, { value: 'tests', label: 'Tests' }]));
      self.topTabs = ko.pureComputed(() => ui.tabs(self.top, [{ value: 'changes', label: 'Changes' }, { value: 'checks', label: 'Checks' }, { value: 'comments', label: 'Comments', count: self.comments().length }]));
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
      self.stripKey = keyed(self.stripTab, ['what', 'touches', 'deps', 'tests'], 'mrStrip-');
      self.topKey = keyed(self.top, ['changes', 'checks', 'comments'], 'mrTop-');
      self.screens = ko.pureComputed(() => (self.detail() ? self.detail().screenNames : []));
      self.calls = ko.pureComputed(() => (self.detail() ? self.detail().calls : []));

      // Checks: everything the factory and Jenkins checked on the change
      self.checkRows = ko.pureComputed(() => {
        const v = self.v();
        const b = lastBuild();
        const t = totals();
        const s = security();
        const comps = self.detail() ? self.detail().components : [];
        const risks = self.change() && self.change().plan ? self.change().plan.risks || [] : [];
        const row = (name, text, state) => ({ name: name, text: text, result: state === 'ok' ? '✓ Passed' : state === 'look' ? '! Look at' : state === 'fail' ? '✕ Failed' : 'Not run',
          css: ui.pill('', state === 'ok' ? 'green' : state === 'look' ? 'amber' : state === 'fail' ? 'red' : 'grey').css });
        return [
          row('Tests' + (b && b.buildNumber ? ', build #' + b.buildNumber : ''), t.total ? t.passed + ' of ' + t.total + ' passed' + (t.failed ? ', ' + t.failed + ' failed' : '') : b ? 'The build published no test report' : 'No build yet', t.total ? (t.failed ? 'fail' : 'ok') : 'none'),
          row('Line coverage', v && v.coverage !== null && v.coverage !== undefined ? Math.round(v.coverage) + '% (gate ' + v.gate + '%)' : 'Not published', v && v.coverage !== null && v.coverage !== undefined ? (v.coverage >= v.gate ? 'ok' : 'look') : 'none'),
          row('Security', s.total ? (s.failed ? s.failed + ' finding' + (s.failed === 1 ? '' : 's') + ': ' + (v ? v.failed.filter((f) => f.type === 'security').map((f) => f.name).join('; ') : '') : 'No findings') : 'No security suite in the report', s.total ? (s.failed ? 'look' : 'ok') : 'none'),
          row('Business logic', risks.length ? risks.join(' · ') : 'Nothing for a person to confirm', risks.length ? 'look' : 'ok'),
          row('Factory checks on the files', failed() ? failed() + ' of ' + files().length + ' files with problems' : files().length + ' of ' + files().length + ' files passed', failed() ? 'fail' : 'ok'),
          row('OBDX service calls', self.calls().length ? (self.calls().length === 1 ? 'The same service' : 'The same ' + self.calls().length + ' services') : 'None called', rules().some((r) => /service|digx/i.test(r.text) && r.result === 'failed') ? 'fail' : 'ok'),
          row('Components', comps.length ? comps.map((c) => c.element).slice(0, 6).join(', ') + (comps.length > 6 ? ' and ' + (comps.length - 6) + ' more' : '') + ' replaced' : 'No JET components', 'ok'),
          row('OBDX rules', rulesPassed() + ' of ' + rules().length, rulesPassed() === rules().length ? 'ok' : 'fail')
        ];
      });
      self.checksLead = ko.pureComputed(() => {
        const look = self.checkRows().filter((r) => r.result !== '✓ Passed' && r.result !== 'Not run').length;
        return 'Everything the factory and Jenkins checked on this change.' + (look ? ' ' + (look === 1 ? 'One needs' : look + ' need') + ' a look.' : '');
      });

      // Comments
      self.commentRows = ko.pureComputed(() => self.comments().map((c) => ({ author: c.author || 'Someone', initials: (c.author || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
        text: c.text, when: ui.when(c.createdAt), kind: c.kind === 'CHANGES_REQUESTED' ? 'Changes requested' : '' })));
      self.addComment = () => {
        const text = self.newComment().trim();
        if (!text) { toast.error('Write the comment first.'); return; }
        api.post('changes/' + self.change().id + '/plan-comments', { kind: 'COMMENT', text: text }).then((c) => {
          self.comments.push(c);
          self.newComment('');
          toast.success('Comment added. The reviewers see it here.');
        }).catch((e) => toast.error(ui.errorText(e)));
      };
      self.openComments = () => self.top('comments');

      // The review steps: validation, technical review, security review, approval
      const validated = ko.pureComputed(() => failed() === 0 && files().length > 0 && !!lastBuild() && lastBuild().result === 'SUCCESS' && rules().every((r) => r.result === 'passed') && !totals().failed);
      self.isFinal = ko.pureComputed(() => !!run() && (run().state === 'delivered' || run().state === 'rejected'));
      self.reviewSteps = ko.pureComputed(() => {
        const c = self.change();
        const r = run();
        if (!c || !r) { return []; }
        const b = lastBuild();
        const tech = !!c.planApprovedBy;
        const sec = !!r.securityBy;
        const three = validated() && tech && sec;
        const list = [
          { name: 'Validation', who: b && b.buildNumber ? 'Jenkins build #' + b.buildNumber : 'The factory’s checks and Jenkins', state: validated() ? 'done' : 'now' },
          { name: 'Technical review', who: tech ? c.planApprovedBy : 'Someone with the Approve permission', state: tech ? 'done' : validated() ? 'now' : 'wait' },
          { name: 'Security review', who: sec ? r.securityBy + ' · ' + ui.when(r.securityAt) : 'Someone with the Approve permission', state: sec ? 'done' : tech ? 'now' : 'wait' },
          { name: 'Approval', who: r.state === 'delivered' ? 'Delivered at r' + r.deliveredRevision : self.canApprove() ? 'You' : 'Someone with the Approve permission', state: r.state === 'delivered' ? 'done' : three ? 'ready' : 'wait' }
        ];
        const STATE = { done: ['Done', 'green'], now: ['In review', 'blue'], ready: ['Ready', 'blue'], wait: ['Waiting', 'grey'] };
        return list.map((s, i) => Object.assign(s, { mark: s.state === 'done' ? '✓' : String(i + 1), css: 'factory-mr-step is-' + s.state, chip: STATE[s.state][0], chipCss: ui.pill(STATE[s.state][0], STATE[s.state][1]).css }));
      });
      self.allDone = ko.pureComputed(() => self.reviewSteps().length > 0 && self.reviewSteps().slice(0, 3).every((s) => s.state === 'done'));
      const blocking = ko.pureComputed(() => self.reviewSteps().slice(0, 3).find((s) => s.state !== 'done'));
      self.waitText = ko.pureComputed(() => {
        if (self.isFinal()) { return run().state === 'delivered' ? 'Delivered to SVN.' : 'Rejected and closed.'; }
        const left = self.reviewSteps().slice(0, 3).filter((s) => s.state !== 'done').map((s) => s.name.toLowerCase());
        return left.length ? 'Waiting for: ' + left.join(', ') : 'Every review step is done';
      });
      self.blockedText = ko.pureComputed(() => {
        const b = blocking();
        if (!b) { return ''; }
        return b.name === 'Validation' ? 'Validation is not done: the build, the tests, the file checks or the OBDX rules have problems. Approve stays greyed out until they pass.'
          : 'The ' + b.name.toLowerCase() + ' is not done. Approve stays greyed out until ' + b.who.toLowerCase().replace(/^someone/, 'someone') + ' approves it.';
      });
      self.approveTitle = ko.pureComputed(() => (self.isFinal() ? 'This run is ' + run().state : !self.allDone() ? self.waitText() + ': Approve opens once every step is done'
        : !self.canApprove() ? 'Approving needs the Approve permission' : !self.canManage() ? 'Delivering needs the Manage code permission' : null));
      self.canDeliver = ko.pureComputed(() => !self.isFinal() && self.allDone() && self.canApprove() && self.canManage());
      self.securityDone = ko.pureComputed(() => !!(run() && run().securityBy));
      self.toggleSecurity = () => {
        api.post('workspaces/' + self.workspaceId() + '/modernization/runs/' + run().id + '/security-review', { done: !self.securityDone() }).then((x) => {
          self.detail(Object.assign({}, self.detail(), { run: x }));
          toast.success(x.securityBy ? 'Security review signed off.' : 'Security sign-off withdrawn.');
        }).catch((e) => toast.error(ui.errorText(e)));
      };

      // Request changes, Reject
      self.fileOptions = ko.pureComputed(() => files().map((f) => ({ value: f.path, label: f.path.substring(f.path.lastIndexOf('/') + 1) })));
      self.openRequest = () => { self.note(''); self.allFiles(!self.file()); self.noteFiles(self.file() ? [self.file()] : []); self.dialog('request'); };
      self.openReject = () => { self.reason(''); self.dialog('reject'); };
      self.closeDialog = () => self.dialog('');
      const dialogOpen = (name) => ko.pureComputed({ read: () => self.dialog() === name, write: (v) => { if (!v) { self.dialog(''); } } });
      self.requestOpen = dialogOpen('request');
      self.rejectOpen = dialogOpen('reject');
      self.approveOpen = dialogOpen('approve');
      self.sendBack = () => {
        const note = self.note().trim();
        if (!note) { toast.error('Say what should change; the note goes with the files.'); return; }
        const targets = self.allFiles() ? files().map((f) => f.path) : self.noteFiles();
        if (!targets.length) { toast.error('Pick the files to write again, or All files.'); return; }
        self.working(true);
        const names = self.allFiles() ? 'all files' : targets.map((p) => p.substring(p.lastIndexOf('/') + 1)).join(', ');
        api.post('changes/' + self.change().id + '/plan-comments', { kind: 'COMMENT', text: 'Changes requested (' + names + '): ' + note }).catch(() => null)
          .then(() => targets.reduce((p, path) => p.then(() => api.post('changes/' + self.change().id + '/regenerate', { path: path, note: note })), Promise.resolve()))
          .then(() => {
            toast.success('Sent back to the workspace with your note: ' + targets.length + (targets.length === 1 ? ' file is' : ' files are') + ' written again. The reviewers see it in Comments.');
            self.dialog('');
            mz.open('modernization-workspace', { runId: run().id });
          }).catch((e) => toast.error(ui.errorText(e))).then(() => self.working(false));
      };
      self.reject = () => {
        const reason = self.reason().trim();
        if (!reason) { toast.error('Say why the change is rejected.'); return; }
        self.working(true);
        api.post('workspaces/' + self.workspaceId() + '/modernization/runs/' + run().id + '/reject', { reason: reason }).then((x) => {
          self.detail(Object.assign({}, self.detail(), { run: x }));
          self.dialog('');
          toast.success('The change is rejected and closed. Nothing was delivered, and ' + run().subject + ' is back to planned.');
          return reload();
        }).catch((e) => toast.error(ui.errorText(e))).then(() => self.working(false));
      };

      // Approve and deliver
      self.openApprove = () => {
        self.delivered(null);
        self.deliverError('');
        self.closeNote('');
        self.dialog('approve');
        api.get('changes/' + self.change().id + '/delivery').then((d) => self.delivery(d)).catch(() => self.delivery(null));
      };
      self.deliverFacts = ko.pureComputed(() => {
        const d = self.delivery();
        return [['Files', files().length + ' files, ' + self.screens().length + ' screens'], ['SVN branch', d ? d.branch : 'A new branch for this change'],
          ['Commit message', d ? d.message : (self.change() ? self.change().title : '')]].map((x) => ({ k: x[0], v: x[1], mono: x[0] === 'SVN branch' ? 'factory-mb-mono' : '' }));
      });
      const planProgress = () => (self.path() === 'migration'
        ? api.get('workspaces/' + self.workspaceId() + '/modernization/planner').then((p) => {
          const inPlan = p.modules.filter((m) => m.inPlan).sort((a, b) => a.order - b.order);
          const done = inPlan.filter((m) => m.state === 'delivered').length;
          const next = inPlan.find((m) => m.state !== 'delivered' && m.state !== 'in-progress');
          self.planFact(run().subject + ' is moved · ' + done + ' of ' + inPlan.length + ' modules');
          self.next(next ? { label: 'Start the next module: ' + next.name, page: 'modernization-planner' } : { label: 'Every module in the plan is started', page: 'modernization-planner' });
        })
        : api.get('workspaces/' + self.workspaceId() + '/modernization/upgrade-plan').then((p) => {
          const done = p.waves.filter((w) => w.state === 'delivered').length;
          const next = p.waves.find((w) => w.state === 'planned');
          self.planFact(run().subject + ' is upgraded · ' + done + ' of ' + p.waves.length + ' waves');
          self.next(next ? { label: 'Start the next wave: ' + next.name, page: 'modernization-upgrade' } : { label: 'Every wave is started', page: 'modernization-upgrade' });
        })).catch(() => { self.planFact(''); self.next({ label: self.path() === 'migration' ? 'Open the migration plan' : 'Open the upgrade plan', page: self.path() === 'migration' ? 'modernization-planner' : 'modernization-upgrade' }); });
      self.deliver = () => {
        if (!self.canDeliver()) { return; }
        self.working(true);
        self.deliverError('');
        api.post('changes/' + self.change().id + '/deliver').then((c) => {
          self.change(c);
          return api.get('workspaces/' + self.workspaceId() + '/modernization/runs/' + run().id + '/detail').then((d) => { self.detail(d); return c; });
        }).then((c) => {
          self.delivered({ revision: c.deliveredRevision, branch: c.branchUrl, by: session.user() ? session.user().displayName || session.user().username : '', when: ui.when(c.updatedAt) });
          toast.success('Delivered to SVN at r' + c.deliveredRevision + '.');
          const closing = self.closeAfter()
            ? api.post('changes/' + c.id + '/close', { reason: 'MERGED' }).then((x) => { self.change(x); self.closeNote('The change is closed.'); })
              .catch((e) => self.closeNote('Not closed yet: ' + ui.errorText(e) + ' The factory closes it on its own once the branch is merged.'))
            : Promise.resolve();
          return Promise.all([closing, planProgress()]);
        }).catch((e) => self.deliverError(ui.errorText(e))).then(() => self.working(false));
      };
      self.nextModule = () => { const n = self.next(); self.dialog(''); mz.open(n ? n.page : 'modernization'); };
      self.toHistory = () => { self.dialog(''); mz.open('modernization-history'); };
      self.toOverview = () => { self.dialog(''); mz.open('modernization'); };

      // Compare revisions
      self.revisionsOpen = ko.observable(false);
      self.versions = ko.observableArray([]);
      self.fromVersion = ko.observable(null);
      self.toVersion = ko.observable(null);
      self.comparison = ko.observable(null);
      self.compareError = ko.observable('');
      self.versionOptions = ko.pureComputed(() => self.versions().map((v) => ({ value: v.n, label: 'Version ' + v.n + ' · ' + v.label + ' · ' + ui.when(v.at) })));
      const compare = () => {
        const a = self.fromVersion();
        const b = self.toVersion();
        self.comparison(null);
        if (!a || !b || a === b) { self.compareError(a && a === b ? 'Pick two different versions.' : ''); return; }
        self.compareError('');
        api.get('changes/' + self.change().id + '/compare?from=' + Math.min(a, b) + '&to=' + Math.max(a, b)).then((c) => self.comparison(c)).catch((e) => self.compareError(ui.errorText(e)));
      };
      self.fromVersion.subscribe(compare);
      self.toVersion.subscribe(compare);
      self.openRevisions = () => {
        self.revisionsOpen(true);
        self.comparison(null);
        api.get('changes/' + self.change().id + '/versions').then((list) => {
          self.versions(list);
          if (list.length >= 2) { self.fromVersion(list[0].n); self.toVersion(list[list.length - 1].n); } else { self.compareError(''); }
        }).catch((e) => self.compareError(ui.errorText(e)));
      };
      self.compareRows = ko.pureComputed(() => (self.comparison() ? self.comparison().files : []).map((f) => ({ path: f.path, name: f.path.substring(f.path.lastIndexOf('/') + 1), added: '+' + f.linesAdded, removed: f.linesRemoved ? '−' + f.linesRemoved : '',
        state: f.added ? 'New' : '', open: () => { self.revisionsOpen(false); self.top('changes'); self.layout('unified'); openFile(f.path); } })));
      // Why it changed: the notes, edits and comments between the two versions
      self.whyChanged = ko.pureComputed(() => {
        const c = self.comparison();
        if (!c || !self.change()) { return []; }
        const from = new Date(c.from.at).getTime() - 1000;
        const to = new Date(c.to.at).getTime() + 1000;
        const inside = (at) => { const t = new Date(at).getTime(); return t > from && t <= to; };
        const events = (self.change().events || []).filter((e) => inside(e.at) && /again|note|edited|written/i.test(e.text)).map((e) => ({ when: ui.when(e.at), text: e.text + (e.by ? ' · ' + e.by : '') }));
        const said = self.comments().filter((x) => inside(x.createdAt)).map((x) => ({ when: ui.when(x.createdAt), text: (x.author || 'Someone') + ': ' + x.text }));
        return events.concat(said);
      });
      self.closeRevisions = () => self.revisionsOpen(false);

      self.reportHref = ko.pureComputed(() => (run() ? 'api/workspaces/' + self.workspaceId() + '/modernization/runs/' + run().id + '/review.pdf' : '#'));
      self.back = () => mz.open('modernization-validation', { runId: run() ? run().id : null });
      self.evidence = () => mz.open('modernization-validation', { runId: run().id });
      self.moreItems = ko.pureComputed(() => [{ value: 'revisions', label: 'Compare revisions' }, { value: 'evidence', label: 'Test evidence' }, { value: 'report', label: 'Download the review report' },
        { value: 'patch', label: 'Download the patch' }, { value: 'changes', label: 'Open in Changes' },
        { value: 'security', label: self.securityDone() ? 'Withdraw the security sign-off' : 'Sign off the security review', disabled: self.isFinal() || !self.canApprove() },
        { separator: true }, { value: 'reject', label: 'Reject the change', danger: true, disabled: self.isFinal() || !self.canManage() }]);
      self.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'revisions') { self.openRevisions(); } else if (v === 'evidence') { self.evidence(); } else if (v === 'report') { window.location.href = self.reportHref(); }
        else if (v === 'patch') { window.location.href = 'api/changes/' + self.change().id + '/patch'; } else if (v === 'security') { self.toggleSecurity(); } else if (v === 'reject') { self.openReject(); }
        else { pageRequests.change(self.change().id); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' })); }
      };

      const reload = () => api.get('changes/' + run().changeId).then((c) => self.change(c));
      const load = (id) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        const asked = mz.take();
        api.get('workspaces/' + id + '/modernization/runs').then((list) => {
          const pick = asked.runId || (list.find((r) => r.state === 'validating') || list.find((r) => r.open) || list[0] || {}).id;
          if (!pick) { self.error('No run to review yet.'); return null; }
          return Promise.all([api.get('workspaces/' + id + '/modernization/runs/' + pick + '/detail'),
            api.get('workspaces/' + id + '/modernization/runs/' + pick + '/validation').catch(() => null)]).then((x) => {
            const d = x[0];
            self.detail(d);
            self.v(x[1]);
            self.error(null);
            if (!d.run.changeId) { return null; }
            return Promise.all([api.get('changes/' + d.run.changeId), api.get('changes/' + d.run.changeId + '/plan-review').catch(() => null)]).then((r) => {
              self.change(r[0]);
              self.comments(r[1] ? r[1].comments || [] : []);
              if (r[0].files.length) { openFile(r[0].files[0].path); }
            });
          });
        }).catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe((id) => load(id));
      self.connected = () => {
        accUtils.announce('Review and approval loaded.', 'assertive');
        document.title = 'Review and approval';
        load(self.workspaceId());
      };
      self.disconnected = () => sub.dispose();
    }

    return ReviewViewModel;
  }
);
