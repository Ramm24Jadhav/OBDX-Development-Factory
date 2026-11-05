/*
 * Review and approval (step 5 of both paths): a run's change file by file, before and after, what it changes and
 * touches, the review steps (validation, the technical review that approved the plan, the security review), and the
 * decisions: Request changes sends notes back to the workspace, Reject closes the change with a reason, Approve and
 * deliver delivers it to SVN once every step is done, then says what happened and what comes next.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui', '../services/toast',
        '../services/modernization', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, toast, mz, pageRequests) {
    function ReviewViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.canApprove = ko.pureComputed(() => !!self.workspaceId() && session.can(self.workspaceId(), 'APPROVE'));
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.detail = ko.observable(null);
      self.change = ko.observable(null);
      self.comments = ko.observableArray([]);
      self.file = ko.observable(null);
      self.content = ko.observable(null);
      self.query = ko.observable('');
      self.show = ko.observable('all');
      self.layout = ko.observable('split');
      self.stripTab = ko.observable('what');
      self.tab = ko.observable('mapping');
      self.dialog = ko.observable('');
      self.note = ko.observable('');
      self.reason = ko.observable('');
      self.noteFiles = ko.observable('all');
      self.closeAfter = ko.observable(false);
      self.delivered = ko.observable(null);
      self.working = ko.observable(false);
      self.mzRun = mz.runPill;
      self.layoutOptions = [{ value: 'split', label: 'Side by side' }, { value: 'unified', label: 'One column' }];
      self.noteFileOptions = ko.pureComputed(() => [{ value: 'all', label: 'All files in this change' }, { value: 'this', label: 'Only ' + (self.file() || 'the open file') }]);

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
      self.summary = ko.pureComputed(() => {
        const d = self.detail();
        if (!d) { return []; }
        const passed = rules().filter((r) => r.result === 'passed').length;
        return [[files().length + ' files · ' + d.screenNames.length + ' screens · ' + d.components.reduce((n, c) => n + c.uses, 0) + ' component uses', 'grey'],
          [failed() ? failed() + ' files with problems' : 'Every file passed the checks', failed() ? 'red' : 'green'],
          [lastBuild() ? 'Build ' + (lastBuild().result || 'running') : 'No build yet', lastBuild() && lastBuild().result === 'SUCCESS' ? 'green' : 'amber'],
          [passed + ' of ' + rules().length + ' OBDX rules', passed === rules().length ? 'green' : 'amber']].map((x) => ui.pill(x[0], x[1]));
      });

      self.fileRows = ko.pureComputed(() => {
        const q = self.query().trim().toLowerCase();
        return files().filter((f) => (!q || f.path.toLowerCase().indexOf(q) >= 0) && (self.show() === 'all' || (self.show() === 'new' ? f.action === 'create' : f.action !== 'create'))).map((f) => {
          const on = self.file() === f.path;
          return { path: f.path, name: f.path.substring(f.path.lastIndexOf('/') + 1), dir: f.path.substring(0, Math.max(0, f.path.lastIndexOf('/'))), action: f.action === 'create' ? 'New' : 'Changed',
            lines: '+' + f.linesAdded + ' −' + f.linesRemoved, css: 'factory-mw-file' + (on ? ' is-on' : '') + (f.checkStatus === 'FAILED' ? ' is-failed' : f.checkStatus === 'PASSED' ? ' is-passed' : ''),
            mark: f.checkStatus === 'FAILED' ? '!' : f.checkStatus === 'PASSED' ? '✓' : '', current: on ? 'true' : null, pick: () => openFile(f.path) };
        });
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
      self.before = ko.pureComputed(() => (self.content() ? lines(self.content().original || '') : []));
      self.after = ko.pureComputed(() => (self.content() ? lines(self.content().generated || '') : []));
      self.unified = ko.pureComputed(() => (self.content() ? (self.content().diff || '').split('\n').map((t) => ({ t: t, css: t.startsWith('+') ? 'factory-diff-add' : t.startsWith('-') ? 'factory-diff-del' : t.startsWith('@@') ? 'factory-diff-hunk' : '' })) : []));
      self.isNew = ko.pureComputed(() => !!self.content() && !self.content().original);
      const item = ko.pureComputed(() => {
        const c = self.change();
        return c && c.plan && c.plan.items ? c.plan.items.find((i) => i.path === self.file()) : null;
      });
      self.whatChanged = ko.pureComputed(() => (item() ? (item().purpose || '') + (item().details ? '\n\n' + item().details : '') : 'Pick a file.'));
      self.basedOn = ko.pureComputed(() => (item() && item().basedOn ? item().basedOn : []));
      self.stripTabs = ko.pureComputed(() => ui.tabs(self.stripTab, [{ value: 'what', label: 'What changed' }, { value: 'touches', label: 'What it touches' }, { value: 'tests', label: 'Tests' }]));
      self.tabs = ko.pureComputed(() => ui.tabs(self.tab, [{ value: 'mapping', label: 'Mapping' }, { value: 'logic', label: 'Business logic' }, { value: 'services', label: 'Service calls' },
        { value: 'security', label: 'Security' }, { value: 'evidence', label: 'Evidence' }, { value: 'comments', label: 'Comments', count: self.comments().length }]));
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
      self.stripKey = keyed(self.stripTab, ['what', 'touches', 'tests'], 'mrStrip-');
      self.tabKey = keyed(self.tab, ['mapping', 'logic', 'services', 'security', 'evidence', 'comments'], 'mrTab-');
      self.screens = ko.pureComputed(() => (self.detail() ? self.detail().screenNames : []));
      self.componentRows = ko.pureComputed(() => (self.detail() ? self.detail().components : []).map((c) => ({ element: c.element, premium: c.premium || 'Stays as it is', uses: c.uses, compat: mz.compatPill(c.compatibility).text, css: mz.compatPill(c.compatibility).css })));
      self.calls = ko.pureComputed(() => (self.detail() ? self.detail().calls : []));
      self.planSummary = ko.pureComputed(() => (self.change() && self.change().plan ? self.change().plan.summary : ''));
      self.risks = ko.pureComputed(() => (self.change() && self.change().plan ? self.change().plan.risks || [] : []));
      self.ruleRows = ko.pureComputed(() => rules().map((r) => ({ id: r.id, text: r.text, result: r.result === 'passed' ? 'Passed' : r.result === 'failed' ? 'Problems' : 'Not checked',
        css: ui.pill('', r.result === 'passed' ? 'green' : r.result === 'failed' ? 'red' : 'grey').css })));
      self.builds = ko.pureComputed(() => (self.change() ? self.change().builds : []).slice().reverse().map((b) => ({ number: b.buildNumber ? '#' + b.buildNumber : '—', result: b.result || 'Running',
        css: ui.pill(b.result || 'Running', b.result === 'SUCCESS' ? 'green' : b.result ? 'red' : 'blue').css, when: ui.when(b.startedAt) })));
      self.commentRows = ko.pureComputed(() => self.comments().map((c) => ({ author: c.author || 'Someone', text: c.text, when: ui.when(c.createdAt), kind: c.kind })));

      // The review steps
      const validated = ko.pureComputed(() => failed() === 0 && files().length > 0 && !!lastBuild() && lastBuild().result === 'SUCCESS' && rules().every((r) => r.result === 'passed'));
      self.reviewSteps = ko.pureComputed(() => {
        const c = self.change();
        const r = run();
        if (!c || !r) { return []; }
        return [
          { name: 'Validation', who: validated() ? 'Checks, build and rules passed' : 'Waiting: open Validation', done: validated() },
          { name: 'Technical review', who: c.planApprovedBy ? 'Plan approved by ' + c.planApprovedBy : 'Waiting for the plan approval', done: !!c.planApprovedBy },
          { name: 'Security review', who: r.securityBy ? 'Signed off by ' + r.securityBy + ' · ' + ui.when(r.securityAt) : 'Waiting for a sign-off', done: !!r.securityBy }
        ].map((s) => Object.assign(s, { mark: s.done ? '✓' : '○', css: 'factory-mr-step ' + (s.done ? 'is-done' : 'is-wait') }));
      });
      self.allDone = ko.pureComputed(() => self.reviewSteps().length > 0 && self.reviewSteps().every((s) => s.done));
      self.waitText = ko.pureComputed(() => {
        const left = self.reviewSteps().filter((s) => !s.done).map((s) => s.name.toLowerCase());
        return left.length ? 'Waiting for: ' + left.join(', ') + '.' : 'Every review step is done.';
      });
      self.securityDone = ko.pureComputed(() => !!(run() && run().securityBy));
      self.toggleSecurity = () => {
        api.post('workspaces/' + self.workspaceId() + '/modernization/runs/' + run().id + '/security-review', { done: !self.securityDone() }).then((x) => {
          const d = Object.assign({}, self.detail(), { run: x });
          self.detail(d);
          toast.success(x.securityBy ? 'Security review signed off.' : 'Security sign-off withdrawn.');
        }).catch((e) => toast.error(ui.errorText(e)));
      };
      self.isFinal = ko.pureComputed(() => !!run() && (run().state === 'delivered' || run().state === 'rejected'));

      // Decisions
      self.openRequest = () => { self.note(''); self.noteFiles('all'); self.dialog('request'); };
      self.openReject = () => { self.reason(''); self.dialog('reject'); };
      self.openApprove = () => { self.delivered(null); self.dialog('approve'); };
      self.closeDialog = () => self.dialog('');
      self.requestOpen = ko.pureComputed({ read: () => self.dialog() === 'request', write: (v) => { if (!v) { self.dialog(''); } } });
      self.rejectOpen = ko.pureComputed({ read: () => self.dialog() === 'reject', write: (v) => { if (!v) { self.dialog(''); } } });
      self.approveOpen = ko.pureComputed({ read: () => self.dialog() === 'approve', write: (v) => { if (!v) { self.dialog(''); } } });
      self.sendBack = () => {
        const note = self.note().trim();
        if (!note) { toast.error('Say what should change; the note goes with the files.'); return; }
        const targets = self.noteFiles() === 'this' && self.file() ? [self.file()] : files().map((f) => f.path);
        self.working(true);
        targets.reduce((p, path) => p.then(() => api.post('changes/' + self.change().id + '/regenerate', { path: path, note: note })), Promise.resolve()).then(() => {
          toast.success('Sent back to the workspace: ' + targets.length + (targets.length === 1 ? ' file is' : ' files are') + ' written again with your note.');
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
          toast.success('The change is rejected and closed. Nothing was delivered.');
          return reload();
        }).catch((e) => toast.error(ui.errorText(e))).then(() => self.working(false));
      };
      self.deliverFacts = ko.pureComputed(() => {
        const c = self.change();
        return c ? [['Files', files().length + ' files, ' + self.screens().length + ' screens'], ['Commit message', c.title], ['Delivered to', 'A branch of ' + 'the workspace’s SVN, as for any change']].map((x) => ({ k: x[0], v: x[1] })) : [];
      });
      self.deliver = () => {
        if (!self.allDone() || !self.canManage()) { return; }
        self.working(true);
        api.post('changes/' + self.change().id + '/deliver').then((c) => {
          self.change(c);
          return api.get('workspaces/' + self.workspaceId() + '/modernization/runs/' + run().id + '/detail').then((d) => { self.detail(d); return c; });
        }).then((c) => {
          self.delivered({ revision: c.deliveredRevision, branch: c.branchUrl, by: session.user() ? session.user().displayName || session.user().username : '', when: ui.when(c.updatedAt) });
          toast.success('Delivered to SVN at r' + c.deliveredRevision + '.');
        }).catch((e) => toast.error(ui.errorText(e))).then(() => self.working(false));
      };
      self.nextModule = () => { self.dialog(''); mz.open(self.path() === 'migration' ? 'modernization-planner' : 'modernization-upgrade'); };
      self.toHistory = () => { self.dialog(''); mz.open('modernization-history'); };
      self.toOverview = () => { self.dialog(''); mz.open('modernization'); };

      self.downloadReport = () => {
        const c = self.change();
        const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x]);
        const rows = (list) => list.map((r) => '<tr>' + r.map((x) => '<td>' + esc(x) + '</td>').join('') + '</tr>').join('');
        const html = '<!doctype html><meta charset="utf-8"><title>' + esc(c.title) + '</title><style>body{font:14px system-ui;margin:32px}table{border-collapse:collapse;margin:8px 0 20px}td{border:1px solid #ddd;padding:4px 8px}h2{margin-top:24px}</style>'
          + '<h1>' + esc(c.title) + '</h1><p>' + esc(self.lead()) + '</p><h2>Review steps</h2><table>' + rows(self.reviewSteps().map((s) => [s.name, s.done ? 'Done' : 'Waiting', s.who])) + '</table>'
          + '<h2>Files</h2><table>' + rows(files().map((f) => [f.path, f.action, f.checkStatus || 'NOT_CHECKED', f.checkMessage || ''])) + '</table>'
          + '<h2>OBDX rules</h2><table>' + rows(rules().map((r) => [r.id, r.text, r.result])) + '</table>'
          + '<h2>Builds</h2><table>' + rows(self.builds().map((b) => [b.number, b.result, b.when])) + '</table>'
          + '<h2>Comments</h2><table>' + rows(self.commentRows().map((x) => [x.author, x.when, x.text])) + '</table>';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        a.download = 'review-report.html';
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      self.back = () => mz.open('modernization-validation', { runId: run() ? run().id : null });
      self.evidence = () => mz.open('modernization-validation', { runId: run().id });
      self.revisionsOpen = ko.observable(false);
      self.revisionEvents = ko.pureComputed(() => (self.change() ? self.change().events : []).filter((e) => /again|edited|written|plan/i.test(e.text)).slice().reverse().map((e) => ({ when: ui.when(e.at), by: e.by || '', text: e.text })));
      self.moreItems = ko.pureComputed(() => [{ value: 'revisions', label: 'Compare revisions' }, { value: 'evidence', label: 'Test evidence' }, { value: 'report', label: 'Download the review report' },
        { value: 'patch', label: 'Download the patch' }, { value: 'changes', label: 'Open in Changes' }]);
      self.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'revisions') { self.revisionsOpen(true); } else if (v === 'evidence') { self.evidence(); } else if (v === 'report') { self.downloadReport(); }
        else if (v === 'patch') { window.location.href = 'api/changes/' + self.change().id + '/patch'; }
        else { pageRequests.change(self.change().id); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' })); }
      };
      self.closeRevisions = () => self.revisionsOpen(false);

      const reload = () => api.get('changes/' + run().changeId).then((c) => self.change(c));
      const load = (id) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        const asked = mz.take();
        api.get('workspaces/' + id + '/modernization/runs').then((list) => {
          const pick = asked.runId || (list.find((r) => r.state === 'validating') || list.find((r) => r.open) || list[0] || {}).id;
          if (!pick) { self.error('No run to review yet.'); return null; }
          return api.get('workspaces/' + id + '/modernization/runs/' + pick + '/detail').then((d) => {
            self.detail(d);
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
