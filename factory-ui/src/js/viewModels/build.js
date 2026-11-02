/*
 * Build, Test & Review page: the quality gates of one change, each from the results the factory has: the Jenkins
 * build, the unit tests Jenkins reports, integration tests (not reported separately), the quick checks (static checks),
 * the version pack's security rules among them, and requirement coverage (the criteria the written tests name). A gate
 * that has not run never shows as passed. Below: the failures with severity, file and line, log and linked criteria;
 * the run history with a comparison of two runs; the logs; the checks per file; and delivery. Actions are those of
 * before (build again, run the quick checks, write a failing file again, submit for review, the patch), offered only
 * when the server allows them.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/assistant', '../services/toast', '../services/dialog', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, assistant, toast, dialog, pageRequests) {
    const POLL_MS = 3000;
    const code = (prefix, id, n) => prefix + '-' + id.replace(/-/g, '').slice(0, n).toUpperCase();
    const httpUrl = (url) => (url && /^https?:\/\//i.test(url) ? url : '');
    const QUICK_CHECKS = 'Quick checks';
    // The six states a gate can be in, with the shared status colours (ui.status) and plain words
    const GATE = {
      NOT_RUN: { raw: 'NOT_CHECKED', text: 'Not run' },
      RUNNING: { raw: 'RUNNING', text: 'Running' },
      PASSED: { raw: 'PASSED', text: 'Passed' },
      WARNINGS: { raw: 'WARNING', text: 'Passed with warnings' },
      FAILED: { raw: 'FAILED', text: 'Failed' },
      BLOCKED: { raw: 'ABORTED', text: 'Blocked' }
    };
    // Each state has its own look (not only its colour: the words and the icon differ too), Blocked apart from Not run
    const gateStatus = (state) => {
      const s = ui.status(GATE[state].raw, GATE[state].text);
      return Object.assign(s, { state: state, css: s.css + ' factory-bt-state factory-bt-state-' + state.toLowerCase().replace('_', '-') });
    };
    // The version pack rules about security (packs/common.yml); a team's own rules are not counted here
    const SECURITY_RULES = ['java-no-hardcoded-credentials', 'java-no-sql-concatenation', 'js-no-eval', 'html-no-inline-script'];
    // A quick check message: "Line 12 (rule-id, error): what is wrong", one per line
    const FINDING = /^(?:Line (\d+)|File) \(([\w-]+), (error|warning)\): (.*)$/;
    const findingsOf = (message) => (message || '').split('\n').map((l) => FINDING.exec(l.trim())).filter(Boolean)
      .map((m) => ({ line: m[1] || '', rule: m[2], severity: m[3], text: m[4] }));
    const CUT_OFF = 'Cut off:';
    const written = (f) => f.status === 'GENERATED' || f.status === 'UNCHANGED';
    const REFS = /\b(?:AC|FR|BR)-\d+\b/g;
    const duration = (b) => {
      if (!b || !b.finishedAt || !b.startedAt) {
        return '';
      }
      const s = Math.max(1, Math.round((new Date(b.finishedAt) - new Date(b.startedAt)) / 1000));
      return s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's';
    };

    function BuildViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.canManage = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.errorMessage = ko.observable('');
      this.changes = ko.observableArray([]);
      this.changeId = ko.observable('');
      this.detail = ko.observable(null);
      this.jenkins = ko.observable(null);
      this.coverage = ko.observable(null);
      // True while the quick checks request runs (the server checks every file before it answers)
      this.checking = ko.observable(false);
      this.changeChange = (event) => this.changeId(event.target.value);
      // Requirement picker: narrows the change list to the changes made from one requirement
      this.requirements = ko.observableArray([]);
      this.requirementId = ko.observable('');
      this.changeRequirement = ko.observable({});
      this.changeOptions = ko.pureComputed(() => {
        const req = this.requirementId();
        return this.changes().filter((c) => !req || this.changeRequirement()[c.id] === req);
      });
      this.requirementChange = (event) => {
        this.requirementId(event.target.value);
        const list = this.changeOptions();
        if (list.length && !list.some((c) => c.id === this.changeId())) {
          this.changeId(list[0].id);
        }
      };
      // Loading problems stay on the page; the result of an action is a toast
      const showError = (error) => this.errorMessage(error.message);
      const actionError = (error) => toast.error(error.message);

      const files = ko.pureComputed(() => (this.detail() ? this.detail().files : []));
      const builds = ko.pureComputed(() => (this.detail() ? this.detail().builds : []));
      const building = ko.pureComputed(() => !!this.detail() && this.detail().buildStatus === 'BUILDING');
      this.jenkinsSet = ko.pureComputed(() => !!this.jenkins() && !!this.jenkins().mode);

      // --- runs: each build of the change is one run of rounds (quick checks, Jenkins, fix, again) ---

      this.runs = ko.pureComputed(() => {
        const list = [];
        let run = null;
        builds().forEach((b) => {
          const last = run ? run.rows[run.rows.length - 1] : null;
          if (!run || b.round < last.round || (b.round === last.round && b.job === last.job)) {
            run = { rows: [] };
            list.push(run);
          }
          run.rows.push(b);
        });
        return list.map((r, i) => {
          const lastRound = r.rows[r.rows.length - 1].round;
          const final = r.rows.filter((b) => b.round === lastRound);
          const jenkinsRows = r.rows.filter((b) => b.job !== QUICK_CHECKS);
          return {
            number: i + 1, rows: r.rows, final: final, jenkinsRows: jenkinsRows,
            startedAt: r.rows[0].startedAt, finishedAt: r.rows[r.rows.length - 1].finishedAt,
            errors: r.rows.reduce((all, b) => all.concat(b.errors), []),
            finalErrors: final.reduce((all, b) => all.concat(b.errors), []),
            fixed: r.rows.reduce((all, b) => all.concat(b.fixedFiles), [])
          };
        });
      });
      this.lastRun = ko.pureComputed(() => (this.runs().length ? this.runs()[this.runs().length - 1] : null));
      // The Jenkins rows of the last round of the last run: what the build gate and the unit test gate say
      const lastJenkins = ko.pureComputed(() => {
        const run = this.lastRun();
        if (!run) {
          return [];
        }
        const lastRound = run.jenkinsRows.length ? run.jenkinsRows[run.jenkinsRows.length - 1].round : 0;
        return run.jenkinsRows.filter((b) => b.round === lastRound);
      });
      this.lastBuild = ko.pureComputed(() => (lastJenkins().length ? lastJenkins()[lastJenkins().length - 1] : null));
      const unfinished = (b) => !b.finishedAt;

      // --- the gates ---

      const quick = ko.pureComputed(() => {
        const checked = files().filter((f) => written(f) && f.checkStatus && f.checkStatus !== 'NOT_CHECKED');
        const notWritten = files().filter((f) => !written(f)).length;
        return {
          checked: checked,
          failed: checked.filter((f) => f.checkStatus === 'FAILED'),
          warning: checked.filter((f) => f.checkStatus === 'WARNING'),
          passed: checked.filter((f) => f.checkStatus === 'PASSED'),
          notWritten: notWritten
        };
      });
      const securityFindings = ko.pureComputed(() => quick().checked.reduce((all, f) => all.concat(findingsOf(f.checkMessage)
        .filter((x) => SECURITY_RULES.indexOf(x.rule) >= 0).map((x) => Object.assign(x, { path: f.path }))), []));
      const testFailures = (rows) => rows.reduce((all, b) => all.concat(b.errors.filter((e) => /Test failed: /.test(e))), []);

      this.gates = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const gate = (key, title, state, evidence, why) => ({ key: key, title: title, status: gateStatus(state), evidence: evidence, why: why || '',
          css: 'factory-card factory-bt-gate factory-bt-gate-' + state.toLowerCase().replace('_', '-'), pick: () => this.focusGate(key) });
        const rows = lastJenkins();
        const b = this.lastBuild();
        const run = this.lastRun();
        const results = rows.map((x) => x.result);
        const noResult = rows.some(unfinished) && !building();
        const notGenerated = ['GENERATED', 'DELIVERED', 'CLOSED'].indexOf(d.status) < 0;
        const quickBlocked = !!run && !run.jenkinsRows.length && d.buildStatus === 'FAILED';
        const list = [];
        // Build
        let buildState;
        let buildText;
        if (building() && (!b || rows.some(unfinished) || !run || run.jenkinsRows.length === 0 || unfinished(run.rows[run.rows.length - 1]))) {
          buildState = 'RUNNING';
          buildText = d.buildMessage || 'Building with Jenkins.';
        } else if (!this.jenkinsSet()) {
          buildState = 'NOT_RUN';
          buildText = 'Jenkins is not set up for this workspace (Integrations page).';
        } else if (quickBlocked) {
          buildState = 'BLOCKED';
          buildText = 'The quick checks failed, so Jenkins was not started. ' + (d.buildMessage || '');
        } else if (!b) {
          buildState = notGenerated ? 'BLOCKED' : 'NOT_RUN';
          buildText = notGenerated ? 'There is no generated code to build yet.' : 'This change has not been built with Jenkins.';
        } else if (noResult || results.some((r) => r === 'NOT_BUILT' || r === 'ABORTED')) {
          buildState = 'BLOCKED';
          buildText = 'The build did not finish: ' + ((rows.find((x) => x.errors.length) || {}).errors || [d.buildMessage || 'no result from Jenkins'])[0];
        } else if (results.some((r) => r === 'FAILURE')) {
          buildState = 'FAILED';
          buildText = rows.map((x) => x.job + (x.buildNumber ? ' #' + x.buildNumber : '') + ' ' + x.result).join(', ') + ' · ' + ui.when(b.finishedAt || b.startedAt);
        } else if (results.some((r) => r === 'UNSTABLE')) {
          buildState = 'WARNINGS';
          buildText = 'Jenkins marked the build unstable (it compiled; see the tests).';
        } else {
          buildState = 'PASSED';
          buildText = rows.map((x) => x.job + (x.buildNumber ? ' #' + x.buildNumber : '') + ' SUCCESS').join(', ') + ' · ' + ui.when(b.finishedAt || b.startedAt);
        }
        list.push(gate('build', 'Build', buildState, buildText, 'From the Jenkins jobs of this workspace, last run and round.'));
        // Unit tests
        const failedTests = testFailures(rows);
        let testState;
        let testText;
        if (buildState === 'RUNNING') {
          testState = 'RUNNING';
          testText = 'Part of the running build.';
        } else if (failedTests.length) {
          testState = 'FAILED';
          testText = failedTests.length + ' test(s) failed in the JUnit report.';
        } else if (buildState === 'PASSED') {
          testState = 'PASSED';
          testText = 'The build passed and its JUnit report has no failed test. Jenkins sends no test counts.';
        } else if (buildState === 'WARNINGS') {
          testState = 'WARNINGS';
          testText = 'Unstable build; the JUnit report names no failed test of this change.';
        } else if (buildState === 'FAILED' || buildState === 'BLOCKED') {
          testState = 'BLOCKED';
          testText = 'The build did not get as far as a test result.';
        } else {
          testState = 'NOT_RUN';
          testText = 'Unit tests run in the Jenkins build, which has not run.';
        }
        list.push(gate('tests', 'Unit tests', testState, testText, 'From the failed test cases of the Jenkins JUnit report (testReport).'));
        // Integration tests: nothing reports them separately
        list.push(gate('integration', 'Integration tests', 'NOT_RUN', 'No separate integration test results reach the factory. If the Jenkins job runs them, they count in the build and unit tests.',
          'Not reported by any tool connected to the factory.'));
        // Static checks
        const q = quick();
        let staticState;
        let staticText;
        if (this.checking()) {
          staticState = 'RUNNING';
          staticText = 'Checking every file.';
        } else if (!q.checked.length) {
          staticState = notGenerated ? 'BLOCKED' : 'NOT_RUN';
          staticText = notGenerated ? 'There is no generated code to check yet.' : 'No written file has been checked.';
        } else if (q.failed.length) {
          staticState = 'FAILED';
          staticText = q.failed.length + ' file(s) failed, ' + q.warning.length + ' with warnings, ' + q.passed.length + ' passed.';
        } else if (q.warning.length || q.notWritten) {
          staticState = 'WARNINGS';
          staticText = q.passed.length + ' passed, ' + q.warning.length + ' with warnings' + (q.notWritten ? '; ' + q.notWritten + ' planned file(s) not written, so not checked' : '') + '.';
        } else {
          staticState = 'PASSED';
          staticText = 'All ' + q.passed.length + ' written files passed.';
        }
        list.push(gate('static', 'Static checks', staticState, staticText, 'The quick checks: syntax at the bank\'s Java level and the version pack rules, on the lines each file adds.'));
        // Security checks: the security rules within the quick checks
        const sec = securityFindings();
        let secState;
        let secText;
        if (staticState === 'RUNNING') {
          secState = 'RUNNING';
          secText = 'Part of the quick checks.';
        } else if (staticState === 'NOT_RUN' || staticState === 'BLOCKED') {
          secState = staticState;
          secText = 'Part of the quick checks, which have not run.';
        } else if (sec.some((x) => x.severity === 'error')) {
          secState = 'FAILED';
          secText = sec.filter((x) => x.severity === 'error').length + ' finding(s) of the security rules.';
        } else if (sec.length) {
          secState = 'WARNINGS';
          secText = sec.length + ' warning(s) of the security rules.';
        } else {
          secState = q.notWritten ? 'WARNINGS' : 'PASSED';
          secText = 'No finding of the security rules in the ' + q.checked.length + ' checked file(s)' + (q.notWritten ? '; ' + q.notWritten + ' not written' : '') + '.';
        }
        list.push(gate('security', 'Security checks', secState, secText,
          'The version pack\'s security rules (hard-coded credentials, SQL built by concatenation, eval, inline scripts) in the quick checks. No security scanner reports to the factory.'));
        // Requirement coverage
        const cov = this.coverage();
        let covState;
        let covText;
        if (!cov) {
          covState = 'NOT_RUN';
          covText = 'Loading the coverage.';
        } else if (!cov.hasSpec) {
          covState = 'NOT_RUN';
          covText = 'The change has no requirement specification to trace.';
        } else if (!cov.criteria.length) {
          covState = 'NOT_RUN';
          covText = 'The requirement has no acceptance criteria with IDs.';
        } else if (!cov.written) {
          covState = notGenerated ? 'BLOCKED' : 'NOT_RUN';
          covText = 'No written file to trace yet.';
        } else {
          const none = cov.criteria.filter((c) => !c.tests.length && !c.code.length).length;
          const untested = cov.criteria.filter((c) => !c.tests.length && c.code.length).length;
          const tested = cov.criteria.length - none - untested;
          covState = none ? 'FAILED' : (untested || cov.written < cov.planned) ? 'WARNINGS' : 'PASSED';
          covText = tested + ' of ' + cov.criteria.length + ' criteria named in a test' + (untested ? ', ' + untested + ' only in code' : '')
            + (none ? ', ' + none + ' nowhere' : '') + (cov.written < cov.planned ? '; ' + (cov.planned - cov.written) + ' planned file(s) not written' : '') + '.';
        }
        list.push(gate('coverage', 'Requirement coverage', covState, covText,
          'The acceptance criteria the written tests name (the generator names each criterion a test checks). Traceability, not a test result.'));
        return list;
      });
      // The overall verdict: never passed while a gate has not run
      this.verdict = ko.pureComputed(() => {
        const g = this.gates();
        if (!g.length) {
          return null;
        }
        const has = (state) => g.filter((x) => x.status.state === state);
        let state;
        let text;
        if (has('RUNNING').length) {
          state = 'RUNNING';
          text = has('RUNNING').map((x) => x.title).join(', ') + ' running.';
        } else if (has('FAILED').length) {
          state = 'FAILED';
          text = has('FAILED').map((x) => x.title).join(', ') + ' failed.';
        } else if (has('BLOCKED').length) {
          state = 'BLOCKED';
          text = has('BLOCKED').map((x) => x.title).join(', ') + ' blocked.';
        } else if (has('NOT_RUN').length) {
          state = 'NOT_RUN';
          text = 'Not complete: ' + has('NOT_RUN').map((x) => x.title).join(', ') + ' not run.';
        } else if (has('WARNINGS').length) {
          state = 'WARNINGS';
          text = has('WARNINGS').map((x) => x.title).join(', ') + ' with warnings.';
        } else {
          state = 'PASSED';
          text = 'Every gate passed.';
        }
        return { status: gateStatus(state === 'NOT_RUN' ? 'NOT_RUN' : state), text: text };
      });
      this.verdictTitle = ko.pureComputed(() => {
        const v = this.verdict();
        return !v ? '' : v.status.state === 'NOT_RUN' ? 'Quality gate: not complete' : 'Quality gate: ' + v.status.text.toLowerCase();
      });
      this.isLive = ko.pureComputed(() => this.checking() || (!!this.detail() && (this.detail().status === 'GENERATING' || building())));

      // --- failures ---

      const findFile = (path) => (path ? files().find((x) => x.path === path || x.path.endsWith('/' + path) || path.endsWith(x.path)) : null);
      // The criteria and requirements a file names (from the coverage), and those in the failure's own text
      const linkedOf = (path, text) => {
        const cov = this.coverage();
        const ids = Array.from(new Set((text || '').match(REFS) || []));
        if (cov && path) {
          cov.criteria.concat(cov.requirements).forEach((c) => {
            if ((c.tests.concat(c.code)).some((p) => p === path || path.endsWith(p) || p.endsWith(path)) && ids.indexOf(c.id) < 0) {
              ids.push(c.id);
            }
          });
        }
        return ids;
      };
      this.gateFilter = ko.observable('all');
      this.focusGate = (key) => {
        this.gateFilter(['build', 'tests', 'static', 'security', 'coverage'].indexOf(key) >= 0 ? key : 'all');
        const list = document.getElementById('failureTable');
        if (list) {
          list.scrollIntoView({ block: 'nearest' });
        }
      };
      this.failures = ko.pureComputed(() => {
        const list = [];
        const run = this.lastRun();
        // Build and test errors of the last run's last Jenkins round: "path:line message" as the factory records them
        lastJenkins().forEach((b) => b.errors.forEach((e) => {
          const test = /Test failed: /.test(e);
          const m = e.match(/^(\S+?\.(?:java|js|ts|tsx|html|xml|json|sql|properties))(?::(\d+))?\s+(.*)$/);
          const path = m ? m[1] : '';
          const file = findFile(path);
          list.push({ check: test ? 'tests' : 'build', checkLabel: test ? 'Unit test' : 'Build', severity: 'Error', message: m ? m[3] : e,
            file: file ? file.path : path, line: m && m[2] && m[2] !== '0' ? m[2] : '', log: b.logExcerpt || '',
            source: b.job + (b.buildNumber ? ' #' + b.buildNumber : '') + ' · run ' + (run ? run.number : '') + ', round ' + b.round });
        }));
        // Quick check findings of the written files, one per rule finding (or the whole message)
        files().filter((f) => written(f) && (f.checkStatus === 'FAILED' || f.checkStatus === 'WARNING')).forEach((f) => {
          const found = findingsOf(f.checkMessage);
          if (!found.length) {
            list.push({ check: 'static', checkLabel: 'Static check', severity: f.checkStatus === 'FAILED' ? 'Error' : 'Warning',
              message: f.checkMessage || f.checkStatus, file: f.path, line: ((f.checkMessage || '').match(/^Line (\d+)/) || [])[1] || '', log: '', source: 'Quick checks' });
          }
          found.forEach((x) => list.push({
            check: SECURITY_RULES.indexOf(x.rule) >= 0 ? 'security' : 'static', checkLabel: SECURITY_RULES.indexOf(x.rule) >= 0 ? 'Security' : 'Static check',
            severity: x.severity === 'error' ? 'Error' : 'Warning', message: x.text + ' (' + x.rule + ')', file: f.path, line: x.line, log: '', source: 'Quick checks'
          }));
        });
        // Criteria no written file names
        const cov = this.coverage();
        if (cov && cov.written) {
          cov.criteria.filter((c) => !c.tests.length).forEach((c) => list.push({
            check: 'coverage', checkLabel: 'Coverage', severity: c.code.length ? 'Warning' : 'Error', criterion: c.id,
            message: c.id + (c.code.length ? ' is named in code but in no test: ' : ' is named in no written file: ') + c.text,
            file: c.code[0] || '', line: '', log: '', source: 'Requirement coverage'
          }));
        }
        return list.map((x, i) => Object.assign(x, {
          index: i,
          linked: x.criterion ? [x.criterion].concat(linkedOf(x.file, x.message).filter((id) => id !== x.criterion)) : linkedOf(x.file, x.message),
          status: x.severity === 'Warning' ? ui.status('WARNING', 'Warning') : ui.status('FAILED', 'Error'),
          name: x.file ? x.file.split('/').pop() : '–',
          pick: () => this.selectedFailure(i),
          stop: (event) => event.stopPropagation(),
          action: (event) => {
            const value = event.detail.value;
            this.selectedFailure(i);
            if (value === 'code') {
              this.detailTab('code');
            } else if (value === 'copy') {
              copyText(x.message);
            } else if (value === 'fix') {
              this.fixWithAi();
            } else if (value === 'ask') {
              this.aiTab('chat');
              this.ai.ask('Explain this failure and how to fix it: ' + x.message);
            } else {
              this.detailTab('message');
            }
          }
        }));
      });
      const copyText = (text) => ui.copy(text || '').then(() => toast.success('Copied the error message.'), () => toast.error('Could not copy. Select the text and copy it instead.'));
      this.copyMessage = () => copyText(this.failure() ? this.failure().message : '');
      this.failureItems = ko.pureComputed(() => [{ value: 'details', label: 'View details' }, { value: 'code', label: 'Show the code' },
        { value: 'copy', label: 'Copy error message' }, { value: 'ask', label: 'Ask the AI Assistant' },
        { value: 'fix', label: 'Write the file again with the fix', disabled: !this.canFix() }]);
      this.failureTabs = ui.tabs(this.gateFilter, [
        { value: 'all', label: 'All', count: ko.pureComputed(() => this.failures().length) },
        { value: 'build', label: 'Build', count: ko.pureComputed(() => this.failures().filter((f) => f.check === 'build').length) },
        { value: 'tests', label: 'Unit tests', count: ko.pureComputed(() => this.failures().filter((f) => f.check === 'tests').length) },
        { value: 'static', label: 'Static', count: ko.pureComputed(() => this.failures().filter((f) => f.check === 'static').length) },
        { value: 'security', label: 'Security', count: ko.pureComputed(() => this.failures().filter((f) => f.check === 'security').length) },
        { value: 'coverage', label: 'Coverage', count: ko.pureComputed(() => this.failures().filter((f) => f.check === 'coverage').length) }
      ]);
      this.failureSearch = ko.observable('');
      this.failureSearchInput = ui.value(this.failureSearch);
      this.visibleFailures = ko.pureComputed(() => {
        const text = this.failureSearch().trim().toLowerCase();
        return this.failures().filter((f) => (this.gateFilter() === 'all' || f.check === this.gateFilter())
          && (!text || (f.message + ' ' + f.file).toLowerCase().indexOf(text) >= 0));
      });
      // Enter or Space on a finding row selects it, like a click
      this.rowKey = (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
          event.preventDefault();
          event.currentTarget.click();
          return false;
        }
        return true;
      };
      this.selectedFailure = ko.observable(0);
      this.failure = ko.pureComputed(() => this.failures()[this.selectedFailure()] || null);
      this.failurePosition = ko.pureComputed(() => (this.failures().length ? (this.selectedFailure() + 1) + ' of ' + this.failures().length : ''));
      this.prevFailure = () => this.selectedFailure(Math.max(0, this.selectedFailure() - 1));
      this.nextFailure = () => this.selectedFailure(Math.min(this.failures().length - 1, this.selectedFailure() + 1));
      this.detailTab = ko.observable('message');
      this.detailTabs = ui.tabs(this.detailTab, [{ value: 'message', label: 'Error' }, { value: 'code', label: 'Code' }, { value: 'log', label: 'Log' }]);
      // Code: the generated file around the failing line
      this.fileCache = ko.observable({});
      this.failureCode = ko.pureComputed(() => {
        const f = this.failure();
        const file = f ? findFile(f.file) : null;
        if (!file) {
          return f && f.file ? 'The failing file is not one of this change\'s files.' : 'This failure names no file.';
        }
        const content = this.fileCache()[file.path];
        if (content === undefined) {
          api.get('changes/' + this.detail().id + '/file?path=' + encodeURIComponent(file.path)).then((r) => {
            this.fileCache(Object.assign({}, this.fileCache(), { [file.path]: (r && r.generated) || '' }));
          }).catch(() => this.fileCache(Object.assign({}, this.fileCache(), { [file.path]: '' })));
          return 'Loading ' + file.path + '...';
        }
        if (!content) {
          return 'No generated content for ' + file.path + '.';
        }
        const all = content.split('\n');
        const at = f.line ? Number(f.line) : 1;
        const from = Math.max(1, at - 6);
        return all.slice(from - 1, from + 13).map((t, i) => String(from + i).padStart(4) + (from + i === at ? ' > ' : '   ') + t).join('\n');
      });
      this.showCode = () => this.detailTab('code');

      // --- run history and compare ---

      this.runRows = ko.pureComputed(() => this.runs().slice().reverse().map((r) => {
        const final = r.final;
        const unfinishedRow = final.some(unfinished) && !(r === this.lastRun() && building());
        const result = final.some((b) => !b.finishedAt) && !unfinishedRow ? 'RUNNING'
          : final.some((b) => b.result === 'FAILURE') ? 'FAILED'
            : final.some((b) => b.result === 'NOT_BUILT' || b.result === 'ABORTED') || unfinishedRow ? 'BLOCKED'
              : final.some((b) => b.result === 'UNSTABLE') ? 'WARNINGS' : 'PASSED';
        return {
          number: r.number,
          started: ui.when(r.startedAt),
          rounds: r.rows.map((b) => b.round).filter((n, i, a) => a.indexOf(n) === i).length,
          jobs: r.rows.map((b) => b.job + (b.buildNumber ? ' #' + b.buildNumber : '') + ' ' + (b.result || 'no result')).join(' → '),
          status: gateStatus(result),
          errors: r.errors.length,
          fixed: r.fixed.length ? r.fixed.map((p) => p.split('/').pop()).join(', ') : '–',
          took: duration({ startedAt: r.startedAt, finishedAt: r.finishedAt })
        };
      }));
      this.compareFrom = ko.observable('');
      this.compareTo = ko.observable('');
      this.compareFromChange = ui.value(this.compareFrom);
      this.compareToChange = ui.value(this.compareTo);
      this.runOptions = ko.pureComputed(() => this.runs().slice().reverse().map((r) => ({ value: String(r.number), label: 'Run ' + r.number + ' · ' + ui.when(r.startedAt) })));
      const resetCompare = () => {
        const n = this.runs().length;
        this.compareTo(n ? String(n) : '');
        this.compareFrom(n > 1 ? String(n - 1) : (n ? String(n) : ''));
      };
      // Errors are compared without the file's folder on the build agent, so the same error in two runs matches
      const key = (e) => e.replace(/^\S*\//, '');
      this.comparison = ko.pureComputed(() => {
        const a = this.runs().find((r) => String(r.number) === this.compareFrom());
        const b = this.runs().find((r) => String(r.number) === this.compareTo());
        if (!a || !b) {
          return { note: this.runs().length ? 'Choose two runs.' : 'No runs yet: build the change to compare runs.', rows: [] };
        }
        if (a === b) {
          return { note: this.runs().length < 2 ? 'Only one run so far.' : 'Choose two different runs.', rows: [] };
        }
        const before = a.finalErrors.map(key);
        const after = b.finalErrors.map(key);
        const row = (kind, text) => ({ kind: kind, text: text, css: 'factory-bt-diff factory-bt-diff-' + kind.toLowerCase() });
        const rows = [row('Result', 'Run ' + a.number + ': ' + a.final.map((x) => x.job + ' ' + (x.result || 'no result')).join(', ')
          + ' → run ' + b.number + ': ' + b.final.map((x) => x.job + ' ' + (x.result || 'no result')).join(', '))]
          .concat(after.filter((e) => before.indexOf(e) < 0).map((e) => row('New', e)))
          .concat(before.filter((e) => after.indexOf(e) < 0).map((e) => row('Fixed', e)))
          .concat(after.filter((e) => before.indexOf(e) >= 0).map((e) => row('Still', e)));
        return { note: 'Errors at the end of each run (its last round):', rows: rows };
      });

      // --- logs ---

      this.logRound = ko.observable(-1);
      this.logOptions = ko.pureComputed(() => builds().map((b, i) => ({ value: String(i), label: b.job + (b.buildNumber ? ' #' + b.buildNumber : '') + ' · round ' + b.round + ' · ' + (b.result || 'no result') + ' · ' + ui.when(b.startedAt) }))
        .reverse().concat([{ value: 'obdx', label: 'Quick checks, per file' }]));
      this.logChoice = ko.pureComputed(() => (this.logRound() === -1 ? (builds().length ? String(builds().length - 1) : 'obdx') : String(this.logRound())));
      this.logChange = (event) => this.logRound(event.target.value === 'obdx' ? 'obdx' : Number(event.target.value));
      this.logBuild = ko.pureComputed(() => (this.logChoice() === 'obdx' ? null : builds()[Number(this.logChoice())] || null));
      this.logText = ko.pureComputed(() => {
        if (this.logChoice() === 'obdx') {
          return files().length ? files().map((f) => '[' + (f.checkStatus || 'NOT_CHECKED') + '] ' + f.path + (f.checkMessage ? ' - ' + f.checkMessage : '')).join('\n') : 'No files checked yet.';
        }
        const b = this.logBuild();
        return b ? (b.logExcerpt || (b.job === QUICK_CHECKS ? b.errors.join('\n') : '(no log excerpt for this round)')) : 'No builds yet.';
      });
      this.logLines = ko.pureComputed(() => this.logText().split('\n').map((t, i) => ({ n: i + 1, text: t, css: /ERROR|FAIL/i.test(t) ? 'factory-bt-logline factory-bt-logerr' : 'factory-bt-logline' })));
      this.logDownload = ko.pureComputed(() => 'data:text/plain;charset=utf-8,' + encodeURIComponent(this.logText()));
      this.consoleUrl = ko.pureComputed(() => {
        const b = this.logBuild();
        return b && httpUrl(b.buildUrl) ? b.buildUrl.replace(/\/?$/, '/console') : '';
      });

      // --- checks per file, coverage, delivery ---

      this.fileRows = ko.pureComputed(() => files().map((f) => ({
        path: f.path, layer: f.layer,
        check: !written(f) ? ui.status('NOT_CHECKED', (f.checkMessage || '').indexOf(CUT_OFF) === 0 ? 'Cut off, not written' : 'Not written')
          : ui.status(f.checkStatus || 'NOT_CHECKED', { PASSED: 'Passed', FAILED: 'Failed', WARNING: 'Warning' }[f.checkStatus] || 'Not checked'),
        message: f.checkMessage || '', attempts: f.attempts
      })));
      this.coverageRows = ko.pureComputed(() => (this.coverage() ? this.coverage().criteria : []).map((c) => ({
        id: c.id, text: c.text, requirements: c.requirements.join(', '),
        tests: c.tests.map((p) => p.split('/').pop()).join(', ') || '–', code: c.code.map((p) => p.split('/').pop()).join(', ') || '–',
        status: c.tests.length ? ui.status('PASSED', 'In a test') : c.code.length ? ui.status('WARNING', 'Only in code') : ui.status('FAILED', 'Nowhere')
      })));
      this.requirementRows = ko.pureComputed(() => (this.coverage() ? this.coverage().requirements : []).map((r) => ({
        id: r.id, text: r.text, files: r.tests.concat(r.code).map((p) => p.split('/').pop()).join(', ') || '–',
        status: r.tests.length || r.code.length ? ui.status('PASSED', 'Named') : ui.status('WARNING', 'Not named')
      })));
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
      this.editedFiles = ko.pureComputed(() => files().filter((f) => f.edited).map((f) => f.path));
      this.summary = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return null;
        }
        return {
          code: code('CHG', d.id, 3), title: d.title, status: ui.status(d.status, d.status.charAt(0) + d.status.slice(1).toLowerCase().replace('_', ' ')),
          meta: [code('REQ', d.requirementId, 4), d.branchUrl ? 'branch ' + d.branchUrl.split('/').slice(-2).join('/') : 'not delivered',
            this.lastRun() ? 'last run ' + ui.when(this.lastRun().startedAt) : 'not built', this.jenkins() && this.jenkins().jobs ? 'Jenkins: ' + this.jenkins().jobs : 'Jenkins not set up'].join(' · ')
        };
      });

      // --- actions, offered only when the server takes them ---

      this.tab = ko.observable('gates');
      this.tabs = ui.tabs(this.tab, [
        { value: 'gates', label: 'Quality gates' },
        { value: 'history', label: 'Runs', count: ko.pureComputed(() => this.runs().length) },
        { value: 'logs', label: 'Logs' },
        { value: 'checks', label: 'Checks per file' },
        { value: 'coverage', label: 'Coverage' },
        { value: 'delivery', label: 'Delivery' }
      ]);
      this.tabKey = (event) => {
        const keys = this.tabs.map((t) => t.value);
        const at = keys.indexOf(this.tab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.tab(keys[next]);
        const button = document.getElementById('bt-' + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };
      this.canBuild = ko.pureComputed(() => {
        const d = this.detail();
        const j = this.jenkins();
        if (!d || !j || !j.mode || !this.canManage() || building()) {
          return false;
        }
        return j.mode === 'BRANCH' ? d.status === 'DELIVERED' : (d.status === 'GENERATED' || d.status === 'DELIVERED');
      });
      this.rebuildTip = ko.pureComputed(() => {
        if (this.canBuild()) {
          return null;
        }
        const d = this.detail();
        const j = this.jenkins();
        return !j || !j.mode ? 'Set up Jenkins on the Integrations page first' : !this.canManage() ? 'You need the Manage code permission'
          : d && building() ? 'A build is running' : 'Generate the code first' + (j.mode === 'BRANCH' ? ' and deliver it to a branch' : '');
      });
      // The quick checks run on a written or delivered change (ChangeService.checkAgain)
      this.canCheck = ko.pureComputed(() => !!this.detail() && this.canManage() && !this.checking() && !building()
        && ['GENERATED', 'DELIVERED'].indexOf(this.detail().status) >= 0);
      this.checkTip = ko.pureComputed(() => (this.canCheck() ? null : !this.canManage() ? 'You need the Manage code permission'
        : building() || this.checking() ? 'Wait until the running check or build ends' : 'There is no written code to check yet'));
      // Writing a file again with the fix: only while the code is under review (ChangeService.regenerate)
      this.canFix = ko.pureComputed(() => !!this.detail() && this.canManage() && this.detail().status === 'GENERATED' && !building()
        && !!this.failure() && !!findFile(this.failure().file));
      this.fixTip = ko.pureComputed(() => (this.canFix() ? 'Writes the failing file again, with the failure as the note' : !this.canManage() ? 'You need the Manage code permission'
        : !this.failure() ? 'Nothing failed' : !findFile(this.failure().file) ? 'The failure names no file of this change'
          : 'Files are written again before delivery; a delivered change is fixed by building it again (fix rounds)'));
      const base = () => 'changes/' + this.detail().id;
      this.rebuild = () => api.post(base() + '/build').then((d) => { show(d); toast.info('Build started. This page updates when Jenkins finishes.'); }).catch(actionError);
      this.checkAgain = () => {
        if (!this.canCheck()) {
          return;
        }
        this.checking(true);
        api.post(base() + '/check').then((d) => {
          this.checking(false);
          show(d);
          const k = quick();
          if (k.failed.length) {
            toast.error('Quick checks done: ' + k.failed.length + ' file(s) failed, ' + k.passed.length + ' passed.');
          } else {
            toast.success('Quick checks done: ' + k.passed.length + ' passed' + (k.warning.length ? ', ' + k.warning.length + ' with warnings.' : '.'));
          }
        }).catch((error) => { this.checking(false); actionError(error); });
      };
      this.fixWithAi = () => {
        if (!this.canFix()) {
          toast.warning(this.fixTip());
          return;
        }
        const f = this.failure();
        const file = findFile(f.file);
        api.post(base() + '/regenerate', { path: file.path, note: 'Fix this failure: ' + f.message })
          .then((d) => { show(d); toast.info('Writing ' + file.path.split('/').pop() + ' again with the fix.'); }).catch(actionError);
      };
      this.openWorkbench = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }));
      // Planned files that are not written: delivering or downloading leaves them out, so it asks first (as on Changes)
      const unwritten = ko.pureComputed(() => files().filter((f) => f.status === 'PENDING' || f.status === 'FAILED').map((f) => f.path));
      const incompleteNote = () => unwritten().length + ' planned file(s) are not written and would be left out: '
        + unwritten().slice(0, 5).join(', ') + (unwritten().length > 5 ? ' …' : '') + '.';
      this.patchUrl = ko.pureComputed(() => (this.detail() ? 'api/changes/' + this.detail().id + '/patch' : '#'));
      const downloadPatch = () => {
        if (!unwritten().length) {
          window.location.href = this.patchUrl();
          return;
        }
        dialog.confirm({ title: 'Download an incomplete patch?', message: incompleteNote(), confirmLabel: 'Download Without Them', danger: true }).then((ok) => {
          if (ok) {
            window.location.href = this.patchUrl() + '?incomplete=true';
          }
        });
      };
      this.moreItems = ko.pureComputed(() => [{ value: 'checks', label: 'Run quick checks', disabled: !this.canCheck() },
        { value: 'patch', label: 'Download patch' }, { value: 'changes', label: 'Open in Changes' }, { value: 'impact', label: 'Open Impact Analysis' }]);
      this.moreAction = (event) => {
        const action = event.detail.value;
        if (action === 'checks') {
          this.checkAgain();
        } else if (action === 'patch') {
          downloadPatch();
        } else {
          window.dispatchEvent(new CustomEvent('factory-navigate', { detail: action }));
        }
      };
      this.canDeliver = ko.pureComputed(() => !!this.detail() && this.detail().status === 'GENERATED' && this.canManage() && !building());
      this.deliver = () => (unwritten().length
        ? dialog.confirm({ title: 'Submit an incomplete change?', message: incompleteNote() + ' The branch may not build. Write them first with Continue generation or Write again on the Changes page.',
          confirmLabel: 'Submit Without Them', danger: true })
        : dialog.confirm({ title: 'Submit for review?', message: 'Commit the reviewed code to a new SVN branch? Trunk is not changed.', confirmLabel: 'Commit to a branch' })).then((ok) => {
        if (ok) {
          api.post(base() + '/deliver' + (unwritten().length ? '?incomplete=true' : '')).then((d) => { show(d); toast.success('Delivered to a new SVN branch for review.'); }).catch(actionError);
        }
      });

      // --- the assistant ---

      this.ai = assistant.create(() => {
        const d = this.detail();
        if (!d) {
          return '';
        }
        return 'Change "' + d.title + '" build status ' + (d.buildStatus || 'not built') + '. ' + (d.buildMessage || '')
          + '\nQuality gates: ' + this.gates().map((g) => g.title + ' ' + g.status.text + ' (' + g.evidence + ')').join('; ')
          + '\nQuick checks: ' + files().map((f) => f.path + ' ' + (f.checkStatus || 'not checked') + (f.checkMessage ? ' - ' + f.checkMessage : '')).join('; ')
          + '\nBuild rounds:\n' + builds().map((b) => 'Round ' + b.round + ' ' + b.job + ' ' + (b.result || '') + ' errors: ' + b.errors.join(' | ')
            + (b.logExcerpt ? '\nLog:\n' + b.logExcerpt.slice(-3000) : '')).join('\n');
      }, ['Why is the build failing?', 'Explain the failing check', 'Which criteria have no test?', 'Which files are affected?']);
      this.aiTab = ko.observable('chat');

      // --- loading: polls the change while it generates or builds, and says when that ends ---

      let pollTimer = null;
      let attached = false;
      const running = (d) => d.status === 'GENERATING' || d.buildStatus === 'BUILDING';
      const loadCoverage = (id) => api.get('changes/' + id + '/coverage').then((c) => { if (this.detail() && this.detail().id === id) { this.coverage(c); } })
        .catch(() => this.coverage({ hasSpec: false, written: 0, planned: 0, criteria: [], requirements: [] }));
      const show = (d) => {
        const before = this.detail();
        this.detail(d);
        this.errorMessage('');
        clearTimeout(pollTimer);
        pollTimer = null;
        if (!before || before.id !== d.id || !running(d)) {
          loadCoverage(d.id);
        }
        if (!before || before.id !== d.id) {
          resetCompare();
        }
        if (before && before.id === d.id && running(before) && !running(d)) {
          resetCompare();
          if (before.buildStatus === 'BUILDING' && d.buildStatus === 'PASSED') {
            toast.success('Build passed: ' + d.title);
          } else if (before.buildStatus === 'BUILDING' && d.buildStatus === 'FAILED') {
            toast.error('Build failed: ' + (d.buildMessage || d.title));
          } else if (before.status === 'GENERATING') {
            toast.info(d.status === 'FAILED' ? 'Code generation failed: ' + (d.message || d.title) : 'Code generated: ' + d.title);
          } else {
            toast.info('The build of ' + d.title + ' finished.');
          }
        }
        if (attached && running(d)) {
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
      this.changeId.subscribe(() => { this.selectedFailure(0); this.logRound(-1); this.fileCache({}); this.coverage(null); this.gateFilter('all'); this.load(); });
      const loadList = () => {
        const id = this.workspaceId();
        this.detail(null);
        if (!id) {
          this.changes([]);
          return;
        }
        this.requirementId('');
        api.get('workspaces/' + id + '/requirements').then((list) => this.requirements(list.map((r) => ({ id: r.id, label: code('REQ', r.id, 4) + ' – ' + r.title }))))
          .catch(() => this.requirements([]));
        api.get('workspaces/' + id + '/jenkins').then((j) => this.jenkins(j || null)).catch(() => this.jenkins(null));
        api.get('workspaces/' + id + '/changes').then((list) => {
          this.changes(list.map((c) => ({ id: c.id, label: code('CHG', c.id, 3) + ' – ' + c.title })));
          this.changeRequirement({});
          Promise.all(list.map((c) => api.get('changes/' + c.id).then((d) => [c.id, d.requirementId]).catch(() => [c.id, '']))).then((pairs) => {
            const map = {};
            pairs.forEach((p) => { map[p[0]] = p[1]; });
            this.changeRequirement(map);
          });
          // A change another page asked to open (Agent Runs), else the newest
          const wanted = list.find((c) => c.id === pageRequests.change());
          pageRequests.change(null);
          if (list.length) {
            this.changeId((wanted || list[0]).id);
          }
        }).catch(showError);
      };

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Build, Test and Review page loaded.');
        document.title = 'Build, Test & Review';
        attached = true;
        subscription = this.workspaceId.subscribe(loadList);
        workspaceSelection.load().then(loadList).catch(showError);
      };
      this.disconnected = () => {
        attached = false;
        clearTimeout(pollTimer);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return BuildViewModel;
  }
);
