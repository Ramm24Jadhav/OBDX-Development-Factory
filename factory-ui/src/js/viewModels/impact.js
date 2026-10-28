/*
 * Impact Analysis page: what a change's plan touches before code is generated. The affected files by layer and module,
 * a layered dependency view, the plan's tasks, the requirement it comes from, test impact, risks and approvals.
 * Everything comes from the change's plan (made by the impact analysis) and its requirement's specification; the lines
 * in the dependency view are inferred from the layers, not read from the code.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        'ojs/ojknockout', 'ojs/ojbutton'],
  function (ko, accUtils, api, workspaceSelection, session, ui) {
    const LAYERS = [
      { key: 'ui', label: 'UI Component', color: '#2563eb' },
      { key: 'service', label: 'Service', color: '#16a34a' },
      { key: 'integration', label: 'Integration', color: '#7c3aed' },
      { key: 'data', label: 'Database', color: '#ea580c' },
      { key: 'config', label: 'Configuration', color: '#0891b2' },
      { key: 'test', label: 'Test', color: '#db2777' }
    ];
    const code = (prefix, id, n) => prefix + '-' + id.replace(/-/g, '').slice(0, n).toUpperCase();
    const moduleOf = (path) => {
      const parts = path.split('/').filter(Boolean);
      const known = parts.findIndex((p) => /^(modules|components|service|services|controller|dao|ui|api)$/i.test(p));
      return known >= 0 && parts[known + 1] ? parts[known + 1] : (parts.length > 1 ? parts[parts.length - 2] : parts[0]);
    };

    function ImpactViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.canManage = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.errorMessage = ko.observable('');
      this.changes = ko.observableArray([]);
      this.changeId = ko.observable('');
      this.detail = ko.observable(null);
      this.requirement = ko.observable(null);
      this.workspace = ko.observable(null);
      this.changeChange = (event) => this.changeId(event.target.value);
      const showError = (error) => this.errorMessage(error.message);

      const items = ko.pureComputed(() => (this.detail() && this.detail().plan ? this.detail().plan.items : []));
      const count = (test) => items().filter(test).length;
      this.kpis = ko.pureComputed(() => {
        const java = items().filter((i) => /\.java$/.test(i.path));
        const services = java.filter((i) => /service/i.test(i.path)).length;
        const spec = this.requirement() && this.requirement().spec;
        return [
          { label: 'Affected Files', value: items().length, sub: count((i) => i.action === 'modify') + ' modified, ' + count((i) => i.action === 'create') + ' new', tone: 'blue', icon: 'doc', css: 'factory-kpi-sub factory-link' },
          { label: 'Affected Classes', value: java.length, sub: services + ' services, ' + (java.length - services) + ' other', tone: 'green', icon: 'cube', css: 'factory-kpi-sub' },
          { label: 'Affected APIs', value: spec ? spec.apis.length : 0, sub: count((i) => i.layer === 'integration') + ' integration files', tone: 'violet', icon: 'link', css: 'factory-kpi-sub' },
          { label: 'Database Objects', value: count((i) => i.layer === 'data'), sub: 'data scripts in the plan', tone: 'amber', icon: 'cube', css: 'factory-kpi-sub' },
          { label: 'Test Cases', value: count((i) => i.layer === 'test'), sub: count((i) => i.layer === 'test' && i.action === 'create') + ' new', tone: 'red', icon: 'alert', css: 'factory-kpi-sub factory-bad' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });

      this.tab = ko.observable('impact');
      this.tabs = ui.tabs(this.tab, [
        { value: 'impact', label: 'Impact Analysis', icon: 'branch' },
        { value: 'graph', label: 'Dependency Graph', icon: 'plug' },
        { value: 'plan', label: 'Change Plan', icon: 'list' },
        { value: 'requirements', label: 'Related Requirements', icon: 'doc' },
        { value: 'tests', label: 'Test Impact', icon: 'flask' },
        { value: 'approvals', label: 'Review & Approvals', icon: 'check' }
      ]);

      this.proposed = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return null;
        }
        const modules = Array.from(new Set(items().map((i) => moduleOf(i.path))));
        return {
          title: d.title,
          description: d.plan ? d.plan.summary : 'The impact analysis is running.',
          type: items().some((i) => i.action === 'modify') ? ui.pill('Enhancement', 'blue') : ui.pill('New Feature', 'green'),
          module: modules.slice(0, 2).join(', ') || '–',
          version: this.workspace() ? 'OBDX ' + this.workspace().obdxVersion : '–',
          status: ui.pill(d.status.replace('_', ' ').toLowerCase(), d.status === 'PLAN_READY' ? 'amber' : 'blue')
        };
      });
      this.scope = ko.pureComputed(() => {
        const has = (layer) => items().some((i) => i.layer === layer);
        return [
          { label: 'UI Changes', on: has('ui') }, { label: 'Backend Changes', on: has('service') }, { label: 'API Changes', on: has('integration') },
          { label: 'Database Changes', on: has('data') }, { label: 'Configuration Changes', on: has('config') }, { label: 'Test Cases', on: has('test') }
        ];
      });

      // The dependency view: the plan's files in columns by layer; lines join each file to the files of the next layer
      this.graph = ko.pureComputed(() => {
        const columns = LAYERS.filter((l) => l.key !== 'test').map((l) => ({ layer: l, files: items().filter((i) => i.layer === l.key) })).filter((c) => c.files.length);
        const width = Math.max(1, columns.length) * 200;
        const rowH = 64;
        const height = Math.max(1, Math.max.apply(null, columns.map((c) => c.files.length).concat([1]))) * rowH + 20;
        const nodes = [];
        columns.forEach((c, ci) => c.files.forEach((f, fi) => nodes.push({
          x: ci * 200 + 10, y: fi * rowH + 10, w: 176, h: 48, ci: ci, color: c.layer.color, kind: c.layer.label,
          name: f.path.split('/').pop(), path: f.path, action: f.action === 'create' ? 'new' : 'modified',
          style: { left: (ci * 200 + 10) + 'px', top: (fi * rowH + 10) + 'px', borderColor: c.layer.color }
        })));
        const edges = [];
        nodes.forEach((a) => nodes.filter((b) => b.ci === a.ci + 1).forEach((b) => edges.push({
          d: 'M' + (a.x + a.w) + ',' + (a.y + a.h / 2) + ' C' + (a.x + a.w + 12) + ',' + (a.y + a.h / 2) + ' ' + (b.x - 12) + ',' + (b.y + b.h / 2) + ' ' + b.x + ',' + (b.y + b.h / 2)
        })));
        // The lines are drawn as one SVG image under the nodes
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">'
          + edges.slice(0, 80).map((e) => '<path d="' + e.d + '" fill="none" stroke="#94a3b8" stroke-width="1.4" stroke-dasharray="4 3"/>').join('') + '</svg>';
        return {
          nodes: nodes, width: width, height: height, lines: 'data:image/svg+xml,' + encodeURIComponent(svg),
          style: { width: width + 'px', height: height + 'px' }
        };
      });
      this.legend = LAYERS.map((l) => ({ label: l.label, style: { background: l.color } }));

      // Affected files with filters
      this.fileSearch = ko.observable('');
      this.layerFilter = ko.observable('');
      this.actionFilter = ko.observable('');
      this.fileSearchInput = ui.value(this.fileSearch);
      this.layerChange = ui.value(this.layerFilter);
      this.actionChange = ui.value(this.actionFilter);
      this.files = ko.pureComputed(() => {
        const text = this.fileSearch().trim().toLowerCase();
        return items().filter((i) => (!text || i.path.toLowerCase().indexOf(text) >= 0) && (!this.layerFilter() || i.layer === this.layerFilter())
          && (!this.actionFilter() || i.action === this.actionFilter())).map((i) => {
          // Estimated impact: changing shared or existing code weighs more than adding a file
          const shared = /common|shared|util|base/i.test(i.path);
          const impact = i.action === 'modify' ? (shared ? ui.pill('High', 'red') : ui.pill('Medium', 'amber')) : ui.pill('Low', 'green');
          return {
            path: i.path, type: (i.path.split('.').pop() || '').toUpperCase(), module: moduleOf(i.path), layer: i.layer, impact: impact,
            change: i.action === 'create' ? ui.pill('New', 'blue') : ui.pill('Modified', 'violet'), purpose: i.purpose
          };
        });
      });
      this.filePager = ui.pager(this.files, 8);

      // Summary by layer (donut) and by module (bars)
      this.byLayer = ko.pureComputed(() => {
        const total = items().length || 1;
        let start = 0;
        const parts = LAYERS.map((l) => ({ label: l.label, color: l.color, n: items().filter((i) => i.layer === l.key).length })).filter((p) => p.n);
        const stops = parts.map((p) => {
          const from = start;
          start += 100 * p.n / total;
          return p.color + ' ' + from + '% ' + start + '%';
        });
        return {
          parts: parts.map((p) => Object.assign(p, { dot: { background: p.color } })),
          style: { background: stops.length ? 'conic-gradient(' + stops.join(', ') + ')' : '#e5eaf1' }
        };
      });
      this.byModule = ko.pureComputed(() => {
        const counts = {};
        items().forEach((i) => { const m = moduleOf(i.path); counts[m] = (counts[m] || 0) + 1; });
        const max = Math.max.apply(null, Object.values(counts).concat([1]));
        return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 6)
          .map((m) => ({ name: m, n: counts[m], style: { width: Math.round(100 * counts[m] / max) + '%' } }));
      });
      this.risks = ko.pureComputed(() => (this.detail() && this.detail().plan ? this.detail().plan.risks : []));
      this.riskLevel = ko.pureComputed(() => {
        const n = this.risks().length;
        return n === 0 ? ui.pill('Low', 'green') : n <= 2 ? ui.pill('Low - Medium', 'green') : n <= 4 ? ui.pill('Medium', 'amber') : ui.pill('High', 'red');
      });
      this.nextSteps = ko.pureComputed(() => {
        const s = this.detail() ? this.detail().status : '';
        const steps = ['Review impacted files and dependencies', 'Validate the change plan with the business team', 'Approve the plan', 'Generate code using the AI agent', 'Run build, test and review'];
        const doneUntil = s === 'PLAN_READY' ? 0 : ['GENERATING'].indexOf(s) >= 0 ? 3 : ['GENERATED'].indexOf(s) >= 0 ? 4 : ['DELIVERED', 'CLOSED'].indexOf(s) >= 0 ? 5 : 0;
        return steps.map((t, i) => ({ n: i + 1, text: t, css: i < doneUntil ? 'factory-step-dot factory-dot-green' : 'factory-step-dot factory-dot-blue' }));
      });

      this.planRows = ko.pureComputed(() => items().map((i, n) => ({
        n: n + 1, path: i.path, action: i.action, layer: i.layer, purpose: i.purpose, details: i.details || '', basedOn: (i.basedOn || []).join(', ')
      })));
      this.specScreens = ko.pureComputed(() => (this.requirement() && this.requirement().spec ? this.requirement().spec.screens : []));
      this.specApis = ko.pureComputed(() => (this.requirement() && this.requirement().spec ? this.requirement().spec.apis : []));
      this.tests = ko.pureComputed(() => items().filter((i) => i.layer === 'test').map((i) => ({ path: i.path, purpose: i.purpose, action: i.action })));
      this.untested = ko.pureComputed(() => items().filter((i) => i.layer !== 'test' && i.layer !== 'config'
        && !items().some((t) => t.layer === 'test' && t.path.toLowerCase().indexOf((i.path.split('/').pop() || '').replace(/\.\w+$/, '').toLowerCase()) >= 0)).map((i) => i.path));
      this.approvals = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        return [
          { step: 'Impact analysis', state: d.plan ? ui.pill('Done', 'green') : ui.pill('Running', 'blue'), who: 'AI agent', when: ui.when(d.createdAt) },
          { step: 'Plan approval', state: d.planApprovedAt ? ui.pill('Approved', 'green') : ui.pill('Waiting', 'amber'), who: d.planApprovedBy || '–', when: ui.when(d.planApprovedAt) }
        ];
      });
      this.reqCode = ko.pureComputed(() => (this.detail() ? code('REQ', this.detail().requirementId, 4) : ''));

      const base = () => 'changes/' + this.detail().id;
      this.approvePlan = () => {
        if (!window.confirm('Approve this plan? The model will write ' + items().length + ' file(s).')) {
          return;
        }
        api.post(base() + '/approve-plan').then((d) => this.detail(d)).catch(showError);
      };
      this.analyzeAgain = () => api.post(base() + '/analyze').then((d) => this.detail(d)).catch(showError);
      this.openWorkbench = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }));

      this.changeId.subscribe((id) => {
        this.detail(null);
        this.requirement(null);
        if (!id) {
          return;
        }
        api.get('changes/' + id).then((d) => {
          this.detail(d);
          return api.get('requirements/' + d.requirementId).then((r) => this.requirement(r)).catch(() => null);
        }).catch(showError);
      });
      const loadList = () => {
        const id = this.workspaceId();
        this.changes([]);
        this.changeId('');
        if (!id) {
          return;
        }
        api.get('workspaces/' + id).then((w) => this.workspace(w)).catch(() => null);
        api.get('workspaces/' + id + '/changes').then((list) => {
          this.changes(list.map((c) => ({ id: c.id, label: code('CHG', c.id, 3) + ' – ' + c.title })));
          if (list.length) {
            this.changeId(list[0].id);
          }
        }).catch(showError);
      };

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Impact Analysis page loaded.');
        document.title = 'Impact Analysis';
        subscription = this.workspaceId.subscribe(loadList);
        workspaceSelection.load().then(loadList).catch(showError);
      };
      this.disconnected = () => {
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return ImpactViewModel;
  }
);
