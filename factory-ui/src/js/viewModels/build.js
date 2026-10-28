/*
 * Build, Test & Review page: the validation of one change. Its quick checks per file, its Jenkins build rounds with
 * errors and log excerpts, failure details with the related file, the review and delivery state, quick actions (build
 * again, check again, write a failed file again) and an assistant that answers from the build results.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/assistant', 'ojs/ojknockout', 'ojs/ojbutton', 'ojs/ojinputtext'],
  function (ko, accUtils, api, workspaceSelection, session, ui, assistant) {
    const POLL_MS = 3000;
    const code = (prefix, id, n) => prefix + '-' + id.replace(/-/g, '').slice(0, n).toUpperCase();

    function BuildViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.canManage = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.errorMessage = ko.observable('');
      this.changes = ko.observableArray([]);
      this.changeId = ko.observable('');
      this.detail = ko.observable(null);
      this.jenkins = ko.observable(null);
      this.changeChange = (event) => this.changeId(event.target.value);
      const showError = (error) => this.errorMessage(error.message);

      // Lifecycle of the change: plan approved, code generated, validation, review, apply
      this.stages = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const s = d.status;
        const generated = ['GENERATED', 'DELIVERED', 'CLOSED'].indexOf(s) >= 0;
        const done = [!!d.planApprovedAt, generated, generated && d.buildStatus === 'PASSED' || s === 'DELIVERED' || s === 'CLOSED',
          s === 'DELIVERED' || s === 'CLOSED', s === 'CLOSED' && d.closedReason === 'MERGED'];
        const current = done.indexOf(false);
        return ['Plan Approved', 'Code Generated', 'Validation', 'Review', 'Apply Changes'].map((name, i) => ({
          name: (i + 1) + '. ' + name, number: i + 1, check: done[i],
          css: 'factory-' + (done[i] ? 'st-done' : (i === current ? (d.buildStatus === 'FAILED' || s === 'FAILED' ? 'st-failed' : 'st-now') : 'st-todo'))
        }));
      });

      const files = ko.pureComputed(() => (this.detail() ? this.detail().files : []));
      const builds = ko.pureComputed(() => (this.detail() ? this.detail().builds : []));
      this.jenkinsBuilds = ko.pureComputed(() => builds().filter((b) => b.job !== 'Quick checks'));
      this.lastBuild = ko.pureComputed(() => (this.jenkinsBuilds().length ? this.jenkinsBuilds()[this.jenkinsBuilds().length - 1] : null));
      this.checks = ko.pureComputed(() => {
        const c = (s) => files().filter((f) => f.checkStatus === s).length;
        return { passed: c('PASSED'), failed: c('FAILED'), warning: c('WARNING'), notChecked: files().filter((f) => !f.checkStatus || f.checkStatus === 'NOT_CHECKED').length };
      });
      this.headline = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return { text: '', css: '', note: '' };
        }
        const b = this.lastBuild();
        const when = b ? ui.when(b.finishedAt || b.startedAt) : '';
        if (d.buildStatus === 'BUILDING') {
          return { text: 'Build Running', tone: 'blue', icon: 'clock', note: d.buildMessage || 'Quick checks and Jenkins are running.' };
        }
        if (d.buildStatus === 'PASSED') {
          return { text: 'Build Successful', tone: 'green', icon: 'check', note: 'Completed ' + when };
        }
        if (d.buildStatus === 'FAILED') {
          return { text: 'Build Failed', tone: 'red', icon: 'x', note: (d.buildMessage || 'See the failures below.') + (when ? ' · ' + when : '') };
        }
        const k = this.checks();
        if (k.failed) {
          return { text: 'Quick Checks Failed', tone: 'red', icon: 'x', note: k.failed + ' file(s) break the version pack rules.' };
        }
        return k.passed
          ? { text: 'Quick Checks Passed', tone: 'green', icon: 'check', note: 'No Jenkins build yet.' }
          : { text: 'Not Validated Yet', tone: 'grey', icon: 'clock', note: 'Generate the code, then check or build it.' };
      });
      this.headCss = ko.pureComputed(() => 'factory-step-dot factory-bt-big factory-dot-' + (this.headline().tone || 'grey'));
      this.headIcon = ko.pureComputed(() => 'factory-nav-icon factory-ico-' + (this.headline().icon || 'clock'));
      this.kpis = ko.pureComputed(() => {
        const k = this.checks();
        const b = this.lastBuild();
        const errors = this.jenkinsBuilds().reduce((sum, x) => sum + x.errors.length, 0);
        return [
          { value: files().filter((f) => f.status === 'GENERATED').length, label: 'Files changed',
            subs: [{ text: '+' + files().reduce((s, f) => s + f.linesAdded, 0), css: 'factory-ch-plus' }, { text: '-' + files().reduce((s, f) => s + f.linesRemoved, 0), css: 'factory-ch-minus' }] },
          { value: k.passed + k.failed + k.warning, label: 'Quick checks', subs: [{ text: k.passed + ' passed', css: 'factory-ov-pill factory-ov-pill-green' }, { text: k.failed + ' failed', css: 'factory-ov-pill factory-ov-pill-red' }] },
          { value: k.warning, label: 'Warnings', subs: [{ text: 'shown to reviewers', css: 'factory-ov-subtle' }] },
          { value: this.jenkinsBuilds().length, label: 'Jenkins rounds', subs: [{ text: b ? (b.result || 'running') : 'none yet', css: b && b.result === 'SUCCESS' ? 'factory-ov-pill factory-ov-pill-green' : 'factory-ov-pill factory-ov-pill-grey' }] },
          { value: errors, label: 'Build errors', subs: [{ text: errors ? 'sent to the model to fix' : 'none', css: 'factory-ov-subtle' }] },
          { value: builds().reduce((sum, x) => sum + x.fixedFiles.length, 0), label: 'Files fixed', subs: [{ text: 'by fix rounds', css: 'factory-ov-subtle' }] }
        ];
      });

      this.tab = ko.observable('results');
      this.tabs = ui.tabs(this.tab, [
        { value: 'results', label: 'Build & Test Results' },
        { value: 'static', label: 'Static Analysis' },
        { value: 'obdx', label: 'OBDX Checks' },
        { value: 'approval', label: 'Approval History' },
        { value: 'deployment', label: 'Deployment' }
      ]);
      // The validation stages as cards
      this.stageCards = ko.pureComputed(() => {
        const k = this.checks();
        const b = this.lastBuild();
        const card = (title, state, detail, sub) => ({
          title: title, detail: detail, sub: sub,
          css: 'factory-step-dot factory-bt-mid factory-dot-' + ({ ok: 'green', bad: 'red', warn: 'amber', run: 'blue' }[state] || 'grey'),
          icon: 'factory-nav-icon factory-ico-' + (state === 'ok' ? 'check' : state === 'bad' ? 'x' : state === 'warn' ? 'alert' : 'clock'),
          pill: ui.pill(state === 'ok' ? 'Success' : state === 'bad' ? 'Failed' : state === 'warn' ? 'Warnings' : state === 'run' ? 'Running' : 'Not run',
            state === 'ok' ? 'green' : state === 'bad' ? 'red' : state === 'warn' ? 'amber' : state === 'run' ? 'blue' : 'grey')
        });
        const dur = (x) => (x && x.finishedAt ? Math.max(1, Math.round((new Date(x.finishedAt) - new Date(x.startedAt)) / 1000)) + 's' : '');
        return [
          card('1. Syntax and rules', k.failed ? 'bad' : k.warning ? 'warn' : k.passed ? 'ok' : 'none', 'Quick checks on generated files', k.passed + ' passed · ' + k.failed + ' failed'),
          card('2. Jenkins build', !b ? 'none' : b.result === 'SUCCESS' ? 'ok' : (b.result === 'RUNNING' || b.result === 'QUEUED') ? 'run' : 'bad', b ? b.job + (b.buildNumber ? ' #' + b.buildNumber : '') : 'Not run', dur(b)),
          card('3. Fix rounds', builds().length > 1 ? (this.detail().buildStatus === 'PASSED' ? 'ok' : 'warn') : 'none', builds().length + ' round(s)', builds().reduce((s, x) => s + x.fixedFiles.length, 0) + ' files fixed'),
          card('4. Review', this.detail() && (this.detail().status === 'DELIVERED' || this.detail().status === 'CLOSED') ? 'ok' : 'none', 'Delivered for review', this.detail() && this.detail().branchUrl ? 'branch' : 'patch')
        ];
      });

      // Failures: build errors and failed quick checks, each with its file
      this.failureFilter = ko.observable('all');
      this.failures = ko.pureComputed(() => {
        const list = [];
        builds().forEach((b) => b.errors.forEach((e) => {
          const m = e.match(/([\w./-]+\.(?:java|js|ts|tsx|html|xml|sql|properties))(?::(\d+))?/);
          list.push({ kind: 'Build', source: b.job + ' round ' + b.round, message: e, file: m ? m[1] : '', line: m && m[2] ? m[2] : '', log: b.logExcerpt || '' });
        }));
        files().filter((f) => f.checkStatus === 'FAILED' || f.checkStatus === 'WARNING').forEach((f) => list.push({
          kind: f.checkStatus === 'FAILED' ? 'Quick check' : 'Warning', source: 'Quick checks', message: f.checkMessage || f.checkStatus, file: f.path, line: '', log: ''
        }));
        return list.map((x, i) => Object.assign(x, {
          index: i, status: x.kind === 'Warning' ? ui.pill('WARNING', 'amber') : ui.pill('FAILED', 'red'),
          pick: () => this.selectedFailure(i)
        }));
      });
      this.failureTabs = ui.tabs(this.failureFilter, [
        { value: 'all', label: 'All', count: ko.pureComputed(() => this.failures().length) },
        { value: 'Build', label: 'Build', count: ko.pureComputed(() => this.failures().filter((f) => f.kind === 'Build').length) },
        { value: 'Quick check', label: 'Quick checks', count: ko.pureComputed(() => this.failures().filter((f) => f.kind === 'Quick check').length) },
        { value: 'Warning', label: 'Warnings', count: ko.pureComputed(() => this.failures().filter((f) => f.kind === 'Warning').length) }
      ]);
      this.failureSearch = ko.observable('');
      this.failureSearchInput = ui.value(this.failureSearch);
      this.visibleFailures = ko.pureComputed(() => {
        const text = this.failureSearch().trim().toLowerCase();
        return this.failures().filter((f) => (this.failureFilter() === 'all' || f.kind === this.failureFilter())
          && (!text || (f.message + ' ' + f.file).toLowerCase().indexOf(text) >= 0));
      });
      this.selectedFailure = ko.observable(0);
      this.failure = ko.pureComputed(() => this.failures()[this.selectedFailure()] || null);
      this.failurePosition = ko.pureComputed(() => (this.failures().length ? (this.selectedFailure() + 1) + ' of ' + this.failures().length : ''));
      this.prevFailure = () => this.selectedFailure(Math.max(0, this.selectedFailure() - 1));
      this.nextFailure = () => this.selectedFailure(Math.min(this.failures().length - 1, this.selectedFailure() + 1));
      this.detailTab = ko.observable('message');
      this.detailTabs = ui.tabs(this.detailTab, [{ value: 'message', label: 'Error Message' }, { value: 'log', label: 'Logs' }]);

      // Logs: each build round's excerpt
      this.logRound = ko.observable(0);
      this.logs = ko.pureComputed(() => builds().map((b, i) => ({
        label: b.job + ' #' + (b.buildNumber || b.round), css: ko.pureComputed(() => 'factory-chip' + (this.logRound() === i ? ' factory-chip-on' : '')), pick: () => this.logRound(i)
      })));
      this.logText = ko.pureComputed(() => {
        const b = builds()[this.logRound()];
        return b ? (b.logExcerpt || '(no log excerpt for this round)') : 'No builds yet.';
      });
      this.logLines = ko.pureComputed(() => this.logText().split('\n').map((t, i) => ({ n: i + 1, text: t, css: /ERROR|FAIL/i.test(t) ? 'factory-bt-logline factory-bt-logerr' : 'factory-bt-logline' })));
      this.logDownload = ko.pureComputed(() => 'data:text/plain;charset=utf-8,' + encodeURIComponent(this.logText()));

      this.fileRows = ko.pureComputed(() => files().map((f) => ({
        path: f.path, layer: f.layer, check: f.checkStatus === 'PASSED' ? ui.pill('Passed', 'green') : f.checkStatus === 'FAILED' ? ui.pill('Failed', 'red')
          : f.checkStatus === 'WARNING' ? ui.pill('Warning', 'amber') : ui.pill('Not checked', 'grey'),
        message: f.checkMessage || '', attempts: f.attempts
      })));
      this.info = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        return [
          { label: 'Change ID', value: code('CHG', d.id, 3), link: true },
          { label: 'Requirement', value: code('REQ', d.requirementId, 4), link: true },
          { label: 'Branch', value: d.branchUrl ? d.branchUrl.split('/').slice(-2).join('/') : 'Not delivered (patch)' },
          { label: 'Created', value: ui.when(d.createdAt) },
          { label: 'Last Build', value: this.lastBuild() ? ui.when(this.lastBuild().startedAt) : 'None' },
          { label: 'Requested by', value: d.createdBy || '–' }
        ];
      });
      this.approvals = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const rows = [{ what: 'Change requested', who: d.createdBy, at: ui.when(d.createdAt) }];
        if (d.planApprovedAt) {
          rows.push({ what: 'Plan approved', who: d.planApprovedBy, at: ui.when(d.planApprovedAt) });
        }
        if (d.deliveredRevision) {
          rows.push({ what: 'Delivered to SVN at r' + d.deliveredRevision, who: d.createdBy, at: ui.when(d.updatedAt) });
        }
        if (d.closedAt) {
          rows.push({ what: 'Closed as ' + (d.closedReason || '').toLowerCase(), who: d.closedBy, at: ui.when(d.closedAt) });
        }
        return rows;
      });
      this.headStatus = ko.pureComputed(() => ui.pill(this.headline().text, this.headline().tone));

      // Quick actions
      this.canBuild = ko.pureComputed(() => {
        const d = this.detail();
        const j = this.jenkins();
        if (!d || !j || !this.canManage() || d.buildStatus === 'BUILDING') {
          return false;
        }
        return j.mode === 'BRANCH' ? d.status === 'DELIVERED' : (d.status === 'GENERATED' || d.status === 'DELIVERED');
      });
      this.buildHint = ko.pureComputed(() => (!this.jenkins() ? 'Set up Jenkins on the Code page to build.' : ''));
      const base = () => 'changes/' + this.detail().id;
      this.rebuild = () => api.post(base() + '/build').then(show).catch(showError);
      this.checkAgain = () => api.post(base() + '/check').then(show).catch(showError);
      this.fixWithAi = () => {
        const f = this.failure();
        if (!f || !f.file) {
          this.errorMessage('Choose a failure with a file first.');
          return;
        }
        const file = files().find((x) => x.path === f.file || x.path.endsWith('/' + f.file) || f.file.endsWith(x.path));
        if (!file) {
          this.errorMessage('The failing file is not one of this change\'s files.');
          return;
        }
        api.post(base() + '/regenerate', { path: file.path, note: 'Fix this failure: ' + f.message }).then(show).catch(showError);
      };
      this.openWorkbench = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }));
      this.deliver = () => {
        if (!window.confirm('Commit the reviewed code to a new SVN branch? Trunk is not changed.')) {
          return;
        }
        api.post(base() + '/deliver').then(show).catch(showError);
      };

      this.ai = assistant.create(() => {
        const d = this.detail();
        if (!d) {
          return '';
        }
        return 'Change "' + d.title + '" build status ' + (d.buildStatus || 'not built') + '. ' + (d.buildMessage || '')
          + '\nQuick checks: ' + files().map((f) => f.path + ' ' + (f.checkStatus || 'not checked') + (f.checkMessage ? ' - ' + f.checkMessage : '')).join('; ')
          + '\nBuild rounds:\n' + builds().map((b) => 'Round ' + b.round + ' ' + b.job + ' ' + (b.result || '') + ' errors: ' + b.errors.join(' | ')
            + (b.logExcerpt ? '\nLog:\n' + b.logExcerpt.slice(-3000) : '')).join('\n');
      }, ['Why is the build failing?', 'Show the proposed fix', 'Explain the failing check', 'Which files are affected?']);

      let pollTimer = null;
      const show = (d) => {
        this.detail(d);
        this.errorMessage('');
        clearTimeout(pollTimer);
        if (d.status === 'GENERATING' || d.buildStatus === 'BUILDING') {
          pollTimer = setTimeout(() => this.load(), POLL_MS);
        }
      };
      this.load = () => {
        const id = this.changeId();
        if (!id) {
          this.detail(null);
          return;
        }
        api.get('changes/' + id).then(show).catch(showError);
      };
      this.changeId.subscribe(() => { this.selectedFailure(0); this.logRound(0); this.load(); });
      const loadList = () => {
        const id = this.workspaceId();
        this.detail(null);
        if (!id) {
          this.changes([]);
          return;
        }
        api.get('workspaces/' + id + '/jenkins').then((j) => this.jenkins(j)).catch(() => this.jenkins(null));
        api.get('workspaces/' + id + '/changes').then((list) => {
          this.changes(list.map((c) => ({ id: c.id, label: code('CHG', c.id, 3) + ' – ' + c.title })));
          if (list.length) {
            this.changeId(list[0].id);
          }
        }).catch(showError);
      };

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Build, Test and Review page loaded.');
        document.title = 'Build, Test & Review';
        subscription = this.workspaceId.subscribe(loadList);
        workspaceSelection.load().then(loadList).catch(showError);
      };
      this.disconnected = () => {
        clearTimeout(pollTimer);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return BuildViewModel;
  }
);
