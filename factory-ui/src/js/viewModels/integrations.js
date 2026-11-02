/*
 * Integrations page: a catalogue of the external systems the factory connects to. SVN servers and Jenkins servers
 * (grouped by server, with the workspaces that use each), the model servers, sign-in (LDAP or single sign-on) and the
 * release server for updates. Health comes only from results the factory has: connection tests (recorded by the server
 * for SVN and Jenkins, this session's for the model servers), imports from SVN, Jenkins builds, LDAP sign-ins and the
 * update check. Saved settings alone never show as reached. Settings are edited where they live (Code page, Models
 * page); credentials stay on the server and are only ever shown as stored or not.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/dashboard', '../services/workspaceSelection',
        '../services/pageRequests', '../services/ui', '../services/toast', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, dashboard, workspaceSelection, pageRequests, ui, toast) {
    const TYPES = {
      svn: { label: 'SVN', icon: 'branch', tone: 'violet' },
      jenkins: { label: 'Jenkins', icon: 'rocket', tone: 'warning' },
      model: { label: 'Model server', icon: 'chip', tone: 'primary' },
      signin: { label: 'Sign-in', icon: 'shield', tone: 'neutral' },
      updates: { label: 'Updates', icon: 'refresh', tone: 'neutral' }
    };
    // Health words; the status category gives the colour (only a real result is green)
    const HEALTH = {
      ok: ui.status('PASSED', 'Reached'), warning: ui.status('WARNING', 'Warnings'), failed: ui.status('FAILED', 'Failed'),
      partial: ui.status('NOT_CHECKED', 'Partly tested'), untested: ui.status('NOT_CHECKED', 'Not tested'), none: ui.status('NOT_CHECKED', 'Not recorded')
    };
    const ORDER = { failed: 0, warning: 1, partial: 2, untested: 3, none: 4, ok: 5 };
    const BUILD_REACHED = ['SUCCESS', 'FAILURE', 'UNSTABLE', 'ABORTED'];
    const AUDIT_WORDS = {
      WORKSPACE_CREATED: 'Workspace created', SVN_SETTINGS_CHANGED: 'SVN settings changed', JENKINS_SETTINGS_CHANGED: 'Jenkins settings changed'
    };
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const time = (value) => (value ? new Date(value).getTime() : 0);
    const newest = (list) => list.filter(Boolean).sort((a, b) => time(b.at) - time(a.at))[0] || null;
    // A one-line version of a server message; the whole message stays in the row's tooltip
    const first = (text) => { const t = String(text || '').trim().replace(/\s+/g, ' '); return t.length > 140 ? t.slice(0, 139) + '…' : t; };
    // The server part of an SVN URL: workspaces on the same server are one integration. A file: URL is a folder on
    // the factory's own computer, so it stands alone.
    const svnServer = (url) => {
      const m = /^(https?|svn(?:\+ssh)?):\/\/([^/]+)/i.exec(url || '');
      return m ? m[1].toLowerCase() + '://' + m[2].toLowerCase() : url;
    };
    const hostOf = (url) => { const m = /^[a-z+]+:\/\/([^/]+)/i.exec(url || ''); return m && m[1] ? m[1] : 'folder ' + String(url || '').split('/').filter(Boolean).slice(-2).join('/'); };

    /** A connection's health from its newest result; settings changed after it make it untested again. */
    function healthOf(results, changedAt) {
      const last = newest(results);
      if (!last) {
        return { key: 'untested', note: 'No test or sync recorded yet.' };
      }
      if (changedAt && time(changedAt) > time(last.at)) {
        return { key: 'untested', note: 'The settings changed after the last result. Test the connection again.' };
      }
      return { key: last.kind, note: '' };
    }

    function IntegrationsViewModel() {
      this.errorMessage = ko.observable('');
      this.isAdmin = session.isAdmin;
      this.loading = ko.observable(true);
      const jenkins = ko.observable({});
      const activity = ko.observable({});
      const missing = ko.observableArray([]);
      const update = ko.observable(null);
      const lastSignIn = ko.observable(null);
      // Model server tests run on this page (not recorded by the server): key -> {kind, text, at}
      const sessionTests = ko.observable({});
      const setSessionTest = (key, kind, text) => { const t = Object.assign({}, sessionTests()); t[key] = (t[key] || []).concat([{ kind: kind, text: text, at: new Date().toISOString() }]); sessionTests(t); };
      this.testing = ko.observable(false);

      // One workspace's view of its SVN repository or Jenkins: results, tests, activity and what the user may do
      const svnMember = (d) => {
        const w = d.workspace;
        const events = activity()[w.id] || [];
        const tests = events.filter((e) => /^SVN_TEST_/.test(e.action)).map((e) => ({
          at: e.at, kind: e.action === 'SVN_TEST_PASSED' ? 'ok' : 'failed', source: 'Test',
          text: (e.action === 'SVN_TEST_PASSED' ? 'Connected, ' + (e.detail || 'repository read') : first(e.detail) || 'Connection failed'), full: e.detail, by: e.username
        }));
        const imports = d.imports.filter((j) => j.status === 'SUCCEEDED' || j.status === 'FAILED').map((j) => ({
          at: j.finishedAt || j.createdAt, kind: j.status === 'SUCCEEDED' ? 'ok' : 'failed', source: 'Import',
          text: j.status === 'SUCCEEDED' ? 'Imported' + (j.toRevision ? ' revision ' + j.toRevision : '') : first(j.message) || 'Import failed', full: j.message
        }));
        const changed = newest(events.filter((e) => e.action === 'SVN_SETTINGS_CHANGED'));
        return {
          workspace: w.name, workspaceId: w.id, target: w.svnUrl, results: tests.concat(imports), tests: tests, changedAt: changed ? changed.at : null,
          canTest: session.can(w.id, 'MANAGE_CODE'), testPath: 'workspaces/' + w.id + '/svn/test',
          settings: [{ k: 'Repository', v: w.svnUrl }, { k: 'OBDX version', v: w.obdxVersion },
            { k: 'Indexed revision', v: w.indexedRevision !== null && w.indexedRevision !== undefined ? 'r' + w.indexedRevision : 'Not indexed yet' }],
          auth: [{ k: 'User', v: w.svnUsername || 'None' }, { k: 'Password', v: w.svnPasswordSet ? 'Stored (encrypted)' : 'Not stored' }],
          activity: events.filter((e) => !/^(SVN|JENKINS)_TEST_|JENKINS_SETTINGS/.test(e.action)).map((e) => ({ at: e.at, text: AUDIT_WORDS[e.action] || e.action, by: e.username, detail: e.detail }))
            .concat(imports.map((r) => ({ at: r.at, text: r.kind === 'ok' ? r.text : 'Import failed', detail: r.kind === 'ok' ? '' : r.full })))
        };
      };
      const jenkinsMember = (d, j) => {
        const w = d.workspace;
        const events = activity()[w.id] || [];
        const tests = events.filter((e) => /^JENKINS_TEST_/.test(e.action)).map((e) => ({
          at: e.at, kind: e.action === 'JENKINS_TEST_PASSED' ? 'ok' : e.action === 'JENKINS_TEST_WARNING' ? 'warning' : 'failed', source: 'Test',
          text: e.action === 'JENKINS_TEST_FAILED' ? first(e.detail) || 'Connection failed' : 'Connected, ' + first(e.detail), full: e.detail, by: e.username
        }));
        const builds = d.builds.filter((b) => BUILD_REACHED.indexOf(b.result) >= 0 || b.result === 'NOT_BUILT').map((b) => ({
          at: b.finishedAt || b.startedAt, kind: b.result === 'NOT_BUILT' ? 'failed' : 'ok', source: 'Build',
          text: (b.buildNumber ? 'Build #' + b.buildNumber + ' ' : 'Build ') + (b.result === 'NOT_BUILT' ? 'not run: ' + first((b.errors || [])[0] || 'Jenkins was not reached') : 'ran (' + b.result.toLowerCase() + ')'),
          full: b.result === 'NOT_BUILT' ? (b.errors || []).join(' ') : b.changeTitle
        }));
        const changed = newest(events.filter((e) => e.action === 'JENKINS_SETTINGS_CHANGED'));
        return {
          workspace: w.name, workspaceId: w.id, target: j.url, results: tests.concat(builds), tests: tests, changedAt: changed ? changed.at : null,
          canTest: session.can(w.id, 'MANAGE_CODE'), testPath: 'workspaces/' + w.id + '/jenkins/test',
          settings: [{ k: 'Jenkins URL', v: j.url }, { k: 'Jobs', v: j.jobs || 'None' }, { k: 'Builds', v: j.mode === 'BRANCH' ? 'Branch builds' : 'Patch builds' }],
          auth: [{ k: 'User', v: j.username || 'None' }, { k: 'API token', v: j.tokenSet ? 'Stored (encrypted)' : 'Not stored' }],
          activity: events.filter((e) => e.action === 'JENKINS_SETTINGS_CHANGED').map((e) => ({ at: e.at, text: AUDIT_WORDS[e.action], by: e.username, detail: e.detail }))
            .concat(d.builds.map((b) => ({ at: b.startedAt, text: (b.buildNumber ? 'Build #' + b.buildNumber : 'Build') + ' ' + String(b.result || 'running').toLowerCase().replace(/_/g, ' '), detail: b.changeTitle || '' })))
        };
      };

      // Members of one server, as an integration
      const group = (key, type, name, sub, members) => {
        members.forEach((m) => Object.assign(m, healthOf(m.results, m.changedAt)));
        const keys = members.map((m) => m.key);
        const health = keys.indexOf('failed') >= 0 ? 'failed' : keys.indexOf('warning') >= 0 ? 'warning'
          : keys.every((k) => k === 'ok') ? 'ok' : keys.indexOf('ok') >= 0 ? 'partial' : 'untested';
        const all = [].concat.apply([], members.map((m) => m.results.map((r) => Object.assign({ workspace: m.workspace }, r))));
        return {
          key: key, type: type, name: name, sub: sub, members: members, health: health,
          note: members.length === 1 ? members[0].note : '',
          scope: members.length === 1 ? members[0].workspace : members.length + ' workspaces',
          success: newest(all.filter((r) => r.kind !== 'failed')), error: newest(all.filter((r) => r.kind === 'failed')),
          tests: [].concat.apply([], members.map((m) => m.tests.map((t) => Object.assign({ workspace: m.workspace }, t)))),
          activity: [].concat.apply([], members.map((m) => m.activity.map((a) => Object.assign({ workspace: m.workspace }, a)))),
          canTest: members.some((m) => m.canTest), testNote: members.some((m) => m.canTest) ? '' : 'Testing needs the Manage code permission in the workspace.'
        };
      };
      // A factory-wide integration (no workspaces)
      const single = (key, type, name, sub, fields) => {
        const results = fields.results || [];
        const h = fields.health ? { key: fields.health, note: fields.note || '' } : healthOf(results, fields.changedAt);
        return Object.assign({
          key: key, type: type, name: name, sub: sub, members: [], scope: 'Factory', health: h.key, note: h.note,
          success: newest(results.filter((r) => r.kind !== 'failed')), error: newest(results.filter((r) => r.kind === 'failed')),
          tests: [], activity: [], settings: [], auth: [], canTest: false, testNote: ''
        }, fields);
      };

      this.items = ko.pureComputed(() => {
        const list = [];
        const svn = {};
        const jk = {};
        dashboard.data().forEach((d) => {
          const w = d.workspace;
          if (w.svnUrl) {
            const server = svnServer(w.svnUrl);
            (svn[server] = svn[server] || []).push(svnMember(d));
          }
          const j = jenkins()[w.id];
          if (j) {
            const server = j.url.replace(/\/+$/, '').toLowerCase();
            (jk[server] = jk[server] || []).push(jenkinsMember(d, j));
          }
        });
        Object.keys(svn).forEach((s) => list.push(group('svn|' + s, 'svn', 'SVN · ' + hostOf(svn[s][0].target), svn[s].length === 1 ? svn[s][0].target : s, svn[s])));
        Object.keys(jk).forEach((s) => list.push(group('jenkins|' + s, 'jenkins', 'Jenkins · ' + hostOf(jk[s][0].target), jk[s][0].target, jk[s])));

        const m = dashboard.model();
        const tests = sessionTests();
        if (m) {
          const modelItem = (key, name, url, model, keySet) => {
            const results = (tests[key] || []).map((t) => Object.assign({ source: 'Test (this session)' }, t));
            return single(key, 'model', name, url, {
              results: results, tests: results, note: results.length ? '' : 'Model server tests are not recorded. Test it now to see whether it answers.',
              settings: [{ k: 'Server', v: url }, { k: 'Model', v: model }, { k: 'Settings from', v: m.saved ? 'The Models page' : 'The factory settings file' }],
              auth: [{ k: 'API key', v: keySet ? 'Stored (encrypted)' : 'None' }],
              activity: m.updatedAt ? [{ at: m.updatedAt, text: 'Model settings saved', by: m.updatedBy }] : [],
              canTest: this.isAdmin(), testNote: this.isAdmin() ? '' : 'Only administrators can test model servers.', test: () => api.post('model/servers/models', { baseUrl: url, apiKey: null })
                .then((r) => setSessionTest(key, 'ok', 'Connected, ' + r.length + (r.length === 1 ? ' model' : ' models') + ' listed'))
                .catch((e) => setSessionTest(key, 'failed', e.message)),
              open: 'models', openLabel: 'Open Models & AI Providers'
            });
          };
          list.push(modelItem('model-chat', 'Model server', m.baseUrl, m.chatModel, m.apiKeySet));
          if (m.embeddingBaseUrl) {
            list.push(modelItem('model-embed', 'Code search server', m.embeddingBaseUrl, m.embeddingModel, m.embeddingApiKeySet));
          }
        }

        const mode = (session.config() || {}).mode;
        if (mode === 'ldap') {
          const at = lastSignIn() && lastSignIn().at;
          list.push(single('signin', 'signin', 'Directory (LDAP)', 'Sign-in through the factory\'s form', {
            results: at ? [{ at: at, kind: 'ok', source: 'Sign-in', text: 'Someone signed in through LDAP' }] : [],
            note: at ? '' : this.isAdmin() ? 'No LDAP sign-in recorded yet. The factory has no LDAP test; a sign-in shows it works.' : 'Only administrators see sign-in results.',
            settings: [{ k: 'Mode', v: 'LDAP' }, { k: 'Where it is set', v: 'The factory settings file (set by whoever installs it)' }],
            auth: [{ k: 'Directory login', v: 'Kept in the factory settings file, never shown here' }]
          }));
        } else if (mode === 'oidc' || mode === 'saml') {
          list.push(single('signin', 'signin', 'Single sign-on (' + mode.toUpperCase() + ')', 'Sign-in through the bank\'s identity provider', {
            health: 'none', note: 'Single sign-on sign-ins are not recorded and cannot be tested from here. Sign in with it to check it works.',
            settings: [{ k: 'Mode', v: mode.toUpperCase() }, { k: 'Where it is set', v: 'The factory settings file (set by whoever installs it)' }],
            auth: [{ k: 'Client secret or certificate', v: 'Kept in the factory settings file, never shown here' }]
          }));
        }

        const u = update();
        if (u && u.enabled) {
          const checked = u.checkedAt ? [{ at: u.checkedAt, kind: u.state === 'FAILED' ? 'failed' : 'ok', source: 'Update check', text: u.state === 'FAILED' ? first(u.message) : u.message || 'Release server answered', full: u.message }] : [];
          list.push(single('updates', 'updates', 'Release server', 'Newer factory builds', {
            results: checked, tests: checked,
            settings: [{ k: 'Running', v: (u.version || '–') + ' (build ' + (u.build || '–') + ')' }, { k: 'Latest found', v: u.latestBuild ? 'Build ' + u.latestBuild : 'Not known yet' }],
            auth: [{ k: 'Sign-in', v: 'None needed' }],
            canTest: this.isAdmin(), testNote: this.isAdmin() ? '' : 'Only administrators can check for updates.',
            test: () => api.get('update?check=true').then(update).catch((e) => toast.error(e.message)), open: 'about', openLabel: 'Open About'
          }));
        }

        return list.map((i) => {
          const type = TYPES[i.type];
          return Object.assign(i, {
            typeLabel: type.label, iconCss: 'fx-kpi-icon factory-in-logo factory-in-tone-' + type.tone, iconClass: 'factory-nav-icon factory-ico-' + type.icon,
            pill: HEALTH[i.health],
            successWhen: i.success ? dashboard.ago(i.success.at) : 'Never recorded', successTitle: i.success ? ui.when(i.success.at) : '',
            errorWhen: i.error ? dashboard.ago(i.error.at) : 'None recorded', errorText: i.error ? i.error.text : '', errorTitle: i.error ? ui.when(i.error.at) + ': ' + (i.error.full || i.error.text) : ''
          });
        }).sort((a, b) => ORDER[a.health] - ORDER[b.health]);
      });

      // Notes under the list: what is not connected (only when it applies)
      this.notes = ko.pureComputed(() => {
        const notes = [];
        const noJenkins = dashboard.data().filter((d) => !jenkins()[d.workspace.id] && missing().indexOf(d.workspace.id) < 0);
        if (noJenkins.length && !this.loading()) {
          notes.push({ text: 'Jenkins is not set up for ' + noJenkins.map((d) => d.workspace.name).join(', ') + '.',
            links: noJenkins.map((d) => ({ label: 'Set up for ' + d.workspace.name, go: () => openSettings(d.workspace.id) })) });
        }
        const mode = (session.config() || {}).mode;
        if (mode === 'local') {
          notes.push({ text: 'Sign-in uses the factory\'s own accounts; no directory is connected.', links: [] });
        }
        if (update() && !update().enabled) {
          notes.push({ text: 'Update checks are off on this factory (FACTORY_UPDATES).', links: [] });
        }
        return notes;
      });

      // Search and health filter
      this.search = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.healthFilter = ko.observable('');
      this.healthChange = ui.value(this.healthFilter);
      this.visible = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        const f = this.healthFilter();
        return this.items().filter((i) => (!f || (f === 'attention' ? ['failed', 'warning'].indexOf(i.health) >= 0 : f === 'untested' ? i.health !== 'ok' && i.health !== 'failed' && i.health !== 'warning' : i.health === f))
          && (!text || (i.name + ' ' + i.typeLabel + ' ' + i.sub + ' ' + i.members.map((m) => m.workspace).join(' ')).toLowerCase().indexOf(text) >= 0));
      });
      this.emptyText = ko.pureComputed(() => (this.loading() ? 'Loading integrations…' : this.items().length ? 'No integrations match. Clear the search or the filter.'
        : 'No integrations yet. Connect a code base on the Workspaces page to add its SVN repository.'));

      // Selection and detail
      this.selectedKey = ko.observable(null);
      this.selected = ko.pureComputed(() => this.items().find((i) => i.key === this.selectedKey()) || this.items()[0] || null);
      this.rows = ko.pureComputed(() => this.visible().map((i) => Object.assign({}, i, {
        css: ko.pureComputed(() => 'factory-in-entry' + (this.selected() && this.selected().key === i.key ? ' is-selected' : '')),
        current: ko.pureComputed(() => (this.selected() && this.selected().key === i.key ? 'true' : 'false')),
        pick: () => {
          this.selectedKey(i.key);
          // Below the two-column width the detail sits under the list: bring it into view
          if (window.matchMedia('(max-width: 1099px)').matches) {
            const el = document.getElementById('integrationDetail');
            const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (el) { window.setTimeout(() => el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' }), 0); }
          }
        }
      })));

      this.detailTab = ko.observable('connection');
      this.detailTabs = ko.pureComputed(() => {
        const i = this.selected();
        const list = [{ value: 'connection', label: 'Connection' }, { value: 'auth', label: 'Login' }, { value: 'tests', label: 'Tests' },
          { value: 'activity', label: 'Activity' }];
        if (i && i.members.length) {
          list.push({ value: 'workspaces', label: 'Workspaces (' + i.members.length + ')' });
        }
        return list.map((t) => ({
          value: t.value, text: t.label, id: 'in-tab-' + t.value,
          selected: ko.pureComputed(() => this.detailTab() === t.value),
          pick: () => this.detailTab(t.value)
        }));
      });
      this.selectedKey.subscribe(() => this.detailTab('connection'));
      this.tabKey = (event) => {
        const keys = this.detailTabs().map((t) => t.value);
        const at = keys.indexOf(this.detailTab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.detailTab(keys[next]);
        const button = document.getElementById('in-tab-' + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };

      // What the detail tabs show for the selected integration
      const byWorkspace = (i, field) => (i.members.length === 1 ? i.members[0][field]
        : [].concat.apply([], i.members.map((m) => m[field].map((r) => ({ k: r.k + ' (' + m.workspace + ')', v: r.v })))));
      this.detail = ko.pureComputed(() => {
        const i = this.selected();
        if (!i) {
          return null;
        }
        const many = i.members.length > 1;
        const line = (r) => ({
          text: r.text, title: r.full || r.text, when: ui.when(r.at), workspace: many && r.workspace ? r.workspace : '', by: r.by || '', source: r.source || '',
          dot: 'factory-in-hdot factory-dot-' + (r.kind === 'ok' ? 'green' : r.kind === 'warning' ? 'amber' : r.kind === 'failed' ? 'red' : 'blue')
        });
        const sorted = (list) => list.slice().sort((a, b) => time(b.at) - time(a.at));
        return {
          // A folder on the factory's computer has no server apart from its repository URL
          settings: i.members.length ? (i.type === 'svn' && svnServer(i.members[0].target) === i.members[0].target ? []
            : [{ k: 'Server', v: i.type === 'svn' ? svnServer(i.members[0].target) : i.sub }]).concat(byWorkspace(i, 'settings')) : i.settings,
          auth: i.members.length ? byWorkspace(i, 'auth') : i.auth,
          tests: sorted(i.tests).slice(0, 20).map(line),
          activity: sorted(i.activity).slice(0, 20).map((a) => Object.assign(line(a), { text: a.text + (a.detail ? ': ' + a.detail : '') })),
          testsEmpty: i.type === 'signin' ? 'The factory cannot test sign-in. Results come from sign-ins.' : i.type === 'model' ? 'No test run in this browser session.' : 'No connection test recorded yet.',
          workspaces: i.members.map((m) => ({
            name: m.workspace, pill: HEALTH[m.key], note: m.note,
            success: (() => { const s = newest(m.results.filter((r) => r.kind !== 'failed')); return s ? 'Last reached ' + dashboard.ago(s.at) : 'Never reached'; })(),
            canTest: m.canTest, test: () => runTests([m], i), settings: () => openSettings(m.workspaceId),
            testLabel: 'Test ' + m.workspace, settingsLabel: 'Open the settings of ' + m.workspace
          })),
          testLabel: i.health === 'failed' ? 'Test again' : 'Test connection',
          openLabel: i.members.length === 1 ? 'Open settings' : i.openLabel || '',
          canOpen: i.members.length === 1 || !!i.open
        };
      });

      const openSettings = (workspaceId) => {
        workspaceSelection.selectedId(workspaceId);
        pageRequests.codeTab('settings');
        navigate('code');
      };
      this.openSelected = () => {
        const i = this.selected();
        if (i && i.members.length === 1) {
          openSettings(i.members[0].workspaceId);
        } else if (i && i.open) {
          navigate(i.open);
        }
      };

      // Tests: SVN and Jenkins tests are recorded by the server, so the page reloads that workspace's activity after
      const loadActivity = (id) => api.get('workspaces/' + id + '/integrations/activity')
        .then((list) => { const a = Object.assign({}, activity()); a[id] = list; activity(a); missing.remove(id); })
        .catch(() => { if (missing.indexOf(id) < 0) { missing.push(id); } });
      const runTests = (members, item) => {
        if (this.testing()) {
          return Promise.resolve();
        }
        this.testing(true);
        let failed = 0;
        const steps = members.filter((m) => m.canTest).reduce((p, m) => p.then(() => api.post(m.testPath).catch(() => { failed += 1; })
          .then(() => loadActivity(m.workspaceId))), Promise.resolve());
        return steps.then(() => {
          const n = members.filter((m) => m.canTest).length;
          if (failed) {
            toast.error(item.name + ': ' + failed + ' of ' + n + (n === 1 ? ' test' : ' tests') + ' failed. See Tests for the reason.');
          } else {
            toast.success(item.name + ': ' + (n === 1 ? 'connected.' : 'all ' + n + ' workspaces connected.'));
          }
        }).finally(() => this.testing(false));
      };
      this.testSelected = () => {
        const i = this.selected();
        if (!i || !i.canTest || this.testing()) {
          return;
        }
        if (i.members.length) {
          runTests(i.members, i);
          return;
        }
        this.testing(true);
        Promise.resolve(i.test()).then(() => {
          const now = this.selected();
          if (now && now.health === 'ok') {
            toast.success(now.name + ': ' + (now.success ? now.success.text : 'reached') + '.');
          } else if (now) {
            toast.error(now.name + ': the test failed. See Tests for the reason.');
          }
        }).finally(() => this.testing(false));
      };
      this.testCss = ko.pureComputed(() => 'fx-btn fx-btn--primary' + (this.testing() ? ' is-loading' : ''));

      this.missingText = ko.pureComputed(() => {
        const names = dashboard.data().filter((d) => missing().indexOf(d.workspace.id) >= 0).map((d) => d.workspace.name);
        return names.length ? 'Could not load the connection history or Jenkins settings of ' + names.join(', ') + '. Their health may show as Not tested. Reload the page to try again.' : '';
      });

      this.connected = () => {
        accUtils.announce('Integrations page loaded.');
        document.title = 'Integrations';
        this.loading(true);
        api.get('update').then(update).catch(() => null);
        if (this.isAdmin() && (session.config() || {}).mode === 'ldap') {
          api.get('admin/last-sign-in?source=LDAP').then(lastSignIn).catch(() => null);
        }
        dashboard.load().then((entries) => Promise.all(entries.map((d) => Promise.all([
          api.get('workspaces/' + d.workspace.id + '/jenkins').then((j) => ({ id: d.workspace.id, j: j || null })).catch(() => ({ id: d.workspace.id, failed: true })),
          loadActivity(d.workspace.id)
        ]).then((r) => r[0]))))
          .then((list) => {
            const map = {};
            list.forEach((x) => {
              if (x.j) {
                map[x.id] = x.j;
              } else if (x.failed && missing.indexOf(x.id) < 0) {
                missing.push(x.id);
              }
            });
            jenkins(map);
            if (dashboard.error()) {
              this.errorMessage('Could not load the workspaces: ' + dashboard.error() + ' Reload the page to try again.');
            }
          })
          .catch((e) => this.errorMessage(e.message))
          .finally(() => this.loading(false));
      };
    }

    return IntegrationsViewModel;
  }
);
