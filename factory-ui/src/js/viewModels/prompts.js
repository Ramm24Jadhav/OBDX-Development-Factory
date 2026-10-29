/*
 * AI Prompt & Template Library page: the instructions the factory gives the model. The version pack's recipes (their
 * guidance is part of every code generation prompt for matching files) with their templates, template variables and
 * reference examples, and the factory's built-in tasks. Usage counts the planned files of the workspace's changes that
 * each recipe applies to. Recipes are changed in the team's version pack files (FACTORY_PACKS_DIR), not on this page,
 * and have no review or retirement steps, so nothing is under review or deprecated.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/updates', '../services/ui', '../services/toast',
        '../services/preferences', 'ojs/ojknockout', 'ojs/ojbutton'],
  function (ko, accUtils, api, workspaceSelection, updates, ui, toast, preferences) {
    // Badges (design system .fx-badge): statuses carry a dot, categories are plain labels
    const BADGE = { green: 'success', amber: 'warning', red: 'danger', blue: 'info', violet: 'violet' };
    const badgeCss = (tone) => 'fx-badge' + (BADGE[tone] ? ' fx-badge--' + BADGE[tone] : '');
    const pill = (text, tone) => ({ text: text, css: badgeCss(tone) });
    /** The current value of a design token, for the preview frame (its own document cannot read the page's variables). */
    const token = (name, fallback) => (window.getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback;
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
      { title: 'Fix build errors', category: 'Built-in Task', when: 'A Jenkins build of a change fails', guidance: 'Sends the build errors of a file back to the model to fix, for a few rounds.' }
    ];
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
        strong: token('--fx-border-strong', '#cbd5e1'), primary: token('--fx-primary', '#2563eb')
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
          return {
            key: r.id, title: r.title, category: category, version: data.version, versionTitle: 'OBDX ' + data.version + ' version pack', status: pill('Approved', 'green'), statusKey: 'approved',
            when: r.when || 'Files matching ' + (r.layers.join(', ') || 'any layer'), guidance: r.guidance, layers: r.layers.join(', ') || 'Any', actions: r.actions.join(', ') || 'create, modify',
            source: r.source, custom: !/^packs\//.test(r.source || ''), usage: byChange.reduce((s, u) => s + u.n, 0), byChange: byChange,
            updated: 'Pack ' + data.version, updatedTitle: 'Changes with the ' + data.version + ' version pack',
            templates: templates.map((p) => ({ name: p.name, file: p.template, content: p.templateContent })),
            parts: r.parts.map((p) => ({ name: p.name, file: p.template || 'No template: follows the reference examples' })),
            variables: variables.map((v) => ({ name: v.replace(/[<>]/g, ''), type: 'text', required: true, description: 'From the spec and screen design' })),
            examples: [].concat.apply([], r.parts.map((p) => p.examples.map((e) => ({ part: p.name, path: e.path, reason: e.reason, pinned: e.pinned })))),
            tags: [category].concat(r.layers).concat(['OBDX ' + data.version]), createdBy: 'Version pack', approvedBy: 'Shipped in the version pack', approvalDate: 'Not recorded'
          };
        }) : [];
        const builtIn = BUILT_IN.map((b, i) => ({
          key: 'builtin-' + i, title: b.title, category: b.category, version: 'Factory', versionTitle: 'Part of the factory', status: pill('Built in', 'blue'), statusKey: 'builtin',
          when: b.when, guidance: b.guidance + '\n\n(The full prompt is part of the factory and changes with its updates.)', layers: '–', actions: '–', source: 'Factory', custom: false,
          usage: null, byChange: [], updated: build ? 'Build ' + build : 'Factory', updatedTitle: 'Changes with factory updates',
          templates: [], parts: [], variables: [], examples: [], tags: [b.category], createdBy: 'Built in', approvedBy: 'Built in', approvalDate: 'Not recorded'
        }));
        return fromPack.concat(builtIn).map((x) => Object.assign(x, {
          catCss: badgeCss(TONE[x.category]) + ' fx-badge--plain factory-pr-cat',
          iconCss: 'factory-kpi-icon factory-pr-icon factory-ov2-icon-' + (TONE[x.category] || 'blue'), usageText: x.usage === null ? '–' : x.usage,
          tagPills: x.tags.map((t) => ({ text: t, css: 'fx-chip factory-pr-tag' }))
        }));
      });

      this.kpis = ko.pureComputed(() => {
        const all = this.items();
        const pack = all.filter((x) => x.statusKey === 'approved');
        return [
          { label: 'Total Prompts', value: all.length, sub: pack.length + ' in the pack, ' + (all.length - pack.length) + ' built in', css: 'factory-kpi-sub', tone: 'violet', icon: 'doc' },
          { label: 'Templates', value: pack.reduce((s, x) => s + x.templates.length, 0), sub: 'Reusable patterns', css: 'factory-kpi-sub', tone: 'blue', icon: 'cube' },
          { label: 'Approved', value: pack.length, sub: 'In the version pack', css: 'factory-kpi-sub', tone: 'green', icon: 'check' },
          { label: 'Under Review', value: 0, sub: 'No review step yet', css: 'factory-kpi-sub', tone: 'amber', icon: 'clock' },
          { label: 'Deprecated', value: 0, sub: 'No retire step yet', css: 'factory-kpi-sub', tone: 'red', icon: 'x' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });
      // Tabs: the design's groups, worked out from what each recipe is
      const TABS = {
        all: () => true, usecase: (x) => x.templates.length > 0, 'Code Generation': (x) => x.category === 'Code Generation', 'UI Generation': (x) => x.category === 'UI Generation',
        'API Generation': (x) => x.category === 'API Generation', 'Test Generation': (x) => x.category === 'Test Generation', 'Database Script': (x) => x.category === 'Database Script',
        modernization: (x) => /moderni[sz]|migrat|legacy/i.test(x.key + ' ' + x.title), custom: (x) => x.custom, 'Built-in Task': (x) => x.category === 'Built-in Task'
      };
      this.tab = ko.observable('all');
      this.tabs = ui.tabs(this.tab, [
        { value: 'all', label: 'All', icon: 'doc' }, { value: 'usecase', label: 'Use Case Templates', icon: 'list' },
        { value: 'Code Generation', label: 'Code Generation', icon: 'code' }, { value: 'UI Generation', label: 'UI Generation', icon: 'monitor' },
        { value: 'API Generation', label: 'API Generation', icon: 'link' }, { value: 'Test Generation', label: 'Test Generation', icon: 'flask' },
        { value: 'Database Script', label: 'Database', icon: 'cube' }, { value: 'modernization', label: 'Modernization', icon: 'refresh' },
        { value: 'custom', label: 'Custom Prompts', icon: 'edit' }, { value: 'Built-in Task', label: 'Built-in Tasks', icon: 'sparkle' }
      ]);
      this.emptyText = ko.pureComputed(() => ({
        modernization: 'No modernization prompts in this version pack. The Modernization page uses the built-in tasks.',
        custom: 'No custom prompts. Put a recipes.yml in the team pack folder (FACTORY_PACKS_DIR) to add your own.'
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
          && (!text || (x.title + ' ' + x.guidance + ' ' + x.category).toLowerCase().indexOf(text) >= 0));
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
        { value: 'usage', label: 'Usage' }, { value: 'history', label: 'History' }
      ]);
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
        this.carousel.attach(document.getElementById('useCaseTrack'));
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
