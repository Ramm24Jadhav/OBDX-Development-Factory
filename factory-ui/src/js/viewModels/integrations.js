/*
 * Integrations page: the external systems the factory works with, in one list. Each workspace's SVN repository and
 * Jenkins, and the model servers for writing and for code search. Each can be tested from here; the details show where
 * it points, its configuration, jobs, history and hints, and the recent Jenkins builds. The environment card shows the
 * settings this factory runs with. Credentials stay on the server and are never shown.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/dashboard', '../services/workspaceSelection',
        '../services/ui', '../services/toast', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, dashboard, workspaceSelection, ui, toast) {
    const TYPES = {
      svn: { label: 'Source Control', tone: 'violet', icon: 'branch' },
      jenkins: { label: 'CI / CD', tone: 'warning', icon: 'cog' },
      model: { label: 'Model Provider', tone: 'primary', icon: 'chip' },
      other: { label: 'Other Tools', tone: 'neutral', icon: 'plug' }
    };
    const HEALTH_ICON = { svn: 'branch', jenkins: 'rocket', model: 'chip', other: 'plug' };
    const HEALTH_TONE = { svn: 'violet', jenkins: 'danger', model: 'primary', other: 'neutral' };
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const copy = (text) => { if (text) { ui.copy(text).then(() => toast.success('Server URL copied.')).catch(() => toast.error('The browser did not allow copying. Select the URL in the details and copy it.')); } };
    // Integration states in the shared status categories (ui.status), with this page's words
    const STATE = {
      connected: ui.status('PASSED', 'Connected'), configured: ui.status('NOT_CHECKED', 'Configured'),
      issue: ui.status('WARNING', 'Connection Issue'), inactive: ui.status('CLOSED', 'Inactive')
    };
    // Long URLs and paths keep their start and end
    const middle = (text, max) => (!text || text.length <= max ? text : text.slice(0, Math.ceil(max * 0.45)) + '…' + text.slice(-Math.floor(max * 0.55)));
    // Hyphens in names do not break lines
    const keep = (text) => (text || '').replace(/-/g, '‑');

    const buildRow = (b) => ({
      number: b.buildNumber ? '#' + b.buildNumber : '–', branch: b.branchUrl ? b.branchUrl.split('/').slice(-2).join('/') : 'patch', at: b.startedAt,
      pill: b.result === 'SUCCESS' ? ui.status('SUCCEEDED', 'Success') : (b.result === 'RUNNING' || b.result === 'QUEUED' || !b.result) ? ui.status(b.result || 'RUNNING', b.result === 'QUEUED' ? 'Queued' : 'Running') : ui.status('FAILED'),
      started: ui.when(b.startedAt), duration: dashboard.duration(b.startedAt, b.finishedAt) || '–'
    });

    function IntegrationsViewModel() {
      this.errorMessage = ko.observable('');
      this.isAdmin = session.isAdmin;
      const jenkins = ko.observable({});
      const version = ko.observable(null);
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
            environment: w.obdxVersion, envLabel: 'OBDX version', target: w.svnUrl || 'Not set', lastAt: job ? (job.finishedAt || job.createdAt) : null,
            baseState: !w.svnUrl ? 'inactive' : job && job.status === 'FAILED' ? 'issue' : job ? 'connected' : 'configured',
            auth: w.svnUsername ? 'User ' + w.svnUsername + (w.svnPasswordSet ? ' (password stored)' : '') : 'No login',
            test: () => api.post('workspaces/' + w.id + '/svn/test').then((r) => setTest('svn-' + w.id, true, 'Connected, latest revision r' + r.headRevision))
              .catch((e) => setTest('svn-' + w.id, false, e.message)),
            builds: [], open: 'code', jobList: [],
            config: [{ k: 'Repository', v: w.svnUrl || 'Not set' }, { k: 'User', v: w.svnUsername || 'None' }, { k: 'Password', v: w.svnPasswordSet ? 'Stored (encrypted)' : 'Not stored' },
              { k: 'Indexed revision', v: w.indexedRevision !== null && w.indexedRevision !== undefined ? 'r' + w.indexedRevision : 'Not indexed yet' }, { k: 'OBDX version', v: w.obdxVersion }],
            history: d.imports.slice(0, 8).map((j) => ({
              text: 'Import ' + j.status.toLowerCase() + (j.toRevision ? ' at r' + j.toRevision : '') + (j.message ? ': ' + j.message : ''), when: ui.when(j.finishedAt || j.startedAt || j.createdAt),
              dot: 'factory-in-hdot factory-dot-' + (j.status === 'SUCCEEDED' ? 'green' : j.status === 'FAILED' ? 'red' : 'blue')
            })),
            tips: ['Test Connection runs "svn info" on the repository from the factory\'s computer.',
              'If it fails with a certificate error, ask the installer to set FACTORY_SVN_TRUST_UNKNOWN_CA or add the bank\'s CA.',
              'Saving an SVN password needs FACTORY_SECRET_KEY in the factory settings.', 'Change the repository, user or password on the Code page.']
          });
          const j = jenkins()[w.id];
          const builds = d.builds.slice().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
          list.push({
            key: 'jenkins-' + w.id, type: 'jenkins', name: 'Jenkins CI', workspace: w.name, workspaceId: w.id, description: 'Build and test pipeline of ' + w.name,
            envLabel: 'Builds', environment: j ? (j.mode === 'BRANCH' ? 'Branch builds' : 'Patch builds') : '–', target: j ? j.url : 'Not set up',
            lastAt: builds.length ? builds[0].finishedAt || builds[0].startedAt : null,
            baseState: !j ? 'inactive' : d.builds.some((b) => b.result && b.result !== 'SUCCESS' && b.result !== 'RUNNING' && b.result !== 'QUEUED') ? 'issue' : 'configured',
            auth: j ? (j.username ? 'User ' + j.username + (j.tokenSet ? ' (API token stored)' : '') : 'No login') : '–',
            jobList: j && j.jobs ? String(j.jobs).split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : [],
            test: j ? () => api.post('workspaces/' + w.id + '/jenkins/test').then((r) => setTest('jenkins-' + w.id, !r.warnings.length, 'Jobs: ' + r.jobs.map((x) => x.name).join(', ') + (r.warnings.length ? '. ' + r.warnings.join(' ') : '')))
              .catch((e) => setTest('jenkins-' + w.id, false, e.message)) : null,
            builds: builds, open: 'code',
            config: j ? [{ k: 'Jenkins URL', v: j.url }, { k: 'Jobs', v: j.jobs || 'None' }, { k: 'Builds', v: j.mode === 'BRANCH' ? 'Branch builds' : 'Patch builds' },
              { k: 'User', v: j.username || 'None' }, { k: 'API token', v: j.tokenSet ? 'Stored (encrypted)' : 'Not stored' }] : [{ k: 'Jenkins', v: 'Not set up for this workspace' }],
            history: builds.slice(0, 8).map((b) => ({ text: (b.buildNumber ? '#' + b.buildNumber + ' ' : '') + (b.job || 'build') + ': ' + (b.result || 'running').toLowerCase(), when: ui.when(b.startedAt),
              dot: 'factory-in-hdot factory-dot-' + (b.result === 'SUCCESS' ? 'green' : !b.result || b.result === 'RUNNING' || b.result === 'QUEUED' ? 'blue' : 'red') })),
            tips: j ? ['Test Connection asks Jenkins for the jobs and lists any problems it finds.',
              'A 401 or 403 means the user or API token is wrong; create a new token in Jenkins under the user\'s settings.',
              'Branch builds need the job to accept the branch parameter set on the Code page.']
              : ['Jenkins is not set up for ' + w.name + '. Add the Jenkins URL, jobs and an API token on the Code page.']
          });
        });
        const m = dashboard.model();
        if (m) {
          const modelTips = ['Test Connection lists the models on the server (administrators only).', 'For Ollama, check that it runs and the model is pulled ("ollama list").',
            'Change the server, models and API key on the Models page.'];
          list.push({
            key: 'model-chat', type: 'model', name: 'Model Server', workspace: 'All workspaces', description: 'Writing specs, designs and code: ' + m.chatModel,
            envLabel: 'Used by', environment: 'All workspaces', target: m.baseUrl, lastAt: m.updatedAt, baseState: 'configured', auth: m.apiKeySet ? 'API key stored' : 'No API key',
            test: this.isAdmin() ? () => api.post('model/servers/models', { baseUrl: m.baseUrl, apiKey: null }).then((r) => setTest('model-chat', true, r.length + ' models available'))
              .catch((e) => setTest('model-chat', false, e.message)) : null,
            builds: [], open: 'models', jobList: [],
            config: [{ k: 'Server', v: m.baseUrl }, { k: 'Chat model', v: m.chatModel }, { k: 'API key', v: m.apiKeySet ? 'Stored (encrypted)' : 'None' }, { k: 'Saved by', v: m.updatedBy || '–' }],
            history: m.updatedAt ? [{ text: 'Settings saved by ' + (m.updatedBy || 'someone'), when: ui.when(m.updatedAt), dot: 'factory-in-hdot factory-dot-blue' }] : [],
            tips: modelTips
          });
          if (m.embeddingBaseUrl) {
            list.push({
              key: 'model-embed', type: 'model', name: 'Code Search Server', workspace: 'All workspaces', description: 'Embeddings for code search: ' + m.embeddingModel,
              envLabel: 'Used by', environment: 'All workspaces', target: m.embeddingBaseUrl, lastAt: m.updatedAt, baseState: 'configured', auth: m.embeddingApiKeySet ? 'API key stored' : 'No API key',
              test: this.isAdmin() ? () => api.post('model/servers/models', { baseUrl: m.embeddingBaseUrl, apiKey: null }).then((r) => setTest('model-embed', true, r.length + ' models available'))
                .catch((e) => setTest('model-embed', false, e.message)) : null,
              builds: [], open: 'models', jobList: [],
              config: [{ k: 'Server', v: m.embeddingBaseUrl }, { k: 'Embedding model', v: m.embeddingModel }, { k: 'API key', v: m.embeddingApiKeySet ? 'Stored (encrypted)' : 'None' }],
              history: [], tips: modelTips
            });
          }
        }
        return list.map((i) => {
          const t = tests()[i.key];
          const state = t ? (t.ok ? 'connected' : 'issue') : i.baseState;
          const type = TYPES[i.type];
          return Object.assign(i, {
            state: state, typeLabel: type.label, typeCss: 'fx-badge fx-badge--plain' + (type.tone === 'neutral' ? '' : ' fx-badge--' + type.tone),
            iconCss: 'fx-kpi-icon factory-in-logo factory-in-tone-' + type.tone, iconClass: 'factory-nav-icon factory-ico-' + type.icon,
            pill: STATE[state],
            last: t ? ui.when(t.at) : (i.lastAt ? ui.when(i.lastAt) : '–'), testText: t ? t.text : '',
            descText: keep(i.description), wsShort: i.workspace === 'All workspaces' ? 'All' : keep(i.workspace),
            targetShort: middle(i.target, 40), targetWrap: middle(i.target, 70), hasTarget: !!i.target && i.target !== 'Not set' && i.target !== 'Not set up',
            history: (t ? [{ text: 'Test on this page: ' + (t.ok ? 'connected' : 'failed') + '. ' + t.text, when: ui.when(t.at), dot: 'factory-in-hdot factory-dot-' + (t.ok ? 'green' : 'red') }] : []).concat(i.history)
          });
        });
      });

      const count = (s) => this.items().filter((i) => i.state === s).length;
      this.kpis = ko.pureComputed(() => {
        const total = this.items().length || 1;
        const active = count('connected') + count('configured');
        const issue = this.items().find((i) => i.state === 'issue');
        return [
          { label: 'Total Integrations', value: this.items().length, sub: dashboard.data().length + ' workspaces', tone: 'primary', icon: 'link' },
          { label: 'Active', value: active, sub: Math.round(100 * active / total) + '% of total', tone: 'success', icon: 'check' },
          { label: 'Inactive', value: count('inactive'), sub: Math.round(100 * count('inactive') / total) + '% of total', tone: 'danger', icon: 'x', open: () => this.showStatus('inactive') },
          { label: 'Needs Attention', value: count('issue'), sub: issue ? issue.name + ': ' + issue.workspace : 'Nothing', css: 'factory-in-kpisub' + (issue ? ' factory-in-kpiwarn' : ''), tone: 'warning', icon: 'clock',
            open: issue ? () => this.showStatus('issue') : null },
          { label: 'Environments', value: 1, sub: 'This factory', tone: 'violet', icon: 'cog', open: () => this.tab('environments') }
        ].map((k) => Object.assign(k, {
          iconCss: 'fx-kpi-icon factory-in-tone-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon, css: k.css || 'factory-in-kpisub', open: k.open || null
        }));
      });

      // Tabs, filters, selection and pages
      this.tab = ko.observable('all');
      this.tabs = ui.tabs(this.tab, [
        { value: 'all', label: 'All Integrations', icon: 'plug' }, { value: 'svn', label: 'Source Control', icon: 'branch' },
        { value: 'jenkins', label: 'CI / CD', icon: 'rocket' }, { value: 'model', label: 'Model Providers', icon: 'chip' },
        { value: 'environments', label: 'Environments', icon: 'cube' }, { value: 'other', label: 'Other Tools', icon: 'cog' }
      ]);
      this.tab.subscribe((t) => {
        if (t === 'environments') {
          const el = document.getElementById('environmentConfig');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
      this.search = ko.observable('');
      this.statusFilter = ko.observable('');
      this.typeFilter = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.statusChange = ui.value(this.statusFilter);
      this.typeChange = ui.value(this.typeFilter);
      this.resetFilters = () => {
        ['intSearch', 'intType', 'intStatus'].forEach((id) => { const el = document.getElementById(id); if (el) { el.value = ''; } });
        this.search(''); this.statusFilter(''); this.typeFilter(''); this.tab('all');
      };
      this.visible = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        return this.items().filter((i) => (this.tab() === 'all' || this.tab() === 'environments' || i.type === this.tab())
          && (!this.typeFilter() || i.type === this.typeFilter())
          && (!this.statusFilter() || i.state === this.statusFilter()) && (!text || (i.name + ' ' + i.typeLabel + ' ' + i.workspace + ' ' + i.target).toLowerCase().indexOf(text) >= 0));
      });
      this.emptyText = ko.pureComputed(() => (this.tab() === 'other' || this.typeFilter() === 'other'
        ? 'The factory does not connect other tools (code quality, chat notifications) yet.' : 'No integrations match.'));
      this.pager = ui.pages(this.visible, 10, [10, 25, 50]);
      this.checked = ko.observableArray([]);
      this.allSelected = ko.pureComputed(() => this.pager.rows().length > 0 && this.pager.rows().every((i) => this.checked.indexOf(i.key) >= 0));
      this.toggleAll = (event) => {
        const keys = this.pager.rows().map((i) => i.key);
        this.checked(event.target.checked ? Array.from(new Set(this.checked().concat(keys))) : this.checked().filter((k) => keys.indexOf(k) < 0));
      };
      this.selectedText = ko.pureComputed(() => (this.checked().length ? ' · ' + this.checked().length + ' selected' : ''));
      this.selectedKey = ko.observable(null);
      this.detailTab = ko.observable('overview');
      this.detailTabs = ui.tabs(this.detailTab, [
        { value: 'overview', label: 'Overview' }, { value: 'config', label: 'Configuration' }, { value: 'jobs', label: 'Build Jobs' },
        { value: 'history', label: 'History' }, { value: 'troubleshooting', label: 'Troubleshooting' }
      ]);
      const pick = (key) => { this.selectedKey(key); this.detailTab('overview'); };
      this.testing = ko.observable(false);
      this.testCss = ko.pureComputed(() => 'fx-btn fx-btn--primary fx-btn--block' + (this.testing() ? ' is-loading' : ''));
      const test = (i) => {
        if (i && i.test) {
          this.testing(true);
          i.test().then(() => {
            const result = tests()[i.key];
            if (result && result.ok) {
              toast.success(i.name + ' (' + i.workspace + '): ' + result.text);
            } else if (result) {
              toast.error(i.name + ' (' + i.workspace + '): the test failed. See the details for what to check.');
            }
          }).finally(() => this.testing(false));
        }
      };
      const edit = (i) => {
        if (i) {
          if (i.workspaceId) {
            workspaceSelection.selectedId(i.workspaceId);
          }
          navigate(i.open);
        }
      };
      this.rows = ko.pureComputed(() => this.pager.rows().map((i, index) => {
        const menu = ui.menu();
        return Object.assign({}, i, {
          // Its own computed, so selecting, checking or moving the keyboard cursor does not redraw the rows (and lose focus)
          css: ko.pureComputed(() => (this.selected() && this.selected().key === i.key ? 'factory-clickable is-selected' : 'factory-clickable')
            + (this.checked.indexOf(i.key) >= 0 ? ' factory-in-checked' : '') + (this.keys.cursor() === index ? ' is-cursor' : '')),
          focus: () => { this.keys.cursor(index); return true; },
          pick: () => pick(i.key),
          isSelected: ko.pureComputed(() => this.checked.indexOf(i.key) >= 0),
          toggle: (event) => { if (event.target.checked) { this.checked.push(i.key); } else { this.checked.remove(i.key); } return true; },
          stop: (event) => { event.stopPropagation(); return true; },
          menu: menu,
          doDetails: () => { menu.close(); pick(i.key); },
          doTest: () => { menu.close(); pick(i.key); test(i); },
          doEdit: () => { menu.close(); edit(i); },
          doCopy: () => { menu.close(); copy(i.target); }
        });
      }));
      // Keyboard: arrows or J/K move, Enter shows the details, X selects
      this.keys = ui.tableKeys(this.rows, {
        open: (row) => row.pick(),
        toggle: (row) => { if (this.checked.indexOf(row.key) >= 0) { this.checked.remove(row.key); } else { this.checked.push(row.key); } }
      });
      // Bulk bar: copy the server URLs of the selected integrations, or clear the selection
      this.clearChecked = () => this.checked([]);
      this.copyUrls = () => {
        const urls = this.items().filter((i) => this.checked.indexOf(i.key) >= 0 && i.hasTarget).map((i) => i.target).filter((u, n, list) => list.indexOf(u) === n);
        if (!urls.length) {
          toast.info('None of the selected integrations has a server URL.');
          return;
        }
        ui.copy(urls.join('\n')).then(() => toast.success(urls.length + (urls.length === 1 ? ' server URL' : ' server URLs') + ' copied.'))
          .catch(() => toast.error('The browser did not allow copying. Select the URL in the details and copy it.'));
      };
      this.selected = ko.pureComputed(() => this.items().find((i) => i.key === this.selectedKey()) || this.items().find((i) => i.state === 'issue') || this.items()[0] || null);
      this.testSelected = () => test(this.selected());
      this.editSelected = () => edit(this.selected());
      const detailAction = (menu) => (value) => () => {
        menu.close();
        if (value === 'copy') {
          copy(this.selected() && this.selected().target);
        } else if (value === 'edit') {
          this.editSelected();
        } else {
          this.detailTab(value);
        }
      };
      this.headMenu = ui.menu();
      this.moreMenu = ui.menu();
      const headDo = detailAction(this.headMenu);
      const moreDo = detailAction(this.moreMenu);
      this.headDo = { copy: headDo('copy'), edit: headDo('edit'), troubleshooting: headDo('troubleshooting') };
      this.moreDo = { copy: moreDo('copy'), history: moreDo('history'), troubleshooting: moreDo('troubleshooting') };

      // Recent Jenkins builds: of the selected workspace, or of every workspace for shared integrations
      this.builds = ko.pureComputed(() => {
        const i = this.selected();
        const list = [].concat.apply([], dashboard.data().filter((d) => !i || !i.workspaceId || d.workspace.id === i.workspaceId).map((d) => d.builds));
        return list.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, 5).map(buildRow);
      });
      this.buildsEmpty = ko.pureComputed(() => {
        const i = this.selected();
        if (i && i.workspaceId && !jenkins()[i.workspaceId]) {
          return 'No builds: Jenkins is not set up for ' + i.workspace + '. Add it on the Code page.';
        }
        return 'No Jenkins builds yet. Builds run when a change is sent to Jenkins on the Build and Test page.';
      });
      this.viewBuilds = () => { const i = this.selected(); if (i && i.workspaceId) { workspaceSelection.selectedId(i.workspaceId); } navigate('build'); };

      // Integration health by kind
      this.health = ko.pureComputed(() => Object.keys(TYPES).map((t) => {
        const list = this.items().filter((i) => i.type === t);
        const ok = list.filter((i) => i.state === 'connected' || i.state === 'configured').length;
        const pct = list.length ? Math.round(100 * ok / list.length) : 0;
        return {
          name: TYPES[t].label, text: ok + ' / ' + list.length, pct: list.length ? pct + '%' : '–', style: { width: pct + '%' }, value: pct,
          barCss: 'fx-progress factory-in-hbar' + (!list.length ? '' : pct >= 100 ? ' fx-progress--success' : pct >= 50 ? ' fx-progress--warning' : ' fx-progress--danger'),
          iconCss: 'factory-in-hicon factory-in-tone-' + HEALTH_TONE[t], iconClass: 'factory-nav-icon factory-ico-' + HEALTH_ICON[t]
        };
      }));
      this.showStatus = (status) => { this.resetFilters(); this.statusFilter(status); const el = document.getElementById('intStatus'); if (el) { el.value = status; } };
      this.healthDetails = () => this.showStatus('inactive');

      // The environment this factory runs with
      this.envRows = ko.pureComputed(() => {
        const m = dashboard.model();
        const c = session.config();
        const v = version();
        const rows = [];
        if (m) {
          rows.push({ name: 'FACTORY_MODEL_BASE_URL', value: m.baseUrl, text: 'Model server for specs, designs and code' + (m.saved ? ' (saved on the Models page)' : '') });
          rows.push({ name: 'FACTORY_MODEL_CHAT', value: m.chatModel, text: 'Model that writes' });
          rows.push({ name: 'FACTORY_MODEL_EMBEDDING', value: m.embeddingModel, text: 'Model for code search' });
          rows.push({ name: 'FACTORY_MODEL_EMBEDDING_BASE_URL', value: m.embeddingBaseUrl || 'Same as the model server', text: 'Server for code search' });
        }
        rows.push({ name: 'FACTORY_AUTH_MODE', value: c ? c.mode : '–', text: 'How people sign in' });
        if (v) {
          rows.push({ name: 'FACTORY_UPDATES', value: v.enabled ? 'true' : 'false', text: 'Check for and install newer builds' });
          rows.push({ name: 'Version', value: v.version + ' (build ' + v.build + ')', text: 'The factory build running now' });
        }
        rows.push({ name: 'Workspaces', value: String(dashboard.data().length), text: 'Each with its own SVN and Jenkins settings' });
        return rows;
      });
      this.editEnvironment = () => navigate('models');
      this.viewEnvironment = () => navigate('about');

      // Add Integration
      this.addDefault = () => navigate('code');
      this.addMenu = ui.menu();
      const addTo = (page) => () => { this.addMenu.close(); navigate(page); };
      this.addDo = { svn: addTo('code'), jenkins: addTo('code'), model: addTo('models') };

      this.connected = () => {
        accUtils.announce('Integrations page loaded.');
        document.title = 'Integrations';
        api.get('update').then(version).catch(() => null);
        dashboard.load().then((entries) => Promise.all(entries.map((d) => api.get('workspaces/' + d.workspace.id + '/jenkins').then((j) => ({ id: d.workspace.id, j: j })).catch(() => ({ id: d.workspace.id, j: null })))))
          .then((list) => { const map = {}; list.forEach((x) => { if (x.j) { map[x.id] = x.j; } }); jenkins(map); })
          .catch((e) => this.errorMessage(e.message));
      };
    }

    return IntegrationsViewModel;
  }
);
