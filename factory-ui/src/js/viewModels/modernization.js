/*
 * Modernization page: assessing a workspace for an OBDX upgrade or a new frontend. The inventory scanned from its code
 * (modules, screens and their complexity, services, roles, flows), the stack from the Project Profile against the
 * version packs, usage of what the version pack rules forbid (found with code search and checked against each rule's
 * pattern), migration waves by screen complexity (estimates), and an assistant that answers from all of it.
 * The screens can be downloaded as CSV for wave planning.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/assistant', 'ojs/ojknockout', 'ojs/ojbutton', 'ojs/ojinputtext'],
  function (ko, accUtils, api, workspaceSelection, session, ui, assistant) {
    const lastSegment = (id) => id.substring(id.lastIndexOf('/') + 1);
    // Days of work per screen by complexity, for the effort estimate
    const DAYS = { S: 1, M: 3, L: 5 };
    const PACK_JAVA = { '22.x': 8, '25.x': 11 };

    /** A literal word from a rule's regular expression, to find candidate files with code search. */
    function searchTerm(regex) {
      const words = regex.replace(/\\[sdwbSDWB]/g, ' ').replace(/\\(.)/g, '$1').split(/[^A-Za-z0-9_.-]+/).filter((w) => w.length >= 4);
      return words.sort((a, b) => b.length - a.length)[0] || null;
    }

    /** A rule's Java regular expression as a JavaScript one (inline flags become flags), or null when it cannot be read. */
    function toRegExp(regex) {
      const m = regex.match(/^\(\?([imsx]+)\)/);
      const flags = m ? m[1].replace(/x/g, '') : '';
      try {
        return new RegExp(m ? regex.slice(m[0].length) : regex, flags);
      } catch (e) {
        return null;
      }
    }

    function ModernizationViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.canScan = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.workspace = ko.observable(null);
      this.inventory = ko.observable(null);
      this.profile = ko.observable(null);
      this.rules = ko.observableArray([]);
      this.findings = ko.observableArray([]);
      this.searchingFindings = ko.observable(false);
      this.errorMessage = ko.observable('');
      this.emptyMessage = ko.observable('');
      this.busy = ko.observable(false);
      this.tab = ko.observable('overview');
      this.tabs = ui.tabs(this.tab, [
        { value: 'overview', label: 'Overview' }, { value: 'deprecated', label: 'Deprecated APIs' }, { value: 'dependencies', label: 'Dependency Analysis' },
        { value: 'plan', label: 'Migration Plan' }, { value: 'compatibility', label: 'Compatibility' }, { value: 'progress', label: 'Progress & History' }
      ]);
      const showError = (error) => this.errorMessage(error.message);
      const summary = ko.pureComputed(() => (this.inventory() ? this.inventory().summary : null));
      const fact = (key) => {
        const f = this.profile() ? this.profile().facts.find((x) => x.key === key) : null;
        return f && f.value ? f.value : null;
      };
      this.scannedText = ko.pureComputed(() => (this.inventory() ? ui.when(this.inventory().scannedAt) : ''));
      this.version = ko.pureComputed(() => (this.workspace() ? this.workspace().obdxVersion : ''));
      this.target = ko.pureComputed(() => (this.version() === '22.x' ? '25.x' : this.version()));

      // Readiness: the share of screens of small or medium complexity (large screens need the most rework)
      this.readiness = ko.pureComputed(() => {
        const s = summary();
        return s && s.screens ? Math.round(100 * (s.complexity.S + s.complexity.M) / s.screens) : 0;
      });
      this.readinessStyle = ko.pureComputed(() => ({ background: 'conic-gradient(#16a34a ' + this.readiness() + '%, #e5eaf1 0)' }));
      this.readinessPill = ko.pureComputed(() => (this.readiness() >= 70 ? ui.pill('Good', 'green') : this.readiness() >= 40 ? ui.pill('Fair', 'amber') : ui.pill('Low', 'red')));
      const critical = ko.pureComputed(() => this.findings().filter((f) => f.severity === 'ERROR').length);
      this.kpis = ko.pureComputed(() => {
        const s = summary();
        if (!s) {
          return [];
        }
        return [
          { label: 'Modules Scanned', value: s.modules, sub: s.screens + ' screens', tone: 'blue', icon: 'cube', css: 'factory-kpi-sub' },
          { label: 'Deprecated Usage', value: this.findings().length, sub: critical() + ' critical', tone: 'red', icon: 'alert', css: 'factory-kpi-sub factory-bad' },
          { label: 'Large Screens', value: s.complexity.L, sub: 'need the most rework', tone: 'amber', icon: 'monitor', css: 'factory-kpi-sub factory-warn' },
          { label: 'Migration Effort', value: this.phases().filter((p) => p.screens).length, sub: 'phases (estimate)', tone: 'violet', icon: 'list', css: 'factory-kpi-sub' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });

      // Technology stack against the version pack
      this.stack = ko.pureComputed(() => {
        const java = fact('backend.javaVersion');
        const targetJava = PACK_JAVA[this.target()];
        const row = (name, value, status, tone, icon) => ({ name: name, value: value || 'Not detected', pill: ui.pill(status, tone), iconClass: 'factory-nav-icon factory-ico-' + icon });
        return [
          row('OBDX Framework', 'OBDX ' + this.version(), this.version() !== this.target() ? 'Upgrade available: ' + this.target() : 'Current', this.version() !== this.target() ? 'amber' : 'green', 'cube'),
          row('UI Framework', fact('ui.jetVersion') ? 'Oracle JET ' + fact('ui.jetVersion') : fact('ui.architecture'), 'From the profile', 'blue', 'monitor'),
          row('Backend (Java)', java ? 'Java ' + java : null, java && targetJava && Number(java) < targetJava ? 'Upgrade to Java ' + targetJava : (java ? 'Supported' : 'Unknown'),
            java && targetJava && Number(java) < targetJava ? 'red' : java ? 'green' : 'grey', 'code'),
          row('Database', fact('data.databaseType'), fact('data.databaseType') ? 'Supported' : 'Unknown', fact('data.databaseType') ? 'green' : 'grey', 'cube'),
          row('Integration', fact('integration.adapters'), fact('integration.adapters') ? 'Review adapters' : 'Unknown', fact('integration.adapters') ? 'amber' : 'grey', 'link'),
          row('Build Tool', fact('backend.buildTool'), fact('backend.buildTool') ? 'Supported' : 'Unknown', fact('backend.buildTool') ? 'green' : 'grey', 'cog')
        ];
      });
      this.opportunities = ko.pureComputed(() => {
        const s = summary();
        if (!s) {
          return [];
        }
        const row = (name, count, level, icon, tab) => ({ name: name, count: count + ' items', pill: ui.pill(level, level === 'High' ? 'red' : level === 'Medium' ? 'amber' : 'green'),
          iconClass: 'factory-nav-icon factory-ico-' + icon, open: () => this.tab(tab) });
        return [
          row('Framework Upgrade', this.version() !== this.target() ? 1 : 0, this.version() !== this.target() ? 'High' : 'Low', 'cube', 'compatibility'),
          row('Deprecated Usage', this.findings().length, critical() ? 'High' : this.findings().length ? 'Medium' : 'Low', 'alert', 'deprecated'),
          row('UI Screen Migration', s.screens, s.complexity.L > 0 ? 'Medium' : 'Low', 'monitor', 'plan'),
          row('Services Outside This Code', s.callsWithoutBackend, s.callsWithoutBackend ? 'Medium' : 'Low', 'link', 'dependencies'),
          row('Roles and Segments', s.roles, 'Low', 'user', 'dependencies'),
          row('User Flows', s.flows, 'Low', 'branch', 'plan')
        ];
      });

      // Migration waves by complexity (estimates: 1, 3 and 5 days per small, medium and large screen)
      this.phases = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return [];
        }
        const wave = (n, name, c) => {
          const screens = inv.screens.filter((x) => x.complexity === c);
          return { n: n, name: name, screens: screens.length, days: screens.length * DAYS[c], text: screens.length + ' screens · ' + screens.length * DAYS[c] + ' days (estimate)' };
        };
        return [wave(1, 'Phase 1 - Small screens', 'S'), wave(2, 'Phase 2 - Medium screens', 'M'), wave(3, 'Phase 3 - Large screens', 'L')];
      });
      this.effortBars = ko.pureComputed(() => {
        const max = Math.max.apply(null, this.phases().map((p) => p.days).concat([1]));
        return this.phases().map((p) => ({ name: 'Phase ' + p.n, days: p.days, style: { height: Math.max(4, Math.round(120 * p.days / max)) + 'px' } }));
      });
      this.risk = ko.pureComputed(() => {
        const s = summary();
        if (!s || !s.screens) {
          return { total: 0, parts: [], style: { background: '#e5eaf1' } };
        }
        const parts = [{ label: 'Large', n: s.complexity.L, color: '#ef4444' }, { label: 'Medium', n: s.complexity.M, color: '#f59e0b' }, { label: 'Small', n: s.complexity.S, color: '#22c55e' }];
        let at = 0;
        const stops = parts.map((p) => { const from = at; at += 100 * p.n / s.screens; return p.color + ' ' + from + '% ' + at + '%'; });
        return {
          total: s.screens,
          parts: parts.map((p) => Object.assign(p, { dot: { background: p.color }, pct: Math.round(100 * p.n / s.screens) + '%' })),
          style: { background: 'conic-gradient(' + stops.join(', ') + ')' }
        };
      });
      // Module hub: the workspace in the middle and its modules around it
      this.hub = ko.pureComputed(() => {
        const modules = this.inventory() ? this.inventory().modules.slice(0, 8) : [];
        return modules.map((m, i) => {
          const angle = (2 * Math.PI * i) / Math.max(1, modules.length) - Math.PI / 2;
          const big = m.complexity.L > 0;
          return {
            name: m.name, detail: m.screens + ' screens', css: 'factory-mo-node ' + (big ? 'factory-mo-high' : m.complexity.M ? 'factory-mo-mid' : 'factory-mo-low'),
            style: { left: Math.round(50 + 38 * Math.cos(angle)) + '%', top: Math.round(50 + 38 * Math.sin(angle)) + '%' }
          };
        });
      });
      this.actions = ko.pureComputed(() => {
        const list = [];
        if (this.version() !== this.target()) {
          list.push({ text: 'Upgrade the OBDX framework to ' + this.target(), pill: ui.pill('High', 'red') });
        }
        this.findings().filter((f) => f.severity === 'ERROR').slice(0, 2).forEach((f) => list.push({ text: 'Replace: ' + f.rule + ' (' + f.module + ')', pill: ui.pill('High', 'red') }));
        if (summary() && summary().complexity.L) {
          list.push({ text: 'Plan the ' + summary().complexity.L + ' large screens first', pill: ui.pill('Medium', 'amber') });
        }
        if (summary() && summary().callsWithoutBackend) {
          list.push({ text: 'Check the ' + summary().callsWithoutBackend + ' product services the UI calls', pill: ui.pill('Medium', 'amber') });
        }
        list.push({ text: 'Run regression tests for the critical flows', pill: ui.pill('Low', 'green') });
        return list.slice(0, 5).map((a, i) => Object.assign(a, { n: i + 1 }));
      });

      // Deprecated usage: occurrences of what the rules forbid, in the existing code
      this.severityFilter = ko.observable('all');
      this.findingSearch = ko.observable('');
      this.findingSearchInput = ui.value(this.findingSearch);
      this.severityTabs = ui.tabs(this.severityFilter, [
        { value: 'all', label: 'All', count: ko.pureComputed(() => this.findings().length) },
        { value: 'ERROR', label: 'Critical', count: critical },
        { value: 'WARNING', label: 'Warning', count: ko.pureComputed(() => this.findings().length - critical()) }
      ]);
      this.visibleFindings = ko.pureComputed(() => {
        const text = this.findingSearch().trim().toLowerCase();
        return this.findings().filter((f) => (this.severityFilter() === 'all' || f.severity === this.severityFilter())
          && (!text || (f.rule + ' ' + f.path).toLowerCase().indexOf(text) >= 0));
      });
      const findUsage = (workspaceId, rules) => {
        this.findings([]);
        const candidates = rules.filter((r) => r.forbid && r.enabled).map((r) => ({ rule: r, term: searchTerm(r.forbid) })).filter((c) => c.term);
        if (!candidates.length) {
          return;
        }
        this.searchingFindings(true);
        Promise.all(candidates.map((c) => api.get('workspaces/' + workspaceId + '/search?q=' + encodeURIComponent(c.term) + '&limit=20').then((res) => {
          const pattern = toRegExp(c.rule.forbid);
          if (!pattern) {
            return [];
          }
          const seen = {};
          return res.results.filter((hit) => !seen[hit.path] && pattern.test(hit.snippet) && (seen[hit.path] = true)).map((hit) => ({
            rule: c.rule.title, severity: c.rule.severity, path: hit.path, module: hit.path.split('/').slice(-2, -1)[0] || '',
            lines: hit.startLine + '-' + hit.endLine, replacement: c.rule.message, type: hit.language,
            pill: c.rule.severity === 'ERROR' ? ui.pill('Critical', 'red') : ui.pill('Warning', 'amber')
          }));
        }).catch(() => []))).then((lists) => {
          if (workspaceId === this.workspaceId()) {
            this.findings([].concat.apply([], lists));
          }
        }).finally(() => this.searchingFindings(false));
      };

      // The inventory tables
      this.search = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.moduleFilter = ko.observable('');
      this.moduleChange = ui.value(this.moduleFilter);
      this.moduleNames = ko.pureComputed(() => (this.inventory() ? this.inventory().modules.map((m) => m.name) : []));
      this.screenRows = ko.pureComputed(() => {
        const inv = this.inventory();
        if (!inv) {
          return [];
        }
        const text = this.search().trim().toLowerCase();
        const names = {};
        inv.screens.forEach((s) => { names[s.id] = s.name; });
        return inv.screens.filter((s) => !this.moduleFilter() || s.module === this.moduleFilter())
          .filter((s) => !text || (s.name + ' ' + s.files.join(' ') + ' ' + s.calls.join(' ')).toLowerCase().indexOf(text) >= 0)
          .map((s) => ({
            name: s.name, module: s.module, kind: s.kind, complexity: s.complexity,
            wave: s.complexity === 'S' ? 'Phase 1' : s.complexity === 'M' ? 'Phase 2' : 'Phase 3',
            pill: s.complexity === 'L' ? ui.pill('Large', 'red') : s.complexity === 'M' ? ui.pill('Medium', 'amber') : ui.pill('Small', 'green'),
            fields: s.fields.length, actions: s.actions, calls: s.calls.join(', ') || '-',
            opens: s.opens.map((id) => names[id] || lastSegment(id)).join(', ') || '-', files: s.files.join(', ')
          }));
      });
      this.endpointRows = ko.pureComputed(() => (this.inventory() ? this.inventory().endpoints : []).map((e) => ({
        method: e.method, path: e.path, code: e.javaClass + '.' + e.javaMethod, product: e.product ? 'Oracle product' : 'Bank',
        usedBy: e.usedBy.length ? e.usedBy.map(lastSegment).join(', ') : '-'
      })));
      this.callRows = ko.pureComputed(() => (this.inventory() ? this.inventory().calls : []).map((c) => ({
        method: c.method, path: c.path, endpoint: c.endpoint || 'Not in this codebase (OBDX product service)',
        pill: c.endpoint ? ui.pill('In this code', 'green') : ui.pill('Product service', 'amber'), screens: c.screens.map(lastSegment).join(', ')
      })));
      this.roles = ko.pureComputed(() => (this.inventory() ? this.inventory().roles : []).map((r) => ({ name: r.name, source: r.source, evidence: r.evidence.join(', ') })));
      this.flows = ko.pureComputed(() => (this.inventory() ? this.inventory().flows : []));
      this.notes = ko.pureComputed(() => (this.inventory() ? this.inventory().notes : []));
      this.csvUrl = ko.pureComputed(() => 'api/workspaces/' + this.workspaceId() + '/inventory/screens.csv');
      this.compatibility = ko.pureComputed(() => [
        { from: 'OBDX 22.x', to22: ui.pill('Current', 'green'), to25: ui.pill('Upgrade', 'amber'), java: 'Java 8 → 11' },
        { from: 'OBDX 25.x', to22: ui.pill('Not supported', 'red'), to25: ui.pill('Current', 'green'), java: 'Java 11' }
      ]);
      this.packRules = ko.pureComputed(() => this.rules().map((r) => ({
        title: r.title, severity: r.severity === 'ERROR' ? ui.pill('Error', 'red') : ui.pill('Warning', 'amber'), message: r.message, appliesTo: r.appliesTo,
        enabled: r.enabled ? 'On' : 'Off'
      })));

      this.ai = assistant.create(() => {
        const inv = this.inventory();
        if (!inv) {
          return '';
        }
        const s = inv.summary;
        return 'Workspace on OBDX ' + this.version() + ', target ' + this.target() + '.\nInventory: ' + s.screens + ' screens in ' + s.modules + ' modules (small ' + s.complexity.S
          + ', medium ' + s.complexity.M + ', large ' + s.complexity.L + '), ' + s.endpoints + ' backend services, ' + s.calledServices + ' services called by the UI ('
          + s.callsWithoutBackend + ' outside this code), ' + s.roles + ' roles, ' + s.flows + ' flows.\nModules: ' + inv.modules.map((m) => m.name + ' (' + m.screens + ')').join(', ')
          + '\nStack: ' + this.stack().map((r) => r.name + ': ' + r.value).join('; ')
          + '\nDeprecated usage found: ' + this.findings().slice(0, 40).map((f) => f.rule + ' in ' + f.path).join('; ')
          + '\nLarge screens: ' + inv.screens.filter((x) => x.complexity === 'L').slice(0, 20).map((x) => x.name).join(', ');
      }, ['What are the main changes for the upgrade?', 'Generate a migration plan', 'Which screens should go first?', 'Explain the deprecated usage']);

      const show = (inventory) => {
        this.errorMessage('');
        this.inventory(inventory);
        this.emptyMessage(inventory ? '' : 'This workspace has not been scanned yet. Import its code (Code page), then Run Analysis.');
      };
      const load = (id) => {
        this.inventory(null);
        this.profile(null);
        this.findings([]);
        this.errorMessage('');
        this.emptyMessage('');
        if (!id) {
          return;
        }
        api.get('workspaces/' + id).then((w) => this.workspace(w)).catch(() => null);
        api.get('workspaces/' + id + '/profile').then((p) => this.profile(p)).catch(() => null);
        api.get('workspaces/' + id + '/checks').then((c) => { this.rules(c.rules); findUsage(id, c.rules); }).catch(() => null);
        api.get('workspaces/' + id + '/inventory')
          .then((inventory) => { if (id === this.workspaceId()) { show(inventory || null); } })
          .catch(showError);
      };
      this.scan = () => {
        this.busy(true);
        api.post('workspaces/' + this.workspaceId() + '/inventory/scan').then(show).catch(showError).finally(() => this.busy(false));
      };
      this.rescanFindings = () => findUsage(this.workspaceId(), this.rules());
      this.showPlan = () => this.tab('plan');

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Modernization page loaded.');
        document.title = 'Modernization';
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

    return ModernizationViewModel;
  }
);
