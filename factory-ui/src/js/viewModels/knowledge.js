/*
 * Knowledge Explorer page: browse the workspace's indexed code as a tree, read a file with its details (size, lines,
 * revision, what it imports, the endpoints it serves, requirements that mention it), the API and screen inventory
 * from the modernization scan, code search, and an assistant that explains the open file from its content.
 * Files and content come from /files (a server without it falls back to code search hits).
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/assistant',
        '../services/pageRequests', 'ojs/ojknockout', 'ojs/ojbutton', 'ojs/ojinputtext'],
  function (ko, accUtils, api, workspaceSelection, ui, assistant, pageRequests) {
    const size = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B');

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
        { value: 'ui', label: 'UI Components', icon: 'monitor' }, { value: 'search', label: 'Search Result', icon: 'search' },
        { value: 'dependencies', label: 'Dependencies', icon: 'plug' }
      ]);

      // The project tree: folders open and close; files open in the viewer
      this.folder = ko.observable('');
      const open = ko.observable({});
      this.treeFilter = ko.observable('');
      this.treeFilterInput = ui.value(this.treeFilter);
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
            name: f.split('/').pop(), path: f, style: { paddingLeft: (depth * 14 + 4) + 'px' }, caret: isOpen ? '▾' : '▸',
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
        return [{ name: this.workspace() ? this.workspace().name : 'code', pick: () => this.folder('') }]
          .concat(parts.map((p, i) => ({ name: p, pick: () => this.folder(parts.slice(0, i + 1).join('/')) })));
      });
      this.folderFiles = ko.pureComputed(() => {
        const f = this.folder();
        return this.files().filter((x) => (f ? x.path.indexOf(f + '/') === 0 && x.path.slice(f.length + 1).indexOf('/') < 0 : x.path.indexOf('/') < 0)).map((x) => ({
          name: x.path.split('/').pop(), path: x.path, type: x.language, size: x.sizeBytes ? size(x.sizeBytes) : '',
          css: ko.pureComputed(() => (this.file() && this.file().path === x.path ? 'factory-clickable factory-row-sel' : 'factory-clickable')), open: () => this.openFile(x.path)
        }));
      });

      // The open file
      this.file = ko.observable(null);
      this.loadingFile = ko.observable(false);
      this.lines = ko.pureComputed(() => (this.file() ? this.file().content.split('\n').map((t, i) => ({ n: i + 1, text: t })) : []));
      this.fileInfo = ko.pureComputed(() => {
        const f = this.file();
        if (!f) {
          return null;
        }
        const imports = (f.content.match(/^\s*import\s+[\w.*]+;|require\(\s*\[|define\(\s*\[/gm) || []).length;
        const endpoints = this.inventory() ? this.inventory().endpoints.filter((e) => e.file === f.path || f.path.endsWith(e.file)) : [];
        const related = requirements().filter((r) => r.spec && r.spec.screens.some((s) => (s.relatedCode || []).some((p) => p === f.path)));
        return {
          name: f.path.split('/').pop(), folder: f.path.split('/').slice(0, -1).join('/'), type: f.language, size: size(f.sizeBytes || f.content.length),
          lines: f.partial ? 'Not known (only the indexed pieces are shown)' : f.lines + (f.truncated ? ' (shown up to 512 KB)' : ''), revision: f.revision ? 'r' + f.revision : '–', imports: imports, endpoints: endpoints.map((e) => ({ method: e.method, path: e.path, code: e.javaMethod })),
          related: related.map((r) => ({ code: 'REQ-' + r.id.replace(/-/g, '').slice(0, 4).toUpperCase(), title: r.title })),
          tags: [f.language, f.path.split('/')[0]].concat(/controller/i.test(f.path) ? ['Controller'] : []).concat(/service/i.test(f.path) ? ['Service'] : [])
            .concat(/\/(ofss|oracle)\//i.test(f.path) ? ['OBDX product'] : ['Bank code']).filter(Boolean),
          truncated: f.truncated
        };
      });
      this.openFile = (path) => {
        this.loadingFile(true);
        const id = this.workspaceId();
        api.get('workspaces/' + id + '/files/content?path=' + encodeURIComponent(path))
          .then((f) => this.file(f))
          .catch((error) => {
            if (error.status !== 404 || !this.fallback()) {
              throw error;
            }
            // Older server: show the file's indexed pieces from code search
            return api.get('workspaces/' + id + '/search?q=' + encodeURIComponent(path.split('/').pop()) + '&limit=20').then((res) => {
              const pieces = res.results.filter((r) => r.path === path);
              this.file({ path: path, language: pieces.length ? pieces[0].language : '', sizeBytes: 0, revision: 0, truncated: false, partial: true,
                content: pieces.map((r) => r.snippet).join('\n') || '(no content in the index)', lines: 0 });
            });
          })
          .catch(showError)
          .finally(() => this.loadingFile(false));
        const parent = path.split('/').slice(0, -1).join('/');
        this.folder(parent);
      };
      this.explain = () => this.ai.ask('Explain what this file does and how it fits in the application.');
      this.searchUsages = () => { if (this.file()) { this.query(this.file().path.split('/').pop().replace(/\.\w+$/, '')); this.tab('search'); this.search(); } };

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

      this.ai = assistant.create(() => {
        const f = this.file();
        return f ? 'File ' + f.path + ' (' + f.language + ', ' + f.lines + ' lines):\n' + f.content.slice(0, 15000) : '';
      }, ['Summarize this file', 'Explain the business logic', 'Find where this is used', 'Suggest changes']);

      // Opens the first Java file (or the first file) with its folders
      const openFirst = (list) => {
        const first = list.find((f) => /.java$/.test(f.path)) || list[0];
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
      };
    }

    return KnowledgeViewModel;
  }
);
