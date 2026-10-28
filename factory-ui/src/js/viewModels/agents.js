/*
 * Agent Runs page: the AI work the factory did, across the workspaces the user can see. Each run comes from what that
 * work left behind: a requirement's drafted specification, screens generated from a requirement, a change's impact
 * analysis and generated code, build fix rounds, and code imports (embeddings for search). Runs show their status,
 * times, steps, messages and files, link to the result, and can be run again where the factory allows it.
 * The factory does not record which model did older work, so the model shown is the one in use now.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/dashboard', '../services/workspaceSelection',
        '../services/ui', 'ojs/ojknockout', 'ojs/ojbutton', 'ojs/ojmenu'],
  function (ko, accUtils, api, session, dashboard, workspaceSelection, ui) {
    const AGENTS = {
      requirements: { name: 'Requirements Agent', icon: 'doc', tone: 'amber' },
      ui: { name: 'UI Agent', icon: 'monitor', tone: 'violet' },
      analysis: { name: 'Analysis Agent', icon: 'branch', tone: 'blue' },
      code: { name: 'Code Generator', icon: 'code', tone: 'violet' },
      debug: { name: 'Debug Agent', icon: 'flask', tone: 'blue' },
      indexing: { name: 'Indexing Agent', icon: 'cube', tone: 'green' }
    };
    const STATUS = {
      completed: ui.pill('Completed', 'green'), failed: ui.pill('Failed', 'red'), running: ui.pill('Running', 'blue'), queued: ui.pill('Queued', 'violet')
    };
    const MONTH_MS = 30 * 24 * 3600 * 1000;
    const hash = (text) => {
      let h = 0;
      for (let i = 0; i < text.length; i++) {
        h = (h * 31 + text.charCodeAt(i)) >>> 0;
      }
      return ('0000' + (h % 10000)).slice(-4);
    };

    function AgentsViewModel() {
      this.errorMessage = ko.observable('');
      this.loading = dashboard.loading;
      const showError = (error) => this.errorMessage(error.message);
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
            files: [], rerun: r.status === 'FAILED' ? () => api.post('requirements/' + r.id + '/retry').then(() => dashboard.load()).catch(showError) : null
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
              files: [], rerun: null
            });
          });
          d.changeDetails.forEach((c) => {
            const req = d.requirements.find((r) => r.id === c.requirementId);
            add({
              key: 'an' + c.id, agent: 'analysis', task: 'Impact analysis: ' + c.title, workspace: w.name, workspaceId: w.id,
              status: c.status === 'ANALYZING' ? 'running' : (!c.plan && c.status === 'FAILED') ? 'failed' : 'completed',
              started: c.createdAt, finished: c.status === 'ANALYZING' ? null : (c.planApprovedAt || c.updatedAt), approx: true,
              requirement: req ? req.title : '', message: c.plan ? c.plan.summary : (c.message || ''), page: 'impact',
              steps: [
                { name: 'Read the approved requirement and screens', done: true },
                { name: 'Search reference implementations', done: !!c.plan },
                { name: 'Plan ' + (c.plan ? c.plan.items.length : 0) + ' files and risks', done: !!c.plan, failed: !c.plan && c.status === 'FAILED' },
                { name: 'Plan approved' + (c.planApprovedBy ? ' by ' + c.planApprovedBy : ''), done: !!c.planApprovedAt }
              ],
              files: c.plan ? c.plan.items.map((i) => i.action + ' ' + i.path) : [],
              rerun: c.status !== 'ANALYZING' && ['PLAN_READY', 'FAILED'].indexOf(c.status) >= 0 ? () => api.post('changes/' + c.id + '/analyze').then(() => dashboard.load()).catch(showError) : null
            });
            if (c.planApprovedAt) {
              const failedFiles = c.files.filter((f) => f.status === 'FAILED');
              add({
                key: 'cg' + c.id, agent: 'code', task: 'Generate code: ' + c.title, workspace: w.name, workspaceId: w.id,
                status: c.status === 'GENERATING' ? 'running' : (c.status === 'FAILED' || failedFiles.length) ? 'failed' : 'completed',
                started: c.planApprovedAt, finished: c.status === 'GENERATING' ? null : c.updatedAt, approx: true,
                requirement: req ? req.title : '', message: c.message || (c.files.filter((f) => f.status === 'GENERATED').length + ' files written'), page: 'changes',
                steps: c.files.map((f) => ({ name: (f.action === 'create' ? 'Create ' : 'Modify ') + f.path.split('/').pop() + (f.attempts > 1 ? ' (' + f.attempts + ' attempts)' : '')
                  + (f.checkStatus ? ' · checks ' + f.checkStatus.toLowerCase().replace('_', ' ') : ''), done: f.status === 'GENERATED' || f.status === 'UNCHANGED', failed: f.status === 'FAILED' })),
                files: c.files.map((f) => f.path + ' +' + f.linesAdded + ' -' + f.linesRemoved), rerun: null
              });
            }
            c.builds.filter((b) => b.fixedFiles.length).forEach((b) => add({
              key: 'fx' + b.id, agent: 'debug', task: 'Fix build errors (round ' + b.round + '): ' + c.title, workspace: w.name, workspaceId: w.id,
              status: 'completed', started: b.startedAt, finished: b.finishedAt, approx: false, requirement: req ? req.title : '',
              message: b.errors.slice(0, 3).join(' | '), page: 'build',
              steps: [{ name: b.job + ' ' + (b.result || ''), done: true }, { name: b.errors.length + ' errors sent to the model', done: true },
                { name: b.fixedFiles.length + ' files fixed', done: true }],
              files: b.fixedFiles, rerun: null
            }));
          });
          d.imports.forEach((j) => add({
            key: 'ix' + j.id, agent: 'indexing', task: 'Index code' + (j.toRevision ? ' at r' + j.toRevision : '') + ' and create embeddings', workspace: w.name, workspaceId: w.id,
            status: j.status === 'QUEUED' ? 'queued' : j.status === 'RUNNING' ? 'running' : j.status === 'FAILED' ? 'failed' : 'completed',
            started: j.startedAt || j.createdAt, finished: j.finishedAt, approx: false, requirement: '', message: j.message || '', page: 'code', model: embedding(),
            steps: [{ name: j.filesScanned + ' files scanned', done: j.status !== 'QUEUED' }, { name: j.filesIndexed + ' files indexed, ' + j.filesRemoved + ' removed', done: j.status === 'SUCCEEDED' },
              { name: j.chunksIndexed + ' pieces, ' + j.embeddingsCreated + ' embeddings', done: j.status === 'SUCCEEDED', failed: j.status === 'FAILED' }],
            files: [], rerun: j.status === 'FAILED' ? () => api.post('workspaces/' + w.id + '/imports').then(() => dashboard.load()).catch(showError) : null
          }));
        });
        return runs.filter((r) => r.started).sort((a, b) => new Date(b.started) - new Date(a.started)).map((r) => {
          const agent = AGENTS[r.agent];
          const ms = r.finished ? new Date(r.finished) - new Date(r.started) : null;
          return Object.assign(r, {
            id: 'RUN-' + new Date(r.started).getFullYear() + '-' + hash(r.key), agentName: agent.name, model: r.model || model(),
            agentCss: 'factory-ag-agent factory-ov2-icon-' + agent.tone, agentIcon: 'factory-nav-icon factory-ico-' + agent.icon,
            pill: STATUS[r.status], startedText: ui.when(r.started),
            duration: ms === null ? '–' : (r.approx ? '~' : '') + (ms >= 60000 ? Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's' : Math.max(0, Math.round(ms / 1000)) + 's')
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
      this.statusFilter = ko.observable('');
      this.agentFilter = ko.observable('');
      this.workspaceFilter = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.statusChange = ui.value(this.statusFilter);
      this.agentChange = ui.value(this.agentFilter);
      this.workspaceChange = ui.value(this.workspaceFilter);
      this.agentOptions = Object.keys(AGENTS).map((k) => ({ value: k, label: AGENTS[k].name }));
      this.workspaceOptions = ko.pureComputed(() => dashboard.data().map((d) => ({ value: d.workspace.id, label: d.workspace.name })));
      this.resetFilters = () => {
        ['runSearch', 'runStatus', 'runAgent', 'runWorkspace'].forEach((id) => { const el = document.getElementById(id); if (el) { el.value = ''; } });
        this.search(''); this.statusFilter(''); this.agentFilter(''); this.workspaceFilter('');
      };
      this.visibleRuns = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        return this.runs().filter((r) => (this.tab() === 'all' || r.status === this.tab())
          && (!this.statusFilter() || r.status === this.statusFilter()) && (!this.agentFilter() || r.agent === this.agentFilter())
          && (!this.workspaceFilter() || r.workspaceId === this.workspaceFilter())
          && (!text || (r.id + ' ' + r.task + ' ' + r.requirement + ' ' + r.model + ' ' + r.agentName).toLowerCase().indexOf(text) >= 0));
      });
      this.pager = ui.pager(this.visibleRuns, 10);
      this.selectedKey = ko.observable(null);
      this.rows = ko.pureComputed(() => this.pager.rows().map((r) => Object.assign({}, r, {
        css: this.selectedKey() === r.key ? 'factory-clickable factory-row-sel' : 'factory-clickable', pick: () => { this.selectedKey(r.key); this.detailTab('overview'); }
      })));

      // The selected run
      this.run = ko.pureComputed(() => this.runs().find((r) => r.key === this.selectedKey()) || this.runs()[0] || null);
      this.closeRun = () => this.selectedKey('none');
      this.detailTab = ko.observable('overview');
      this.detailTabs = ui.tabs(this.detailTab, [
        { value: 'overview', label: 'Overview' }, { value: 'steps', label: 'Execution Steps' }, { value: 'logs', label: 'Logs' },
        { value: 'files', label: 'Files', count: ko.pureComputed(() => (this.run() ? this.run().files.length : 0)) }
      ]);
      this.steps = ko.pureComputed(() => (this.run() ? this.run().steps.map((s, i) => ({
        n: i + 1, name: s.name, css: 'factory-step-dot ' + (s.failed ? 'factory-dot-red' : s.done ? 'factory-dot-green' : 'factory-dot-grey'),
        icon: 'factory-nav-icon factory-ico-' + (s.failed ? 'x' : s.done ? 'check' : 'clock')
      })) : []));
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
      this.newTask = (event) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: event.detail.selectedValue }));

      // Recent activity and runs by agent
      this.recent = ko.pureComputed(() => this.runs().slice(0, 5).map((r) => ({
        time: new Date(r.started).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        text: r.id + ' ' + (r.status === 'completed' ? 'completed' : r.status) + ' (' + r.agentName + ')',
        css: 'factory-step-dot factory-dot-' + (r.status === 'completed' ? 'green' : r.status === 'failed' ? 'red' : 'blue'),
        icon: 'factory-nav-icon factory-ico-' + (r.status === 'completed' ? 'check' : r.status === 'failed' ? 'x' : 'clock')
      })));
      this.byAgent = ko.pureComputed(() => {
        const colors = ['#2563eb', '#16a34a', '#7c3aed', '#f59e0b', '#db2777', '#0891b2'];
        const total = this.runs().length || 1;
        let at = 0;
        const parts = Object.keys(AGENTS).map((k, i) => ({ label: AGENTS[k].name, n: this.runs().filter((r) => r.agent === k).length, color: colors[i] })).filter((p) => p.n);
        const stops = parts.map((p) => { const from = at; at += 100 * p.n / total; return p.color + ' ' + from + '% ' + at + '%'; });
        return {
          total: this.runs().length, parts: parts.map((p) => Object.assign(p, { dot: { background: p.color }, text: p.n + ' (' + Math.round(100 * p.n / total) + '%)' })),
          style: { background: stops.length ? 'conic-gradient(' + stops.join(', ') + ')' : '#e5eaf1' }
        };
      });
      this.modelNote = ko.pureComputed(() => 'Model in use now: ' + model() + '; code search: ' + embedding() + '.');

      this.connected = () => {
        accUtils.announce('Agent Runs page loaded.');
        document.title = 'Agent Runs';
        dashboard.load();
      };
    }

    return AgentsViewModel;
  }
);
