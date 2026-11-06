/*
 * Validation (Build and validate): a run's change through every check, in order: the factory's checks on the files,
 * the Jenkins build, the unit, functional, security, accessibility and performance suites (each suite typed from its
 * name in the JUnit report), and the 8 OBDX rules; the tests by suite, line coverage against the workspace's gate, the
 * OBDX service calls, and the build's screenshots as evidence. Runs the failed tests again; Send for review opens
 * Review once nothing fails. Every result here comes from the factory's checks or Jenkins.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz, pageRequests) {
    const TYPE = { unit: 'Unit', functional: 'Functional', api: 'API', security: 'Security', accessibility: 'Accessibility', ui: 'UI', performance: 'Performance' };
    const TONE = { unit: 'blue', functional: 'violet', api: 'blue', security: 'red', accessibility: 'green', ui: 'amber', performance: 'grey' };

    function ValidationViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.detail = ko.observable(null);
      self.change = ko.observable(null);
      self.v = ko.observable(null);
      self.tab = ko.observable('tests');
      self.onlyProblems = ko.observable(false);
      self.picked = ko.observable(0);
      self.evidenceOpen = ko.observable(false);
      self.rerunLine = ko.observable('');
      const run = ko.pureComputed(() => (self.detail() ? self.detail().run : null));
      self.run = run;
      self.path = ko.pureComputed(() => (run() ? run().path : 'ui'));
      self.steps = ko.pureComputed(() => mz.steps(self.path(), 4));
      self.pathName = ko.pureComputed(() => mz.pathName(self.path()));
      self.lead = ko.pureComputed(() => (run() ? run().subject + (run().technology ? ' · ' + run().technology : '') + ' · the factory’s checks, the Jenkins build and its tests.' : ''));

      const files = ko.pureComputed(() => (self.change() ? self.change().files : []));
      const counts = ko.pureComputed(() => {
        const f = files();
        return { passed: f.filter((x) => x.checkStatus === 'PASSED').length, failed: f.filter((x) => x.checkStatus === 'FAILED').length,
          warning: f.filter((x) => x.checkStatus === 'WARNING').length, notChecked: f.filter((x) => !x.checkStatus || x.checkStatus === 'NOT_CHECKED').length, total: f.length };
      });
      const build = ko.pureComputed(() => (self.v() ? self.v().build : null));
      const running = ko.pureComputed(() => !!self.change() && self.change().builds.some((b) => !b.finishedAt));
      const type = (t) => (self.v() ? self.v().byType[t] : { total: 0, passed: 0, failed: 0, skipped: 0 });
      const rules = ko.pureComputed(() => (self.v() ? self.v().rules : []));
      const rulesPassed = ko.pureComputed(() => rules().filter((r) => r.result === 'passed').length);
      const of = (c) => (c.total ? c.passed + ' of ' + c.total : 'Not run');
      const toneOf = (c) => (!c.total ? 'grey' : c.failed ? 'red' : 'green');

      self.kpis = ko.pureComputed(() => {
        const b = build();
        const sec = type('security');
        const a11y = type('accessibility');
        const perf = type('performance');
        const calls = self.v() ? self.v().calls.length : 0;
        const svcRule = rules().find((r) => /service|digx/i.test(r.text));
        return [
          ['Build', b ? (b.result || 'Running') + (b.number ? ' #' + b.number : '') : 'Not run', !b ? 'grey' : b.result === 'SUCCESS' ? 'green' : b.result ? 'red' : 'blue'],
          ['Unit tests', of(type('unit')), toneOf(type('unit'))],
          ['Functional', of(type('functional')), toneOf(type('functional'))],
          ['OBDX services', calls ? (svcRule && svcRule.result === 'failed' ? 'Changed' : calls + ' of ' + calls + ' the same') : 'None called', svcRule && svcRule.result === 'failed' ? 'red' : 'green'],
          ['Security', sec.total ? sec.failed + (sec.failed === 1 ? ' finding' : ' findings') : 'Not run', sec.total ? (sec.failed ? 'red' : 'green') : 'grey'],
          ['Accessibility', a11y.total ? (a11y.failed ? a11y.failed + ' failing' : 'WCAG 2.2 AA') : 'Not run', toneOf(a11y)],
          ['Performance', perf.total ? of(perf) : 'Not measured', toneOf(perf)]
        ].map((k) => ({ k: k[0], v: k[1], css: 'fx-kpi factory-mv-kpi is-' + k[2], chipCss: 'factory-mb-chip ' + ({ green: 'is-success', red: 'is-danger', amber: 'is-warning', grey: 'is-grey' }[k[2]] || '') }));
      });

      // The checks, in order: picking one shows what happened and opens its tab
      self.pipeline = ko.pureComputed(() => {
        const c = counts();
        const b = build();
        const state = (cnt) => (running() && !cnt.total ? 'running' : !cnt.total ? 'todo' : cnt.failed ? 'failed' : 'done');
        const checks = c.total === 0 ? 'todo' : c.failed ? 'failed' : c.notChecked === c.total ? 'todo' : 'done';
        const bstate = running() ? 'running' : !b ? 'todo' : b.result === 'SUCCESS' ? 'done' : 'failed';
        const rule = rules().some((r) => r.result === 'failed') ? 'failed' : rulesPassed() === rules().length && rules().length ? 'done' : 'todo';
        const say = (cnt, none) => (cnt.total ? cnt.passed + ' of ' + cnt.total + ' passed' + (cnt.failed ? ', ' + cnt.failed + ' failed' : '') + (cnt.skipped ? ', ' + cnt.skipped + ' skipped' : '') : none);
        const list = [
          ['Read the source and new code', checks, c.total ? c.passed + ' files passed the factory’s checks, ' + c.failed + ' with problems, ' + c.warning + ' warnings' : 'No files yet', 'files'],
          ['Build', bstate, b ? 'Jenkins build #' + b.number + ' ' + (b.result || 'running') + (b.errors && b.errors.length ? ': ' + b.errors.length + ' errors' : '') : 'Not run yet: Run the tests', 'log'],
          ['Unit tests', state(type('unit')), say(type('unit'), 'No unit test suite in the report'), 'tests'],
          ['Functional tests', state(type('functional')), say(type('functional'), 'No journey or functional suite in the report'), 'tests'],
          ['Security checks', state(type('security')), say(type('security'), 'No security suite in the report'), 'security'],
          ['Accessibility', state(type('accessibility')), say(type('accessibility'), 'No accessibility suite in the report'), 'accessibility'],
          ['Performance', state(type('performance')), say(type('performance'), 'No performance suite in the report'), 'performance'],
          ['OBDX rules', rule, rulesPassed() + ' of ' + rules().length + ' passed', 'calls']
        ];
        return list.map((p, i) => ({ n: i + 1, name: p[0], state: p[1], text: p[2], css: 'factory-mv-step is-' + p[1] + (self.picked() === i ? ' is-on' : ''),
          mark: p[1] === 'done' ? '✓' : p[1] === 'failed' ? '!' : p[1] === 'running' ? '…' : String(i + 1), pressed: self.picked() === i ? 'true' : 'false',
          pick: () => { self.picked(i); self.tab(p[3]); } }));
      });
      self.stepDetail = ko.pureComputed(() => { const p = self.pipeline()[self.picked()]; return p ? { name: p.name, text: p.text, css: 'factory-mv-stepbox is-' + p.state } : null; });
      self.ready = ko.pureComputed(() => {
        const p = self.pipeline();
        return p.length > 0 && p.every((s) => s.state === 'done' || s.state === 'todo') && p[0].state === 'done' && p[1].state === 'done' && p[7].state !== 'failed';
      });
      self.anyFailed = ko.pureComputed(() => !!self.v() && self.v().totals.failed > 0);

      // All tests and coverage
      self.totals = ko.pureComputed(() => (self.v() ? self.v().totals : { total: 0, passed: 0, failed: 0, skipped: 0 }));
      self.published = ko.pureComputed(() => !!self.v() && self.v().published);
      self.ring = ko.pureComputed(() => {
        const t = self.totals();
        const p = t.total ? Math.round(100 * t.passed / t.total) : 0;
        return { style: { '--p': p, '--c': t.failed ? 'var(--fx-danger)' : 'var(--fx-success)' }, label: t.total ? p + '%' : '—' };
      });
      self.coverage = ko.pureComputed(() => {
        const v = self.v();
        if (!v || v.coverage === null || v.coverage === undefined) { return null; }
        const pct = Math.round(v.coverage);
        return { pct: pct + '%', covered: pct + '% of lines', missed: (100 - pct) + '% not covered', gate: 'Gate: ' + v.gate + '%', ok: pct >= v.gate,
          style: { '--p': pct, '--c': pct >= v.gate ? 'var(--fx-success)' : 'var(--fx-warning)' } };
      });
      self.gateText = ko.pureComputed(() => (self.v() ? 'The job publishes no coverage report (JaCoCo or the Coverage plugin). Gate: ' + self.v().gate + '%.' : ''));

      // To look at: errors first, then warnings, then notes; each opens its tab
      self.lookAt = ko.pureComputed(() => {
        const out = [];
        const v = self.v();
        files().filter((f) => f.checkStatus === 'FAILED').slice(0, 3).forEach((f) => out.push({ text: f.path + ': ' + (f.checkMessage || 'problems'), tab: 'files', sev: 'danger', mark: '✕' }));
        if (v) {
          v.failed.slice(0, 3).forEach((f) => out.push({ text: TYPE[f.type] + ' · ' + f.name + (f.error ? ': ' + f.error : ''), tab: f.type === 'security' ? 'security' : f.type === 'accessibility' ? 'accessibility' : 'tests', sev: 'danger', mark: '✕' }));
          if (v.coverage !== null && v.coverage !== undefined && v.coverage < v.gate) { out.push({ text: 'Line coverage ' + Math.round(v.coverage) + '% is under the ' + v.gate + '% gate', tab: 'tests', sev: 'warning', mark: '!' }); }
          rules().filter((r) => r.result === 'failed').slice(0, 2).forEach((r) => out.push({ text: r.id + ' ' + r.text, tab: 'calls', sev: 'warning', mark: '!' }));
          if (!v.published && build() && build().result) { out.push({ text: 'The Jenkins job publishes no JUnit report, so the tests are not counted', tab: 'log', sev: 'info', mark: 'i' }); }
        }
        files().filter((f) => f.checkStatus === 'WARNING').slice(0, 2).forEach((f) => out.push({ text: f.path + ': ' + (f.checkMessage || 'warning'), tab: 'files', sev: 'info', mark: 'i' }));
        return out.slice(0, 6).map((x) => Object.assign(x, { css: 'factory-mo-insight is-' + x.sev, go: () => { self.tab(x.tab); self.onlyProblems(true); } }));
      });
      self.viewAll = () => { self.tab('tests'); self.onlyProblems(true); };
      self.problem = ko.pureComputed(() => (self.v() ? self.v().problem : null));

      self.tabs = ko.pureComputed(() => {
        const v = self.v();
        return ui.tabs(self.tab, [{ value: 'tests', label: 'Test results' }, { value: 'calls', label: 'OBDX service calls' },
          { value: 'security', label: 'Security findings', count: v ? v.byType.security.failed : 0 }, { value: 'accessibility', label: 'Accessibility' },
          { value: 'performance', label: 'Performance' }, { value: 'looks', label: 'Looks the same' }, { value: 'files', label: 'Files', count: counts().total }, { value: 'log', label: 'Build log' }]);
      });
      const TAB_KEYS = ['tests', 'calls', 'security', 'accessibility', 'performance', 'looks', 'files', 'log'];
      self.tabKey = (vm, event) => {
        const at = TAB_KEYS.indexOf(self.tab());
        const n = event.key === 'ArrowRight' ? (at + 1) % TAB_KEYS.length : event.key === 'ArrowLeft' ? (at + TAB_KEYS.length - 1) % TAB_KEYS.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? TAB_KEYS.length - 1 : -1;
        if (n < 0) { return true; }
        event.preventDefault();
        self.tab(TAB_KEYS[n]);
        const b = document.getElementById('mvTab-' + TAB_KEYS[n]);
        if (b) { b.focus(); }
        return false;
      };

      const suiteRow = (s) => ({ name: s.name, type: TYPE[s.type], typeCss: ui.pill(TYPE[s.type], TONE[s.type]).css, total: s.total, passed: s.passed, failed: s.failed, skipped: s.skipped,
        seconds: s.seconds + ' s', result: s.failed ? 'Failed' : 'Passed', css: ui.pill(s.failed ? 'Failed' : 'Passed', s.failed ? 'red' : 'green').css });
      self.suiteRows = ko.pureComputed(() => (self.v() ? self.v().suites : []).filter((s) => !self.onlyProblems() || s.failed > 0).map(suiteRow));
      self.problemCount = ko.pureComputed(() => (self.v() ? self.v().suites.filter((s) => s.failed > 0).length : 0));
      const ofType = (t) => ko.pureComputed(() => (self.v() ? self.v().suites.filter((s) => s.type === t).map(suiteRow) : []));
      const failedOf = (t) => ko.pureComputed(() => (self.v() ? self.v().failed.filter((f) => f.type === t) : []));
      self.securityRows = ofType('security'); self.securityFailed = failedOf('security');
      self.a11yRows = ofType('accessibility'); self.a11yFailed = failedOf('accessibility');
      self.perfRows = ofType('performance'); self.perfFailed = failedOf('performance');
      self.uiRows = ofType('ui');
      self.callRows = ko.pureComputed(() => {
        const v = self.v();
        if (!v) { return []; }
        const svc = rules().find((r) => /service|digx/i.test(r.text));
        return v.calls.map((c) => ({ call: c, state: svc && svc.result === 'failed' ? 'Check: the rule found a change' : 'The same service, unchanged' }));
      });
      self.ruleRows = ko.pureComputed(() => rules().map((r) => ({ id: r.id, text: r.text, result: r.result === 'passed' ? 'Passed' : r.result === 'failed' ? 'Problems in ' + r.failing.length + ' files' : 'Not checked yet',
        css: ui.pill(r.result === 'passed' ? 'Passed' : r.result === 'failed' ? 'Problems' : 'Not checked', r.result === 'passed' ? 'green' : r.result === 'failed' ? 'red' : 'grey').css,
        failing: r.failing.slice(0, 5).join(', ') })));
      const STATUS = { PASSED: ['Passed', 'green'], FAILED: ['Problems', 'red'], WARNING: ['Warning', 'amber'], NOT_CHECKED: ['Not checked', 'grey'] };
      self.fileRows = ko.pureComputed(() => files().filter((f) => !self.onlyProblems() || f.checkStatus === 'FAILED' || f.checkStatus === 'WARNING').map((f) => {
        const s = STATUS[f.checkStatus || 'NOT_CHECKED'];
        return { path: f.path, layer: f.layer, status: s[0], css: ui.pill(s[0], s[1]).css, message: f.checkMessage || '', lines: '+' + f.linesAdded + ' −' + f.linesRemoved };
      }));
      const imageUrl = (p) => 'api/workspaces/' + self.workspaceId() + '/modernization/runs/' + run().id + '/validation/image?path=' + encodeURIComponent(p);
      // Screenshots: a JET and a new one with the same name are shown side by side
      self.imagePairs = ko.pureComputed(() => {
        const v = self.v();
        if (!v || !run()) { return []; }
        const groups = {};
        v.images.forEach((p) => {
          const key = p.replace(/[-_.](jet|before|old|source|new|after|target)(?=[-_.][^/]*$|\.[a-z]+$)/i, '').replace(/\.[a-z]+$/i, '');
          const side = /(jet|before|old|source)/i.test(p.split('/').pop()) ? 'jet' : 'new';
          groups[key] = groups[key] || { name: key.split('/').pop() };
          groups[key][side] = imageUrl(p);
        });
        return Object.keys(groups).map((k) => groups[k]);
      });
      self.log = ko.pureComputed(() => (build() && build().log ? build().log : 'No build log yet.'));
      self.jenkinsUrl = ko.pureComputed(() => (build() ? build().url : null));
      self.reportHref = ko.pureComputed(() => (run() ? 'api/workspaces/' + self.workspaceId() + '/modernization/runs/' + run().id + '/validation/report.csv' : '#'));
      self.evidenceHref = ko.pureComputed(() => (run() ? 'api/workspaces/' + self.workspaceId() + '/modernization/runs/' + run().id + '/validation/evidence.zip' : '#'));
      // The evidence panel: each suite with its failed tests, the screenshots and the failed step's log
      self.evidenceSuites = ko.pureComputed(() => (self.v() ? self.v().suites.map((s) => ({ name: s.name, summary: s.passed + ' passed' + (s.failed ? ', ' + s.failed + ' failed' : '') + (s.skipped ? ', ' + s.skipped + ' skipped' : ''),
        css: ui.pill(s.failed ? 'Failed' : 'Passed', s.failed ? 'red' : 'green').css, result: s.failed ? 'Failed' : 'Passed',
        failed: self.v().failed.filter((f) => f.suite === s.name) })) : []));

      // Actions
      const reloadAll = () => Promise.all([api.get('changes/' + run().changeId).then((c) => self.change(c)),
        api.get('workspaces/' + self.workspaceId() + '/modernization/runs/' + run().id + '/validation').then((v) => self.v(v))]);
      const started = (failedOnly) => (c) => {
        self.change(c);
        self.rerunLine((failedOnly ? 'Jenkins is running the failed tests again' : 'Jenkins is running the build and tests again') + ' (' + (c.message || 'starting') + ').');
        poll();
      };
      self.runAgain = () => api.post('changes/' + run().changeId + '/build').then(started(false)).catch((e) => toast.error(ui.errorText(e)));
      self.runFailed = () => api.post('changes/' + run().changeId + '/build?failedOnly=true').then(started(true)).catch((e) => toast.error(ui.errorText(e)));
      self.checkAgain = () => api.post('changes/' + run().changeId + '/check').then((c) => { self.change(c); toast.success('The files were checked again.'); }).catch((e) => toast.error(ui.errorText(e)));
      self.toReview = () => mz.open('modernization-review', { runId: run().id });
      self.back = () => mz.open('modernization-workspace', { runId: run() ? run().id : null });
      self.openBuildPage = () => { pageRequests.change(run().changeId); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'build' })); };
      self.openEvidence = () => self.evidenceOpen(true);
      self.closeEvidence = () => self.evidenceOpen(false);
      self.openLog = () => self.tab('log');
      self.moreItems = ko.pureComputed(() => [{ value: 'build', label: 'Open in Build, Test & Review' }, { value: 'evidence', label: 'Test evidence' },
        { value: 'report', label: 'Download the test report', disabled: !self.published() }, { value: 'all', label: 'Run every test again', disabled: !self.canManage() || running() },
        { value: 'check', label: 'Check the files again', disabled: !self.canManage() }, { value: 'jenkins', label: 'Open the build in Jenkins', disabled: !self.jenkinsUrl() }]);
      self.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'build') { self.openBuildPage(); } else if (v === 'evidence') { self.openEvidence(); } else if (v === 'report') { window.location.href = self.reportHref(); }
        else if (v === 'all') { self.runAgain(); } else if (v === 'check') { self.checkAgain(); } else if (self.jenkinsUrl()) { window.open(self.jenkinsUrl(), '_blank', 'noopener'); }
      };
      self.rerunTitle = ko.pureComputed(() => (self.canManage() ? (running() ? 'A build is running' : '') : 'Running the tests needs the Manage code permission'));
      let timer = null;
      const poll = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          reloadAll().then(() => {
            if (running()) { poll(); return; }
            const b = build();
            if (self.rerunLine() && b) {
              self.rerunLine(b.result === 'SUCCESS' && !self.anyFailed() ? 'Build #' + b.number + ': all passed. You can send the change for review.'
                : 'Build #' + b.number + ' ' + b.result + ': ' + self.totals().failed + ' tests still fail.');
            }
          }).catch(() => null);
        }, 6000);
      };

      const load = (id) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        const asked = mz.take();
        api.get('workspaces/' + id + '/modernization/runs').then((list) => {
          const pick = asked.runId || (list.find((r) => r.open) || list[0] || {}).id;
          if (!pick) { self.error('No run yet. Start a wave or a module first.'); return null; }
          return Promise.all([api.get('workspaces/' + id + '/modernization/runs/' + pick + '/detail'),
            api.get('workspaces/' + id + '/modernization/runs/' + pick + '/validation')]).then((r) => {
            self.detail(r[0]);
            self.v(r[1]);
            self.error(null);
            return r[0].run.changeId ? api.get('changes/' + r[0].run.changeId).then((c) => { self.change(c); if (running()) { poll(); } }) : null;
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
