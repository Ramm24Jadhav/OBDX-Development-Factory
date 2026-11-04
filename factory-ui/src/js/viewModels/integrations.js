/*
 * Integrations page: everything the factory connects to, in groups: Source control (SVN, per workspace or shared
 * server), Builds (Jenkins, a row for every workspace, "Set up" where it is missing), AI model servers (the writing and
 * search servers, with the health Models & AI shows: the connection tests the server remembers, GET /api/model/checks,
 * through services/modelServers), Sign-in (factory accounts, LDAP or single sign-on) and Updates. Health comes only from
 * results the factory has: connection tests, imports from SVN, Jenkins builds, LDAP sign-ins and the update check;
 * saved settings alone never show as working. The detail beside the list has Connection, History (tests and activity
 * on one timeline) and Used by (a server shared by several workspaces). Settings are edited where they live (Code ›
 * Settings, Models & AI); credentials stay on the server and are only ever shown as stored or not.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/dashboard', '../services/workspaceSelection',
        '../services/pageRequests', '../services/ui', '../services/toast', '../services/modelServers', '../services/connectionHealth', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, dashboard, workspaceSelection, pageRequests, ui, toast, servers, health) {
    const GROUPS = [
      { type: 'svn', title: 'Source control', icon: 'branch' },
      { type: 'jenkins', title: 'Builds', icon: 'flask' },
      { type: 'model', title: 'AI model servers', icon: 'chip' },
      { type: 'signin', title: 'Sign-in', icon: 'shield' },
      { type: 'updates', title: 'Updates', icon: 'refresh' }
    ];
    // Health words and how a result counts: shared with the Workspaces page (services/connectionHealth)
    const HEALTH = health.HEALTH;
    const BUILD_REACHED = health.BUILD_REACHED;
    const AUDIT_WORDS = {
      WORKSPACE_CREATED: 'Workspace created', SVN_SETTINGS_CHANGED: 'SVN settings changed', JENKINS_SETTINGS_CHANGED: 'Jenkins settings changed'
    };
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const time = (value) => (value ? new Date(value).getTime() : 0);
    const newest = health.newest;
    const first = health.first;
    // The server part of an SVN URL: workspaces on the same server are one integration. A file: URL is a folder on
    // the factory's own computer, so it stands alone.
    const svnServer = (url) => {
      const m = /^(https?|svn(?:\+ssh)?):\/\/([^/]+)/i.exec(url || '');
      return m ? m[1].toLowerCase() + '://' + m[2].toLowerCase() : url;
    };
    const hostOf = (url) => { const m = /^[a-z+]+:\/\/([^/]+)/i.exec(url || ''); return m && m[1] ? m[1] : 'folder ' + String(url || '').split('/').filter(Boolean).slice(-2).join('/'); };

    const healthOf = health.healthOf;

    function IntegrationsViewModel() {
      this.errorMessage = ko.observable('');
      this.isAdmin = session.isAdmin;
      this.loading = ko.observable(true);
      const jenkins = ko.observable({});
      const activity = ko.observable({});
      const missing = ko.observableArray([]);
      const update = ko.observable(null);
      const lastSignIn = ko.observable(null);
      const policy = ko.observable(null);
      this.testing = ko.observable(false);
      const openSettings = (workspaceId) => {
        workspaceSelection.selectedId(workspaceId);
        pageRequests.codeTab('settings');
        navigate('code');
      };

      // One workspace's view of its SVN repository or Jenkins: results, tests, activity and what the user may do
      const svnMember = (d) => {
        const w = d.workspace;
        const events = activity()[w.id] || [];
        const own = health.svnResults(d, events);
        return {
          workspace: w.name, workspaceId: w.id, target: w.svnUrl, results: own.results, tests: own.tests, changedAt: own.changedAt,
          canTest: session.can(w.id, 'MANAGE_CODE'), testPath: 'workspaces/' + w.id + '/svn/test',
          facts: [{ k: 'Repository', v: w.svnUrl }, { k: 'Workspace', v: w.name + (w.bankName ? ' (' + w.bankName + (w.obdxVersion ? ', ' + w.obdxVersion : '') + ')' : '') },
            { k: 'OBDX version', v: w.obdxVersion || '–' },
            { k: 'Indexed revision', v: w.indexedRevision !== null && w.indexedRevision !== undefined ? 'r' + w.indexedRevision : 'Not indexed yet' },
            { k: 'Login', v: (w.svnUsername ? 'User ' + w.svnUsername : 'No user') + ' · ' + (w.svnPasswordSet ? 'password stored (encrypted)' : 'no password stored') }],
          // Settings changes and other workspace events (imports are already in the results)
          activity: events.filter((e) => !/^(SVN|JENKINS)_TEST_|JENKINS_SETTINGS/.test(e.action))
            .map((e) => ({ at: e.at, kind: 'info', text: (AUDIT_WORDS[e.action] || e.action) + (e.detail ? ': ' + first(e.detail) : ''), by: e.username, full: e.detail }))
        };
      };
      const jenkinsMember = (d, j) => {
        const w = d.workspace;
        const events = activity()[w.id] || [];
        const own = health.jenkinsResults(d, events);
        return {
          workspace: w.name, workspaceId: w.id, target: j.url, results: own.results, tests: own.tests, changedAt: own.changedAt,
          canTest: session.can(w.id, 'MANAGE_CODE'), testPath: 'workspaces/' + w.id + '/jenkins/test',
          facts: [{ k: 'Jenkins URL', v: j.url }, { k: 'Jobs', v: j.jobs || 'None' }, { k: 'Builds', v: j.mode === 'BRANCH' ? 'Branch builds' : 'Patch builds' },
            { k: 'Login', v: (j.username ? 'User ' + j.username : 'No user') + ' · ' + (j.tokenSet ? 'API token stored (encrypted)' : 'no API token stored') }],
          activity: events.filter((e) => e.action === 'JENKINS_SETTINGS_CHANGED').map((e) => ({ at: e.at, kind: 'info', text: AUDIT_WORDS[e.action] + (e.detail ? ': ' + first(e.detail) : ''), by: e.username, full: e.detail }))
            .concat(d.builds.filter((b) => BUILD_REACHED.indexOf(b.result) < 0 && b.result !== 'NOT_BUILT')
              .map((b) => ({ at: b.startedAt, kind: 'info', text: (b.buildNumber ? 'Build #' + b.buildNumber : 'Build') + ' ' + String(b.result || 'running').toLowerCase().replace(/_/g, ' '), full: b.changeTitle || '' })))
        };
      };

      // Members of one server, as an integration
      const group = (key, type, name, sub, members) => {
        members.forEach((m) => Object.assign(m, healthOf(m.results, m.changedAt)));
        const keys = members.map((m) => m.key);
        const health = keys.indexOf('failed') >= 0 ? 'failed' : keys.indexOf('warning') >= 0 ? 'warning'
          : keys.every((k) => k === 'ok') ? 'ok' : keys.indexOf('ok') >= 0 ? 'partial' : 'untested';
        const tag = (m, list) => list.map((r) => Object.assign({ workspace: m.workspace }, r));
        const results = [].concat.apply([], members.map((m) => tag(m, m.results)));
        const one = members.length === 1;
        return {
          key: key, type: type, name: name, sub: sub, members: members, health: health,
          note: one ? members[0].note : '',
          results: results, history: results.concat([].concat.apply([], members.map((m) => tag(m, m.activity)))),
          facts: one ? members[0].facts : [{ k: 'Server', v: sub }].concat([].concat.apply([], members.map((m) => m.facts.filter((f) => f.k !== 'Workspace')
            .map((f) => ({ k: f.k + ' (' + m.workspace + ')', v: f.v }))))),
          where: 'Passwords and tokens stay on the server, encrypted. They are changed where the settings are edited.',
          canTest: members.some((m) => m.canTest), testNote: members.some((m) => m.canTest) ? '' : 'Testing needs the Manage code permission in the workspace.',
          primary: 'test', secondaryLabel: one ? 'Edit in Code › Settings' : '', secondary: one ? () => openSettings(members[0].workspaceId) : null,
          action: 'Test'
        };
      };
      // A factory-wide integration (no workspaces)
      const single = (key, type, name, sub, fields) => {
        const results = fields.results || [];
        const h = fields.health ? { key: fields.health, note: fields.note || '' } : healthOf(results, fields.changedAt);
        return Object.assign({
          key: key, type: type, name: name, sub: sub, members: [], health: h.key, note: h.note, results: results, history: results,
          facts: [], where: '', canTest: false, testNote: '', primary: '', secondaryLabel: '', secondary: null, action: 'Details'
        }, fields, { health: h.key, note: fields.note !== undefined ? fields.note : h.note });
      };

      this.items = ko.pureComputed(() => {
        const list = [];
        const svn = {};
        const jk = {};
        const data = dashboard.data();
        data.forEach((d) => {
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
        Object.keys(svn).forEach((s) => {
          const m = svn[s];
          list.push(group('svn|' + s, 'svn', 'SVN · ' + (m.length === 1 ? m[0].workspace : hostOf(m[0].target)), m.length === 1 ? m[0].target : s, m));
        });
        Object.keys(jk).forEach((s) => {
          const m = jk[s];
          list.push(group('jenkins|' + s, 'jenkins', 'Jenkins · ' + (m.length === 1 ? m[0].workspace : hostOf(m[0].target)), m[0].target, m));
        });
        // Jenkins not set up: a row for each workspace, so it can be set up from here
        if (!this.loading()) {
          data.filter((d) => !jenkins()[d.workspace.id] && missing().indexOf(d.workspace.id) < 0).forEach((d) => {
            const w = d.workspace;
            list.push(single('jenkins-none|' + w.id, 'jenkins', 'Jenkins · ' + w.name, 'Not set up', {
              health: 'notset', note: '', action: 'Set up', last: 'Builds and tests run only on Jenkins',
              facts: [{ k: 'Jenkins', v: 'Not set up for this workspace' }, { k: 'Used for', v: 'Building, testing and debugging generated changes' }],
              where: 'Set up the server, jobs and token on Code › Settings for ' + w.name + '.',
              primary: 'open', primaryLabel: 'Set up in Code › Settings', open: () => openSettings(w.id)
            }));
          });
        }

        // The model servers in use, with the health Models & AI shows (the same remembered test)
        const m = dashboard.model();
        servers.checks();
        if (m) {
          const p = policy();
          const modelItem = (key, role, url, model, keySet) => {
            const h = servers.healthOf(url);
            const c = h.check;
            const results = c ? [{ at: c.lastAt, kind: c.ok ? 'ok' : 'failed', source: 'Connection test',
              text: c.ok ? 'Connected · ' + c.latencyMs + ' ms' + (c.models ? ', ' + c.models + (c.models === 1 ? ' model' : ' models') + ' listed' : '') : 'Not reachable: ' + first(h.error), full: h.error }] : [];
            if (c && !c.ok && c.lastOk) {
              results.push({ at: c.lastOk, kind: 'ok', source: 'Connection test', text: 'Last connected' });
            }
            const place = servers.placeOf(url, p);
            return single(key, 'model', role + ' · ' + servers.nameOf(url), url, {
              health: h.key, results: results, last: h.when, pillOverride: h.key === 'failed' ? h.pill : null,
              note: !this.isAdmin() ? 'Only administrators see and run model server tests.' : h.key === 'untested' ? 'Not tested since the factory started. Test the connection to see whether it answers.' : '',
              facts: [{ k: 'Model', v: model }, { k: 'Server', v: url }, { k: 'Runs', v: place.text + ' (' + place.detail + ')' },
                { k: 'Key', v: keySet ? 'Stored (encrypted)' : 'None' }, { k: 'Settings from', v: m.saved ? 'Models & AI' : 'The factory settings file' },
                { k: 'Last error', v: h.error || 'None recorded' }],
              history: results.concat(m.updatedAt ? [{ at: m.updatedAt, kind: 'info', text: 'Model settings saved', by: m.updatedBy }] : []),
              where: 'Models, keys and routing are set on Models & AI. This is the same test record, so both pages show the same health.',
              canTest: this.isAdmin(), testNote: this.isAdmin() ? '' : 'Only administrators can test model servers.', primary: 'test', action: 'Test',
              test: () => servers.test(url).then(() => true, () => false),
              secondaryLabel: 'Open in Models & AI', secondary: () => navigate('models')
            });
          };
          const searchUrl = m.embeddingBaseUrl || m.baseUrl;
          if (servers.same(searchUrl, m.baseUrl)) {
            list.push(modelItem('model-chat', 'Writing and search', m.baseUrl, m.chatModel + ' · ' + m.embeddingModel, m.apiKeySet));
          } else {
            list.push(modelItem('model-chat', 'Writing', m.baseUrl, m.chatModel, m.apiKeySet));
            list.push(modelItem('model-embed', 'Search', m.embeddingBaseUrl, m.embeddingModel, m.embeddingApiKeySet));
          }
        }

        const mode = (session.config() || {}).mode;
        const adminLink = this.isAdmin() ? { secondaryLabel: 'Open Administration', secondary: () => navigate('admin') } : {};
        if (mode === 'ldap') {
          const at = lastSignIn() && lastSignIn().at;
          list.push(single('signin', 'signin', 'Directory (LDAP)', 'Sign-in through the factory\'s form', Object.assign({
            results: at ? [{ at: at, kind: 'ok', source: 'Sign-in', text: 'Someone signed in through LDAP' }] : [],
            note: at ? '' : this.isAdmin() ? 'No LDAP sign-in recorded yet. The factory has no LDAP test; a sign-in shows it works.' : 'Only administrators see sign-in results.',
            facts: [{ k: 'Method', v: 'Directory (LDAP)' }, { k: 'Where it is set', v: 'The factory settings file (set by whoever installs it)' },
              { k: 'Directory login', v: 'Kept in the factory settings file, never shown here' }]
          }, adminLink)));
        } else if (mode === 'oidc' || mode === 'saml') {
          list.push(single('signin', 'signin', 'Single sign-on (' + mode.toUpperCase() + ')', 'Sign-in through the bank\'s identity provider', Object.assign({
            health: 'none', note: 'Single sign-on sign-ins are not recorded and cannot be tested from here. Sign in with it to check it works.',
            facts: [{ k: 'Method', v: mode.toUpperCase() }, { k: 'Where it is set', v: 'The factory settings file (set by whoever installs it)' },
              { k: 'Client secret or certificate', v: 'Kept in the factory settings file, never shown here' }]
          }, adminLink)));
        } else if (mode) {
          list.push(single('signin', 'signin', 'The factory\'s own accounts', 'No directory or single sign-on connected', Object.assign({
            health: 'inuse', note: '', last: 'Sign-ins checked against factory accounts',
            facts: [{ k: 'Method', v: 'Factory accounts (user name and password)' }, { k: 'Directory (LDAP)', v: 'Not connected' }, { k: 'Single sign-on', v: 'Not connected' }],
            where: 'A directory or single sign-on is set in the factory settings file; accounts are managed in Administration.'
          }, adminLink)));
        }

        const u = update();
        if (u && u.enabled) {
          const checked = u.checkedAt ? [{ at: u.checkedAt, kind: u.state === 'FAILED' ? 'failed' : 'ok', source: 'Update check', text: u.state === 'FAILED' ? first(u.message) : u.message || 'Release server answered', full: u.message }] : [];
          list.push(single('updates', 'updates', 'Release server', 'Newer factory builds', {
            results: checked, note: checked.length ? undefined : 'No update check recorded yet.',
            facts: [{ k: 'Running', v: (u.version || '–') + ' (build ' + (u.build || '–') + ')' }, { k: 'Latest found', v: u.latestBuild ? 'Build ' + u.latestBuild : 'Not known yet' },
              { k: 'Sign-in', v: 'None needed' }],
            canTest: this.isAdmin(), testNote: this.isAdmin() ? '' : 'Only administrators can check for updates.', primary: 'test', action: 'Test',
            test: () => api.get('update?check=true').then((r) => { update(r); return r.state !== 'FAILED'; }).catch((e) => { toast.error(ui.errorText(e)); return false; }),
            secondaryLabel: 'Open About', secondary: () => navigate('about')
          }));
        } else if (u) {
          list.push(single('updates', 'updates', 'Update checks', 'FACTORY_UPDATES is off', {
            health: 'off', note: '', last: 'Updates are installed by hand',
            facts: [{ k: 'Checks', v: 'Off on this factory' }, { k: 'Setting', v: 'FACTORY_UPDATES' }, { k: 'Running', v: (u.version || '–') + ' (build ' + (u.build || '–') + ')' }],
            where: 'With FACTORY_UPDATES=true in settings.properties the factory checks the release page and offers Update now on About.',
            secondaryLabel: 'Open About', secondary: () => navigate('about')
          }));
        }

        return list.map((i) => {
          const h = HEALTH[i.health] || HEALTH.none;
          const success = newest(i.results.filter((r) => r.kind !== 'failed'));
          const error = newest(i.results.filter((r) => r.kind === 'failed'));
          const last = newest(i.results);
          return Object.assign(i, {
            pill: i.pillOverride || h.pill, filter: h.filter, success: success, error: error,
            lastText: i.last || (last ? (last.kind === 'failed' ? 'Failed ' : 'Reached ') + dashboard.ago(last.at) + (last.source === 'Import' ? ' (import)' : last.source === 'Build' ? ' (build)' : '') : 'Never recorded'),
            lastTitle: last ? ui.when(last.at) + ': ' + (last.full || last.text) : ''
          });
        });
      });

      // Filter chips and search
      this.search = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.filter = ko.observable('');
      const FILTERS = [{ value: '', label: 'All' }, { value: 'test', label: 'Needs a test', dot: 'warning' }, { value: 'notset', label: 'Not set up' },
        { value: 'working', label: 'Working', dot: 'success' }];
      this.filters = FILTERS.map((f) => ({
        value: f.value, id: 'intFilter-' + (f.value || 'all'), dot: f.dot ? 'factory-in-fdot is-' + f.dot : '',
        count: ko.pureComputed(() => this.items().filter((i) => !f.value || i.filter === f.value).length),
        text: ko.pureComputed(() => f.label + ' ' + this.items().filter((i) => !f.value || i.filter === f.value).length),
        pressed: ko.pureComputed(() => (this.filter() === f.value ? 'true' : 'false')),
        pick: () => this.filter(f.value)
      }));
      this.visible = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        const f = this.filter();
        return this.items().filter((i) => (!f || i.filter === f)
          && (!text || (i.name + ' ' + i.sub + ' ' + i.members.map((m) => m.workspace).join(' ')).toLowerCase().indexOf(text) >= 0));
      });
      this.emptyText = ko.pureComputed(() => (this.loading() ? 'Loading integrations…' : this.items().length ? 'No integrations match. Clear the search or the filter.'
        : 'No integrations yet. Connect a code base on the Workspaces page to add its SVN repository.'));

      // Selection
      this.selectedKey = ko.observable(null);
      this.selected = ko.pureComputed(() => this.items().find((i) => i.key === this.selectedKey()) || this.visible()[0] || this.items()[0] || null);
      const pick = (i) => {
        this.selectedKey(i.key);
        // Where the detail sits under the list, bring it into view
        if (window.matchMedia('(max-width: 1024px)').matches) {
          const el = document.getElementById('integrationDetail');
          const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (el) { window.setTimeout(() => el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' }), 0); }
        }
      };
      this.groups = ko.pureComputed(() => GROUPS.map((g) => ({
        title: g.title, id: 'intGroup-' + g.type, iconClass: 'factory-nav-icon factory-ico-' + g.icon,
        rows: this.visible().filter((i) => i.type === g.type).map((i) => ({
          key: i.key, name: i.name, sub: i.sub, subCss: 'factory-in-sub' + (/:\/\//.test(i.sub) ? ' factory-mono' : ''), pill: i.pill, lastText: i.lastText, lastTitle: i.lastTitle, action: i.action,
          css: ko.pureComputed(() => 'factory-in-entry' + (this.selected() && this.selected().key === i.key ? ' is-selected' : '')),
          current: ko.pureComputed(() => (this.selected() && this.selected().key === i.key ? 'true' : 'false')),
          label: i.name + ', ' + i.pill.text + ', ' + i.lastText,
          pick: () => pick(i)
        }))
      })).filter((g) => g.rows.length));

      // Detail tabs: Connection, History, Used by (a server shared by more than one workspace)
      this.detailTab = ko.observable('connection');
      this.detailTabs = ko.pureComputed(() => {
        const i = this.selected();
        const list = [{ value: 'connection', label: 'Connection' }, { value: 'history', label: 'History' }];
        if (i && i.members.length > 1) {
          list.push({ value: 'used', label: 'Used by (' + i.members.length + ')' });
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

      this.detail = ko.pureComputed(() => {
        const i = this.selected();
        if (!i) {
          return null;
        }
        const many = i.members.length > 1;
        const group = GROUPS.find((g) => g.type === i.type);
        const history = i.history.slice().sort((a, b) => time(b.at) - time(a.at)).slice(0, 30).map((r) => ({
          text: r.text, title: r.full || r.text, when: ui.when(r.at),
          meta: [r.source, many && r.workspace ? r.workspace : '', r.by ? 'by ' + r.by : ''].filter(Boolean).join(' · '),
          dot: 'factory-in-hdot factory-dot-' + (r.kind === 'ok' ? 'green' : r.kind === 'warning' ? 'amber' : r.kind === 'failed' ? 'red' : 'blue')
        }));
        if (i.members.length && !i.results.some((r) => r.source === 'Connection test')) {
          history.push({ text: 'No connection test recorded yet', title: '', when: '', meta: '', dot: 'factory-in-hdot factory-dot-grey' });
        }
        const primaryTest = i.primary === 'test' && i.canTest;
        return {
          group: group ? group.title : '',
          lastError: i.error && i.health !== 'ok' ? ui.when(i.error.at) + ': ' + (i.error.full || i.error.text) : '',
          history: history,
          testLabel: i.health === 'failed' ? 'Test again' : 'Test connection',
          primaryTest: primaryTest,
          primaryOpen: i.primary === 'open', primaryLabel: i.primaryLabel || '',
          secondaryLabel: i.secondaryLabel || '',
          usedBy: i.members.map((m) => ({
            name: m.workspace, pill: (HEALTH[m.key] || HEALTH.none).pill, note: m.note,
            success: (() => { const s = newest(m.results.filter((r) => r.kind !== 'failed')); return s ? 'Last reached ' + dashboard.ago(s.at) : 'Never reached'; })(),
            canTest: m.canTest, test: () => runTests([m], i), settings: () => openSettings(m.workspaceId),
            testLabel: 'Test ' + m.workspace, settingsLabel: 'Open the settings of ' + m.workspace
          }))
        };
      });
      this.openPrimary = () => { const i = this.selected(); if (i && i.open) { i.open(); } };
      this.openSecondary = () => { const i = this.selected(); if (i && i.secondary) { i.secondary(); } };

      // Tests: SVN and Jenkins tests are recorded by the server, so the page reloads that workspace's activity after
      const loadActivity = (id) => api.get('workspaces/' + id + '/integrations/activity')
        .then((list) => { const a = Object.assign({}, activity()); a[id] = list; activity(a); missing.remove(id); })
        .catch(() => { if (missing.indexOf(id) < 0) { missing.push(id); } });
      const runTests = (members, item) => {
        if (this.testing()) {
          return Promise.resolve(true);
        }
        this.testing(true);
        let failed = 0;
        const steps = members.filter((m) => m.canTest).reduce((p, m) => p.then(() => api.post(m.testPath).catch(() => { failed += 1; })
          .then(() => loadActivity(m.workspaceId))), Promise.resolve());
        return steps.then(() => {
          const n = members.filter((m) => m.canTest).length;
          if (failed) {
            toast.error(item.name + ': ' + failed + ' of ' + n + (n === 1 ? ' test' : ' tests') + ' failed. See History for the reason.');
          } else {
            toast.success(item.name + ': ' + (n === 1 ? 'connected.' : 'all ' + n + ' workspaces connected.'));
          }
          return !failed;
        }).finally(() => this.testing(false));
      };
      const testItem = (i, quiet) => {
        if (i.members.length) {
          return runTests(i.members, i);
        }
        return Promise.resolve(i.test()).then((ok) => {
          const now = this.items().find((x) => x.key === i.key);
          if (!quiet && now && now.health === 'ok') {
            toast.success(now.name + ': ' + (now.success ? now.success.text : 'reached') + '.');
          } else if (!quiet && now) {
            toast.error(now.name + ': the test failed. See History for the reason.');
          }
          return ok;
        });
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
        testItem(i).finally(() => this.testing(false));
      };
      // Test all: every connection this user may test, one after another
      this.testAll = () => {
        if (this.testing()) {
          return;
        }
        const list = this.items().filter((i) => i.canTest && i.primary === 'test');
        this.testing(true);
        let ok = 0;
        list.reduce((p, i) => p.then(() => {
          if (i.members.length) {
            const members = i.members.filter((m) => m.canTest);
            let failed = 0;
            return members.reduce((q, m) => q.then(() => api.post(m.testPath).catch(() => { failed += 1; }).then(() => loadActivity(m.workspaceId))), Promise.resolve())
              .then(() => { if (!failed) { ok += 1; } });
          }
          return Promise.resolve(i.test()).then((r) => { if (r) { ok += 1; } });
        }), Promise.resolve()).then(() => {
          (ok === list.length ? toast.success : toast.warning)(ok + ' of ' + list.length + (list.length === 1 ? ' connection' : ' connections') + ' reached.'
            + (ok === list.length ? '' : ' Pick one that needs a test to see why.'));
        }).finally(() => this.testing(false));
      };
      this.testCss = ko.pureComputed(() => 'fx-btn fx-btn--primary fx-btn--sm' + (this.testing() ? ' is-loading' : ''));
      this.canTestAll = ko.pureComputed(() => this.items().some((i) => i.canTest && i.primary === 'test'));

      this.missingText = ko.pureComputed(() => {
        const names = dashboard.data().filter((d) => missing().indexOf(d.workspace.id) >= 0).map((d) => d.workspace.name);
        return names.length ? 'Could not load the connection history or Jenkins settings of ' + names.join(', ') + '. Their health may show as Needs a test. Reload the page to try again.' : '';
      });

      this.connected = () => {
        accUtils.announce('Integrations page loaded.');
        document.title = 'Integrations';
        this.loading(true);
        api.get('update').then(update).catch(() => null);
        api.get('knowledge/policy').then(policy).catch(() => null);
        servers.loadChecks();
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
          .catch((e) => this.errorMessage(ui.errorText(e)))
          .finally(() => this.loading(false));
      };
    }

    return IntegrationsViewModel;
  }
);
