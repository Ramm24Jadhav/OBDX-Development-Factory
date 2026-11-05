/*
 * Validation (Build and validate): the factory's checks on every file of a run's change, the Jenkins builds and the 8
 * OBDX rules, in order, with what to look at. Runs the build again or checks the files again; Send for review opens
 * Review once nothing fails. Every result here comes from the factory's checks or Jenkins.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz, pageRequests) {
    function ValidationViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.detail = ko.observable(null);
      self.change = ko.observable(null);
      self.tab = ko.observable('files');
      self.onlyProblems = ko.observable(false);
      self.picked = ko.observable(0);
      self.evidenceOpen = ko.observable(false);
      const run = ko.pureComputed(() => (self.detail() ? self.detail().run : null));
      self.run = run;
      self.path = ko.pureComputed(() => (run() ? run().path : 'ui'));
      self.steps = ko.pureComputed(() => mz.steps(self.path(), 4));
      self.pathName = ko.pureComputed(() => mz.pathName(self.path()));
      self.lead = ko.pureComputed(() => (run() ? run().subject + (run().technology ? ' · ' + run().technology : '') + ' · the factory’s checks and the Jenkins build.' : ''));

      const files = ko.pureComputed(() => (self.change() ? self.change().files : []));
      const counts = ko.pureComputed(() => {
        const f = files();
        return { passed: f.filter((x) => x.checkStatus === 'PASSED').length, failed: f.filter((x) => x.checkStatus === 'FAILED').length,
          warning: f.filter((x) => x.checkStatus === 'WARNING').length, notChecked: f.filter((x) => !x.checkStatus || x.checkStatus === 'NOT_CHECKED').length, total: f.length };
      });
      const lastBuild = ko.pureComputed(() => {
        const b = self.change() ? self.change().builds : [];
        return b.length ? b[b.length - 1] : null;
      });
      const rules = ko.pureComputed(() => (self.detail() ? self.detail().rules : []));
      const rulesPassed = ko.pureComputed(() => rules().filter((r) => r.result === 'passed').length);
      self.kpis = ko.pureComputed(() => {
        const c = counts();
        const b = lastBuild();
        return [['Files passed', c.passed + ' of ' + c.total, c.failed ? 'red' : 'green'], ['Files with problems', String(c.failed), c.failed ? 'red' : 'green'],
          ['Warnings', String(c.warning), c.warning ? 'amber' : 'grey'], ['Jenkins build', b ? (b.result || 'Running') + (b.buildNumber ? ' #' + b.buildNumber : '') : 'Not run', b && b.result === 'SUCCESS' ? 'green' : b && b.result ? 'red' : 'grey'],
          ['OBDX rules', rulesPassed() + ' of ' + rules().length, rulesPassed() === rules().length && rules().length ? 'green' : 'amber']].map((k) => ({ k: k[0], v: k[1], css: 'fx-kpi factory-mv-kpi is-' + k[2] }));
      });
      // Checks, in order
      self.pipeline = ko.pureComputed(() => {
        const c = counts();
        const b = lastBuild();
        const checks = c.total === 0 ? 'todo' : c.failed ? 'failed' : c.notChecked === c.total ? 'todo' : 'done';
        const build = !b ? 'todo' : !b.result ? 'running' : b.result === 'SUCCESS' ? 'done' : 'failed';
        const rule = rules().some((r) => r.result === 'failed') ? 'failed' : rulesPassed() === rules().length && rules().length ? 'done' : 'todo';
        const ready = checks === 'done' && build === 'done' && rule === 'done' ? 'done' : 'todo';
        const list = [['The factory’s checks', checks, c.total ? c.passed + ' passed, ' + c.failed + ' with problems, ' + c.warning + ' warnings, ' + c.notChecked + ' not checked' : 'No files yet', 'files'],
          ['Jenkins build and tests', build, b ? (b.result || 'Running') + (b.errors && b.errors.length ? ': ' + b.errors.length + ' errors' : '') : 'Not run yet: Run the tests', 'build'],
          ['The 8 OBDX rules', rule, rulesPassed() + ' of ' + rules().length + ' passed', 'rules'],
          ['Ready for review', ready, ready === 'done' ? 'Everything passed' : 'Waits for the steps above', 'files']];
        return list.map((p, i) => ({ n: i + 1, name: p[0], state: p[1], text: p[2], css: 'factory-mv-step is-' + p[1] + (self.picked() === i ? ' is-on' : ''),
          mark: p[1] === 'done' ? '✓' : p[1] === 'failed' ? '!' : p[1] === 'running' ? '…' : String(i + 1), pick: () => { self.picked(i); self.tab(p[3]); } }));
      });
      self.ready = ko.pureComputed(() => self.pipeline().length && self.pipeline()[3].state === 'done');
      self.passPct = ko.pureComputed(() => { const c = counts(); return c.total ? Math.round(100 * c.passed / c.total) + '%' : '—'; });
      self.ring = ko.pureComputed(() => { const c = counts(); const p = c.total ? Math.round(100 * c.passed / c.total) : 0; return { style: { '--p': p, '--c': c.failed ? 'var(--fx-danger)' : 'var(--fx-success)' }, label: self.passPct() }; });

      self.tabs = ko.pureComputed(() => ui.tabs(self.tab, [{ value: 'files', label: 'Files', count: counts().total }, { value: 'build', label: 'Jenkins builds' },
        { value: 'rules', label: 'OBDX rules' }, { value: 'log', label: 'Log' }]));
      self.tabKey = (vm, event) => {
        const keys = ['files', 'build', 'rules', 'log'];
        const at = keys.indexOf(self.tab());
        const n = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (n < 0) { return true; }
        event.preventDefault();
        self.tab(keys[n]);
        const b = document.getElementById('mvTab-' + keys[n]);
        if (b) { b.focus(); }
        return false;
      };
      const STATUS = { PASSED: ['Passed', 'green'], FAILED: ['Problems', 'red'], WARNING: ['Warning', 'amber'], NOT_CHECKED: ['Not checked', 'grey'] };
      self.fileRows = ko.pureComputed(() => files().filter((f) => !self.onlyProblems() || f.checkStatus === 'FAILED' || f.checkStatus === 'WARNING').map((f) => {
        const s = STATUS[f.checkStatus || 'NOT_CHECKED'];
        return { path: f.path, layer: f.layer, status: s[0], css: ui.pill(s[0], s[1]).css, message: f.checkMessage || '', lines: '+' + f.linesAdded + ' −' + f.linesRemoved };
      }));
      self.problemCount = ko.pureComputed(() => counts().failed + counts().warning);
      self.buildRows = ko.pureComputed(() => (self.change() ? self.change().builds : []).slice().reverse().map((b) => ({ round: b.round, number: b.buildNumber ? '#' + b.buildNumber : '—',
        result: b.result || 'Running', css: ui.pill(b.result || 'Running', b.result === 'SUCCESS' ? 'green' : b.result ? 'red' : 'blue').css, when: ui.when(b.startedAt), url: b.buildUrl,
        errors: b.errors || [], fixed: (b.fixedFiles || []).join(', ') })));
      self.ruleRows = ko.pureComputed(() => rules().map((r) => ({ id: r.id, text: r.text, result: r.result === 'passed' ? 'Passed' : r.result === 'failed' ? 'Problems in ' + r.failing.length + ' files' : 'Not checked yet',
        css: ui.pill('', r.result === 'passed' ? 'green' : r.result === 'failed' ? 'red' : 'grey').css, failing: r.failing.slice(0, 5).join(', ') })));
      self.log = ko.pureComputed(() => (lastBuild() && lastBuild().logExcerpt ? lastBuild().logExcerpt : 'No build log yet.'));
      self.lookAt = ko.pureComputed(() => {
        const out = [];
        files().filter((f) => f.checkStatus === 'FAILED').slice(0, 4).forEach((f) => out.push({ text: f.path + ': ' + (f.checkMessage || 'problems'), tab: 'files' }));
        const b = lastBuild();
        if (b && b.errors) { b.errors.slice(0, 3).forEach((e) => out.push({ text: 'Build: ' + e, tab: 'build' })); }
        return out.map((x) => Object.assign(x, { go: () => { self.tab(x.tab); self.onlyProblems(x.tab === 'files'); } }));
      });
      self.jenkinsUrl = ko.pureComputed(() => (lastBuild() ? lastBuild().buildUrl : null));

      const reload = () => api.get('changes/' + run().changeId).then((c) => self.change(c));
      self.runAgain = () => api.post('changes/' + run().changeId + '/build').then(() => { toast.success('The Jenkins build started again.'); return reload(); }).then(poll).catch((e) => toast.error(ui.errorText(e)));
      self.checkAgain = () => api.post('changes/' + run().changeId + '/check').then((c) => { self.change(c); toast.success('The files were checked again.'); }).catch((e) => toast.error(ui.errorText(e)));
      self.toReview = () => mz.open('modernization-review', { runId: run().id });
      self.back = () => mz.open('modernization-workspace', { runId: run() ? run().id : null });
      self.openBuildPage = () => { pageRequests.change(run().changeId); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'build' })); };
      self.openEvidence = () => self.evidenceOpen(true);
      self.closeEvidence = () => self.evidenceOpen(false);
      self.moreItems = ko.pureComputed(() => [{ value: 'build', label: 'Open in Build, Test & Review' }, { value: 'evidence', label: 'Test evidence' },
        { value: 'check', label: 'Check the files again', disabled: !self.canManage() }, { value: 'jenkins', label: 'Open the build in Jenkins', disabled: !self.jenkinsUrl() }]);
      self.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'build') { self.openBuildPage(); } else if (v === 'evidence') { self.openEvidence(); } else if (v === 'check') { self.checkAgain(); } else if (self.jenkinsUrl()) { window.open(self.jenkinsUrl(), '_blank', 'noopener'); }
      };
      let timer = null;
      const poll = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => { if (lastBuild() && !lastBuild().result) { reload().then(poll).catch(() => null); } }, 6000);
      };

      const load = (id) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        const asked = mz.take();
        api.get('workspaces/' + id + '/modernization/runs').then((list) => {
          const pick = asked.runId || (list.find((r) => r.open) || list[0] || {}).id;
          if (!pick) { self.error('No run yet. Start a wave or a module first.'); return null; }
          return api.get('workspaces/' + id + '/modernization/runs/' + pick + '/detail').then((d) => {
            self.detail(d);
            self.error(null);
            return d.run.changeId ? api.get('changes/' + d.run.changeId).then((c) => { self.change(c); poll(); }) : null;
          });
        }).catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe((id) => load(id));
      self.connected = () => {
        accUtils.announce('Validation loaded.', 'assertive');
        document.title = 'Validation';
        load(self.workspaceId());
      };
      self.disconnected = () => { sub.dispose(); window.clearTimeout(timer); };
    }

    return ValidationViewModel;
  }
);
