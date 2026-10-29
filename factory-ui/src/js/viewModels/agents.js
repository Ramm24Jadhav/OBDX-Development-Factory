/*
 * Agent Runs page: the AI work the factory did, across the workspaces the user can see. Each run comes from what that
 * work left behind: a requirement's drafted specification, screens generated from a requirement, a change's impact
 * analysis and generated code, build fix rounds, and code imports (embeddings for search). Runs show their status,
 * times, steps, messages and files, link to the result, and can be run again where the factory allows it.
 * The factory does not record which model did older work, so the model shown is the one in use now.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/dashboard', '../services/workspaceSelection',
        '../services/ui', '../services/toast', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, dashboard, workspaceSelection, ui, toast) {
    const AGENTS = {
      requirements: { name: 'Requirements Agent', icon: 'doc', tone: 'amber' },
      ui: { name: 'UI Agent', icon: 'monitor', tone: 'violet' },
      analysis: { name: 'Analysis Agent', icon: 'branch', tone: 'blue' },
      code: { name: 'Code Generator', icon: 'code', tone: 'violet' },
      debug: { name: 'Debug Agent', icon: 'flask', tone: 'blue' },
      indexing: { name: 'Indexing Agent', icon: 'cube', tone: 'green' }
    };
    // Run statuses in the shared status categories (ui.status), with this page's words
    const STATUS = {
      completed: ui.status('SUCCEEDED', 'Completed'), failed: ui.status('FAILED', 'Failed'),
      running: ui.status('RUNNING', 'Running'), queued: ui.status('QUEUED', 'Queued')
    };
    const MONTH_MS = 30 * 24 * 3600 * 1000;
    // While a run is queued or running, the page reloads the real data this often
    const POLL_MS = 5000;
    const busy = (status) => status === 'running' || status === 'queued';
    const words = (status) => String(status || '').toLowerCase().replace(/_/g, ' ');
    const httpUrl = (url) => (url && /^https?:\/\//i.test(url) ? url : '');
    const hash = (text) => {
      let h = 0;
      for (let i = 0; i < text.length; i++) {
        h = (h * 31 + text.charCodeAt(i)) >>> 0;
      }
      return ('0000' + (h % 10000)).slice(-4);
    };

    const shortWhen = (value) => new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const copy = (text) => ui.copy(text).then(() => toast.success('Copied ' + text), () => toast.error('Could not copy. Select the text and copy it instead.'));

    function AgentsViewModel() {
      this.errorMessage = dashboard.error;
      this.loading = dashboard.loading;
      // Starting a run again: the result is a toast, and the list reloads to show the new run
      const again = (request, what) => request.then(() => { toast.success(what + ' started again.'); dashboard.load(); }).catch((error) => toast.error(error.message));
      const model = ko.pureComputed(() => (dashboard.model() ? dashboard.model().chatModel : '–'));
      const embedding = ko.pureComputed(() => (dashboard.model() ? dashboard.model().embeddingModel : '–'));

      // Every run, newest first
      this.runs = ko.pureComputed(() => {
        const runs = [];
        const add = (r) => runs.push(r);
        dashboard.data().forEach((d) => {
          const w = d.workspace;
          d.requirements.forEach((r) => add({
            key: 'req' + r.id, agent: 'requirements', task: 'Draft specification: ' + r.title, workspace: w.name, workspaceId: w.id,
            status: r.status === 'PROCESSING' ? 'running' : r.status === 'FAILED' ? 'failed' : 'completed',
            started: r.createdAt, finished: r.status === 'PROCESSING' ? null : r.updatedAt, approx: true,
            requirement: r.title, message: r.message || '', page: 'requirements',
            steps: [
              { name: 'Read the document', done: true },
              { name: 'Search the code for related screens', done: r.status !== 'PROCESSING' },
              { name: 'Draft screens, rules, APIs and questions', done: r.status !== 'PROCESSING' && r.status !== 'FAILED', failed: r.status === 'FAILED' },
              { name: r.openQuestions + ' open questions to answer', done: r.status === 'APPROVED' || (r.status === 'READY' && r.openQuestions === 0) }
            ],
            files: [], rerun: r.status === 'FAILED' ? () => again(api.post('requirements/' + r.id + '/retry'), 'The specification draft') : null,
            log: [{ at: r.createdAt, text: 'Document added: ' + (r.fileName || r.title) },
              { at: r.updatedAt, text: 'Status ' + words(r.status) + (r.message ? ': ' + r.message : '') + (r.status === 'PROCESSING' ? '' : ' (' + r.openQuestions + ' open questions)') }],
            activity: [], notRecorded: 'The factory keeps the latest status and message of a specification draft, not a step-by-step log, the time of each step or the model output.'
          }));
          // Screens generated from a requirement, one run per requirement
          const byRequirement = {};
          d.designs.filter((s) => s.requirementId).forEach((s) => { (byRequirement[s.requirementId] = byRequirement[s.requirementId] || []).push(s); });
          Object.keys(byRequirement).forEach((rid) => {
            const list = byRequirement[rid];
            const req = d.requirements.find((r) => r.id === rid);
            const first = list.map((s) => s.updatedAt).sort()[0];
            add({
              key: 'ui' + rid, agent: 'ui', task: 'Generate screens for ' + (req ? req.title : 'a requirement'), workspace: w.name, workspaceId: w.id,
              status: 'completed', started: first, finished: first, approx: true, requirement: req ? req.title : '', message: list.length + ' screens designed', page: 'designer',
              steps: list.map((s) => ({ name: s.name + ' (v' + s.currentVersion + ', ' + s.status.toLowerCase().replace('_', ' ') + ')', done: true })),
              files: [], rerun: null,
              log: list.slice().sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))
                .map((s) => ({ at: s.updatedAt, text: s.name + ': version ' + s.currentVersion + ', ' + words(s.status) })),
              activity: [], notRecorded: 'Screen generation keeps each screen\'s latest version and status (the times are the last update), not a log of the model\'s work.'
            });
          });
          d.changeDetails.forEach((c) => {
            const req = d.requirements.find((r) => r.id === c.requirementId);
            add({
              key: 'an' + c.id, agent: 'analysis', task: 'Impact analysis: ' + c.title, workspace: w.name, workspaceId: w.id,
              status: c.status === 'ANALYZING' ? 'running' : (!c.plan && c.status === 'FAILED') ? 'failed' : 'completed',
              started: c.createdAt, finished: c.status === 'ANALYZING' ? null : (c.planApprovedAt || c.updatedAt), approx: true,
              requirement: req ? req.title : '', message: c.plan ? c.plan.summary : (c.message || ''), page: 'impact', by: c.createdBy,
              steps: [
                { name: 'Read the approved requirement and screens', done: true },
                { name: 'Search reference implementations', done: !!c.plan },
                { name: 'Plan ' + (c.plan ? c.plan.items.length : 0) + ' files and risks', done: !!c.plan, failed: !c.plan && c.status === 'FAILED' },
                { name: 'Plan approved' + (c.planApprovedBy ? ' by ' + c.planApprovedBy : ''), done: !!c.planApprovedAt }
              ],
              files: c.plan ? c.plan.items.map((i) => i.action + ' ' + i.path) : [],
              rerun: c.status !== 'ANALYZING' && ['PLAN_READY', 'FAILED'].indexOf(c.status) >= 0 ? () => again(api.post('changes/' + c.id + '/analyze'), 'The impact analysis') : null,
              log: [{ at: c.createdAt, text: 'Change requested' + (c.createdBy ? ' by ' + c.createdBy : '') }]
                .concat(c.plan ? [{ at: null, text: 'Plan: ' + c.plan.summary }].concat((c.plan.risks || []).map((x) => ({ at: null, text: 'Risk: ' + x }))) : [])
                .concat(c.planApprovedAt ? [{ at: c.planApprovedAt, text: 'Plan approved' + (c.planApprovedBy ? ' by ' + c.planApprovedBy : '') }] : [])
                .concat(c.message ? [{ at: c.updatedAt, text: c.message }] : []),
              activity: c.plan ? c.plan.items.map((i) => ({ action: i.action, path: i.path, result: 'Planned', check: i.layer || '' })) : [],
              notRecorded: 'The analysis keeps its plan and the change\'s latest message. The searches it ran and the time of each step are not recorded.'
            });
            if (c.planApprovedAt) {
              const failedFiles = c.files.filter((f) => f.status === 'FAILED');
              add({
                key: 'cg' + c.id, agent: 'code', task: 'Generate code: ' + c.title, workspace: w.name, workspaceId: w.id,
                status: c.status === 'GENERATING' ? 'running' : (c.status === 'FAILED' || failedFiles.length) ? 'failed' : 'completed',
                started: c.planApprovedAt, finished: c.status === 'GENERATING' ? null : c.updatedAt, approx: true,
                requirement: req ? req.title : '', message: c.message || (c.files.filter((f) => f.status === 'GENERATED').length + ' files written'), page: 'changes', by: c.planApprovedBy,
                steps: c.files.map((f) => ({ name: (f.action === 'create' ? 'Create ' : 'Modify ') + f.path.split('/').pop() + (f.attempts > 1 ? ' (' + f.attempts + ' attempts)' : '')
                  + (f.checkStatus ? ' · checks ' + f.checkStatus.toLowerCase().replace('_', ' ') : ''), done: f.status === 'GENERATED' || f.status === 'UNCHANGED', failed: f.status === 'FAILED' })),
                files: c.files.map((f) => f.path + ' +' + f.linesAdded + ' -' + f.linesRemoved), rerun: null,
                log: [{ at: c.planApprovedAt, text: 'Plan approved; writing ' + c.files.length + ' files' }]
                  .concat(c.files.map((f) => ({ at: null, text: (f.action === 'create' ? 'Create ' : 'Modify ') + f.path + ': ' + words(f.status)
                    + (f.attempts > 1 ? ', ' + f.attempts + ' attempts' : '') + (f.checkStatus ? '; checks ' + words(f.checkStatus) + (f.checkMessage ? ' - ' + f.checkMessage : '') : '') })))
                  .concat([{ at: c.updatedAt, text: c.message || 'Last update: ' + words(c.status) }]),
                activity: c.files.map((f) => ({ action: f.action, path: f.path, result: words(f.status) + ' +' + f.linesAdded + ' -' + f.linesRemoved + (f.edited ? ', edited by a reviewer' : ''),
                  check: (f.checkStatus ? words(f.checkStatus) : 'not checked') + (f.checkMessage ? ': ' + f.checkMessage : '') + (f.attempts > 1 ? ' (' + f.attempts + ' attempts)' : '') })),
                notRecorded: 'The time each file was written and the model output are not recorded; each file shows its latest result.'
              });
            }
            c.builds.filter((b) => b.fixedFiles.length).forEach((b) => add({
              key: 'fx' + b.id, agent: 'debug', task: 'Fix build errors (round ' + b.round + '): ' + c.title, workspace: w.name, workspaceId: w.id,
              status: 'completed', started: b.startedAt, finished: b.finishedAt, approx: false, requirement: req ? req.title : '',
              message: b.errors.slice(0, 3).join(' | '), page: 'build',
              steps: [{ name: b.job + ' ' + (b.result || ''), done: true }, { name: b.errors.length + ' errors sent to the model', done: true },
                { name: b.fixedFiles.length + ' files fixed', done: true }],
              files: b.fixedFiles, rerun: null,
              log: [{ at: b.startedAt, text: b.job + (b.buildNumber ? ' #' + b.buildNumber : '') + ' started (round ' + b.round + ')' }]
                .concat(b.errors.map((e) => ({ at: null, text: 'Error: ' + e })))
                .concat(b.fixedFiles.map((f) => ({ at: null, text: 'Fixed ' + f })))
                .concat(b.finishedAt ? [{ at: b.finishedAt, text: 'Finished: ' + (b.result || 'no result') }] : []),
              activity: b.fixedFiles.map((f) => ({ action: 'fix', path: f, result: 'Written again', check: '' })),
              buildLog: b.logExcerpt || '', consoleUrl: httpUrl(b.buildUrl) ? b.buildUrl.replace(/\/?$/, '/console') : '',
              notRecorded: 'The factory keeps an excerpt of the Jenkins console, the errors and the fixed files. The full console is in Jenkins.'
            }));
          });
          d.imports.forEach((j) => add({
            key: 'ix' + j.id, agent: 'indexing', task: 'Index code' + (j.toRevision ? ' at r' + j.toRevision : '') + ' and create embeddings', workspace: w.name, workspaceId: w.id,
            status: j.status === 'QUEUED' ? 'queued' : j.status === 'RUNNING' ? 'running' : j.status === 'FAILED' ? 'failed' : 'completed',
            started: j.startedAt || j.createdAt, finished: j.finishedAt, approx: false, requirement: '', message: j.message || '', page: 'code', model: embedding(),
            steps: [{ name: j.filesScanned + ' files scanned', done: j.status !== 'QUEUED' }, { name: j.filesIndexed + ' files indexed, ' + j.filesRemoved + ' removed', done: j.status === 'SUCCEEDED' },
              { name: j.chunksIndexed + ' pieces, ' + j.embeddingsCreated + ' embeddings', done: j.status === 'SUCCEEDED', failed: j.status === 'FAILED' }],
            files: [], rerun: j.status === 'FAILED' ? () => again(api.post('workspaces/' + w.id + '/imports'), 'The code import') : null,
            log: [{ at: j.createdAt, text: 'Queued' + (j.toRevision ? ' (r' + (j.fromRevision || 0) + ' to r' + j.toRevision + ')' : '') }]
              .concat(j.startedAt ? [{ at: j.startedAt, text: 'Started' }] : [])
              .concat(j.status !== 'QUEUED' ? [{ at: null, text: j.filesScanned + ' files scanned, ' + j.filesIndexed + ' indexed, ' + j.filesRemoved + ' removed; '
                + j.chunksIndexed + ' pieces, ' + j.embeddingsCreated + ' embeddings' }] : [])
              .concat(j.message ? [{ at: j.finishedAt, text: j.message }] : [])
              .concat(j.finishedAt ? [{ at: j.finishedAt, text: 'Finished: ' + words(j.status) }] : []),
            activity: [], notRecorded: 'Import progress is kept as counts and the latest message, not as a line-by-line log or a list of files.'
          }));
        });
        return runs.filter((r) => r.started).sort((a, b) => new Date(b.started) - new Date(a.started)).map((r) => {
          const agent = AGENTS[r.agent];
          const ms = r.finished ? new Date(r.finished) - new Date(r.started) : null;
          return Object.assign(r, {
            id: 'RUN-' + new Date(r.started).getFullYear() + '-' + hash(r.key), agentName: agent.name, model: r.model || model(),
            agentCss: 'factory-ag-agent factory-ov2-icon-' + agent.tone, agentIcon: 'factory-nav-icon factory-ico-' + agent.icon,
            pill: STATUS[r.status], startedText: ui.when(r.started), startedShort: shortWhen(r.started),
            finishedText: r.finished ? ui.when(r.finished) + (r.approx ? ' (last update)' : '') : (r.status === 'running' || r.status === 'queued' ? 'Not finished yet' : '–'),
            byInitials: ui.initials(r.by || ''), isLive: busy(r.status), buildLog: r.buildLog || '', consoleUrl: r.consoleUrl || '',
            logText: (r.log || []).map((x) => '[' + (x.at ? ui.when(x.at) : 'time not recorded') + '] ' + x.text).join('\n') || 'No messages for this run.',
            duration: ms === null ? '–' : (r.approx ? '~' : '') + (Math.round(ms / 1000) >= 60 ? Math.floor(Math.round(ms / 1000) / 60) + 'm ' + (Math.round(ms / 1000) % 60) + 's' : Math.max(0, Math.round(ms / 1000)) + 's')
          });
        });
      });

      // Totals
      const c = (s) => this.runs().filter((r) => r.status === s).length;
      this.kpis = ko.pureComputed(() => {
        const total = this.runs().length || 1;
        const month = this.runs().filter((r) => Date.now() - new Date(r.started).getTime() < MONTH_MS).length;
        return [
          { label: 'Total Runs', value: this.runs().length, sub: '↑ ' + month + ' this month', css: 'factory-kpi-sub factory-up', tone: 'blue', icon: 'robot' },
          { label: 'Completed', value: c('completed'), sub: Math.round(100 * c('completed') / total) + '% success rate', css: 'factory-kpi-sub', tone: 'green', icon: 'check' },
          { label: 'Failed', value: c('failed'), sub: Math.round(100 * c('failed') / total) + '% failure rate', css: 'factory-kpi-sub', tone: 'red', icon: 'x' },
          { label: 'Running', value: c('running'), sub: 'Currently running', css: 'factory-kpi-sub', tone: 'blue', icon: 'clock' },
          { label: 'Queued', value: c('queued'), sub: 'In queue', css: 'factory-kpi-sub', tone: 'violet', icon: 'list' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });

      // Tabs, filters and pages
      this.tab = ko.observable('all');
      this.tabs = ui.tabs(this.tab, [
        { value: 'all', label: 'All Runs', icon: 'robot' },
        { value: 'running', label: 'Running', icon: 'clock', count: ko.pureComputed(() => c('running')) },
        { value: 'failed', label: 'Failed', icon: 'x', count: ko.pureComputed(() => c('failed')) },
        { value: 'queued', label: 'Queued', icon: 'list', count: ko.pureComputed(() => c('queued')) }
      ]);
      this.search = ko.observable('');
      // Status and agent take several values (fx-multiselect); none chosen means all
      this.statusFilter = ko.observableArray([]);
      this.agentFilter = ko.observableArray([]);
      // The runs of the workspace chosen in the top bar (runs that belong to no workspace always show)
      this.workspaceFilter = ko.pureComputed(() => workspaceSelection.selectedId() || '');
      this.modelFilter = ko.observable('');
      // Started between (fx-date-range, yyyy-mm-dd)
      this.fromDate = ko.observable('');
      this.toDate = ko.observable('');
      this.modelChange = ui.value(this.modelFilter);
      this.modelOptions = ko.pureComputed(() => Array.from(new Set(this.runs().map((r) => r.model))).sort());
      this.searchInput = ui.value(this.search);
      this.statusOptions = [{ value: 'completed', label: 'Completed' }, { value: 'failed', label: 'Failed' }, { value: 'running', label: 'Running' }, { value: 'queued', label: 'Queued' }];
      this.agentOptions = Object.keys(AGENTS).map((k) => ({ value: k, label: AGENTS[k].name }));
      this.resetFilters = () => {
        ['runSearch', 'runModel', 'runWorkspace'].forEach((id) => { const el = document.getElementById(id); if (el) { el.value = ''; } });
        this.search(''); this.statusFilter([]); this.agentFilter([]);  this.modelFilter(''); this.fromDate(''); this.toDate('');
        this.tab('all');
      };
      this.visibleRuns = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        const statuses = this.statusFilter() || [];
        const agents = this.agentFilter() || [];
        return this.runs().filter((r) => (this.tab() === 'all' || r.status === this.tab())
          && (!statuses.length || statuses.indexOf(r.status) >= 0) && (!agents.length || agents.indexOf(r.agent) >= 0)
          && (!this.workspaceFilter() || !r.workspaceId || r.workspaceId === this.workspaceFilter()) && (!this.modelFilter() || r.model === this.modelFilter())
          && (!this.fromDate() || new Date(r.started) >= new Date(this.fromDate() + 'T00:00:00'))
          && (!this.toDate() || new Date(r.started) <= new Date(this.toDate() + 'T23:59:59'))
          && (!text || (r.id + ' ' + r.task + ' ' + r.requirement + ' ' + r.model + ' ' + r.agentName).toLowerCase().indexOf(text) >= 0));
      });
      this.pager = ui.pages(this.visibleRuns, 10, [10, 25, 50]);
      this.selectedKey = ko.observable(null);
      const pickRun = (key) => { this.selectedKey(key); this.detailTab('overview'); this.openSteps([]); };
      // Checked runs (client side)
      this.checked = ko.observableArray([]);
      this.allSelected = ko.pureComputed(() => this.pager.rows().length > 0 && this.pager.rows().every((r) => this.checked.indexOf(r.key) >= 0));
      this.toggleAll = (event) => {
        const keys = this.pager.rows().map((r) => r.key);
        this.checked(event.target.checked ? Array.from(new Set(this.checked().concat(keys))) : this.checked().filter((k) => keys.indexOf(k) < 0));
      };
      this.selectedText = ko.pureComputed(() => (this.checked().length ? ' · ' + this.checked().length + ' selected' : ''));
      const toggleKey = (key) => { if (this.checked.indexOf(key) >= 0) { this.checked.remove(key); } else { this.checked.push(key); } };
      // Bulk bar while runs are checked
      this.bulkText = ko.pureComputed(() => this.checked().length + (this.checked().length === 1 ? ' run selected' : ' runs selected'));
      this.copyIds = () => {
        const ids = this.runs().filter((r) => this.checked.indexOf(r.key) >= 0).map((r) => r.id);
        ui.copy(ids.join('\n')).then(() => toast.success('Copied ' + ids.length + (ids.length === 1 ? ' run ID.' : ' run IDs.')),
          () => toast.error('Could not copy. Select the text and copy it instead.'));
      };
      this.clearChecked = () => this.checked([]);
      // Keyboard on the runs table: arrows or J/K move, Enter opens the details, X checks the row
      this.keys = ui.tableKeys(ko.pureComputed(() => this.rows()), { open: (row) => row.pick(), toggle: (row) => toggleKey(row.key) });
      this.rows = ko.pureComputed(() => this.pager.rows().map((r, i) => Object.assign({}, r, {
        css: ko.pureComputed(() => 'factory-clickable' + (this.selectedKey() === r.key ? ' is-selected' : '') + (this.keys.cursor() === i ? ' is-cursor' : '')),
        pick: () => { this.keys.cursor(i); pickRun(r.key); },
        isSelected: ko.pureComputed(() => this.checked.indexOf(r.key) >= 0),
        toggle: (event) => { if (event.target.checked) { this.checked.push(r.key); } else { this.checked.remove(r.key); } },
        stop: (event) => event.stopPropagation(),
        menuItems: [{ value: 'details', label: 'View details' }, { value: 'log', label: 'View log' }, { value: 'open', label: 'Open result' }, { value: 'copy', label: 'Copy run ID' },
          { value: 'rerun', label: 'Re-run', disabled: !r.rerun }],
        action: (event) => {
          const value = event.detail.value;
          if (value === 'details') {
            pickRun(r.key);
          } else if (value === 'log') {
            pickRun(r.key);
            this.logOpen(true);
          } else if (value === 'open') {
            workspaceSelection.selectedId(r.workspaceId);
            navigate(r.page);
          } else if (value === 'copy') {
            copy(r.id);
          } else if (value === 'rerun' && r.rerun) {
            r.rerun();
          }
        }
      })));

      // The selected run
      this.run = ko.pureComputed(() => this.runs().find((r) => r.key === this.selectedKey()) || this.runs()[0] || null);
      this.closeRun = () => this.selectedKey('none');
      this.detailTab = ko.observable('overview');
      this.detailTabs = ui.tabs(this.detailTab, [
        { value: 'overview', label: 'Overview' }, { value: 'steps', label: 'Execution Steps' }, { value: 'logs', label: 'Logs' },
        { value: 'files', label: 'Files', count: ko.pureComputed(() => (this.run() ? this.run().files.length : 0)) },
        { value: 'related', label: 'Related', count: ko.pureComputed(() => this.related().length) }
      ]);
      this.openSteps = ko.observableArray([]);
      // The first unfinished step of a running run is the one in progress; the others wait
      this.steps = ko.pureComputed(() => {
        const r = this.run();
        if (!r) {
          return [];
        }
        const now = r.status === 'running' ? r.steps.findIndex((s) => !s.done && !s.failed) : -1;
        return r.steps.map((s, i) => ({
        n: i + 1, name: s.name, css: 'factory-step-dot ' + (s.failed ? 'factory-dot-red' : s.done ? 'factory-dot-green' : 'factory-dot-grey'),
        icon: 'factory-nav-icon factory-ico-' + (s.failed ? 'x' : s.done ? 'check' : i === now ? 'refresh' : 'clock'),
        state: s.failed ? 'Failed' : s.done ? 'Done' : i === now ? 'In progress' : 'Waiting',
        live: i === now,
        dotCss: 'fx-timeline-dot' + (s.failed ? ' fx-timeline-dot--danger' : s.done ? ' fx-timeline-dot--success' : i === now ? ' fx-timeline-dot--running' : ''),
        open: ko.pureComputed(() => this.openSteps.indexOf(i) >= 0),
        liCss: ko.pureComputed(() => (this.openSteps.indexOf(i) >= 0 ? 'factory-ag-open' : '')),
        toggle: () => { if (this.openSteps.indexOf(i) >= 0) { this.openSteps.remove(i); } else { this.openSteps.push(i); } }
        }));
      });
      // The log sheet: the run's recorded messages, file activity and build console excerpt
      this.logOpen = ko.observable(false);
      this.openLog = () => this.logOpen(true);
      this.logHeading = ko.pureComputed(() => (this.run() ? 'Log: ' + this.run().id : 'Log'));
      this.logSubtitle = ko.pureComputed(() => (this.run() ? this.run().task : ''));
      // Runs for the same requirement (or, without one, the same workspace)
      this.related = ko.pureComputed(() => {
        const r = this.run();
        if (!r) {
          return [];
        }
        return this.runs().filter((x) => x.key !== r.key && x.workspaceId === r.workspaceId && (r.requirement ? x.requirement === r.requirement : true))
          .slice(0, 12).map((x) => Object.assign({}, x, { pick: () => pickRun(x.key) }));
      });
      this.resultLabel = ko.pureComputed(() => (this.run() && this.run().page === 'changes' ? 'View Changes' : 'View Result'));
      this.moreItems = [{ value: 'steps', label: 'Show execution steps' }, { value: 'logs', label: 'Show logs' }, { value: 'log', label: 'View full log' }, { value: 'files', label: 'Show files' },
        { value: 'copy', label: 'Copy run ID' }, { value: 'workspace', label: 'Open the workspace' }];
      this.moreAction = (event) => {
        const value = event.detail.value;
        const r = this.run();
        if (!r) {
          return;
        }
        if (value === 'log') {
          this.logOpen(true);
        } else if (value === 'copy') {
          copy(r.id);
        } else if (value === 'workspace') {
          workspaceSelection.selectedId(r.workspaceId);
          navigate('workspaces');
        } else {
          this.detailTab(value);
        }
      };
      this.allStepsDone = ko.pureComputed(() => this.steps().length > 0 && this.run().steps.every((s) => s.done));
      this.viewResult = () => {
        const r = this.run();
        if (r) {
          workspaceSelection.selectedId(r.workspaceId);
          window.dispatchEvent(new CustomEvent('factory-navigate', { detail: r.page }));
        }
      };
      this.rerun = () => { const r = this.run(); if (r && r.rerun) { r.rerun(); } };
      this.canRerun = ko.pureComputed(() => !!this.run() && !!this.run().rerun);
      // New Agent Task: a split button (design system .fx-split); each kind of work starts on its own page
      this.taskMenu = ui.menu();
      this.taskItems = [
        { label: 'Draft a specification from a BRD/FSD', icon: 'doc', page: 'requirements' },
        { label: 'Plan a change (impact analysis)', icon: 'branch', page: 'changes' },
        { label: 'Change a screen with AI', icon: 'design', page: 'designer' },
        { label: 'Import and index code', icon: 'code', page: 'code' }
      ].map((t) => Object.assign(t, { iconClass: 'factory-nav-icon factory-ico-' + t.icon, run: () => { this.taskMenu.close(); navigate(t.page); } }));
      this.newTaskDefault = () => navigate('requirements');
      this.viewAll = () => { this.resetFilters(); const el = document.getElementById('runList'); if (el) { el.scrollIntoView({ behavior: 'smooth' }); } };
      this.viewModels = () => navigate('models');

      // Recent activity and runs by agent
      const STATUS_TEXT = { completed: 'completed successfully', failed: 'failed', running: 'started', queued: 'queued' };
      this.recent = ko.pureComputed(() => this.runs().slice(0, 5).map((r) => ({
        time: new Date(r.started).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        id: r.id, text: STATUS_TEXT[r.status], agent: '(' + r.agentName + ')', full: r.id + ' ' + STATUS_TEXT[r.status] + ': ' + r.task,
        css: 'factory-step-dot factory-dot-' + (r.status === 'completed' ? 'green' : r.status === 'failed' ? 'red' : r.status === 'queued' ? 'violet' : 'blue'),
        icon: 'factory-nav-icon factory-ico-' + (r.status === 'completed' ? 'check' : r.status === 'failed' ? 'x' : 'clock')
      })));
      // Model usage this month: runs per model (the factory does not record tokens)
      this.byModel = ko.pureComputed(() => {
        const colors = ['#4f46e5', '#16a34a', '#7c3aed', '#f59e0b', '#db2777', '#0891b2'];
        const month = this.runs().filter((r) => Date.now() - new Date(r.started).getTime() < MONTH_MS);
        const total = month.length || 1;
        let at = 0;
        const names = Array.from(new Set(month.map((r) => r.model)));
        const parts = names.map((name, i) => ({ label: name, n: month.filter((r) => r.model === name).length, color: colors[i % colors.length] })).sort((a, b) => b.n - a.n);
        const stops = parts.map((p) => { const from = at; at += 100 * p.n / total; return p.color + ' ' + from + '% ' + at + '%'; });
        return {
          total: month.length, parts: parts.map((p) => Object.assign(p, { dot: { background: p.color }, text: p.n + ' (' + Math.round(100 * p.n / total) + '%)' })),
          style: { background: stops.length ? 'conic-gradient(' + stops.join(', ') + ')' : 'var(--fx-surface-3)' }
        };
      });
      this.modelNote = ko.pureComputed(() => 'Model in use now: ' + model() + '; code search: ' + embedding() + '.');

      // Live updates: while a run is queued or running, reload the real data every few seconds; stop when nothing runs
      // or the page is left. A run that finishes meanwhile shows a toast.
      this.anyBusy = ko.pureComputed(() => this.runs().some((r) => busy(r.status)));
      let attached = false;
      let timer = null;
      let lastStatus = null;
      const schedule = () => {
        window.clearTimeout(timer);
        timer = null;
        if (attached && this.anyBusy()) {
          timer = window.setTimeout(() => dashboard.load().then(schedule), POLL_MS);
        }
      };
      const watchFinished = (runs) => {
        const now = {};
        runs.forEach((r) => { now[r.key] = r; });
        if (attached && lastStatus) {
          runs.filter((r) => !busy(r.status) && busy(lastStatus[r.key])).forEach((r) => {
            if (r.status === 'failed') {
              toast.error(r.id + ' failed: ' + r.task);
            } else {
              toast.success(r.id + ' finished: ' + r.task);
            }
          });
        }
        lastStatus = {};
        Object.keys(now).forEach((k) => { lastStatus[k] = now[k].status; });
      };
      const subscriptions = [];
      this.connected = () => {
        accUtils.announce('Agent Runs page loaded.');
        document.title = 'Agent Runs';
        attached = true;
        lastStatus = null;
        subscriptions.push(this.runs.subscribe(watchFinished));
        subscriptions.push(this.anyBusy.subscribe((value) => { if (value && !timer) { schedule(); } }));
        dashboard.load().then(() => { watchFinished(this.runs()); schedule(); });
      };
      this.disconnected = () => {
        attached = false;
        window.clearTimeout(timer);
        timer = null;
        this.logOpen(false);
        subscriptions.splice(0).forEach((s) => s.dispose());
      };
    }

    return AgentsViewModel;
  }
);
