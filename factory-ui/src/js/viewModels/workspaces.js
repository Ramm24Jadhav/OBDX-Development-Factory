/*
 * Workspaces page: lists workspaces and creates or deletes them through /api/workspaces. A new workspace's code comes
 * from an SVN URL or a folder on the computer the factory runs on (/api/sources); the factory checks it and fills in
 * the name, bank and OBDX version from the code.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', '../services/dashboard',
        '../services/pageRequests', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojselectsingle',
        'ojs/ojbutton', 'ojs/ojvalidationgroup', 'ojs/ojswitch', 'ojs/ojmenu'],
  function (ko, accUtils, api, session, workspaceSelection, dashboard, pageRequests, ArrayDataProvider) {
    const KIND_LABELS = { WORKING_COPY: 'SVN checkout', REPOSITORY: 'SVN repository' };
    const WEEK_MS = 7 * 24 * 3600 * 1000;
    const STATUS = {
      ready: { text: 'Completed', css: 'factory-ws-status factory-ws-status-green', icon: 'factory-nav-icon factory-ico-check' },
      importing: { text: 'In Progress', css: 'factory-ws-status factory-ws-status-amber', icon: 'factory-nav-icon factory-ico-clock' },
      failed: { text: 'Check Required', css: 'factory-ws-status factory-ws-status-red', icon: 'factory-nav-icon factory-ico-alert' },
      new: { text: 'Not imported', css: 'factory-ws-status factory-ws-status-grey', icon: 'factory-nav-icon factory-ico-clock' }
    };

    function WorkspacesViewModel() {
      this.isAdmin = session.isAdmin;
      this.versionProvider = new ArrayDataProvider([
        { value: '22.x', label: 'OBDX 22.x' },
        { value: '25.x', label: 'OBDX 25.x' }
      ], { keyAttributes: 'value' });

      // Step 1: where the code is
      const sources = ko.observableArray([{ value: 'url', label: 'SVN server (URL)' }]);
      this.sourceProvider = new ArrayDataProvider(sources, { keyAttributes: 'value' });
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
      this.formValid = ko.observable();
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
        sources([{ value: 'folder', label: 'Folder on this computer' }, { value: 'url', label: 'SVN server (URL)' }]);
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
      this.newWorkspaceMenu = (event) => { this.sourceKind(event.detail.selectedValue); focusCreate(); };
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
          id: w.id, name: w.name, bank: w.bankName, version: w.obdxVersion, svnUrl: w.svnUrl || '', state: state,
          status: STATUS[state], checked: job ? new Date(job.finishedAt || job.createdAt).toLocaleString() : 'Never',
          canDelete: session.isAdmin(),
          open: dashboard.open('code', w.id),
          edit: dashboard.open('code', w.id),
          remove: () => this.deleteWorkspace(w.id),
          select: () => this.selectedWsId(w.id)
        };
      }).filter((r) => {
        const text = this.filterText().trim().toLowerCase();
        return (!text || (r.name + ' ' + r.bank + ' ' + r.svnUrl).toLowerCase().indexOf(text) >= 0)
          && (!this.filterBank() || r.bank === this.filterBank())
          && (!this.filterStatus() || r.state === this.filterStatus())
          && (!this.filterVersion() || r.version === this.filterVersion());
      }));
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
          ready: ready, readyWidth: (d.length ? Math.round(100 * ready / d.length) : 0) + '%',
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

      // The selected workspace's details: overview, project statistics, stack from the profile and indexing
      this.selectedWsId = ko.observable(null);
      this.selectWs = (id) => () => this.selectedWsId(id);
      const wsDetails = ko.observable({});
      this.selectedWs = ko.pureComputed(() => {
        const entry = data().find((d) => d.workspace.id === this.selectedWsId()) || data()[0];
        if (!entry) {
          return null;
        }
        const w = entry.workspace;
        const extra = wsDetails()[w.id] || {};
        const inv = extra.inventory ? extra.inventory.summary : null;
        const fact = (key) => {
          const f = extra.profile ? extra.profile.facts.find((x) => x.key === key) : null;
          return f && f.value ? f.value : 'Not detected';
        };
        const job = entry.imports.length ? entry.imports[0] : null;
        const index = entry.index;
        const pct = index && index.chunks ? Math.round(100 * index.chunksWithEmbedding / index.chunks) : 0;
        return {
          id: w.id, name: w.name, bank: w.bankName, version: 'OBDX ' + w.obdxVersion, svnUrl: w.svnUrl || 'Not set', created: new Date(w.createdAt).toLocaleString(),
          lastIndexed: job ? new Date(job.finishedAt || job.createdAt).toLocaleString() : 'Never', status: STATUS[dashboard.codeState(entry).key],
          members: (extra.members || []).map((m) => ({ initials: m.displayName.split(/\s+/).map((p) => p.charAt(0)).join('').slice(0, 2).toUpperCase(), name: m.displayName + ' (' + m.role.toLowerCase() + ')' })),
          stats: [
            { label: 'Modules', value: inv ? inv.modules : '–' }, { label: 'UI Screens', value: inv ? inv.screens : '–' },
            { label: 'APIs', value: inv ? inv.endpoints : '–' }, { label: 'Indexed Files', value: index ? index.files : '–' },
            { label: 'Requirements', value: entry.requirements.length }, { label: 'Screen Designs', value: entry.designs.length }
          ],
          stack: [
            { label: 'Frontend', value: fact('ui.architecture'), sub: fact('ui.jetVersion'), icon: 'monitor' },
            { label: 'Backend', value: fact('backend.javaVersion'), sub: fact('backend.frameworks'), icon: 'code' },
            { label: 'Database', value: fact('data.databaseType'), sub: '', icon: 'cube' },
            { label: 'Build', value: fact('backend.buildTool'), sub: '', icon: 'cog' },
            { label: 'App Server', value: fact('backend.appServer'), sub: '', icon: 'cube' },
            { label: 'CI / CD', value: extra.jenkins ? 'Jenkins' : 'Not set up', sub: extra.jenkins ? extra.jenkins.jobs : '', icon: 'flask' }
          ].map((s) => Object.assign(s, { iconClass: 'factory-nav-icon factory-ico-' + s.icon })),
          indexing: {
            pct: pct, style: { background: 'conic-gradient(#16a34a ' + pct + '%, #e5eaf1 0)' },
            rows: [
              { label: 'Files indexed', value: index ? index.files : 0, dot: 'factory-step-dot factory-dot-green' },
              { label: 'Searchable pieces', value: index ? index.chunks : 0, dot: 'factory-step-dot factory-dot-blue' },
              { label: 'With embeddings', value: index ? index.chunksWithEmbedding : 0, dot: 'factory-step-dot factory-dot-violet' },
              { label: 'Indexed revision', value: w.indexedRevision ? 'r' + w.indexedRevision : '–', dot: 'factory-step-dot factory-dot-amber' }
            ],
            text: job && (job.status === 'RUNNING' || job.status === 'QUEUED') ? 'Indexing...' : 'Code search by meaning covers ' + pct + '% of the code'
          },
          reindex: () => api.post('workspaces/' + w.id + '/imports').then(() => dashboard.load()).catch(showError),
          edit: dashboard.open('code', w.id), canReindex: session.can(w.id, 'MANAGE_CODE')
        };
      });
      this.selectedWsId.subscribe((id) => this.loadWsDetails(id));
      this.loadWsDetails = (id) => {
        if (!id || wsDetails()[id]) {
          return;
        }
        Promise.all([api.get('workspaces/' + id + '/profile').catch(() => null), api.get('workspaces/' + id + '/inventory').catch(() => null),
          api.get('workspaces/' + id + '/members').catch(() => []), api.get('workspaces/' + id + '/jenkins').catch(() => null)])
          .then(([profile, inventory, members, jenkins]) => { const m = Object.assign({}, wsDetails()); m[id] = { profile: profile, inventory: inventory, members: members, jenkins: jenkins }; wsDetails(m); });
      };
      data.subscribe((list) => { if (!this.selectedWsId() && list.length) { this.selectedWsId(list[0].workspace.id); } });

      this.quickActions = [
        { title: 'Browse Code', text: 'Explore repositories and search code', icon: 'factory-nav-icon factory-ico-code', open: dashboard.open('code') },
        { title: 'View Profile', text: 'Detected stack and conventions', icon: 'factory-nav-icon factory-ico-doc', open: dashboard.open('profile') },
        { title: 'Add Requirement', text: 'Upload BRD/FSD or describe change', icon: 'factory-nav-icon factory-ico-list', open: dashboard.open('requirements') },
        { title: 'Open Designer', text: 'Design and review screens', icon: 'factory-nav-icon factory-ico-design', open: dashboard.open('designer') }
      ];

      const load = () => Promise.all([dashboard.load(), workspaceSelection.load()]).catch(showError);

      this.createWorkspace = () => {
        const form = document.getElementById('workspaceForm');
        if (this.formValid() !== 'valid') {
          form.showMessages();
          form.focusOn('@firstInvalidShown');
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
            if (this.importNow()) {
              window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'code' }));
              return null;
            }
            this.name('');
            this.bankName('');
            this.obdxVersion('22.x');
            suggested = initialSuggested();
            reset();
            return load();
          }))
          .catch(showError)
          .finally(() => this.saving(false));
      };

      this.deleteWorkspace = (id) => {
        if (!window.confirm('Delete this workspace with its code index, profile and requirements?')) {
          return;
        }
        api.del('workspaces/' + id)
          .then(load)
          .catch(showError);
      };

      this.connected = () => {
        accUtils.announce('Workspaces page loaded.');
        document.title = 'Workspaces';
        load();
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
    }

    return WorkspacesViewModel;
  }
);
