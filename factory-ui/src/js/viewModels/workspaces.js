/*
 * Workspaces page: lists workspaces and creates or deletes them through /api/workspaces. A new workspace's code comes
 * from an SVN URL or a folder on the computer the factory runs on (/api/sources); the factory checks it and fills in
 * the name, bank and OBDX version from the code.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojtable', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojselectsingle',
        'ojs/ojbutton', 'ojs/ojvalidationgroup', 'ojs/ojradioset', 'ojs/ojswitch'],
  function (ko, accUtils, api, session, workspaceSelection, ArrayDataProvider) {
    const KIND_LABELS = { WORKING_COPY: 'SVN checkout', REPOSITORY: 'SVN repository' };

    function WorkspacesViewModel() {
      this.isAdmin = session.isAdmin;
      const workspaces = ko.observableArray([]);
      this.workspaceProvider = new ArrayDataProvider(workspaces, { keyAttributes: 'id' });

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

      const loadLocal = () => api.get('sources/local').then((local) => {
        if (!local.enabled) {
          return;
        }
        this.home = local.home;
        sources([{ value: 'folder', label: 'Folder on this computer' }, { value: 'url', label: 'SVN server (URL)' }]);
        this.sourceKind('folder');
        this.roots(local.roots.map((root) => Object.assign({}, root, { open: () => openFolder(root.path) })));
        this.found(local.found.map((repository) => Object.assign({}, repository, { use: () => useFolder(repository.path) })));
      }).catch(() => null);

      const load = () => api.get('workspaces')
        .then((data) => workspaces(data.map((workspace) => Object.assign({}, workspace, {
          createdAt: new Date(workspace.createdAt).toLocaleString(),
          deleteAction: () => this.deleteWorkspace(workspace.id),
          openAction: () => {
            workspaceSelection.selectedId(workspace.id);
            window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'code' }));
          },
          indexed: workspace.indexedRevision !== null && workspace.indexedRevision !== undefined
            ? 'Revision ' + workspace.indexedRevision : 'Not imported',
          canDelete: session.isAdmin()
        }))))
        .catch(showError);

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
          loadLocal();
        }
      };
    }

    return WorkspacesViewModel;
  }
);
