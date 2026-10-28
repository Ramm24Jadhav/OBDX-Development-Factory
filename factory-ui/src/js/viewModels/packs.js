/*
 * Version Packs page: the factory's OBDX version packs (22.x and 25.x) with their rules, Java level and implementation
 * recipes and templates, as the workspaces using them see them (rules turned off for a workspace show as off). Also
 * the UI target packs' reusable components, the workspace's own components, how the versions relate, and recent
 * changes to rules and reference examples (from the audit log, for administrators).
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', '../services/ui',
        'ojs/ojknockout', 'ojs/ojbutton', 'ojs/ojswitch'],
  function (ko, accUtils, api, session, workspaceSelection, ui) {
    const VERSIONS = ['25.x', '22.x'];

    function PacksViewModel() {
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(error.message);
      this.workspaceId = workspaceSelection.selectedId;
      const workspaces = ko.observableArray([]);
      // version -> {checks, recipes, workspace}
      const packs = ko.observable({});
      this.targets = ko.observableArray([]);
      this.custom = ko.observableArray([]);
      const audit = ko.observableArray([]);

      this.version = ko.observable(null);
      const pack = ko.pureComputed(() => packs()[this.version()] || null);
      this.rows = ko.pureComputed(() => VERSIONS.map((v) => {
        const p = packs()[v];
        const using = workspaces().filter((w) => w.obdxVersion === v);
        return {
          version: v, name: 'OBDX ' + v, description: p ? p.checks.description : 'No workspace uses this version',
          status: using.length ? ui.pill('Active', 'green') : ui.pill('Supported', 'blue'),
          java: p ? 'Java ' + p.checks.javaLevel : (v === '22.x' ? 'Java 8' : 'Java 11'),
          rules: p ? p.checks.rules.length : '–', recipes: p ? p.recipes.recipes.length : '–', workspaces: using.map((w) => w.name).join(', ') || 'None',
          css: ko.pureComputed(() => (this.version() === v ? 'factory-clickable factory-row-sel' : 'factory-clickable')), pick: () => this.version(v),
          selected: ko.pureComputed(() => this.version() === v)
        };
      }));
      this.kpis = ko.pureComputed(() => {
        const p = pack();
        const components = this.targets().reduce((sum, t) => sum + Object.keys(t.components || {}).length, 0);
        return [
          { label: 'Total Version Packs', value: VERSIONS.length, sub: VERSIONS.join(', '), css: 'factory-kpi-sub', tone: 'blue', icon: 'cube' },
          { label: 'Active Pack', value: this.version() ? 'OBDX ' + this.version() : '–', sub: p ? p.checks.description : '', css: 'factory-kpi-sub', tone: 'blue', icon: 'cube', pill: true },
          { label: 'Standard Components', value: components + this.custom().length, sub: 'Target pack mappings and custom', css: 'factory-kpi-sub', tone: 'blue', icon: 'design' },
          { label: 'Implementation Patterns', value: p ? p.recipes.recipes.length : 0, sub: 'Recipes with templates', css: 'factory-kpi-sub', tone: 'violet', icon: 'doc' },
          { label: 'Compliance Rules', value: p ? p.checks.rules.filter((r) => r.enabled).length : 0, sub: 'Rules on', css: 'factory-kpi-sub', tone: 'amber', icon: 'shield' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });
      this.tab = ko.observable('packs');
      this.tabs = ui.tabs(this.tab, [
        { value: 'packs', label: 'Version Packs', icon: 'cube' }, { value: 'standards', label: 'Bank Standards', icon: 'shield' },
        { value: 'templates', label: 'Templates', icon: 'doc' }, { value: 'components', label: 'Reusable Components', icon: 'design' },
        { value: 'rules', label: 'Validation Rules', icon: 'check' }, { value: 'upgrade', label: 'Upgrade Guidance', icon: 'refresh' }
      ]);

      const area = (r) => (r.files.some((f) => /\.java$/.test(f)) ? 'Java' : r.files.some((f) => /\.html$/.test(f)) ? 'UI / UX'
        : r.files.some((f) => /\.(js|ts|tsx)$/.test(f)) ? 'UI code' : r.files.some((f) => /\.sql$/.test(f)) ? 'Database' : 'General');
      this.standards = ko.pureComputed(() => (pack() ? pack().checks.rules : []).map((r) => ({
        id: r.id, title: r.title, area: area(r), message: r.message, enabled: r.enabled, files: r.files.join(', '),
        status: r.enabled ? ui.pill('Active', 'green') : ui.pill('Off', 'grey'), severity: r.severity === 'ERROR' ? ui.pill('Error', 'red') : ui.pill('Warning', 'amber'),
        applies: r.matchesProfile ? r.appliesTo : 'Not this codebase', toggle: (event) => {
          if (event.detail.updatedFrom !== 'internal') {
            return;
          }
          api.put('workspaces/' + pack().workspace.id + '/checks/' + encodeURIComponent(r.id), { enabled: event.detail.value })
            .then((checks) => { const all = Object.assign({}, packs()); all[this.version()] = Object.assign({}, all[this.version()], { checks: checks }); packs(all); })
            .catch(showError);
        }, canManage: !!pack() && session.can(pack().workspace.id, 'MANAGE_CODE')
      })));
      this.recipes = ko.pureComputed(() => (pack() ? pack().recipes.recipes : []).map((r) => ({
        id: r.id, title: r.title, when: r.when || '', layers: r.layers.join(', ') || 'any layer', actions: r.actions.join(', ') || 'create, modify',
        parts: r.parts.map((p) => ({ name: p.name, files: p.files.join(', '), template: p.template || '', content: p.templateContent || '', examples: p.examples.length })),
        source: r.source, open: () => { this.recipeId(r.id); this.tab('templates'); }
      })));
      this.recipeId = ko.observable(null);
      this.recipe = ko.pureComputed(() => this.recipes().find((r) => r.id === this.recipeId()) || this.recipes()[0] || null);
      this.templates = ko.pureComputed(() => [].concat.apply([], this.recipes().map((r) => r.parts.filter((p) => p.template).map((p) => ({
        recipe: r.title, name: p.name, template: p.template, content: p.content, files: p.files
      })))));
      this.components = ko.pureComputed(() => [].concat.apply([], this.targets().map((t) => Object.keys(t.components || {}).map((type) => ({
        pack: t.title, type: type, component: t.components[type].component, props: t.components[type].props || ''
      })))));
      this.customComponents = ko.pureComputed(() => this.custom().map((c) => ({ name: c.name, tag: c.tag, description: c.description, source: c.source, by: c.createdBy })));

      // Version details and upgrade guidance (what changes from 22.x to 25.x)
      this.details = ko.pureComputed(() => {
        const p = pack();
        if (!p) {
          return null;
        }
        const using = workspaces().filter((w) => w.obdxVersion === this.version());
        return {
          name: 'OBDX ' + this.version(), description: p.checks.description, java: 'Java ' + p.checks.javaLevel + ' (' + p.checks.javaLevelSource + ')',
          rules: p.checks.rules.length + ' rules (' + p.checks.rules.filter((r) => r.severity === 'ERROR').length + ' errors)', recipes: p.recipes.recipes.length + ' recipes',
          workspaces: using.map((w) => w.name).join(', ') || 'None', indexed: p.recipes.indexedFiles + ' indexed files in ' + p.workspace.name,
          features: p.recipes.recipes.slice(0, 4).map((r) => r.title)
        };
      });
      this.upgrade = ko.pureComputed(() => {
        const a = packs()['22.x'];
        const b = packs()['25.x'];
        if (!a || !b) {
          return null;
        }
        const ids = (p) => p.checks.rules.map((r) => r.id);
        return {
          added: b.checks.rules.filter((r) => ids(a).indexOf(r.id) < 0).map((r) => r.title + ': ' + r.message),
          removed: a.checks.rules.filter((r) => ids(b).indexOf(r.id) < 0).map((r) => r.title + ': ' + r.message),
          java: 'Java ' + a.checks.javaLevel + ' → Java ' + b.checks.javaLevel
        };
      });
      this.matrix = [
        { from: 'OBDX 22.x', cells: [{ css: 'factory-ad-yes', t: 'Same' }, { css: 'factory-pk-warn', t: 'Upgrade with care' }] },
        { from: 'OBDX 25.x', cells: [{ css: 'factory-ad-no', t: 'No downgrade' }, { css: 'factory-ad-yes', t: 'Same' }] }
      ];
      this.updates = ko.pureComputed(() => audit().filter((e) => /^CHECK_RULE_|^REFERENCE_EXAMPLE_/.test(e.action)).slice(0, 5).map((e) => ({
        title: e.action === 'CHECK_RULE_ENABLED' ? 'Rule turned on' : e.action === 'CHECK_RULE_DISABLED' ? 'Rule turned off' : e.action === 'REFERENCE_EXAMPLE_PINNED' ? 'Reference example pinned' : 'Reference example unpinned',
        text: (e.target || '') + (e.username ? ' by ' + e.username : ''), when: ui.when(e.at)
      })));
      this.showStandards = () => this.tab('standards');
      this.workspaceId.subscribe((id) => {
        const w = workspaces().find((x) => x.id === id);
        if (w && packs()[w.obdxVersion]) {
          this.version(w.obdxVersion);
        }
      });
      this.openProfile = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'profile' }));

      this.connected = () => {
        accUtils.announce('Version Packs page loaded.');
        document.title = 'Version Packs';
        api.get('targets').then(this.targets).catch(() => null);
        if (session.isAdmin()) {
          api.get('admin/audit?limit=300').then(audit).catch(() => null);
        }
        api.get('workspaces').then((list) => {
          workspaces(list);
          // One workspace per version shows that version's pack
          const chosen = {};
          const current = list.find((w) => w.id === this.workspaceId());
          if (current) {
            chosen[current.obdxVersion] = current;
          }
          list.forEach((w) => { chosen[w.obdxVersion] = chosen[w.obdxVersion] || w; });
          if (current) {
            api.get('workspaces/' + current.id + '/custom-components').then(this.custom).catch(() => null);
          }
          return Promise.all(Object.keys(chosen).map((v) => Promise.all([api.get('workspaces/' + chosen[v].id + '/checks'), api.get('workspaces/' + chosen[v].id + '/recipes')])
            .then(([checks, recipes]) => ({ v: v, checks: checks, recipes: recipes, workspace: chosen[v] })))).then((all) => {
            const map = {};
            all.forEach((x) => { map[x.v] = x; });
            packs(map);
            this.version(current ? current.obdxVersion : (all[0] ? all[0].v : null));
          });
        }).catch(showError);
      };
    }

    return PacksViewModel;
  }
);
