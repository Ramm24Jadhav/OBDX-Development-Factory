/*
 * Knowledge Explorer page: the workspace's bank code as indexed by the factory. Browse it as a tree, read a file with
 * syntax colouring (services/syntax.js) and its details (size, lines, revision, what it imports, what mentions it, the
 * endpoints it serves, comments, requirements that link it), search file names and the indexed code, the API and
 * screen inventory from the modernization scan, the business rules of the requirements and the code they link, a
 * dependency diagram, and AI insights on the open file. The index's revision and freshness show at the top: the
 * repository's latest revision is only known from a check run on the Code page (it is not asked for here).
 * AI answers are marked as such, cite the file's lines, and name any manual they use. A file opens in the Code page's
 * viewer at its lines (pageRequests.codeFile). Files and content come from /files (an older server falls back to
 * code search hits).
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/assistant',
        '../services/pageRequests', '../services/toast', '../services/syntax', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, assistant, pageRequests, toast, syntax) {
    const size = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B');
    const MAX_LINES = 3000;
    // The AI gets the open file with line numbers, up to this many characters
    const AI_CHARS = 15000;
    const langOf = syntax.langOf;
    const tokenize = syntax.tokenize;
    // A failed request in plain words (ui.errorText): a network failure says to check the connection
    const plain = (error) => ui.errorText(error);
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    // Line references in an AI answer: "lines 12-20", "line 7", "L12-L20", "path:12-20"
    const CITE = /(?:\blines?\s+|\bL|:)(\d{1,6})(?:\s*(?:-|–|to)\s*L?(\d{1,6}))?/gi;

    // Re-indents brace languages by nesting depth (display only)
    const reindent = (lines, lang) => {
      if (lang !== 'java' && lang !== 'javascript' && lang !== 'css') {
        return lines.map((l) => l.replace(/\s+$/, ''));
      }
      let depth = 0;
      return lines.map((l) => {
        const t = l.trim();
        const bare = t.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*$/g, '');
        const lead = (bare.match(/^[}\])]+/) || [''])[0].length;
        const line = t ? '    '.repeat(Math.max(0, depth - lead)) + t : '';
        depth = Math.max(0, depth + (bare.match(/[{[(]/g) || []).length - (bare.match(/[}\])]/g) || []).length);
        return line;
      });
    };

    function KnowledgeViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(plain(error));
      this.workspace = ko.observable(null);
      this.index = ko.observable(null);
      this.inventory = ko.observable(null);
      this.files = ko.observableArray([]);
      this.fallback = ko.observable(false);
      const requirements = ko.observableArray([]);

      // The index: its revision, size and last import; the repository's latest revision only from a check on the Code page
      this.lastImport = ko.observable(null);
      this.headCheck = ko.observable(null);
      this.indexFacts = ko.pureComputed(() => {
        const s = this.index();
        if (!s || s.indexedRevision === null || s.indexedRevision === undefined) {
          return s ? 'Not imported yet' : '';
        }
        const last = this.lastImport();
        return 'Index at r' + s.indexedRevision + ' · ' + s.files.toLocaleString() + ' files · ' + s.chunks.toLocaleString() + ' searchable pieces'
          + (last && last.finishedAt ? ' · imported ' + ui.when(last.finishedAt) : '');
      });
      this.freshness = ko.pureComputed(() => {
        const s = this.index();
        const head = this.headCheck();
        if (!s || s.indexedRevision === null || s.indexedRevision === undefined) {
          return { pill: ui.status('NEW', 'Not imported'), text: 'Import the code on the Code page to explore it.' };
        }
        if (!head) {
          return { pill: ui.status('DRAFT', 'Freshness not checked'), text: 'The repository\'s latest revision is not known in this session. Check for new commits on the Code page.' };
        }
        if (!head.ok) {
          return { pill: ui.status('FAILED', 'Repository not reachable'), text: 'The last check (' + head.at + ') could not read the repository: ' + head.error };
        }
        const behind = Math.max(0, head.revision - s.indexedRevision);
        return behind ? { pill: ui.status('WARNING', behind + (behind === 1 ? ' revision' : ' revisions') + ' behind'), text: 'The repository is at r' + head.revision + ' (checked ' + head.at + '). Reindex on the Code page to explore the latest code.' }
          : { pill: ui.status('SUCCEEDED', 'Up to date'), text: 'The index matches the repository\'s latest revision, r' + head.revision + ' (checked ' + head.at + ').' };
      });
      this.openCodePage = () => navigate('code');
      this.tab = ko.observable('code');
      this.tabs = ui.tabs(this.tab, [
        { value: 'code', label: 'Code', icon: 'code' }, { value: 'search', label: 'Search', icon: 'search' },
        { value: 'apis', label: 'APIs', icon: 'link', count: ko.pureComputed(() => (this.inventory() ? this.inventory().endpoints.length : 0)) },
        { value: 'ui', label: 'Screens', icon: 'monitor', count: ko.pureComputed(() => (this.inventory() ? this.inventory().screens.length : 0)) },
        { value: 'dependencies', label: 'Service calls', icon: 'plug' }, { value: 'diagrams', label: 'Diagram', icon: 'share' },
        { value: 'logic', label: 'Business rules', icon: 'cube' }
      ]);
      // Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern); ids are prefix + value
      const tabKeys = (selected, list, prefix) => (event) => {
        const keys = list.map((t) => t.value);
        const at = keys.indexOf(selected());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        selected(keys[next]);
        const button = document.getElementById(prefix + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };
      this.tabKey = tabKeys(this.tab, this.tabs, 'kn-');

      // The project tree: folders open and close; files open in the viewer
      this.folder = ko.observable('');
      const open = ko.observable({});
      this.treeFilter = ko.observable('');
      this.treeFilterInput = ui.value(this.treeFilter);
      this.rootName = ko.pureComputed(() => (this.workspace() ? this.workspace().name : 'code'));
      this.rootUrl = ko.pureComputed(() => (this.workspace() && this.workspace().svnUrl ? this.workspace().svnUrl.replace(/^.*\/([^/]+\/[^/]+)$/, '…/$1') : ''));
      this.rootCss = ko.pureComputed(() => 'factory-kn-node factory-kn-root' + (this.folder() === '' ? ' factory-kn-node-on' : ''));
      this.pickRoot = () => this.folder('');
      this.collapseTree = () => { open({}); this.folder(''); };
      this.tree = ko.pureComputed(() => {
        const text = this.treeFilter().trim().toLowerCase();
        const paths = this.files().map((f) => f.path).filter((p) => !text || p.toLowerCase().indexOf(text) >= 0);
        const folders = {};
        paths.forEach((p) => {
          const parts = p.split('/');
          for (let i = 1; i < parts.length; i++) {
            folders[parts.slice(0, i).join('/')] = true;
          }
        });
        const rows = [];
        const children = (parent) => Object.keys(folders).filter((f) => f.lastIndexOf('/') === (parent ? parent.length : -1) && (!parent || f.indexOf(parent + '/') === 0)).sort();
        const walk = (parent, depth) => children(parent).forEach((f) => {
          const isOpen = text ? true : !!open()[f];
          rows.push({
            name: f.split('/').pop(), path: f, style: { paddingLeft: (depth * 16 + 20) + 'px' },
            caretCss: 'factory-nav-icon factory-ico-caret factory-kn-chev' + (isOpen ? '' : ' factory-kn-chev-closed'),
            folderCss: 'factory-nav-icon factory-kn-folder ' + (isOpen ? 'factory-ico-folder-fill' : 'factory-ico-folder'),
            css: 'factory-kn-node' + (this.folder() === f ? ' factory-kn-node-on' : ''),
            toggle: () => { const o = Object.assign({}, open()); o[f] = !o[f]; open(o); this.folder(f); }
          });
          if (isOpen && depth < 12) {
            walk(f, depth + 1);
          }
        });
        walk('', 0);
        return rows;
      });
      this.crumbs = ko.pureComputed(() => {
        const parts = this.folder() ? this.folder().split('/') : [];
        return [{ name: this.rootName(), pick: () => this.folder('') }]
          .concat(parts.map((p, i) => ({ name: p, pick: () => this.folder(parts.slice(0, i + 1).join('/')) })));
      });
      const indexRevision = ko.pureComputed(() => (this.index() ? this.index().indexedRevision : null));
      const iconFor = (path) => {
        const ext = (path.split('.').pop() || '').toLowerCase();
        const tone = ext === 'java' ? 'red' : /^(js|ts|jsx|tsx)$/.test(ext) ? 'amber' : /^(html|htm|xml)$/.test(ext) ? 'blue' : ext === 'sql' ? 'violet' : 'grey';
        return 'factory-kn-ficon factory-kn-ficon-' + tone;
      };
      this.checkedFiles = ko.observable({});
      this.folderFiles = ko.pureComputed(() => {
        const f = this.folder();
        return this.files().filter((x) => (f ? x.path.indexOf(f + '/') === 0 && x.path.slice(f.length + 1).indexOf('/') < 0 : x.path.indexOf('/') < 0)).map((x) => {
          const opened = this.file() && this.file().path === x.path;
          const known = x.sizeBytes ? size(x.sizeBytes) : (opened && !this.file().partial && this.file().sizeBytes ? size(this.file().sizeBytes) : '–');
          return {
            name: x.path.split('/').pop(), path: x.path, type: x.language, size: known, iconCss: iconFor(x.path),
            sizeTitle: known === '–' ? 'This factory\'s server does not list file sizes' : '',
            modified: x.revision ? 'r' + x.revision : (indexRevision() ? 'r' + indexRevision() + ' or earlier' : '–'),
            modifiedTitle: x.revision ? 'Last changed in revision ' + x.revision : 'The code was last imported at this revision',
            css: opened ? 'factory-clickable factory-row-sel' : 'factory-clickable', open: () => this.openFile(x.path),
            isChecked: !!this.checkedFiles()[x.path] || opened,
            check: (event) => { event.stopPropagation(); const m = Object.assign({}, this.checkedFiles()); m[x.path] = event.target.checked; this.checkedFiles(m); return true; }
          };
        });
      });
      this.allFilesChecked = ko.pureComputed(() => this.folderFiles().length > 0 && this.folderFiles().every((x) => this.checkedFiles()[x.path]));
      this.checkAllFiles = (event) => { const m = Object.assign({}, this.checkedFiles()); this.folderFiles().forEach((x) => { m[x.path] = event.target.checked; }); this.checkedFiles(m); return true; };

      // The open file
      this.file = ko.observable(null);
      this.loadingFile = ko.observable(false);
      this.langChoice = ko.observable('auto');
      this.langChange = ui.value(this.langChoice);
      this.formatted = ko.observable(false);
      this.toggleFormat = () => this.formatted(!this.formatted());
      this.formatCss = ko.pureComputed(() => 'fx-btn fx-btn--tertiary fx-btn--sm factory-kn4-tool' + (this.formatted() ? ' is-on' : ''));
      this.lang = ko.pureComputed(() => (this.langChoice() !== 'auto' ? this.langChoice() : (this.file() ? langOf(this.file().path, this.file().language) : 'plain')));
      // Source lines with their real numbers; marker lines separate the pieces of a file shown from the index
      const sourceLines = ko.pureComputed(() => {
        const f = this.file();
        if (!f) {
          return [];
        }
        return f.pieceLines || f.content.split('\n').map((t, i) => ({ n: i + 1, text: t, marker: false }));
      });
      this.tooLong = ko.pureComputed(() => sourceLines().length > MAX_LINES);
      // Lines picked from an AI citation: {from, to}, marked in the viewer
      this.focus = ko.observable(null);
      this.lines = ko.pureComputed(() => {
        const src = sourceLines().slice(0, MAX_LINES);
        const lang = this.lang();
        const texts = this.formatted() ? reindent(src.map((l) => (l.marker ? '' : l.text)), lang) : src.map((l) => l.text);
        const state = syntax.start();
        const focus = this.focus();
        return src.map((l, i) => (l.marker
          ? { n: '', id: null, tokens: [{ text: l.text, css: 'factory-kn-marker' }], css: 'factory-kn-line factory-kn-markerline' }
          : { n: l.n, id: 'kn-line-' + l.n, tokens: tokenize(texts[i], lang, state), css: 'factory-kn-line' + (focus && l.n >= focus.from && l.n <= focus.to ? ' is-hit' : '') }));
      });

      // What the file depends on, what mentions it, its APIs and comments
      this.imports = ko.pureComputed(() => {
        const f = this.file();
        if (!f) {
          return [];
        }
        const found = [];
        const add = (name) => { if (name && found.indexOf(name) < 0) { found.push(name); } };
        (f.content.match(/^\s*import\s+(?:static\s+)?[\w.*]+\s*;/gm) || []).forEach((m) => add(m.replace(/^\s*import\s+(?:static\s+)?|\s*;$/g, '')));
        (f.content.match(/(?:define|require)\(\s*\[([^\]]*)\]/g) || []).forEach((m) => (m.match(/['"][^'"]+['"]/g) || []).forEach((s) => add(s.slice(1, -1))));
        (f.content.match(/\bfrom\s+['"][^'"]+['"]|require\(\s*['"][^'"]+['"]\s*\)/g) || []).forEach((m) => add((m.match(/['"]([^'"]+)['"]/) || [])[1]));
        return found.map((name) => {
          const tail = name.indexOf('.') >= 0 && !/[/]/.test(name) ? name.split('.').pop() + '.java' : name.split('!').pop().split('/').pop();
          const match = tail && tail !== '*.java' ? this.files().find((x) => x.path.split('/').pop() === tail || x.path.split('/').pop() === tail + '.js') : null;
          return { name: name, path: match ? match.path : '', open: () => { if (match) { this.openFile(match.path); } } };
        });
      });
      this.usedBy = ko.observable(null);
      const loadUsedBy = () => {
        const f = this.file();
        if (!f || this.usedBy() !== null) {
          return;
        }
        const base = f.path.split('/').pop().replace(/\.\w+$/, '');
        api.get('workspaces/' + this.workspaceId() + '/search?q=' + encodeURIComponent(base) + '&limit=30').then((res) => {
          const seen = {};
          this.usedBy(res.results.filter((r) => r.path !== f.path && (r.snippet || '').toLowerCase().indexOf(base.toLowerCase()) >= 0 && !seen[r.path] && (seen[r.path] = true))
            .map((r) => ({ path: r.path, lines: 'lines ' + r.startLine + '-' + r.endLine, open: () => this.openFile(r.path) })));
        }).catch(() => this.usedBy([]));
      };
      this.relatedApis = ko.pureComputed(() => {
        const f = this.file();
        const inv = this.inventory();
        if (!f || !inv) {
          return [];
        }
        const served = inv.endpoints.filter((e) => e.file === f.path || f.path.endsWith(e.file)).map((e) => ({ method: e.method, path: e.path, note: 'Served here: ' + e.javaMethod }));
        const screenIds = inv.screens.filter((s) => s.files.indexOf(f.path) >= 0).map((s) => s.id);
        const called = inv.calls.filter((c) => c.screens.some((s) => screenIds.indexOf(s) >= 0)).map((c) => ({ method: c.method, path: c.path, note: c.endpoint ? 'Called; served by ' + c.endpoint : 'Called; an OBDX product service' }));
        return served.concat(called).map((a) => Object.assign(a, { methodCss: 'factory-kn-method factory-kn-method-' + a.method.toLowerCase() }));
      });
      this.comments = ko.pureComputed(() => {
        const list = [];
        this.lines().forEach((l) => {
          const text = l.tokens.filter((t) => t.css === 'fx-syn-com').map((t) => t.text).join(' ').replace(/^\s*(\/\*\*?|\/\/|<!--|\*|--)\s*|\s*(\*\/|-->)\s*$/g, '').trim();
          if (text && l.n !== '' && !/^\*+$/.test(text)) {
            list.push({ n: l.n, text: text });
          }
        });
        return list;
      });
      this.codeTab = ko.observable('code');
      this.codeTabs = ui.tabs(this.codeTab, [
        { value: 'code', label: 'Code' }, { value: 'deps', label: 'Dependencies', count: ko.pureComputed(() => this.imports().length) },
        { value: 'usedby', label: 'Mentioned in', count: ko.pureComputed(() => (this.usedBy() ? this.usedBy().length : 0)) },
        { value: 'apis', label: 'Related APIs', count: ko.pureComputed(() => this.relatedApis().length) },
        { value: 'comments', label: 'Comments', count: ko.pureComputed(() => this.comments().length) }
      ]);
      this.codeTab.subscribe((v) => { if (v === 'usedby') { loadUsedBy(); } });
      this.codeTabKey = tabKeys(this.codeTab, this.codeTabs, 'knc-');
      this.showDeps = () => this.codeTab('deps');
      this.showUsedBy = () => this.codeTab('usedby');
      this.showApis = () => this.codeTab('apis');

      this.fileInfo = ko.pureComputed(() => {
        const f = this.file();
        if (!f) {
          return null;
        }
        const lang = langOf(f.path, f.language);
        const kind = lang === 'java' ? (/\binterface\s/.test(f.content) ? 'Java Interface' : 'Java Class') : lang === 'javascript' ? 'JavaScript' : lang === 'html' ? 'HTML View' : lang === 'sql' ? 'SQL Script' : f.language;
        const related = requirements().filter((r) => r.spec && r.spec.screens.some((s) => (s.relatedCode || []).some((p) => p === f.path)));
        const tags = [f.path.split('/')[0]].concat(/controller/i.test(f.path) ? ['Controller'] : []).concat(/service/i.test(f.path) ? ['Service'] : [])
          .concat(/resource/i.test(f.path) && lang === 'java' ? ['REST'] : []).concat([f.language]).concat(/\/(ofss|oracle)\//i.test(f.path) ? ['OBDX product'] : ['Bank code']).filter(Boolean);
        return {
          name: f.path.split('/').pop(), folder: f.path.split('/').slice(0, -1).join('/'), type: kind, size: f.partial ? 'Not listed by this server' : size(f.sizeBytes || f.content.length),
          lines: f.partial ? 'Not known (indexed pieces only)' : f.lines + (f.truncated ? ' (shown up to 512 KB)' : ''),
          revision: f.revision ? 'r' + f.revision : (indexRevision() ? 'r' + indexRevision() + ' or earlier' : '–'),
          indexed: indexRevision() ? 'r' + indexRevision() : 'Not imported',
          endpoints: this.relatedApis().filter((a) => a.note.indexOf('Served') === 0).map((a) => ({ method: a.method, path: a.path, code: a.note.replace('Served here: ', ''), methodCss: a.methodCss })),
          related: related.map((r) => ({ code: 'REQ-' + r.id.replace(/-/g, '').slice(0, 4).toUpperCase(), title: r.title })),
          tags: tags.map((t) => ({ text: t, css: 'fx-chip factory-kn4-tag' })),
          iconCss: iconFor(f.path) + ' factory-kn-ficon-lg', truncated: f.truncated
        };
      });
      this.openFile = (path) => {
        this.loadingFile(true);
        this.usedBy(null);
        this.focus(null);
        this.codeTab('code');
        const id = this.workspaceId();
        api.get('workspaces/' + id + '/files/content?path=' + encodeURIComponent(path))
          .then((f) => this.file(f))
          .catch((error) => {
            if (error.status !== 404 || !this.fallback()) {
              throw error;
            }
            // Older server: show the file's indexed pieces from code search, each under a marker line saying what it is.
            // A class piece is an outline, so its lines only get numbers when they match the file's lines one to one.
            return api.get('workspaces/' + id + '/search?q=' + encodeURIComponent(path.split('/').pop()) + '&limit=20').then((res) => {
              const pieces = res.results.filter((r) => r.path === path)
                .sort((a, b) => a.startLine - b.startLine || (b.endLine - b.startLine) - (a.endLine - a.startLine));
              const pieceLines = [];
              const shown = [];
              pieces.forEach((r) => {
                if (shown.some((s) => s.indexOf(r.snippet.trim()) >= 0)) {
                  return;
                }
                shown.push(r.snippet);
                const rows = r.snippet.split('\n');
                const exact = rows.length === r.endLine - r.startLine + 1;
                // Pieces can overlap (a method inside its class), so their lines carry no numbers; the label says where each piece is
                pieceLines.push({ n: '', text: 'Indexed piece ' + shown.length + ': ' + r.kind + (r.kind === 'class' && !exact ? ' outline' : '') + ', lines ' + r.startLine + ' to ' + r.endLine + ' of the file', marker: true });
                rows.forEach((t) => pieceLines.push({ n: '', text: t, marker: false }));
              });
              this.file({ path: path, language: pieces.length ? pieces[0].language : '', sizeBytes: 0, revision: 0, truncated: false, partial: true,
                content: pieceLines.filter((l) => !l.marker).map((l) => l.text).join('\n') || '(no content in the index)',
                pieceLines: pieceLines.length ? pieceLines : null, lines: 0 });
            });
          })
          .catch(showError)
          .finally(() => this.loadingFile(false));
        const parts = path.split('/');
        const o = Object.assign({}, open());
        for (let i = 1; i < parts.length; i++) {
          o[parts.slice(0, i).join('/')] = true;
        }
        open(o);
        this.folder(parts.slice(0, -1).join('/'));
      };
      // The Code page's viewer, at the given lines (or the cited ones, or the top)
      const openInCode = (path, from, to) => {
        pageRequests.codeFile({ path: path, startLine: from || 1, endLine: to || from || 1 });
        navigate('code');
      };
      this.openInCode = () => {
        const f = this.file();
        if (f) {
          const focus = this.focus();
          openInCode(f.path, focus ? focus.from : 1, focus ? focus.to : 1);
        }
      };
      this.searchUsages = () => { if (this.file()) { this.query(this.file().path.split('/').pop().replace(/\.\w+$/, '')); this.tab('search'); this.search(); } };

      // File Details menu
      // (the design system's menu: keyboard, Escape and outside clicks from ui.menu)
      this.fileMenu = ui.menu();
      this.copyNote = ko.observable('');
      this.copyPath = () => {
        this.fileMenu.close();
        const text = this.file() ? this.file().path : '';
        ui.copy(text).then(() => toast.success('Path copied.'))
          .catch(() => toast.error('The path could not be copied. Select it in File Details and copy it by hand.'));
      };
      this.menuSearch = () => { this.fileMenu.close(); this.searchUsages(); };
      this.menuExplain = () => { this.fileMenu.close(); this.explain(); };
      this.menuOpenInCode = () => { this.fileMenu.close(); this.openInCode(); };

      // Search
      this.query = ko.observable('');
      this.results = ko.observableArray([]);
      this.searchNote = ko.observable('');
      this.searching = ko.observable(false);
      this.search = () => {
        if (!this.query().trim()) {
          return;
        }
        this.searching(true);
        this.searchError('');
        api.get('workspaces/' + this.workspaceId() + '/search?q=' + encodeURIComponent(this.query()))
          .then((res) => {
            this.results(res.results.map((r) => Object.assign({}, r, {
              where: ' lines ' + r.startLine + '-' + r.endLine + ' · ' + r.kind + (r.symbol ? ' ' + r.symbol : '') + ' · ' + r.matchedBy,
              open: () => { this.tab('code'); this.openFile(r.path); }, openInCode: () => openInCode(r.path, r.startLine, r.endLine)
            })));
            this.searchNote(res.results.length ? (res.semanticNote || '') : 'No matches in the indexed code.');
          })
          .catch((error) => { this.results([]); this.searchNote(''); this.searchError(plain(error)); })
          .finally(() => this.searching(false));
      };
      this.searchError = ko.observable('');
      // File names that contain the words, from the index's file list (no request)
      this.fileMatches = ko.pureComputed(() => {
        const words = this.searchedFor().toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) {
          return [];
        }
        return this.files().filter((x) => words.every((w) => x.path.toLowerCase().indexOf(w) >= 0)).slice(0, 50)
          .map((x) => ({ path: x.path, language: x.language, open: () => { this.tab('code'); this.openFile(x.path); }, openInCode: () => openInCode(x.path, 1, 1) }));
      });
      this.searchedFor = ko.observable('');
      const runSearch = this.search;
      this.search = () => { this.searchedFor(this.query().trim()); runSearch(); };
      // Search options, the same as on the Code page: kinds of result and the top-level folder, applied to the results here
      this.inContent = ko.observable(true);
      this.inNames = ko.observable(true);
      this.inComments = ko.observable(false);
      this.inContentChange = ui.checked(this.inContent);
      this.inNamesChange = ui.checked(this.inNames);
      this.inCommentsChange = ui.checked(this.inComments);
      this.module = ko.observable('');
      this.moduleChange = ui.value(this.module);
      const topFolder = (path) => (path.indexOf('/') > 0 ? path.split('/')[0] : '');
      this.modules = ko.pureComputed(() => Array.from(new Set(this.files().map((f) => topFolder(f.path))
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

      // Inventory views
      this.endpoints = ko.pureComputed(() => (this.inventory() ? this.inventory().endpoints : []).map((e) => ({
        method: e.method, path: e.path, code: e.javaClass + '.' + e.javaMethod, file: e.file, owner: e.product ? 'Oracle product' : 'Bank',
        usedBy: e.usedBy.map((s) => s.split('/').pop()).join(', ') || '–', open: () => { this.tab('code'); this.openFile(e.file); }
      })));
      this.screens = ko.pureComputed(() => (this.inventory() ? this.inventory().screens : []).map((s) => ({
        name: s.name, module: s.module, kind: s.kind, files: s.files, fields: s.fields.length, open: () => { this.tab('code'); if (s.files[0]) { this.openFile(s.files[0]); } }
      })));
      this.calls = ko.pureComputed(() => (this.inventory() ? this.inventory().calls : []).map((c) => ({
        method: c.method, path: c.path, endpoint: c.endpoint || 'Not in this code (OBDX product service)', screens: c.screens.map((s) => s.split('/').pop()).join(', ')
      })));
      this.inventoryMissing = ko.pureComputed(() => !this.inventory());
      this.openModernization = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'modernization' }));
      this.openRequirements = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'requirements' }));

      // Diagram: screens, the services they call and what serves them
      this.diagram = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return [];
        }
        const names = {};
        inv.screens.forEach((s) => { names[s.id] = s.name; });
        const rows = [];
        inv.calls.forEach((c) => c.screens.forEach((s) => rows.push({
          screen: names[s] || s.split('/').pop(), call: c.method + ' ' + c.path, target: c.endpoint || 'OBDX product service',
          targetCss: c.endpoint ? 'factory-kn-box factory-kn-box-green' : 'factory-kn-box factory-kn-box-grey'
        })));
        return rows;
      });

      // Business logic: the requirements' business rules and the code their screens link
      this.onlyOpenFile = ko.observable(false);
      this.onlyOpenFileInput = ui.checked(this.onlyOpenFile);
      this.rules = ko.pureComputed(() => {
        const list = [];
        const f = this.file();
        requirements().forEach((r) => {
          const spec = r.spec;
          if (!spec || !spec.businessRules) {
            return;
          }
          spec.businessRules.forEach((rule) => {
            const files = [];
            (spec.screens || []).filter((s) => (rule.screens || []).indexOf(s.name) >= 0 || !(rule.screens || []).length)
              .forEach((s) => (s.relatedCode || []).forEach((p) => { if (files.indexOf(p) < 0) { files.push(p); } }));
            if (this.onlyOpenFile() && (!f || files.indexOf(f.path) < 0)) {
              return;
            }
            list.push({
              id: rule.id, description: rule.description, requirement: r.title, screens: (rule.screens || []).join(', ') || 'All screens',
              files: files.map((p) => ({ name: p.split('/').pop(), path: p, open: () => { this.tab('code'); this.openFile(p); } }))
            });
          });
        });
        return list;
      });

      // AI Code Insights: one answer per kind, from the open file
      const INSIGHT_PROMPTS = {
        summary: 'Summarize this file in one short paragraph: what it does, what it uses and what it returns.',
        explain: 'Explain the business logic of this file step by step, in plain words.',
        usage: 'Where and how is this file used? Use the list of files that mention it when it is given.',
        suggest: 'Suggest improvements, risks and good places to change this file, briefly.'
      };
      // Every insight asks for line citations from the numbered file it is given
      const CITE_ASK = ' Base it on the file\'s code below, and cite the lines you rely on as "lines N-M" (the numbers before each line).';
      this.ai = assistant.create(() => {
        const f = this.file();
        const w = this.workspace();
        const users = this.usedBy() && this.usedBy().length ? '\nFiles that mention it: ' + this.usedBy().map((u) => u.path).join(', ') : '';
        const where = w ? 'Workspace: ' + w.name + ' (' + w.bankName + ', OBDX ' + w.obdxVersion + ')\n' : '';
        if (!f) {
          return '';
        }
        // The file with its line numbers (the indexed pieces of an older server have none)
        let numbered = '';
        const rows = sourceLines();
        for (let i = 0; i < rows.length && numbered.length < AI_CHARS; i++) {
          numbered += (rows[i].n ? rows[i].n + '| ' : '') + rows[i].text + '\n';
        }
        return where + 'File ' + f.path + ' (' + f.language + ', ' + (f.lines || 'some') + ' lines):\n' + numbered.slice(0, AI_CHARS) + users;
      }, []);
      // The chips above AI Code Insights: exactly what the context above sends (nothing is sent without an open file)
      this.aiContext = ko.pureComputed(() => {
        const f = this.file();
        const w = this.workspace();
        if (!f) {
          return [];
        }
        const chips = [];
        if (w) {
          chips.push({ label: w.name + ' · OBDX ' + w.obdxVersion, title: 'Workspace ' + w.name + ' (' + w.bankName + ', OBDX ' + w.obdxVersion + ')' });
        }
        chips.push({ label: f.path.split('/').pop(), title: f.path + (f.content.length > AI_CHARS ? ' (the first 15,000 characters, with line numbers)' : ' (with line numbers)') + (f.partial ? ' (indexed pieces only)' : '') });
        if (this.usedBy() && this.usedBy().length) {
          chips.push({ label: this.usedBy().length + ' file' + (this.usedBy().length === 1 ? '' : 's') + ' that mention it', title: this.usedBy().map((u) => u.path).join(', ') });
        }
        return chips;
      });
      this.insightTab = ko.observable('summary');
      this.insightTabs = ui.tabs(this.insightTab, [
        { value: 'summary', label: 'Summary' }, { value: 'explain', label: 'Explain' }, { value: 'usage', label: 'Find Usage' }, { value: 'suggest', label: 'Suggest Changes' }
      ]);
      this.insightKey = tabKeys(this.insightTab, this.insightTabs, 'kni-');
      const replies = ko.observable({});
      let pending = null;
      this.ai.messages.subscribe((list) => {
        const last = list[list.length - 1];
        if (pending && last && !last.mine) {
          const m = Object.assign({}, replies());
          const f = this.file();
          // failed: the factory's own message (a refusal such as the privacy policy, or a failure), shown as a notice, not an answer.
          // lineCount: the file's lines when known (cited lines past it are flagged); 0 for indexed pieces and for a file
          // shown only in part (its first 512 KB), whose lines are never flagged or clipped
          m[pending] = { text: last.text, meta: last.meta, sources: last.sources || ko.observable([]), path: f ? f.path : '', failed: !!last.failed,
            lineCount: f && !f.partial && !f.truncated ? (f.lines || f.content.split('\n').length) : 0,
            css: ko.unwrap(last.css).indexOf('error') >= 0 ? 'factory-kn-insight factory-kn-insight-bad' : 'factory-kn-insight' };
          replies(m);
          pending = null;
        }
      });
      this.insight = ko.pureComputed(() => replies()[this.insightTab()] || null);
      // The lines the answer cites (they open in the viewer), and the manuals it used, each named
      this.citations = ko.pureComputed(() => {
        const i = this.insight();
        if (!i || i.failed) {
          return [];
        }
        const text = String(ko.unwrap(i.text) || '').replace(/\[\d+\]/g, '');
        const seen = {};
        const list = [];
        let m;
        CITE.lastIndex = 0;
        while ((m = CITE.exec(text)) !== null && list.length < 20) {
          const from = Number(m[1]);
          const to = Math.max(from, Number(m[2] || m[1]));
          const key = from + '-' + to;
          if (from > 0 && !seen[key]) {
            seen[key] = true;
            // Lines past the end of the file are not in it: flagged, with nothing to open; a range running past it ends there
            const outside = i.lineCount > 0 && from > i.lineCount;
            const end = i.lineCount > 0 ? Math.min(to, i.lineCount) : to;
            list.push({ from: from, to: end, outside: outside,
              label: i.path.split('/').pop() + ' ' + (from === to ? 'line ' + from : 'lines ' + from + '-' + to),
              note: outside ? 'The file has ' + i.lineCount + ' line' + (i.lineCount === 1 ? '' : 's') + ': check this part of the answer.'
                : end < to ? 'The file ends at line ' + i.lineCount + '.' : '',
              show: () => this.showLines(i.path, from, end), open: () => openInCode(i.path, from, end) });
          }
        }
        return list.sort((x, y) => x.from - y.from);
      });
      this.manualSources = ko.pureComputed(() => {
        const i = this.insight();
        return i && !i.failed ? (ko.unwrap(i.sources) || []).map((src) => ({
          // A note first: the bank's own notes are bank too (kind NOTE, as the OBDX Library labels them)
          n: '[' + src.n + ']', kind: /^note$/i.test(src.kind || '') || src.noteId ? 'Note' : src.bank ? 'Bank document' : 'Oracle manual',
          title: src.title + (src.heading ? ': ' + src.heading : ''),
          where: (src.obdxVersion ? 'OBDX ' + src.obdxVersion : '') + (src.pageFrom ? ', pages ' + src.pageFrom + (src.pageTo && src.pageTo !== src.pageFrom ? '-' + src.pageTo : '') : '')
        })) : [];
      });
      // Shows cited lines in the viewer (the file must still be the one open)
      this.showLines = (path, from, to) => {
        if (!this.file() || this.file().path !== path) {
          toast.info('Open ' + path.split('/').pop() + ' again to see these lines.');
          return;
        }
        this.tab('code');
        this.codeTab('code');
        this.focus({ from: from, to: to });
        window.setTimeout(() => {
          const box = document.getElementById('fileCode');
          const line = document.getElementById('kn-line-' + from);
          if (box && line) {
            box.scrollTop = Math.max(0, line.offsetTop - box.offsetTop - 40);
          }
        }, 50);
      };
      this.insightHint = ko.pureComputed(() => (this.file() ? 'Press Generate to have the AI ' + { summary: 'summarize', explain: 'explain', usage: 'find the usage of', suggest: 'suggest changes to' }[this.insightTab()] + ' this file.' : 'Open a file first.'));
      this.generate = () => {
        if (!this.file() || this.ai.busy()) {
          return;
        }
        pending = this.insightTab();
        if (pending === 'usage') {
          loadUsedBy();
        }
        this.ai.ask(INSIGHT_PROMPTS[pending] + CITE_ASK);
      };
      this.explain = () => { this.insightTab('explain'); this.generate(); };
      this.explainLogic = () => { this.insightTab('explain'); this.generate(); };
      // The Generate split button: its arrow picks what to generate
      this.genMenu = ui.menu();
      this.genOptions = [{ value: 'summary', label: 'Summary' }, { value: 'explain', label: 'Explain' }, { value: 'usage', label: 'Find usage' }, { value: 'suggest', label: 'Suggest changes' }]
        .map((o) => Object.assign(o, { run: () => { this.genMenu.close(); this.insightTab(o.value); this.generate(); } }));
      this.relatedReqs = ko.pureComputed(() => (this.fileInfo() ? this.fileInfo().related : []).map((r) => Object.assign({}, r, { open: this.openRequirements })));

      // Opens the first Java file (or the first file) with its folders
      const openFirst = (list) => {
        const first = list.find((f) => /\.java$/.test(f.path)) || list[0];
        if (first) {
          const parts = first.path.split('/');
          const o = {};
          for (let i = 1; i < parts.length; i++) {
            o[parts.slice(0, i).join('/')] = true;
          }
          open(o);
          this.openFile(first.path);
        }
      };
      const load = (id) => {
        this.files([]);
        this.file(null);
        this.folder('');
        this.inventory(null);
        this.index(null);
        this.lastImport(null);
        this.errorMessage('');
        replies({});
        this.headCheck(id ? workspaceSelection.headChecks[id] || null : null);
        if (!id) {
          return;
        }
        api.get('workspaces/' + id).then((w) => this.workspace(w)).catch(() => null);
        api.get('workspaces/' + id + '/index').then((s) => this.index(s)).catch(() => null);
        api.get('workspaces/' + id + '/imports').then((jobs) => this.lastImport((jobs || []).filter((j) => j.status === 'SUCCEEDED')
          .sort((x, y) => new Date(y.finishedAt) - new Date(x.finishedAt))[0] || null)).catch(() => null);
        api.get('workspaces/' + id + '/inventory').then((inv) => this.inventory(inv || null)).catch(() => null);
        api.get('workspaces/' + id + '/requirements').then((list) => Promise.all(list.map((r) => api.get('requirements/' + r.id).catch(() => null))))
          .then((list) => requirements(list.filter(Boolean))).catch(() => null);
        api.get('workspaces/' + id + '/files?limit=20000').then((list) => {
          this.fallback(false);
          this.files(list);
          openFirst(list);
        }).catch((error) => {
          if (error.status !== 404) {
            showError(error);
            return;
          }
          // Older server without /files: the files code search finds for common words
          this.fallback(true);
          Promise.all(['class', 'function', 'define', 'select'].map((q) => api.get('workspaces/' + id + '/search?q=' + q + '&limit=50').catch(() => ({ results: [] }))))
            .then((all) => {
              const seen = {};
              const list = [];
              all.forEach((res) => res.results.forEach((r) => { if (!seen[r.path]) { seen[r.path] = true; list.push({ path: r.path, language: r.language, sizeBytes: 0 }); } }));
              this.files(list.sort((a, b) => a.path.localeCompare(b.path)));
              openFirst(this.files());
            });
        });
      };

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Knowledge Explorer page loaded.');
        document.title = 'Knowledge Explorer';
        subscription = this.workspaceId.subscribe(load);
        const before = this.workspaceId();
        workspaceSelection.load().then(() => { if (this.workspaceId() === before) { load(before); } }).catch(showError);
        const requested = pageRequests.codeSearch();
        if (requested) {
          pageRequests.codeSearch('');
          this.query(requested);
          this.tab('search');
          window.setTimeout(this.search, 500);
        }
      };
      this.disconnected = () => {
        if (subscription) {
          subscription.dispose();
        }
        this.fileMenu.close();
        this.genMenu.close();
      };
    }

    return KnowledgeViewModel;
  }
);
