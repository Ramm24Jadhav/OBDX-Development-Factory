/*
 * OBDX Library page: the knowledge base the AI chat and code generation use. One header (title, Add documents), at most
 * one library problem bar under it (search by meaning is off, or embedding in progress), then three tabs:
 *  - Ask: empty, one centred question (what the answers cite, the composer, four example cards). After a question, a
 *    thread: the question as a bubble, the answer beside its mark with one folded line on how it was found and checked,
 *    citations as numbered pills, icon actions, Save as a note and the questions to ask next; the composer under it
 *    (the answer length, Improve my question, an expanded editor) scrolls with the page. Beside it a Sources rail of
 *    compact cards (type, number, title, where, a short excerpt); it says plainly when the documents hold too little,
 *    keeping the model's general answer folded away.
 *  - Documents: where the documents come from (Oracle's site and watched folders, one strip), then one table grouped by
 *    OBDX version with filters (title, version, type, source, state), older revisions on request and a menu per row.
 *    Documents are added in a side sheet: uploaded files, a watched folder or Oracle's site.
 *  - Notes: knowledge users and agents add, as a review queue in one column: notes whose cited sections changed in a newer
 *    revision first, then by origin. Suggested until approved; only approved notes reach code generation.
 * It is about documents, not the bank's code (Code and Knowledge Explorer search that).
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', '../services/ui',
        '../services/toast', '../services/dialog', '../services/markdown', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, workspaceSelection, ui, toast, dialog, markdown) {
    // Document and note states shown in the factory's status words
    const DOC_STATUS = { QUEUED: ['QUEUED', 'Queued'], READING: ['PROCESSING', 'Reading'], EMBEDDING: ['PROCESSING', 'Embedding'], READY: ['SUCCEEDED', 'Ready'], FAILED: ['FAILED', 'Failed'],
      SUPERSEDED: ['CLOSED', 'Older revision'] };
    const NOTE_STATUS = { SUGGESTED: ['IN_REVIEW', 'Suggested'], TRUSTED: ['APPROVED', 'Approved'], REJECTED: ['CLOSED', 'Rejected'] };
    const ORIGIN = { USER: 'Written by a user', AGENT: 'Learned from a change', SUMMARY: 'Summarised from the manuals' };
    // The Notes queue's groups after "Check after a manual changed"
    const ORIGIN_GROUP = { USER: 'Written by users', AGENT: 'Learned from delivered changes', SUMMARY: 'Drafted from the manuals' };
    const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
    const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
    const pages = (s) => (s.pageFrom ? (s.pageFrom === s.pageTo ? 'p. ' + s.pageFrom : 'pp. ' + s.pageFrom + '–' + s.pageTo) : '');
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    // A link only to web pages or the factory's own files: a stored source URL could be javascript:
    const safeUrl = (u) => (typeof u === 'string' && /^(https?:\/\/|\/?api\/)/i.test(u.trim()) ? u.trim() : null);
    // How well the sources support an answer (the check after the model has written it)
    const QUALITY = {
      VERIFIED: ['fx-badge fx-badge--success', 'Verified against the sources'],
      PARTIALLY_VERIFIED: ['fx-badge fx-badge--warning', 'Partly verified'],
      INSUFFICIENT_EVIDENCE: ['fx-badge fx-badge--neutral', 'Not enough in the manuals']
    };
    // What a document or a cited source is
    const KIND = (s) => (s.kind === 'NOTE' ? (s.status === 'TRUSTED' ? 'Approved note' : 'Suggested note') : s.bank ? 'Bank document' : 'Oracle manual');
    // The badge on a source card: the file type of its document, or NOTE
    const FILE_TYPE = (s, fileName) => {
      if (s.kind === 'NOTE') { return 'NOTE'; }
      const ext = String(fileName || '').split('.').pop().toLowerCase();
      return ext === 'pdf' ? 'PDF' : /^docx?$/.test(ext) ? 'DOC' : /^html?$/.test(ext) ? 'HTML' : /^(md|txt)$/.test(ext) ? 'TXT' : s.pageFrom ? 'PDF' : 'DOC';
    };
    // A source's excerpt on its card: the first words, quoted
    const shortExcerpt = (text) => {
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      return t ? '“' + (t.length > 110 ? t.slice(0, 107).replace(/\s+\S*$/, '') + '…' : t) + '”' : '';
    };
    // The examples on an empty Ask, each with what kind of question it is
    const EXAMPLES = [
      ['Extend a screen', 'monitor', 'How do I add a field to an existing OBDX transaction screen?'],
      ['Host integration', 'plug', 'How is a fund transfer sent to the host?'],
      ['Customise safely', 'shield', 'Where are UI components extended without changing the product code?'],
      ['Toolkit', 'cog', 'What does the Extensibility API toolkit provide?']
    ];
    // The answer length: the server's styles, named for what they give
    const STYLES = [
      { value: 'CONCISE', label: 'Short', description: 'A few lines: the direct answer' },
      { value: 'DETAILED', label: 'Detailed', description: 'Steps to follow, with the sources cited' },
      { value: 'DEEP_DIVE', label: 'Deep dive', description: 'Every step, with code and the files to change' }
    ];
    // A document's message saying it is searched by keywords only: the problem bar says that once for the library
    const KEYWORDS_ONLY = /^Searched by keywords only[\s\S]*?(Use Embed again when it is back\.|factory\.knowledge\.internal-hosts\.|$)\s*/;
    const copy = (text, what) => {
      if (!navigator.clipboard) { toast.error('Copying is not available in this browser.'); return; }
      navigator.clipboard.writeText(text).then(() => toast.success(what + ' copied.'), () => toast.error('Could not copy.'));
    };
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const focusLater = (id) => window.setTimeout(() => { const el = document.getElementById(id); if (el) { el.focus(); } }, 0);
    const PAGE = 25;

    function LibraryViewModel() {
      this.isAdmin = session.isAdmin;
      this.workspaceId = workspaceSelection.selectedId;
      this.workspaceName = ko.pureComputed(() => {
        const o = workspaceSelection.options().find((x) => x.value === this.workspaceId());
        // The workspace's name, without the bank and version the picker adds in brackets
        return o ? o.label.replace(/\s*\([^)]*\)$/, '') : 'no workspace';
      });
      this.errorMessage = ko.observable('');
      this.overview = ko.observable(null);
      // Administrators add Oracle's manuals; a workspace's managers add the bank's own documents for it
      this.canImport = ko.pureComputed(() => session.isAdmin() || (!!this.workspaceId() && session.can(this.workspaceId(), 'MANAGE_CODE')));
      this.canAdd = this.canImport;

      this.tab = ko.observable('ask');
      this.tabs = [['ask', 'Ask'], ['documents', 'Documents'], ['notes', 'Notes']].map(([value, text]) => ({
        value: value, text: text,
        count: ko.pureComputed(() => {
          const s = (this.overview() || {}).stats || {};
          if (value === 'documents') { return this.documents().filter((d) => !d.older).length ? String(this.documents().filter((d) => !d.older).length) : ''; }
          if (value === 'notes') {
            const total = (s.trustedNotes || 0) + (s.suggestedNotes || 0);
            return s.suggestedNotes ? String(s.suggestedNotes) : total ? String(total) : '';
          }
          return '';
        }),
        // "to review" after the Notes count (hidden on phones)
        countMore: ko.pureComputed(() => (value === 'notes' && ((this.overview() || {}).stats || {}).suggestedNotes ? ' to review' : '')),
        countCss: ko.pureComputed(() => 'factory-lb-cnt' + (value === 'notes' && ((this.overview() || {}).stats || {}).suggestedNotes ? ' is-warn' : '')),
        selected: ko.pureComputed(() => this.tab() === value),
        pick: () => { this.tab(value); if (value === 'notes') { this.loadNotes(); } }
      }));
      // Arrow keys, Home and End move between the tabs (WAI-ARIA tabs pattern)
      this.tabKey = (event) => {
        const keys = this.tabs.map((t) => t.value);
        const at = keys.indexOf(this.tab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.tabs[next].pick();
        const button = document.getElementById('lb-' + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };

      // --- overview ---
      const oracleSite = ko.pureComputed(() => (this.overview() || {}).fromOracleSite || []);
      this.documents = ko.pureComputed(() => {
        const list = (this.overview() || {}).documents || [];
        // Which documents have older revisions kept (same version, owner and file)
        const key = (d) => d.obdxVersion + '|' + (d.workspaceId || '') + '|' + d.fileName;
        const withOlder = new Set(list.filter((d) => d.status === 'SUPERSEDED').map(key));
        // When every document is searched by keywords only, the problem bar says so and the rows just say Ready
        const current = list.filter((d) => d.status !== 'SUPERSEDED' && d.sections > 0);
        const allPartial = current.length > 0 && current.every((d) => d.status === 'READY' && d.sections > d.embedded);
        return list.map((d) => {
          const older = d.status === 'SUPERSEDED';
          const partial = d.status === 'READY' && d.sections > d.embedded;
          const busy = d.status === 'QUEUED' || d.status === 'READING' || d.status === 'EMBEDDING';
          const progress = d.sections ? Math.round((d.embedded / d.sections) * 100) : 0;
          const st = DOC_STATUS[d.status] || [d.status, d.status];
          const s = partial && !allPartial ? ui.status('WARNING', 'Ready · keywords only') : ui.status(st[0], d.status === 'EMBEDDING' && d.sections ? 'Embedding · ' + progress + '%' : st[1]);
          const source = oracleSite().indexOf(d.id) >= 0 ? 'SITE' : d.sourceId ? 'FOLDER' : 'UPLOAD';
          const admin = d.workspaceId ? session.can(d.workspaceId, 'MANAGE_CODE') : session.isAdmin();
          const canEmbed = (d.status === 'READY' || d.status === 'FAILED') && d.sections > d.embedded;
          const hasOlder = !older && withOlder.has(key(d));
          // A message every partial row shares (the embedding model is unavailable) is said once, in the problem bar
          const rowMessage = d.status === 'FAILED' ? (d.message || 'It could not be read.') : (d.message || '').replace(KEYWORDS_ONLY, '').trim();
          const menu = [];
          if (canEmbed && admin) { menu.push({ value: 'embed', label: 'Embed again', icon: 'refresh' }); }
          if (hasOlder) { menu.push({ value: 'older', label: 'Show older revisions', icon: 'clock' }); }
          if (admin) { menu.push({ value: 'remove', label: 'Remove…', icon: 'trash', danger: true }); }
          const row = Object.assign({}, d, {
            statusCss: s.css, statusIcon: s.iconCss, statusText: s.text, older: older, rowCss: older ? 'is-older' : '',
            scope: (d.kind === 'ORACLE_NOTE' ? 'Oracle support note' + (d.reference ? ' ' + d.reference : '') + (d.workspaceId ? ' · this bank' : '')
              : d.workspaceId ? 'This bank' : 'Oracle manual') + (d.patchset ? ' · patchset ' + d.patchset : '')
              + (older ? ' · replaced ' + when(d.supersededAt) : ''),
            subtitle: (d.kind === 'ORACLE_NOTE' ? 'Oracle support note' + (d.reference ? ' ' + d.reference : '') + (d.workspaceId ? ' · this bank' : '')
              : d.workspaceId ? 'This bank' : 'Oracle manual') + (d.patchset ? ' · patchset ' + d.patchset : '')
              + (older ? ' · replaced ' + when(d.supersededAt) : '') + (source === 'UPLOAD' && d.importedBy ? ' · uploaded by ' + d.importedBy : ''),
            progress: progress, busy: busy, canEmbed: canEmbed,
            url: 'api/knowledge/documents/' + d.id + '/file',
            admin: admin,
            type: d.kind === 'ORACLE_NOTE' ? 'NOTE' : d.workspaceId ? 'BANK' : 'ORACLE', patch: !!d.patchset,
            source: source,
            sourceChip: source === 'SITE' ? 'Oracle\'s site' : source === 'FOLDER' ? 'Folder' : 'Uploaded',
            sourceCss: 'fx-badge fx-badge--plain ' + (source === 'SITE' ? 'fx-badge--primary' : d.workspaceId ? 'fx-badge--success' : 'fx-badge--neutral'),
            sourceText: source === 'SITE' ? 'From Oracle\'s site' : source === 'FOLDER' ? 'From a watched folder' : 'Uploaded' + (d.importedBy ? ' by ' + d.importedBy : ''),
            partial: partial, rowMessage: rowMessage, menu: menu,
            when: when(d.updatedAt)
          });
          row.act = (event) => {
            const v = event.detail.value;
            if (v === 'embed') { this.embedAgain(row); } else if (v === 'remove') { this.removeDocument(row); } else if (v === 'older') { this.showOlderOf(row); }
          };
          return row;
        });
      });
      // How much of the library is searchable by meaning, and one button to embed the rest
      this.embedding = ko.pureComputed(() => {
        const current = this.documents().filter((d) => !d.older && d.sections > 0);
        const sections = current.reduce((n, d) => n + d.sections, 0);
        const embedded = current.reduce((n, d) => n + Math.min(d.embedded, d.sections), 0);
        const waiting = current.filter((d) => d.embedded < d.sections).length;
        const percent = sections ? Math.floor((embedded / sections) * 100) : 0;
        return {
          show: current.length > 0, documents: current.length, sections: sections, waiting: waiting, percent: percent,
          partial: current.filter((d) => d.partial).length,
          running: current.some((d) => d.status === 'EMBEDDING' || d.status === 'QUEUED' || d.status === 'READING'),
          unreachable: current.some((d) => d.partial && /unavailable|not reachable/i.test(d.message || '')),
          text: embedded.toLocaleString() + ' of ' + sections.toLocaleString() + ' sections searchable by meaning',
          barStyle: { width: percent + '%' }
        };
      });
      // The library's one problem, said once with its fix: search by meaning is off, or the embedding is still running
      this.problem = ko.pureComputed(() => {
        const e = this.embedding();
        if (e.running && e.waiting > 0) {
          return { show: true, running: true, css: 'factory-lb-problem is-running', lead: 'Embedding.', percent: e.percent, barStyle: e.barStyle,
            text: e.text + '. Answers use keywords until it is done.' };
        }
        if (e.partial > 0) {
          const which = e.partial === e.documents ? 'all ' + plural(e.partial, 'document') : plural(e.partial, 'document') + ' of ' + e.documents;
          return { show: true, running: false, css: 'factory-lb-problem', lead: 'Keywords only.', percent: e.percent,
            text: (e.unreachable ? 'The embedding model is not reachable, so search by meaning is off for ' : 'Search by meaning is off for ') + which + '.' };
        }
        return { show: false };
      });
      this.openModels = (event) => { if (event && event.preventDefault) { event.preventDefault(); } navigate('models'); return false; };
      this.embedAllBusy = ko.observable(false);
      this.embedAll = () => {
        this.embedAllBusy(true);
        api.post('knowledge/embed-all')
          .then((r) => {
            toast.success(r.queued ? r.queued + ' document' + (r.queued === 1 ? '' : 's') + ' are being embedded in the background, one at a time.'
              : 'Every document is already embedded with the current model.');
            return this.load().then(poll);
          })
          .catch((e) => toast.error(ui.errorText(e)))
          .finally(() => this.embedAllBusy(false));
      };
      // Older revisions are kept as history; they are listed only on request
      this.showOlder = ko.observable(false);
      this.setShowOlder = (event) => this.showOlder(!!event.target.checked);
      this.olderCount = ko.pureComputed(() => this.documents().filter((d) => d.older).length);
      // Filters: title, OBDX version, type (Oracle manual, bank document, patchset), source and state
      this.docSearch = ko.observable('');
      this.docSearchInput = ui.value(this.docSearch);
      this.docVersion = ko.observable('');
      this.docType = ko.observable('');
      this.docSource = ko.observable('');
      this.docStatus = ko.observable('');
      this.docVersionOptions = ko.pureComputed(() => [{ value: '', label: 'All versions' }].concat(Array.from(new Set(this.documents().map((d) => d.obdxVersion))).sort().reverse()
        .map((v) => ({ value: v, label: 'OBDX ' + v }))));
      this.docTypeOptions = [{ value: '', label: 'All types' }, { value: 'ORACLE', label: 'Oracle manuals' }, { value: 'BANK', label: 'Bank documents' }, { value: 'NOTE', label: 'Oracle support notes' }, { value: 'PATCH', label: 'Patchset documents' }];
      this.docSourceOptions = [{ value: '', label: 'All sources' }, { value: 'SITE', label: 'Oracle\'s site' }, { value: 'FOLDER', label: 'Watched folders' }, { value: 'UPLOAD', label: 'Uploaded' }];
      this.docStatusOptions = [{ value: '', label: 'Any state' }, { value: 'FAILED', label: 'Failed' }, { value: 'RUNNING', label: 'In progress' },
        { value: 'PARTIAL', label: 'Keywords only' }, { value: 'OLDER', label: 'Older revisions' }];
      this.docFiltered = ko.pureComputed(() => !!(this.docSearch() || this.docVersion() || this.docType() || this.docSource() || this.docStatus()));
      const setSearchBox = (text) => { const el = document.getElementById('docSearch'); if (el) { el.value = text; } this.docSearch(text); };
      this.resetDocFilters = () => {
        setSearchBox('');
        this.docVersion(''); this.docType(''); this.docSource(''); this.docStatus('');
      };
      this.showOlderOf = (d) => { this.showOlder(true); setSearchBox(d.title); };
      const docMatches = (d) => {
        const text = this.docSearch().trim().toLowerCase();
        const st = this.docStatus();
        return (!text || (d.title + ' ' + d.fileName).toLowerCase().indexOf(text) >= 0) && (!this.docVersion() || d.obdxVersion === this.docVersion())
          && (!this.docType() || (this.docType() === 'PATCH' ? d.patch : d.type === this.docType())) && (!this.docSource() || d.source === this.docSource())
          && (st === 'OLDER' ? d.older : (this.showOlder() || !d.older) && (!st || (st === 'FAILED' && d.status === 'FAILED') || (st === 'RUNNING' && d.busy) || (st === 'PARTIAL' && d.partial)));
      };
      this.shownCount = ko.pureComputed(() => this.documents().filter(docMatches).length);
      // Long lists show a page at a time ("Show more"); a change of filter starts again from the first page
      this.pageSize = PAGE;
      this.docLimit = ko.observable(PAGE);
      ko.computed(() => { this.docSearch(); this.docVersion(); this.docType(); this.docSource(); this.docStatus(); this.showOlder(); this.docLimit(PAGE); });
      this.showMore = () => this.docLimit(this.docLimit() + PAGE);
      this.moreCount = ko.pureComputed(() => Math.max(0, this.shownCount() - this.docLimit()));
      this.moreLabel = ko.pureComputed(() => 'Show ' + Math.min(this.moreCount(), PAGE) + ' more');
      this.pageText = ko.pureComputed(() => {
        const n = this.shownCount();
        return n <= this.docLimit() ? plural(n, 'document') : '1–' + this.docLimit() + ' of ' + n;
      });
      this.versions = ko.pureComputed(() => {
        const by = {};
        const all = this.documents().filter(docMatches);
        const counts = {};
        all.forEach((d) => { counts[d.obdxVersion] = counts[d.obdxVersion] || []; counts[d.obdxVersion].push(d); });
        const ordered = Object.keys(counts).sort().reverse();
        let left = this.docLimit();
        ordered.forEach((v) => {
          const take = counts[v].slice(0, Math.max(0, left));
          left -= take.length;
          if (take.length) { by[v] = take; }
        });
        return ordered.filter((v) => by[v]).map((v) => {
          const current = counts[v].filter((d) => !d.older);
          return { version: v, documents: by[v], summary: current.filter((d) => d.status === 'READY').length + ' of ' + current.length + ' ready' };
        });
      });
      // Folders the documents came from: checked again on a schedule for Oracle's and the bank's updated files
      this.folders = ko.pureComputed(() => ((this.overview() || {}).folders || []).map((f) => ({
        id: f.id, folder: f.folder, bank: !!f.workspaceId,
        about: 'OBDX ' + f.obdxVersion + (f.patchset ? ' · patchset ' + f.patchset : '') + ' · ' + (f.workspaceId ? 'This bank' : 'Oracle manuals'),
        last: f.lastScanAt ? 'Checked ' + when(f.lastScanAt) + (f.lastResult ? ': ' + f.lastResult : '') : 'Not checked yet',
        canManage: f.workspaceId ? session.can(f.workspaceId, 'MANAGE_CODE') : session.isAdmin(),
        busy: ko.observable(false),
        check: null, stop: null
      })).map((f) => Object.assign(f, { check: () => this.checkFolder(f), stop: () => this.stopFolder(f) })));
      // The Sources strip: Oracle's site followed per version, then the watched folders
      this.sourceCards = ko.pureComputed(() => this.oracleFollows().map((o) => ({
        key: 'oracle-' + o.version, chip: 'Oracle\'s site', chipCss: 'fx-badge fx-badge--plain fx-badge--primary', name: 'OBDX ' + o.version,
        sub: o.about + ' · ' + o.last, canManage: session.isAdmin(), busy: o.busy, check: o.check,
        menu: [{ value: 'stop', label: 'Stop following', icon: 'x', danger: true }], act: () => o.stop()
      })).concat(this.folders().map((f) => ({
        key: 'folder-' + f.id, chip: f.bank ? 'This bank' : 'Folder', chipCss: 'fx-badge fx-badge--plain ' + (f.bank ? 'fx-badge--success' : 'fx-badge--neutral'),
        name: f.folder, sub: f.about + ' · ' + f.last, canManage: f.canManage, busy: f.busy, check: f.check,
        menu: [{ value: 'stop', label: 'Stop watching', icon: 'x', danger: true }], act: () => f.stop()
      }))));
      this.importing = ko.pureComputed(() => this.documents().some((d) => d.busy));
      this.folderImport = ko.pureComputed(() => !!(this.overview() || {}).folderImport);
      // Set when the configured models are outside the bank: the knowledge is then not sent to them
      this.privacy = ko.pureComputed(() => (this.overview() || {}).privacy || "");

      this.load = () => api.get('knowledge').then((o) => { this.overview(o); this.errorMessage(''); })
        .catch((e) => this.errorMessage('Could not load the library: ' + ui.errorText(e)));
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
        about: (f.scope === 'ALL' ? 'All manuals' : 'Technical guides') + (f.release ? ' · release ' + f.release : '') + ' · ' + plural(f.files, 'file'),
        last: f.running ? 'Checking Oracle’s site now…' : f.lastCheckAt ? 'Checked ' + when(f.lastCheckAt) + (f.lastResult ? ': ' + f.lastResult : '') : 'Not checked yet',
        running: f.running,
        busy: ko.observable(!!f.running),
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
        }).catch((e) => { versionsLoaded = false; this.oracleNote(ui.errorText(e)); });
      };
      this.followOracle = () => {
        if (!this.oracleVersion()) { return; }
        this.oracleBusy(true);
        api.post('knowledge/oracle/follow', { obdxVersion: this.oracleVersion(), scope: this.oracleScope() })
          .then((f) => {
            toast.success('Checking Oracle’s site for the OBDX ' + f.obdxVersion + ' manuals. New and changed ones are imported in the background.');
            this.addOpen(false);
            return this.loadOracle().then(poll);
          })
          .catch((e) => toast.error(ui.errorText(e))).finally(() => this.oracleBusy(false));
      };
      this.checkOracle = (version) => api.post('knowledge/oracle/' + version + '/check')
        .then(() => { toast.info('Checking Oracle’s site for changed OBDX ' + version + ' manuals.'); return this.loadOracle().then(poll); })
        .catch((e) => toast.error(ui.errorText(e)));
      this.stopOracle = (version) => dialog.confirm({ title: 'Stop following OBDX ' + version + '?',
        message: 'The manuals already imported stay in the library; Oracle’s new patchsets and fixes are no longer picked up.', confirmLabel: 'Stop following' })
        .then((ok) => (ok ? api.del('knowledge/oracle/' + version).then(() => { toast.success('No longer following OBDX ' + version); return this.loadOracle(); }) : null))
        .catch((e) => toast.error(ui.errorText(e)));

      // --- Add documents: the side sheet (upload files, watch a folder, Oracle's site) ---
      this.addOpen = ko.observable(false);
      this.addMode = ko.observable('UPLOAD');
      this.addModeOptions = ko.pureComputed(() => [{ value: 'UPLOAD', label: 'Upload files' }]
        .concat(this.folderImport() ? [{ value: 'FOLDER', label: 'Watch a folder' }] : [])
        .concat(session.isAdmin() && this.oracle().enabled ? [{ value: 'ORACLE', label: 'Oracle\'s site' }] : []));
      this.addMode.subscribe((m) => { if (m === 'ORACLE') { this.loadOracleVersions(); } });
      this.openAddSheet = () => {
        if (!this.addModeOptions().some((o) => o.value === this.addMode())) { this.addMode('UPLOAD'); }
        this.addOpen(true);
      };
      this.closeAddSheet = () => this.addOpen(false);
      this.importVersion = ko.observable('25.2');
      this.importPatchset = ko.observable('');
      // A manual, or an Oracle support note (bug text, patch readme, knowledge article) with Oracle's reference
      this.importKind = ko.observable('MANUAL');
      this.importKindOptions = [{ value: 'MANUAL', label: 'Manual or guide' },
        { value: 'ORACLE_NOTE', label: 'Oracle support note', description: 'A bug text, patch readme or knowledge article; the Issues page cites it' }];
      this.importReference = ko.observable('');
      this.importFolder = ko.observable('');
      this.importForBank = ko.observable(false);
      // Whose documents (administrators): Oracle's, shared by every workspace, or the bank's own for this workspace
      this.importWho = ko.pureComputed({ read: () => (this.importForBank() ? 'BANK' : 'ORACLE'), write: (v) => this.importForBank(v === 'BANK') });
      this.whoOptions = ko.pureComputed(() => [
        { value: 'ORACLE', label: 'Oracle\'s', description: 'Shared by every workspace on this version' },
        { value: 'BANK', label: 'The bank\'s own, for ' + this.workspaceName() + ' only', description: 'Used for this workspace\'s answers and code' }
      ]);
      // Only administrators add the shared Oracle manuals
      this.forBank = () => this.importForBank() || !session.isAdmin();
      this.importBusy = ko.observable(false);
      const reportImport = (r) => {
        const n = r.queued.length;
        if (n) { toast.success(n + ' document' + (n === 1 ? '' : 's') + ' queued. They are read and embedded in the background.'); }
        if (r.skipped.length) { toast.info('Skipped: ' + r.skipped.join('; ')); }
        return this.load().then(poll);
      };
      this.runFolderImport = () => {
        this.importBusy(true);
        api.post('knowledge/import', { folder: this.importFolder(), obdxVersion: this.importVersion(), patchset: this.importPatchset() || null,
          workspaceId: this.forBank() ? this.workspaceId() : null })
          .then((r) => { this.addOpen(false); return reportImport(r); }).catch((e) => toast.error(ui.errorText(e))).finally(() => this.importBusy(false));
      };
      // The files chosen or dropped, added with the sheet's main button
      const sizeText = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
      this.chosenFiles = ko.observableArray([]);
      const choose = (files) => {
        const known = new Set(this.chosenFiles().map((f) => f.name + '|' + f.file.size));
        files.filter((f) => !known.has(f.name + '|' + f.size)).forEach((f) => {
          const row = { name: f.name, size: sizeText(f.size), file: f };
          row.remove = () => this.chosenFiles.remove(row);
          this.chosenFiles.push(row);
        });
      };
      this.pickFiles = (event) => { choose(Array.from(event.target.files || [])); event.target.value = ''; };
      this.dropOver = ko.observable(false);
      this.dragOver = (event) => { event.preventDefault(); this.dropOver(true); return false; };
      this.dragLeave = () => { this.dropOver(false); return true; };
      this.dropFiles = (event) => { event.preventDefault(); this.dropOver(false); choose(Array.from((event.dataTransfer && event.dataTransfer.files) || [])); return false; };
      this.addLabel = ko.pureComputed(() => {
        const n = this.chosenFiles().length;
        return n ? 'Add ' + plural(n, 'document') : 'Add documents';
      });
      this.addChosen = () => {
        const files = this.chosenFiles().map((f) => f.file);
        if (!files.length) { return; }
        this.importBusy(true);
        files.reduce((p, f) => p.then(() => {
          const form = new FormData();
          form.append('file', f);
          form.append('obdxVersion', this.importVersion());
          if (this.importPatchset()) { form.append('patchset', this.importPatchset()); }
          if (this.forBank() && this.workspaceId()) { form.append('workspaceId', this.workspaceId()); }
          form.append('kind', this.importKind());
          if (this.importKind() === 'ORACLE_NOTE' && this.importReference()) { form.append('reference', this.importReference()); }
          return api.upload('knowledge/documents', form).then(reportImport);
        }), Promise.resolve()).then(() => { this.chosenFiles([]); this.addOpen(false); })
          .catch((e) => toast.error(ui.errorText(e))).finally(() => this.importBusy(false));
      };
      this.checkFolder = (f) => {
        f.busy(true);
        return api.post('knowledge/folders/' + f.id + '/check')
          .then((r) => { if (!r.queued.length) { toast.info('No new or changed documents in ' + f.folder + '.'); return this.load(); } return reportImport(r); })
          .catch((e) => toast.error(ui.errorText(e))).finally(() => f.busy(false));
      };
      this.stopFolder = (f) => dialog.confirm({ title: 'Stop watching this folder?', message: f.folder + '\nIts documents stay in the library; new and changed files there are no longer picked up.', confirmLabel: 'Stop watching' })
        .then((ok) => (ok ? api.del('knowledge/folders/' + f.id).then(() => { toast.success('No longer watching ' + f.folder); return this.load(); }) : null))
        .catch((e) => toast.error(ui.errorText(e)));
      this.chooseFiles = () => { const input = document.getElementById('libraryUpload'); if (input) { input.click(); } };
      this.embedAgain = (d) => api.post('knowledge/documents/' + d.id + '/embed').then(() => { toast.info('Embedding again: ' + d.title); return this.load().then(poll); }).catch((e) => toast.error(ui.errorText(e)));
      this.removeDocument = (d) => dialog.confirm({ title: 'Remove "' + d.title + '"?', message: 'Its sections leave the knowledge base. Notes stay.', confirmLabel: 'Remove', danger: true })
        .then((ok) => (ok ? api.del('knowledge/documents/' + d.id).then(() => { toast.success('Removed ' + d.title); return this.load(); }) : null))
        .catch((e) => toast.error(ui.errorText(e)));

      // --- ask ---
      this.question = ko.observable('');
      this.asking = ko.observable(false);
      this.answer = ko.observable(null);
      // The question the panel shows while it is answered and after
      this.askedQuestion = ko.observable('');
      this.answeredAt = ko.observable(0);
      const now = ko.observable(Date.now());
      let clock = null;
      // The answer as the model writes it; the sources come first, from the search
      this.answerText = ko.observable('');
      this.thinking = ko.observable('');
      this.rated = ko.observable(null);
      // Empty: no answer and nothing being answered; the page shows one centred question
      this.askEmpty = ko.pureComputed(() => !this.answer() && !this.asking());
      // The one line above the answer folds out how it was found and checked
      this.stepsOpen = ko.observable(false);
      this.toggleSteps = () => this.stepsOpen(!this.stepsOpen());
      this.canAsk = ko.pureComputed(() => !!(this.question() || '').trim());
      this.askCss = ko.pureComputed(() => 'fx-btn fx-btn--primary factory-lb-askbtn' + (this.asking() ? ' is-busy' : '') + (this.canAsk() ? '' : ' is-empty'));
      // How much detail the answer has: a menu in the composer
      this.styleOptions = STYLES;
      this.style = ko.observable('DETAILED');
      this.styleLabel = ko.pureComputed(() => (STYLES.find((s) => s.value === this.style()) || STYLES[1]).label);
      this.styleItems = ko.pureComputed(() => STYLES.map((s) => ({ value: s.value, label: s.label, description: s.description, checked: s.value === this.style() })));
      this.onStyle = (event) => this.style(event.detail.value);
      // The OBDX version the answer is for: the workspace's, or a version line the library has documents for
      this.askVersion = ko.observable('');
      const wsLine = () => { const v = workspaceSelection.selectedVersion(); return v ? String(v).split('.')[0] : ''; };
      this.askVersionOptions = ko.pureComputed(() => {
        const lines = Array.from(new Set(this.documents().filter((d) => !d.older).map((d) => d.versionLine).filter(Boolean))).sort().reverse();
        return [{ value: '', label: (wsLine() ? 'OBDX ' + wsLine() + '.x' : 'The workspace\'s OBDX version') + ' · ' + this.workspaceName() }]
          .concat(lines.filter((l) => l !== wsLine()).map((l) => ({ value: l, label: 'OBDX ' + l + '.x' })));
      });
      this.scopeText = ko.pureComputed(() => (this.askVersion() ? 'OBDX ' + this.askVersion() + '.x' : (wsLine() ? 'OBDX ' + wsLine() + '.x' : 'the workspace\'s OBDX version') + ' · ' + this.workspaceName()));
      // The documents an answer is searched in: the current ones of the version line asked about
      const searchedDocs = (line) => this.documents().filter((d) => !d.older && d.status !== 'FAILED' && (!line || d.versionLine === line));
      // Under the empty Ask's heading: what the answers cite, from the library's own counts
      this.coverText = ko.pureComputed(() => {
        const line = this.askVersion() || wsLine();
        const docs = searchedDocs(line);
        const stats = (this.overview() || {}).stats || {};
        const notes = (stats.trustedNotes || 0) + (stats.suggestedNotes || 0);
        const oracle = docs.filter((d) => !d.workspaceId);
        const versions = Array.from(new Set(oracle.map((d) => d.obdxVersion))).sort().reverse();
        const parts = [];
        if (oracle.length) { parts.push('Oracle\'s ' + (versions.length <= 3 ? versions.join(', ') + ' ' : '') + 'manuals'); }
        const ws = workspaceSelection.options().find((x) => x.value === this.workspaceId());
        if (docs.some((d) => d.workspaceId)) { parts.push(ws && ws.bankName ? ws.bankName + '\'s own documents' : 'the bank\'s own documents'); }
        if (notes) { parts.push('notes'); }
        const what = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
        if (!docs.length) {
          return notes ? 'Answers cite the library\'s notes. Add the OBDX manuals on the Documents tab for fuller answers.'
            : 'The library has no documents for ' + (line ? 'OBDX ' + line + '.x' : 'this version') + ' yet. Add them on the Documents tab.';
        }
        return 'Answers cite ' + plural(docs.length, 'document') + ': ' + what + '.';
      });
      // Above the thread: how many questions this conversation has
      this.conversationText = ko.pureComputed(() => 'This conversation · ' + plural(this.turns().length + (this.asking() ? 1 : 0), 'question'));
      this.askedAs = ko.pureComputed(() => (this.answer() && this.answer().improved) || '');
      // An answer without sources is folded away until asked for
      this.showUngrounded = ko.observable(false);
      this.toggleUngrounded = () => this.showUngrounded(!this.showUngrounded());
      this.sourcesText = ko.pureComputed(() => {
        const n = this.citedRows().length;
        const other = this.otherRows().length;
        return [n ? n + ' cited' : '', other ? other + ' searched and not used' : ''].filter(Boolean).join(' · ');
      });
      // Ask next: the follow-up questions the model suggested; one is asked as a follow-up
      this.nextRows = ko.pureComputed(() => ((this.answer() || {}).followUps || []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 3)
        .map((q) => ({ text: q, ask: () => { if (this.asking()) { return; } this.improvement(null); this.question(q); this.ask(); } })));
      this.citedRows = ko.pureComputed(() => {
        const a = this.answer();
        if (!a) {
          return [];
        }
        const text = this.answerText();
        return a.sourceRows.filter((s) => text.indexOf('[' + s.n + ']') >= 0);
      });
      this.otherRows = ko.pureComputed(() => {
        const a = this.answer();
        return a ? a.sourceRows.filter((s) => this.citedRows().indexOf(s) < 0) : [];
      });
      this.insufficient = ko.pureComputed(() => {
        const a = this.answer();
        return !!a && !this.asking() && (!a.grounded || (a.quality && a.quality.status === 'INSUFFICIENT_EVIDENCE') || (a.sourceRows.length > 0 && this.citedRows().length === 0));
      });
      this.insufficientText = ko.pureComputed(() => {
        const a = this.answer();
        if (!a) {
          return '';
        }
        return !a.grounded ? 'The indexed documents and notes have nothing on this, so there is no answer from them.'
          : a.quality && a.quality.status === 'INSUFFICIENT_EVIDENCE' ? 'The indexed documents do not hold enough to answer this fully. Parts the sources do not support are not facts.'
            : this.answerText().trim() ? 'The answer cites none of the sources found, so it is not supported by the documents.'
              : 'The model wrote no answer from the sources found.';
      });
      // The one line above the answer: how well the sources support it, then what was searched, read and how long it took
      this.answerMeta = ko.pureComputed(() => {
        const a = this.answer();
        if (!a) {
          return { show: false };
        }
        const docs = searchedDocs(a.versionLine).length;
        const sections = (a.sources || []).length;
        const steps = [docs ? 'Searched ' + plural(docs, 'document') : '', sections ? 'read ' + plural(sections, 'section') : '',
          !this.asking() && a.latencyMs ? Math.round(a.latencyMs / 100) / 10 + ' s' : ''].filter(Boolean);
        const joined = steps.join(' · ');
        const detail = joined.charAt(0).toUpperCase() + joined.slice(1);
        if (this.asking()) {
          return { show: true, css: 'fx-badge fx-badge--plain fx-badge--primary', icon: 'factory-nav-icon factory-ico-sparkle', chip: 'Writing the answer', detail: detail };
        }
        const n = this.citedRows().length;
        const grounded = a.grounded && n > 0;
        const status = a.quality ? a.quality.status : '';
        const chip = !grounded ? 'Not grounded in the documents'
          : status === 'VERIFIED' ? 'Verified against ' + plural(n, 'source')
            : status === 'PARTIALLY_VERIFIED' ? 'Partly verified against ' + plural(n, 'source')
              : status === 'INSUFFICIENT_EVIDENCE' ? 'Not enough in the manuals' : 'Grounded in ' + plural(n, 'source');
        const good = grounded && (status === 'VERIFIED' || !status);
        return {
          show: true,
          css: 'fx-badge fx-badge--plain ' + (good ? 'fx-badge--success' : 'fx-badge--warning'),
          icon: 'factory-nav-icon ' + (good ? 'factory-ico-check' : 'factory-ico-alert'),
          chip: chip,
          detail: detail
        };
      });
      // The detail folded under that line: its length, version, when, the model and its time, the search's note
      this.answerAbout = ko.pureComputed(() => {
        const a = this.answer();
        if (!a) {
          return '';
        }
        const minutes = Math.floor((now() - this.answeredAt()) / 60000);
        const ago = minutes < 1 ? 'just now' : minutes === 1 ? 'a minute ago' : minutes < 60 ? minutes + ' minutes ago' : when(new Date(this.answeredAt()).toISOString());
        return [(STYLES.find((s) => s.value === a.style) || {}).label || '', a.versionLine ? 'OBDX ' + a.versionLine + '.x' : '', ago, a.meta || '', a.note || '']
          .filter(Boolean).join(' · ');
      });

      // Improve My Question: the question in the box is rewritten precisely, with one line saying what to clarify and Undo.
      // Asking it sends the user's own question with the improved one, as before.
      this.improvement = ko.observable(null);
      this.improving = ko.observable(false);
      this.improveCss = ko.pureComputed(() => 'fx-btn fx-btn--ghost fx-btn--sm factory-lb-pill factory-lb-improvebtn' + (this.improving() ? ' is-busy' : '') + (this.improvement() ? ' is-on' : ''));
      this.improve = () => {
        const q = (this.question() || '').trim();
        if (!q) { toast.info('Write a question first, even a few words.'); return; }
        const original = this.improvement() ? this.improvement().original : q;
        this.improving(true);
        api.post('knowledge/improve-question', { question: q, workspaceId: this.workspaceId() || null, history: this.turns().slice(-3) })
          .then((r) => {
            const ready = r.status === 'READY';
            const clarify = r.clarificationQuestions || [];
            this.question(r.enhancedQuery || q);
            this.improvement({
              original: original,
              lead: ready ? 'Improved. Edit it if needed, then ask.'
                : (r.status === 'AMBIGUOUS' ? 'It can mean different things. ' : 'Something is missing. ') + 'Add it to the question, or ask anyway.',
              clarify: clarify.join(' · '),
              assumes: (r.assumptions || []).length ? 'Assumes ' + r.assumptions.join('; ') : '',
              made: r.byModel ? '' : 'Improved without the model.'
            });
            focusLater('libraryQuestion');
          })
          .catch((e) => toast.error('Not improved: ' + ui.errorText(e)))
          .finally(() => this.improving(false));
      };
      this.undoImprove = () => {
        const imp = this.improvement();
        if (imp) { this.question(imp.original); this.improvement(null); focusLater('libraryQuestion'); }
      };
      // The conversation so far (questions and answers), so a follow-up such as "and how do I clone one?" is understood
      this.turns = ko.observableArray([]);
      this.followingUp = ko.pureComputed(() => this.turns().length > 0);
      this.lastQuestion = ko.pureComputed(() => (this.turns().length ? this.turns()[this.turns().length - 1].question : ''));
      this.newConversation = () => { this.turns([]); this.improvement(null); this.answer(null); this.answerText(''); this.question(''); this.askedQuestion(''); focusLater('libraryQuestion'); };
      this.examples = EXAMPLES.map((e) => e[2]);
      this.exampleRows = EXAMPLES.map(([kind, icon, text]) => ({ kind: kind, icon: 'factory-nav-icon factory-ico-' + icon, text: text,
        ask: () => { this.question(text); this.ask(); } }));
      this.setNewForBank = (event) => this.newForBank(!!event.target.checked);
      this.ask = () => {
        const imp = this.improvement();
        const text = (this.question() || '').trim();
        this.askWith(imp && text && text !== imp.original ? { question: imp.original, improved: text } : {});
      };
      // The last question again (with the detail now chosen), in place of its answer
      this.regenerate = () => {
        const last = this.turns().length ? this.turns()[this.turns().length - 1] : null;
        if (!last || this.asking()) { return; }
        this.turns.pop();
        this.askWith({ question: last.question, improved: last.improved || null });
      };
      // Copied with each citation written out (manual, version, section, page) in place of its number
      this.copyAnswer = () => copy(markdown.plain(this.answerText(), (this.answer() || {}).sources), 'The answer is');
      this.askWith = (opts) => {
        const q = (opts.question || this.question() || '').trim();
        if (!q || this.asking()) { return; }
        const improved = opts.improved || null;
        const style = this.style();
        this.improvement(null);
        this.asking(true);
        this.rated(null);
        this.answer(null);
        this.answerText('');
        this.askedQuestion(q);
        this.showUngrounded(false);
        this.stepsOpen(false);
        this.thinking('Searching the manuals and notes…');
        const shown = (a) => Object.assign({}, a, {
          question: q,
          improved: improved,
          style: style,
          quality: a.report ? {
            css: (QUALITY[a.report.quality.status] || QUALITY.PARTIALLY_VERIFIED)[0],
            label: (QUALITY[a.report.quality.status] || QUALITY.PARTIALLY_VERIFIED)[1],
            status: a.report.quality.status,
            reason: a.report.quality.reason,
            findings: a.report.quality.findings || [],
            limitations: a.report.limitations || [],
            corrected: a.report.corrected,
            details: (a.report.quality.findings || []).length > 0
          } : null,
          meta: a.model ? a.model + ' · ' + Math.round(a.latencyMs / 100) / 10 + 's' : '',
          followUps: Array.isArray(a.followUps) ? a.followUps : [],
          sourceRows: (a.sources || []).map((s) => Object.assign({}, s, {
            type: FILE_TYPE(s, (this.documents().find((d) => d.id === s.documentId) || {}).fileName),
            typeCss: 'factory-lb-type is-' + FILE_TYPE(s, (this.documents().find((d) => d.id === s.documentId) || {}).fileName).toLowerCase(),
            shortExcerpt: shortExcerpt(s.excerpt),
            url: safeUrl(s.url), oracleUrl: safeUrl(s.oracleUrl),
            label: '[' + s.n + ']', kindText: KIND(s),
            version: s.kind === 'NOTE' ? '' : 'OBDX ' + s.obdxVersion + (s.patchset ? ' · patchset ' + s.patchset : ''),
            section: s.heading || '', pagesText: pages(s),
            metaText: [KIND(s), s.kind === 'NOTE' ? '' : s.obdxVersion + (s.patchset ? ' · patchset ' + s.patchset : ''), s.heading || '', pages(s)].filter(Boolean).join(' · '),
            previewLabel: s.pageFrom ? 'Open at page ' + s.pageFrom : 'Open the document',
            where: s.kind === 'NOTE' ? (s.status === 'TRUSTED' ? 'Approved' : 'Suggested, not approved yet') + (s.bank ? ' bank note' : ' note')
              : (s.bank ? 'Bank document · ' : '') + 'OBDX ' + s.obdxVersion + (s.patchset ? ' · patchset ' + s.patchset : '') + (s.heading ? ' · ' + s.heading : '') + (pages(s) ? ' · ' + pages(s) : ''),
            css: 'factory-lb-srcitem is-other' + (s.kind === 'NOTE' && s.status !== 'TRUSTED' ? ' is-suggested' : '')
          })),
          // For administrators: how the sources were found
          diagnosticRows: a.diagnostics ? [['Searched for', a.diagnostics.searched], ['Search', a.diagnostics.searchMillis + ' ms'],
            ['Sent to the model', a.diagnostics.contextChars + ' characters']].map(([k, v]) => ({ k: k, v: String(v) })) : [],
          shortList: a.diagnostics ? a.diagnostics.shortList.map((row, i) => ({ text: (i + 1) + '. ' + row, kept: a.diagnostics.kept.indexOf(row) >= 0 ? 'kept' : '' })) : []
        });
        let diagnostics = null;
        let failed = null;
        const history = this.turns().slice(-3);
        api.stream('knowledge/ask/stream', { question: q, workspaceId: this.workspaceId() || null, history: history, style: style, improved: improved,
          version: this.askVersion() || null }, (event) => {
          if (event.type === 'status') {
            this.thinking(event.text);
            if (this.answer() && this.answerText()) { this.answer(Object.assign({}, this.answer(), { checking: event.text })); }
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
            this.answeredAt(Date.now());
            now(Date.now());
            this.turns.push({ question: q, answer: event.answer.answer, improved: improved });
            this.question('');
          } else if (event.type === 'error') {
            failed = event.message;
          }
        })
          .then(() => {
            if (failed) {
              toast.error('Not answered: ' + ui.errorText(failed));
              if (!this.answerText()) { this.answer(null); this.question(improved || q); }
            }
          })
          .catch((e) => { this.answer(null); this.question(improved || q); toast.error('Not answered: ' + ui.errorText(e)); })
          .finally(() => this.asking(false));
      };
      // Enter asks, Shift+Enter is a new line; Ctrl+Shift+E opens the expanded editor
      this.composerKey = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing
          && event.target && event.target.tagName === 'TEXTAREA') {
          event.preventDefault();
          this.ask();
          return false;
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'E' || event.key === 'e')) {
          event.preventDefault();
          this.openEditor();
          return false;
        }
        return true;
      };
      // The expanded question editor: a modal over the page; focus stays in it, Escape closes it, Ctrl+Enter asks
      this.expanded = ko.observable(false);
      let editorOpener = null;
      this.openEditor = () => {
        editorOpener = document.activeElement && document.activeElement.id !== 'libraryQuestion' ? document.activeElement : document.getElementById('libraryExpand');
        this.expanded(true);
        window.setTimeout(() => {
          const area = document.querySelector('#libraryQuestionLarge textarea');
          if (area) { area.focus(); area.setSelectionRange(area.value.length, area.value.length); }
        }, 0);
      };
      this.closeEditor = () => {
        this.expanded(false);
        window.setTimeout(() => {
          const back = editorOpener && document.body.contains(editorOpener) ? editorOpener : document.getElementById('libraryExpand');
          if (back) { back.focus(); }
        }, 0);
      };
      this.editorBackdrop = (event) => { if (event.target === event.currentTarget) { this.closeEditor(); } return true; };
      this.askFromEditor = () => { if (!(this.question() || '').trim()) { return; } this.closeEditor(); this.ask(); };
      this.improveFromEditor = () => this.improve();
      this.editorKey = (event) => {
        if (event.defaultPrevented) { return true; }
        if (event.key === 'Escape') { event.preventDefault(); this.closeEditor(); return false; }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); this.askFromEditor(); return false; }
        if (event.key === 'Tab') {
          const box = document.getElementById('libraryEditor');
          const items = box ? Array.from(box.querySelectorAll('button, textarea, a[href], input, [tabindex="0"]')).filter((x) => !x.disabled && x.offsetParent !== null && !x.closest('.fx-menu')) : [];
          if (items.length) {
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); return false; }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); return false; }
          }
        }
        return true;
      };
      this.rate = (helpful) => () => {
        const a = this.answer();
        if (!a || this.rated() !== null) { return; }
        api.post('knowledge/feedback', { workspaceId: this.workspaceId() || null, question: a.question, answer: this.answerText(), helpful: helpful, sources: a.sources,
          comment: a.report ? 'quality ' + a.report.quality.status + (a.improved ? '; improved question: ' + a.improved : '') : null })
          .then(() => { this.rated(helpful); toast.success('Thank you. Feedback shows which answers need better knowledge.'); }).catch((e) => toast.error(ui.errorText(e)));
      };
      this.saveAnswer = () => {
        const a = this.answer();
        if (!a) { return; }
        api.post('knowledge/notes', { workspaceId: null, versionLine: a.versionLine, topic: null, title: a.question.slice(0, 280), body: this.answerText(), sources: a.sources })
          .then(() => { toast.success('Saved as a suggested note. A reviewer approves it on the Notes tab.'); return this.load(); }).catch((e) => toast.error(ui.errorText(e)));
      };

      // --- notes ---
      // The queue opens on To review: suggested notes, those to check after a manual changed first
      this.noteFilter = ko.observable('SUGGESTED');
      this.notesRaw = ko.observableArray([]);
      this.noteSearch = ko.observable('');
      this.noteSearchInput = ui.value(this.noteSearch);
      const NOTE_FILTERS = [['SUGGESTED', 'To review'], ['TRUSTED', 'Approved'], ['REJECTED', 'Rejected'], ['', 'All']];
      this.noteFilterOptions = ko.pureComputed(() => NOTE_FILTERS.map(([value, label]) => ({
        value: value, label: label + ' ' + this.notesRaw().filter((n) => !value || n.status === value).length
      })));
      this.noteFilters = this.noteFilterOptions;
      this.openNote = ko.observable(null);
      this.groupMore = ko.observable({});
      // Files a delivered change touched, and what it did, from the note the factory wrote
      const filesOf = (body) => {
        const m = /\n\nFiles it changed:\n([\s\S]*)$/.exec(body || '');
        return m ? m[1].split('\n').map((l) => l.replace(/^- /, '').trim()).filter(Boolean) : [];
      };
      const textOf = (body) => (body || '').replace(/\n\nFiles it changed:\n[\s\S]*$/, '');
      const summaryOf = (n) => {
        const did = /What it did: ([^\n]+)/.exec(n.body || '');
        const first = (did ? did[1] : textOf(n.body).split('\n').find((l) => l.trim()) || '').trim();
        return first.length > 160 ? first.slice(0, 157) + '…' : first;
      };
      this.notes = ko.pureComputed(() => {
        const text = this.noteSearch().trim().toLowerCase();
        return this.notesRaw().filter((n) => (!this.noteFilter() || n.status === this.noteFilter())
          && (!text || ((n.title || '') + ' ' + (n.body || '') + ' ' + (n.topic || '')).toLowerCase().indexOf(text) >= 0)).map((n) => {
          const st = NOTE_STATUS[n.status] || [n.status, n.status];
          const s = ui.status(st[0], st[1]);
          let sources = [];
          try { sources = JSON.parse(n.sources || '[]'); } catch (e) { sources = []; }
          const files = filesOf(n.body);
          const check = !!n.needsReview && n.status !== 'REJECTED';
          const canReview = n.workspaceId ? session.can(n.workspaceId, 'APPROVE') : session.isAdmin();
          const scope = (n.workspaceId ? 'Only for ' + this.workspaceName() : 'All banks') + (n.versionLine ? ' · OBDX ' + n.versionLine + '.x' : ' · every version');
          const chips = [];
          if (check) { chips.push({ css: 'fx-badge fx-badge--plain fx-badge--warning', text: 'Source changed' }); }
          if (files.length) { chips.push({ css: 'fx-badge fx-badge--plain fx-badge--neutral', text: plural(files.length, 'file') }); }
          if (n.status !== 'SUGGESTED') { chips.push({ css: s.css, text: s.text }); }
          const more = [];
          if (n.status !== 'SUGGESTED') { more.push({ value: 'unreview', label: 'Back to suggested', icon: 'refresh' }); }
          more.push({ value: 'delete', label: 'Delete', icon: 'trash', danger: true });
          const row = Object.assign({}, n, {
            statusCss: s.css, statusIcon: s.iconCss, statusText: s.text, origin: ORIGIN[n.origin] || n.origin,
            scope: scope, check: check, files: files, text: textOf(n.body), chips: chips,
            line: [summaryOf(n), (n.createdBy && n.origin === 'USER' ? 'Written by ' + n.createdBy : ''), scope, day(n.updatedAt)].filter(Boolean).join(' · '),
            when: when(n.updatedAt), by: n.createdBy, sourceRows: sources.map((x, i) => ({ text: '[' + (i + 1) + '] ' + x.title + (x.heading ? ' · ' + x.heading : '') + (x.pageFrom ? ' · ' + pages(x) : ''), url: safeUrl(x.url) })),
            canReview: canReview,
            isSuggested: n.status === 'SUGGESTED', isTrusted: n.status === 'TRUSTED',
            open: ko.pureComputed(() => this.openNote() === n.id),
            approve: this.review(n, 'TRUSTED'), reject: this.review(n, 'REJECTED'), unreview: this.review(n, 'SUGGESTED'), remove: this.removeNote(n),
            approveNext: () => this.approveAndNext(n),
            edit: () => this.editNote(n),
            toggle: () => this.toggleNote(n.id),
            menu: [{ value: 'edit', label: 'Edit', icon: 'edit' }].concat(more),
            openMenu: more
          });
          row.css = ko.pureComputed(() => 'factory-lb-note' + (row.open() ? ' is-open' : ''));
          row.act = (event) => {
            const v = event.detail.value;
            if (v === 'edit') { row.edit(); } else if (v === 'unreview') { row.unreview(); } else if (v === 'delete') { row.remove(); }
          };
          return row;
        });
      });
      // One column: the notes to check after a manual changed first, then the rest by origin
      const GROUP_SIZE = 8;
      this.noteGroups = ko.pureComputed(() => {
        const list = this.notes();
        const groups = [];
        const add = (key, title, rows, css) => {
          if (!rows.length) { return; }
          const all = !!this.groupMore()[key];
          const shown = all ? rows : rows.slice(0, GROUP_SIZE);
          // The open note is always shown, even past the first rows
          const open = rows.find((r) => r.id === this.openNote());
          if (open && shown.indexOf(open) < 0) { shown.push(open); }
          groups.push({ key: key, title: title, count: rows.length, rows: shown, hidden: rows.length - shown.length, css: css,
            more: () => this.groupMore(Object.assign({}, this.groupMore(), { [key]: true })) });
        };
        add('check', 'Check after a manual changed', list.filter((n) => n.check), 'factory-lb-group is-check');
        ['AGENT', 'SUMMARY', 'USER'].forEach((o) => add(o.toLowerCase(), ORIGIN_GROUP[o], list.filter((n) => !n.check && n.origin === ORIGIN[o]), 'factory-lb-group'));
        add('other', 'Other notes', list.filter((n) => !n.check && Object.keys(ORIGIN).every((o) => ORIGIN[o] !== n.origin)), 'factory-lb-group');
        return groups;
      });
      // The queue in reading order, for Approve and next
      const queue = () => this.noteGroups().reduce((all, g) => all.concat(g.rows.map((r) => r.id)), []);
      this.noteEmpty = ko.pureComputed(() => (this.noteSearch().trim() ? { title: 'No notes match', text: 'Change the search or show all notes.' }
        : this.noteFilter() === 'SUGGESTED' && this.notesRaw().length ? { title: 'Nothing to review', text: 'Every note is approved or rejected. New suggestions appear here.' }
          : { title: 'No notes here yet', text: 'Save a good answer, write what you know, draft one from the manuals, or deliver a change: each becomes a suggested note.' }));
      this.toggleNote = (id) => this.openNote(this.openNote() === id ? null : id);
      this.loadNotes = () => api.get('knowledge/notes').then((list) => this.notesRaw(list))
        .catch((e) => toast.error('Could not load the notes: ' + ui.errorText(e)));
      this.review = (n, status) => () => api.post('knowledge/notes/' + n.id + '/review', { status: status })
        .then(() => { toast.success(status === 'TRUSTED' ? 'Approved: code generation uses it now.' : status === 'REJECTED' ? 'Rejected.' : 'Back to suggested.'); this.load(); return this.loadNotes(); })
        .catch((e) => toast.error(ui.errorText(e)));
      // Approves the open note and opens the next one in the queue
      this.approveAndNext = (n) => {
        const ids = queue();
        const at = ids.indexOf(n.id);
        const next = ids.slice(at + 1).concat(ids.slice(0, Math.max(0, at))).find((id) => id !== n.id) || null;
        return api.post('knowledge/notes/' + n.id + '/review', { status: 'TRUSTED' })
          .then(() => { toast.success('Approved: code generation uses it now.'); this.load(); return this.loadNotes(); })
          .then(() => {
            const still = next && this.notes().some((x) => x.id === next) ? next : null;
            this.openNote(still);
            if (still) {
              window.setTimeout(() => {
                const row = document.getElementById('lbNoteRow-' + still);
                const b = row && row.querySelector('.factory-lb-noteopen');
                if (b) { b.focus({ preventScroll: true }); row.scrollIntoView({ block: 'nearest' }); }
              }, 0);
            }
          })
          .catch((e) => toast.error(ui.errorText(e)));
      };
      this.removeNote = (n) => () => dialog.confirm({ title: 'Delete the note "' + n.title + '"?', message: 'It leaves the knowledge base.', confirmLabel: 'Delete', danger: true })
        .then((ok) => (ok ? api.del('knowledge/notes/' + n.id).then(() => { this.loadNotes(); this.load(); }) : null)).catch((e) => toast.error(ui.errorText(e)));

      // Write a note, or edit one: the same side sheet
      this.newOpen = ko.observable(false);
      this.editingNote = ko.observable(null);
      this.newTitle = ko.observable('');
      this.newTopic = ko.observable('');
      this.newBody = ko.observable('');
      this.newForBank = ko.observable(false);
      this.openNewNote = () => { this.editingNote(null); this.newTitle(''); this.newTopic(''); this.newBody(''); this.newOpen(true); };
      this.toggleNew = () => (this.newOpen() ? this.closeNewNote() : this.openNewNote());
      this.closeNewNote = () => this.newOpen(false);
      this.editNote = (n) => { this.editingNote(n); this.newTitle(n.title || ''); this.newTopic(n.topic || ''); this.newBody(n.body || ''); this.newOpen(true); };
      this.saveNew = () => {
        const editing = this.editingNote();
        const request = editing
          ? api.put('knowledge/notes/' + editing.id, { workspaceId: editing.workspaceId, versionLine: editing.versionLine, topic: this.newTopic(), title: this.newTitle(), body: this.newBody(), sources: [] })
          : api.post('knowledge/notes', { workspaceId: this.newForBank() ? this.workspaceId() : null, versionLine: null, topic: this.newTopic(), title: this.newTitle(), body: this.newBody(), sources: [] });
        return request
          .then(() => { toast.success(editing ? 'Saved the note.' : 'Saved as a suggested note.'); this.newTitle(''); this.newTopic(''); this.newBody(''); this.newOpen(false); this.loadNotes(); this.load(); })
          .catch((e) => toast.error(ui.errorText(e)));
      };

      this.summaryTopic = ko.observable('');
      this.summarising = ko.observable(false);
      this.summarise = () => {
        if (!(this.summaryTopic() || '').trim() || this.summarising()) { return; }
        this.summarising(true);
        api.post('knowledge/summaries', { topic: this.summaryTopic(), workspaceId: this.workspaceId() || null })
          .then((n) => { toast.success('Drafted a note from the manuals. Review it below.'); this.summaryTopic(''); this.noteFilter('SUGGESTED'); if (n && n.id) { this.openNote(n.id); } this.loadNotes(); this.load(); })
          .catch((e) => toast.error(ui.errorText(e))).finally(() => this.summarising(false));
      };

      this.connected = () => {
        accUtils.announce('OBDX Library page loaded.');
        document.title = 'OBDX Library';
        this.load();
        this.loadOracle();
        this.loadNotes();
        poll();
        clock = window.setInterval(() => now(Date.now()), 30000);
      };
      this.disconnected = () => { window.clearTimeout(timer); window.clearInterval(clock); };
    }

    return LibraryViewModel;
  }
);
