/*
 * Impact Analysis page: what a change's plan touches before code is generated. The affected files by layer and module,
 * a layered dependency view, the plan's tasks, the requirement it comes from, test impact, risks and approvals.
 * Everything comes from the change's plan (made by the impact analysis) and its requirement's specification; the lines
 * in the dependency view are inferred from the layers, not read from the code.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/dialog', '../services/toast', 'ojs/ojknockout', 'ojs/ojbutton', 'ojs/ojinputtext'],
  function (ko, accUtils, api, workspaceSelection, session, ui, dialog, toast) {
    const LAYERS = [
      { key: 'ui', label: 'UI Component', color: '#6366f1', icon: 'monitor' },
      { key: 'service', label: 'Service', color: '#16a34a', icon: 'cog' },
      { key: 'integration', label: 'Integration', color: '#8b5cf6', icon: 'plug' },
      { key: 'data', label: 'Database', color: '#ea580c', icon: 'cube' },
      { key: 'config', label: 'Configuration', color: '#0891b2', icon: 'cog' },
      { key: 'test', label: 'Test', color: '#db2777', icon: 'flask' }
    ].map((l) => Object.assign(l, { bg: 'color-mix(in srgb, ' + l.color + ' 16%, transparent)' }));
    // A status badge (design system fx-badge): tone is success, warning, danger, info, primary, violet or neutral
    const badge = (text, tone) => ({ text: text, css: 'fx-badge' + (tone && tone !== 'neutral' ? ' fx-badge--' + tone : '') });
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
          { label: 'Affected Files', value: items().length, sub: count((i) => i.action === 'modify') + ' modified, ' + count((i) => i.action === 'create') + ' new', tone: 'blue', icon: 'doc', css: 'factory-kpi-sub factory-im-sub-link' },
          { label: 'Affected Classes', value: java.length, sub: services + ' services, ' + (java.length - services) + ' other', tone: 'green', icon: 'cube', css: 'factory-kpi-sub' },
          { label: 'Affected APIs', value: spec ? spec.apis.length : 0, sub: count((i) => i.layer === 'integration') + ' integration files', tone: 'violet', icon: 'link', css: 'factory-kpi-sub' },
          { label: 'Database Objects', value: count((i) => i.layer === 'data'), sub: 'data scripts in the plan', tone: 'amber', icon: 'cube', css: 'factory-kpi-sub' },
          { label: 'Test Cases', value: count((i) => i.layer === 'test'), sub: count((i) => i.layer === 'test' && i.action === 'create') + ' new', tone: 'red', icon: 'alert', css: 'factory-kpi-sub factory-im-sub-bad' }
        ].map((k) => Object.assign(k, { iconCss: 'fx-kpi-icon factory-im-tone-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
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
          type: items().some((i) => i.action === 'modify') ? badge('Enhancement', 'primary') : badge('New Feature', 'success'),
          module: modules.slice(0, 2).join(', ') || '–',
          version: this.workspace() ? 'OBDX ' + this.workspace().obdxVersion : '–',
          // Neither the change nor its requirement records a priority
          priority: Object.assign(badge('Not set', 'neutral'), { title: 'The requirement and the plan do not record a priority.' }),
          status: badge(d.status.replace('_', ' ').toLowerCase(), d.status === 'PLAN_READY' ? 'warning' : 'primary')
        };
      });
      this.scope = ko.pureComputed(() => {
        const has = (layer) => items().some((i) => i.layer === layer);
        const path = (re) => items().some((i) => re.test(i.path));
        const layerWhy = 'From the files of the plan in this layer';
        return [
          { label: 'UI Changes', on: has('ui'), why: layerWhy }, { label: 'Backend Changes', on: has('service'), why: layerWhy },
          { label: 'API Changes', on: has('integration'), why: layerWhy }, { label: 'Database Changes', on: has('data'), why: layerWhy },
          { label: 'Configuration Changes', on: has('config'), why: layerWhy },
          { label: 'Security Changes', on: path(/secur|auth|login|permission|role|crypt/i), why: 'A file path in the plan mentions security, authentication or roles' },
          { label: 'Test Cases', on: has('test'), why: layerWhy },
          { label: 'Documentation', on: path(/\.(md|txt|adoc|docx?)$|\/docs?\//i), why: 'A documentation file is in the plan' }
        ];
      });

      // Editing the plan's description; only possible while the plan waits for approval
      this.editing = ko.observable(false);
      this.summaryDraft = ko.observable('');
      this.canEditPlan = ko.pureComputed(() => !!(this.detail() && this.detail().plan && this.detail().status === 'PLAN_READY' && this.canManage()));
      this.editTitle = ko.pureComputed(() => (this.canEditPlan() ? 'Edit the description of the plan'
        : (this.detail() && this.detail().status !== 'PLAN_READY' ? 'The plan can be edited only before it is approved' : 'You need the right to manage code')));
      this.toggleEdit = () => {
        this.summaryDraft(this.editing() ? '' : (this.detail().plan.summary || ''));
        this.editing(!this.editing());
      };
      this.canSavePlan = ko.pureComputed(() => this.canEditPlan() && this.editing() && this.summaryDraft().trim() !== '' && this.summaryDraft() !== this.detail().plan.summary);
      this.savePlanTitle = ko.pureComputed(() => (this.canSavePlan() ? 'Save the edited plan' : (this.canEditPlan() ? 'Use Edit to change the plan first' : this.editTitle())));
      this.savePlan = () => {
        const plan = Object.assign({}, this.detail().plan, { summary: this.summaryDraft().trim() });
        api.put('changes/' + this.detail().id + '/plan', JSON.stringify(plan))
          .then((d) => { this.editing(false); this.detail(d); this.errorMessage(''); toast.success('Plan saved.'); }).catch(showError);
      };
      this.createPlan = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }));

      // The dependency view: the plan's files in columns by layer, sized to the card; arrows join each file to the files
      // of the next layer
      this.graphWidth = ko.observable(520);
      this.zoom = ko.observable(1);
      this.zoomText = ko.pureComputed(() => Math.round(this.zoom() * 100) + '%');
      this.zoomIn = () => this.zoom(Math.min(2, Math.round((this.zoom() + 0.2) * 10) / 10));
      this.zoomOut = () => this.zoom(Math.max(0.6, Math.round((this.zoom() - 0.2) * 10) / 10));
      this.fullscreen = () => {
        const card = document.getElementById('dependencyGraphCard');
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (card && card.requestFullscreen) {
          card.requestFullscreen().catch(() => this.errorMessage('The browser does not allow full screen here.'));
        }
      };
      const measureGraph = () => {
        const wrap = document.getElementById('dependencyGraphWrap');
        if (wrap && wrap.clientWidth) {
          this.graphWidth(wrap.clientWidth - 2);
        }
      };
      // A file name that can wrap onto two lines: break points after . - _ and between camelCase words
      const breakable = (name) => name.replace(/([._-])/g, '$1\u200B').replace(/([a-z0-9])([A-Z])/g, '$1\u200B$2');
      this.graph = ko.pureComputed(() => {
        const columns = LAYERS.filter((l) => l.key !== 'test').map((l) => ({ layer: l, files: items().filter((i) => i.layer === l.key) })).filter((c) => c.files.length);
        const n = Math.max(1, columns.length);
        const gap = 36;
        const width = Math.max(n * 150 + (n - 1) * gap + 20, this.graphWidth());
        const nodeW = Math.min(210, Math.floor((width - 20 - (n - 1) * gap) / n));
        const step = n > 1 ? Math.floor((width - 20 - nodeW) / (n - 1)) : 0;
        const rowH = 76;
        const nodeH = 60;
        const most = Math.max.apply(null, columns.map((c) => c.files.length).concat([1]));
        const height = most * rowH + 16;
        const nodes = [];
        columns.forEach((c, ci) => {
          const top = 8 + (most - c.files.length) * rowH / 2;
          c.files.forEach((f, fi) => {
            const x = 10 + ci * step;
            const y = top + fi * rowH;
            nodes.push({
              x: x, y: y, w: nodeW, h: nodeH, ci: ci, kind: c.layer.label,
              name: breakable(f.path.split('/').pop()), path: f.path, action: f.action === 'create' ? 'new' : 'modified',
              icon: 'factory-nav-icon factory-ico-' + c.layer.icon, iconStyle: { background: c.layer.bg, color: c.layer.color },
              style: { left: x + 'px', top: y + 'px', width: nodeW + 'px', height: nodeH + 'px', borderColor: c.layer.color, background: 'var(--fx-surface)' }
            });
          });
        });
        const edges = [];
        nodes.forEach((a) => nodes.filter((b) => b.ci === a.ci + 1).forEach((b) => {
          const x1 = a.x + a.w;
          const y1 = a.y + a.h / 2;
          const x2 = b.x - 3;
          const y2 = b.y + b.h / 2;
          const mid = (x1 + x2) / 2;
          edges.push('M' + x1 + ',' + y1 + ' C' + mid + ',' + y1 + ' ' + mid + ',' + y2 + ' ' + x2 + ',' + y2);
        }));
        // The arrows are drawn as one SVG image under the nodes
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">'
          + '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#7b8aa0"/></marker></defs>'
          + edges.slice(0, 80).map((d) => '<path d="' + d + '" fill="none" stroke="#7b8aa0" stroke-width="1.5" marker-end="url(#a)"/>').join('') + '</svg>';
        const z = this.zoom();
        return {
          nodes: nodes, width: width, height: height, lines: 'data:image/svg+xml,' + encodeURIComponent(svg),
          style: { width: width + 'px', height: height + 'px', transform: 'scale(' + z + ')', transformOrigin: '0 0' },
          outer: { width: Math.round(width * z) + 'px', height: Math.round(height * z) + 'px' }
        };
      });
      this.legend = LAYERS.map((l) => ({ label: l.label, style: { background: l.color } }));

      // Affected files with filters
      this.fileSearch = ko.observable('');
      this.layerFilter = ko.observable('');
      this.actionFilter = ko.observable('');
      this.moduleFilter = ko.observable('');
      this.impactFilter = ko.observable('');
      this.fileSearchInput = ui.value(this.fileSearch);
      this.layerChange = ui.value(this.layerFilter);
      this.actionChange = ui.value(this.actionFilter);
      this.moduleChange = ui.value(this.moduleFilter);
      this.impactChange = ui.value(this.impactFilter);
      this.moduleOptions = ko.pureComputed(() => Array.from(new Set(items().map((i) => moduleOf(i.path)))).sort());
      this.clearFilters = () => {
        ['impactFileSearch', 'impactLayer', 'impactModule', 'impactLevel'].forEach((id) => {
          const el = document.getElementById(id);
          if (el) {
            el.value = '';
          }
        });
        [this.fileSearch, this.layerFilter, this.actionFilter, this.moduleFilter, this.impactFilter].forEach((o) => o(''));
      };
      this.files = ko.pureComputed(() => {
        const text = this.fileSearch().trim().toLowerCase();
        return items().filter((i) => (!text || i.path.toLowerCase().indexOf(text) >= 0) && (!this.layerFilter() || i.layer === this.layerFilter())
          && (!this.actionFilter() || i.action === this.actionFilter()) && (!this.moduleFilter() || moduleOf(i.path) === this.moduleFilter())).map((i) => {
          // Estimated impact: changing shared or existing code weighs more than adding a file
          const shared = /common|shared|util|base/i.test(i.path);
          const impact = i.action === 'modify' ? (shared ? badge('High', 'danger') : badge('Medium', 'warning')) : badge('Low', 'success');
          return {
            path: i.path, pathWrap: i.path.replace(/\//g, '/\u200B'), type: (i.path.split('.').pop() || '').toUpperCase(), module: moduleOf(i.path), layer: i.layer, impact: impact,
            change: i.action === 'create' ? badge('New', 'primary') : badge('Modified', 'violet'), purpose: i.purpose
          };
        }).filter((f) => !this.impactFilter() || f.impact.text === this.impactFilter());
      });
      this.filePager = ui.pages(this.files, 8, [8, 25, 50]);

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
          style: { background: stops.length ? 'conic-gradient(' + stops.join(', ') + ')' : 'var(--fx-surface-3)' }
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
        return n === 0 ? badge('Low', 'success') : n <= 2 ? badge('Low - Medium', 'success') : n <= 4 ? badge('Medium', 'warning') : badge('High', 'danger');
      });
      this.nextSteps = ko.pureComputed(() => {
        const s = this.detail() ? this.detail().status : '';
        const steps = ['Review impacted files and dependencies', 'Validate the change plan with the business team', 'Approve the plan', 'Generate code using the AI agent', 'Run build, test and review'];
        const doneUntil = s === 'PLAN_READY' ? 0 : ['GENERATING'].indexOf(s) >= 0 ? 3 : ['GENERATED'].indexOf(s) >= 0 ? 4 : ['DELIVERED', 'CLOSED'].indexOf(s) >= 0 ? 5 : 0;
        return steps.map((t, i) => ({ n: i + 1, text: t, done: i < doneUntil, css: 'factory-step-dot factory-dot-blue' }));
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
          { step: 'Impact analysis', state: d.plan ? badge('Done', 'success') : badge('Running', 'info'), who: 'AI agent', when: ui.when(d.createdAt) },
          { step: 'Plan approval', state: d.planApprovedAt ? badge('Approved', 'success') : badge('Waiting', 'warning'), who: d.planApprovedBy || '–', when: ui.when(d.planApprovedAt) }
        ];
      });
      this.reqCode = ko.pureComputed(() => (this.detail() ? code('REQ', this.detail().requirementId, 4) : ''));

      const base = () => 'changes/' + this.detail().id;
      this.canAnalyze = ko.pureComputed(() => !!this.detail() && this.canManage());
      this.analyzeTip = ko.pureComputed(() => (!this.detail() ? 'Choose a change first' : (this.canManage() ? 'Run the impact analysis again' : 'You need the right to manage code')));
      this.canApprovePlan = ko.pureComputed(() => !!this.detail() && this.detail().status === 'PLAN_READY' && this.canApprove());
      this.approveTip = ko.pureComputed(() => (!this.detail() ? 'Choose a change first'
        : (this.detail().status !== 'PLAN_READY' ? 'This plan is already approved' : (this.canApprove() ? 'Approve the plan and write the code' : 'Only the Lead role can approve the plan'))));
      const failed = (error) => { showError(error); toast.error(error.message); };
      this.approvePlan = () => {
        dialog.confirm({ title: 'Approve this plan?', message: 'The model will write ' + items().length + ' file(s) for this change.', confirmLabel: 'Approve Plan' }).then((ok) => {
          if (!ok) {
            return;
          }
          api.post(base() + '/approve-plan').then((d) => { this.detail(d); this.errorMessage(''); toast.success('Plan approved. The model is writing the code.'); }).catch(failed);
        });
      };
      this.analyzeAgain = () => api.post(base() + '/analyze').then((d) => { this.detail(d); this.errorMessage(''); toast.info('Impact analysis started again.'); }).catch(failed);
      this.openWorkbench = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }));

      this.changeId.subscribe((id) => {
        this.detail(null);
        this.requirement(null);
        if (!id) {
          return;
        }
        this.editing(false);
        api.get('changes/' + id).then((d) => {
          this.detail(d);
          setTimeout(measureGraph, 60);
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
        window.addEventListener('resize', measureGraph);
        this.tab.subscribe(() => setTimeout(measureGraph, 60));
      };
      this.disconnected = () => {
        window.removeEventListener('resize', measureGraph);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return ImpactViewModel;
  }
);
