/*
 * Code page for one workspace, in four areas: repository health (index status, what needs attention, a check against
 * the repository's latest revision, import history), quick checks (the version pack rules), code search (results open
 * the file at the matching line in a coloured code viewer) and repository settings (SVN, UI target, Jenkins).
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/pageRequests', '../services/ui', '../services/assistant', '../services/dashboard', '../services/toast',
        '../services/syntax', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, pageRequests, ui, assistant, dashboard, toast, syntax) {
    // Server statuses as design-system status chips (ui.status: the category gives colour and icon), in this page's words
    const status = (raw, words, title) => Object.assign(ui.status(raw, words), { title: title || '' });
    const JOB_WORDS = { SUCCEEDED: 'Succeeded', FAILED: 'Failed', RUNNING: 'Running', QUEUED: 'Queued' };
    // A failed request in plain words: a network failure says to check the connection
    const plain = (error) => (/Failed to fetch|NetworkError|Load failed/i.test((error && error.message) || '')
      ? 'Could not reach the factory. Check your connection, then try again.' : (error && error.message) || 'Something went wrong. Try again.');
    const failed = (error) => toast.error(plain(error));
    const POLL_MS = 2000;
    // The code viewer renders at most this many lines (a window around the match for longer files)
    const VIEW_LINES = 4000;
    const plural = (n, word) => n.toLocaleString() + ' ' + word + (n === 1 ? '' : 's');
    // The repository's latest revision, from a check the user ran (POST svn/test), per workspace for this browser session
    const headChecks = {};

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
    const languageName = (l) => LANGUAGE_NAMES[l] || l || 'Other';
    // The index's kinds of searchable piece (the chunkers on the server)
    const KIND_NAMES = { class: 'Class', method: 'Method', file: 'Whole file', lines: 'Lines' };
    const kindName = (k) => KIND_NAMES[k] || k;
    // How a result matched (the server joins keyword and semantic with " + ")
    const matchWords = (m) => (m || 'keyword').split('+').map((x) => (x.trim() === 'semantic' ? 'meaning' : 'words')).join(' and ');
    const topFolder = (path) => (path.indexOf('/') > 0 ? path.split('/')[0] : '');
    const LEVELS = { error: { word: 'Error', icon: 'alert', order: 0 }, warning: { word: 'Warning', icon: 'alert', order: 1 }, info: { word: 'Info', icon: 'info', order: 2 } };

    function CodeViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.workspace = ko.observable(null);
      this.canManage = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.manageTip = ko.pureComputed(() => (this.canManage() ? null : 'Only workspace developers and leads can do this'));
      this.busy = ko.observable(false);
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(plain(error));

      // ---------- The four areas ----------
      this.tab = ko.observable('health');
      this.tabs = [
        { value: 'health', label: 'Repository health' },
        { value: 'checks', label: 'Quick checks' },
        { value: 'search', label: 'Code search' },
        { value: 'settings', label: 'Repository settings' }
      ].map((t) => Object.assign(t, {
        id: 'tab-' + t.value,
        panel: 'panel-' + t.value,
        selected: ko.pureComputed(() => (this.tab() === t.value ? 'true' : 'false')),
        tabindex: ko.pureComputed(() => (this.tab() === t.value ? '0' : '-1')),
        pick: () => this.tab(t.value)
      }));
      // Arrow keys, Home and End move between the tabs (WAI-ARIA tabs pattern)
      this.tabKey = (event) => {
        const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
        const move = keys[event.key];
        if (move === undefined) {
          return true;
        }
        const values = this.tabs.map((t) => t.value);
        const at = values.indexOf(this.tab());
        const next = move === 'first' ? 0 : move === 'last' ? values.length - 1 : (at + move + values.length) % values.length;
        this.tab(values[next]);
        const button = document.getElementById('tab-' + values[next]);
        if (button) {
          button.focus();
        }
        event.preventDefault();
        return false;
      };

      // ---------- Index and imports ----------
      this.indexStatus = ko.observable(null);
      const jobs = ko.observableArray([]);
      this.importRunning = ko.pureComputed(() => jobs().some((job) => job.status === 'QUEUED' || job.status === 'RUNNING'));
      this.indexedRevision = ko.pureComputed(() => (this.indexStatus() ? this.indexStatus().indexedRevision : null));
      this.languages = ko.pureComputed(() => {
        const s = this.indexStatus();
        if (!s || !s.files) {
          return [];
        }
        return Object.keys(s.filesByLanguage).map((language) => ({ language: languageName(language), files: s.filesByLanguage[language] }))
          .sort((a, b) => b.files - a.files)
          .map((l) => Object.assign(l, { width: Math.max(2, Math.round(100 * l.files / s.files)) + '%', count: l.files.toLocaleString() }));
      });
      this.embeddedShare = ko.pureComputed(() => {
        const s = this.indexStatus();
        return s && s.chunks ? Math.round(100 * s.chunksWithEmbedding / s.chunks) : 0;
      });
      const lastDone = ko.pureComputed(() => jobs().find((job) => job.status === 'SUCCEEDED') || null);
      this.indexFacts = ko.pureComputed(() => {
        const s = this.indexStatus();
        if (!s) {
          return [];
        }
        const facts = [
          { label: 'Indexed revision', value: s.indexedRevision === null ? 'Not imported' : 'r' + s.indexedRevision },
          { label: 'Files', value: s.files.toLocaleString() },
          { label: 'Searchable pieces', value: s.chunks.toLocaleString() },
          { label: 'With embeddings', value: s.chunksWithEmbedding.toLocaleString() + (s.chunks ? ' (' + this.embeddedShare() + '%)' : '') }
        ];
        if (lastDone()) {
          facts.push({ label: 'Last indexed', value: lastDone().finished }, { label: 'Took', value: lastDone().duration });
        }
        return facts;
      });
      this.indexPill = ko.pureComputed(() => {
        const index = this.indexStatus();
        const head = this.headCheck();
        if (this.importRunning()) {
          return status('IMPORTING', 'Importing');
        }
        if (jobs().length > 0 && jobs()[0].status === 'FAILED') {
          return status('FAILED', 'Last import failed');
        }
        if (!index || index.indexedRevision === null) {
          return status('NEW', 'Not imported');
        }
        if (head && head.ok && head.revision > index.indexedRevision) {
          return status('WARNING', 'Behind the repository');
        }
        // "Up to date" only when a check against the repository says so; otherwise just "Indexed"
        return head && head.ok ? status('SUCCEEDED', 'Up to date') : status('SUCCEEDED', 'Indexed at r' + index.indexedRevision);
      });
      this.historyOpen = ko.observable(false);
      this.toggleHistory = () => this.historyOpen(!this.historyOpen());
      this.historyJobs = ko.pureComputed(() => jobs().slice(0, this.historyOpen() ? jobs().length : 5)
        .map((j) => Object.assign({}, j, { pill: status(j.status, JOB_WORDS[j.status]) })));
      this.jobCount = ko.pureComputed(() => jobs().length);
      // The running import, as GET /imports reports it while the page polls (every 2 seconds)
      this.liveImport = ko.pureComputed(() => {
        const running = jobs().find((job) => job.status === 'QUEUED' || job.status === 'RUNNING');
        if (!running) {
          return null;
        }
        const j = running.raw;
        return {
          pill: status(j.status, JOB_WORDS[j.status]),
          progress: running.progress,
          width: running.progress + '%',
          text: j.status === 'QUEUED' ? 'Waiting for the import to start.'
            : (j.filesScanned ? (j.filesIndexed + j.filesRemoved).toLocaleString() + ' of ' + j.filesScanned.toLocaleString() + ' scanned files processed'
              : 'Running; the server has not counted the files yet.'),
          rows: [
            { label: 'Files indexed', value: j.filesIndexed.toLocaleString() }, { label: 'Files removed', value: j.filesRemoved.toLocaleString() },
            { label: 'Searchable pieces', value: j.chunksIndexed.toLocaleString() }, { label: 'Embeddings', value: j.embeddingsCreated.toLocaleString() },
            { label: 'Revisions', value: running.revisions }, { label: 'Started', value: j.startedAt ? ui.when(j.startedAt) : 'Not yet' }
          ],
          message: j.message || ''
        };
      });

      let pollTimer = null;
      let jobsWorkspace = null;
      const refreshImports = () => {
        const id = this.workspaceId();
        if (!id) {
          return Promise.resolve();
        }
        return Promise.all([api.get('workspaces/' + id + '/imports'), api.get('workspaces/' + id + '/index')])
          .then(([jobList, indexStatus]) => {
            if (id !== this.workspaceId()) {
              return;
            }
            // A reindex this page watched has ended: say how it went
            const watched = jobsWorkspace === id && this.importRunning();
            jobsWorkspace = id;
            jobs(jobList.map((job) => ({
              id: job.id,
              status: job.status,
              created: ui.when(job.createdAt),
              revisions: (job.fromRevision === null ? '' : 'r' + job.fromRevision + ' → ') + (job.toRevision === null ? '…' : 'r' + job.toRevision),
              files: job.filesIndexed + ' / ' + job.filesRemoved + ' (of ' + job.filesScanned + ' scanned)',
              chunksIndexed: job.chunksIndexed,
              embeddingsCreated: job.embeddingsCreated,
              message: job.message || '',
              progress: job.filesScanned ? Math.min(100, Math.round(100 * (job.filesIndexed + job.filesRemoved) / job.filesScanned)) : 5,
              finished: job.finishedAt ? ui.when(job.finishedAt) : '',
              duration: job.startedAt && job.finishedAt ? duration(new Date(job.finishedAt) - new Date(job.startedAt)) : '',
              raw: job
            })));
            this.indexStatus(indexStatus);
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

      this.startImport = () => {
        this.errorMessage('');
        api.post('workspaces/' + this.workspaceId() + '/imports')
          .then(() => { toast.info('Reindexing started.'); return refreshImports(); }).catch(failed);
      };

      // ---------- Stale index: the repository's latest revision, only from a check the user runs ----------
      this.headCheck = ko.observable(null);
      this.checkingHead = ko.observable(false);
      this.checkHead = () => {
        const id = this.workspaceId();
        this.checkingHead(true);
        api.post('workspaces/' + id + '/svn/test')
          .then((info) => { headChecks[id] = { ok: true, revision: info.headRevision, root: info.repositoryRoot, at: ui.when(new Date()) }; })
          .catch((error) => { headChecks[id] = { ok: false, error: plain(error), at: ui.when(new Date()) }; })
          .finally(() => {
            this.checkingHead(false);
            if (id === this.workspaceId()) {
              this.headCheck(headChecks[id]);
            }
          });
      };
      this.behind = ko.pureComputed(() => {
        const head = this.headCheck();
        const indexed = this.indexedRevision();
        return head && head.ok && indexed !== null ? Math.max(0, head.revision - indexed) : null;
      });

      // ---------- Settings: repository, UI target, Jenkins ----------
      this.svnUrl = ko.observable('');
      this.svnUsername = ko.observable('');
      this.svnPassword = ko.observable('');
      this.svnMessage = ko.observable('');
      this.svnAdvancedOpen = ko.observable(false);
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
          // A new URL makes an earlier check against the repository meaningless
          delete headChecks[workspace.id];
          this.headCheck(null);
          toast.success('SVN settings saved.');
        }).catch(failed).finally(() => this.busy(false));
      };
      this.testSvn = () => {
        const id = this.workspaceId();
        this.busy(true);
        this.svnMessage('');
        this.errorMessage('');
        api.post('workspaces/' + id + '/svn/test')
          .then((info) => {
            headChecks[id] = { ok: true, revision: info.headRevision, root: info.repositoryRoot, at: ui.when(new Date()) };
            this.headCheck(headChecks[id]);
            this.svnMessage('Connected. Latest revision r' + info.headRevision + ' in ' + info.repositoryRoot + '.');
          })
          .catch(failed)
          .finally(() => this.busy(false));
      };
      this.openWorkspaceDetails = (event) => {
        if (event) {
          event.preventDefault();
        }
        pageRequests.workspace(this.workspaceId());
        window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'workspaces' }));
      };

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

      // ---------- Quick checks: the workspace's version pack rules, each of which can be turned off ----------
      this.checksSummary = ko.observable('');
      this.checkRules = ko.observableArray([]);
      this.ruleFilter = ko.observable('all');
      this.ruleQuery = ko.observable('');
      this.ruleCategory = ko.observable('');
      this.ruleStatusFilter = ko.observable('');
      const ruleCount = (severity) => ko.pureComputed(() => this.checkRules().filter((r) => severity === 'all' || r.severity === severity).length);
      this.ruleFilters = [
        { value: 'all', label: 'All', count: ruleCount('all') },
        { value: 'error', label: 'Errors', count: ruleCount('error') },
        { value: 'warning', label: 'Warnings', count: ruleCount('warning') }
      ].map((f) => Object.assign(f, {
        pressed: ko.pureComputed(() => (this.ruleFilter() === f.value ? 'true' : 'false')),
        pick: () => this.ruleFilter(f.value)
      }));
      this.ruleCategories = ko.pureComputed(() => [{ value: '', label: 'All categories' }]
        .concat(Array.from(new Set(this.checkRules().map((r) => r.appliesTo))).sort().map((c) => ({ value: c, label: c }))));
      this.ruleStatuses = [
        { value: '', label: 'All statuses' }, { value: 'FAILED', label: 'Failed' }, { value: 'WARNING', label: 'Warning' },
        { value: 'PASSED', label: 'Passed' }, { value: 'NOT_CHECKED', label: 'Not run' }, { value: 'OFF', label: 'Turned off' }
      ];
      // A rule's status from the quick checks of the files the factory generated in this workspace
      const checkedFiles = ko.pureComputed(() => {
        const entry = dashboard.data().find((d) => d.workspace.id === this.workspaceId());
        return entry ? (entry.changeDetails || []).filter(Boolean).reduce((list, c) => list.concat((c.files || [])
          .filter((f) => f.checkStatus && f.checkStatus !== 'NOT_CHECKED')), []) : [];
      });
      const ruleStatus = (r) => {
        const files = checkedFiles().filter((f) => r.include.some((x) => x.test(f.path)) && !r.exclude.some((x) => x.test(f.path)));
        if (!files.length) {
          return Object.assign(status('NOT_CHECKED', 'Not run', 'No generated file of this kind has been checked yet'), { key: 'NOT_CHECKED' });
        }
        const hits = files.filter((f) => (f.checkMessage || '').indexOf('(' + r.id + ',') >= 0);
        if (hits.length) {
          return r.severity === 'error'
            ? Object.assign(status('FAILED', 'Failed', 'Found in ' + hits.map((f) => f.path).join(', ')), { key: 'FAILED' })
            : Object.assign(status('WARNING', 'Warning', 'Found in ' + hits.map((f) => f.path).join(', ')), { key: 'WARNING' });
        }
        return Object.assign(status('PASSED', 'Passed', plural(files.length, 'generated file') + ' checked'), { key: 'PASSED' });
      };
      const ratedRules = ko.pureComputed(() => this.checkRules().map((r) => Object.assign({}, r, { status: ruleStatus(r) })));
      this.visibleRules = ko.pureComputed(() => {
        const text = this.ruleQuery().trim().toLowerCase();
        const wanted = this.ruleStatusFilter();
        return ratedRules().filter((r) => (this.ruleFilter() === 'all' || r.severity === this.ruleFilter())
          && (!this.ruleCategory() || r.appliesTo === this.ruleCategory())
          && (!wanted || (wanted === 'OFF' ? !r.enabled : r.enabled && r.status.key === wanted))
          && (!text || (r.title + ' ' + r.message + ' ' + r.appliesTo + ' ' + r.files).toLowerCase().indexOf(text) >= 0));
      });
      this.rulesOn = ko.pureComputed(() => this.checkRules().filter((r) => r.enabled).length);
      this.ruleFiltered = ko.pureComputed(() => this.ruleFilter() !== 'all' || !!this.ruleCategory() || !!this.ruleStatusFilter() || !!this.ruleQuery().trim());
      this.clearRuleFilters = () => { this.ruleFilter('all'); this.ruleCategory(''); this.ruleStatusFilter(''); this.ruleQuery(''); };
      const showChecks = (checks) => {
        const id = this.workspaceId();
        const canManage = this.canManage();
        const enabled = checks.rules.filter((r) => r.enabled).length;
        this.checksSummary(checks.description + ': ' + enabled + ' of ' + checks.rules.length + ' rules on. Java is checked at level '
          + checks.javaLevel + ' (from the ' + checks.javaLevelSource + ').');
        const setEnabled = (r, on) => api.put('workspaces/' + id + '/checks/' + encodeURIComponent(r.id), { enabled: on })
          .then((result) => { showChecks(result); toast.success('Rule "' + r.title + '" turned ' + (on ? 'on' : 'off') + '.'); })
          .catch(failed);
        this.checkRules(checks.rules.map((r) => ({
          id: r.id,
          title: r.title,
          message: r.message,
          severity: r.severity.toLowerCase(),
          severityCss: 'fx-badge ' + (r.severity === 'ERROR' ? 'fx-badge--danger' : 'fx-badge--warning'),
          severityText: r.severity === 'ERROR' ? 'Error' : 'Warning',
          files: r.files.join(', ') + (r.exclude.length ? ' (not ' + r.exclude.join(', ') + ')' : ''),
          include: r.files.map(globRegex),
          exclude: r.exclude.map(globRegex),
          appliesTo: r.appliesTo,
          enabled: r.enabled,
          canManage: canManage,
          note: r.matchesProfile ? '' : 'Does not apply to this codebase (Project Profile).',
          switchTip: canManage ? null : 'Only workspace developers and leads can turn rules on or off',
          flip: () => setEnabled(r, !r.enabled)
        })));
      };
      this.openPacks = (event) => {
        if (event) {
          event.preventDefault();
        }
        window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'packs' }));
      };

      // ---------- Repository health: what needs attention, as errors, warnings and information ----------
      const showRules = (statusKey) => () => { this.clearRuleFilters(); this.ruleStatusFilter(statusKey); this.tab('checks'); };
      const toSettings = () => this.tab('settings');
      this.healthItems = ko.pureComputed(() => {
        const items = [];
        const add = (level, id, text, action) => items.push({ level: level, id: id, text: text, action: action || null });
        const s = this.indexStatus();
        const last = jobs()[0];
        const manage = this.canManage();
        const reindex = manage && !this.importRunning() ? { label: 'Reindex', run: this.startImport } : null;
        if (this.importRunning()) {
          add('info', 'healthImporting', 'An import is running. Search shows the previous index until it finishes.');
        }
        if (last && last.status === 'FAILED') {
          add('error', 'healthImportFailed', 'The last import failed' + (last.message ? ': ' + last.message : '.'), reindex);
        }
        if (s && s.indexedRevision === null && !this.importRunning()) {
          add('warning', 'healthNotImported', 'The code has not been imported yet, so search and checks have nothing to work on.', reindex);
        }
        const head = this.headCheck();
        if (head && !head.ok) {
          add('error', 'healthRepository', 'The repository could not be read (' + head.at + '): ' + head.error, { label: 'Open settings', run: toSettings });
        } else if (head && this.behind() > 0) {
          add('warning', 'healthStale', 'The index is ' + plural(this.behind(), 'revision') + ' behind: the repository is at r' + head.revision
            + ', the index at r' + this.indexedRevision() + ' (checked ' + head.at + '). Reindex to search the latest code.', reindex);
        } else if (head && this.behind() === 0) {
          add('info', 'healthFresh', 'The index matches the repository\'s latest revision, r' + head.revision + ' (checked ' + head.at + ').');
        } else if (s && s.indexedRevision !== null) {
          add('info', 'healthUnchecked', manage
            ? 'Not compared with the repository yet. Check for new commits to see whether the index is behind.'
            : 'Not compared with the repository yet. Developers and leads can check it for new commits.',
          manage ? { label: 'Check for new commits', run: this.checkHead } : null);
        }
        if (s && s.chunks > 0 && s.chunksWithEmbedding === 0) {
          add('info', 'healthEmbeddings', 'No searchable piece has an embedding, so search matches words, not meaning.');
        }
        const failedRules = ratedRules().filter((r) => r.enabled && r.status.key === 'FAILED').length;
        const warnedRules = ratedRules().filter((r) => r.enabled && r.status.key === 'WARNING').length;
        if (failedRules) {
          add('error', 'healthRulesFailed', plural(failedRules, 'quick check rule') + ' found errors in generated files.', { label: 'Show rules', run: showRules('FAILED') });
        }
        if (warnedRules) {
          add('warning', 'healthRulesWarned', plural(warnedRules, 'quick check rule') + ' found warnings in generated files.', { label: 'Show rules', run: showRules('WARNING') });
        }
        if (this.targetWarning()) {
          add('warning', 'healthTarget', this.targetMessage(), { label: 'Open settings', run: toSettings });
        }
        const off = this.checkRules().length - this.rulesOn();
        if (off > 0) {
          add('info', 'healthRulesOff', plural(off, 'quick check rule') + ' turned off for this workspace.', { label: 'Show rules', run: showRules('OFF') });
        }
        if (!this.jenkinsSaved()) {
          add('info', 'healthJenkins', 'Jenkins is not set up, so generated changes are not built.', { label: 'Set up Jenkins', run: toSettings });
        }
        return items.sort((a, b) => LEVELS[a.level].order - LEVELS[b.level].order).map((it) => Object.assign(it, {
          css: 'factory-cd-health-item is-' + it.level,
          icon: 'factory-nav-icon factory-ico-' + LEVELS[it.level].icon,
          word: LEVELS[it.level].word,
          badge: 'fx-badge ' + (it.level === 'error' ? 'fx-badge--danger' : it.level === 'warning' ? 'fx-badge--warning' : 'fx-badge--primary')
        }));
      });
      this.healthSummary = ko.pureComputed(() => {
        const count = (level) => this.healthItems().filter((i) => i.level === level).length;
        const parts = [];
        if (count('error')) { parts.push(plural(count('error'), 'error')); }
        if (count('warning')) { parts.push(plural(count('warning'), 'warning')); }
        if (count('info')) { parts.push(count('info') + ' info'); }
        return parts.join(', ') || 'Nothing needs attention';
      });

      // ---------- Code search: results open the file at the matching line ----------
      this.query = ko.observable('');
      this.results = ko.observableArray([]);
      this.searchNote = ko.observable('');
      this.searchError = ko.observable('');
      this.searching = ko.observable(false);
      this.searched = ko.observable('');
      // Filters from what each result carries: language, top-level folder, kind of piece, and how it matched
      this.fType = ko.observable('');
      this.fModule = ko.observable('');
      this.fKind = ko.observable('');
      this.fMatch = ko.observable('');
      const optionsOf = (all, pick, name) => [{ value: '', label: all }].concat(Array.from(new Set(this.results().map(pick).filter(Boolean))).sort()
        .map((v) => ({ value: v, label: name ? name(v) : v })));
      this.typeOptions = ko.pureComputed(() => optionsOf('All file types', (r) => r.language, languageName));
      this.moduleOptions = ko.pureComputed(() => optionsOf('All modules', (r) => topFolder(r.path)));
      this.kindOptions = ko.pureComputed(() => optionsOf('All categories', (r) => r.kind, kindName));
      this.matchOptions = ko.pureComputed(() => optionsOf('Words or meaning', (r) => r.matchedBy,
        matchWords));
      // Revisions of the indexed files, for "changed in" on each result
      const fileRevisions = ko.observable({});
      const loadFiles = (id) => api.get('workspaces/' + id + '/files?limit=20000')
        .then((list) => {
          if (id === this.workspaceId()) {
            const m = {};
            list.forEach((f) => { m[f.path] = f.revision; });
            fileRevisions(m);
          }
        })
        .catch(() => fileRevisions({}));
      this.selected = ko.observable(null);
      this.filteredResults = ko.pureComputed(() => this.results().filter((r) => (!this.fType() || r.language === this.fType())
        && (!this.fModule() || topFolder(r.path) === this.fModule()) && (!this.fKind() || r.kind === this.fKind()) && (!this.fMatch() || r.matchedBy === this.fMatch()))
        .map((r) => {
          const slash = r.path.lastIndexOf('/');
          const revision = fileRevisions()[r.path];
          return {
            key: r.path + ':' + r.startLine + ':' + r.endLine,
            name: r.path.slice(slash + 1),
            folder: slash > 0 ? r.path.slice(0, slash) : '',
            symbol: r.symbol && r.symbol !== r.path.slice(slash + 1) ? r.symbol : '',
            meta: [r.startLine === r.endLine ? 'Line ' + r.startLine : 'Lines ' + r.startLine + '–' + r.endLine, kindName(r.kind), languageName(r.language),
              topFolder(r.path) ? 'Module ' + topFolder(r.path) : ''].concat(revision !== undefined ? ['Changed in r' + revision] : []).filter(Boolean).join(' · '),
            matched: 'Matched ' + matchWords(r.matchedBy),
            css: ko.pureComputed(() => 'factory-cd-result' + (this.selected() && this.selected().key === r.path + ':' + r.startLine + ':' + r.endLine ? ' is-current' : '')),
            current: ko.pureComputed(() => (this.selected() && this.selected().key === r.path + ':' + r.startLine + ':' + r.endLine ? 'true' : null)),
            open: () => this.openResult(r)
          };
        }));
      this.filtersOn = ko.pureComputed(() => !!(this.fType() || this.fModule() || this.fKind() || this.fMatch()));
      this.clearFilters = () => { this.fType(''); this.fModule(''); this.fKind(''); this.fMatch(''); };
      this.resultCount = ko.pureComputed(() => (this.filtersOn()
        ? this.filteredResults().length + ' of ' + plural(this.results().length, 'result') : plural(this.results().length, 'result')));

      this.search = () => {
        const q = this.query().trim();
        if (!q) {
          return;
        }
        this.searching(true);
        this.searchError('');
        api.get('workspaces/' + this.workspaceId() + '/search?q=' + encodeURIComponent(q))
          .then((response) => {
            this.clearFilters();
            this.results(response.results.map((r) => Object.assign({}, r, { matchedBy: r.matchedBy || 'keyword' })));
            this.searched(q);
            this.searchNote(response.semanticNote || '');
            if (response.results.length) {
              this.openResult(this.results()[0], true);
            } else {
              this.closeViewer();
            }
          })
          .catch((error) => this.searchError('Search failed. ' + plain(error)))
          .finally(() => this.searching(false));
      };

      // The code viewer: the whole file from the working copy, coloured, the matching lines marked and scrolled to
      this.file = ko.observable(null);
      this.fileLoading = ko.observable(false);
      this.fileError = ko.observable('');
      this.viewerNote = ko.observable('');
      let viewerToken = 0;
      this.closeViewer = () => { this.selected(null); this.file(null); this.fileError(''); this.viewerNote(''); renderLines(null); };
      this.openResult = (r, quiet) => {
        const key = r.path + ':' + r.startLine + ':' + r.endLine;
        const token = ++viewerToken;
        this.selected({ key: key, path: r.path, startLine: r.startLine, endLine: r.endLine, kind: r.kind, symbol: r.symbol, language: r.language });
        this.fileError('');
        const shown = this.file();
        if (shown && shown.path === r.path) {
          show(shown, quiet);
          return;
        }
        this.fileLoading(true);
        api.get('workspaces/' + this.workspaceId() + '/files/content?path=' + encodeURIComponent(r.path))
          .then((f) => {
            if (token !== viewerToken) {
              return;
            }
            this.file(f);
            show(f, quiet);
          })
          .catch((error) => {
            if (token !== viewerToken) {
              return;
            }
            // The file is not readable (an older server, or not in the working copy): show the indexed piece instead
            this.file(null);
            this.fileError(plain(error) + ' Showing the indexed piece only.');
            show({ path: r.path, language: r.language, content: r.snippet || '', offset: r.startLine - 1, piece: true }, true);
          })
          .finally(() => { if (token === viewerToken) { this.fileLoading(false); } });
      };
      this.viewerFacts = ko.pureComputed(() => {
        const sel = this.selected();
        if (!sel) {
          return [];
        }
        const f = this.file();
        const facts = [
          { label: 'Lines', value: sel.startLine === sel.endLine ? String(sel.startLine) : sel.startLine + '–' + sel.endLine },
          { label: 'Category', value: kindName(sel.kind) + (sel.symbol ? ' ' + sel.symbol : '') },
          { label: 'Module', value: topFolder(sel.path) || 'None (top level)' },
          { label: 'File type', value: languageName(f ? f.language : sel.language) }
        ];
        if (this.indexedRevision() !== null) {
          facts.push({ label: 'Indexed revision', value: 'r' + this.indexedRevision() });
        }
        if (f) {
          facts.push({ label: 'Last changed', value: 'r' + f.revision, tip: 'The revision of the import that last found this file changed' },
            { label: 'Size', value: sizeText(f.sizeBytes) + ', ' + plural(f.lines, 'line') });
        }
        return facts;
      });
      this.copyPath = () => {
        const sel = this.selected();
        if (sel) {
          ui.copy(sel.path).then(() => toast.success('Path copied.')).catch(() => toast.error('The path could not be copied. Select it and copy it by hand.'));
        }
      };
      // Rendered straight into the viewer (thousands of lines are too many for bound lists); text goes in as text nodes
      const renderLines = (f) => {
        const body = document.getElementById('codeViewerBody');
        if (!body) {
          return;
        }
        while (body.firstChild) {
          body.removeChild(body.firstChild);
        }
        this.viewerNote('');
        if (!f) {
          return;
        }
        const sel = this.selected();
        const all = (f.content || '').replace(/\r\n/g, '\n').split('\n');
        const offset = f.offset || 0;
        let from = 0;
        let to = all.length;
        if (all.length > VIEW_LINES && sel) {
          from = Math.max(0, Math.min(sel.startLine - 1 - VIEW_LINES / 2, all.length - VIEW_LINES));
          to = from + VIEW_LINES;
          this.viewerNote('A long file: lines ' + (from + 1) + ' to ' + to + ' of ' + all.length.toLocaleString() + ' are shown around the match.');
        }
        if (f.truncated) {
          this.viewerNote((this.viewerNote() ? this.viewerNote() + ' ' : '') + 'The file is cut at ' + sizeText(f.content.length) + '; the rest is not shown.');
        }
        const lang = syntax.langOf(f.path, f.language);
        const state = { inBlock: false };
        // Colour from the top so block comments that open above the window are known
        for (let i = 0; i < from; i++) {
          syntax.tokenize(all[i], lang, state);
        }
        const fragment = document.createDocumentFragment();
        let target = null;
        for (let i = from; i < to; i++) {
          const n = i + 1 + offset;
          const row = document.createElement('div');
          const hit = sel && n >= sel.startLine && n <= sel.endLine;
          row.className = 'factory-cd-line' + (hit ? ' is-hit' : '');
          const num = document.createElement('span');
          num.className = 'factory-cd-n';
          num.textContent = String(n);
          const code = document.createElement('span');
          code.className = 'factory-cd-t';
          syntax.tokenize(all[i], lang, state).forEach((t) => {
            if (t.css) {
              const span = document.createElement('span');
              span.className = t.css;
              span.textContent = t.text;
              code.appendChild(span);
            } else {
              code.appendChild(document.createTextNode(t.text));
            }
          });
          row.appendChild(num);
          row.appendChild(code);
          fragment.appendChild(row);
          if (hit && !target) {
            target = row;
          }
        }
        body.appendChild(fragment);
        // Scroll inside the viewer only, with the first matching line a little below the top
        body.scrollTop = target ? Math.max(0, target.offsetTop - 48) : 0;
        body.scrollLeft = 0;
      };
      // On a one-column layout the viewer sits below the results: bring it into view. Focus goes to the code.
      const revealViewer = () => {
        const viewer = document.getElementById('codeViewer');
        const body = document.getElementById('codeViewerBody');
        if (!viewer || !body) {
          return;
        }
        if (window.matchMedia('(max-width: 1099px)').matches) {
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          viewer.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
        }
        body.focus({ preventScroll: true });
      };
      // After the bindings have shown the viewer, so its lines can be measured for scrolling
      const show = (f, quiet) => setTimeout(() => {
        renderLines(f);
        if (!quiet) {
          revealViewer();
        }
      }, 0);
      this.viewerLabel = ko.pureComputed(() => (this.selected() ? 'Code of ' + this.selected().path : 'Code viewer'));
      this.openKnowledge = (event) => {
        if (event) {
          event.preventDefault();
        }
        window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'knowledge' }));
      };

      // AI Assistant (folded under the search): answers from the workspace, its index and the current search results
      this.ai = assistant.create(() => {
        const w = this.workspace();
        if (!w) {
          return '';
        }
        const s = this.indexStatus();
        const lines = ['Workspace: ' + w.name + ' (' + w.bankName + ', OBDX ' + w.obdxVersion + '), SVN ' + (w.svnUrl || 'not set')];
        if (s) {
          lines.push('Index: ' + s.files + ' files, ' + s.chunks + ' searchable pieces, revision ' + s.indexedRevision
            + ', files by language: ' + JSON.stringify(s.filesByLanguage));
        }
        lines.push('Quick check rules: ' + this.checkRules().map((r) => r.title + ' (' + r.severity + (r.enabled ? '' : ', off') + ')').join('; '));
        if (this.results().length) {
          lines.push('Code search for "' + this.searched() + '":');
          this.results().slice(0, 6).forEach((r) => lines.push('--- ' + r.path + ' lines ' + r.startLine + '-' + r.endLine + ' (' + r.kind + ' ' + (r.symbol || '') + ')\n' + (r.snippet || '').slice(0, 1500)));
        } else {
          lines.push('No code search results yet; the user can search with Code Search to give more code.');
        }
        return lines.join('\n');
      }, ['Explain this class', 'Find where this method is used', 'Suggest improvements', 'Generate unit tests']);

      // ---------- Loading a workspace ----------
      const loadWorkspace = (id) => {
        this.errorMessage('');
        this.svnMessage('');
        this.results([]);
        this.searched('');
        this.searchNote('');
        this.searchError('');
        this.closeViewer();
        this.headCheck(id ? headChecks[id] || null : null);
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

      let subscription = null;
      let searchSubscription = null;
      const searchFor = (text) => {
        this.tab('search');
        this.query(text);
        this.search();
      };
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
        // A search from the top bar opens Code search with its results.
        const requested = pageRequests.codeSearch();
        pageRequests.codeSearch('');
        if (requested) {
          this.tab('search');
          this.query(requested);
        }
        // If loading the list changed the selection, the subscription has already loaded the workspace.
        workspaceSelection.load().then(() => (this.workspaceId() === before ? loadWorkspace(before) : null))
          .then(() => { if (requested) { searchFor(requested); } }).catch(showError);
        // Searches from the top bar while this page is open
        searchSubscription = pageRequests.codeSearch.subscribe((text) => {
          if (text) {
            pageRequests.codeSearch('');
            searchFor(text);
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
