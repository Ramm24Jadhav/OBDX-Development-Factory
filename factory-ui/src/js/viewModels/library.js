/*
 * OBDX Library page: the knowledge base the AI chat and code generation use. Ask (answers with numbered citations
 * that open the manual at the page, feedback, save an answer as a note), Documents (Oracle's manuals per OBDX version
 * and the bank's own documents, with their import progress) and Notes (knowledge users and agents add; suggested
 * until approved, and only approved notes reach code generation).
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', '../services/ui',
        '../services/toast', '../services/dialog', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, workspaceSelection, ui, toast, dialog) {
    // Document and note states shown in the factory's status words
    const DOC_STATUS = { QUEUED: ['QUEUED', 'Queued'], READING: ['PROCESSING', 'Reading'], EMBEDDING: ['PROCESSING', 'Embedding'], READY: ['SUCCEEDED', 'Ready'], FAILED: ['FAILED', 'Failed'] };
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
          { label: 'Documents', value: s.documents || 0, sub: (s.ready || 0) + ' ready', icon: 'doc', tone: 'blue' },
          { label: 'Sections', value: s.sections || 0, sub: share(s.embedded || 0, s.sections || 0) + ' searchable by meaning', icon: 'search', tone: 'violet' },
          { label: 'Approved notes', value: s.trustedNotes || 0, sub: 'used by code generation', icon: 'check', tone: 'green' },
          { label: 'Suggested notes', value: s.suggestedNotes || 0, sub: 'waiting for review', icon: 'clock', tone: 'amber' },
          { label: 'Helpful answers', value: rated ? share(s.helpful || 0, rated) : '–', sub: rated + ' rated', icon: 'sparkle', tone: 'blue' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-ov2-tile-icon factory-ov2-tone-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });
      this.documents = ko.pureComputed(() => ((this.overview() || {}).documents || []).map((d) => {
        const st = DOC_STATUS[d.status] || [d.status, d.status];
        const s = ui.status(st[0], st[1]);
        return Object.assign({}, d, {
          statusCss: s.css, statusIcon: s.iconCss, statusText: s.text,
          scope: d.workspaceId ? 'This bank' : 'Oracle manual',
          progress: d.sections ? Math.round((d.embedded / d.sections) * 100) : 0,
          progressStyle: { width: (d.sections ? Math.round((d.embedded / d.sections) * 100) : 0) + '%' },
          busy: d.status === 'QUEUED' || d.status === 'READING' || d.status === 'EMBEDDING',
          canEmbed: (d.status === 'READY' || d.status === 'FAILED') && d.sections > d.embedded,
          url: 'api/knowledge/documents/' + d.id + '/file',
          admin: session.isAdmin(), embed: () => this.embedAgain(d), remove: () => this.removeDocument(d),
          when: when(d.updatedAt)
        });
      }));
      this.versions = ko.pureComputed(() => {
        const by = {};
        this.documents().forEach((d) => { (by[d.obdxVersion] = by[d.obdxVersion] || []).push(d); });
        return Object.keys(by).sort().reverse().map((v) => ({ version: v, documents: by[v], ready: by[v].filter((d) => d.status === 'READY').length }));
      });
      this.importing = ko.pureComputed(() => this.documents().some((d) => d.busy));
      this.folderImport = ko.pureComputed(() => !!(this.overview() || {}).folderImport);
      // Set when the configured models are outside the bank: the knowledge is then not sent to them
      this.privacy = ko.pureComputed(() => (this.overview() || {}).privacy || "");

      this.load = () => api.get('knowledge').then((o) => { this.overview(o); this.errorMessage(''); })
        .catch((e) => this.errorMessage('Could not load the library: ' + e.message));
      let timer = null;
      const poll = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (this.importing()) { this.load().finally(poll); } else { poll(); } }, 4000); };

      // --- import ---
      this.importVersion = ko.observable('25.2');
      this.importFolder = ko.observable('');
      this.importForBank = ko.observable(false);
      this.importBusy = ko.observable(false);
      const reportImport = (r) => {
        const n = r.queued.length;
        if (n) { toast.success(n + ' document' + (n === 1 ? '' : 's') + ' queued. They are read and embedded in the background.'); }
        if (r.skipped.length) { toast.info('Skipped: ' + r.skipped.join('; ')); }
        return this.load();
      };
      this.runFolderImport = () => {
        this.importBusy(true);
        api.post('knowledge/import', { folder: this.importFolder(), obdxVersion: this.importVersion(), workspaceId: this.importForBank() ? this.workspaceId() : null })
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
          if (this.importForBank() && this.workspaceId()) { form.append('workspaceId', this.workspaceId()); }
          return api.upload('knowledge/documents', form).then(reportImport);
        }), Promise.resolve()).catch((e) => toast.error(e.message)).finally(() => this.importBusy(false));
      };
      this.chooseFiles = () => { const input = document.getElementById('libraryUpload'); if (input) { input.click(); } };
      this.embedAgain = (d) => api.post('knowledge/documents/' + d.id + '/embed').then(() => { toast.info('Embedding again: ' + d.title); return this.load(); }).catch((e) => toast.error(e.message));
      this.removeDocument = (d) => dialog.confirm({ title: 'Remove "' + d.title + '"?', message: 'Its sections leave the knowledge base. Notes stay.', confirmLabel: 'Remove', danger: true })
        .then((ok) => (ok ? api.del('knowledge/documents/' + d.id).then(() => { toast.success('Removed ' + d.title); return this.load(); }) : null))
        .catch((e) => toast.error(e.message));

      // --- ask ---
      this.question = ko.observable('');
      this.asking = ko.observable(false);
      this.answer = ko.observable(null);
      this.rated = ko.observable(null);
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
        api.post('knowledge/ask', { question: q, workspaceId: this.workspaceId() || null })
          .then((a) => this.answer(Object.assign(a, {
            question: q,
            meta: a.model + ' · ' + Math.round(a.latencyMs / 100) / 10 + 's' + (a.versionLine ? ' · OBDX ' + a.versionLine + '.x' : ''),
            sourceRows: a.sources.map((s) => Object.assign({}, s, {
              label: '[' + s.n + ']',
              where: s.kind === 'NOTE' ? (s.status === 'TRUSTED' ? 'Approved note' : 'Suggested note, not approved yet') : 'OBDX ' + s.obdxVersion + (s.heading ? ' · ' + s.heading : '') + ' · ' + pages(s),
              css: 'factory-lb-source' + (s.kind === 'NOTE' && s.status !== 'TRUSTED' ? ' is-suggested' : '')
            }))
          })))
          .catch((e) => toast.error('Not answered: ' + e.message))
          .finally(() => this.asking(false));
      };
      this.rate = (helpful) => () => {
        const a = this.answer();
        if (!a || this.rated() !== null) { return; }
        api.post('knowledge/feedback', { workspaceId: this.workspaceId() || null, question: a.question, answer: a.answer, helpful: helpful, sources: a.sources })
          .then(() => { this.rated(helpful); toast.success('Thank you. Feedback shows which answers need better knowledge.'); }).catch((e) => toast.error(e.message));
      };
      this.saveAnswer = () => {
        const a = this.answer();
        if (!a) { return; }
        api.post('knowledge/notes', { workspaceId: null, versionLine: a.versionLine, topic: null, title: a.question.slice(0, 280), body: a.answer, sources: a.sources })
          .then(() => { toast.success('Saved as a suggested note. A reviewer approves it on the Notes tab.'); return this.load(); }).catch((e) => toast.error(e.message));
      };

      // --- notes ---
      this.noteFilter = ko.observable('');
      this.noteFilters = [['', 'All'], ['SUGGESTED', 'Suggested'], ['TRUSTED', 'Approved'], ['REJECTED', 'Rejected']].map(([value, label]) => ({
        value: value, label: label, pick: () => this.noteFilter(value),
        css: ko.pureComputed(() => (this.noteFilter() === value ? 'fx-chip is-selected' : 'fx-chip')),
        pressed: ko.pureComputed(() => (this.noteFilter() === value ? 'true' : 'false'))
      }));
      this.notesRaw = ko.observableArray([]);
      this.notes = ko.pureComputed(() => this.notesRaw().map((n) => {
        const st = NOTE_STATUS[n.status] || [n.status, n.status];
        const s = ui.status(st[0], st[1]);
        let sources = [];
        try { sources = JSON.parse(n.sources || '[]'); } catch (e) { sources = []; }
        return Object.assign({}, n, {
          statusCss: s.css, statusIcon: s.iconCss, statusText: s.text, origin: ORIGIN[n.origin] || n.origin,
          scope: (n.workspaceId ? 'This bank' : 'All banks') + (n.versionLine ? ' · OBDX ' + n.versionLine + '.x' : ' · every version'),
          when: when(n.updatedAt), by: n.createdBy, sourceRows: sources.map((x, i) => ({ text: '[' + (i + 1) + '] ' + x.title + (x.pageFrom ? ' · ' + pages(x) : ''), url: x.url })),
          canReview: n.workspaceId ? session.can(n.workspaceId, 'APPROVE') : session.isAdmin(),
          isSuggested: n.status === 'SUGGESTED', isTrusted: n.status === 'TRUSTED',
          approve: this.review(n, 'TRUSTED'), reject: this.review(n, 'REJECTED'), unreview: this.review(n, 'SUGGESTED'), remove: this.removeNote(n)
        });
      }));
      this.loadNotes = () => api.get('knowledge/notes' + (this.noteFilter() ? '?status=' + this.noteFilter() : '')).then((list) => this.notesRaw(list))
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
        poll();
      };
      this.disconnected = () => window.clearTimeout(timer);
    }

    return LibraryViewModel;
  }
);
