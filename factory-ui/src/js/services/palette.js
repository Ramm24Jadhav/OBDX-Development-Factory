/*
 * The command palette (Ctrl or Cmd K, or "/"): one search across pages, actions, workspaces, requirements and changes,
 * plus "search the code for ...". Arrow keys move, Enter runs, Escape closes. Prefixes narrow it: ">" actions,
 * "@" workspaces, "#" requirements and changes. Keyboard shortcuts: "g" then a letter opens a page, "?" lists them.
 */
define(['knockout', './dashboard', './workspaceSelection', './pageRequests', './preferences', './session'],
  function (ko, dashboard, workspaceSelection, pageRequests, preferences, session) {
    // "g" then the letter opens the page (Linear-style two-key shortcuts)
    const GO = { o: 'overview', w: 'workspaces', c: 'code', p: 'profile', r: 'requirements', d: 'designer', h: 'changes', b: 'build',
      m: 'models', a: 'agents', k: 'knowledge', i: 'impact', x: 'modernization', n: 'notifications', s: 'account', y: 'design' };
    const goKey = Object.keys(GO).reduce((map, k) => { map[GO[k]] = k; return map; }, {});

    const open = ko.observable(false);
    const query = ko.observable('');
    const active = ko.observable(0);
    const helpOpen = ko.observable(false);
    let pages = [];
    let navigate = () => null;
    let opener = null;

    // Subsequence match with a score: start of the text and of words count most, gaps cost
    function score(text, q) {
      if (!q) { return 1; }
      const t = text.toLowerCase();
      const at = t.indexOf(q);
      if (at === 0) { return 100 - t.length / 100; }
      if (at > 0) { return (/[\s(·\-_/]/.test(t.charAt(at - 1)) ? 80 : 60) - at / 10; }
      let i = 0;
      let s = 30;
      for (const ch of q) {
        const j = t.indexOf(ch, i);
        if (j < 0) { return 0; }
        s -= (j - i) * 3;
        i = j + 1;
      }
      // Loose matches (letters far apart) do not count
      return s >= 12 ? s : 0;
    }

    const go = (page, workspaceId) => () => {
      if (workspaceId) { workspaceSelection.selectedId(workspaceId); }
      navigate(page);
    };

    function allItems() {
      const items = [];
      const q = query().trim();
      const themeDark = preferences.theme() && preferences.isDark();
      items.push(
        { group: 'Actions', label: 'New requirement', hint: 'Describe a change or upload a document', icon: 'plus', run: go('requirements') },
        { group: 'Actions', label: 'Add a workspace', hint: 'From a folder or an SVN URL', icon: 'folder', run: go('workspaces') },
        { group: 'Actions', label: themeDark ? 'Use the light theme' : 'Use the dark theme', hint: 'Theme', icon: themeDark ? 'sun' : 'moon', run: () => preferences.toggleTheme() },
        { group: 'Actions', label: 'Keyboard shortcuts', hint: 'Show every shortcut', icon: 'help', keys: '?', run: () => helpOpen(true) },
        { group: 'Actions', label: 'Sign out', hint: 'End this session', icon: 'arrow', run: () => session.logout() }
      );
      pages.forEach((p) => items.push({ group: 'Pages', label: p.label, hint: 'Go to page', icon: p.icon || 'arrow', keys: goKey[p.path] ? 'G ' + goKey[p.path].toUpperCase() : '', run: go(p.path) }));
      workspaceSelection.options().forEach((o) => items.push({
        group: 'Workspaces', label: o.label, hint: o.value === workspaceSelection.selectedId() ? 'Current workspace' : 'Switch to this workspace', icon: 'bank',
        run: () => workspaceSelection.selectedId(o.value)
      }));
      (dashboard.data() || []).forEach((entry) => {
        const ws = entry.workspace;
        (entry.requirements || []).forEach((r) => items.push({
          group: 'Requirements', label: r.title || 'Requirement', hint: ws.name + ' · ' + String(r.status || '').toLowerCase().replace(/_/g, ' '), icon: 'list',
          run: () => { pageRequests.requirement(r.id); go('requirements', ws.id)(); }
        }));
        (entry.changes || []).forEach((c) => items.push({
          group: 'Changes', label: c.title || 'Change', hint: ws.name + ' · ' + String(c.status || '').toLowerCase().replace(/_/g, ' '), icon: 'branch',
          run: () => { pageRequests.change(c.id); go('changes', ws.id)(); }
        }));
      });
      if (q && q.charAt(0) !== '>' && q.charAt(0) !== '@' && q.charAt(0) !== '#') {
        items.push({ group: 'Code', label: 'Search the code for "' + q + '"', hint: 'In the current workspace', icon: 'search', always: true,
          run: () => { pageRequests.codeSearch(q); navigate('code'); } });
      }
      return items;
    }

    const ORDER = ['Code', 'Actions', 'Pages', 'Workspaces', 'Requirements', 'Changes'];
    const results = ko.pureComputed(() => {
      let q = query().trim().toLowerCase();
      let only = null;
      if (q.charAt(0) === '>') { only = ['Actions']; q = q.slice(1).trim(); }
      else if (q.charAt(0) === '@') { only = ['Workspaces']; q = q.slice(1).trim(); }
      else if (q.charAt(0) === '#') { only = ['Requirements', 'Changes']; q = q.slice(1).trim(); }
      const scored = allItems()
        .filter((it) => !only || only.indexOf(it.group) >= 0)
        .map((it) => Object.assign({}, it, { score: it.always ? 1000 : Math.max(score(it.label, q), score(it.hint || '', q) * 0.5) }))
        .filter((it) => it.score > 0);
      // Without a query, a short list: actions and pages first
      const limited = q ? scored : scored.filter((it) => ['Actions', 'Pages', 'Workspaces'].indexOf(it.group) >= 0);
      // Groups follow their best match, so typing a page's name puts that page first (Enter opens it); searching the
      // code comes first only when nothing else matches the words themselves
      const best = {};
      limited.forEach((it) => { if (!it.always) { best[it.group] = Math.max(best[it.group] || 0, it.score); } });
      const strong = Object.keys(best).some((g) => best[g] >= 60);
      best.Code = strong ? -1 : 1000;
      limited.sort((a, b) => (q ? (best[b.group] || 0) - (best[a.group] || 0) : 0)
        || (ORDER.indexOf(a.group) - ORDER.indexOf(b.group)) || (b.score - a.score));
      return limited.slice(0, 40);
    });
    // Rows with group headings, each knowing its index for the keyboard
    const rows = ko.pureComputed(() => {
      const list = results();
      const out = [];
      let last = null;
      list.forEach((it, i) => {
        if (it.group !== last) { out.push({ heading: true, label: it.group }); last = it.group; }
        out.push(Object.assign({}, it, {
          heading: false, index: i, id: 'fx-cmd-' + i,
          css: 'fx-cmd-item' + (i === active() ? ' is-active' : ''),
          iconCss: 'factory-nav-icon factory-ico-' + it.icon,
          pick: () => runAt(i),
          hover: () => active(i)
        }));
      });
      return out;
    });
    const activeId = ko.pureComputed(() => (results().length ? 'fx-cmd-' + Math.min(active(), results().length - 1) : null));

    function show(initial) {
      opener = document.activeElement;
      query(initial || '');
      active(0);
      open(true);
      dashboard.load();
      window.setTimeout(() => {
        const input = document.getElementById('fxCommandInput');
        if (input) { input.value = query(); input.focus(); input.select(); }
      }, 0);
    }
    function close() {
      open(false);
      if (opener && typeof opener.focus === 'function' && document.body.contains(opener)) { opener.focus(); }
    }
    function runAt(i) {
      const it = results()[i];
      if (!it) { return; }
      open(false);
      it.run();
    }
    function scrollActive() {
      window.setTimeout(() => {
        const el = document.querySelector('.fx-cmd-item.is-active');
        if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'nearest' }); }
      }, 0);
    }
    const onInput = (event) => { query(event.target.value); active(0); };
    const onKey = (event) => {
      const n = results().length;
      if (event.key === 'ArrowDown') { event.preventDefault(); active(n ? (active() + 1) % n : 0); scrollActive(); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); active(n ? (active() - 1 + n) % n : 0); scrollActive(); }
      else if (event.key === 'Enter') { event.preventDefault(); runAt(active()); }
      else if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab') { event.preventDefault(); }
      return true;
    };
    const onBackdrop = (event) => { if (event.target === event.currentTarget) { close(); } };

    // Global keys. Typing in a field never triggers the single-letter shortcuts.
    let pendingG = 0;
    const typing = (el) => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName) || (el.closest && el.closest('fx-input, fx-textarea, fx-select, fx-date')));
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
        if (!session.user()) { return; }
        event.preventDefault();
        if (open()) { close(); } else { show(''); }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || !session.user() || open() || typing(event.target)) { return; }
      if (event.key === 'Escape' && helpOpen()) { helpOpen(false); return; }
      if (event.key === '/') { event.preventDefault(); show(''); return; }
      if (event.key === '?') { event.preventDefault(); helpOpen(!helpOpen()); return; }
      const key = event.key.toLowerCase();
      if (pendingG && Date.now() - pendingG < 1200 && GO[key]) {
        event.preventDefault();
        pendingG = 0;
        navigate(GO[key]);
        return;
      }
      pendingG = key === 'g' ? Date.now() : 0;
    });

    const shortcuts = [{ keys: 'Ctrl K  or  /', label: 'Open the command palette' }, { keys: '?', label: 'Show these shortcuts' },
      { keys: 'Esc', label: 'Close a menu, dialog or the palette' }, { keys: '↑ ↓  Enter', label: 'Move and choose in lists and menus' }]
      .concat(Object.keys(GO).map((k) => ({ keys: 'G then ' + k.toUpperCase(), label: 'Go to ' + GO[k] })));

    return {
      open: open, query: query, rows: rows, results: results, activeId: activeId, helpOpen: helpOpen, shortcuts: shortcuts,
      show: show, close: close, onInput: onInput, onKey: onKey, onBackdrop: onBackdrop,
      closeHelp: () => helpOpen(false),
      /** Called by the app controller with the sidebar pages and its router. */
      init: (pageList, navigateTo) => { pages = pageList; navigate = navigateTo; }
    };
  });
