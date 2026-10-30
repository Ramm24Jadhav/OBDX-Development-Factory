/*
 * OBDX Library page: the knowledge base the AI chat and code generation use. Ask (answers with numbered citations
 * that open the manual at the page, feedback, save an answer as a note), Documents (Oracle's manuals per OBDX version
 * and the bank's own and patchset documents, with their import progress, older revisions and the watched folders that
 * keep them current) and Notes (knowledge users and agents add; suggested until approved, and only approved notes reach
 * code generation; notes whose cited sections changed in a newer revision come back for review).
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', '../services/ui',
        '../services/toast', '../services/dialog', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, workspaceSelection, ui, toast, dialog) {
    // Document and note states shown in the factory's status words
    const DOC_STATUS = { QUEUED: ['QUEUED', 'Queued'], READING: ['PROCESSING', 'Reading'], EMBEDDING: ['PROCESSING', 'Embedding'], READY: ['SUCCEEDED', 'Ready'], FAILED: ['FAILED', 'Failed'],
      SUPERSEDED: ['CLOSED', 'Older revision'] };
    const NOTE_STATUS = { SUGGESTED: ['IN_REVIEW', 'Suggested'], TRUSTED: ['APPROVED', 'Approved'], REJECTED: ['CLOSED', 'Rejected'] };
    const ORIGIN = { USER: 'Written by a user', AGENT: 'Learned from a change', SUMMARY: 'Summarised from the manuals' };
    const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
    const pages = (s) => (s.pageFrom ? (s.pageFrom === s.pageTo ? 'p. ' + s.pageFrom : 'pp. ' + s.pageFrom + '–' + s.pageTo) : '');

    function LibraryViewModel() {
      this.isAdmin = session.isAdmin;
      this.workspaceId = workspaceSelection.selectedId;
      this.workspaceName = ko.pureComputed(() => {
        const o = workspaceSelection.options().find((x) => x.value === this.workspaceId());
        return o ? o.label : 'no workspace';
      });
      this.errorMessage = ko.observable('');
      this.overview = ko.observable(null);
      // Administrators add Oracle's manuals; a workspace's managers add the bank's own documents for it
      this.canImport = ko.pureComputed(() => session.isAdmin() || (!!this.workspaceId() && session.can(this.workspaceId(), 'MANAGE_CODE')));

      this.tab = ko.observable('ask');
      this.tabs = [['ask', 'Ask', 'sparkle'], ['documents', 'Documents', 'doc'], ['notes', 'Notes', 'list']].map(([value, text, icon]) => ({
        value: value, text: text, iconClass: 'factory-nav-icon factory-ico-' + icon,
        selected: ko.pureComputed(() => this.tab() === value),
        css: ko.pureComputed(() => (this.tab() === value ? 'factory-tab factory-tab-on' : 'factory-tab')),
        pick: () => { this.tab(value); if (value === 'notes') { this.loadNotes(); } }
      }));

      // --- overview ---
      this.kpis = ko.pureComputed(() => {
        const s = (this.overview() || {}).stats || {};
        const share = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
        const rated = (s.helpful || 0) + (s.notHelpful || 0);
        return [
          { label: 'Documents', value: s.documents || 0, sub: (s.ready || 0) + ' ready' + (s.revised ? ' · ' + s.revised + ' older revisions' : ''), icon: 'doc', tone: 'blue' },
          { label: 'Sections', value: s.sections || 0, sub: share(s.embedded || 0, s.sections || 0) + ' searchable by meaning', icon: 'search', tone: 'violet' },
          { label: 'Approved notes', value: s.trustedNotes || 0, sub: 'used by code generation', icon: 'check', tone: 'green' },
          { label: 'Suggested notes', value: s.suggestedNotes || 0, sub: s.notesToCheck ? s.notesToCheck + ' to check after updates' : 'waiting for review', icon: 'clock', tone: 'amber' },
          { label: 'Helpful answers', value: rated ? share(s.helpful || 0, rated) : '–', sub: rated + ' rated', icon: 'sparkle', tone: 'blue' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-ov2-tile-icon factory-ov2-tone-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });
      this.documents = ko.pureComputed(() => ((this.overview() || {}).documents || []).map((d) => {
        const st = DOC_STATUS[d.status] || [d.status, d.status];
        const s = ui.status(st[0], st[1]);
        const older = d.status === 'SUPERSEDED';
        return Object.assign({}, d, {
          statusCss: s.css, statusIcon: s.iconCss, statusText: s.text, older: older, rowCss: older ? 'is-older' : '',
          scope: (d.workspaceId ? 'This bank' : 'Oracle manual') + (d.patchset ? ' · patchset ' + d.patchset : '')
            + (older ? ' · replaced ' + when(d.supersededAt) : ''),
          progress: d.sections ? Math.round((d.embedded / d.sections) * 100) : 0,
          progressStyle: { width: (d.sections ? Math.round((d.embedded / d.sections) * 100) : 0) + '%' },
          // Only a document still being read or embedded animates; the list reloads every few seconds while one is
          progressCss: 'fx-progress factory-lb-progress' + (d.status === 'QUEUED' || d.status === 'READING' || d.status === 'EMBEDDING' ? ' is-running' : ''),
          busy: d.status === 'QUEUED' || d.status === 'READING' || d.status === 'EMBEDDING',
          canEmbed: (d.status === 'READY' || d.status === 'FAILED') && d.sections > d.embedded,
          url: 'api/knowledge/documents/' + d.id + '/file',
          admin: d.workspaceId ? session.can(d.workspaceId, 'MANAGE_CODE') : session.isAdmin(),
          embed: () => this.embedAgain(d), remove: () => this.removeDocument(d),
          when: when(d.updatedAt)
        });
      }));
      // Older revisions are kept as history; they are listed only on request
      this.showOlder = ko.observable(false);
      this.setShowOlder = (event) => this.showOlder(!!event.target.checked);
      this.olderCount = ko.pureComputed(() => this.documents().filter((d) => d.older).length);
      this.versions = ko.pureComputed(() => {
        const by = {};
        this.documents().filter((d) => this.showOlder() || !d.older).forEach((d) => { (by[d.obdxVersion] = by[d.obdxVersion] || []).push(d); });
        return Object.keys(by).sort().reverse().map((v) => {
          const current = by[v].filter((d) => !d.older);
          return { version: v, documents: by[v], summary: current.filter((d) => d.status === 'READY').length + ' of ' + current.length + ' ready' };
        });
      });
      // Folders the documents came from: checked again on a schedule for Oracle's and the bank's updated files
      this.folders = ko.pureComputed(() => ((this.overview() || {}).folders || []).map((f) => ({
        id: f.id, folder: f.folder,
        about: 'OBDX ' + f.obdxVersion + (f.patchset ? ' · patchset ' + f.patchset : '') + ' · ' + (f.workspaceId ? 'This bank' : 'Oracle manuals'),
        last: f.lastScanAt ? 'Checked ' + when(f.lastScanAt) + (f.lastResult ? ': ' + f.lastResult : '') : 'Not checked yet',
        canManage: f.workspaceId ? session.can(f.workspaceId, 'MANAGE_CODE') : session.isAdmin(),
        busy: ko.observable(false),
        check: null, stop: null
      })).map((f) => Object.assign(f, { check: () => this.checkFolder(f), stop: () => this.stopFolder(f) })));
      this.importing = ko.pureComputed(() => this.documents().some((d) => d.busy));
      this.folderImport = ko.pureComputed(() => !!(this.overview() || {}).folderImport);
      // Set when the configured models are outside the bank: the knowledge is then not sent to them
      this.privacy = ko.pureComputed(() => (this.overview() || {}).privacy || "");

      this.load = () => api.get('knowledge').then((o) => { this.overview(o); this.errorMessage(''); })
        .catch((e) => this.errorMessage('Could not load the library: ' + e.message));
      let timer = null;
      const poll = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (this.importing() || this.oracleRunning()) { Promise.all([this.load(), this.loadOracle()]).finally(poll); } else { poll(); }
        }, 4000);
      };

      // --- Oracle's manuals, fetched from Oracle's site and kept current ---
      this.oracle = ko.observable({ enabled: false, follows: [] });
      this.oracleVersions = ko.observableArray([]);
      this.oracleVersion = ko.observable('');
      this.oracleScope = ko.observable('TECHNICAL');
      this.oracleScopes = [{ value: 'TECHNICAL', label: 'Technical guides (recommended)' },
        { value: 'ALL', label: 'All manuals, user manuals too (many more to read and embed)' }];
      this.oracleBusy = ko.observable(false);
      // Why Oracle's versions could not be listed (no internet access, for example)
      this.oracleNote = ko.observable('');
      this.showOracle = ko.pureComputed(() => this.oracle().enabled && (session.isAdmin() || this.oracle().follows.length > 0));
      this.oracleRunning = ko.pureComputed(() => this.oracle().follows.some((f) => f.running));
      this.oracleFollows = ko.pureComputed(() => this.oracle().follows.map((f) => ({
        version: f.obdxVersion,
        about: (f.scope === 'ALL' ? 'All manuals' : 'Technical guides') + (f.release ? ' · release ' + f.release : '') + ' · ' + f.files + ' file' + (f.files === 1 ? '' : 's'),
        last: f.running ? 'Checking Oracle’s site now…' : f.lastCheckAt ? 'Checked ' + when(f.lastCheckAt) + (f.lastResult ? ': ' + f.lastResult : '') : 'Not checked yet',
        running: f.running,
        checkCss: f.running ? 'fx-btn fx-btn--secondary fx-btn--sm is-busy' : 'fx-btn fx-btn--secondary fx-btn--sm',
        check: () => this.checkOracle(f.obdxVersion), stop: () => this.stopOracle(f.obdxVersion)
      })));
      this.loadOracle = () => api.get('knowledge/oracle').then((o) => this.oracle(o)).catch(() => null);
      let versionsLoaded = false;
      this.loadOracleVersions = () => {
        if (versionsLoaded || !session.isAdmin() || !this.oracle().enabled) { return; }
        versionsLoaded = true;
        api.get('knowledge/oracle/versions').then((list) => {
          this.oracleVersions(list.map((v) => ({ value: v, label: 'OBDX ' + v })));
          if (!this.oracleVersion() && list.length) { this.oracleVersion(list[0]); }
          this.oracleNote('');
        }).catch((e) => { versionsLoaded = false; this.oracleNote(e.message); });
      };
      this.followOracle = () => {
        if (!this.oracleVersion()) { return; }
        this.oracleBusy(true);
        api.post('knowledge/oracle/follow', { obdxVersion: this.oracleVersion(), scope: this.oracleScope() })
          .then((f) => {
            toast.success('Checking Oracle’s site for the OBDX ' + f.obdxVersion + ' manuals. New and changed ones are imported in the background.');
            return this.loadOracle().then(poll);
          })
          .catch((e) => toast.error(e.message)).finally(() => this.oracleBusy(false));
      };
      this.checkOracle = (version) => api.post('knowledge/oracle/' + version + '/check')
        .then(() => { toast.info('Checking Oracle’s site for changed OBDX ' + version + ' manuals.'); return this.loadOracle().then(poll); })
        .catch((e) => toast.error(e.message));
      this.stopOracle = (version) => dialog.confirm({ title: 'Stop following OBDX ' + version + '?',
        message: 'The manuals already imported stay in the library; Oracle’s new patchsets and fixes are no longer picked up.', confirmLabel: 'Stop following' })
        .then((ok) => (ok ? api.del('knowledge/oracle/' + version).then(() => { toast.success('No longer following OBDX ' + version); return this.loadOracle(); }) : null))
        .catch((e) => toast.error(e.message));
      this.tab.subscribe((t) => { if (t === 'documents') { this.loadOracleVersions(); } });

      // --- import ---
      this.importVersion = ko.observable('25.2');
      this.importPatchset = ko.observable('');
      this.importFolder = ko.observable('');
      this.importForBank = ko.observable(false);
      // Only administrators add the shared Oracle manuals
      this.forBank = () => this.importForBank() || !session.isAdmin();
      this.importBusy = ko.observable(false);
      const reportImport = (r) => {
        const n = r.queued.length;
        if (n) { toast.success(n + ' document' + (n === 1 ? '' : 's') + ' queued. They are read and embedded in the background.'); }
        if (r.skipped.length) { toast.info('Skipped: ' + r.skipped.join('; ')); }
        return this.load();
      };
      this.runFolderImport = () => {
        this.importBusy(true);
        api.post('knowledge/import', { folder: this.importFolder(), obdxVersion: this.importVersion(), patchset: this.importPatchset() || null,
          workspaceId: this.forBank() ? this.workspaceId() : null })
          .then(reportImport).catch((e) => toast.error(e.message)).finally(() => this.importBusy(false));
      };
      this.upload = (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files.length) { return; }
        this.importBusy(true);
        files.reduce((p, f) => p.then(() => {
          const form = new FormData();
          form.append('file', f);
          form.append('obdxVersion', this.importVersion());
          if (this.importPatchset()) { form.append('patchset', this.importPatchset()); }
          if (this.forBank() && this.workspaceId()) { form.append('workspaceId', this.workspaceId()); }
          return api.upload('knowledge/documents', form).then(reportImport);
        }), Promise.resolve()).catch((e) => toast.error(e.message)).finally(() => this.importBusy(false));
      };
      this.checkFolder = (f) => {
        f.busy(true);
        return api.post('knowledge/folders/' + f.id + '/check')
          .then((r) => { if (!r.queued.length) { toast.info('No new or changed documents in ' + f.folder + '.'); return this.load(); } return reportImport(r); })
          .catch((e) => toast.error(e.message)).finally(() => f.busy(false));
      };
      this.stopFolder = (f) => dialog.confirm({ title: 'Stop watching this folder?', message: f.folder + '\nIts documents stay in the library; new and changed files there are no longer picked up.', confirmLabel: 'Stop watching' })
        .then((ok) => (ok ? api.del('knowledge/folders/' + f.id).then(() => { toast.success('No longer watching ' + f.folder); return this.load(); }) : null))
        .catch((e) => toast.error(e.message));
      this.chooseFiles = () => { const input = document.getElementById('libraryUpload'); if (input) { input.click(); } };
      this.embedAgain = (d) => api.post('knowledge/documents/' + d.id + '/embed').then(() => { toast.info('Embedding again: ' + d.title); return this.load(); }).catch((e) => toast.error(e.message));
      this.removeDocument = (d) => dialog.confirm({ title: 'Remove "' + d.title + '"?', message: 'Its sections leave the knowledge base. Notes stay.', confirmLabel: 'Remove', danger: true })
        .then((ok) => (ok ? api.del('knowledge/documents/' + d.id).then(() => { toast.success('Removed ' + d.title); return this.load(); }) : null))
        .catch((e) => toast.error(e.message));

      // --- ask ---
      this.question = ko.observable('');
      this.asking = ko.observable(false);
      this.answer = ko.observable(null);
      // The answer as the model writes it; the sources come first, from the search
      this.answerText = ko.observable('');
      this.thinking = ko.observable('');
      this.rated = ko.observable(null);
      // The conversation so far (questions and answers), so a follow-up such as "and how do I clone one?" is understood
      this.turns = ko.observableArray([]);
      this.followingUp = ko.pureComputed(() => this.turns().length > 0);
      this.lastQuestion = ko.pureComputed(() => (this.turns().length ? this.turns()[this.turns().length - 1].question : ''));
      this.newConversation = () => { this.turns([]); this.answer(null); this.answerText(''); this.question(''); };
      this.examples = ['How do I add a field to an existing OBDX transaction screen?', 'How is a fund transfer sent to the host?',
        'Where are UI components extended without changing the product code?', 'What does the Extensibility API toolkit provide?'];
      this.exampleRows = this.examples.map((text) => ({ text: text, ask: () => { this.question(text); this.ask(); } }));
      this.setImportForBank = (event) => this.importForBank(!!event.target.checked);
      this.setNewForBank = (event) => this.newForBank(!!event.target.checked);
      this.ask = () => {
        const q = (this.question() || '').trim();
        if (!q || this.asking()) { return; }
        this.asking(true);
        this.rated(null);
        this.answer(null);
        this.answerText('');
        this.thinking('Searching the manuals and notes…');
        const shown = (a) => Object.assign({}, a, {
          question: q,
          meta: a.model ? a.model + ' · ' + Math.round(a.latencyMs / 100) / 10 + 's' + (a.versionLine ? ' · OBDX ' + a.versionLine + '.x' : '') : '',
          sourceRows: (a.sources || []).map((s) => Object.assign({}, s, {
            label: '[' + s.n + ']',
            where: s.kind === 'NOTE' ? (s.status === 'TRUSTED' ? 'Approved' : 'Suggested, not approved yet') + (s.bank ? ' bank note' : ' note')
              : (s.bank ? 'Bank document · ' : '') + 'OBDX ' + s.obdxVersion + (s.patchset ? ' · patchset ' + s.patchset : '') + (s.heading ? ' · ' + s.heading : '') + (pages(s) ? ' · ' + pages(s) : ''),
            css: 'factory-lb-source' + (s.kind === 'NOTE' && s.status !== 'TRUSTED' ? ' is-suggested' : '')
          })),
          // For administrators: how the sources were found
          diagnosticRows: a.diagnostics ? [['Searched for', a.diagnostics.searched], ['Search', a.diagnostics.searchMillis + ' ms'],
            ['Sent to the model', a.diagnostics.contextChars + ' characters']].map(([k, v]) => ({ k: k, v: String(v) })) : [],
          shortList: a.diagnostics ? a.diagnostics.shortList.map((row, i) => ({ text: (i + 1) + '. ' + row, kept: a.diagnostics.kept.indexOf(row) >= 0 ? 'kept' : '' })) : []
        });
        let diagnostics = null;
        let failed = null;
        const history = this.turns().slice(-3);
        api.stream('knowledge/ask/stream', { question: q, workspaceId: this.workspaceId() || null, history: history }, (event) => {
          if (event.type === 'status') {
            this.thinking(event.text);
          } else if (event.type === 'sources') {
            diagnostics = event.diagnostics || null;
            this.answer(shown(event));
            this.thinking(event.sources.length
              ? 'Found ' + event.sources.length + ' sources. The model is reading them; the answer appears here as it is written…'
              : 'Nothing in the knowledge base on this. Asking the model…');
          } else if (event.type === 'text') {
            this.answerText(this.answerText() + event.text);
          } else if (event.type === 'done') {
            this.answer(shown(Object.assign({}, event.answer, { diagnostics: diagnostics })));
            this.answerText(event.answer.answer);
            this.turns.push({ question: q, answer: event.answer.answer });
            this.question('');
          } else if (event.type === 'error') {
            failed = event.message;
          }
        })
          .then(() => {
            if (failed) {
              toast.error('Not answered: ' + failed);
              if (!this.answerText()) { this.answer(null); }
            }
          })
          .catch((e) => { this.answer(null); toast.error('Not answered: ' + e.message); })
          .finally(() => this.asking(false));
      };
      this.rate = (helpful) => () => {
        const a = this.answer();
        if (!a || this.rated() !== null) { return; }
        api.post('knowledge/feedback', { workspaceId: this.workspaceId() || null, question: a.question, answer: this.answerText(), helpful: helpful, sources: a.sources })
          .then(() => { this.rated(helpful); toast.success('Thank you. Feedback shows which answers need better knowledge.'); }).catch((e) => toast.error(e.message));
      };
      this.saveAnswer = () => {
        const a = this.answer();
        if (!a) { return; }
        api.post('knowledge/notes', { workspaceId: null, versionLine: a.versionLine, topic: null, title: a.question.slice(0, 280), body: this.answerText(), sources: a.sources })
          .then(() => { toast.success('Saved as a suggested note. A reviewer approves it on the Notes tab.'); return this.load(); }).catch((e) => toast.error(e.message));
      };

      // --- notes ---
      this.noteFilter = ko.observable('');
      // CHECK: notes whose cited sections changed in a newer revision of the document
      this.noteFilters = [['', 'All'], ['CHECK', 'To check after updates'], ['SUGGESTED', 'Suggested'], ['TRUSTED', 'Approved'], ['REJECTED', 'Rejected']].map(([value, label]) => ({
        value: value, label: label, pick: () => this.noteFilter(value),
        css: ko.pureComputed(() => (this.noteFilter() === value ? 'fx-chip is-selected' : 'fx-chip')),
        pressed: ko.pureComputed(() => (this.noteFilter() === value ? 'true' : 'false'))
      }));
      this.notesRaw = ko.observableArray([]);
      this.notes = ko.pureComputed(() => this.notesRaw().filter((n) => this.noteFilter() !== 'CHECK' || (n.needsReview && n.status !== 'REJECTED')).map((n) => {
        const st = NOTE_STATUS[n.status] || [n.status, n.status];
        const s = ui.status(st[0], st[1]);
        let sources = [];
        try { sources = JSON.parse(n.sources || '[]'); } catch (e) { sources = []; }
        return Object.assign({}, n, {
          statusCss: s.css, statusIcon: s.iconCss, statusText: s.text, origin: ORIGIN[n.origin] || n.origin,
          scope: (n.workspaceId ? 'This bank' : 'All banks') + (n.versionLine ? ' · OBDX ' + n.versionLine + '.x' : ' · every version'),
          when: when(n.updatedAt), by: n.createdBy, sourceRows: sources.map((x, i) => ({ text: '[' + (i + 1) + '] ' + x.title + (x.heading ? ' · ' + x.heading : '') + (x.pageFrom ? ' · ' + pages(x) : ''), url: x.url })),
          canReview: n.workspaceId ? session.can(n.workspaceId, 'APPROVE') : session.isAdmin(),
          isSuggested: n.status === 'SUGGESTED', isTrusted: n.status === 'TRUSTED',
          approve: this.review(n, 'TRUSTED'), reject: this.review(n, 'REJECTED'), unreview: this.review(n, 'SUGGESTED'), remove: this.removeNote(n)
        });
      }));
      this.loadNotes = () => api.get('knowledge/notes' + (this.noteFilter() && this.noteFilter() !== 'CHECK' ? '?status=' + this.noteFilter() : '')).then((list) => this.notesRaw(list))
        .catch((e) => toast.error('Could not load the notes: ' + e.message));
      this.noteFilter.subscribe(() => this.loadNotes());
      this.review = (n, status) => () => api.post('knowledge/notes/' + n.id + '/review', { status: status })
        .then(() => { toast.success(status === 'TRUSTED' ? 'Approved: code generation uses it now.' : status === 'REJECTED' ? 'Rejected.' : 'Back to suggested.'); this.loadNotes(); this.load(); })
        .catch((e) => toast.error(e.message));
      this.removeNote = (n) => () => dialog.confirm({ title: 'Delete the note "' + n.title + '"?', message: 'It leaves the knowledge base.', confirmLabel: 'Delete', danger: true })
        .then((ok) => (ok ? api.del('knowledge/notes/' + n.id).then(() => { this.loadNotes(); this.load(); }) : null)).catch((e) => toast.error(e.message));

      this.newOpen = ko.observable(false);
      this.newTitle = ko.observable('');
      this.newTopic = ko.observable('');
      this.newBody = ko.observable('');
      this.newForBank = ko.observable(false);
      this.toggleNew = () => this.newOpen(!this.newOpen());
      this.saveNew = () => api.post('knowledge/notes', { workspaceId: this.newForBank() ? this.workspaceId() : null, versionLine: null, topic: this.newTopic(), title: this.newTitle(), body: this.newBody(), sources: [] })
        .then(() => { toast.success('Saved as a suggested note.'); this.newTitle(''); this.newTopic(''); this.newBody(''); this.newOpen(false); this.loadNotes(); this.load(); })
        .catch((e) => toast.error(e.message));

      this.summaryTopic = ko.observable('');
      this.summarising = ko.observable(false);
      this.summarise = () => {
        if (!(this.summaryTopic() || '').trim()) { return; }
        this.summarising(true);
        api.post('knowledge/summaries', { topic: this.summaryTopic(), workspaceId: this.workspaceId() || null })
          .then(() => { toast.success('Drafted a note from the manuals. Review it below.'); this.summaryTopic(''); this.noteFilter('SUGGESTED'); this.loadNotes(); this.load(); })
          .catch((e) => toast.error(e.message)).finally(() => this.summarising(false));
      };

      this.connected = () => {
        accUtils.announce('OBDX Library page loaded.');
        document.title = 'OBDX Library';
        this.load();
        this.loadOracle().then(() => { if (this.tab() === 'documents') { this.loadOracleVersions(); } });
        poll();
      };
      this.disconnected = () => window.clearTimeout(timer);
    }

    return LibraryViewModel;
  }
);
