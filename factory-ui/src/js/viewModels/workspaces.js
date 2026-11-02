/*
 * Workspaces page: the list of workspaces, one workspace's details in a side sheet, and a guided new-workspace flow.
 * A new workspace's code comes from an SVN URL or a folder on the computer the factory runs on (/api/sources): the
 * factory checks it and suggests the name, bank and OBDX version from the code, the user confirms them, then the
 * workspace is created (/api/workspaces) and its code imported (/imports). The import checks out from SVN, indexes the
 * files and detects the project profile; each stage shows what the server reports, and nothing is called done before
 * the server says so.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', '../services/dashboard',
        '../services/pageRequests', '../services/ui', '../services/toast', '../services/dialog', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, workspaceSelection, dashboard, pageRequests, ui, toast, dialog) {
    const KIND_LABELS = { WORKING_COPY: 'SVN checkout', REPOSITORY: 'SVN repository' };
    const POLL_MS = 3000;
    // A workspace's code state as a design-system status (ui.status), in the page's own words
    const SERVER_STATE = { ready: 'SUCCEEDED', importing: 'IMPORTING', failed: 'FAILED', new: 'NEW' };
    const STATUS = {};
    Object.keys(SERVER_STATE).forEach((key) => {
      STATUS[key] = ui.status(SERVER_STATE[key], { ready: 'Indexed', importing: 'Importing', failed: 'Import failed', new: 'Not imported' }[key]);
    });
    const CONFIDENCE = { HIGH: 'High confidence', MEDIUM: 'Medium confidence', LOW: 'Low confidence', NONE: 'Not detected' };
    const FACT_STATUS = { detected: 'Detected, not confirmed', confirmed: 'Confirmed', corrected: 'Corrected', missing: 'Not detected' };
    const isRunning = (job) => !!job && (job.status === 'QUEUED' || job.status === 'RUNNING');
    // A long URL on one line: its start and its end, which tells workspaces apart
    const midUrl = (url, max) => {
      const text = url || '';
      const limit = max || 46;
      return text.length <= limit ? text : text.slice(0, 12) + '…' + text.slice(text.length - (limit - 13));
    };
    const plural = (n, word) => n.toLocaleString() + ' ' + word + (n === 1 ? '' : 's');
    const ROLE_TEXT = (role) => role.charAt(0) + role.slice(1).toLowerCase();
    const stopping = (handler) => (event) => {
      if (event && event.stopPropagation) {
        event.stopPropagation();
        event.preventDefault();
      }
      handler();
    };
    // Where the import is, from its job: checking out (no revision yet), indexing, or finished
    const jobProgress = (job) => {
      if (!job) {
        return '';
      }
      if (job.status === 'QUEUED') {
        return 'Queued; waiting for the import to start.';
      }
      if (job.toRevision === null || job.toRevision === undefined) {
        return 'Checking out the code from SVN.';
      }
      const done = job.filesIndexed + job.filesRemoved;
      return job.filesScanned
        ? 'Revision ' + job.toRevision + ': ' + done.toLocaleString() + ' of ' + job.filesScanned.toLocaleString() + ' changed files indexed, '
          + plural(job.chunksIndexed, 'searchable piece') + ' so far.'
        : 'Revision ' + job.toRevision + ' checked out; finding the files to index.';
    };

    function WorkspacesViewModel() {
      this.isAdmin = session.isAdmin;
      this.versionOptions = [
        { value: '22.x', label: 'OBDX 22.x' },
        { value: '25.x', label: 'OBDX 25.x' }
      ];
      const data = dashboard.data;
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(error.message);
      this.go = (page) => dashboard.open(page);

      // Per workspace, read on demand: project profile, modernization inventory and members. A workspace whose code
      // was never indexed has no profile yet, so it is not asked for (force: an import just ended, ask anyway).
      const wsDetails = ko.observable({});
      const pending = {};
      const loadDetails = (id, force) => {
        if (!id || pending[id] || (wsDetails()[id] && !force)) {
          return Promise.resolve(wsDetails()[id]);
        }
        const entry = data().find((d) => d.workspace.id === id);
        const noProfile = !force && !!entry && !dashboard.isIndexed(entry.workspace);
        pending[id] = Promise.all([
          noProfile ? Promise.resolve(null) : api.get('workspaces/' + id + '/profile').catch(() => null),
          api.get('workspaces/' + id + '/inventory').catch(() => null),
          api.get('workspaces/' + id + '/members').catch(() => null)
        ]).then(([profile, inventory, members]) => {
          const m = Object.assign({}, wsDetails());
          m[id] = { profile: profile, inventory: inventory, members: members };
          wsDetails(m);
          return m[id];
        }).finally(() => { delete pending[id]; });
        return pending[id];
      };
      const setProfile = (id, profile) => {
        const m = Object.assign({}, wsDetails());
        m[id] = Object.assign({}, m[id] || {}, { profile: profile });
        wsDetails(m);
      };
      // The OBDX version the code shows (profile fact obdx.version): value, confidence, evidence and whether a person
      // confirmed it, plus the profile's warning when it disagrees with the workspace's version
      const versionOf = (id) => {
        const profile = (wsDetails()[id] || {}).profile;
        if (!profile) {
          return null;
        }
        const fact = profile.facts.find((f) => f.key === 'obdx.version') || null;
        return {
          fact: fact,
          value: fact && fact.value ? fact.value : '',
          shown: fact && fact.value ? fact.value + ' · ' + (CONFIDENCE[fact.confidence] || fact.confidence) + ' · ' + (FACT_STATUS[fact.status] || fact.status) : 'No OBDX version found in the code',
          detectedValue: fact ? fact.detectedValue : null,
          confidence: fact ? CONFIDENCE[fact.confidence] || fact.confidence : 'Not detected',
          lowConfidence: !!fact && (fact.confidence === 'LOW' || fact.confidence === 'MEDIUM'),
          status: fact ? FACT_STATUS[fact.status] || fact.status : 'Not detected',
          confirmed: !!fact && (fact.status === 'confirmed' || fact.status === 'corrected'),
          evidence: fact ? fact.evidence : [],
          warnings: profile.warnings || [],
          mismatch: (profile.warnings || []).some((w) => w.indexOf('code looks like OBDX') >= 0),
          detectedAt: profile.detectedAt
        };
      };

      // ---------- Live import progress ----------
      // While a workspace's import is queued or running, its latest job is read every few seconds from
      // GET /workspaces/{id}/imports; once it ends, the dashboard and the workspace's profile reload and polling stops.
      const liveJobs = ko.observable({});
      let pollTimer = null;
      let polling = false;
      const jobOf = (entry) => liveJobs()[entry.workspace.id] || (entry.imports.length ? entry.imports[0] : null);
      const runningIds = () => data().filter((d) => isRunning(jobOf(d))).map((d) => d.workspace.id);
      const poll = () => {
        clearTimeout(pollTimer);
        if (!polling || !runningIds().length) {
          return;
        }
        pollTimer = window.setTimeout(() => {
          const ids = runningIds();
          Promise.all(ids.map((id) => api.get('workspaces/' + id + '/imports?limit=1').then((list) => [id, list[0] || null]).catch(() => [id, null])))
            .then((results) => {
              if (!polling) {
                return null;
              }
              const m = Object.assign({}, liveJobs());
              const ended = [];
              results.forEach(([id, job]) => {
                if (job) {
                  m[id] = job;
                  if (!isRunning(job)) {
                    ended.push(id);
                  }
                }
              });
              liveJobs(m);
              if (!ended.length) {
                return null;
              }
              ended.forEach((id) => loadDetails(id, true));
              return dashboard.load().then(() => {
                const left = Object.assign({}, liveJobs());
                ended.forEach((id) => { delete left[id]; });
                liveJobs(left);
              });
            })
            .finally(poll);
        }, POLL_MS);
      };
      const startImport = (id) => api.post('workspaces/' + id + '/imports').then((job) => {
        const m = Object.assign({}, liveJobs());
        m[id] = job;
        liveJobs(m);
        return dashboard.load().then(() => { poll(); return job; });
      });

      // ---------- The list ----------
      this.filterText = ko.observable('');
      this.filterStatus = ko.observable('');
      this.filterTextInput = ui.value(this.filterText);
      this.filterStatusChange = ui.value(this.filterStatus);
      const lastActivity = (d) => {
        const dates = [d.workspace.createdAt];
        d.imports.forEach((j) => dates.push(j.finishedAt || j.startedAt || j.createdAt));
        d.requirements.forEach((r) => dates.push(r.updatedAt));
        d.designs.forEach((s) => dates.push(s.updatedAt));
        d.changes.forEach((c) => dates.push(c.updatedAt));
        return dates.filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0];
      };
      const stateOf = (d) => {
        const job = jobOf(d);
        return isRunning(job) ? 'importing' : dashboard.codeState(d).key;
      };
      this.rows = ko.pureComputed(() => data().map((d) => {
        const w = d.workspace;
        const state = stateOf(d);
        const job = jobOf(d);
        const at = lastActivity(d);
        const version = versionOf(w.id);
        const local = /^file:/i.test(w.svnUrl || '');
        return {
          id: w.id, name: w.name, bank: w.bankName, version: 'OBDX ' + w.obdxVersion, svnUrl: w.svnUrl || '', shortUrl: midUrl(w.svnUrl, 44) || 'No SVN URL',
          sourceKind: w.svnUrl ? (local ? 'SVN on this computer' : 'SVN server') : 'Not set',
          versionNote: version && version.mismatch ? 'Code looks like ' + version.value : '',
          revision: w.indexedRevision !== null && w.indexedRevision !== undefined ? 'r' + w.indexedRevision : 'Not indexed',
          state: state, status: STATUS[state], progress: state === 'importing' ? jobProgress(job) : '',
          when: at ? dashboard.ago(at) : '', whenTitle: at ? 'Last activity ' + dashboard.when(at) : '',
          open: stopping(() => this.openSheet(w.id)),
          select: () => this.openSheet(w.id)
        };
      }).filter((r) => {
        const text = this.filterText().trim().toLowerCase();
        return (!text || (r.name + ' ' + r.bank + ' ' + r.version + ' ' + r.svnUrl).toLowerCase().indexOf(text) >= 0)
          && (!this.filterStatus() || r.state === this.filterStatus());
      }).map((r, i) => Object.assign(r, {
        // The keyboard cursor row (ui.tableKeys): arrows or J/K move it, Enter opens the workspace's details
        css: ko.pureComputed(() => 'factory-clickable' + (this.wsKeys.cursor() === i ? ' is-cursor' : '')),
        focus: () => { this.wsKeys.cursor(i); return true; }
      })));
      this.wsKeys = ui.tableKeys(this.rows, { open: (row) => row.select() });
      // Enter on the row's name button opens it once (the button's own click), not twice
      this.wsKey = (a, b) => {
        const e = a && typeof a.preventDefault === 'function' ? a : b;
        return e && e.target && e.target.tagName === 'BUTTON' ? true : this.wsKeys.key(a, b);
      };
      this.total = ko.pureComputed(() => data().length);
      this.loading = ko.pureComputed(() => dashboard.loading() && !data().length);
      this.runningCount = ko.pureComputed(() => data().filter((d) => stateOf(d) === 'importing').length);
      this.lead = ko.pureComputed(() => {
        const n = this.total();
        if (!n) {
          return 'The OBDX code bases the factory works on.';
        }
        const banks = new Set(data().map((d) => d.workspace.bankName)).size;
        return plural(n, 'workspace') + ' for ' + plural(banks, 'bank') + (this.isAdmin() ? '.' : ' you are a member of.');
      });
      // A refresh that fails says so (the list keeps what it had)
      this.refresh = () => dashboard.load().then(() => {
        if (dashboard.error()) {
          toast.error('Could not refresh the workspaces: ' + dashboard.error() + '. Check that the factory is running, then try again.');
        }
      });

      // ---------- One workspace's details (side sheet) ----------
      this.sheetOpen = ko.observable(false);
      this.sheetId = ko.observable(null);
      this.svnTest = ko.observable(null);
      this.openSheet = (id) => {
        this.sheetId(id);
        this.svnTest(null);
        this.sheetOpen(true);
        loadDetails(id);
      };
      this.sheet = ko.pureComputed(() => {
        const entry = data().find((d) => d.workspace.id === this.sheetId());
        if (!entry) {
          return null;
        }
        const w = entry.workspace;
        const extra = wsDetails()[w.id] || {};
        const inv = extra.inventory ? extra.inventory.summary : null;
        const index = entry.index;
        const job = jobOf(entry);
        const running = isRunning(job);
        const indexed = w.indexedRevision !== null && w.indexedRevision !== undefined;
        const canManage = session.can(w.id, 'MANAGE_CODE');
        const version = versionOf(w.id);
        const embedded = index && index.chunks ? Math.round(100 * index.chunksWithEmbedding / index.chunks) : 0;
        const members = (extra.members || []).map((m) => ({
          initials: ui.initials(m.displayName), avatar: ui.avatarTone(m.displayName) + ' fx-avatar--sm', name: m.displayName, role: ROLE_TEXT(m.role)
        }));
        const test = this.svnTest();
        return {
          id: w.id, name: w.name, subtitle: w.bankName + ' · OBDX ' + w.obdxVersion,
          state: stateOf(entry), status: STATUS[stateOf(entry)], running: running, progress: running ? jobProgress(job) : '',
          // The last import: what the server reported, in full
          jobText: job ? (job.status === 'SUCCEEDED' ? 'Last import ' + dashboard.when(job.finishedAt) : (job.status === 'FAILED' ? 'Import failed ' + dashboard.when(job.finishedAt || job.createdAt) : 'Import started ' + dashboard.when(job.startedAt || job.createdAt))) : 'The code has not been imported yet.',
          jobMessage: job && !running ? job.message || '' : '',
          jobFailed: !!job && job.status === 'FAILED',
          canManage: canManage, canUpdate: canManage && !running && !!w.svnUrl,
          updateLabel: indexed ? 'Update code' : 'Import code',
          updateHelp: !w.svnUrl ? 'Set the SVN URL on the Code page first.'
            : (indexed ? 'Fetches what changed in SVN since r' + w.indexedRevision + ' and indexes again only the files whose content changed.'
              : 'Checks out the code from SVN, indexes it and detects the project profile.'),
          manageTip: canManage ? null : 'Needs the right to manage the code of this workspace.',
          // Index
          stats: [
            { label: 'Indexed revision', value: indexed ? 'r' + w.indexedRevision : 'Not indexed' },
            { label: 'Files', value: index ? index.files.toLocaleString() : '–' },
            { label: 'Searchable pieces', value: index ? index.chunks.toLocaleString() : '–' },
            { label: 'Searchable by meaning', value: index && index.chunks ? embedded + '%' : '–' },
            { label: 'UI screens', value: inv ? inv.screens.toLocaleString() : '–' },
            { label: 'Services', value: inv ? inv.endpoints.toLocaleString() : '–' }
          ],
          // OBDX version: the workspace's and what the code shows
          declared: 'OBDX ' + w.obdxVersion,
          version: version,
          profileLoaded: !!extra.profile,
          canConfirm: canManage && !!version && !!version.fact && version.fact.status === 'detected' && !!version.fact.detectedValue,
          // Repository
          svnUrl: w.svnUrl || 'Not set', svnUser: w.svnUsername || 'None (no sign-in)', svnPassword: w.svnPasswordSet ? 'Saved' : 'Not saved',
          canTest: canManage && !!w.svnUrl,
          testText: test ? test.text : '', testOk: !!test && test.ok,
          // Members
          members: members, membersLoaded: !!extra.members,
          canDelete: session.isAdmin()
        };
      });
      this.closeSheet = () => this.sheetOpen(false);
      this.updateCode = () => {
        const s = this.sheet();
        if (!s) {
          return;
        }
        startImport(s.id).then(() => toast.success((s.updateLabel === 'Update code' ? 'Updating ' : 'Importing ') + s.name + '. Progress shows here and in the list.'))
          .catch((error) => toast.error(error.message));
      };
      this.confirmVersion = () => {
        const s = this.sheet();
        if (!s || !s.canConfirm) {
          return;
        }
        api.put('workspaces/' + s.id + '/profile/facts/obdx.version', { value: s.version.fact.detectedValue })
          .then((profile) => { setProfile(s.id, profile); toast.success('Detected OBDX version confirmed.'); })
          .catch((error) => toast.error(error.message));
      };
      this.testConnection = () => {
        const s = this.sheet();
        if (!s) {
          return;
        }
        const indexed = (data().find((d) => d.workspace.id === s.id) || {}).workspace.indexedRevision;
        api.post('workspaces/' + s.id + '/svn/test')
          .then((r) => {
            const behind = indexed !== null && indexed !== undefined ? r.headRevision - indexed : null;
            this.svnTest({ ok: true, text: 'Connected. The latest revision is r' + r.headRevision
              + (behind === null ? '.' : (behind > 0 ? '; the index is ' + plural(behind, 'revision') + ' behind.' : '; the index is up to date.')) });
          })
          .catch((error) => this.svnTest({ ok: false, text: error.message + ' Check the URL and sign-in on the Code page, then test again.' }));
      };
      this.copyUrl = () => {
        const s = this.sheet();
        if (s && s.svnUrl !== 'Not set') {
          ui.copy(s.svnUrl).then(() => toast.success('Repository URL copied.'))
            .catch(() => toast.error('The URL could not be copied. Select it and copy it by hand.'));
        }
      };
      this.sheetGo = (page) => (event) => {
        if (event && event.preventDefault) {
          event.preventDefault();
        }
        const s = this.sheet();
        this.sheetOpen(false);
        dashboard.open(page, s ? s.id : undefined)();
      };

      // Delete: the dialog says what goes with the workspace, counted from the data this page has
      this.deleteWorkspace = () => {
        const s = this.sheet();
        if (!s) {
          return;
        }
        const entry = data().find((d) => d.workspace.id === s.id);
        loadDetails(s.id).then(() => {
          const members = ((wsDetails()[s.id] || {}).members || []).length;
          const open = entry.changes.filter((c) => dashboard.openChanges.indexOf(c.status) >= 0).length;
          const parts = [
            plural(entry.requirements.length, 'requirement'),
            plural(entry.designs.length, 'screen design'),
            plural(entry.changes.length, 'change') + (open ? ' (' + open + ' still open)' : ''),
            plural(entry.index ? entry.index.files : 0, 'indexed file'),
            'the project profile, import history, Jenkins settings and ' + plural(members, 'member') + ' access'
          ];
          return dialog.confirm({
            title: 'Delete ' + s.name + '?',
            message: 'This deletes the workspace with ' + parts.join(', ') + '.'
              + (s.running ? ' An import is running; it stops with the workspace.' : '')
              + ' The SVN repository is not changed. This cannot be undone.',
            confirmLabel: 'Delete workspace', danger: true
          });
        }).then((ok) => {
          if (!ok) {
            return null;
          }
          return api.del('workspaces/' + s.id)
            .then(() => {
              this.sheetOpen(false);
              toast.success('Workspace ' + s.name + ' deleted.');
              return Promise.all([dashboard.load(), workspaceSelection.load()]);
            })
            .catch((error) => toast.error(error.message));
        });
      };

      // ---------- New workspace: source, check, details, import, profile ----------
      this.creating = ko.observable(false);
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
      this.checkError = ko.observable('');
      this.inspection = ko.observable(null);
      this.reasons = ko.observableArray([]);
      this.name = ko.observable('');
      this.bankName = ko.observable('');
      this.obdxVersion = ko.observable('');
      this.importNow = ko.observable(true);
      this.showErrors = ko.observable(false);
      const required = (field, message) => ko.pureComputed(() => (this.showErrors() && !String(this[field]() || '').trim() ? message : ''));
      this.nameError = required('name', 'Enter a name for the workspace.');
      this.bankError = required('bankName', 'Enter the bank.');
      this.versionError = required('obdxVersion', 'Choose the OBDX version the code is on.');

      // The run after Create: each stage's state comes from the server's answers
      this.run = ko.observable(null);
      const RUN_STEPS = { create: 'pending', signIn: 'pending', start: 'pending' };
      const setRun = (changes) => this.run(Object.assign({}, this.run(), changes));

      // A different source needs a new check
      const resetCheck = () => { this.inspection(null); this.reasons([]); this.checkError(''); };
      this.sourceKind.subscribe(resetCheck);
      this.svnUrl.subscribe(resetCheck);
      this.folderPath.subscribe(resetCheck);

      // Suggestions replace what is empty or an earlier suggestion, never what the user typed or chose
      let suggested = {};
      const suggest = (field, value) => {
        if (value && (!this[field]() || this[field]() === suggested[field])) {
          this[field](value);
          suggested[field] = value;
        }
      };
      const showInspection = (result) => {
        this.inspection(result);
        const suggestion = result.suggestion || {};
        this.reasons(suggestion.reasons || []);
        suggest('name', suggestion.name);
        suggest('bankName', suggestion.bankName);
        suggest('obdxVersion', suggestion.obdxVersion);
      };
      const check = (request) => {
        this.checkError('');
        this.inspection(null);
        this.checking(true);
        return request.then(showInspection).catch((error) => this.checkError(error.message)).finally(() => this.checking(false));
      };
      this.checkUrl = () => {
        if (!this.svnUrl().trim()) {
          this.checkError('Enter the SVN repository URL, then check it.');
          return;
        }
        check(api.post('sources/inspect-url', { svnUrl: this.svnUrl().trim(), svnUsername: this.svnUsername(), svnPassword: this.svnPassword() }));
      };
      this.checkFolder = () => {
        if (!this.folderPath().trim()) {
          this.checkError('Choose a folder, then check it.');
          return;
        }
        this.browsing(false);
        check(api.post('sources/local/inspect', { path: this.folderPath().trim() }));
      };
      this.checkSource = () => (this.sourceKind() === 'folder' ? this.checkFolder() : this.checkUrl());
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
        .catch((error) => this.checkError(error.message));
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
      let localLoaded = null;
      const loadLocal = () => {
        localLoaded = localLoaded || api.get('sources/local').then((local) => {
          if (!local.enabled) {
            return;
          }
          this.localEnabled(true);
          this.home = local.home;
          this.roots(local.roots.map((root) => Object.assign({}, root, { open: () => openFolder(root.path) })));
          this.found(local.found.map((repository) => Object.assign({}, repository, { use: () => useFolder(repository.path) })));
        }).catch(() => { localLoaded = null; });
        return localLoaded;
      };
      this.sourceTabs = [
        { value: 'folder', label: 'Folder on this computer' },
        { value: 'url', label: 'SVN server (URL)' }
      ].map((t) => Object.assign(t, {
        pressed: ko.pureComputed(() => String(this.sourceKind() === t.value)),
        hidden: ko.pureComputed(() => t.value === 'folder' && !this.localEnabled()),
        pick: () => this.sourceKind(t.value)
      }));

      // The OBDX versions the code points to (the check's reasons start with "OBDX <version>:"); both means unsure
      this.versionEvidence = ko.pureComputed(() => this.reasons().filter((r) => /^OBDX \d/.test(r)));
      this.otherEvidence = ko.pureComputed(() => this.reasons().filter((r) => !/^OBDX \d/.test(r)));
      this.versionNote = ko.pureComputed(() => {
        const seen = Array.from(new Set(this.versionEvidence().map((r) => r.split(':')[0].replace('OBDX ', ''))));
        const detected = this.inspection() && this.inspection().suggestion ? this.inspection().suggestion.obdxVersion : null;
        if (!detected) {
          return { tone: 'warning', text: 'The code does not show its OBDX version. Choose it.' };
        }
        if (this.versionEvidence().every((r) => r.indexOf(': the name "') > 0)) {
          return { tone: 'warning', text: 'Only the name points to OBDX ' + detected + '; the code itself does not show it. Check the version before you go on.' };
        }
        if (seen.length > 1) {
          return { tone: 'warning', text: 'The code points to OBDX ' + seen.join(' and ') + '. ' + detected + ' had more evidence; check it before you go on.' };
        }
        return { tone: 'info', text: 'The code points to OBDX ' + detected + '. Check the evidence and change it if it is wrong.' };
      });

      // The five stages and which one the user is on
      this.stage = ko.pureComputed(() => {
        const run = this.run();
        if (run) {
          return run.done ? 'profile' : 'import';
        }
        if (this.inspection() && this.inspection().svnUrl) {
          return 'details';
        }
        return this.checking() || this.inspection() ? 'check' : 'source';
      });
      const STAGES = [['source', 'Source'], ['check', 'Check'], ['details', 'Confirm details'], ['import', 'Import and index'], ['profile', 'Review profile']];
      this.stages = ko.pureComputed(() => {
        const current = STAGES.findIndex((s) => s[0] === this.stage());
        return STAGES.map((s, i) => ({
          n: i + 1, label: s[1],
          css: i < current ? 'is-done' : (i === current ? 'is-current' : ''),
          current: i === current ? 'step' : null,
          dot: i < current ? '✓' : String(i + 1)
        }));
      });

      // The import stages after Create, from the workspace's latest import job
      this.runEntry = ko.pureComputed(() => (this.run() && this.run().id ? data().find((d) => d.workspace.id === this.run().id) || null : null));
      this.runSteps = ko.pureComputed(() => {
        const run = this.run();
        if (!run) {
          return [];
        }
        const entry = this.runEntry();
        const job = entry ? jobOf(entry) : null;
        const ownJob = job && run.jobId && job.id === run.jobId ? job : null;
        const step = (key, label, state, text, retry, retryLabel) => ({
          key: key, label: label, text: text || '',
          dot: 'fx-timeline-dot' + ({ done: ' fx-timeline-dot--success', failed: ' fx-timeline-dot--danger', running: ' fx-timeline-dot--running' }[state] || ''),
          icon: 'factory-nav-icon factory-ico-' + ({ done: 'check', failed: 'alert', running: 'refresh' }[state] || 'clock'),
          state: { done: 'Done', failed: 'Failed', running: 'Running', pending: 'Waiting', skipped: 'Not started' }[state],
          failed: state === 'failed', retry: retry || null, retryLabel: retryLabel || 'Try again'
        });
        const steps = [step('create', 'Create the workspace', run.create, run.create === 'done' ? 'Workspace ' + run.name + ' created.' : run.createError, run.create === 'failed' ? this.retryCreate : null)];
        if (run.withLogin) {
          steps.push(step('signIn', 'Save the SVN sign-in', run.signIn, run.signIn === 'done' ? 'Stored encrypted with the workspace.' : run.signInError, run.signIn === 'failed' ? this.retrySignIn : null));
        }
        if (!run.importNow && !ownJob) {
          steps.push(step('start', 'Import the code', run.start === 'failed' ? 'failed' : 'skipped', run.start === 'failed' ? run.startError : 'You chose to import later.', run.create === 'done' ? this.retryStart : null,
            run.start === 'failed' ? 'Try again' : 'Import now'));
          return steps;
        }
        steps.push(step('start', 'Start the import', run.start, run.start === 'failed' ? run.startError : '', run.start === 'failed' ? this.retryStart : null));
        // From the job: checkout (until a revision is known), indexing (until the job ends), then the profile
        const failed = ownJob && ownJob.status === 'FAILED';
        const checkedOut = ownJob && ownJob.toRevision !== null && ownJob.toRevision !== undefined;
        const succeeded = ownJob && ownJob.status === 'SUCCEEDED';
        const message = ownJob ? ownJob.message || '' : '';
        const retry = run.create === 'done' && session.can(run.id, 'MANAGE_CODE') ? this.retryStart : null;
        const state = (begun, done, failedHere) => (failedHere ? 'failed' : (done ? 'done' : (begun ? 'running' : 'pending')));
        steps.push(step('checkout', 'Check out the code from SVN',
          state(ownJob && ownJob.status !== 'QUEUED', checkedOut, failed && !checkedOut),
          failed && !checkedOut ? message : (checkedOut ? 'Revision ' + ownJob.toRevision + ' checked out.' : (ownJob ? jobProgress(ownJob) : '')),
          failed && !checkedOut ? retry : null));
        steps.push(step('index', 'Index the files',
          state(checkedOut, succeeded, failed && checkedOut),
          failed && checkedOut ? message : (succeeded ? plural(ownJob.filesIndexed, 'file') + ' indexed, ' + plural(ownJob.chunksIndexed, 'searchable piece') + '.' : (checkedOut ? jobProgress(ownJob) : '')),
          failed && checkedOut ? retry : null));
        const profileFailed = succeeded && !run.profileRetried && message.indexOf('Project profile could not be updated') >= 0;
        steps.push(step('profile', 'Detect the OBDX version and project profile',
          state(false, succeeded && !profileFailed, profileFailed),
          profileFailed ? message.slice(message.indexOf('Project profile could not be updated')) : (succeeded ? 'Profile detected from revision ' + ownJob.toRevision + '.' : ''),
          profileFailed && retry ? this.retryProfile : null));
        return steps;
      });
      this.runProfile = ko.pureComputed(() => {
        const run = this.run();
        if (!run || !run.done) {
          return null;
        }
        const version = versionOf(run.id);
        return {
          loaded: !!(wsDetails()[run.id] || {}).profile,
          version: version,
          declared: 'OBDX ' + run.obdxVersion,
          canConfirm: session.can(run.id, 'MANAGE_CODE') && !!version && !!version.fact && version.fact.status === 'detected' && !!version.fact.detectedValue
        };
      });
      // The run is done once the server says the import succeeded; then its profile is read
      const runWatch = ko.computed(() => {
        const run = this.run();
        const entry = this.runEntry();
        const job = entry ? jobOf(entry) : null;
        if (run && !run.done && run.jobId && job && job.id === run.jobId && job.status === 'SUCCEEDED') {
          ko.ignoreDependencies(() => {
            setRun({ done: true });
            loadDetails(run.id, true);
          });
        }
      });

      const startRun = () => {
        const run = this.run();
        if (!run.importNow) {
          return Promise.resolve();
        }
        setRun({ start: 'running', startError: '' });
        return startImport(run.id)
          .then((job) => setRun({ start: 'done', jobId: job.id, importNow: true }))
          .catch((error) => setRun({ start: 'failed', startError: error.message + ' Try again; the workspace is saved.' }));
      };
      const saveSignIn = () => {
        const run = this.run();
        if (!run.withLogin) {
          return Promise.resolve(true);
        }
        setRun({ signIn: 'running' });
        return api.put('workspaces/' + run.id + '/svn', { svnUrl: run.svnUrl, svnUsername: this.svnUsername().trim(), svnPassword: this.svnPassword() })
          .then(() => { setRun({ signIn: 'done' }); return true; })
          .catch((error) => { setRun({ signIn: 'failed', signInError: error.message + ' Try again, or set the sign-in later on the Code page.' }); return false; });
      };
      const afterCreate = () => saveSignIn().then((ok) => (ok ? startRun() : null));
      const create = () => {
        const run = this.run();
        setRun({ create: 'running', createError: '' });
        return api.post('workspaces', { name: run.name, bankName: run.bankName, obdxVersion: run.obdxVersion, svnUrl: run.svnUrl })
          .then((workspace) => {
            setRun({ create: 'done', id: workspace.id });
            return workspaceSelection.load().then(() => {
              workspaceSelection.selectedId(workspace.id);
              return dashboard.load();
            }).then(afterCreate);
          })
          .catch((error) => setRun({ create: 'failed', createError: error.message + ' Change the details and try again.' }));
      };
      this.retryCreate = () => create();
      this.retrySignIn = () => afterCreate();
      this.retryStart = () => { setRun({ importNow: true }); startRun(); };
      this.retryProfile = () => {
        const run = this.run();
        api.post('workspaces/' + run.id + '/profile/refresh')
          .then((profile) => { setProfile(run.id, profile); setRun({ profileRetried: true }); toast.success('Project profile detected.'); })
          .catch((error) => toast.error(error.message));
      };
      this.createFailed = ko.pureComputed(() => !!this.run() && this.run().create === 'failed');
      this.backToDetails = () => this.run(null);

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
        this.run(Object.assign({}, RUN_STEPS, {
          name: this.name().trim(), bankName: this.bankName().trim(), obdxVersion: this.obdxVersion(), svnUrl: this.inspection().svnUrl,
          withLogin: this.sourceKind() === 'url' && !!this.svnUsername().trim(), importNow: this.importNow(), done: false
        }));
        create();
      };
      this.confirmRunVersion = () => {
        const run = this.run();
        const p = this.runProfile();
        if (!run || !p || !p.canConfirm) {
          return;
        }
        api.put('workspaces/' + run.id + '/profile/facts/obdx.version', { value: p.version.fact.detectedValue })
          .then((profile) => { setProfile(run.id, profile); toast.success('Detected OBDX version confirmed.'); })
          .catch((error) => toast.error(error.message));
      };
      this.runGo = (page) => () => {
        const run = this.run();
        this.closeCreate();
        dashboard.open(page, run ? run.id : undefined)();
      };

      const resetCreate = () => {
        this.run(null);
        this.svnUrl('');
        this.svnUsername('');
        this.svnPassword('');
        this.folderPath('');
        this.name('');
        this.bankName('');
        this.obdxVersion('');
        this.importNow(true);
        this.showErrors(false);
        this.browsing(false);
        suggested = {};
        resetCheck();
      };
      // The steps render after the next binding pass: try for up to a second
      const focusCreate = (tries) => window.setTimeout(() => {
        const input = document.getElementById(this.sourceKind() === 'folder' ? 'folderPath' : 'svnUrl');
        const control = input ? input.querySelector('input') : null;
        if (!control) {
          if ((tries || 0) < 10) {
            focusCreate((tries || 0) + 1);
          }
          return;
        }
        const card = document.getElementById('createWorkspaceCard');
        if (card) {
          card.scrollIntoView({ block: 'start' });
        }
        control.focus();
      }, 100);
      this.openCreate = () => {
        resetCreate();
        this.creating(true);
        loadLocal().then(() => {
          this.sourceKind(this.localEnabled() ? 'folder' : 'url');
          focusCreate();
        });
      };
      // Closing keeps a running import going on the server; the list shows its progress
      this.closeCreate = () => {
        this.creating(false);
        resetCreate();
        window.setTimeout(() => { const b = document.getElementById('newWorkspaceButton'); if (b) { b.focus(); } }, 0);
      };
      this.changeSource = () => { resetCheck(); focusCreate(); };

      const load = () => Promise.all([dashboard.load(), workspaceSelection.load()])
        .then(() => { this.errorMessage(''); data().forEach((d) => loadDetails(d.workspace.id)); })
        .catch(showError);
      this.reload = () => load();
      // The load error in plain words: a network failure says to check the connection
      this.loadError = ko.pureComputed(() => {
        const message = this.errorMessage() || dashboard.error();
        return /Failed to fetch|NetworkError|Load failed/i.test(message || '') ? 'the factory could not be reached' : message;
      });

      this.connected = () => {
        accUtils.announce('Workspaces page loaded.');
        document.title = 'Workspaces';
        polling = true;
        liveSubscription = data.subscribe(poll);
        // A workspace's details asked for by another page (the Code page's repository settings)
        const sheetRequest = pageRequests.workspace();
        pageRequests.workspace(null);
        load().then(() => {
          if (sheetRequest && data().some((d) => d.workspace.id === sheetRequest)) {
            this.openSheet(sheetRequest);
          }
        }).then(poll);
        if (session.isAdmin()) {
          // A new workspace asked for on Home (Connect a code base, or the first-run form): open the flow with it
          const request = pageRequests.newWorkspace();
          pageRequests.newWorkspace(null);
          loadLocal().then(() => {
            if (!request) {
              if (!data().length && !dashboard.loading()) {
                this.openCreate();
              }
              return;
            }
            resetCreate();
            this.creating(true);
            this.sourceKind(request.kind === 'folder' && this.localEnabled() ? 'folder' : 'url');
            if (this.sourceKind() === 'folder') {
              this.folderPath(request.value || '');
              if (request.browse) {
                this.toggleBrowse();
              } else if (request.value) {
                this.checkFolder();
              }
            } else {
              this.svnUrl(request.value || '');
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
        runWatch.dispose();
      };
    }

    return WorkspacesViewModel;
  }
);
