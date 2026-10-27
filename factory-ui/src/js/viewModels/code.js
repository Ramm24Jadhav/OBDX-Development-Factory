/*
 * Code page: SVN settings, Jenkins settings, quick check rules, import jobs, index status and code search for one workspace.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojselectsingle', 'ojs/ojinputtext', 'ojs/ojbutton',
        'ojs/ojtoolbar', 'ojs/ojtable', 'ojs/ojswitch'],
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

      // Quick checks: the workspace's version pack rules, each of which can be turned off
      this.checksSummary = ko.observable('');
      this.checkRules = ko.observableArray([]);

      // Jenkins settings
      this.jenkinsUrl = ko.observable('');
      this.jenkinsJobs = ko.observable('');
      this.jenkinsMode = ko.observable('BRANCH');
      this.jenkinsBranchParameter = ko.observable('BRANCH');
      this.jenkinsBranchValue = ko.observable('PATH');
      this.jenkinsPatchParameter = ko.observable('PATCH');
      this.jenkinsUsername = ko.observable('');
      this.jenkinsToken = ko.observable('');
      this.jenkinsTokenSet = ko.observable(false);
      this.jenkinsSaved = ko.observable(false);
      this.jenkinsMessage = ko.observable('');
      this.jenkinsWarnings = ko.observableArray([]);
      this.jenkinsModeProvider = new ArrayDataProvider([
        { value: 'BRANCH', label: 'Build the change branch' }, { value: 'PATCH', label: 'Send the patch to apply on trunk' }
      ], { keyAttributes: 'value' });
      this.jenkinsBranchValueProvider = new ArrayDataProvider([
        { value: 'PATH', label: 'Path, e.g. branches/factory/cr-1a2b3c4d' }, { value: 'URL', label: 'Full SVN URL' }
      ], { keyAttributes: 'value' });

      const showJenkins = (settings) => {
        this.jenkinsSaved(!!settings);
        settings = settings || {};
        this.jenkinsUrl(settings.url || '');
        this.jenkinsJobs(settings.jobs || '');
        this.jenkinsMode(settings.mode || 'BRANCH');
        this.jenkinsBranchParameter(settings.branchParameter || 'BRANCH');
        this.jenkinsBranchValue(settings.branchValue || 'PATH');
        this.jenkinsPatchParameter(settings.patchParameter || 'PATCH');
        this.jenkinsUsername(settings.username || '');
        this.jenkinsToken('');
        this.jenkinsTokenSet(!!settings.tokenSet);
      };

      this.saveJenkins = () => {
        this.busy(true);
        this.jenkinsMessage('');
        this.jenkinsWarnings([]);
        this.errorMessage('');
        api.put('workspaces/' + this.workspaceId() + '/jenkins', {
          url: this.jenkinsUrl(), jobs: this.jenkinsJobs(), mode: this.jenkinsMode(),
          branchParameter: this.jenkinsBranchParameter(), branchValue: this.jenkinsBranchValue(),
          patchParameter: this.jenkinsPatchParameter(), username: this.jenkinsUsername() || null,
          token: this.jenkinsToken() ? this.jenkinsToken() : null
        }).then((settings) => { showJenkins(settings); this.jenkinsMessage('Jenkins settings saved.'); })
          .catch((error) => this.errorMessage(error.message))
          .finally(() => this.busy(false));
      };

      this.testJenkins = () => {
        this.busy(true);
        this.jenkinsMessage('');
        this.jenkinsWarnings([]);
        this.errorMessage('');
        api.post('workspaces/' + this.workspaceId() + '/jenkins/test')
          .then((result) => {
            this.jenkinsMessage('Connected. Jobs: ' + result.jobs.map((j) => j.name + ' (parameters: ' + (j.parameters.join(', ') || 'none') + ')').join('; ') + '.');
            this.jenkinsWarnings(result.warnings);
          })
          .catch((error) => this.errorMessage(error.message))
          .finally(() => this.busy(false));
      };

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

      const showChecks = (checks) => {
        const id = this.workspaceId();
        const canManage = this.canManage();
        const enabled = checks.rules.filter((r) => r.enabled).length;
        this.checksSummary(checks.description + ': ' + enabled + ' of ' + checks.rules.length + ' rules on. Java is checked at level '
          + checks.javaLevel + ' (from the ' + checks.javaLevelSource + ').');
        this.checkRules(checks.rules.map((r) => ({
          id: r.id,
          title: r.title,
          message: r.message,
          severity: r.severity.toLowerCase(),
          files: r.files.join(', ') + (r.exclude.length ? ' (not ' + r.exclude.join(', ') + ')' : ''),
          enabled: r.enabled,
          canManage: canManage,
          note: r.matchesProfile ? '' : 'Does not apply to this codebase (Project Profile).',
          toggle: (event) => {
            if (event.detail.updatedFrom !== 'internal') {
              return;
            }
            api.put('workspaces/' + id + '/checks/' + encodeURIComponent(r.id), { enabled: event.detail.value })
              .then(showChecks).catch(showError);
          }
        })));
      };

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
          this.jenkinsMessage('');
          this.jenkinsWarnings([]);
          return Promise.all([refreshImports(), api.get('workspaces/' + id + '/jenkins').then(showJenkins),
            api.get('workspaces/' + id + '/checks').then(showChecks)]);
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
