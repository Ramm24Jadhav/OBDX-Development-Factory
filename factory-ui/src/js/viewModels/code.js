/*
 * Code page for one workspace: the code as the factory indexed it, in seven tabs under one header (the index's revision
 * and freshness, Check for new commits, Reindex) and at most one problem bar (the most important of the Index checks):
 *  - Explore: the files as a tree (docked, hidden to a rail or floating over the code), the one viewer (syntax colours,
 *    Format, language, sub-tabs Code / Dependencies / Mentioned in / Related APIs / Comments, marked lines), and a side
 *    panel with File details and Ask about the code (the one AI panel: quick actions for the open file and free
 *    questions, answered with cited lines), then Key endpoints and Related business requirements;
 *  - Search: file names, then the indexed code, with every option (look in, module, file type, category, matched by);
 *    a result opens in the same viewer at its lines and Show in Explore opens it there;
 *  - Map: APIs, Screens, Service calls and Diagram from the modernization scan; rows open their file on Explore;
 *  - Business rules of the requirements and the code they link;
 *  - Quick checks (the version pack rules), Index (figures, live import, checks with fixes, import history, files by
 *    type) and Settings (SVN, UI target, Jenkins).
 * The file list (files?limit=20000) is loaded once per workspace. ?tab= picks a tab; pageRequests.codeSearch,
 * codeFile and codeTab come from other pages. The repository's latest revision is only known from a check the user runs
 * (POST svn/test), kept per workspace for the browser session (workspaceSelection.headChecks).
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/pageRequests', '../services/ui', '../services/assistant', '../services/dashboard', '../services/toast',
        '../services/syntax', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, pageRequests, ui, assistant, dashboard, toast, syntax) {
    // Server statuses as design-system status chips (ui.status: the category gives colour and icon), in this page's words
    const status = (raw, words, title) => Object.assign(ui.status(raw, words), { title: title || '' });
    const JOB_WORDS = { SUCCEEDED: 'Succeeded', FAILED: 'Failed', RUNNING: 'Running', QUEUED: 'Queued' };
    // A failed request in plain words (ui.errorText): a network failure says to check the connection
    const plain = (error) => ui.errorText(error);
    const jobText = (message) => (message ? ui.errorText(message) : '');
    const failed = (error) => toast.error(plain(error));
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const POLL_MS = 2000;
    // The viewer shows this many lines: the first ones, or a window around the marked lines further down
    const VIEW_LINES = 3000;
    // The AI gets the open file with line numbers, up to this many characters (less when search results go too)
    const AI_CHARS = 15000;
    const plural = (n, word) => n.toLocaleString() + ' ' + word + (n === 1 ? '' : 's');
    const headChecks = workspaceSelection.headChecks;
    const TABS = ['explore', 'search', 'map', 'rules', 'checks', 'index', 'settings'];
    // Older names of the tabs (the Code page's and Knowledge Explorer's), for requests from other pages and old links
    const TAB_ALIASES = { health: 'index', code: 'explore', apis: 'map', ui: 'map', dependencies: 'map', diagrams: 'map', logic: 'rules' };
    // Line references in an AI answer: "lines 12-20", "line 7", "L12-L20", "path:12-20"
    const CITE = /(?:\blines?\s+|\bL|:)(\d{1,6})(?:\s*(?:-|–|to)\s*L?(\d{1,6}))?/gi;
    const CITE_ASK = ' Base it on the code given, and cite the lines you rely on as "lines N-M" (the numbers before each line).';
    const MARK_WORDS = { search: 'matched by the search', ai: 'cited by Ask about the code', map: 'the method the Map links', link: 'asked for by the page that opened the file', comment: 'a comment in the file' };

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
    const sizeText = (bytes) => (bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : (bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B'));
    const LANGUAGE_NAMES = { java: 'Java', javascript: 'JavaScript', html: 'HTML', css: 'CSS', sql: 'SQL', xml: 'XML', json: 'JSON', properties: 'Properties', typescript: 'TypeScript', jsp: 'JSP' };
    const languageName = (l) => LANGUAGE_NAMES[l] || l || 'Other';
    // The index's kinds of searchable piece (the chunkers on the server)
    const KIND_NAMES = { class: 'Class', method: 'Method', file: 'Whole file', lines: 'Lines' };
    const kindName = (k) => KIND_NAMES[k] || k;
    // How a result matched (the server joins keyword and semantic with " + ")
    const matchWords = (m) => (m || 'keyword').split('+').map((x) => (x.trim() === 'semantic' ? 'meaning' : 'words')).join(' and ');
    const topFolder = (path) => (path.indexOf('/') > 0 ? path.split('/')[0] : '');
    const baseName = (path) => path.split('/').pop();
    const folderOf = (path) => path.split('/').slice(0, -1).join('/');
    const linesText = (from, to) => (from === to ? 'line ' + from : 'lines ' + from + '–' + to);
    const LEVELS = { error: { word: 'Error', icon: 'alert', order: 0 }, warning: { word: 'Warning', icon: 'alert', order: 1 }, info: { word: 'Info', icon: 'info', order: 2 } };
    const methodCss = (m) => 'fx-badge factory-cd-method factory-cd-method--' + String(m || '').toLowerCase();

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

    // Source lines with their real numbers; marker lines separate the pieces of a file shown from the index
    const sourceLines = (f) => (f ? f.pieceLines || (f.content || '').replace(/\r\n/g, '\n').split('\n').map((t, i) => ({ n: i + 1 + (f.offset || 0), text: t, marker: false })) : []);

    // The lines of a method declared in the file (a Map link names the method): from its declaration to its closing brace
    const findMethod = (f, name) => {
      if (!name) {
        return null;
      }
      const rows = sourceLines(f);
      const decl = new RegExp('(^|[^.\\w])' + name.replace(/[$]/g, '\\$') + '\\s*\\(');
      const at = rows.findIndex((r) => decl.test(r.text) && !/^\s*(\/\/|\*|return\b)/.test(r.text) && !/;\s*$/.test(r.text));
      if (at < 0) {
        return null;
      }
      let depth = 0;
      let opened = false;
      let end = at;
      for (let i = at; i < rows.length && i < at + 400; i++) {
        const bare = rows[i].text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/.*$/g, '');
        depth += (bare.match(/{/g) || []).length;
        if ((bare.match(/{/g) || []).length) {
          opened = true;
        }
        depth -= (bare.match(/}/g) || []).length;
        end = i;
        if (opened && depth <= 0) {
          break;
        }
      }
      return { from: rows[at].n, to: rows[end].n };
    };

    // This browser's layout choices for Explore (a private window may refuse storage: the defaults apply)
    const stored = (key, fallback) => { try { return window.localStorage.getItem('factory.code.' + key) || fallback; } catch (e) { return fallback; } };
    const store = (key, value) => { try { window.localStorage.setItem('factory.code.' + key, value); } catch (e) { /* kept for this visit */ } };
    const focusLater = (selector) => window.setTimeout(() => {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) {
        el.focus({ preventScroll: false });
      }
    }, 30);

    /**
     * Draws a file's lines into a code box (text nodes only, never HTML), with the marked lines highlighted.
     * Returns { comments, note, target } where target is the first marked row (to scroll to).
     */
    function renderCode(body, f, options) {
      while (body.firstChild) {
        body.removeChild(body.firstChild);
      }
      const result = { comments: [], note: '', target: null };
      if (!f) {
        return result;
      }
      const marks = options.marks;
      const all = sourceLines(f);
      const lang = options.lang || syntax.langOf(f.path, f.language);
      const texts = options.formatted ? reindent(all.map((l) => (l.marker ? '' : l.text)), lang) : all.map((l) => l.text);
      let from = 0;
      let to = all.length;
      if (all.length > VIEW_LINES) {
        const markAt = marks ? all.findIndex((l) => l.n >= marks.from) : -1;
        if (markAt >= VIEW_LINES) {
          from = Math.max(0, Math.min(markAt - VIEW_LINES / 2, all.length - VIEW_LINES));
          to = from + VIEW_LINES;
          result.note = 'A long file: lines ' + all[from].n + ' to ' + all[to - 1].n + ' of ' + all.length.toLocaleString() + ' are shown, around the marked lines.';
        } else {
          to = VIEW_LINES;
          result.note = 'Only the first ' + VIEW_LINES.toLocaleString() + ' of ' + all.length.toLocaleString() + ' lines are shown.';
        }
      }
      if (f.truncated) {
        result.note = (result.note ? result.note + ' ' : '') + 'The file is cut at ' + sizeText((f.content || '').length) + '; the rest is not shown.';
      }
      const state = syntax.start();
      // Colour from the top so block comments that open above the window are known
      for (let i = 0; i < from; i++) {
        syntax.tokenize(texts[i], lang, state);
      }
      const fragment = document.createDocumentFragment();
      for (let i = from; i < to; i++) {
        const l = all[i];
        const row = document.createElement('div');
        const num = document.createElement('span');
        num.className = 'factory-cd-n';
        const code = document.createElement('span');
        code.className = 'factory-cd-t';
        if (l.marker) {
          row.className = 'factory-cd-line is-marker';
          code.textContent = l.text;
        } else {
          const hit = !!marks && l.n >= marks.from && l.n <= marks.to;
          row.className = 'factory-cd-line' + (hit ? ' is-hit' : '');
          row.setAttribute('data-n', String(l.n));
          num.textContent = String(l.n);
          const tokens = syntax.tokenize(texts[i], lang, state);
          tokens.forEach((t) => {
            if (t.css) {
              const span = document.createElement('span');
              span.className = t.css;
              span.textContent = t.text;
              code.appendChild(span);
            } else {
              code.appendChild(document.createTextNode(t.text));
            }
          });
          const comment = tokens.filter((t) => t.css === 'fx-syn-com').map((t) => t.text).join(' ')
            .replace(/^\s*(\/\*\*?|\/\/|<!--|\*|--)\s*|\s*(\*\/|-->)\s*$/g, '').trim();
          if (comment && !/^\*+$/.test(comment)) {
            result.comments.push({ n: l.n, text: comment });
          }
          if (hit && !result.target) {
            result.target = row;
          }
        }
        row.appendChild(num);
        row.appendChild(code);
        fragment.appendChild(row);
      }
      body.appendChild(fragment);
      return result;
    }

    // Scrolls inside the code box only, with the first marked line a little below the top
    function scrollCode(body, target) {
      if (!body || body.offsetParent === null) {
        return false;
      }
      body.scrollTop = target ? Math.max(0, target.offsetTop - 48) : 0;
      body.scrollLeft = 0;
      return true;
    }

    function CodeViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.workspace = ko.observable(null);
      this.canManage = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.manageTip = ko.pureComputed(() => (this.canManage() ? null : 'Only workspace developers and leads can do this'));
      this.busy = ko.observable(false);
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(plain(error));
      this.lead = ko.pureComputed(() => (this.workspace() ? this.workspace().name + '\'s' : 'The workspace\'s')
        + ' code as the factory indexed it: explore it, search it, check it and set it up.');

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
        return [
          { label: 'Indexed revision', value: s.indexedRevision === null ? 'Not imported' : 'r' + s.indexedRevision },
          { label: 'Files', value: s.files.toLocaleString() },
          { label: 'Searchable pieces', value: s.chunks.toLocaleString() },
          { label: 'With embeddings', value: s.chunksWithEmbedding.toLocaleString() + (s.chunks ? ' (' + this.embeddedShare() + '%)' : '') }
        ];
      });
      this.indexLine = ko.pureComputed(() => (lastDone() ? 'Last indexed ' + lastDone().finished + (lastDone().duration ? ', took ' + lastDone().duration : '') + '. ' : '')
        + 'Reindex reads only what changed in the repository since then; Check for new commits asks the repository for its latest revision.');
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
          message: jobText(j.message)
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
            // A reindex this page watched has ended: say how it went, and read the new file list
            const watched = jobsWorkspace === id && this.importRunning();
            jobsWorkspace = id;
            jobs(jobList.map((job) => ({
              id: job.id,
              status: job.status,
              created: ui.when(job.createdAt),
              revisions: (job.fromRevision === null ? '' : 'r' + job.fromRevision + ' → ') + (job.toRevision === null ? '…' : 'r' + job.toRevision),
              files: job.filesIndexed + ' / ' + job.filesRemoved + ' (of ' + job.filesScanned + ' scanned)',
              message: jobText(job.message),
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
                loadFiles(id, false);
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
          .then(() => { toast.info('Reindexing started. Search and the AI use the previous index until it ends.'); return refreshImports(); }).catch(failed);
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
      // The header's pill: the indexed revision and its freshness, or the running import with its progress
      this.indexPill = ko.pureComputed(() => {
        const index = this.indexStatus();
        const head = this.headCheck();
        const live = this.liveImport();
        if (live) {
          return status('IMPORTING', 'Importing · ' + live.progress + '%', 'An import is running (' + live.text + '). Search and the AI use the previous index until it ends.');
        }
        if (!index || index.indexedRevision === null) {
          return status('NEW', 'Not imported', 'The code has not been imported yet. Reindex imports it.');
        }
        const rev = 'r' + index.indexedRevision;
        if (head && !head.ok) {
          return status('FAILED', rev + ' · Not reachable', 'The repository could not be read (' + head.at + '): ' + head.error);
        }
        if (head && this.behind() > 0) {
          return status('WARNING', rev + ' · ' + plural(this.behind(), 'revision') + ' behind', 'The repository is at r' + head.revision + ', the index at ' + rev + ' (checked ' + head.at + ').');
        }
        if (head) {
          return status('SUCCEEDED', rev + ' · Up to date', 'The index matches the repository\'s latest revision, r' + head.revision + ' (checked ' + head.at + ').');
        }
        return status('DRAFT', rev + ' · Not compared', 'The index is at ' + rev + '. Check for new commits to compare it with the repository.');
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
        navigate('workspaces');
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
      this.failedRules = ko.pureComputed(() => ratedRules().filter((r) => r.enabled && r.status.key === 'FAILED').length);
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
        navigate('packs');
      };

      // ---------- The tabs ----------
      this.tab = ko.observable('explore');
      const TAB_LABELS = { explore: 'Explore', search: 'Search', map: 'Map', rules: 'Business rules', checks: 'Quick checks', index: 'Index', settings: 'Settings' };
      const tabCount = {
        map: ko.pureComputed(() => (this.inventory() ? plural(this.inventory().endpoints.length, 'API') : '')),
        rules: ko.pureComputed(() => (allBizRules().length ? String(allBizRules().length) : '')),
        checks: ko.pureComputed(() => (this.failedRules() ? this.failedRules() + ' failed' : ''))
      };
      this.tabs = TABS.map((value) => ({
        value: value,
        label: TAB_LABELS[value],
        id: 'tab-' + value,
        panel: 'panel-' + value,
        count: tabCount[value] || ko.pureComputed(() => ''),
        countCss: value === 'checks' ? 'factory-cd-cnt is-danger' : 'factory-cd-cnt',
        selected: ko.pureComputed(() => (this.tab() === value ? 'true' : 'false')),
        tabindex: ko.pureComputed(() => (this.tab() === value ? '0' : '-1')),
        pick: () => this.tab(value)
      }));
      // Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern); ids are prefix + value
      const tabKeys = (selected, values, prefix) => (event) => {
        const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
        const move = keys[event.key];
        if (move === undefined) {
          return true;
        }
        const list = ko.unwrap(values);
        const at = list.indexOf(selected());
        const next = move === 'first' ? 0 : move === 'last' ? list.length - 1 : (at + move + list.length) % list.length;
        selected(list[next]);
        const button = document.getElementById(prefix + list[next]);
        if (button) {
          button.focus();
        }
        event.preventDefault();
        return false;
      };
      this.tabKey = tabKeys(this.tab, TABS, 'tab-');
      const pickTab = (wanted) => {
        const t = TAB_ALIASES[wanted] || wanted;
        if (TABS.indexOf(t) >= 0) {
          this.tab(t);
          return true;
        }
        return false;
      };
      // The address follows the tab, so a copied link opens it (replaceState: no history entry)
      this.tab.subscribe((t) => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('ojr') === 'code' && window.history.replaceState && params.get('tab') !== t) {
          params.set('tab', t);
          window.history.replaceState(window.history.state, '', window.location.pathname + '?' + params.toString());
        }
        if (t === 'explore') {
          window.setTimeout(scrollExplore, 0);
        } else if (t === 'search') {
          window.setTimeout(scrollHit, 0);
        }
      });

      // ---------- The workspace's files (one list for the tree, the file-name search and the filters) ----------
      this.allFiles = ko.observableArray([]);
      this.filesLoading = ko.observable(false);
      this.fallback = ko.observable(false);
      this.fileCount = ko.pureComputed(() => this.allFiles().length.toLocaleString());
      const fileRevisions = ko.pureComputed(() => {
        const m = {};
        this.allFiles().forEach((f) => { m[f.path] = f.revision; });
        return m;
      });
      // Folders and the files directly in them
      const dirIndex = ko.pureComputed(() => {
        const dirs = { '': { folders: {}, files: [] } };
        this.allFiles().forEach((f) => {
          const parts = f.path.split('/');
          let parent = '';
          for (let i = 0; i < parts.length - 1; i++) {
            const dir = parts.slice(0, i + 1).join('/');
            if (!dirs[dir]) {
              dirs[dir] = { folders: {}, files: [] };
            }
            dirs[parent].folders[dir] = true;
            parent = dir;
          }
          dirs[parent].files.push(f);
        });
        return dirs;
      });
      const loadFiles = (id, openOne) => {
        this.filesLoading(true);
        return api.get('workspaces/' + id + '/files?limit=20000').then((list) => {
          if (id !== this.workspaceId()) {
            return;
          }
          this.fallback(false);
          this.allFiles(list);
          if (openOne) {
            openFirst();
          }
        }).catch((error) => {
          if (error.status !== 404) {
            showError(error);
            return null;
          }
          // Older server without /files: the files code search finds for common words
          this.fallback(true);
          return Promise.all(['class', 'function', 'define', 'select'].map((q) => api.get('workspaces/' + id + '/search?q=' + q + '&limit=50').catch(() => ({ results: [] }))))
            .then((all) => {
              const seen = {};
              const list = [];
              all.forEach((res) => res.results.forEach((r) => { if (!seen[r.path]) { seen[r.path] = true; list.push({ path: r.path, language: r.language, sizeBytes: 0 }); } }));
              this.allFiles(list.sort((a, b) => a.path.localeCompare(b.path)));
              if (openOne) {
                openFirst();
              }
            });
        }).finally(() => this.filesLoading(false));
      };

      // A file's content, kept for the visit (the viewers of Explore and Search share it). An older server without
      // /files shows the file's indexed pieces from code search, each under a marker line saying what it is.
      const cache = new Map();
      const fetchFile = (path) => {
        const id = this.workspaceId();
        const key = id + ':' + path;
        if (cache.has(key)) {
          return Promise.resolve(cache.get(key));
        }
        return api.get('workspaces/' + id + '/files/content?path=' + encodeURIComponent(path))
          .catch((error) => {
            if (error.status !== 404 || !this.fallback()) {
              throw error;
            }
            return api.get('workspaces/' + id + '/search?q=' + encodeURIComponent(baseName(path)) + '&limit=20').then((res) => {
              const pieces = res.results.filter((r) => r.path === path)
                .sort((a, b) => a.startLine - b.startLine || (b.endLine - b.startLine) - (a.endLine - a.startLine));
              const pieceLines = [];
              const shown = [];
              pieces.forEach((r) => {
                if (shown.some((s) => s.indexOf(r.snippet.trim()) >= 0)) {
                  return;
                }
                shown.push(r.snippet);
                const exact = r.snippet.split('\n').length === r.endLine - r.startLine + 1;
                pieceLines.push({ n: '', text: 'Indexed piece ' + shown.length + ': ' + r.kind + (r.kind === 'class' && !exact ? ' outline' : '') + ', lines ' + r.startLine + ' to ' + r.endLine + ' of the file', marker: true });
                r.snippet.split('\n').forEach((t, i) => pieceLines.push({ n: exact ? r.startLine + i : '', text: t, marker: false }));
              });
              return { path: path, language: pieces.length ? pieces[0].language : '', sizeBytes: 0, revision: 0, truncated: false, partial: true,
                content: pieceLines.filter((l) => !l.marker).map((l) => l.text).join('\n') || '(no content in the index)',
                pieceLines: pieceLines.length ? pieceLines : null, lines: 0 };
            });
          })
          .then((f) => {
            if (cache.size > 30) {
              cache.delete(cache.keys().next().value);
            }
            cache.set(key, f);
            return f;
          });
      };

      // ---------- Explore: the files panel ----------
      // docked (a column), rail (hidden to a 48 px rail) or floating (over the code, from the rail); floating is not kept
      this.files = ko.observable(stored('files', 'docked') === 'rail' ? 'rail' : 'docked');
      this.files.subscribe((mode) => store('files', mode === 'docked' ? 'docked' : 'rail'));
      this.sideOpen = ko.observable(stored('side', 'open') !== 'closed');
      this.sideOpen.subscribe((open) => store('side', open ? 'open' : 'closed'));
      this.detailsOpen = ko.observable(stored('details', 'open') !== 'closed');
      this.detailsOpen.subscribe((open) => store('details', open ? 'open' : 'closed'));
      this.exploreCss = ko.pureComputed(() => 'factory-cd-explore is-files-' + this.files() + (this.sideOpen() ? ' is-side-open' : ' is-side-closed'));
      this.floatLabel = ko.pureComputed(() => (this.files() === 'floating' ? 'Dock the files as a column' : 'Float the files over the code'));
      this.floatIcon = ko.pureComputed(() => (this.files() === 'floating' ? 'M4 4h6v16H4zM14 8h6M14 12h6M14 16h6'
        : 'M14 4h6v6M20 4l-8 8M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4'));
      // The rail's button opens and closes the floating files; the panel's own button floats a docked panel or docks a floating one
      this.toggleFloat = () => {
        const floating = this.files() === 'floating';
        this.files(floating ? 'rail' : 'floating');
        focusLater(floating ? '#railFloatFiles' : '#treeFilter input');
      };
      this.floatOrDock = () => {
        const floating = this.files() === 'floating';
        this.files(floating ? 'docked' : 'floating');
        focusLater(floating ? '#filesFloat' : '#treeFilter input');
      };
      this.railFiles = () => { this.files('rail'); focusLater('#railShowFiles'); };
      this.dockFiles = () => { this.files('docked'); focusLater('#filesHide'); };
      const closeFloating = (focus) => {
        if (this.files() === 'floating') {
          this.files('rail');
          focusLater(focus || '#railFloatFiles');
        }
      };
      this.filesKey = (event) => {
        if (event.key === 'Escape' && this.files() === 'floating') {
          event.preventDefault();
          closeFloating();
          return false;
        }
        return true;
      };
      // Escape closes the floating files wherever focus is (dialogs, the palette and menus close themselves first)
      const escape = (event) => {
        if (event.key === 'Escape' && this.files() === 'floating' && this.tab() === 'explore'
          && !document.querySelector('.fx-dialog, .fx-cmd, .fx-sheet, .fx-menu, .fx-select-list, .fx-popup')) {
          closeFloating();
        }
      };
      this.closeSide = () => { this.sideOpen(false); focusLater('#railShowSide'); };
      this.openSide = () => { this.sideOpen(true); focusLater('#hideSide'); };
      this.openDetails = () => { this.sideOpen(true); this.detailsOpen(true); focusLater('#detailsToggle'); };
      this.openAsk = () => { this.sideOpen(true); focusLater('#askInput input'); };
      this.toggleDetails = () => this.detailsOpen(!this.detailsOpen());

      // The tree: folders open and close; files open in the viewer. A folder picked shows its files in the viewer.
      this.folder = ko.observable('');
      this.viewMode = ko.observable('file');
      const open = ko.observable({});
      this.treeFilter = ko.observable('');
      this.rootName = ko.pureComputed(() => (this.workspace() ? this.workspace().name : 'code'));
      this.rootCss = ko.pureComputed(() => 'factory-cd-node is-dir is-root' + (this.folder() === '' && this.viewMode() === 'folder' ? ' is-on' : ''));
      this.pickRoot = () => { this.folder(''); this.viewMode('folder'); };
      this.collapseTree = () => { open({}); this.folder(''); };
      this.treeNote = ko.observable('');
      const TREE_MAX = 400;
      this.tree = ko.pureComputed(() => {
        const text = this.treeFilter().trim().toLowerCase();
        const dirs = dirIndex();
        const openNow = open();
        const current = this.file() && this.viewMode() === 'file' ? this.file().path : null;
        const rows = [];
        let wanted = null;
        if (text) {
          // Matching files and folders, with every folder above them open
          wanted = {};
          let count = 0;
          this.allFiles().forEach((f) => {
            if (count < TREE_MAX && f.path.toLowerCase().indexOf(text) >= 0) {
              count++;
              wanted[f.path] = true;
              const parts = f.path.split('/');
              for (let i = 1; i < parts.length; i++) {
                wanted[parts.slice(0, i).join('/')] = true;
              }
            }
          });
          this.treeNote(count >= TREE_MAX ? 'The first ' + TREE_MAX + ' matches are shown. Type more to narrow them.' : (count ? '' : 'No file or folder matches.'));
        } else {
          this.treeNote('');
        }
        const walk = (dir, depth) => {
          const node = dirs[dir];
          if (!node || rows.length > 3000) {
            return;
          }
          Object.keys(node.folders).sort().forEach((f) => {
            if (wanted && !wanted[f]) {
              return;
            }
            const isOpen = wanted ? true : !!openNow[f];
            rows.push({
              name: baseName(f), path: f, style: { paddingLeft: (depth * 14 + 8) + 'px' },
              css: 'factory-cd-node is-dir' + (this.folder() === f && this.viewMode() === 'folder' ? ' is-on' : ''),
              caretCss: 'factory-nav-icon factory-ico-caret factory-cd-chev' + (isOpen ? '' : ' is-closed'),
              iconCss: 'factory-nav-icon factory-cd-folder ' + (isOpen ? 'factory-ico-folder-fill' : 'factory-ico-folder'),
              expanded: isOpen ? 'true' : 'false', current: null,
              pick: () => { const o = Object.assign({}, open()); o[f] = !isOpen; open(o); this.folder(f); this.viewMode('folder'); }
            });
            if (isOpen && depth < 14) {
              walk(f, depth + 1);
            }
          });
          node.files.slice().sort((a, b) => a.path.localeCompare(b.path)).forEach((x) => {
            if (wanted && !wanted[x.path]) {
              return;
            }
            rows.push({
              name: baseName(x.path), path: x.path, style: { paddingLeft: (depth * 14 + 26) + 'px' },
              css: 'factory-cd-node is-file' + (current === x.path ? ' is-on' : ''),
              caretCss: 'factory-cd-caret-none', iconCss: 'factory-nav-icon factory-ico-doc factory-cd-ficon factory-cd-ficon--' + iconTone(x.path),
              expanded: null, current: current === x.path ? 'true' : null,
              pick: () => this.openFile(x.path)
            });
          });
        };
        walk('', 0);
        return rows;
      });
      const iconTone = (path) => {
        const ext = (path.split('.').pop() || '').toLowerCase();
        return ext === 'java' ? 'red' : /^(js|ts|jsx|tsx)$/.test(ext) ? 'amber' : /^(html|htm|xml)$/.test(ext) ? 'blue' : ext === 'sql' ? 'violet' : 'grey';
      };
      this.crumbs = ko.pureComputed(() => {
        const parts = this.folder() ? this.folder().split('/') : [];
        return [{ name: this.rootName(), pick: () => this.folder('') }]
          .concat(parts.map((p, i) => ({ name: p, pick: () => this.folder(parts.slice(0, i + 1).join('/')) })));
      });
      const indexRevision = this.indexedRevision;
      this.folderFiles = ko.pureComputed(() => {
        const node = dirIndex()[this.folder()];
        return (node ? node.files : []).slice().sort((a, b) => a.path.localeCompare(b.path)).map((x) => {
          const known = x.sizeBytes ? sizeText(x.sizeBytes) : '–';
          return {
            name: baseName(x.path), path: x.path, type: languageName(x.language), size: known,
            sizeTitle: known === '–' ? 'This factory\'s server does not list file sizes' : '',
            modified: x.revision ? 'r' + x.revision : (indexRevision() ? 'r' + indexRevision() + ' or earlier' : '–'),
            modifiedTitle: x.revision ? 'Last changed in revision ' + x.revision : 'The code was last imported at this revision',
            open: () => this.openFile(x.path)
          };
        });
      });

      // ---------- Explore: the one viewer ----------
      this.file = ko.observable(null);
      this.fileLoading = ko.observable(false);
      this.fileError = ko.observable('');
      this.viewerNote = ko.observable('');
      this.marks = ko.observable(null);
      this.showingFile = ko.pureComputed(() => this.viewMode() === 'file' && !!this.file());
      this.fileName = ko.pureComputed(() => (this.file() ? baseName(this.file().path) : ''));
      this.langChoice = ko.observable('auto');
      this.formatted = ko.observable(false);
      this.toggleFormat = () => this.formatted(!this.formatted());
      this.lang = ko.pureComputed(() => (this.langChoice() !== 'auto' ? this.langChoice() : (this.file() ? syntax.langOf(this.file().path, this.file().language) : 'plain')));
      this.langOptions = [
        { value: 'auto', label: 'Auto' }, { value: 'java', label: 'Java' }, { value: 'javascript', label: 'JavaScript' },
        { value: 'html', label: 'HTML / XML' }, { value: 'sql', label: 'SQL' }, { value: 'css', label: 'CSS' },
        { value: 'properties', label: 'Properties' }, { value: 'plain', label: 'Plain text' }
      ];
      this.viewerTitle = ko.pureComputed(() => (this.showingFile() ? this.fileName()
        : (this.viewMode() === 'folder' ? (this.folder() ? baseName(this.folder()) + '/' : this.rootName()) : 'Code')));
      this.viewerSub = ko.pureComputed(() => {
        const f = this.file();
        if (!this.showingFile()) {
          return this.viewMode() === 'folder' ? plural(this.folderFiles().length, 'file') + ' in this folder' : 'Pick a file in the files.';
        }
        return [folderOf(f.path) || 'Top level', languageName(f.language), f.partial ? 'indexed pieces only' : plural(f.lines || sourceLines(f).length, 'line'),
          f.revision ? 'last changed r' + f.revision : ''].filter(Boolean).join(' · ');
      });
      this.codeLabel = ko.pureComputed(() => (this.file() ? 'Code of ' + this.file().path : 'Code'));
      this.markText = ko.pureComputed(() => {
        const m = this.marks();
        return m ? (m.from === m.to ? 'Line ' + m.from : 'Lines ' + m.from + '–' + m.to) + ' marked: ' + (MARK_WORDS[m.source] || 'marked') : '';
      });
      this.clearMarks = () => { this.marks(null); focusLater('#fileCode'); };
      this.comments = ko.observableArray([]);
      let exploreTarget = null;
      const scrollExplore = () => scrollCode(document.getElementById('fileCode'), exploreTarget);
      let renderTimer = null;
      const renderExplore = () => {
        const body = document.getElementById('fileCode');
        if (!body) {
          return;
        }
        const out = renderCode(body, this.file(), { marks: this.marks(), lang: this.lang(), formatted: this.formatted() });
        this.viewerNote(out.note);
        this.comments(out.comments.map((c) => Object.assign(c, { show: () => this.showLine(c.n) })));
        exploreTarget = out.target;
        scrollExplore();
      };
      ko.computed(() => {
        this.file();
        this.marks();
        this.lang();
        this.formatted();
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderExplore, 0);
      });
      this.fileTab = ko.observable('code');
      this.fileTab.subscribe((v) => {
        if (v === 'usedby') {
          loadUsedBy();
        }
        if (v === 'code') {
          window.setTimeout(scrollExplore, 0);
        }
      });
      this.showLine = (n) => {
        this.fileTab('code');
        this.marks({ from: n, to: n, source: 'comment' });
        focusLater('#fileCode');
      };

      // What the file depends on, what mentions it, its APIs
      this.imports = ko.pureComputed(() => {
        const f = this.file();
        if (!f) {
          return [];
        }
        const found = [];
        const add = (name) => { if (name && found.indexOf(name) < 0) { found.push(name); } };
        const content = f.content || '';
        (content.match(/^\s*import\s+(?:static\s+)?[\w.*]+\s*;/gm) || []).forEach((m) => add(m.replace(/^\s*import\s+(?:static\s+)?|\s*;$/g, '')));
        (content.match(/(?:define|require)\(\s*\[([^\]]*)\]/g) || []).forEach((m) => (m.match(/['"][^'"]+['"]/g) || []).forEach((s) => add(s.slice(1, -1))));
        (content.match(/\bfrom\s+['"][^'"]+['"]|require\(\s*['"][^'"]+['"]\s*\)/g) || []).forEach((m) => add((m.match(/['"]([^'"]+)['"]/) || [])[1]));
        return found.map((name) => {
          const tail = name.indexOf('.') >= 0 && !/[/]/.test(name) ? name.split('.').pop() + '.java' : name.split('!').pop().split('/').pop();
          const match = tail && tail !== '*.java' ? this.allFiles().find((x) => baseName(x.path) === tail || baseName(x.path) === tail + '.js') : null;
          return { name: name, path: match ? match.path : '', open: () => { if (match) { this.openFile(match.path); } } };
        });
      });
      this.usedBy = ko.observable(null);
      const loadUsedBy = () => {
        const f = this.file();
        if (!f || this.usedBy() !== null) {
          return Promise.resolve();
        }
        const base = baseName(f.path).replace(/\.\w+$/, '');
        return api.get('workspaces/' + this.workspaceId() + '/search?q=' + encodeURIComponent(base) + '&limit=30').then((res) => {
          if (!this.file() || this.file().path !== f.path) {
            return;
          }
          const seen = {};
          this.usedBy(res.results.filter((r) => r.path !== f.path && (r.snippet || '').toLowerCase().indexOf(base.toLowerCase()) >= 0 && !seen[r.path] && (seen[r.path] = true))
            .map((r) => ({ path: r.path, lines: 'lines ' + r.startLine + '-' + r.endLine, open: () => this.openFile(r.path, { from: r.startLine, to: r.endLine, source: 'search' }) })));
        }).catch(() => this.usedBy([]));
      };
      this.inventory = ko.observable(null);
      this.inventoryMissing = ko.pureComputed(() => !this.inventory());
      this.relatedApis = ko.pureComputed(() => {
        const f = this.file();
        const inv = this.inventory();
        if (!f || !inv) {
          return [];
        }
        const served = inv.endpoints.filter((e) => e.file === f.path || f.path.endsWith(e.file)).map((e) => ({ method: e.method, path: e.path, note: 'Served here: ' + e.javaMethod, served: true, code: e.javaMethod }));
        const screenIds = inv.screens.filter((s) => s.files.indexOf(f.path) >= 0).map((s) => s.id);
        const called = inv.calls.filter((c) => c.screens.some((s) => screenIds.indexOf(s) >= 0)).map((c) => ({ method: c.method, path: c.path, note: c.endpoint ? 'Called; served by ' + c.endpoint : 'Called; an OBDX product service', served: false }));
        return served.concat(called).map((a) => Object.assign(a, { methodCss: methodCss(a.method) }));
      });
      this.keyEndpoints = ko.pureComputed(() => this.relatedApis().filter((a) => a.served));
      this.endpointsHint = ko.pureComputed(() => (this.inventoryMissing() ? 'Run the modernization scan to find endpoints.' : (this.file() ? 'This file serves no REST endpoints.' : 'Open a file to see its endpoints.')));
      const fileTabCount = (fn) => ko.pureComputed(() => (this.file() ? String(fn()) : ''));
      this.fileTabs = [
        { value: 'code', label: 'Code', count: ko.pureComputed(() => '') },
        { value: 'deps', label: 'Dependencies', count: fileTabCount(() => this.imports().length) },
        { value: 'usedby', label: 'Mentioned in', count: ko.pureComputed(() => (this.usedBy() ? String(this.usedBy().length) : '')) },
        { value: 'apis', label: 'Related APIs', count: fileTabCount(() => this.relatedApis().length) },
        { value: 'comments', label: 'Comments', count: fileTabCount(() => this.comments().length) }
      ].map((t) => Object.assign(t, {
        id: 'ft-' + t.value,
        selected: ko.pureComputed(() => (this.fileTab() === t.value ? 'true' : 'false')),
        tabindex: ko.pureComputed(() => (this.fileTab() === t.value ? '0' : '-1')),
        pick: () => this.fileTab(t.value)
      }));
      this.fileTabKey = tabKeys(this.fileTab, this.fileTabs.map((t) => t.value), 'ft-');
      this.showDeps = () => this.fileTab('deps');
      this.showUsedBy = () => this.fileTab('usedby');
      this.showApis = () => this.fileTab('apis');

      const requirements = ko.observableArray([]);
      this.fileInfo = ko.pureComputed(() => {
        const f = this.file();
        if (!f) {
          return null;
        }
        const lang = syntax.langOf(f.path, f.language);
        const content = f.content || '';
        const kind = lang === 'java' ? (/\binterface\s/.test(content) ? 'Java interface' : 'Java class') : lang === 'javascript' ? 'JavaScript' : lang === 'html' ? 'HTML view' : lang === 'sql' ? 'SQL script' : languageName(f.language);
        const tags = [topFolder(f.path)].concat(/controller/i.test(f.path) ? ['Controller'] : []).concat(/service/i.test(f.path) ? ['Service'] : [])
          .concat(/resource/i.test(f.path) && lang === 'java' ? ['REST'] : []).concat(/\/(ofss|oracle)\//i.test(f.path) ? ['OBDX product'] : ['Bank code']).filter(Boolean);
        const lines = f.partial ? 0 : (f.lines || sourceLines(f).length);
        return {
          type: kind,
          size: f.partial ? 'Not listed by this server' : sizeText(f.sizeBytes || content.length) + ' · ' + plural(lines, 'line') + (f.truncated ? ' (shown up to 512 KB)' : ''),
          revision: f.revision ? 'r' + f.revision : (indexRevision() ? 'r' + indexRevision() + ' or earlier' : '–'),
          indexed: indexRevision() ? 'r' + indexRevision() : 'Not imported',
          summary: [kind, f.partial ? '' : sizeText(f.sizeBytes || content.length), f.revision ? 'r' + f.revision : '', plural(this.keyEndpoints().length, 'endpoint')].filter(Boolean).join(' · '),
          tags: tags
        };
      });
      this.detailsSummary = ko.pureComputed(() => (this.fileInfo() ? this.fileInfo().summary : 'No file open'));
      this.relatedReqs = ko.pureComputed(() => {
        const f = this.file();
        return f ? requirements().filter((r) => r.spec && (r.spec.screens || []).some((s) => (s.relatedCode || []).some((p) => p === f.path)))
          .map((r) => ({ code: 'REQ-' + r.id.replace(/-/g, '').slice(0, 4).toUpperCase(), title: r.title, open: () => { pageRequests.requirement(r.id); navigate('requirements'); } })) : [];
      });

      let fileToken = 0;
      /**
       * Opens a file in Explore's viewer: options.from/to mark lines (options.source says why), options.find marks the
       * method of that name. Picking a file closes the floating files panel.
       */
      this.openFile = (path, options) => {
        const o = options || {};
        const token = ++fileToken;
        this.viewMode('file');
        const parts = path.split('/');
        const opened = Object.assign({}, open());
        for (let i = 1; i < parts.length; i++) {
          opened[parts.slice(0, i).join('/')] = true;
        }
        open(opened);
        this.folder(parts.slice(0, -1).join('/'));
        if (this.files() === 'floating') {
          closeFloating('#fileCode');
        }
        const mark = (f) => {
          let m = null;
          if (o.find) {
            const found = findMethod(f, o.find);
            m = found ? Object.assign(found, { source: o.source || 'map' }) : null;
          } else if (o.from) {
            m = { from: o.from, to: Math.max(o.from, o.to || o.from), source: o.source || 'link' };
          }
          this.marks(m);
        };
        const shown = this.file();
        if (shown && shown.path === path) {
          this.fileTab('code');
          mark(shown);
          window.setTimeout(scrollExplore, 0);
          return Promise.resolve(shown);
        }
        this.fileLoading(true);
        this.fileError('');
        this.usedBy(null);
        this.fileTab('code');
        return fetchFile(path)
          .then((f) => {
            if (token !== fileToken) {
              return null;
            }
            this.marks(null);
            this.file(f);
            mark(f);
            return f;
          })
          .catch((error) => {
            if (token !== fileToken) {
              return null;
            }
            this.file(null);
            this.marks(null);
            this.fileError(plain(error) + ' Pick another file, or reindex if the file was removed.');
            return null;
          })
          .finally(() => { if (token === fileToken) { this.fileLoading(false); } });
      };
      // Opens the first Java file (or the first file) when Explore has nothing open
      const openFirst = () => {
        const list = this.allFiles();
        const first = list.find((f) => /\.java$/.test(f.path)) || list[0];
        if (first && !this.file()) {
          this.openFile(first.path);
        }
      };
      this.copyPath = () => {
        const f = this.file();
        if (f) {
          ui.copy(f.path).then(() => toast.success('Path copied.')).catch(() => toast.error('The path could not be copied. Select it in the viewer and copy it by hand.'));
        }
      };
      // File details menu (the design system's menu: keyboard, Escape and outside clicks from ui.menu)
      this.fileMenu = ui.menu();
      this.menuSearch = () => {
        this.fileMenu.close();
        if (this.file()) {
          searchFor(baseName(this.file().path).replace(/\.\w+$/, ''));
        }
      };

      // ---------- Search: file names, then the indexed code ----------
      this.query = ko.observable('');
      this.results = ko.observableArray([]);
      this.searchNote = ko.observable('');
      this.searchError = ko.observable('');
      this.searching = ko.observable(false);
      this.searched = ko.observable('');
      this.inContent = ko.observable(true);
      this.inNames = ko.observable(true);
      this.inComments = ko.observable(false);
      this.lookIn = [
        { id: 'lookContent', label: 'File content', value: this.inContent },
        { id: 'lookNames', label: 'Class and method names', value: this.inNames },
        { id: 'lookComments', label: 'Comments', value: this.inComments }
      ].map((l) => Object.assign(l, { pressed: ko.pureComputed(() => (l.value() ? 'true' : 'false')), flip: () => l.value(!l.value()) }));
      // Filters: module (top-level folder), file type, category (kind of piece) and how it matched
      this.fType = ko.observable('');
      this.fModule = ko.observable('');
      this.fKind = ko.observable('');
      this.fMatch = ko.observable('');
      const optionsOf = (all, values, name) => [{ value: '', label: all }].concat(Array.from(new Set(values.filter(Boolean))).sort()
        .map((v) => ({ value: v, label: name ? name(v) : v })));
      this.moduleOptions = ko.pureComputed(() => optionsOf('All modules', this.allFiles().map((f) => topFolder(f.path)).concat(this.results().map((r) => topFolder(r.path)))));
      this.typeOptions = ko.pureComputed(() => optionsOf('All file types', this.results().map((r) => r.language).concat(this.fileMatches().map((f) => f.language)), languageName));
      this.kindOptions = ko.pureComputed(() => optionsOf('Any category', this.results().map((r) => r.kind), kindName));
      this.matchOptions = ko.pureComputed(() => optionsOf('Words or meaning', this.results().map((r) => r.matchedBy), matchWords));
      this.filtersOn = ko.pureComputed(() => !!(this.fType() || this.fModule() || this.fKind() || this.fMatch()));
      this.clearFilters = () => { this.fType(''); this.fModule(''); this.fKind(''); this.fMatch(''); };
      const COMMENT = /(\/\/|\/\*|^\s*\*|<!--|^\s*#)(.*)$/;
      const inComment = (r) => {
        const words = this.searched().toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        return (r.snippet || '').split('\n').some((line) => {
          const m = COMMENT.exec(line);
          return m && words.some((w) => m[2].toLowerCase().indexOf(w) >= 0);
        });
      };
      this.selected = ko.observable(null);
      const isCurrent = (key) => ko.pureComputed(() => !!this.selected() && this.selected().key === key);
      this.fileMatches = ko.pureComputed(() => {
        const words = this.searched().toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) {
          return [];
        }
        return this.allFiles().filter((x) => words.every((w) => x.path.toLowerCase().indexOf(w) >= 0)
          && (!this.fModule() || topFolder(x.path) === this.fModule()) && (!this.fType() || x.language === this.fType())).slice(0, 50);
      });
      this.fileMatchesAll = ko.observable(false);
      this.showAllFileMatches = () => this.fileMatchesAll(true);
      this.shownFileMatches = ko.pureComputed(() => this.fileMatches().slice(0, this.fileMatchesAll() ? 50 : 8).map((x) => {
        const key = x.path + ':file';
        const current = isCurrent(key);
        return {
          name: baseName(x.path), folder: folderOf(x.path) || 'Top level', language: x.language,
          css: ko.pureComputed(() => 'factory-cd-result' + (current() ? ' is-current' : '')),
          current: ko.pureComputed(() => (current() ? 'true' : null)),
          open: (quiet) => this.openHit({ key: key, path: x.path, startLine: 0, endLine: 0, kind: 'file', language: x.language }, quiet === true)
        };
      }));
      this.filteredResults = ko.pureComputed(() => this.results().filter((r) => {
        const named = r.kind === 'class' || r.kind === 'method';
        const lookOk = (named && this.inNames()) || (!named && this.inContent()) || (this.inComments() && inComment(r));
        return lookOk && (!this.fType() || r.language === this.fType()) && (!this.fModule() || topFolder(r.path) === this.fModule())
          && (!this.fKind() || r.kind === this.fKind()) && (!this.fMatch() || r.matchedBy === this.fMatch());
      }).map((r) => {
        const key = r.path + ':' + r.startLine + ':' + r.endLine;
        const current = isCurrent(key);
        const revision = fileRevisions()[r.path];
        return {
          key: key,
          name: baseName(r.path),
          symbol: r.symbol && r.symbol !== baseName(r.path) ? r.symbol : '',
          where: (folderOf(r.path) || 'Top level') + ' · ' + linesText(r.startLine, r.endLine),
          meta: [kindName(r.kind), languageName(r.language), 'matched by ' + matchWords(r.matchedBy)].concat(revision !== undefined ? ['changed in r' + revision] : []).join(' · '),
          css: ko.pureComputed(() => 'factory-cd-result' + (current() ? ' is-current' : '')),
          current: ko.pureComputed(() => (current() ? 'true' : null)),
          open: (quiet) => this.openHit(Object.assign({ key: key }, r), quiet === true)
        };
      }));
      this.resultCount = ko.pureComputed(() => (this.searched() ? plural(this.fileMatches().length, 'file name') + ' · '
        + (this.filteredResults().length === this.results().length ? '' : this.filteredResults().length + ' of ')
        + plural(this.results().length, 'place') + ' in the code' : ''));

      this.search = () => {
        const q = this.query().trim();
        if (!q) {
          return Promise.resolve();
        }
        this.searching(true);
        this.searchError('');
        this.tab('search');
        return api.get('workspaces/' + this.workspaceId() + '/search?q=' + encodeURIComponent(q))
          .then((response) => {
            this.clearFilters();
            this.fileMatchesAll(false);
            this.results(response.results.map((r) => Object.assign({}, r, { matchedBy: r.matchedBy || 'keyword' })));
            this.searched(q);
            this.searchNote(response.semanticNote || '');
            const first = this.filteredResults()[0];
            if (first) {
              first.open(true);
            } else if (this.shownFileMatches()[0]) {
              this.shownFileMatches()[0].open(true);
            } else {
              this.closeHit();
            }
          })
          .catch((error) => this.searchError('Search failed. ' + plain(error)))
          .finally(() => this.searching(false));
      };
      const searchFor = (text) => {
        this.query(text);
        return this.search();
      };

      // The search viewer: the same rendering as Explore, at the matched lines
      this.hitFile = ko.observable(null);
      this.hitLoading = ko.observable(false);
      this.hitError = ko.observable('');
      this.hitNote = ko.observable('');
      let hitToken = 0;
      let hitTarget = null;
      const scrollHit = () => scrollCode(document.getElementById('searchCode'), hitTarget);
      const renderHit = (quiet) => window.setTimeout(() => {
        const body = document.getElementById('searchCode');
        const sel = this.selected();
        if (!body) {
          return;
        }
        const out = renderCode(body, this.hitFile(), { marks: sel && sel.startLine ? { from: sel.startLine, to: sel.endLine } : null });
        this.hitNote(out.note);
        hitTarget = out.target;
        scrollHit();
        if (!quiet && sel) {
          const viewer = document.getElementById('searchViewer');
          if (viewer && window.matchMedia('(max-width: 1099px)').matches) {
            viewer.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          }
          body.focus({ preventScroll: true });
        }
      }, 0);
      this.closeHit = () => { this.selected(null); this.hitFile(null); this.hitError(''); renderHit(true); };
      this.openHit = (r, quiet) => {
        const token = ++hitToken;
        this.selected({ key: r.key, path: r.path, startLine: r.startLine, endLine: r.endLine, kind: r.kind, symbol: r.symbol, language: r.language, snippet: r.snippet });
        this.hitError('');
        const shown = this.hitFile();
        if (shown && shown.path === r.path) {
          renderHit(quiet);
          return;
        }
        this.hitLoading(true);
        fetchFile(r.path)
          .then((f) => { if (token === hitToken) { this.hitFile(f); renderHit(quiet); } })
          .catch((error) => {
            if (token !== hitToken) {
              return;
            }
            // The file is not readable (not in the working copy): show the indexed piece instead
            this.hitFile(r.snippet ? { path: r.path, language: r.language, content: r.snippet, offset: r.startLine - 1 } : null);
            this.hitError(plain(error) + (r.snippet ? ' Showing the indexed piece only.' : ''));
            renderHit(true);
          })
          .finally(() => { if (token === hitToken) { this.hitLoading(false); } });
      };
      this.hitTitle = ko.pureComputed(() => {
        const sel = this.selected();
        return sel ? baseName(sel.path) + (sel.startLine ? ' · ' + linesText(sel.startLine, sel.endLine) : '') : 'Pick a result';
      });
      this.hitSub = ko.pureComputed(() => {
        const sel = this.selected();
        if (!sel) {
          return 'File names and places in the code open here.';
        }
        const f = this.hitFile();
        return [sel.kind === 'file' ? 'File' : kindName(sel.kind) + (sel.symbol ? ' ' + sel.symbol : ''), topFolder(sel.path) ? 'module ' + topFolder(sel.path) : 'top level',
          languageName(f ? f.language : sel.language), f && f.revision ? 'last changed r' + f.revision : '',
          this.indexedRevision() !== null ? 'indexed r' + this.indexedRevision() : ''].filter(Boolean).join(' · ');
      });
      this.hitLabel = ko.pureComputed(() => (this.selected() ? 'Code of ' + this.selected().path : 'Code viewer'));
      this.copyHitPath = () => {
        const sel = this.selected();
        if (sel) {
          ui.copy(sel.path).then(() => toast.success('Path copied.')).catch(() => toast.error('The path could not be copied. Select it and copy it by hand.'));
        }
      };
      this.showInExplore = () => {
        const sel = this.selected();
        if (sel) {
          this.tab('explore');
          this.openFile(sel.path, sel.startLine ? { from: sel.startLine, to: sel.endLine, source: 'search' } : {});
          focusLater('#fileCode');
        }
      };

      // ---------- Map: the modernization scan as four views ----------
      this.mapView = ko.observable('apis');
      this.mapFilter = ko.observable('');
      this.mapModule = ko.observable('');
      const screenNames = ko.pureComputed(() => {
        const names = {};
        (this.inventory() ? this.inventory().screens : []).forEach((s) => { names[s.id] = s; });
        return names;
      });
      const textOk = (text) => {
        const q = this.mapFilter().trim().toLowerCase();
        return !q || text.toLowerCase().indexOf(q) >= 0;
      };
      const moduleOk = (screenIds, path) => {
        const m = this.mapModule();
        return !m || screenIds.some((id) => (screenNames()[id] || {}).module === m) || (path || '').indexOf('/' + m + '/') >= 0;
      };
      const endpointOf = (key) => (this.inventory() ? this.inventory().endpoints.find((e) => e.method + ' ' + e.path === key) : null);
      const openEndpoint = (e) => () => { this.tab('explore'); this.openFile(e.file, { find: e.javaMethod, source: 'map' }); };
      const openScreenFile = (path) => () => { if (path) { this.tab('explore'); this.openFile(path); } };
      const mapAll = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return { apis: [], screens: [], calls: [], diagram: [] };
        }
        const label = (id) => (screenNames()[id] ? screenNames()[id].name : baseName(id));
        const diagram = [];
        inv.calls.forEach((c) => c.screens.forEach((s) => {
          const e = c.endpoint ? endpointOf(c.endpoint) : null;
          const sc = screenNames()[s];
          diagram.push({ screen: label(s), screenId: s, screenFile: sc && sc.files[0] ? sc.files[0] : '', call: c.method + ' ' + c.path,
            target: e ? e.javaClass + '.' + e.javaMethod + '()' : (c.endpoint || 'Host or OBDX product (not in this code)'), inCode: !!e,
            openScreen: openScreenFile(sc && sc.files[0]), openTarget: e ? openEndpoint(e) : null });
        }));
        return {
          apis: inv.endpoints.map((e) => ({ method: e.method, methodCss: methodCss(e.method), path: e.path, code: e.javaClass + '.' + e.javaMethod + '()', file: e.file,
            owner: e.product ? 'OBDX product' : 'Bank', usedBy: e.usedBy.map(label).join(', ') || '–', screenIds: e.usedBy, open: openEndpoint(e) })),
          screens: inv.screens.map((s) => ({ name: s.name, id: s.id, module: s.module, kind: s.kind, fields: s.fields.length, files: s.files, first: s.files[0] || '',
            fileNames: s.files.map(baseName).join(', '), open: openScreenFile(s.files[0]) })),
          calls: inv.calls.map((c) => {
            const e = c.endpoint ? endpointOf(c.endpoint) : null;
            return { method: c.method, methodCss: methodCss(c.method), path: c.path, screens: c.screens.map(label).join(', '), screenIds: c.screens, inCode: !!e,
              code: e ? e.javaClass + '.' + e.javaMethod + '()' : (c.endpoint || 'Not in this code'), codeTitle: e ? e.file : 'The host or an OBDX product service serves it',
              open: e ? openEndpoint(e) : null };
          }),
          diagram: diagram
        };
      });
      this.mapEndpoints = ko.pureComputed(() => mapAll().apis.filter((e) => textOk(e.method + ' ' + e.path + ' ' + e.code + ' ' + e.usedBy) && moduleOk(e.screenIds, e.file)));
      this.mapScreens = ko.pureComputed(() => mapAll().screens.filter((s) => textOk(s.name + ' ' + s.fileNames + ' ' + s.kind) && (!this.mapModule() || s.module === this.mapModule())));
      this.mapCalls = ko.pureComputed(() => mapAll().calls.filter((c) => textOk(c.method + ' ' + c.path + ' ' + c.screens + ' ' + c.code) && moduleOk(c.screenIds, '')));
      this.mapDiagram = ko.pureComputed(() => mapAll().diagram.filter((d) => textOk(d.screen + ' ' + d.call + ' ' + d.target) && moduleOk([d.screenId], '')));
      this.mapViews = ko.pureComputed(() => [
        { value: 'apis', label: 'APIs ' + mapAll().apis.length }, { value: 'screens', label: 'Screens ' + mapAll().screens.length },
        { value: 'calls', label: 'Service calls ' + mapAll().calls.length }, { value: 'diagram', label: 'Diagram' }
      ]);
      this.mapHint = ko.pureComputed(() => ({ apis: 'Filter by path or implementation', screens: 'Filter by screen or file', calls: 'Filter by path or screen', diagram: 'Filter by screen, service or class' }[this.mapView()]));
      this.mapModules = ko.pureComputed(() => [{ value: '', label: 'All modules' }].concat((this.inventory() ? this.inventory().modules : []).map((m) => ({ value: m.name, label: m.name }))));
      this.mapScan = ko.pureComputed(() => {
        const inv = this.inventory();
        return inv ? 'From the modernization scan of ' + ui.when(inv.scannedAt) + (inv.revision !== null && inv.revision !== undefined ? ', r' + inv.revision : '') : '';
      });
      this.mapFoot = ko.pureComputed(() => ({
        apis: this.mapEndpoints().length + ' of ' + mapAll().apis.length + ' · an implementation opens the file on Explore, at its lines',
        screens: this.mapScreens().length + ' of ' + plural(mapAll().screens.length, 'screen') + ' · a screen opens its first file on Explore',
        calls: this.mapCalls().length + ' of ' + plural(mapAll().calls.length, 'call') + ' · “Not in this code” means the host or OBDX product serves it',
        diagram: this.mapDiagram().length + ' of ' + plural(mapAll().diagram.length, 'path') + ' · filter by module or screen to follow one flow; a box opens its file on Explore'
      }));
      this.openModernization = (event) => {
        if (event && event.preventDefault) {
          event.preventDefault();
        }
        navigate('modernization');
      };

      // ---------- Business rules: the requirements' rules and the code their screens link ----------
      this.onlyOpenFile = ko.observable(false);
      this.onlyOpenFileInput = ui.checked(this.onlyOpenFile);
      const allBizRules = ko.pureComputed(() => {
        const list = [];
        requirements().forEach((r) => {
          const spec = r.spec;
          if (!spec || !spec.businessRules) {
            return;
          }
          spec.businessRules.forEach((rule) => {
            const files = [];
            (spec.screens || []).filter((s) => (rule.screens || []).indexOf(s.name) >= 0 || !(rule.screens || []).length)
              .forEach((s) => (s.relatedCode || []).forEach((p) => { if (files.indexOf(p) < 0) { files.push(p); } }));
            list.push({
              id: rule.id, description: rule.description, requirement: r.title, screens: (rule.screens || []).join(', ') || 'All screens', paths: files,
              files: files.map((p) => ({ name: baseName(p), path: p, open: () => { this.tab('explore'); this.openFile(p); } }))
            });
          });
        });
        return list;
      });
      this.bizRules = ko.pureComputed(() => {
        const f = this.file();
        return allBizRules().filter((r) => !this.onlyOpenFile() || (f && r.paths.indexOf(f.path) >= 0));
      });

      // ---------- Ask about the code: the one AI panel ----------
      // The context: the workspace, the index, the quick check rules, the open file with line numbers (and the files that
      // mention it) and the current search results. Nothing is sent before a question.
      const searchContext = (limit, chars) => {
        if (!this.results().length) {
          return '';
        }
        return 'Code search for "' + this.searched() + '":\n' + this.results().slice(0, limit).map((r) => '--- ' + r.path + ' lines ' + r.startLine + '-' + r.endLine
          + ' (' + r.kind + ' ' + (r.symbol || '') + ')\n' + (r.snippet || '').slice(0, chars)).join('\n');
      };
      const numberedFile = (f, chars) => {
        let numbered = '';
        const rows = sourceLines(f);
        for (let i = 0; i < rows.length && numbered.length < chars; i++) {
          numbered += (rows[i].n ? rows[i].n + '| ' : '') + rows[i].text + '\n';
        }
        return numbered.slice(0, chars);
      };
      this.ai = assistant.create(() => {
        const w = this.workspace();
        if (!w) {
          return '';
        }
        const s = this.indexStatus();
        const f = this.file();
        const lines = ['Workspace: ' + w.name + ' (' + w.bankName + ', OBDX ' + w.obdxVersion + '), SVN ' + (w.svnUrl || 'not set')];
        if (s) {
          lines.push('Index: ' + s.files + ' files, ' + s.chunks + ' searchable pieces, revision ' + s.indexedRevision + ', files by language: ' + JSON.stringify(s.filesByLanguage));
        }
        lines.push('Quick check rules: ' + this.checkRules().map((r) => r.title + ' (' + r.severity + (r.enabled ? '' : ', off') + ')').join('; ').slice(0, 1200));
        const both = !!f && this.results().length > 0;
        if (f) {
          const users = this.usedBy() && this.usedBy().length ? '\nFiles that mention it: ' + this.usedBy().map((u) => u.path).join(', ') : '';
          lines.push('Open file ' + f.path + ' (' + f.language + ', ' + (f.lines || 'some') + ' lines), each line with its number:\n' + numberedFile(f, both ? 10000 : AI_CHARS) + users);
        }
        if (this.results().length) {
          lines.push(searchContext(both ? 4 : 6, both ? 1000 : 1500));
        }
        return lines.join('\n');
      }, []);
      // The chips above the answers: exactly what the context above sends
      this.aiContext = ko.pureComputed(() => {
        const w = this.workspace();
        const f = this.file();
        const s = this.indexStatus();
        const chips = [];
        if (!w) {
          return chips;
        }
        if (f) {
          chips.push({ label: baseName(f.path), title: f.path + ((f.content || '').length > AI_CHARS ? ' (the first 15,000 characters, with line numbers)' : ' (with line numbers)') + (f.partial ? ' (indexed pieces only)' : '') });
        }
        if (s && s.indexedRevision !== null) {
          chips.push({ label: 'the index (r' + s.indexedRevision + ')', title: s.files + ' files, ' + s.chunks + ' searchable pieces, and the quick check rules' });
        }
        if (f && this.usedBy() && this.usedBy().length) {
          chips.push({ label: plural(this.usedBy().length, 'file') + ' that mention it', title: this.usedBy().map((u) => u.path).join(', ') });
        }
        if (this.results().length) {
          chips.push({ label: plural(Math.min(this.results().length, f ? 4 : 6), 'search result'), title: 'The top results for "' + this.searched() + '"' });
        }
        return chips;
      });
      this.askHint = ko.pureComputed(() => (this.file() ? 'Pick a quick action for ' + this.fileName() + ', or ask a question. Answers cite the lines they use.'
        : 'Open a file for the quick actions, or ask about the code.'));
      const ask = (question, label) => {
        const f = this.file();
        this.ai.ask(question + CITE_ASK, label || question);
        // The question remembers the file it was about, so its answer's cited lines open there
        const list = this.ai.messages();
        const q = list[list.length - 1];
        if (q && q.mine) {
          q.about = f ? { path: f.path, lineCount: !f.partial && !f.truncated ? (f.lines || sourceLines(f).length) : 0 } : null;
        }
      };
      this.askSend = () => {
        const q = (this.ai.input() || '').trim();
        if (!q || this.ai.busy()) {
          return;
        }
        this.ai.input('');
        ask(q, q);
      };
      const QUICK = {
        summary: { label: 'Summary', prompt: 'Summarize this file in one short paragraph: what it does, what it uses and what it returns.' },
        explain: { label: 'Explain', prompt: 'Explain the business logic of this file step by step, in plain words.' },
        usage: { label: 'Find usage', prompt: 'Where and how is this file used? Use the list of files that mention it when it is given.' },
        suggest: { label: 'Suggest changes', prompt: 'Suggest improvements, risks and good places to change this file, briefly.' },
        tests: { label: 'Generate unit tests', prompt: 'Write unit tests for this file: the cases worth testing, then the test code in the test framework its language usually uses (JUnit for Java, Jasmine for JavaScript).' }
      };
      this.lastQuick = ko.observable('');
      const runQuick = (key) => {
        const f = this.file();
        if (!f || this.ai.busy()) {
          return;
        }
        this.lastQuick(key);
        const go = key === 'usage' ? loadUsedBy() : Promise.resolve();
        go.then(() => ask(QUICK[key].prompt, QUICK[key].label + ': ' + baseName(f.path)));
      };
      this.quickActions = Object.keys(QUICK).map((key) => ({
        id: 'quick-' + key, label: QUICK[key].label, title: QUICK[key].label + ' for the open file',
        pressed: ko.pureComputed(() => (this.lastQuick() === key ? 'true' : 'false')),
        run: () => runQuick(key)
      }));
      this.newChat = () => { this.ai.clear(); this.lastQuick(''); focusLater('#askInput input'); };
      this.explainOpenFile = () => {
        this.tab('explore');
        this.sideOpen(true);
        runQuick('explain');
        focusLater('#askPanel');
      };
      this.askAboutResults = () => {
        if (!this.results().length) {
          return;
        }
        this.tab('explore');
        this.sideOpen(true);
        ask('Explain these code search results for "' + this.searched() + '": what each one does and how they fit together.', 'Explain the search results for “' + this.searched() + '”');
        focusLater('#askPanel');
      };
      // Cited lines open in Explore's viewer, marked
      this.showCited = (path, from, to) => {
        this.tab('explore');
        this.openFile(path, { from: from, to: to, source: 'ai' });
        focusLater('#fileCode');
      };
      const citationsOf = (text, about) => {
        if (!about || !about.path) {
          return [];
        }
        const clean = String(text || '').replace(/\[\d+\]/g, '');
        const seen = {};
        const list = [];
        let m;
        CITE.lastIndex = 0;
        while ((m = CITE.exec(clean)) !== null && list.length < 20) {
          const from = Number(m[1]);
          const to = Math.max(from, Number(m[2] || m[1]));
          const key = from + '-' + to;
          if (from > 0 && !seen[key]) {
            seen[key] = true;
            // Lines past the end of the file are not in it: flagged, with nothing to open; a range running past it ends there
            const outside = about.lineCount > 0 && from > about.lineCount;
            const end = about.lineCount > 0 ? Math.min(to, about.lineCount) : to;
            const label = from === end ? String(from) : from + '–' + end;
            list.push({ from: from, to: end, outside: outside, label: label,
              title: 'Show ' + linesText(from, end) + ' of ' + baseName(about.path) + ' in the viewer',
              note: outside ? 'The file has ' + plural(about.lineCount, 'line') + ': check this part of the answer.' : '',
              show: () => this.showCited(about.path, from, end) });
          }
        }
        return list.sort((x, y) => x.from - y.from);
      };
      const manualsOf = (sources) => (sources || []).map((src) => ({
        // A note first: the bank's own notes are bank too (kind NOTE, as the OBDX Library labels them)
        n: '[' + src.n + ']', kind: /^note$/i.test(src.kind || '') || src.noteId ? 'Note' : src.bank ? 'Bank document' : 'Oracle manual',
        title: src.title + (src.heading ? ': ' + src.heading : ''),
        where: (src.obdxVersion ? 'OBDX ' + src.obdxVersion : '') + (src.pageFrom ? ', pages ' + src.pageFrom + (src.pageTo && src.pageTo !== src.pageFrom ? '-' + src.pageTo : '') : '')
      }));
      this.askItems = ko.pureComputed(() => {
        let about = null;
        return this.ai.messages().map((m) => {
          if (m.mine) {
            about = m.about || null;
            return { mine: true, failed: false, answer: false, text: m.text };
          }
          if (m.failed) {
            return { mine: false, failed: true, answer: false, text: m.text };
          }
          const asked = about;
          const citations = ko.pureComputed(() => citationsOf(ko.unwrap(m.text), asked));
          return {
            mine: false, failed: false, answer: true, text: m.text, sources: m.sources || ko.observable([]),
            css: ko.pureComputed(() => 'factory-cd-answer-text' + (String(ko.unwrap(m.css)).indexOf('error') >= 0 ? ' is-error' : '')),
            meta: ko.pureComputed(() => ko.unwrap(m.meta) || ''),
            citations: citations,
            noCites: ko.pureComputed(() => !!asked && citations().length === 0 && String(ko.unwrap(m.css)).indexOf('writing') < 0),
            manuals: ko.pureComputed(() => manualsOf(ko.unwrap(m.sources)))
          };
        });
      });

      // ---------- Index: what needs attention, as errors, warnings and information ----------
      const showRules = (statusKey) => () => { this.clearRuleFilters(); this.ruleStatusFilter(statusKey); this.tab('checks'); };
      const toSettings = () => this.tab('settings');
      this.healthItems = ko.pureComputed(() => {
        const items = [];
        // lead and detail: the problem bar's words (bold lead, then the detail)
        const add = (level, id, text, action, lead, detail) => items.push({ level: level, id: id, text: text, action: action || null, lead: lead || '', detail: detail || text });
        const s = this.indexStatus();
        const last = jobs()[0];
        const manage = this.canManage();
        const reindex = manage && !this.importRunning() ? { label: 'Reindex', run: this.startImport } : null;
        if (this.importRunning()) {
          add('info', 'healthImporting', 'An import is running. Search shows the previous index until it finishes.');
        }
        if (last && last.status === 'FAILED') {
          add('error', 'healthImportFailed', 'The last import failed' + (last.message ? ': ' + last.message : '.'), reindex,
            'The last import failed.', (last.message || '') + (manage ? ' Reindex to try again.' : ' Ask a developer or lead to reindex.'));
        }
        if (s && s.indexedRevision === null && !this.importRunning()) {
          add('warning', 'healthNotImported', 'The code has not been imported yet, so search and checks have nothing to work on.', reindex,
            'Not imported yet.', 'Search, the AI and the checks have nothing to work on until the code is imported.');
        }
        const head = this.headCheck();
        if (head && !head.ok) {
          add('error', 'healthRepository', 'The repository could not be read (' + head.at + '): ' + head.error, { label: 'Open settings', run: toSettings },
            'The repository could not be read.', head.error + ' Check the SVN settings.');
        } else if (head && this.behind() > 0) {
          add('warning', 'healthStale', 'The index is ' + plural(this.behind(), 'revision') + ' behind: the repository is at r' + head.revision
            + ', the index at r' + this.indexedRevision() + ' (checked ' + head.at + '). Reindex to search the latest code.', reindex,
          plural(this.behind(), 'revision') + ' behind.', 'The repository is at r' + head.revision + ', the index at r' + this.indexedRevision() + '. Search and the AI read the older code until you reindex.');
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
        const warnedRules = ratedRules().filter((r) => r.enabled && r.status.key === 'WARNING').length;
        if (this.failedRules()) {
          add('error', 'healthRulesFailed', plural(this.failedRules(), 'quick check rule') + ' found errors in generated files.', { label: 'Show rules', run: showRules('FAILED') },
            plural(this.failedRules(), 'quick check rule') + ' found errors', 'in files the factory generated.');
        }
        if (warnedRules) {
          add('warning', 'healthRulesWarned', plural(warnedRules, 'quick check rule') + ' found warnings in generated files.', { label: 'Show rules', run: showRules('WARNING') },
            plural(warnedRules, 'quick check rule') + ' found warnings', 'in files the factory generated.');
        }
        if (this.targetWarning()) {
          add('warning', 'healthTarget', this.targetMessage(), { label: 'Open settings', run: toSettings }, 'The UI target\'s app is not in the code.', this.targetMessage());
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
      // The one problem bar: the most important error or warning, with its fix; nothing when all is fine
      this.problem = ko.pureComputed(() => {
        const top = this.healthItems().find((i) => i.level === 'error' || i.level === 'warning');
        return top ? { css: 'factory-cd-problem is-' + top.level, lead: top.lead, detail: top.detail, action: top.action, id: top.id } : null;
      });

      // ---------- Loading a workspace ----------
      const loadWorkspace = (id) => {
        this.errorMessage('');
        this.svnMessage('');
        this.results([]);
        this.searched('');
        this.searchNote('');
        this.searchError('');
        this.closeHit();
        this.file(null);
        this.marks(null);
        this.fileError('');
        this.usedBy(null);
        this.folder('');
        this.viewMode('file');
        open({});
        this.allFiles([]);
        this.inventory(null);
        requirements([]);
        this.ai.clear();
        this.lastQuick('');
        cache.clear();
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
          this.svnUsername(workspace.svnUsername || '');
          this.svnPassword('');
          this.svnAdvancedOpen(!!(workspace.svnUsername || workspace.svnPasswordSet));
          this.jenkinsMessage('');
          this.jenkinsWarnings([]);
          api.get('workspaces/' + id + '/inventory').then((inv) => { if (id === this.workspaceId()) { this.inventory(inv || null); } }).catch(() => null);
          api.get('workspaces/' + id + '/requirements').then((list) => Promise.all(list.map((r) => api.get('requirements/' + r.id).catch(() => null))))
            .then((list) => { if (id === this.workspaceId()) { requirements(list.filter(Boolean)); } }).catch(() => null);
          return Promise.all([refreshImports(), loadFiles(id, !pendingFile), api.get('workspaces/' + id + '/jenkins').then(showJenkins),
            api.get('workspaces/' + id + '/checks').then(showChecks),
            api.get('targets').then((list) => {
              packs(list);
              this.targets(list.map((p) => ({ value: p.id, label: p.title })));
              return api.get('workspaces/' + id + '/target');
            }).then(showTarget)]);
        }).catch(showError);
      };

      // Requests from other pages: a search (the top bar, the palette, Project Profile), a file at its lines
      // (Modernization, old links), a tab (Integrations, Modernization, notifications, Agent Runs)
      let pendingFile = null;
      const takeRequests = () => {
        const search = pageRequests.codeSearch();
        pageRequests.codeSearch('');
        const wantedFile = pageRequests.codeFile();
        pageRequests.codeFile(null);
        const wantedTab = pageRequests.codeTab();
        pageRequests.codeTab(null);
        if (search) {
          this.tab('search');
          this.query(search);
        } else if (wantedFile) {
          this.tab('explore');
        } else if (!wantedTab || !pickTab(wantedTab)) {
          pickTab(new URLSearchParams(window.location.search).get('tab') || 'explore');
        }
        return { search: search, file: wantedFile };
      };
      const openRequestedFile = (wanted) => {
        const line = Math.max(1, wanted.startLine || 1);
        return this.openFile(wanted.path, wanted.startLine ? { from: line, to: Math.max(line, wanted.endLine || line), source: 'link' } : {});
      };
      const subscriptions = [];
      this.connected = () => {
        accUtils.announce('Code page loaded.');
        dashboard.load();
        document.title = 'Code';
        // Folders on the factory's computer are for administrators only (the server refuses everyone else)
        if (session.isAdmin()) {
          api.get('sources/local').then((local) => {
            this.localEnabled(!!local.enabled);
            if (local.enabled && /^file:/.test(this.svnUrl())) {
              this.folderPath(urlToFolder(this.svnUrl()));
              this.sourceKind('folder');
            }
          }).catch(() => null);
        }
        document.addEventListener('keydown', escape);
        const requested = takeRequests();
        pendingFile = requested.file;
        subscriptions.push(this.workspaceId.subscribe(loadWorkspace));
        const before = this.workspaceId();
        // If loading the list changed the selection, the subscription has already loaded the workspace.
        workspaceSelection.load().then(() => (this.workspaceId() === before ? loadWorkspace(before) : null))
          .then(() => {
            if (requested.search) {
              searchFor(requested.search);
            }
            if (pendingFile) {
              const wanted = pendingFile;
              pendingFile = null;
              openRequestedFile(wanted);
            }
          }).catch(showError);
        // Requests while this page is open (the top bar's search, the palette's G K)
        subscriptions.push(pageRequests.codeSearch.subscribe((text) => {
          if (text) {
            pageRequests.codeSearch('');
            searchFor(text);
          }
        }));
        subscriptions.push(pageRequests.codeTab.subscribe((t) => {
          if (t) {
            pageRequests.codeTab(null);
            pickTab(t);
          }
        }));
        subscriptions.push(pageRequests.codeFile.subscribe((f) => {
          if (f) {
            pageRequests.codeFile(null);
            this.tab('explore');
            openRequestedFile(f);
          }
        }));
        // The tab in the address from the start (the subscription only follows changes); an old knowledge link says code
        const params = new URLSearchParams(window.location.search);
        if (params.get('ojr') === 'knowledge') {
          params.set('ojr', 'code');
        }
        if (params.get('ojr') === 'code' && params.get('tab') !== this.tab() && window.history.replaceState) {
          params.set('tab', this.tab());
          window.history.replaceState(window.history.state, '', window.location.pathname + '?' + params.toString());
        }
      };

      this.disconnected = () => {
        clearTimeout(pollTimer);
        clearTimeout(renderTimer);
        document.removeEventListener('keydown', escape);
        subscriptions.splice(0).forEach((s) => s.dispose());
        this.fileMenu.close();
        // The router keeps other parameters on the next page's address, so the tab goes when the page does
        window.setTimeout(() => {
          const params = new URLSearchParams(window.location.search);
          if (params.get('ojr') !== 'code' && params.has('tab') && window.history.replaceState) {
            params.delete('tab');
            window.history.replaceState(window.history.state, '', window.location.pathname + '?' + params.toString());
          }
        }, 0);
      };
    }

    return CodeViewModel;
  }
);
