/*
 * AI Prompt & Template Library page: the instructions the factory gives the model. The version pack's recipes (their
 * guidance is part of every code generation prompt for matching files) with their templates, template variables and
 * reference examples, and the factory's built-in tasks. Usage counts the planned files of the workspace's changes that
 * each recipe applies to. Recipes are changed in the team's version pack files (FACTORY_PACKS_DIR), not on this page.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', 'ojs/ojknockout', 'ojs/ojbutton'],
  function (ko, accUtils, api, workspaceSelection, ui) {
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

    function PromptsViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(error.message);
      const recipes = ko.observable(null);
      const changes = ko.observableArray([]);

      const usage = (r) => changes().reduce((sum, c) => sum + (c.plan ? c.plan.items.filter((i) => (!r.actions.length || r.actions.indexOf(i.action) >= 0)
        && (!r.layers.length || r.layers.indexOf(i.layer) >= 0)).length : 0), 0);
      this.items = ko.pureComputed(() => {
        const data = recipes();
        const fromPack = data ? data.recipes.map((r) => {
          const category = CATEGORY[r.layers[0]] || (r.layers.length ? 'Code Generation' : 'Business Logic');
          const templates = r.parts.filter((p) => p.templateContent);
          const variables = [];
          templates.forEach((p) => (p.templateContent.match(/<<[^>]+>>/g) || []).forEach((v) => { if (variables.indexOf(v) < 0) { variables.push(v); } }));
          return {
            key: r.id, title: r.title, category: category, version: 'OBDX ' + data.version, status: ui.pill('Approved', 'green'), statusKey: 'approved',
            when: r.when || 'Files matching ' + (r.layers.join(', ') || 'any layer'), guidance: r.guidance, layers: r.layers.join(', ') || 'Any', actions: r.actions.join(', ') || 'create, modify',
            source: r.source, usage: usage(r), templates: templates.map((p) => ({ name: p.name, file: p.template, content: p.templateContent })),
            variables: variables.map((v) => ({ name: v.replace(/[<>]/g, ''), type: 'text', required: true, description: 'Filled in from the specification and the screen design' })),
            examples: [].concat.apply([], r.parts.map((p) => p.examples.map((e) => ({ part: p.name, path: e.path, reason: e.reason, pinned: e.pinned })))),
            tags: [category].concat(r.layers).concat(['OBDX ' + data.version])
          };
        }) : [];
        const builtIn = BUILT_IN.map((b, i) => ({
          key: 'builtin-' + i, title: b.title, category: b.category, version: 'Factory', status: ui.pill('Built in', 'blue'), statusKey: 'builtin',
          when: b.when, guidance: b.guidance + '\n\n(The full prompt is part of the factory and changes with its updates.)', layers: '–', actions: '–', source: 'Factory',
          usage: null, templates: [], variables: [], examples: [], tags: [b.category]
        }));
        return fromPack.concat(builtIn).map((x) => Object.assign(x, {
          catCss: 'factory-ov-pill factory-ov-pill-' + (TONE[x.category] || 'grey'),
          iconCss: 'factory-kpi-icon factory-pr-icon factory-ov2-icon-' + (TONE[x.category] || 'blue'), usageText: x.usage === null ? '–' : x.usage
        }));
      });

      this.kpis = ko.pureComputed(() => {
        const all = this.items();
        const pack = all.filter((x) => x.statusKey === 'approved');
        return [
          { label: 'Total Prompts', value: all.length, sub: pack.length + ' from the version pack', css: 'factory-kpi-sub', tone: 'violet', icon: 'doc' },
          { label: 'Templates', value: pack.reduce((s, x) => s + x.templates.length, 0), sub: 'Reusable file templates', css: 'factory-kpi-sub', tone: 'blue', icon: 'cube' },
          { label: 'Approved', value: pack.length, sub: 'Shipped in the version pack', css: 'factory-kpi-sub', tone: 'green', icon: 'check' },
          { label: 'Built In', value: all.length - pack.length, sub: 'Factory tasks', css: 'factory-kpi-sub', tone: 'amber', icon: 'clock' },
          { label: 'Used in Plans', value: pack.reduce((s, x) => s + x.usage, 0), sub: 'Planned files in this workspace', css: 'factory-kpi-sub', tone: 'red', icon: 'branch' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });
      this.tab = ko.observable('all');
      this.tabs = ui.tabs(this.tab, [
        { value: 'all', label: 'All', icon: 'doc' }, { value: 'UI Generation', label: 'UI Generation', icon: 'monitor' },
        { value: 'Code Generation', label: 'Code Generation', icon: 'code' }, { value: 'API Generation', label: 'API Generation', icon: 'link' },
        { value: 'Test Generation', label: 'Test Generation', icon: 'flask' }, { value: 'Database Script', label: 'Database', icon: 'cube' },
        { value: 'Built-in Task', label: 'Built-in Tasks', icon: 'sparkle' }
      ]);
      this.search = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.categories = ko.pureComputed(() => {
        const counts = {};
        this.items().forEach((x) => { counts[x.category] = (counts[x.category] || 0) + 1; });
        return Object.keys(counts).map((c) => ({ name: c, n: counts[c], pick: () => this.tab(c) }));
      });
      this.visible = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        return this.items().filter((x) => (this.tab() === 'all' || x.category === this.tab()) && (!text || (x.title + ' ' + x.guidance + ' ' + x.category).toLowerCase().indexOf(text) >= 0));
      });
      this.pager = ui.pager(this.visible, 10);
      this.selectedKey = ko.observable(null);
      this.rows = ko.pureComputed(() => this.pager.rows().map((x) => Object.assign({}, x, {
        css: this.selected() && this.selected().key === x.key ? 'factory-clickable factory-row-sel' : 'factory-clickable', pick: () => { this.selectedKey(x.key); this.detailTab('overview'); }
      })));
      this.selected = ko.pureComputed(() => this.items().find((x) => x.key === this.selectedKey()) || this.items()[0] || null);
      this.detailTab = ko.observable('overview');
      this.detailTabs = ui.tabs(this.detailTab, [
        { value: 'overview', label: 'Overview' }, { value: 'prompt', label: 'Prompt' }, { value: 'variables', label: 'Variables' }, { value: 'examples', label: 'Examples' }
      ]);
      this.template = ko.pureComputed(() => (this.selected() && this.selected().templates.length ? this.selected().templates[0] : null));
      this.promptLines = ko.pureComputed(() => (this.selected() ? this.selected().guidance.split('\n').map((t, i) => ({ n: i + 1, text: t })) : []));
      this.copied = ko.observable('');
      this.copyPrompt = () => {
        const text = this.selected() ? this.selected().guidance : '';
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard')))
          .then(() => { this.copied('Copied'); window.setTimeout(() => this.copied(''), 1500); }).catch(() => window.prompt('Copy the prompt:', text));
      };
      this.useTemplate = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }));
      this.howToAdd = ko.observable(false);
      this.toggleHowToAdd = () => this.howToAdd(!this.howToAdd());

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
      let subscription = null;
      this.connected = () => {
        accUtils.announce('AI Prompt Library page loaded.');
        document.title = 'AI Prompt Library';
        subscription = this.workspaceId.subscribe(load);
        const before = this.workspaceId();
        workspaceSelection.load().then(() => { if (this.workspaceId() === before) { load(before); } }).catch(showError);
      };
      this.disconnected = () => {
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return PromptsViewModel;
  }
);
