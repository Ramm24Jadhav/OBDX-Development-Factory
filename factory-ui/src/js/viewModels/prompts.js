/*
 * AI Prompt & Template Library page: the instructions the factory gives the model. The version pack's recipes (their
 * guidance is part of every code generation prompt for matching files) with their templates, template variables and
 * reference examples, and the factory's built-in tasks. Usage counts the planned files of the workspace's changes that
 * each recipe applies to. Recipes are changed in the team's version pack files (FACTORY_PACKS_DIR), not on this page,
 * and have no review or retirement steps, so nothing is under review or deprecated.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/updates', '../services/ui', 'ojs/ojknockout', 'ojs/ojbutton'],
  function (ko, accUtils, api, workspaceSelection, updates, ui) {
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
    const PREVIEW_CSS = 'body{font:12px/1.4 system-ui,sans-serif;margin:10px;color:#0f172a}*{max-width:100%}'
      + '[label-hint]{display:block;margin:6px 0;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;color:#94a3b8}'
      + '[label-hint]::before{content:attr(label-hint);display:block;font-size:10px;color:#475569}'
      + 'oj-button{display:inline-block;margin:6px 6px 0 0;padding:6px 14px;border-radius:4px;background:#2563eb;color:#fff}'
      + 'oj-bind-text::before{content:attr(value)}oj-form-layout,oj-bind-if,oj-bind-for-each{display:block}h1,h2,h3{font-size:14px;margin:6px 0}';

    function PromptsViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
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
            key: r.id, title: r.title, category: category, version: data.version, versionTitle: 'OBDX ' + data.version + ' version pack', status: ui.pill('Approved', 'green'), statusKey: 'approved',
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
          key: 'builtin-' + i, title: b.title, category: b.category, version: 'Factory', versionTitle: 'Part of the factory', status: ui.pill('Built in', 'blue'), statusKey: 'builtin',
          when: b.when, guidance: b.guidance + '\n\n(The full prompt is part of the factory and changes with its updates.)', layers: '–', actions: '–', source: 'Factory', custom: false,
          usage: null, byChange: [], updated: build ? 'Build ' + build : 'Factory', updatedTitle: 'Changes with factory updates',
          templates: [], parts: [], variables: [], examples: [], tags: [b.category], createdBy: 'Built in', approvedBy: 'Built in', approvalDate: 'Not recorded'
        }));
        return fromPack.concat(builtIn).map((x) => Object.assign(x, {
          catCss: 'factory-ov-pill factory-pr-cat factory-ov-pill-' + (TONE[x.category] || 'grey'),
          iconCss: 'factory-kpi-icon factory-pr-icon factory-ov2-icon-' + (TONE[x.category] || 'blue'), usageText: x.usage === null ? '–' : x.usage,
          tagPills: x.tags.map((t, i) => ({ text: t, css: 'factory-ov-pill factory-pr-tag factory-ov-pill-' + ['violet', 'blue', 'green', 'amber'][i % 4] }))
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

      // Pages with a size the user picks
      this.pageSize = ko.observable(10);
      this.pageSizeChange = (event) => { this.pageSize(Number(event.target.value)); this.page(1); };
      this.page = ko.observable(1);
      this.pages = ko.pureComputed(() => Math.max(1, Math.ceil(this.visible().length / this.pageSize())));
      this.visible.subscribe(() => this.page(1));
      this.pageRows = ko.pureComputed(() => this.visible().slice((Math.min(this.page(), this.pages()) - 1) * this.pageSize(), Math.min(this.page(), this.pages()) * this.pageSize()));
      this.pageText = ko.pureComputed(() => {
        const total = this.visible().length;
        const start = (Math.min(this.page(), this.pages()) - 1) * this.pageSize();
        return total === 0 ? 'Nothing to show' : 'Showing ' + (start + 1) + ' to ' + Math.min(total, start + this.pageSize()) + ' of ' + total + ' prompts';
      });
      this.pageButtons = ko.pureComputed(() => Array.from({ length: this.pages() }, (v, i) => i + 1).map((n) => ({
        n: n, css: n === this.page() ? 'factory-pr-pgbtn factory-pr-pgbtn-on' : 'factory-pr-pgbtn', go: () => this.page(n)
      })));
      this.prevPage = () => this.page(Math.max(1, this.page() - 1));
      this.nextPage = () => this.page(Math.min(this.pages(), this.page() + 1));

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
        this.menuStyle({ top: (r.bottom + 4) + 'px', left: Math.max(8, r.right - 190) + 'px' });
        this.menuKey(key);
      };
      this.rows = ko.pureComputed(() => this.pageRows().map((x) => Object.assign({}, x, {
        css: this.selected() && this.selected().key === x.key ? 'factory-clickable factory-row-sel' : 'factory-clickable',
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
        return x ? x.guidance.split('\n').map((l) => l.replace(/^\s*-\s*/, '')).find((l) => l.trim()) || '' : '';
      });
      this.openProfile = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'profile' }));

      // Prompt Template card
      this.promptTab = ko.observable('system');
      this.promptTabs = ui.tabs(this.promptTab, [{ value: 'system', label: 'System Prompt' }, { value: 'user', label: 'User Prompt' }]);
      this.promptText = ko.pureComputed(() => (this.promptTab() === 'user' ? USER_PROMPT : (this.selected() ? this.selected().guidance : '')));
      this.promptLines = ko.pureComputed(() => this.promptText().split('\n').map((t, i) => ({ n: i + 1, text: t })));
      this.copied = ko.observable('');
      const copy = (text) => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard')))
        .then(() => { this.copied('Copied'); window.setTimeout(() => this.copied(''), 1500); }).catch(() => window.prompt('Copy the prompt:', text));
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
        return t ? '<!doctype html><html><head><style>' + PREVIEW_CSS + '</style></head><body>' + body + '</body></html>' : '';
      });

      this.useTemplate = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }));
      this.howToAdd = ko.observable(false);
      this.toggleHowToAdd = () => this.howToAdd(!this.howToAdd());
      this.createMenu = (event) => openMenu('create', event);
      this.menuHowTo = () => { this.menuKey(null); this.howToAdd(true); };

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
