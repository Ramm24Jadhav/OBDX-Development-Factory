/*
 * Code page: SVN settings, import jobs, index status and code search for one workspace.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojselectsingle', 'ojs/ojinputtext', 'ojs/ojbutton',
        'ojs/ojtoolbar', 'ojs/ojtable'],
  function (ko, accUtils, api, workspaceSelection, session, ArrayDataProvider) {
    const POLL_MS = 2000;

    function CodeViewModel() {
      this.workspaceProvider = new ArrayDataProvider(workspaceSelection.options, { keyAttributes: 'value' });
      this.workspaceId = workspaceSelection.selectedId;
      this.workspace = ko.observable(null);
      this.canManage = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));

      this.svnUrl = ko.observable('');
      this.svnUsername = ko.observable('');
      this.svnPassword = ko.observable('');
      this.svnMessage = ko.observable('');
      this.busy = ko.observable(false);
      this.errorMessage = ko.observable('');

      this.indexStatus = ko.observable(null);
      this.languageSummary = ko.pureComputed(() => {
        const status = this.indexStatus();
        if (!status) {
          return '';
        }
        return Object.keys(status.filesByLanguage).sort()
          .map((language) => language + ' ' + status.filesByLanguage[language]).join(', ') || 'none';
      });
      const jobs = ko.observableArray([]);
      this.jobProvider = new ArrayDataProvider(jobs, { keyAttributes: 'id' });
      this.importRunning = ko.pureComputed(() => jobs().some((job) => job.status === 'QUEUED' || job.status === 'RUNNING'));

      this.query = ko.observable('');
      this.results = ko.observableArray([]);
      this.searchNote = ko.observable('');
      this.searching = ko.observable(false);

      let pollTimer = null;
      const showError = (error) => this.errorMessage(error.message);

      const loadWorkspace = (id) => {
        this.errorMessage('');
        this.svnMessage('');
        this.results([]);
        this.searchNote('');
        if (!id) {
          this.workspace(null);
          return Promise.resolve();
        }
        return api.get('workspaces/' + id).then((workspace) => {
          this.workspace(workspace);
          this.svnUrl(workspace.svnUrl || '');
          this.svnUsername(workspace.svnUsername || '');
          this.svnPassword('');
          return refreshImports();
        }).catch(showError);
      };

      const refreshImports = () => {
        const id = this.workspaceId();
        if (!id) {
          return Promise.resolve();
        }
        return Promise.all([api.get('workspaces/' + id + '/imports'), api.get('workspaces/' + id + '/index')])
          .then(([jobList, status]) => {
            if (id !== this.workspaceId()) {
              return;
            }
            jobs(jobList.map((job) => ({
              id: job.id,
              status: job.status,
              created: new Date(job.createdAt).toLocaleString(),
              revisions: (job.fromRevision === null ? '' : 'r' + job.fromRevision + ' → ') + (job.toRevision === null ? '…' : 'r' + job.toRevision),
              files: job.filesIndexed + ' / ' + job.filesRemoved + ' (of ' + job.filesScanned + ' scanned)',
              chunksIndexed: job.chunksIndexed,
              embeddingsCreated: job.embeddingsCreated,
              message: job.message || ''
            })));
            this.indexStatus(status);
            schedulePoll();
          })
          .catch(showError);
      };

      const schedulePoll = () => {
        clearTimeout(pollTimer);
        if (this.importRunning()) {
          pollTimer = setTimeout(refreshImports, POLL_MS);
        }
      };

      let subscription = null;

      this.saveSvn = () => {
        this.busy(true);
        this.svnMessage('');
        this.errorMessage('');
        api.put('workspaces/' + this.workspaceId() + '/svn', {
          svnUrl: this.svnUrl(),
          svnUsername: this.svnUsername() || null,
          svnPassword: this.svnPassword() ? this.svnPassword() : null
        }).then((workspace) => {
          this.workspace(workspace);
          this.svnPassword('');
          this.svnMessage('SVN settings saved.');
        }).catch(showError).finally(() => this.busy(false));
      };

      this.testSvn = () => {
        this.busy(true);
        this.svnMessage('');
        this.errorMessage('');
        api.post('workspaces/' + this.workspaceId() + '/svn/test')
          .then((info) => this.svnMessage('Connected. Latest revision r' + info.headRevision + ' in ' + info.repositoryRoot + '.'))
          .catch(showError)
          .finally(() => this.busy(false));
      };

      this.startImport = () => {
        this.errorMessage('');
        api.post('workspaces/' + this.workspaceId() + '/imports').then(refreshImports).catch(showError);
      };

      this.search = () => {
        if (!this.query().trim()) {
          return;
        }
        this.searching(true);
        this.errorMessage('');
        api.get('workspaces/' + this.workspaceId() + '/search?q=' + encodeURIComponent(this.query()))
          .then((response) => {
            this.results(response.results);
            this.searchNote(response.results.length === 0 ? 'No matches.' : (response.semanticNote || ''));
          })
          .catch(showError)
          .finally(() => this.searching(false));
      };

      this.connected = () => {
        accUtils.announce('Code page loaded.');
        document.title = 'Code';
        subscription = this.workspaceId.subscribe(loadWorkspace);
        const before = this.workspaceId();
        // If loading the list changed the selection, the subscription has already loaded the workspace.
        workspaceSelection.load().then(() => { if (this.workspaceId() === before) { loadWorkspace(before); } }).catch(showError);
      };

      this.disconnected = () => {
        clearTimeout(pollTimer);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return CodeViewModel;
  }
);
