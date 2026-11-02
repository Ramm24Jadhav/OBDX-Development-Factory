/*
 * AI Prompt & Template Library page: the instructions the factory gives the model. The version pack's recipes (their
 * guidance is part of every code generation prompt for matching files) with their templates, template variables and
 * reference examples, and the factory's built-in tasks. Usage counts the planned files of the workspace's changes that
 * each recipe applies to. Recipes are changed in the team's version pack files (FACTORY_PACKS_DIR), not on this page,
 * and have no review or retirement steps, so nothing is under review or deprecated.
 * Governance view: editable templates (the version pack recipes) and protected system prompts (the factory's built-in
 * tasks, part of its code) show apart, each with its purpose, target agent or task, version, the model it runs on,
 * approval and lifecycle as far as the factory records them. A recipe compares with the same recipe in the other OBDX
 * version's pack; the Library's answer task links to its evaluation (administrators). Text that looks like a secret
 * (password, token, key) is masked wherever a prompt is shown or copied.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/updates', '../services/ui', '../services/toast',
        '../services/preferences', '../services/session', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, updates, ui, toast, preferences, session) {
    // Badges (design system .fx-badge): statuses carry a dot, categories are plain labels
    const BADGE = { green: 'success', amber: 'warning', red: 'danger', blue: 'info', violet: 'violet' };
    const badgeCss = (tone) => 'fx-badge' + (BADGE[tone] ? ' fx-badge--' + BADGE[tone] : '');
    const pill = (text, tone) => ({ text: text, css: badgeCss(tone) });
    /** The current value of a design token, for the preview frame (its own document cannot read the page's variables). */
    const token = (name, fallback) => (window.getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback;
    // Values that look like secrets are never shown: key = value pairs and bearer tokens become a mask
    const SECRET = /((?:password|passwd|pwd|secret|token|api[_-]?key|client[_-]?secret|access[_-]?key)["']?\s*[:=]\s*["']?)([^\s"',;]{4,})/gi;
    const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/-]{12,}=*/g;
    const mask = (text) => String(text || '').replace(SECRET, (m, k) => k + '•••• (hidden)').replace(BEARER, (m, k) => k + '•••• (hidden)');
    const masked = (text) => mask(text) !== String(text || '');
    // A file of the bank's pack folder by its name only: the folder is a path on the factory's server
    const sourceName = (source) => (!source || /^packs\//.test(source) ? source : 'bank pack folder: ' + String(source).replace(/\\/g, '/').split('/').pop());
    // The agent or task each kind of prompt serves (the names Agent Runs uses)
    const AGENT = { recipe: 'Code Generator' };
    const CATEGORY = { ui: 'UI Generation', service: 'Code Generation', integration: 'API Generation', data: 'Database Script', test: 'Test Generation', config: 'Configuration' };
    const TONE = { 'UI Generation': 'blue', 'Code Generation': 'blue', 'API Generation': 'violet', 'Database Script': 'amber', 'Test Generation': 'red', Configuration: 'grey', 'Built-in Task': 'green', 'Business Logic': 'violet' };
    const BUILT_IN = [
      { title: 'Draft a specification', category: 'Built-in Task', when: 'A BRD, FSD or description is added on the Requirements page', guidance: 'Reads the document and drafts screens, fields, business rules, roles, APIs, host interactions, messages and open questions as JSON.' },
      { title: 'Update a specification with answers', category: 'Built-in Task', when: 'Open questions are answered', guidance: 'Folds the answers into the specification and records them as decisions.' },
      { title: 'Impact analysis and change plan', category: 'Built-in Task', when: 'A change is planned from an approved requirement', guidance: 'Uses the specification, approved screens, Project Profile and code search to plan the files to create or modify, with risks.' },
      { title: 'Generate one file', category: 'Built-in Task', when: 'The plan is approved', guidance: 'Writes each planned file following the recipe guidance, templates and reference examples; quick check errors go back for a fix.' },
      { title: 'Change a screen with AI', category: 'Built-in Task', when: 'Ask AI in the designer', guidance: 'Changes the Screen Model (or the selected component) as the instruction says.' },
      { title: 'Import a screen design', category: 'Built-in Task', when: 'An image, PDF or Figma frame is imported in the designer', guidance: 'Reads the design and turns it into a Screen Model.' },
      { title: 'Make a custom component', category: 'Built-in Task', when: 'A component is made in the designer', guidance: 'Writes the component HTML, CSS and script from a description or an image.' },
      { title: 'Fix build errors', category: 'Built-in Task', when: 'A Jenkins build of a change fails', guidance: 'Sends the build errors of a file back to the model to fix, for a few rounds.' },
      { title: 'Answer from the OBDX Library', category: 'Built-in Task', when: 'A question on the OBDX Library or an AI Assistant panel', guidance: 'Answers from the manuals, bank documents and notes the search found, citing them as [n], and says when they do not cover the question.', evaluation: true },
      { title: 'Improve a question', category: 'Built-in Task', when: 'Improve My Question on the OBDX Library', guidance: 'Rewrites the question precisely, or says what to clarify first; nothing is answered.' }
    ];
    const BUILT_IN_AGENT = ['Requirements Agent', 'Requirements Agent', 'Analysis Agent', 'Code Generator', 'UI Agent', 'UI Agent', 'UI Agent', 'Debug Agent', 'OBDX Library', 'OBDX Library'];
    // What the factory adds to the recipe guidance when it asks for one file
    const USER_PROMPT = [
      'Built for each planned file when the change is generated:',
      '',
      '- The requirement\'s specification (screens, fields, business rules, APIs, messages)',
      '- The approved screen designs (Screen Model) for UI files',
      '- The planned file: its path, layer and whether it is created or modified',
      '- The current content of the file, for a modified file',
      '- The reference examples of the recipe parts, from the bank\'s own code',
      '- The file template of the part, with its <<variables>>',
      '- The Project Profile: the bank\'s conventions and standards',
      '- Quick check or build errors, when the file goes back for a fix'
    ].join('\n');
    // Simple client-side preview of an HTML view template: JET elements drawn as plain boxes, no scripts
    // The colours come from the design tokens at the time of drawing, so the preview follows the light or dark theme
    const previewCss = () => {
      const c = {
        text: token('--fx-text', '#0f172a'), muted: token('--fx-text-muted', '#475569'), faint: token('--fx-text-faint', '#94a3b8'),
        bg: token('--fx-surface-2', '#f8fafc'), surface: token('--fx-surface', '#ffffff'), border: token('--fx-border', '#e2e8f0'),
        strong: token('--fx-border-strong', '#cbd5e1'), primary: token('--fx-primary', '#4f46e5')
      };
      return 'body{font:12px/1.4 system-ui,sans-serif;margin:10px;color:' + c.text + '}*{max-width:100%}'
        + '[label-hint]{display:block;margin:6px 0;padding:6px 8px;border:1px solid ' + c.strong + ';border-radius:4px;background:' + c.surface + ';color:' + c.faint + '}'
        + '[label-hint]::before{content:attr(label-hint);display:block;font-size:10px;color:' + c.muted + '}'
        + 'oj-button{display:inline-block;margin:6px 6px 0 0;padding:6px 14px;border-radius:4px;background:' + c.primary + ';color:#fff}'
        + 'oj-bind-text::before{content:attr(value)}oj-form-layout,oj-bind-if,oj-bind-for-each{display:block}h1,h2,h3{font-size:14px;margin:6px 0}'
        // Drawn as a sample screen that fills the preview: a top bar, the fields, the action button across the bottom
        + 'html,body{height:100%}body{margin:0;background:' + c.bg + ';font-size:14px}.pv-frame{display:flex;flex-direction:column;box-sizing:border-box;height:100%;margin:0 auto;max-width:420px;border-left:1px solid ' + c.border + ';border-right:1px solid ' + c.border + ';background:' + c.surface + '}'
        + '.pv-bar{padding:12px 14px;border-bottom:1px solid ' + c.border + ';font-weight:600;color:' + c.text + '}.pv-body{display:flex;flex-direction:column;flex:1;padding:12px 14px}.pv-body>div:last-child{margin-top:auto}'
        + '.pv-body [label-hint]{margin:8px 0;padding:10px 12px;font-size:13px}.pv-body [label-hint]::before{font-size:11px;margin-bottom:4px}'
        + '.pv-body oj-button{display:block;margin:12px 0 0;padding:11px 14px;border-radius:6px;text-align:center;font-weight:600}';
    };

    function PromptsViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
      // Loading problems stay on the page; the result of an action is a toast
      const showError = (error) => this.errorMessage(error.message);
      const recipes = ko.observable(null);
      const changes = ko.observableArray([]);

      const applies = (r, i) => (!r.actions.length || r.actions.indexOf(i.action) >= 0) && (!r.layers.length || r.layers.indexOf(i.layer) >= 0);
      const usageByChange = (r) => changes().map((c) => ({ title: c.title, n: c.plan ? c.plan.items.filter((i) => applies(r, i)).length : 0 })).filter((u) => u.n > 0);
      this.items = ko.pureComputed(() => {
        const data = recipes();
        const build = updates.status() ? updates.status().build : '';
        const fromPack = data ? data.recipes.map((r) => {
          const category = CATEGORY[r.layers[0]] || (r.layers.length ? 'Code Generation' : 'Business Logic');
          const templates = r.parts.filter((p) => p.templateContent);
          const variables = [];
          templates.forEach((p) => (p.templateContent.match(/<<[^>]+>>/g) || []).forEach((v) => { if (variables.indexOf(v) < 0) { variables.push(v); } }));
          const byChange = usageByChange(r);
          const bank = !/^packs\//.test(r.source || '');
          return {
            key: r.id, title: r.title, category: category, version: data.version, versionTitle: 'OBDX ' + data.version + ' version pack', status: pill('In effect', 'green'), statusKey: 'approved',
            kind: 'template', kindText: 'Editable template', agent: AGENT.recipe, approvalShort: bank ? 'Bank pack folder' : 'Version pack',
            approval: bank ? 'Set in the bank\'s pack folder by the factory\'s administrator' : 'Shipped in the OBDX ' + data.version + ' version pack',
            lifecycle: 'In effect while it is in the pack. Draft, review and retirement are not recorded by the factory: a change is made in the pack files, reviewed in source control, and takes effect when the factory restarts.',
            hasSecret: masked(r.guidance) || r.parts.some((p) => masked(p.templateContent)),
            when: r.when || 'Files matching ' + (r.layers.join(', ') || 'any layer'), guidance: mask(r.guidance), layers: r.layers.join(', ') || 'Any', actions: r.actions.join(', ') || 'create, modify',
            source: sourceName(r.source), custom: !/^packs\//.test(r.source || ''), usage: byChange.reduce((s, u) => s + u.n, 0), byChange: byChange,
            updated: 'Pack ' + data.version, updatedTitle: 'Changes with the ' + data.version + ' version pack',
            templates: templates.map((p) => ({ name: p.name, file: p.template, content: mask(p.templateContent) })),
            parts: r.parts.map((p) => ({ name: p.name, file: p.template || 'No template: follows the reference examples' })),
            variables: variables.map((v) => ({ name: v.replace(/[<>]/g, ''), type: 'text', required: true, description: 'From the spec and screen design' })),
            examples: [].concat.apply([], r.parts.map((p) => p.examples.map((e) => ({ part: p.name, path: e.path, reason: e.reason, pinned: e.pinned })))),
            tags: [category].concat(r.layers).concat(['OBDX ' + data.version]), createdBy: bank ? 'Bank pack folder' : 'Version pack', approvedBy: bank ? 'The factory\'s administrator (bank pack folder)' : 'Shipped in the version pack', approvalDate: 'Not recorded'
          };
        }) : [];
        const builtIn = BUILT_IN.map((b, i) => ({
          key: 'builtin-' + i, title: b.title, category: b.category, version: 'Factory', versionTitle: 'Part of the factory', status: pill('Protected', 'blue'), statusKey: 'builtin',
          kind: 'system', kindText: 'Protected system prompt', agent: BUILT_IN_AGENT[i] || 'Factory', approvalShort: 'Factory code', evaluation: !!b.evaluation, hasSecret: false,
          approval: 'Part of the factory\'s code; changes only with a factory update',
          lifecycle: 'Protected: it cannot be edited here or in the pack files. It changes only with a factory update (see the release notes on the About page).',
          when: b.when, guidance: b.guidance + '\n\n(The full prompt is part of the factory and changes with its updates.)', layers: '–', actions: '–', source: 'Factory', custom: false,
          usage: null, byChange: [], updated: build ? 'Build ' + build : 'Factory', updatedTitle: 'Changes with factory updates',
          templates: [], parts: [], variables: [], examples: [], tags: [b.category], createdBy: 'Built in', approvedBy: 'Built in', approvalDate: 'Not recorded'
        }));
        return fromPack.concat(builtIn).map((x) => Object.assign(x, {
          catCss: badgeCss(TONE[x.category]) + ' fx-badge--plain factory-pr-cat',
          iconCss: 'factory-kpi-icon factory-pr-icon factory-ov2-icon-' + (TONE[x.category] || 'blue'), usageText: x.usage === null ? '–' : x.usage,
          tagPills: x.tags.map((t) => ({ text: t, css: 'fx-chip factory-pr-tag' })),
          model: model() ? 'Any chat model; in use now: ' + model() : 'Any chat model set on Models & AI Providers',
          kindCss: 'fx-badge fx-badge--plain' + (x.kind === 'system' ? ' fx-badge--info' : ' fx-badge--success')
        }));
      });

      // The model the prompts run on: the one set on Models & AI Providers (no prompt is tied to a model)
      const model = ko.observable('');
      this.governance = ko.pureComputed(() => {
        const all = this.items();
        const templates = all.filter((x) => x.kind === 'template');
        return {
          templates: templates.length + ' editable templates (version pack recipes' + (templates.some((x) => x.custom) ? ', bank\'s included' : '') + ')',
          system: (all.length - templates.length) + ' protected system prompts (part of the factory)',
          model: model() ? 'Model in use: ' + model() : 'Model: set on Models & AI Providers'
        };
      });
      // Tabs: the design's groups, worked out from what each recipe is
      const TABS = {
        all: () => true, usecase: (x) => x.templates.length > 0, 'Code Generation': (x) => x.category === 'Code Generation', 'UI Generation': (x) => x.category === 'UI Generation',
        'API Generation': (x) => x.category === 'API Generation', 'Test Generation': (x) => x.category === 'Test Generation', 'Database Script': (x) => x.category === 'Database Script',
        modernization: (x) => /moderni[sz]|migrat|legacy/i.test(x.key + ' ' + x.title), custom: (x) => x.custom, 'Built-in Task': (x) => x.category === 'Built-in Task',
        editable: (x) => x.kind === 'template'
      };
      this.tab = ko.observable('all');
      this.tabs = ui.tabs(this.tab, [
        { value: 'all', label: 'All', icon: 'doc' }, { value: 'editable', label: 'Editable templates', icon: 'edit' },
        { value: 'Built-in Task', label: 'Protected system prompts', icon: 'shield' }, { value: 'usecase', label: 'Use Case Templates', icon: 'list' },
        { value: 'Code Generation', label: 'Code Generation', icon: 'code' }, { value: 'UI Generation', label: 'UI Generation', icon: 'monitor' },
        { value: 'API Generation', label: 'API Generation', icon: 'link' }, { value: 'Test Generation', label: 'Test Generation', icon: 'flask' },
        { value: 'Database Script', label: 'Database', icon: 'cube' }, { value: 'modernization', label: 'Modernization', icon: 'refresh' },
        { value: 'custom', label: 'Bank templates', icon: 'bank' }
      ]);
      // Arrow keys, Home and End move between the tabs (WAI-ARIA tabs pattern)
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
        const button = document.getElementById(prefix + keys[next].replace(/\s+/g, '-'));
        if (button) {
          button.focus();
        }
        return false;
      };
      this.tabKey = tabKeys(this.tab, this.tabs, 'pr-');
      this.tabId = (value) => 'pr-' + value.replace(/\s+/g, '-');
      this.emptyText = ko.pureComputed(() => ({
        modernization: 'No modernization prompts in this version pack. The Modernization page uses the built-in tasks.',
        custom: 'No bank templates. The factory\'s administrator adds them as a recipes.yml in the bank\'s pack folder (FACTORY_PACKS_DIR).'
      }[this.tab()] || 'No prompts match.'));
      this.search = ko.observable('');
      this.searchInput = ui.value(this.search);

      // Category filter: none ticked shows all
      this.catsOpen = ko.observable(true);
      this.toggleCats = () => this.catsOpen(!this.catsOpen());
      this.catPicked = ko.observable({});
      this.categories = ko.pureComputed(() => {
        const counts = {};
        this.items().forEach((x) => { counts[x.category] = (counts[x.category] || 0) + 1; });
        return Object.keys(counts).map((c) => ({
          name: c, n: counts[c], picked: ko.pureComputed(() => !!this.catPicked()[c]),
          toggle: (event) => { const m = Object.assign({}, this.catPicked()); m[c] = event.target.checked; this.catPicked(m); return true; }
        }));
      });
      this.clearCats = () => this.catPicked({});
      this.anyCat = ko.pureComputed(() => Object.keys(this.catPicked()).some((c) => this.catPicked()[c]));
      this.visible = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        const cats = this.catPicked();
        const anyCat = this.anyCat();
        return this.items().filter((x) => TABS[this.tab()](x) && (!anyCat || cats[x.category])
          && (!text || (x.title + ' ' + x.guidance + ' ' + x.category + ' ' + x.agent).toLowerCase().indexOf(text) >= 0));
      });

      // Pages with a size the user picks (design system .fx-pager)
      this.pager = ui.pages(this.visible, 10, [10, 20, 50]);
      this.visible.subscribe(() => this.pager.page(1));
      this.pageRows = this.pager.rows;
      this.pageText = ko.pureComputed(() => this.pager.text() + (this.visible().length ? ' prompts' : ''));

      // Use Case Templates: the prompts with templates as a carousel of cards above the table
      this.carousel = ui.carousel();
      this.useCases = ko.pureComputed(() => this.items().filter(TABS.usecase).map((x) => ({
        key: x.key, title: x.title, category: x.category, catCss: x.catCss, iconCss: x.iconCss, when: x.when,
        count: x.templates.length + ' template' + (x.templates.length === 1 ? '' : 's') + ' · ' + x.variables.length + ' variable' + (x.variables.length === 1 ? '' : 's'),
        css: ko.pureComputed(() => 'fx-card fx-card--interactive factory-pr-slide' + (this.selected() && this.selected().key === x.key ? ' is-selected' : '')),
        pressed: ko.pureComputed(() => (this.selected() && this.selected().key === x.key ? 'true' : 'false')),
        pick: () => { this.selectedKey(x.key); this.detailTab('overview'); }
      })));
      // The track is hidden on the other tabs, so measure it again when it shows or its cards change
      const remeasure = () => window.setTimeout(() => this.carousel.refresh(), 0);
      this.tab.subscribe(remeasure);
      this.useCases.subscribe(remeasure);

      this.selectedKey = ko.observable(null);
      this.checked = ko.observable({});
      this.menuKey = ko.observable(null);
      this.menuStyle = ko.observable({});
      const openMenu = (key, event) => {
        event.stopPropagation();
        if (this.menuKey() === key) {
          this.menuKey(null);
          return;
        }
        const r = event.currentTarget.getBoundingClientRect();
        menuOpener = event.currentTarget;
        this.menuStyle({ top: (r.bottom + 4) + 'px', left: Math.max(8, r.right - 190) + 'px' });
        this.menuKey(key);
        // Focus the first item so the arrow keys work at once
        window.setTimeout(() => { const first = document.querySelector('.factory-pr-menu [role="menuitem"]'); if (first) { first.focus({ preventScroll: true }); } }, 0);
      };
      let menuOpener = null;
      // Arrow keys move between the items of the row and detail menus; Escape closes it and returns to its button
      this.menuKeydown = (event) => {
        const items = Array.from(document.querySelectorAll('.factory-pr-menu [role="menuitem"]'));
        const at = items.indexOf(document.activeElement);
        if (event.key === 'Escape') {
          this.menuKey(null);
          if (menuOpener) { menuOpener.focus(); }
        } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length) {
          items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        } else {
          return true;
        }
        event.preventDefault();
        return false;
      };
      this.rows = ko.pureComputed(() => this.pageRows().map((x) => Object.assign({}, x, {
        css: this.selected() && this.selected().key === x.key ? 'factory-clickable is-selected' : 'factory-clickable',
        pick: () => { this.selectedKey(x.key); this.detailTab('overview'); },
        isChecked: ko.pureComputed(() => !!this.checked()[x.key] || (!!this.selected() && this.selected().key === x.key)),
        check: (event) => { event.stopPropagation(); const m = Object.assign({}, this.checked()); m[x.key] = event.target.checked; this.checked(m); return true; },
        menu: (event) => openMenu(x.key, event)
      })));
      this.allChecked = ko.pureComputed(() => this.pageRows().length > 0 && this.pageRows().every((x) => this.checked()[x.key]));
      this.checkAll = (event) => { const m = Object.assign({}, this.checked()); this.pageRows().forEach((x) => { m[x.key] = event.target.checked; }); this.checked(m); return true; };
      this.selected = ko.pureComputed(() => this.items().find((x) => x.key === this.selectedKey()) || this.items()[0] || null);
      this.detailMenu = (event) => openMenu('detail', event);
      this.menuItem = ko.pureComputed(() => (this.menuKey() === 'detail' ? this.selected() : this.items().find((x) => x.key === this.menuKey()) || null));
      this.menuCopy = () => { const x = this.menuItem(); this.menuKey(null); copy(x ? x.guidance : ''); };
      this.menuUse = () => { this.menuKey(null); this.useTemplate(); };
      this.menuShow = () => { const x = this.menuItem(); this.menuKey(null); if (x) { this.selectedKey(x.key); this.detailTab('overview'); } };
      this.menuPacks = () => { this.menuKey(null); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'packs' })); };

      this.detailTab = ko.observable('overview');
      this.detailTabs = ui.tabs(this.detailTab, [
        { value: 'overview', label: 'Overview' }, { value: 'prompt', label: 'Prompt' }, { value: 'variables', label: 'Variables' }, { value: 'examples', label: 'Examples' },
        { value: 'usage', label: 'Usage' }, { value: 'versions', label: 'Versions' }, { value: 'evaluation', label: 'Evaluation' }, { value: 'history', label: 'History' }
      ]);
      this.detailKey = tabKeys(this.detailTab, this.detailTabs, 'prd-');
      // Versions: the same recipe in the other OBDX version's pack, line by line
      const otherPacks = ko.observable({});
      this.otherVersion = ko.pureComputed(() => {
        const data = recipes();
        return data ? (data.version === '22.x' ? '25.x' : '22.x') : '';
      });
      ko.computed(() => {
        const v = this.otherVersion();
        if (v && otherPacks()[v] === undefined && this.detailTab() === 'versions') {
          const all = Object.assign({}, otherPacks());
          all[v] = null;
          otherPacks(all);
          api.get('version-packs/' + encodeURIComponent(v) + '/recipes').then((r) => { const m = Object.assign({}, otherPacks()); m[v] = r; otherPacks(m); })
            .catch((error) => { const m = Object.assign({}, otherPacks()); m[v] = { error: error.message }; otherPacks(m); });
        }
      });
      // Lines of a: equal (=), only in a (-), only in b (+), by longest common subsequence
      const diff = (a, b) => {
        const x = a.slice(0, 400);
        const y = b.slice(0, 400);
        const t = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
        for (let i = x.length - 1; i >= 0; i--) {
          for (let j = y.length - 1; j >= 0; j--) {
            t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
          }
        }
        const out = [];
        let i = 0;
        let j = 0;
        while (i < x.length || j < y.length) {
          if (i < x.length && j < y.length && x[i] === y[j]) { out.push({ sign: ' ', text: x[i] }); i++; j++; }
          else if (j < y.length && (i >= x.length || t[i][j + 1] >= t[i + 1][j])) { out.push({ sign: '+', text: y[j] }); j++; }
          else { out.push({ sign: '-', text: x[i] }); i++; }
        }
        return out;
      };
      this.versionCompare = ko.pureComputed(() => {
        const x = this.selected();
        const data = recipes();
        if (!x || x.kind !== 'template' || !data) {
          return { state: 'none', text: 'Protected system prompts have one version: the factory\'s. They change with factory updates.' };
        }
        const other = otherPacks()[this.otherVersion()];
        if (other === undefined || other === null) {
          return { state: 'loading', text: 'Loading the OBDX ' + this.otherVersion() + ' pack…' };
        }
        if (other.error) {
          return { state: 'error', text: other.error };
        }
        const twin = other.recipes.find((r) => r.id === x.key);
        if (!twin) {
          return { state: 'missing', text: 'The OBDX ' + this.otherVersion() + ' pack has no recipe with this id: it is only in OBDX ' + data.version + '.' };
        }
        const rows = diff(x.guidance.split('\n'), mask(twin.guidance).split('\n')).map((d) => ({ sign: d.sign, text: d.text,
          css: 'factory-pr-dline' + (d.sign === '+' ? ' is-add' : d.sign === '-' ? ' is-del' : '') }));
        const changed = rows.filter((r) => r.sign !== ' ').length;
        return { state: 'ok', rows: rows, text: changed ? changed + ' guidance line' + (changed === 1 ? '' : 's') + ' differ between OBDX ' + data.version + ' (−) and OBDX ' + this.otherVersion() + ' (+). Source there: ' + sourceName(twin.source) + '.'
          : 'The guidance is the same in OBDX ' + data.version + ' and OBDX ' + this.otherVersion() + ' (' + sourceName(twin.source) + ').' };
      });
      // Evaluation: the Library's question set, for the answer task (administrators run and read it)
      this.isAdmin = session.isAdmin;
      this.evaluation = ko.observable(null);
      this.evaluationLoaded = ko.observable(false);
      const loadEvaluation = () => {
        if (!session.isAdmin()) {
          return Promise.resolve();
        }
        return api.get('knowledge/evaluation').then((r) => { this.evaluation(r || null); this.evaluationLoaded(true); }).catch(() => this.evaluationLoaded(true));
      };
      this.evaluationView = ko.pureComputed(() => {
        const r = this.evaluation();
        if (!r) {
          return null;
        }
        const pct = (v) => Math.round((v || 0) * 100) + '%';
        return {
          head: (r.running ? 'Running: ' + r.done + ' of ' + r.total : r.total + ' cases') + ' · ' + String(r.mode).toLowerCase() + ' · model ' + (r.chatModel || '–') + (r.finishedAt ? ' · ' + ui.when(r.finishedAt) : ''),
          facts: [{ k: 'Expected section found (top 5)', v: pct(r.recallAt5) }, { k: 'Answers that held up', v: r.mode === 'ANSWER' ? pct(r.answersPassed) : 'Not run (answers are checked in the ANSWER mode)' },
            { k: 'Unanswerable questions refused', v: r.mode === 'ANSWER' ? pct(r.unsupportedRefused) : '–' }, { k: 'Average time', v: (r.averageMillis || 0) + ' ms' }],
          rows: (r.rows || []).slice(0, 15).map((row) => ({ q: row.question, ok: r.mode === 'ANSWER' ? row.passed : row.rank > 0, text: row.rank > 0 ? 'found at ' + row.rank : 'not found' })),
          error: r.error || ''
        };
      });
      this.runEvaluation = () => api.post('knowledge/evaluation', { mode: 'SEARCH' })
        .then((r) => { this.evaluation(r); toast.success('The evaluation runs the question set through the Library search.'); window.setTimeout(loadEvaluation, 3000); })
        .catch((error) => toast.error(error.message));
      this.detailTab.subscribe((t) => { if (t === 'evaluation' && !this.evaluationLoaded()) { loadEvaluation(); } });
      this.description = ko.pureComputed(() => {
        const x = this.selected();
        if (!x) {
          return '';
        }
        // The first point of the guidance in full, with the lines that continue it
        const lines = x.guidance.split('\n');
        const start = lines.findIndex((l) => l.trim());
        const out = [];
        for (let i = start; i >= 0 && i < lines.length; i++) {
          if (i > start && (!lines[i].trim() || /^\s*-\s/.test(lines[i]))) {
            break;
          }
          out.push(lines[i].trim().replace(/^-\s*/, ''));
        }
        return out.join(' ');
      });
      // Show the full prompt in the detail panel and bring it into view
      this.showFullPrompt = () => {
        this.detailTab('prompt');
        const el = document.querySelector('.factory-pr-detail');
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      };
      this.showAllVariables = () => {
        this.detailTab('variables');
        const el = document.querySelector('.factory-pr-detail');
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      };
      this.openProfile = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'profile' }));

      // Prompt Template card
      this.promptTab = ko.observable('system');
      this.promptTabs = ui.tabs(this.promptTab, [{ value: 'system', label: 'System Prompt' }, { value: 'user', label: 'User Prompt' }]);
      this.promptText = ko.pureComputed(() => (this.promptTab() === 'user' ? USER_PROMPT : (this.selected() ? this.selected().guidance : '')));
      // The card is a fixed panel: the first lines, one per prompt line; the rest are in the detail panel
      const PROMPT_ROWS = 12;
      const VAR_ROWS = 6;
      this.allPromptLines = ko.pureComputed(() => this.promptText().split('\n'));
      this.promptLines = ko.pureComputed(() => this.allPromptLines().slice(0, PROMPT_ROWS).map((t, i) => ({ n: i + 1, text: t })));
      this.morePromptLines = ko.pureComputed(() => Math.max(0, this.allPromptLines().length - PROMPT_ROWS));
      this.varRows = ko.pureComputed(() => (this.selected() ? this.selected().variables.slice(0, VAR_ROWS) : []));
      this.moreVars = ko.pureComputed(() => (this.selected() ? Math.max(0, this.selected().variables.length - VAR_ROWS) : 0));
      this.copied = ko.observable('');
      const copy = (text) => ui.copy(text)
        .then(() => { this.copied('Copied'); toast.success('Copied the prompt.'); window.setTimeout(() => this.copied(''), 1500); })
        .catch(() => toast.error('Could not copy. Open the Prompt tab and select the text instead.'));
      this.copyPrompt = () => copy(this.promptText());

      // Example Output card
      this.outTab = ko.observable('preview');
      this.outTabs = ui.tabs(this.outTab, [
        { value: 'preview', label: 'UI Preview' }, { value: 'files', label: 'Generated Files' }, { value: 'api', label: 'API Code' }, { value: 'config', label: 'Configuration' }
      ]);
      const pick = (test) => ko.pureComputed(() => (this.selected() ? this.selected().templates.find((t) => test(t.file || '')) || null : null));
      this.htmlTemplate = pick((f) => /\.html?$/i.test(f));
      this.apiTemplate = pick((f) => /\.(java|ts|kt)$|service|controller|adapter/i.test(f));
      this.configTemplate = pick((f) => /\.(json|ya?ml|xml|properties|sql)$|resource|config|nls/i.test(f));
      this.previewDoc = ko.pureComputed(() => {
        const t = this.htmlTemplate();
        // A binding such as [[nls.screen.labels.<<fieldName>>]] shows as its last part
        const body = t ? t.content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\[\[([^\]]*)\]\]/g, (m, e) => e.split('.').pop().replace(/[<>'"]/g, '')) : '';
        // The screen title from the template's first comment, as the top bar of a sample screen
        const head = t ? /<!--\s*([^:]*?)\s*:/.exec(t.content) : null;
        const title = head ? head[1].replace(/[<>'"&]/g, '') : 'Screen';
        // Read the theme so the preview is drawn again when it changes
        preferences.theme();
        return t ? '<!doctype html><html><head><style>' + previewCss() + '</style></head><body><div class="pv-frame"><div class="pv-bar">&#8249;&nbsp; '
          + title + '</div><div class="pv-body">' + body + '</div></div></body></html>' : '';
      });

      this.useTemplate = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }));
      this.howToAdd = ko.observable(false);
      this.toggleHowToAdd = () => this.howToAdd(!this.howToAdd());
      // Create Prompt / Template: a split button (design system .fx-split)
      this.createSplit = ui.menu();
      this.menuHowTo = () => { this.createSplit.close(); this.howToAdd(true); };
      this.createPacks = () => { this.createSplit.close(); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'packs' })); };

      const load = (id) => {
        recipes(null);
        changes([]);
        if (!id) {
          return;
        }
        api.get('workspaces/' + id + '/recipes').then(recipes).catch(showError);
        api.get('workspaces/' + id + '/changes').then((list) => Promise.all(list.map((c) => api.get('changes/' + c.id).catch(() => null))))
          .then((list) => changes(list.filter(Boolean))).catch(() => null);
      };
      const outside = (event) => {
        if (this.menuKey() && !(event.target.closest && event.target.closest('.factory-pr-menu'))) {
          this.menuKey(null);
        }
      };
      const closeMenu = () => this.menuKey(null);
      let subscription = null;
      this.connected = () => {
        accUtils.announce('AI Prompt Library page loaded.');
        document.title = 'AI Prompt Library';
        subscription = this.workspaceId.subscribe(load);
        const before = this.workspaceId();
        workspaceSelection.load().then(() => { if (this.workspaceId() === before) { load(before); } }).catch(showError);
        updates.refresh(false);
        api.get('model/status').then((s) => model(s && s.chatModel ? s.chatModel : '')).catch(() => null);
        this.carousel.attach('useCaseTrack');
        document.addEventListener('click', outside);
        window.addEventListener('scroll', closeMenu, true);
      };
      this.disconnected = () => {
        if (subscription) {
          subscription.dispose();
        }
        document.removeEventListener('click', outside);
        window.removeEventListener('scroll', closeMenu, true);
      };
    }

    return PromptsViewModel;
  }
);
