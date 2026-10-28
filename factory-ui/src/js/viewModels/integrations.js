/*
 * Integrations page: the external systems the factory works with, in one list. Each workspace's SVN repository and
 * Jenkins, and the model servers for writing and for code search. Each can be tested from here; the details show where
 * it points, its last result and, for Jenkins, its recent builds. Credentials stay on the server and are never shown.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/dashboard', '../services/workspaceSelection',
        '../services/ui', 'ojs/ojknockout', 'ojs/ojbutton'],
  function (ko, accUtils, api, session, dashboard, workspaceSelection, ui) {
    const TYPES = {
      svn: { label: 'Source Control', tone: 'violet', icon: 'branch' },
      jenkins: { label: 'CI / CD', tone: 'red', icon: 'cog' },
      model: { label: 'Model Provider', tone: 'blue', icon: 'chip' }
    };

    function IntegrationsViewModel() {
      this.errorMessage = ko.observable('');
      this.isAdmin = session.isAdmin;
      const jenkins = ko.observable({});
      // Results of tests run on this page: key -> {ok, text, at}
      const tests = ko.observable({});
      const setTest = (key, ok, text) => { const t = Object.assign({}, tests()); t[key] = { ok: ok, text: text, at: new Date().toISOString() }; tests(t); };

      this.items = ko.pureComputed(() => {
        const list = [];
        dashboard.data().forEach((d) => {
          const w = d.workspace;
          const job = d.imports.find((j) => j.status === 'SUCCEEDED' || j.status === 'FAILED');
          list.push({
            key: 'svn-' + w.id, type: 'svn', name: 'SVN Repository', workspace: w.name, workspaceId: w.id, description: 'OBDX source of ' + w.name,
            environment: w.obdxVersion, target: w.svnUrl || 'Not set', lastAt: job ? (job.finishedAt || job.createdAt) : null,
            baseState: !w.svnUrl ? 'inactive' : job && job.status === 'FAILED' ? 'issue' : job ? 'connected' : 'configured',
            auth: w.svnUsername ? 'User ' + w.svnUsername + (w.svnPasswordSet ? ' (password stored)' : '') : 'No login',
            test: () => api.post('workspaces/' + w.id + '/svn/test').then((r) => setTest('svn-' + w.id, true, 'Connected, latest revision r' + r.headRevision))
              .catch((e) => setTest('svn-' + w.id, false, e.message)),
            builds: [], open: 'code'
          });
          const j = jenkins()[w.id];
          list.push({
            key: 'jenkins-' + w.id, type: 'jenkins', name: 'Jenkins CI', workspace: w.name, workspaceId: w.id, description: 'Build and test pipeline of ' + w.name,
            environment: j ? (j.mode === 'BRANCH' ? 'Branch builds' : 'Patch builds') : '–', target: j ? j.url : 'Not set up',
            lastAt: d.builds.length ? d.builds.map((b) => b.finishedAt || b.startedAt).sort().pop() : null,
            baseState: !j ? 'inactive' : d.builds.some((b) => b.result && b.result !== 'SUCCESS' && b.result !== 'RUNNING' && b.result !== 'QUEUED') ? 'issue' : 'configured',
            auth: j ? (j.username ? 'User ' + j.username + (j.tokenSet ? ' (API token stored)' : '') : 'No login') : '–', jobs: j ? j.jobs : '',
            test: j ? () => api.post('workspaces/' + w.id + '/jenkins/test').then((r) => setTest('jenkins-' + w.id, !r.warnings.length, 'Jobs: ' + r.jobs.map((x) => x.name).join(', ') + (r.warnings.length ? '. ' + r.warnings.join(' ') : '')))
              .catch((e) => setTest('jenkins-' + w.id, false, e.message)) : null,
            builds: d.builds.slice().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, 5).map((b) => ({
              number: b.buildNumber ? '#' + b.buildNumber : '–', branch: b.branchUrl ? b.branchUrl.split('/').slice(-2).join('/') : 'patch',
              pill: b.result === 'SUCCESS' ? ui.pill('Success', 'green') : (b.result === 'RUNNING' || b.result === 'QUEUED') ? ui.pill('Running', 'blue') : ui.pill('Failed', 'red'),
              started: ui.when(b.startedAt), duration: dashboard.duration(b.startedAt, b.finishedAt)
            })), open: 'code'
          });
        });
        const m = dashboard.model();
        if (m) {
          list.push({
            key: 'model-chat', type: 'model', name: 'Model Server', workspace: 'All workspaces', description: 'Writing specs, designs and code: ' + m.chatModel,
            environment: 'All', target: m.baseUrl, lastAt: m.updatedAt, baseState: 'configured', auth: m.apiKeySet ? 'API key stored' : 'No API key',
            test: this.isAdmin() ? () => api.post('model/servers/models', { baseUrl: m.baseUrl, apiKey: null }).then((r) => setTest('model-chat', true, r.length + ' models available'))
              .catch((e) => setTest('model-chat', false, e.message)) : null,
            builds: [], open: 'models'
          });
          if (m.embeddingBaseUrl) {
            list.push({
              key: 'model-embed', type: 'model', name: 'Code Search Server', workspace: 'All workspaces', description: 'Embeddings for code search: ' + m.embeddingModel,
              environment: 'All', target: m.embeddingBaseUrl, lastAt: m.updatedAt, baseState: 'configured', auth: m.embeddingApiKeySet ? 'API key stored' : 'No API key',
              test: this.isAdmin() ? () => api.post('model/servers/models', { baseUrl: m.embeddingBaseUrl, apiKey: null }).then((r) => setTest('model-embed', true, r.length + ' models available'))
                .catch((e) => setTest('model-embed', false, e.message)) : null,
              builds: [], open: 'models'
            });
          }
        }
        return list.map((i) => {
          const t = tests()[i.key];
          const state = t ? (t.ok ? 'connected' : 'issue') : i.baseState;
          const type = TYPES[i.type];
          return Object.assign(i, {
            state: state, typeLabel: type.label, typeCss: 'factory-ov-pill factory-ov-pill-' + type.tone,
            iconCss: 'factory-kpi-icon factory-in-logo factory-ov2-icon-' + type.tone, iconClass: 'factory-nav-icon factory-ico-' + type.icon,
            pill: state === 'connected' ? ui.pill('Connected', 'green') : state === 'configured' ? ui.pill('Configured', 'blue') : state === 'issue' ? ui.pill('Connection Issue', 'amber') : ui.pill('Inactive', 'grey'),
            last: t ? ui.when(t.at) : (i.lastAt ? ui.when(i.lastAt) : '–'), testText: t ? t.text : ''
          });
        });
      });

      const count = (s) => this.items().filter((i) => i.state === s).length;
      this.kpis = ko.pureComputed(() => {
        const total = this.items().length || 1;
        const active = count('connected') + count('configured');
        const issue = this.items().find((i) => i.state === 'issue');
        return [
          { label: 'Total Integrations', value: this.items().length, sub: dashboard.data().length + ' workspaces', css: 'factory-kpi-sub', tone: 'blue', icon: 'link' },
          { label: 'Active', value: active, sub: Math.round(100 * active / total) + '% of total', css: 'factory-kpi-sub', tone: 'green', icon: 'check' },
          { label: 'Inactive', value: count('inactive'), sub: Math.round(100 * count('inactive') / total) + '% of total', css: 'factory-kpi-sub', tone: 'red', icon: 'x' },
          { label: 'Needs Attention', value: count('issue'), sub: issue ? issue.name + ': ' + issue.workspace : 'Nothing', css: 'factory-kpi-sub factory-warn', tone: 'amber', icon: 'clock' },
          { label: 'Environments', value: 1, sub: 'This factory', css: 'factory-kpi-sub', tone: 'violet', icon: 'cog' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });

      this.tab = ko.observable('all');
      this.tabs = ui.tabs(this.tab, [
        { value: 'all', label: 'All Integrations', icon: 'plug' }, { value: 'svn', label: 'Source Control', icon: 'branch' },
        { value: 'jenkins', label: 'CI / CD', icon: 'cog' }, { value: 'model', label: 'Model Providers', icon: 'chip' }, { value: 'environments', label: 'Environments', icon: 'cube' }
      ]);
      this.search = ko.observable('');
      this.statusFilter = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.statusChange = ui.value(this.statusFilter);
      this.visible = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        return this.items().filter((i) => (this.tab() === 'all' || this.tab() === 'environments' || i.type === this.tab())
          && (!this.statusFilter() || i.state === this.statusFilter()) && (!text || (i.name + ' ' + i.workspace + ' ' + i.target).toLowerCase().indexOf(text) >= 0));
      });
      this.selectedKey = ko.observable(null);
      this.rows = ko.pureComputed(() => this.visible().map((i) => Object.assign({}, i, {
        css: this.selected() && this.selected().key === i.key ? 'factory-clickable factory-row-sel' : 'factory-clickable', pick: () => this.selectedKey(i.key)
      })));
      this.selected = ko.pureComputed(() => this.items().find((i) => i.key === this.selectedKey()) || this.items().find((i) => i.state === 'issue') || this.items()[0] || null);
      this.testing = ko.observable(false);
      this.testSelected = () => {
        const i = this.selected();
        if (i && i.test) {
          this.testing(true);
          i.test().finally(() => this.testing(false));
        }
      };
      this.editSelected = () => {
        const i = this.selected();
        if (i) {
          if (i.workspaceId) {
            workspaceSelection.selectedId(i.workspaceId);
          }
          window.dispatchEvent(new CustomEvent('factory-navigate', { detail: i.open }));
        }
      };
      this.health = ko.pureComputed(() => Object.keys(TYPES).map((t) => {
        const list = this.items().filter((i) => i.type === t);
        const ok = list.filter((i) => i.state === 'connected' || i.state === 'configured').length;
        const pct = list.length ? Math.round(100 * ok / list.length) : 0;
        return { name: TYPES[t].label, text: ok + ' / ' + list.length, pct: pct + '%', style: { width: pct + '%' },
          barCss: 'factory-ov2-bar-fill ' + (pct === 100 ? 'factory-ov2-fill-green' : 'factory-ov2-fill-amber') };
      }));

      this.modelServer = ko.pureComputed(() => (dashboard.model() ? dashboard.model().baseUrl + ' (' + dashboard.model().chatModel + ')' : '–'));
      this.embedServer = ko.pureComputed(() => (dashboard.model() ? (dashboard.model().embeddingBaseUrl || dashboard.model().baseUrl) + ' (' + dashboard.model().embeddingModel + ')' : '–'));
      this.workspaceCount = ko.pureComputed(() => dashboard.data().length + ' with their own SVN and Jenkins settings');

      this.connected = () => {
        accUtils.announce('Integrations page loaded.');
        document.title = 'Integrations';
        dashboard.load().then((entries) => Promise.all(entries.map((d) => api.get('workspaces/' + d.workspace.id + '/jenkins').then((j) => ({ id: d.workspace.id, j: j })).catch(() => ({ id: d.workspace.id, j: null })))))
          .then((list) => { const map = {}; list.forEach((x) => { if (x.j) { map[x.id] = x.j; } }); jenkins(map); })
          .catch((e) => this.errorMessage(e.message));
      };
    }

    return IntegrationsViewModel;
  }
);
