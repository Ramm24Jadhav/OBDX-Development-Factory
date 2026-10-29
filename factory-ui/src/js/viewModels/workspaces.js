/*
 * Workspaces page: lists workspaces and creates or deletes them through /api/workspaces. A new workspace's code comes
 * from an SVN URL or a folder on the computer the factory runs on (/api/sources); the factory checks it and fills in
 * the name, bank and OBDX version from the code.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', '../services/dashboard',
        '../services/pageRequests', '../services/ui', '../services/toast', '../services/dialog', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, workspaceSelection, dashboard, pageRequests, ui, toast, dialog) {
    const KIND_LABELS = { WORKING_COPY: 'SVN checkout', REPOSITORY: 'SVN repository' };
    const WEEK_MS = 7 * 24 * 3600 * 1000;
    const POLL_MS = 3000;
    // A workspace's code state as a design-system status (ui.status), in the page's own words
    const SERVER_STATE = { ready: 'SUCCEEDED', importing: 'IMPORTING', failed: 'FAILED', new: 'NEW' };
    const stateStatus = (words) => {
      const out = {};
      Object.keys(SERVER_STATE).forEach((key) => {
        const s = ui.status(SERVER_STATE[key], words[key]);
        out[key] = Object.assign({}, s, { css: s.css + ' factory-ws4-status' });
      });
      return out;
    };
    const STATUS = stateStatus({ ready: 'Completed', importing: 'In Progress', failed: 'Check Required', new: 'Not imported' });
    // The registry's status pills
    const REGISTRY = stateStatus({ ready: 'Active', importing: 'Indexing', failed: 'Error', new: 'Not imported' });
    const isRunning = (job) => !!job && (job.status === 'QUEUED' || job.status === 'RUNNING');
    // A long URL on one line: its start and its end, which tells workspaces apart
    const midUrl = (url, max) => {
      const text = url || '';
      const limit = max || 46;
      return text.length <= limit ? text : text.slice(0, 12) + '…' + text.slice(text.length - (limit - 13));
    };
    const workspaceCode = (id) => 'WS-' + id.replace(/-/g, '').slice(0, 4).toUpperCase();
    const ROLE_TEXT = (role) => role.charAt(0) + role.slice(1).toLowerCase();
    const stopping = (handler) => (event) => {
      if (event && event.stopPropagation) {
        event.stopPropagation();
        event.preventDefault();
      }
      handler();
    };

    function WorkspacesViewModel() {
      this.isAdmin = session.isAdmin;
      this.versionOptions = [
        { value: '22.x', label: 'OBDX 22.x' },
        { value: '25.x', label: 'OBDX 25.x' }
      ];

      // Step 1: where the code is
      this.sourceKind = ko.observable('url');
      this.svnUrl = ko.observable('');
      this.svnUsername = ko.observable('');
      this.svnPassword = ko.observable('');
      this.folderPath = ko.observable('');
      this.found = ko.observableArray([]);
      this.roots = ko.observableArray([]);
      this.browsing = ko.observable(false);
      this.listing = ko.observable(null);
      this.checking = ko.observable(false);
      this.inspection = ko.observable(null);
      this.reasons = ko.observableArray([]);

      // Step 2: the workspace
      this.name = ko.observable('');
      this.bankName = ko.observable('');
      this.obdxVersion = ko.observable('22.x');
      this.importNow = ko.observable(true);
      // Required fields show their message once Create was pressed with one empty
      this.showErrors = ko.observable(false);
      const required = (field, message) => ko.pureComputed(() => (this.showErrors() && !String(this[field]() || '').trim() ? message : ''));
      this.nameError = required('name', 'Enter a name for the workspace.');
      this.bankError = required('bankName', 'Enter the bank.');
      this.versionError = required('obdxVersion', 'Choose the OBDX version.');
      this.saving = ko.observable(false);

      this.errorMessage = ko.observable('');
      this.clearError = () => this.errorMessage('');
      const showError = (error) => this.errorMessage(error.message);

      // A different source needs a new check.
      const reset = () => { this.inspection(null); this.reasons([]); };
      this.sourceKind.subscribe(reset);
      this.svnUrl.subscribe(reset);
      this.folderPath.subscribe(reset);

      // Suggestions replace what is empty, the starting OBDX version or an earlier suggestion, never what the user chose.
      const initialSuggested = () => ({ obdxVersion: '22.x' });
      let suggested = initialSuggested();
      const suggest = (field, value) => {
        if (value && (!this[field]() || this[field]() === suggested[field])) {
          this[field](value);
          suggested[field] = value;
        }
      };
      const showInspection = (result) => {
        this.clearError();
        this.inspection(result);
        const suggestion = result.suggestion || {};
        this.reasons(suggestion.reasons || []);
        suggest('name', suggestion.name);
        suggest('bankName', suggestion.bankName);
        suggest('obdxVersion', suggestion.obdxVersion);
      };
      const check = (request) => {
        this.clearError();
        this.inspection(null);
        this.checking(true);
        return request.then(showInspection).catch(showError).finally(() => this.checking(false));
      };

      this.checkUrl = () => {
        if (!this.svnUrl().trim()) {
          this.errorMessage('Enter the SVN repository URL');
          return;
        }
        check(api.post('sources/inspect-url', { svnUrl: this.svnUrl().trim(), svnUsername: this.svnUsername(), svnPassword: this.svnPassword() }));
      };

      this.checkFolder = () => {
        if (!this.folderPath().trim()) {
          this.errorMessage('Choose a folder');
          return;
        }
        this.browsing(false);
        check(api.post('sources/local/inspect', { path: this.folderPath().trim() }));
      };
      const useFolder = (path) => { this.folderPath(path); this.checkFolder(); };

      this.makeRepository = () => check(api.post('sources/local/repository', { path: this.folderPath().trim(), name: this.name() || null }));

      // Folder browser
      const openFolder = (path) => api.get('sources/local/folders?path=' + encodeURIComponent(path))
        .then((listing) => this.listing(Object.assign({}, listing, {
          folders: listing.folders.map((folder) => Object.assign({}, folder, {
            label: KIND_LABELS[folder.kind] || '',
            open: () => openFolder(folder.path),
            use: () => useFolder(folder.path)
          }))
        })))
        .catch(showError);
      this.toggleBrowse = () => {
        if (this.browsing()) {
          this.browsing(false);
          return;
        }
        this.browsing(true);
        openFolder(this.folderPath().trim() || this.home);
      };
      this.folderUp = () => this.listing() && this.listing().parent && openFolder(this.listing().parent);
      this.chooseFolder = () => this.listing() && useFolder(this.listing().path);

      this.localEnabled = ko.observable(false);
      const loadLocal = () => api.get('sources/local').then((local) => {
        if (!local.enabled) {
          return;
        }
        this.localEnabled(true);
        this.home = local.home;
        this.sourceKind('folder');
        this.roots(local.roots.map((root) => Object.assign({}, root, { open: () => openFolder(root.path) })));
        this.found(local.found.map((repository) => Object.assign({}, repository, { use: () => useFolder(repository.path) })));
      }).catch(() => null);

      // The source tabs of Create New Workspace, and the header's New Workspace menu that picks one
      this.sourceTabs = [
        { value: 'folder', label: 'Folder on this computer', icon: 'factory-nav-icon factory-ico-laptop' },
        { value: 'url', label: 'SVN server (URL)', icon: 'factory-nav-icon factory-ico-link' }
      ].map((t) => Object.assign(t, {
        css: ko.pureComputed(() => 'factory-ws-tab' + (this.sourceKind() === t.value ? ' factory-ws-tab-on' : '')),
        selected: ko.pureComputed(() => String(this.sourceKind() === t.value)),
        hidden: ko.pureComputed(() => t.value === 'folder' && !this.localEnabled()),
        pick: () => this.sourceKind(t.value)
      }));
      const focusCreate = () => {
        const card = document.getElementById('createWorkspaceCard');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const input = document.getElementById(this.sourceKind() === 'folder' ? 'folderPath' : 'svnUrl');
          if (input) {
            window.setTimeout(() => input.focus(), 300);
          }
        }
      };
      this.newWorkspaceItems = ko.pureComputed(() => [
        { value: 'folder', label: 'Folder on this computer', icon: 'laptop', disabled: !this.localEnabled() },
        { value: 'url', label: 'SVN server (URL)', icon: 'link' }
      ]);
      this.newWorkspaceMenu = (event) => { this.sourceKind(event.detail.value); focusCreate(); };
      this.startCreate = () => focusCreate();
      this.folderPathInput = (event) => this.folderPath(event.target.value);
      this.folderPathKey = (event) => { if (event.key === 'Enter') { this.checkFolder(); } };
      this.go = (page) => dashboard.open(page);

      // All workspaces, with their code state from the dashboard, filtered by the search box and the three lists
      const data = dashboard.data;
      this.filterText = ko.observable('');
      this.filterBank = ko.observable('');
      this.filterStatus = ko.observable('');
      this.filterVersion = ko.observable('');
      this.filterTextInput = (event) => this.filterText(event.target.value);
      this.filterBankChange = (event) => this.filterBank(event.target.value);
      this.filterStatusChange = (event) => this.filterStatus(event.target.value);
      this.filterVersionChange = (event) => this.filterVersion(event.target.value);
      this.banks = ko.pureComputed(() => Array.from(new Set(data().map((d) => d.workspace.bankName))).sort());
      this.versions = ko.pureComputed(() => Array.from(new Set(data().map((d) => d.workspace.obdxVersion))).sort());
      this.rows = ko.pureComputed(() => data().map((d) => {
        const w = d.workspace;
        const state = dashboard.codeState(d).key;
        const job = d.imports.length ? d.imports[0] : null;
        return {
          id: w.id, name: w.name, bank: w.bankName, version: w.obdxVersion, svnUrl: w.svnUrl || '', shortUrl: midUrl(w.svnUrl, 48), state: state,
          status: STATUS[state], checked: job ? new Date(job.finishedAt || job.createdAt).toLocaleString() : 'Never', running: state === 'importing',
          canDelete: session.isAdmin(),
          open: stopping(dashboard.open('code', w.id)),
          edit: stopping(dashboard.open('code', w.id)),
          remove: stopping(() => this.deleteWorkspace(w.id)),
          select: () => this.openRegistry(w.id)
        };
      }).filter((r) => {
        const text = this.filterText().trim().toLowerCase();
        return (!text || (r.name + ' ' + r.bank + ' ' + r.svnUrl).toLowerCase().indexOf(text) >= 0)
          && (!this.filterBank() || r.bank === this.filterBank())
          && (!this.filterStatus() || r.state === this.filterStatus())
          && (!this.filterVersion() || r.version === this.filterVersion());
      }).map((r, i) => Object.assign(r, {
        // The keyboard cursor row (ui.tableKeys): arrows or J/K move it, Enter opens the registry
        css: ko.pureComputed(() => 'factory-clickable' + (this.wsKeys.cursor() === i ? ' is-cursor' : '')),
        focus: () => { this.wsKeys.cursor(i); return true; }
      })));
      this.wsKeys = ui.tableKeys(this.rows, { open: (row) => row.select() });
      // Enter on the row's name link follows the link (opens the code), not the registry
      this.wsKey = (a, b) => {
        const e = a && typeof a.preventDefault === 'function' ? a : b;
        return e && e.target && e.target.tagName === 'A' ? true : this.wsKeys.key(a, b);
      };
      this.total = ko.pureComputed(() => data().length);
      this.refresh = () => { dashboard.load(); };

      // The four totals
      this.tiles = ko.pureComputed(() => {
        const d = data();
        const ready = d.filter((e) => dashboard.codeState(e).key === 'ready').length;
        const newThisWeek = d.filter((e) => Date.now() - new Date(e.workspace.createdAt).getTime() < WEEK_MS).length;
        const banks = new Set(d.map((e) => e.workspace.bankName)).size;
        const versions = Array.from(new Set(d.map((e) => e.workspace.obdxVersion))).sort();
        return {
          total: d.length, newThisWeek: newThisWeek, banks: banks === 1 ? 'Across 1 bank' : 'Across ' + banks + ' banks',
          ready: ready, readyPercent: d.length ? Math.round(100 * ready / d.length) : 0, readyWidth: (d.length ? Math.round(100 * ready / d.length) : 0) + '%',
          inProgress: d.length - ready,
          versionCount: versions.length, versionList: versions.join(', ') || 'None yet'
        };
      });

      // Recent activity: workspaces created and code imports
      this.activity = ko.pureComputed(() => {
        const items = [];
        data().forEach((d) => {
          const w = d.workspace;
          items.push({ css: 'factory-ws-dot factory-ws-dot-violet', icon: 'factory-nav-icon factory-ico-cube', text: 'Workspace ' + w.name + ' created (OBDX ' + w.obdxVersion + ')', at: w.createdAt });
          d.imports.forEach((j) => {
            const done = j.status === 'SUCCEEDED';
            const failed = j.status === 'FAILED';
            items.push({
              css: 'factory-ws-dot ' + (done ? 'factory-ws-dot-green' : (failed ? 'factory-ws-dot-amber' : 'factory-ws-dot-blue')),
              icon: 'factory-nav-icon ' + (done ? 'factory-ico-check' : (failed ? 'factory-ico-alert' : 'factory-ico-info')),
              text: done ? 'Workspace ' + w.name + ' code indexed at r' + j.toRevision : (failed ? 'Code import for ' + w.name + ' needs attention' : 'Code import started for ' + w.name),
              at: j.finishedAt || j.createdAt
            });
          });
        });
        return items.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 4).map((i) => Object.assign(i, { when: dashboard.ago(i.at) }));
      });

      // Live import progress: while a workspace's import is queued or running, its latest job is read every few
      // seconds from GET /workspaces/{id}/imports; once it ends, the dashboard reloads and polling stops.
      const liveJobs = ko.observable({});
      const liveText = (job) => {
        if (job.status === 'QUEUED') {
          return 'Queued; waiting for the import to start.';
        }
        const done = job.filesIndexed + job.filesRemoved;
        return job.filesScanned
          ? done.toLocaleString() + ' of ' + job.filesScanned.toLocaleString() + ' scanned files processed, ' + job.chunksIndexed.toLocaleString() + ' searchable pieces so far'
          : 'Running; the server has not counted the files yet.';
      };
      let pollTimer = null;
      let polling = false;
      const runningIds = () => data().filter((d) => isRunning(liveJobs()[d.workspace.id] || d.imports[0])).map((d) => d.workspace.id);
      const poll = () => {
        clearTimeout(pollTimer);
        if (!polling || !runningIds().length) {
          return;
        }
        pollTimer = window.setTimeout(() => {
          const ids = runningIds();
          Promise.all(ids.map((id) => api.get('workspaces/' + id + '/imports').then((list) => [id, list[0] || null]).catch(() => [id, null])))
            .then((results) => {
              if (!polling) {
                return null;
              }
              const m = Object.assign({}, liveJobs());
              let ended = false;
              results.forEach(([id, job]) => {
                if (job) {
                  m[id] = job;
                  ended = ended || !isRunning(job);
                }
              });
              liveJobs(m);
              if (!ended) {
                return null;
              }
              return dashboard.load().then(() => {
                const left = Object.assign({}, liveJobs());
                Object.keys(left).forEach((id) => { if (!isRunning(left[id])) { delete left[id]; } });
                liveJobs(left);
              });
            })
            .finally(poll);
        }, POLL_MS);
      };
      this.runningCount = ko.pureComputed(() => data().filter((d) => dashboard.codeState(d).key === 'importing').length);

      // The selected workspace's details: overview, project statistics, stack from the profile and indexing
      this.selectedWsId = ko.observable(null);
      this.selectWs = (id) => () => this.selectedWsId(id);
      const wsDetails = ko.observable({});
      // The six stack facts of a workspace, from its project profile and Jenkins settings
      const stackOf = (extra) => {
        const fact = (key) => {
          const f = extra.profile ? extra.profile.facts.find((x) => x.key === key) : null;
          return f && f.value ? f.value : '';
        };
        const or = (value) => value || 'Not detected';
        return [
          { label: 'Frontend', value: or(fact('ui.architecture')), sub: fact('ui.jetVersion'), icon: 'monitor', tone: 'red' },
          { label: 'Backend', value: or(fact('backend.javaVersion') || fact('backend.frameworks')), sub: fact('backend.javaVersion') ? fact('backend.frameworks') : '', icon: 'code', tone: 'amber' },
          { label: 'Database', value: or(fact('data.databaseType')), sub: fact('data.tableNaming'), icon: 'cube', tone: 'blue' },
          { label: 'Build', value: or(fact('backend.buildTool')), sub: fact('backend.packaging'), icon: 'cog', tone: 'amber' },
          { label: 'App Server', value: or(fact('backend.appServer')), sub: '', icon: 'monitor', tone: 'violet' },
          { label: 'CI/CD', value: extra.jenkins && extra.jenkins.url ? 'Jenkins' : 'Not set up', sub: extra.jenkins && extra.jenkins.jobs ? String(extra.jenkins.jobs) : '', icon: 'flask', tone: 'green' }
        ].map((s) => Object.assign(s, { iconClass: 'factory-nav-icon factory-ico-' + s.icon + ' factory-ws3-tone-' + s.tone }));
      };
      this.selectedWs = ko.pureComputed(() => {
        const entry = data().find((d) => d.workspace.id === this.selectedWsId()) || data()[0];
        if (!entry) {
          return null;
        }
        const w = entry.workspace;
        const extra = wsDetails()[w.id] || {};
        const inv = extra.inventory ? extra.inventory.summary : null;
        // While an import runs, its job comes from the live poll (GET /imports), not the last dashboard load
        const job = liveJobs()[w.id] || (entry.imports.length ? entry.imports[0] : null);
        const index = entry.index;
        const running = isRunning(job);
        const pct = index && index.chunks ? Math.round(100 * index.chunksWithEmbedding / index.chunks) : 0;
        const state = dashboard.codeState(entry).key;
        const members = (extra.members || []).map((m) => ({
          initials: ui.initials(m.displayName), avatar: ui.avatarTone(m.displayName) + ' fx-avatar--sm', displayName: m.displayName, roleText: ROLE_TEXT(m.role), role: m.role,
          name: m.displayName + ' (' + m.role.toLowerCase() + ')'
        }));
        const lead = members.find((m) => m.role === 'LEAD') || null;
        return {
          id: w.id, name: w.name, bank: w.bankName, version: 'OBDX ' + w.obdxVersion, code: workspaceCode(w.id),
          description: w.bankName + ' code base on OBDX ' + w.obdxVersion,
          svnUrl: w.svnUrl || 'Not set', shortUrl: midUrl(w.svnUrl, 40), created: ui.when(w.createdAt),
          lastIndexed: job ? ui.when(job.finishedAt || job.createdAt) : 'Never', status: STATUS[state], pill: REGISTRY[state],
          svnUser: w.svnUsername || 'None (no sign-in)', svnPassword: w.svnPasswordSet ? 'Saved' : 'Not saved',
          revision: w.indexedRevision ? 'r' + w.indexedRevision : 'Not indexed',
          lastImport: job ? ui.when(job.finishedAt || job.createdAt) + ' (' + job.status.toLowerCase() + ')' : 'Never',
          importMessage: job && job.message ? job.message : 'No code import yet.',
          owner: lead ? { initials: lead.initials, avatar: lead.avatar, name: lead.displayName } : null,
          members: members, memberFaces: members.slice(0, 3), moreMembers: Math.max(0, members.length - 3),
          stats: [
            { label: 'Total Modules', value: inv ? inv.modules : '–' }, { label: 'UI Screens', value: inv ? inv.screens : '–' },
            { label: 'APIs', value: inv ? inv.endpoints : '–' }, { label: 'Form Fields', value: inv ? inv.fields : '–' },
            { label: 'Indexed Files', value: index ? index.files : '–' }, { label: 'Requirements', value: entry.requirements.length }
          ],
          stack: stackOf(extra),
          indexing: {
            pct: pct, style: { background: 'conic-gradient(var(--fx-success) ' + pct + '%, var(--fx-surface-3) 0)' },
            rows: [
              { label: 'Files indexed', value: index ? index.files : 0, dot: 'factory-step-dot factory-dot-green' },
              { label: 'Searchable pieces', value: index ? index.chunks : 0, dot: 'factory-step-dot factory-dot-blue' },
              { label: 'With embeddings', value: index ? index.chunksWithEmbedding : 0, dot: 'factory-step-dot factory-dot-violet' },
              { label: 'UI screens discovered', value: inv ? inv.screens : 0, dot: 'factory-step-dot factory-dot-red' },
              { label: 'Indexed revision', value: w.indexedRevision ? 'r' + w.indexedRevision : '–', dot: 'factory-step-dot factory-dot-amber' }
            ],
            title: running ? 'Indexing...' : (job ? (job.status === 'FAILED' ? 'Last indexing failed' : 'Indexing complete') : 'Not indexed yet'),
            text: running ? liveText(job) : 'Code search by meaning covers ' + pct + '% of the code',
            live: running
          },
          reindex: () => api.post('workspaces/' + w.id + '/imports')
            .then(() => { toast.success('Re-indexing of ' + w.name + ' started.'); return dashboard.load(); })
            .catch((error) => toast.error(error.message)),
          edit: dashboard.open('code', w.id), canReindex: session.can(w.id, 'MANAGE_CODE'),
          reindexTip: session.can(w.id, 'MANAGE_CODE') ? null : 'Re-indexing needs the right to manage the code of this workspace.'
        };
      });
      this.selectedWsId.subscribe((id) => this.loadWsDetails(id));
      const pending = {};
      this.loadWsDetails = (id) => {
        if (!id || wsDetails()[id] || pending[id]) {
          return;
        }
        pending[id] = true;
        Promise.all([api.get('workspaces/' + id + '/profile').catch(() => null), api.get('workspaces/' + id + '/inventory').catch(() => null),
          api.get('workspaces/' + id + '/members').catch(() => []), api.get('workspaces/' + id + '/jenkins').catch(() => null)])
          .then(([profile, inventory, members, jenkins]) => { const m = Object.assign({}, wsDetails()); m[id] = { profile: profile, inventory: inventory, members: members, jenkins: jenkins }; wsDetails(m); });
      };
      data.subscribe((list) => { if (!this.selectedWsId() && list.length) { this.selectedWsId(list[0].workspace.id); } });

      this.quickActions = [
        { title: 'Browse Code', text: 'Explore repositories and search code', icon: 'code', tone: 'blue', open: dashboard.open('code') },
        { title: 'View Profile', text: 'Detected stack and conventions', icon: 'doc', tone: 'blue', open: dashboard.open('profile') },
        { title: 'Add Requirement', text: 'Upload BRD/FSD or describe change', icon: 'list', tone: 'violet', open: dashboard.open('requirements') },
        { title: 'Open Designer', text: 'Design and review screens', icon: 'design', tone: 'violet', open: dashboard.open('designer') }
      ].map((q, i) => Object.assign(q, {
        icon: 'factory-nav-icon factory-ico-' + q.icon + ' factory-ws3-q-' + q.tone,
        css: 'factory-ws-quick-card' + (i === 0 ? ' factory-ws3-quick-first' : '')
      }));

      // Screen 17, the workspace registry: opened by selecting a workspace or the registry link
      this.view = ko.observable('main');
      this.showMain = (event) => {
        if (event && event.preventDefault) {
          event.preventDefault();
        }
        this.view('main');
      };
      this.openRegistry = (id) => {
        if (id && typeof id === 'string') {
          this.selectedWsId(id);
        } else if (id && id.preventDefault) {
          id.preventDefault();
        }
        data().forEach((d) => this.loadWsDetails(d.workspace.id));
        this.view('registry');
        window.scrollTo(0, 0);
      };
      this.registerWorkspace = () => {
        this.view('main');
        window.setTimeout(focusCreate, 60);
      };
      this.regTab = ko.observable('workspaces');
      this.regTabs = ui.tabs(this.regTab, [
        { value: 'workspaces', label: 'Workspaces', icon: 'folder' },
        { value: 'repositories', label: 'Repository Configuration', icon: 'branch' },
        { value: 'indexing', label: 'Indexing & Discovery', icon: 'search' },
        { value: 'stack', label: 'Project Stack', icon: 'cube' },
        { value: 'access', label: 'Access & Permissions', icon: 'users' }
      ]);
      this.detailTab = ko.observable('overview');
      this.detailTabs = ui.tabs(this.detailTab, [
        { value: 'overview', label: 'Overview' },
        { value: 'repositories', label: 'Repositories', count: 1 },
        { value: 'stack', label: 'Project Stack' },
        { value: 'indexing', label: 'Indexing' },
        { value: 'access', label: 'Access Control' }
      ]);

      const MONTH_MS = 30 * 24 * 3600 * 1000;
      this.regKpis = ko.pureComputed(() => {
        const d = data();
        const states = d.map((e) => dashboard.codeState(e).key);
        const n = (key) => states.filter((s) => s === key).length;
        const thisMonth = d.filter((e) => Date.now() - new Date(e.workspace.createdAt).getTime() < MONTH_MS).length;
        const repositories = new Set(d.map((e) => e.workspace.svnUrl).filter(Boolean)).size;
        const kpi = (label, value, sub, icon, tone, subCss, status) => ({
          label: label, value: value, sub: sub, iconCss: 'factory-kpi-icon factory-ov2-icon-' + tone, iconClass: 'factory-nav-icon factory-ico-' + icon, db: icon === 'database',
          css: 'factory-kpi-sub' + (subCss ? ' factory-' + subCss : ''),
          open: () => { this.regTab('workspaces'); this.regStatus(status || ''); }
        });
        return [
          kpi('Total Workspaces', d.length, '↑ ' + thisMonth + ' this month', 'folder', 'blue', 'up'),
          kpi('Active', n('ready'), (d.length ? Math.round(100 * n('ready') / d.length) : 0) + '% of total', 'check', 'green', '', 'ready'),
          kpi('Indexing', n('importing'), 'In progress', 'clock', 'amber', '', 'importing'),
          kpi('Issues', n('failed'), 'Needs attention', 'alert', 'red', n('failed') ? 'bad' : '', 'failed'),
          kpi('Total Repositories', repositories, 'Across all workspaces', 'database', 'violet', '')
        ];
      });

      // The registry table: search, status and owner filters, check boxes and a footer
      this.regText = ko.observable('');
      this.regStatus = ko.observable('');
      this.regOwner = ko.observable('');
      this.regTextInput = ui.value(this.regText);
      this.regStatusChange = ui.value(this.regStatus);
      this.regOwnerChange = ui.value(this.regOwner);
      this.regReset = () => { this.regText(''); this.regStatus(''); this.regOwner(''); };
      this.checkedIds = ko.observableArray([]);
      const ownerOf = (id) => {
        const members = (wsDetails()[id] || {}).members || [];
        const lead = members.find((m) => m.role === 'LEAD') || null;
        return lead ? lead.displayName : '';
      };
      this.owners = ko.pureComputed(() => Array.from(new Set(data().map((d) => ownerOf(d.workspace.id)).filter(Boolean))).sort());
      const regBase = ko.pureComputed(() => data().map((d) => {
        const w = d.workspace;
        const extra = wsDetails()[w.id] || {};
        const inv = extra.inventory ? extra.inventory.summary : null;
        const state = dashboard.codeState(d).key;
        const job = d.imports.length ? d.imports[0] : null;
        const indexed = job ? ui.when(job.finishedAt || job.createdAt) : '';
        const cut = indexed.lastIndexOf(', ');
        const members = extra.members || [];
        return {
          id: w.id, name: w.name, code: workspaceCode(w.id), svnUrl: w.svnUrl || '', shortUrl: midUrl(w.svnUrl, 34), state: state, pill: REGISTRY[state],
          indexedDay: indexed ? (cut > 0 ? indexed.slice(0, cut) : indexed) : 'Never', indexedTime: cut > 0 ? indexed.slice(cut + 2) : '',
          owner: ownerOf(w.id), ownerName: ownerOf(w.id) || 'No lead assigned',
          memberText: members.length ? members.map((m) => m.displayName + ' (' + ROLE_TEXT(m.role) + ')').join(', ') : 'Administrators only',
          svnUser: w.svnUsername || 'None (no sign-in)', svnPassword: w.svnPasswordSet ? 'Saved' : 'Not saved',
          revision: w.indexedRevision ? 'r' + w.indexedRevision : 'Not indexed', lastImport: job ? ui.when(job.finishedAt || job.createdAt) + ' (' + job.status.toLowerCase() + ')' : 'Never',
          files: d.index ? d.index.files : 0, chunks: d.index ? d.index.chunks : 0, embedded: d.index ? d.index.chunksWithEmbedding : 0,
          modules: inv ? inv.modules : '–', screens: inv ? inv.screens : '–', apis: inv ? inv.endpoints : '–',
          stack: stackOf(extra),
          canDelete: session.isAdmin(),
          edit: dashboard.open('code', w.id)
        };
      }));
      this.regAll = regBase;
      this.regRows = ko.pureComputed(() => regBase().filter((r) => {
        const text = this.regText().trim().toLowerCase();
        return (!text || (r.name + ' ' + r.code + ' ' + r.svnUrl).toLowerCase().indexOf(text) >= 0)
          && (!this.regStatus() || r.state === this.regStatus())
          && (!this.regOwner() || r.owner === this.regOwner());
      }).map((r) => Object.assign({}, r, {
        css: 'factory-clickable' + (this.selectedWs() && this.selectedWs().id === r.id ? ' factory-row-sel is-selected' : ''),
        checked: this.checkedIds().indexOf(r.id) >= 0,
        toggle: (event) => {
          event.stopPropagation();
          if (event.target.checked) {
            this.checkedIds.push(r.id);
          } else {
            this.checkedIds.remove(r.id);
          }
        },
        select: () => this.selectedWsId(r.id),
        menuItems: [
          { value: 'code', label: 'Open code', icon: 'code' },
          { value: 'profile', label: 'Project Profile', icon: 'doc' },
          { value: 'requirements', label: 'Requirements', icon: 'list' },
          { value: 'edit', label: 'Edit configuration', icon: 'edit' },
          { separator: true },
          { value: 'delete', label: 'Delete', icon: 'trash', danger: true, disabled: !r.canDelete }
        ],
        menu: (event) => this.rowAction(event.detail.value, r.id)
      })));
      this.checkedCount = ko.pureComputed(() => this.checkedIds().length);
      this.allChecked = ko.pureComputed(() => this.regRows().length > 0 && this.regRows().every((r) => r.checked));
      this.toggleAll = (event) => this.checkedIds(event.target.checked ? this.regRows().map((r) => r.id) : []);
      this.clearChecked = () => this.checkedIds([]);
      this.regFooter = ko.pureComputed(() => {
        const n = this.regRows().length;
        return n ? 'Showing 1 to ' + n + ' of ' + n + ' workspace' + (n === 1 ? '' : 's') : 'Showing 0 workspaces';
      });
      this.rowAction = (action, id) => {
        if (action === 'delete') {
          this.deleteWorkspace(id);
        } else if (action === 'copy') {
          const entry = data().find((d) => d.workspace.id === id);
          if (entry && entry.workspace.svnUrl) {
            ui.copy(entry.workspace.svnUrl).then(() => toast.success('Repository URL copied.'))
              .catch(() => toast.error('The URL could not be copied. Select it and copy it by hand.'));
          }
        } else {
          dashboard.open(action === 'edit' ? 'code' : action, id)();
        }
      };
      this.detailMoreItems = ko.pureComputed(() => [
        { value: 'code', label: 'Open code', icon: 'code' },
        { value: 'profile', label: 'Project Profile', icon: 'doc' },
        { value: 'copy', label: 'Copy repository URL', icon: 'share' },
        { separator: true },
        { value: 'delete', label: 'Delete', icon: 'trash', danger: true, disabled: !this.isAdmin() }
      ]);
      this.moreActionItems = [
        { value: 'code', label: 'Open code', icon: 'code' },
        { value: 'profile', label: 'Project Profile', icon: 'doc' },
        { value: 'requirements', label: 'Requirements', icon: 'list' },
        { value: 'designer', label: 'Designer', icon: 'design' },
        { value: 'copy', label: 'Copy repository URL', icon: 'share' }
      ];
      this.detailMenu = (event) => this.selectedWs() && this.rowAction(event.detail.value, this.selectedWs().id);
      this.copyUrl = () => this.selectedWs() && this.rowAction('copy', this.selectedWs().id);
      this.openProfile = (event) => { event.preventDefault(); dashboard.open('profile', this.selectedWs() ? this.selectedWs().id : undefined)(); };
      this.openCode = (event) => { event.preventDefault(); dashboard.open('code', this.selectedWs() ? this.selectedWs().id : undefined)(); };

      // Recent activity in the registry, with dates
      this.regActivity = ko.pureComputed(() => {
        const items = [];
        data().forEach((d) => {
          const w = d.workspace;
          items.push({ css: 'factory-ws-dot factory-ws-dot-violet', icon: 'factory-nav-icon factory-ico-cube', text: 'Workspace ' + w.name + ' registered', at: w.createdAt });
          d.imports.forEach((j) => {
            const done = j.status === 'SUCCEEDED';
            const failed = j.status === 'FAILED';
            items.push({
              css: 'factory-ws-dot ' + (done ? 'factory-ws-dot-green' : (failed ? 'factory-ws-dot-amber' : 'factory-ws-dot-blue')),
              icon: 'factory-nav-icon ' + (done ? 'factory-ico-check' : (failed ? 'factory-ico-alert' : 'factory-ico-refresh')),
              text: done ? w.name + ' indexed successfully (' + j.filesIndexed + ' files)' : (failed ? 'Indexing of ' + w.name + ' failed' : 'Indexing of ' + w.name + ' started'),
              at: j.finishedAt || j.createdAt
            });
          });
          d.requirements.forEach((r) => items.push({ css: 'factory-ws-dot factory-ws-dot-violet', icon: 'factory-nav-icon factory-ico-doc', text: 'Requirement "' + r.title + '" updated in ' + w.name, at: r.updatedAt }));
        });
        return items.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5).map((i) => Object.assign(i, { date: ui.when(i.at) }));
      });

      const load = () => Promise.all([dashboard.load(), workspaceSelection.load()]).catch(showError);

      this.createWorkspace = () => {
        this.showErrors(true);
        const firstInvalid = [['name', this.nameError], ['bankName', this.bankError], ['obdxVersion', this.versionError]].find((f) => f[1]());
        if (firstInvalid) {
          const field = document.getElementById(firstInvalid[0]);
          const control = field ? field.querySelector('input, button') : null;
          if (control) {
            control.focus();
          }
          return;
        }
        const svnUrl = this.inspection().svnUrl;
        const withLogin = this.sourceKind() === 'url' && this.svnUsername().trim();
        this.saving(true);
        api.post('workspaces', {
          name: this.name().trim(),
          bankName: this.bankName().trim(),
          obdxVersion: this.obdxVersion(),
          svnUrl: svnUrl
        }).then((workspace) => (withLogin
          ? api.put('workspaces/' + workspace.id + '/svn', { svnUrl: svnUrl, svnUsername: this.svnUsername().trim(), svnPassword: this.svnPassword() })
          : Promise.resolve()
        ).then(() => (this.importNow() ? api.post('workspaces/' + workspace.id + '/imports') : null))
          .then(() => workspaceSelection.load())
          .then(() => {
            workspaceSelection.selectedId(workspace.id);
            toast.success('Workspace ' + workspace.name + ' created' + (this.importNow() ? '; the code import has started.' : '.'));
            if (this.importNow()) {
              window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'code' }));
              return null;
            }
            this.name('');
            this.bankName('');
            this.obdxVersion('22.x');
            this.showErrors(false);
            suggested = initialSuggested();
            reset();
            return load();
          }))
          .catch(showError)
          .finally(() => this.saving(false));
      };

      this.deleteWorkspace = (id) => {
        const entry = data().find((d) => d.workspace.id === id);
        const name = entry ? entry.workspace.name : 'this workspace';
        dialog.confirm({
          title: 'Delete ' + name + '?',
          message: 'The workspace is deleted with its code index, profile and requirements. This cannot be undone.',
          confirmLabel: 'Delete', danger: true
        }).then((ok) => {
          if (!ok) {
            return null;
          }
          return api.del('workspaces/' + id)
            .then(() => { toast.success('Workspace ' + name + ' deleted.'); return load(); })
            .catch((error) => toast.error(error.message));
        });
      };

      this.connected = () => {
        accUtils.announce('Workspaces page loaded.');
        document.title = 'Workspaces';
        polling = true;
        liveSubscription = data.subscribe(poll);
        load().then(poll);
        if (session.isAdmin()) {
          // A source started on the Overview page: check it here, or open the folder browser.
          const request = pageRequests.newWorkspace();
          pageRequests.newWorkspace(null);
          loadLocal().then(() => {
            if (!request) {
              return;
            }
            this.sourceKind(request.kind === 'folder' && this.localEnabled() ? 'folder' : 'url');
            if (this.sourceKind() === 'folder') {
              this.folderPath(request.value);
              if (request.browse) {
                this.toggleBrowse();
              } else if (request.value) {
                this.checkFolder();
              }
            } else {
              this.svnUrl(request.value);
              if (request.value) {
                this.checkUrl();
              }
            }
            focusCreate();
          });
        }
      };

      let liveSubscription = null;
      this.disconnected = () => {
        polling = false;
        clearTimeout(pollTimer);
        if (liveSubscription) {
          liveSubscription.dispose();
        }
      };
    }

    return WorkspacesViewModel;
  }
);
