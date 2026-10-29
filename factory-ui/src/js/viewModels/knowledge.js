/*
 * Knowledge Explorer page: browse the workspace's indexed code as a tree, read a file with simple syntax colouring and
 * its details (size, lines, revision, what it imports, what mentions it, the endpoints it serves, comments,
 * requirements that link it), the API and screen inventory from the modernization scan, the business rules of the
 * requirements and the code they link, a dependency diagram, code search, and AI insights on the open file.
 * Files and content come from /files (a server without it falls back to code search hits).
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/assistant',
        '../services/pageRequests', '../services/toast', 'ojs/ojknockout', 'ojs/ojbutton', 'ojs/ojinputtext'],
  function (ko, accUtils, api, workspaceSelection, ui, assistant, pageRequests, toast) {
    const size = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B');
    const MAX_LINES = 3000;

    // Simple client-side syntax colouring: keywords, strings, annotations, numbers, comments, tags
    const KEYWORDS = {
      java: 'abstract assert boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new package private protected public return short static super switch synchronized this throw throws transient try void volatile while var record true false null',
      javascript: 'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return super switch this throw try typeof var void while yield true false null undefined define require',
      sql: 'select from where insert into update delete create replace table view index alter drop and or not null primary key foreign references values set join left right inner outer on group by order having as begin end procedure function trigger grant varchar varchar2 number integer date commit constraint default unique sequence'
    };
    const KW = {};
    Object.keys(KEYWORDS).forEach((k) => { KW[k] = {}; KEYWORDS[k].split(' ').forEach((w) => { KW[k][w] = true; }); });
    const C_RULES = [[/^\/\/.*/, 'com'], [/^"(?:\\.|[^"\\])*"?/, 'str'], [/^'(?:\\.|[^'\\])*'?/, 'str'], [/^`[^`]*`?/, 'str'], [/^@[A-Za-z_]\w*/, 'ann'], [/^\d[\d._]*[lLfFdD]?\b/, 'num'], [/^[A-Za-z_$][\w$]*/, 'word']];
    const RULES = {
      java: C_RULES, javascript: C_RULES, css: [[/^"[^"]*"?/, 'str'], [/^'[^']*'?/, 'str'], [/^#[\w-]+|^\.[\w-]+/, 'ann'], [/^\d[\d.]*\w*/, 'num']],
      html: [[/^\[\[[^\]]*\]\]/, 'ann'], [/^<\/?[\w:.-]+/, 'tag'], [/^\/?>/, 'tag'], [/^[\w:.-]+(?==)/, 'attr'], [/^"[^"]*"?/, 'str'], [/^'[^']*'?/, 'str']],
      sql: [[/^--.*/, 'com'], [/^'(?:''|[^'])*'?/, 'str'], [/^\d+(\.\d+)?/, 'num'], [/^[A-Za-z_][\w$#]*/, 'word']],
      plain: []
    };
    const BLOCK = { java: ['/*', '*/'], javascript: ['/*', '*/'], css: ['/*', '*/'], sql: ['/*', '*/'], html: ['<!--', '-->'] };
    const langOf = (path, language) => {
      const ext = (path.split('.').pop() || '').toLowerCase();
      if (ext === 'java' || language === 'java') {
        return 'java';
      }
      if (/^(js|jsx|ts|tsx|json|mjs)$/.test(ext) || language === 'javascript' || language === 'typescript') {
        return 'javascript';
      }
      if (/^(html|htm|xml|xhtml|jsp|vue)$/.test(ext) || language === 'html' || language === 'xml') {
        return 'html';
      }
      if (ext === 'sql' || language === 'sql') {
        return 'sql';
      }
      if (/^(css|scss|less)$/.test(ext)) {
        return 'css';
      }
      return 'plain';
    };
    const tokenize = (text, lang, state) => {
      const out = [];
      const push = (t, kind) => {
        if (!t) {
          return;
        }
        const last = out[out.length - 1];
        if (last && last.kind === kind) {
          last.text += t;
        } else {
          out.push({ text: t, kind: kind });
        }
      };
      const block = BLOCK[lang];
      const rules = RULES[lang] || [];
      let i = 0;
      while (i < text.length) {
        if (state.inBlock) {
          const end = text.indexOf(block[1], i);
          if (end < 0) {
            push(text.slice(i), 'com');
            break;
          }
          push(text.slice(i, end + block[1].length), 'com');
          i = end + block[1].length;
          state.inBlock = false;
          continue;
        }
        const rest = text.slice(i);
        if (block && rest.indexOf(block[0]) === 0) {
          state.inBlock = true;
          push(block[0], 'com');
          i += block[0].length;
          continue;
        }
        let matched = false;
        for (let r = 0; r < rules.length; r++) {
          const m = rules[r][0].exec(rest);
          if (m && m[0]) {
            let kind = rules[r][1];
            if (kind === 'word') {
              const words = KW[lang] || {};
              kind = words[lang === 'sql' ? m[0].toLowerCase() : m[0]] ? 'kw' : (lang === 'java' && /^[A-Z]/.test(m[0]) ? 'type' : '');
            }
            push(m[0], kind);
            i += m[0].length;
            matched = true;
            break;
          }
        }
        if (!matched) {
          push(text.charAt(i), '');
          i += 1;
        }
      }
      return out.map((t) => ({ text: t.text, css: t.kind ? 'factory-kn-' + t.kind : '' }));
    };
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
      const showError = (error) => this.errorMessage(error.message);
      this.workspace = ko.observable(null);
      this.index = ko.observable(null);
      this.inventory = ko.observable(null);
      this.files = ko.observableArray([]);
      this.fallback = ko.observable(false);
      const requirements = ko.observableArray([]);

      this.kpis = ko.pureComputed(() => {
        const s = this.index();
        const inv = this.inventory() ? this.inventory().summary : null;
        const langs = s ? s.filesByLanguage : {};
        return [
          { label: 'Total Files', value: s ? s.files.toLocaleString() : '–', sub: s ? s.chunks.toLocaleString() + ' searchable pieces' : '', tone: 'blue', icon: 'doc' },
          { label: 'Modules', value: inv ? inv.modules : '–', sub: 'UI modules in the scan', tone: 'green', icon: 'cube' },
          { label: 'API Endpoints', value: inv ? inv.endpoints : '–', sub: 'REST services in this code', tone: 'violet', icon: 'link' },
          { label: 'UI Components', value: inv ? inv.screens : '–', sub: 'Screens and components', tone: 'blue', icon: 'monitor' },
          { label: 'Database Objects', value: langs.sql || 0, sub: 'SQL files', tone: 'amber', icon: 'cube' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });
      this.tab = ko.observable('code');
      this.tabs = ui.tabs(this.tab, [
        { value: 'code', label: 'Code Explorer', icon: 'code' }, { value: 'apis', label: 'API Explorer', icon: 'link' },
        { value: 'ui', label: 'UI Components', icon: 'monitor' }, { value: 'logic', label: 'Business Logic', icon: 'cube' },
        { value: 'search', label: 'Search Result', icon: 'search' }, { value: 'dependencies', label: 'Dependencies', icon: 'plug' },
        { value: 'diagrams', label: 'Diagrams', icon: 'share' }
      ]);

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
      this.lines = ko.pureComputed(() => {
        const src = sourceLines().slice(0, MAX_LINES);
        const lang = this.lang();
        const texts = this.formatted() ? reindent(src.map((l) => (l.marker ? '' : l.text)), lang) : src.map((l) => l.text);
        const state = { inBlock: false };
        return src.map((l, i) => (l.marker
          ? { n: '', tokens: [{ text: l.text, css: 'factory-kn-marker' }], css: 'factory-kn-line factory-kn-markerline' }
          : { n: l.n, tokens: tokenize(texts[i], lang, state), css: 'factory-kn-line' }));
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
          const text = l.tokens.filter((t) => t.css === 'factory-kn-com').map((t) => t.text).join(' ').replace(/^\s*(\/\*\*?|\/\/|<!--|\*|--)\s*|\s*(\*\/|-->)\s*$/g, '').trim();
          if (text && l.n !== '' && !/^\*+$/.test(text)) {
            list.push({ n: l.n, text: text });
          }
        });
        return list;
      });
      this.codeTab = ko.observable('code');
      this.codeTabs = ui.tabs(this.codeTab, [
        { value: 'code', label: 'Code' }, { value: 'deps', label: 'Dependencies', count: ko.pureComputed(() => this.imports().length) },
        { value: 'usedby', label: 'Used By', count: ko.pureComputed(() => (this.usedBy() ? this.usedBy().length : 0)) },
        { value: 'apis', label: 'Related APIs', count: ko.pureComputed(() => this.relatedApis().length) },
        { value: 'comments', label: 'Comments', count: ko.pureComputed(() => this.comments().length) }
      ]);
      this.codeTab.subscribe((v) => { if (v === 'usedby') { loadUsedBy(); } });
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
          endpoints: this.relatedApis().filter((a) => a.note.indexOf('Served') === 0).map((a) => ({ method: a.method, path: a.path, code: a.note.replace('Served here: ', ''), methodCss: a.methodCss })),
          related: related.map((r) => ({ code: 'REQ-' + r.id.replace(/-/g, '').slice(0, 4).toUpperCase(), title: r.title })),
          tags: tags.map((t) => ({ text: t, css: 'fx-chip factory-kn4-tag' })),
          iconCss: iconFor(f.path) + ' factory-kn-ficon-lg', truncated: f.truncated
        };
      });
      this.openFile = (path) => {
        this.loadingFile(true);
        this.usedBy(null);
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
        api.get('workspaces/' + this.workspaceId() + '/search?q=' + encodeURIComponent(this.query()))
          .then((res) => { this.results(res.results.map((r) => Object.assign({}, r, { open: () => { this.tab('code'); this.openFile(r.path); } }))); this.searchNote(res.results.length ? (res.semanticNote || '') : 'No matches.'); })
          .catch(showError).finally(() => this.searching(false));
      };

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
      this.ai = assistant.create(() => {
        const f = this.file();
        const users = this.usedBy() && this.usedBy().length ? '\nFiles that mention it: ' + this.usedBy().map((u) => u.path).join(', ') : '';
        return f ? 'File ' + f.path + ' (' + f.language + ', ' + (f.lines || 'some') + ' lines):\n' + f.content.slice(0, 15000) + users : '';
      }, []);
      this.insightTab = ko.observable('summary');
      this.insightTabs = ui.tabs(this.insightTab, [
        { value: 'summary', label: 'Summary' }, { value: 'explain', label: 'Explain' }, { value: 'usage', label: 'Find Usage' }, { value: 'suggest', label: 'Suggest Changes' }
      ]);
      const replies = ko.observable({});
      let pending = null;
      this.ai.messages.subscribe((list) => {
        const last = list[list.length - 1];
        if (pending && last && !last.mine) {
          const m = Object.assign({}, replies());
          m[pending] = { text: last.text, meta: last.meta, css: last.css.indexOf('error') >= 0 ? 'factory-kn-insight factory-kn-insight-bad' : 'factory-kn-insight' };
          replies(m);
          pending = null;
        }
      });
      this.insight = ko.pureComputed(() => replies()[this.insightTab()] || null);
      this.insightHint = ko.pureComputed(() => (this.file() ? 'Press Generate to have the AI ' + { summary: 'summarize', explain: 'explain', usage: 'find the usage of', suggest: 'suggest changes to' }[this.insightTab()] + ' this file.' : 'Open a file first.'));
      this.generate = () => {
        if (!this.file() || this.ai.busy()) {
          return;
        }
        pending = this.insightTab();
        if (pending === 'usage') {
          loadUsedBy();
        }
        this.ai.ask(INSIGHT_PROMPTS[pending]);
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
        this.errorMessage('');
        replies({});
        if (!id) {
          return;
        }
        api.get('workspaces/' + id).then((w) => this.workspace(w)).catch(() => null);
        api.get('workspaces/' + id + '/index').then((s) => this.index(s)).catch(() => null);
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
