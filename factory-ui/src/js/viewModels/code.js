/*
 * Code page: SVN settings, UI target, Jenkins settings, quick check rules, import jobs, index status and code search for
 * one workspace.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/pageRequests', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojselectsingle', 'ojs/ojinputtext', 'ojs/ojbutton',
        'ojs/ojtoolbar', 'ojs/ojtable', 'ojs/ojswitch'],
  function (ko, accUtils, api, workspaceSelection, session, pageRequests, ArrayDataProvider) {
    const POLL_MS = 2000;

    /** "4m 32s", "12s" */
    function duration(ms) {
      const seconds = Math.max(0, Math.round(ms / 1000));
      return seconds >= 60 ? Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's' : seconds + 's';
    }

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

      // UI target: Oracle JET (the bank's OBDX UI) or a new React Native / React app in its own folder
      this.targets = ko.observableArray([]);
      this.targetProvider = new ArrayDataProvider(this.targets, { keyAttributes: 'value' });
      this.targetId = ko.observable('jet');
      this.appFolder = ko.observable('');
      this.targetMessage = ko.observable('');
      this.targetWarning = ko.observable(false);
      const packs = ko.observableArray([]);
      this.mappingRows = ko.pureComputed(() => {
        const pack = packs().find((p) => p.id === this.targetId());
        return pack ? Object.keys(pack.components).map((type) => ({
          type: type,
          component: '<' + pack.components[type].component + (pack.components[type].props ? ' ' + pack.components[type].props : '') + '>'
        })) : [];
      });
      this.targetId.subscribe((id) => {
        const pack = packs().find((p) => p.id === id);
        if (pack && pack.defaultAppFolder && !this.appFolder()) {
          this.appFolder(pack.defaultAppFolder);
        }
      });
      const showTarget = (target) => {
        this.targetId(target.target);
        this.appFolder(target.appFolder || '');
        const missing = target.target !== 'jet' && !target.appFolderExists;
        this.targetWarning(missing);
        this.targetMessage(target.target === 'jet' ? '' : missing
          ? 'The imported code has no app in ' + target.appFolder + '/ yet. Download the starter project, commit it to that folder with TortoiseSVN, then import again.'
          : target.title + ' app found in ' + target.appFolder + '/.');
      };
      this.saveTarget = () => {
        this.targetMessage('');
        const id = this.workspaceId();
        api.put('workspaces/' + id + '/target', { target: this.targetId(), appFolder: this.appFolder() || null })
          .then(showTarget)
          // The quick-check rules include the target pack's for the app folder.
          .then(() => api.get('workspaces/' + id + '/checks')).then(showChecks)
          .catch(showError);
      };

      // Quick checks: the workspace's version pack rules, each of which can be turned off
      this.checksSummary = ko.observable('');
      this.checkRules = ko.observableArray([]);
      this.ruleFilter = ko.observable('all');
      this.ruleQuery = ko.observable('');
      this.ruleCount = (severity) => ko.pureComputed(() => this.checkRules().filter((r) => severity === 'all' || r.severity === severity).length);
      this.ruleFilters = [
        { value: 'all', label: 'All', count: this.ruleCount('all') },
        { value: 'error', label: 'Error', count: this.ruleCount('error') },
        { value: 'warning', label: 'Warning', count: this.ruleCount('warning') }
      ].map((f) => Object.assign(f, {
        css: ko.pureComputed(() => 'factory-chip' + (this.ruleFilter() === f.value ? ' factory-chip-on' : '')),
        pick: () => this.ruleFilter(f.value)
      }));
      this.visibleRules = ko.pureComputed(() => {
        const text = this.ruleQuery().trim().toLowerCase();
        return this.checkRules().filter((r) => (this.ruleFilter() === 'all' || r.severity === this.ruleFilter())
          && (!text || (r.title + ' ' + r.message + ' ' + r.appliesTo + ' ' + r.files).toLowerCase().indexOf(text) >= 0));
      });
      this.rulesOn = ko.pureComputed(() => this.checkRules().filter((r) => r.enabled).length);

      // The page's tabs
      this.tab = ko.observable('repository');
      this.tabs = [
        { value: 'repository', label: 'Repository' },
        { value: 'checks', label: 'Quick Checks' },
        { value: 'index', label: 'Code Index' },
        { value: 'history', label: 'Import History' },
        { value: 'search', label: 'Search' },
        { value: 'settings', label: 'Settings' }
      ].map((t) => Object.assign(t, {
        css: ko.pureComputed(() => 'factory-tab' + (this.tab() === t.value ? ' factory-tab-on' : '')),
        selected: ko.pureComputed(() => this.tab() === t.value),
        pick: () => this.tab(t.value)
      }));
      this.svnOk = ko.observable(false);

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
      const jobs = ko.observableArray([]);
      this.jobProvider = new ArrayDataProvider(jobs, { keyAttributes: 'id' });
      this.importRunning = ko.pureComputed(() => jobs().some((job) => job.status === 'QUEUED' || job.status === 'RUNNING'));
      // The files of each language as a share of all indexed files, for the bars on the Code index tab.
      this.languages = ko.pureComputed(() => {
        const status = this.indexStatus();
        if (!status || !status.files) {
          return [];
        }
        return Object.keys(status.filesByLanguage).map((language) => ({ language: language, files: status.filesByLanguage[language] }))
          .sort((a, b) => b.files - a.files)
          .map((l) => Object.assign(l, { width: Math.max(2, Math.round(100 * l.files / status.files)) + '%' }));
      });
      this.embeddedShare = ko.pureComputed(() => {
        const status = this.indexStatus();
        return status && status.chunks ? Math.round(100 * status.chunksWithEmbedding / status.chunks) : 0;
      });
      this.embeddedWidth = ko.pureComputed(() => this.embeddedShare() + '%');
      const lastDone = ko.pureComputed(() => jobs().find((job) => job.status === 'SUCCEEDED') || null);
      this.lastIndexedText = ko.pureComputed(() => (lastDone() ? lastDone().finished : ''));
      this.lastDurationText = ko.pureComputed(() => (lastDone() ? lastDone().duration : ''));
      // The status pill in the page header
      this.indexPill = ko.pureComputed(() => {
        const status = this.indexStatus();
        const failed = jobs().length > 0 && jobs()[0].status === 'FAILED';
        if (this.importRunning()) {
          return { text: 'Importing', css: 'factory-ov-pill factory-ov-pill-blue' };
        }
        if (failed) {
          return { text: 'Last import failed', css: 'factory-ov-pill factory-ov-pill-red' };
        }
        if (!status || status.indexedRevision === null) {
          return { text: 'Not imported', css: 'factory-ov-pill factory-ov-pill-grey' };
        }
        return { text: 'Up to date', css: 'factory-ov-pill factory-ov-pill-green' };
      });
      this.jobCount = ko.pureComputed(() => jobs().length);

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
          appliesTo: r.appliesTo,
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
        this.svnOk(false);
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
            api.get('workspaces/' + id + '/checks').then(showChecks),
            api.get('targets').then((list) => {
              packs(list);
              this.targets(list.map((p) => ({ value: p.id, label: p.title })));
              return api.get('workspaces/' + id + '/target');
            }).then(showTarget)]);
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
              message: job.message || '',
              progress: job.filesScanned ? Math.min(100, Math.round(100 * (job.filesIndexed + job.filesRemoved) / job.filesScanned)) : 5,
              finished: job.finishedAt ? new Date(job.finishedAt).toLocaleString() : '',
              duration: job.startedAt && job.finishedAt ? duration(new Date(job.finishedAt) - new Date(job.startedAt)) : ''
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
      let searchSubscription = null;

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
          .then((info) => {
            this.svnOk(true);
            this.svnMessage('Connected. Latest revision r' + info.headRevision + ' in ' + info.repositoryRoot + '.');
          })
          .catch((error) => { this.svnOk(false); showError(error); })
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

      // The Repository tab's summary of the UI target and Jenkins (edited on the Settings tab), its search box and the
      // latest imports
      this.editSettings = () => this.tab('settings');
      this.showHistory = () => this.tab('history');
      this.showChecks = () => this.tab('checks');
      this.compactRules = ko.pureComputed(() => this.visibleRules().slice(0, 8));
      this.searchFromCard = () => {
        if (this.query().trim()) {
          this.tab('search');
          this.search();
        }
      };
      this.targetTitle = ko.pureComputed(() => {
        const target = this.targets().find((t) => t.value === this.targetId());
        return target ? target.label : this.targetId();
      });
      this.jenkinsRows = ko.pureComputed(() => (this.jenkinsSaved() ? [
        { label: 'Jenkins URL', value: this.jenkinsUrl(), link: true },
        { label: 'Jobs', value: this.jenkinsJobs() },
        { label: 'Mode', value: this.jenkinsMode() === 'BRANCH' ? 'Build the change branch' : 'Send the patch to apply on trunk' },
        { label: this.jenkinsMode() === 'BRANCH' ? 'Branch parameter' : 'Patch parameter',
          value: this.jenkinsMode() === 'BRANCH' ? this.jenkinsBranchParameter() : this.jenkinsPatchParameter() },
        { label: 'Username', value: this.jenkinsUsername() || 'None' }
      ] : []));
      this.recentJobs = ko.pureComputed(() => jobs().slice(0, 4));
      // Indexing progress: the running import's files, or 100% once imported
      this.indexProgress = ko.pureComputed(() => {
        const running = jobs().find((job) => job.status === 'QUEUED' || job.status === 'RUNNING');
        if (running) {
          return running.progress;
        }
        return this.indexStatus() && this.indexStatus().indexedRevision !== null ? 100 : 0;
      });
      this.indexProgressWidth = ko.pureComputed(() => this.indexProgress() + '%');

      this.connected = () => {
        accUtils.announce('Code page loaded.');
        document.title = 'Code';
        subscription = this.workspaceId.subscribe(loadWorkspace);
        const before = this.workspaceId();
        // A search from the top bar opens the Search tab with its results.
        const requested = pageRequests.codeSearch();
        pageRequests.codeSearch('');
        const searchRequested = () => {
          if (requested) {
            this.tab('search');
            this.query(requested);
            this.search();
          }
        };
        // If loading the list changed the selection, the subscription has already loaded the workspace.
        workspaceSelection.load().then(() => (this.workspaceId() === before ? loadWorkspace(before) : null))
          .then(searchRequested).catch(showError);
        // Searches from the top bar while this page is open
        searchSubscription = pageRequests.codeSearch.subscribe((text) => {
          if (text) {
            pageRequests.codeSearch('');
            this.tab('search');
            this.query(text);
            this.search();
          }
        });
      };

      this.disconnected = () => {
        clearTimeout(pollTimer);
        if (subscription) {
          subscription.dispose();
        }
        if (searchSubscription) {
          searchSubscription.dispose();
        }
      };
    }

    return CodeViewModel;
  }
);
