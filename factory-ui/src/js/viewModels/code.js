/*
 * Code page: SVN settings, UI target, Jenkins settings, quick check rules, import jobs, index status and code search for
 * one workspace.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/pageRequests', '../services/ui', '../services/assistant', '../services/dashboard', '../services/toast',
        'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, pageRequests, ui, assistant, dashboard, toast) {
    // Server statuses as design-system status chips (ui.status: the category gives colour and icon), in this page's words
    const status = (raw, words, title) => Object.assign(ui.status(raw, words), { title: title || '' });
    const JOB_WORDS = { SUCCEEDED: 'Succeeded', FAILED: 'Failed', RUNNING: 'Running', QUEUED: 'Queued' };
    const failed = (error) => toast.error(error.message);
    const POLL_MS = 2000;

    /** "4m 32s", "12s" */
    function duration(ms) {
      const seconds = Math.max(0, Math.round(ms / 1000));
      return seconds >= 60 ? Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's' : seconds + 's';
    }

    // A file glob of a version pack rule as a regular expression on forward-slash paths
    function globRegex(glob) {
      let out = '';
      for (let i = 0; i < glob.length; i++) {
        const c = glob.charAt(i);
        if (c === '*' && glob.charAt(i + 1) === '*') {
          out += glob.charAt(i + 2) === '/' ? '(?:.*/)?' : '.*';
          i += glob.charAt(i + 2) === '/' ? 2 : 1;
        } else if (c === '*') {
          out += '[^/]*';
        } else if (c === '?') {
          out += '[^/]';
        } else {
          out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        }
      }
      return new RegExp('^' + out + '$');
    }

    /** A file:/// SVN URL as a folder path, and back */
    const urlToFolder = (url) => {
      const path = decodeURIComponent((url || '').replace(/^file:\/\/\/?/, ''));
      return /^[A-Za-z]:/.test(path) ? path.replace(/\//g, '\\') : (path ? '/' + path.replace(/^\/+/, '') : '');
    };
    const folderToUrl = (path) => {
      const p = (path || '').trim().replace(/\\/g, '/');
      return p ? (/^[A-Za-z]:/.test(p) ? 'file:///' + p : 'file://' + (p.charAt(0) === '/' ? p : '/' + p)) : '';
    };
    const sizeText = (bytes) => (bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : (bytes >= 1024 ? Math.round(bytes / 1024) + ' KB' : bytes + ' B'));
    const LANGUAGE_NAMES = { java: 'Java', javascript: 'JavaScript', html: 'HTML', css: 'CSS', sql: 'SQL', xml: 'XML', json: 'JSON', properties: 'Properties', typescript: 'TypeScript', jsp: 'JSP' };

    function CodeViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.workspace = ko.observable(null);
      this.canManage = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));

      this.svnUrl = ko.observable('');
      this.svnUsername = ko.observable('');
      this.svnPassword = ko.observable('');
      this.svnMessage = ko.observable('');
      // SVN credentials sit in an Advanced settings section: open when the workspace has a username or a stored password
      this.svnAdvancedOpen = ko.observable(false);
      this.busy = ko.observable(false);
      this.errorMessage = ko.observable('');

      // UI target: Oracle JET (the bank's OBDX UI) or a new React Native / React app in its own folder
      this.targets = ko.observableArray([]);
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
          .then(() => toast.success('UI target saved.'))
          .catch(failed);
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
        css: 'fx-chip',
        pressed: ko.pureComputed(() => (this.ruleFilter() === f.value ? 'true' : 'false')),
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
      this.jenkinsAdvancedOpen = ko.observable(false);
      this.jenkinsModes = [
        { value: 'BRANCH', label: 'Build the change branch' }, { value: 'PATCH', label: 'Send the patch to apply on trunk' }
      ];
      this.jenkinsBranchValues = [
        { value: 'PATH', label: 'Path, e.g. branches/factory/cr-1a2b3c4d' }, { value: 'URL', label: 'Full SVN URL' }
      ];

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
        // Advanced settings start open when a value inside differs from the default
        this.jenkinsAdvancedOpen(this.jenkinsBranchParameter() !== 'BRANCH' || this.jenkinsBranchValue() !== 'PATH' || this.jenkinsPatchParameter() !== 'PATCH');
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
        }).then((settings) => { showJenkins(settings); toast.success('Jenkins settings saved.'); })
          .catch(failed)
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
            toast.success('Jenkins connection works.');
          })
          .catch(failed)
          .finally(() => this.busy(false));
      };

      this.indexStatus = ko.observable(null);
      const jobs = ko.observableArray([]);
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
        const index = this.indexStatus();
        const importFailed = jobs().length > 0 && jobs()[0].status === 'FAILED';
        if (this.importRunning()) {
          return status('IMPORTING', 'Importing');
        }
        if (importFailed) {
          return status('FAILED', 'Last import failed');
        }
        if (!index || index.indexedRevision === null) {
          return status('NEW', 'Not imported');
        }
        return status('SUCCEEDED', 'Up to date');
      });
      this.jobCount = ko.pureComputed(() => jobs().length);

      this.query = ko.observable('');
      this.results = ko.observableArray([]);
      this.searchNote = ko.observable('');
      this.searching = ko.observable(false);

      let pollTimer = null;
      let jobsWorkspace = null;
      const showError = (error) => this.errorMessage(error.message);

      const showChecks = (checks) => {
        const id = this.workspaceId();
        const canManage = this.canManage();
        const enabled = checks.rules.filter((r) => r.enabled).length;
        this.checksSummary(checks.description + ': ' + enabled + ' of ' + checks.rules.length + ' rules on. Java is checked at level '
          + checks.javaLevel + ' (from the ' + checks.javaLevelSource + ').');
        const setEnabled = (r, enabled) => api.put('workspaces/' + id + '/checks/' + encodeURIComponent(r.id), { enabled: enabled })
          .then((result) => { showChecks(result); toast.success('Rule "' + r.title + '" turned ' + (enabled ? 'on' : 'off') + '.'); })
          .catch(failed);
        this.checkRules(checks.rules.map((r) => ({
          id: r.id,
          title: r.title,
          message: r.message,
          severity: r.severity.toLowerCase(),
          files: r.files.join(', ') + (r.exclude.length ? ' (not ' + r.exclude.join(', ') + ')' : ''),
          filesShort: r.files.join(', '),
          include: r.files.map(globRegex),
          exclude: r.exclude.map(globRegex),
          appliesTo: r.appliesTo,
          enabled: r.enabled,
          canManage: canManage,
          note: r.matchesProfile ? '' : 'Does not apply to this codebase (Project Profile).',
          switchTip: canManage ? null : 'Only workspace managers can turn rules on or off',
          flip: () => setEnabled(r, !r.enabled),
          menuItems: [
            { value: 'toggle', label: r.enabled ? 'Turn off' : 'Turn on', disabled: !canManage },
            { value: 'details', label: 'Show in Quick Checks' },
            { value: 'packs', label: 'Open Version Packs' }
          ],
          menu: (event) => {
            const action = event.detail.value;
            if (action === 'toggle') {
              setEnabled(r, !r.enabled);
            } else if (action === 'details') {
              this.ruleQuery(r.title);
              this.tab('checks');
            } else {
              window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'packs' }));
            }
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
          const local = /^file:/.test(workspace.svnUrl || '');
          this.folderPath(urlToFolder(local ? workspace.svnUrl : ''));
          this.sourceKind(local && this.localEnabled() ? 'folder' : 'url');
          loadFiles(id);
          this.svnUsername(workspace.svnUsername || '');
          this.svnPassword('');
          this.svnAdvancedOpen(!!(workspace.svnUsername || workspace.svnPasswordSet));
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
            // A reindex this page watched has ended: say how it went
            const watched = jobsWorkspace === id && this.importRunning();
            jobsWorkspace = id;
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
              duration: job.startedAt && job.finishedAt ? duration(new Date(job.finishedAt) - new Date(job.startedAt)) : '',
              raw: job
            })));
            this.indexStatus(status);
            if (watched && !this.importRunning() && jobs().length) {
              const last = jobs()[0];
              if (last.status === 'SUCCEEDED') {
                toast.success('Reindexing finished: ' + last.raw.filesIndexed + ' files indexed, ' + last.raw.filesRemoved + ' removed, revision ' + (last.raw.toRevision === null ? '?' : 'r' + last.raw.toRevision) + '.');
              } else {
                toast.error('Reindexing failed' + (last.message ? ': ' + last.message : '.'));
              }
            }
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
          toast.success('SVN settings saved.');
        }).catch(failed).finally(() => this.busy(false));
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
          .catch((error) => { this.svnOk(false); failed(error); })
          .finally(() => this.busy(false));
      };

      this.startImport = () => {
        this.errorMessage('');
        api.post('workspaces/' + this.workspaceId() + '/imports')
          .then((result) => { toast.info('Reindexing started.'); return refreshImports(result); }).catch(failed);
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
      this.openKnowledge = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'knowledge' }));
      this.showHistory = () => this.tab('history');
      this.showChecks = () => this.tab('checks');
      // A rule's status from the quick checks of the files the factory generated in this workspace
      const checkedFiles = ko.pureComputed(() => {
        const entry = dashboard.data().find((d) => d.workspace.id === this.workspaceId());
        return entry ? (entry.changeDetails || []).filter(Boolean).reduce((list, c) => list.concat((c.files || [])
          .filter((f) => f.checkStatus && f.checkStatus !== 'NOT_CHECKED')), []) : [];
      });
      const ruleStatus = (r) => {
        const files = checkedFiles().filter((f) => r.include.some((x) => x.test(f.path)) && !r.exclude.some((x) => x.test(f.path)));
        if (!files.length) {
          return status('NOT_CHECKED', 'Not run', 'No generated file of this kind has been checked yet');
        }
        const hits = files.filter((f) => (f.checkMessage || '').indexOf('(' + r.id + ',') >= 0);
        if (hits.length) {
          return r.severity === 'error'
            ? status('FAILED', 'Failed', 'Found in ' + hits.map((f) => f.path).join(', '))
            : status('WARNING', 'Warning', 'Found in ' + hits.map((f) => f.path).join(', '));
        }
        return status('PASSED', 'Passed', files.length + ' generated file(s) checked');
      };
      this.compactRules = ko.pureComputed(() => this.visibleRules().slice(0, 8).map((r) => Object.assign({}, r, { status: ruleStatus(r) })));
      this.ruleQueryInput = ui.value(this.ruleQuery);

      // Repository configuration: a folder on this computer (saved as a file:/// URL) or an SVN server
      this.localEnabled = ko.observable(false);
      this.sourceKind = ko.observable('url');
      this.folderPath = ko.observable('');
      this.folderPath.subscribe((path) => {
        if (this.sourceKind() === 'folder') {
          this.svnUrl(folderToUrl(path));
        }
      });
      this.pickKind = (event) => {
        const kind = event.target.value;
        if (kind === 'folder') {
          this.folderPath(urlToFolder(this.svnUrl()));
        }
        this.sourceKind(kind);
      };
      this.lastImportOk = ko.pureComputed(() => jobs().length > 0 && jobs()[0].status === 'SUCCEEDED');
      this.repoConnected = ko.pureComputed(() => this.svnOk() || this.lastImportOk());
      this.connectedTitle = ko.pureComputed(() => (this.svnOk() ? 'The connection test succeeded' : 'The last code import read the repository'));

      // Recent Index Results: the indexed files when the server lists them, else the latest index runs
      const fileList = ko.observableArray([]);
      this.filesListed = ko.observable(false);
      const packageOf = (path) => {
        const m = /(?:^|\/)(?:src\/(?:main\/java\/)?|java\/)((?:[a-z_][\w]*\/)+)[^/]+\.java$/.exec(path);
        return m ? m[1].replace(/\/$/, '').replace(/\//g, '.') : '–';
      };
      this.recentFiles = ko.pureComputed(() => fileList().slice().sort((a, b) => (b.revision - a.revision) || a.path.localeCompare(b.path)).slice(0, 5)
        .map((f, i) => ({
          key: i, path: f.path, type: LANGUAGE_NAMES[f.language] || f.language || '–', pkg: packageOf(f.path), size: sizeText(f.sizeBytes || 0),
          revision: 'r' + f.revision,
          menu: (event) => {
            const action = event.detail.value;
            if (action === 'copy') {
              ui.copy(f.path).then(() => toast.success('Path copied.'))
                .catch(() => toast.error('The path could not be copied. Select it and copy it by hand.'));
            } else if (action === 'search') {
              this.query(f.path.split('/').pop());
              this.tab('search');
              this.search();
            } else {
              this.openKnowledge();
            }
          }
        })));
      this.fileMenuItems = [
        { value: 'knowledge', label: 'Open in Knowledge Explorer' },
        { value: 'search', label: 'Search for this file' },
        { value: 'copy', label: 'Copy path' }
      ];
      this.filesNote = ko.pureComputed(() => 'The latest of ' + fileList().length.toLocaleString() + ' indexed files. Import counts are not kept per file.');
      this.viewAllIndex = (event) => {
        event.preventDefault();
        if (this.filesListed()) {
          this.openKnowledge();
        } else {
          this.tab('history');
        }
      };
      const loadFiles = (id) => api.get('workspaces/' + id + '/files?limit=20000')
        .then((list) => { if (id === this.workspaceId()) { fileList(list); this.filesListed(true); } })
        .catch(() => { fileList([]); this.filesListed(false); });

      // Code Search options, applied to the results here: kinds of result and the top-level folder
      this.inContent = ko.observable(true);
      this.inNames = ko.observable(true);
      this.inComments = ko.observable(false);
      this.inContentChange = ui.checked(this.inContent);
      this.inNamesChange = ui.checked(this.inNames);
      this.inCommentsChange = ui.checked(this.inComments);
      this.module = ko.observable('');
      this.moduleChange = ui.value(this.module);
      const topFolder = (path) => (path.indexOf('/') > 0 ? path.split('/')[0] : '');
      this.modules = ko.pureComputed(() => Array.from(new Set(fileList().map((f) => topFolder(f.path))
        .concat(this.results().map((r) => topFolder(r.path))).filter(Boolean))).sort());
      const COMMENT = /(\/\/|\/\*|^\s*\*|<!--|^\s*#)(.*)$/;
      const inComment = (r) => {
        const words = this.query().toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        return (r.snippet || '').split('\n').some((line) => {
          const m = COMMENT.exec(line);
          return m && words.some((w) => m[2].toLowerCase().indexOf(w) >= 0);
        });
      };
      this.filteredResults = ko.pureComputed(() => this.results().filter((r) => {
        const named = r.kind === 'class' || r.kind === 'method';
        const kindOk = (named && this.inNames()) || (!named && this.inContent()) || (this.inComments() && inComment(r));
        return kindOk && (!this.module() || topFolder(r.path) === this.module());
      }));

      // The page's ⋮ menu
      this.headerMenuItems = [
        { value: 'knowledge', label: 'Knowledge Explorer', id: 'openKnowledgeButton' },
        { value: 'history', label: 'Import History' },
        { value: 'index', label: 'Code Index' },
        { value: 'settings', label: 'Settings' }
      ];
      this.headerMenu = (event) => {
        const action = event.detail.value;
        if (action === 'knowledge') {
          this.openKnowledge();
        } else {
          this.tab(action);
        }
      };

      // AI Assistant: answers from the workspace, its index and the current search results
      this.ai = assistant.create(() => {
        const w = this.workspace();
        if (!w) {
          return '';
        }
        const status = this.indexStatus();
        const lines = ['Workspace: ' + w.name + ' (' + w.bankName + ', OBDX ' + w.obdxVersion + '), SVN ' + (w.svnUrl || 'not set')];
        if (status) {
          lines.push('Index: ' + status.files + ' files, ' + status.chunks + ' searchable pieces, revision ' + status.indexedRevision
            + ', files by language: ' + JSON.stringify(status.filesByLanguage));
        }
        lines.push('Quick check rules: ' + this.checkRules().map((r) => r.title + ' (' + r.severity + (r.enabled ? '' : ', off') + ')').join('; '));
        if (this.results().length) {
          lines.push('Code search for "' + this.query() + '":');
          this.results().slice(0, 6).forEach((r) => lines.push('--- ' + r.path + ' lines ' + r.startLine + '-' + r.endLine + ' (' + r.kind + ' ' + (r.symbol || '') + ')\n' + (r.snippet || '').slice(0, 1500)));
        } else {
          lines.push('No code search results yet; the user can search with Code Search to give more code.');
        }
        return lines.join('\n');
      }, ['Explain this class', 'Find where this method is used', 'Suggest improvements', 'Generate unit tests']);
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
      this.recentJobs = ko.pureComputed(() => jobs().slice(0, 4).map((j) => Object.assign({}, j, { pill: status(j.status, JOB_WORDS[j.status]) })));
      this.historyJobs = ko.pureComputed(() => jobs().map((j) => Object.assign({}, j, { pill: status(j.status, JOB_WORDS[j.status]) })));
      // Indexing progress: the running import's files, or 100% once imported
      this.indexProgress = ko.pureComputed(() => {
        const running = jobs().find((job) => job.status === 'QUEUED' || job.status === 'RUNNING');
        if (running) {
          return running.progress;
        }
        return this.indexStatus() && this.indexStatus().indexedRevision !== null ? 100 : 0;
      });
      this.indexProgressWidth = ko.pureComputed(() => this.indexProgress() + '%');
      // The running import, as GET /imports reports it while the page polls (every 2 seconds)
      this.liveImport = ko.pureComputed(() => {
        const running = jobs().find((job) => job.status === 'QUEUED' || job.status === 'RUNNING');
        if (!running) {
          return null;
        }
        const j = running.raw;
        const started = j.startedAt ? ui.when(j.startedAt) : '';
        return {
          pill: status(j.status, JOB_WORDS[j.status]),
          text: j.status === 'QUEUED' ? 'Waiting for the import to start.'
            : (j.filesScanned ? (j.filesIndexed + j.filesRemoved).toLocaleString() + ' of ' + j.filesScanned.toLocaleString() + ' scanned files processed'
              : 'Running; the server has not counted the files yet.'),
          rows: [
            { label: 'Files indexed', value: j.filesIndexed.toLocaleString() }, { label: 'Files removed', value: j.filesRemoved.toLocaleString() },
            { label: 'Searchable pieces', value: j.chunksIndexed.toLocaleString() }, { label: 'Embeddings', value: j.embeddingsCreated.toLocaleString() },
            { label: 'Revisions', value: running.revisions }, { label: 'Started', value: started || 'Not yet' }
          ],
          message: j.message || ''
        };
      });

      this.connected = () => {
        accUtils.announce('Code page loaded.');
        dashboard.load();
        api.get('sources/local').then((local) => {
          this.localEnabled(!!local.enabled);
          if (local.enabled && /^file:/.test(this.svnUrl())) {
            this.folderPath(urlToFolder(this.svnUrl()));
            this.sourceKind('folder');
          }
        }).catch(() => null);
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
