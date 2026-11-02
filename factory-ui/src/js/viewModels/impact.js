/*
 * Impact Analysis page: the plan of a change, for the developer who approves it before any code is generated. First
 * the change, its plan's status and what approval unblocks; then one row of tabs: the affected files with scope
 * filters, the dependency view (focus on a file, hide layers), the risks the analysis found, the plan's revisions to
 * compare, the review (comments, a request for changes, the approval) and the requirement. Everything comes from the
 * change's plan, its recorded revisions and comments, and its requirement's specification; the lines in the dependency
 * view are inferred from the layers, not read from the code.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/dialog', '../services/toast', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, dialog, toast) {
    const LAYERS = [
      { key: 'ui', label: 'UI', color: '#6366f1', icon: 'monitor' },
      { key: 'service', label: 'Service', color: '#16a34a', icon: 'cog' },
      { key: 'integration', label: 'Integration', color: '#8b5cf6', icon: 'plug' },
      { key: 'data', label: 'Database', color: '#ea580c', icon: 'cube' },
      { key: 'config', label: 'Configuration', color: '#0891b2', icon: 'cog' },
      { key: 'test', label: 'Test', color: '#db2777', icon: 'flask' }
    ].map((l) => Object.assign(l, { bg: 'color-mix(in srgb, ' + l.color + ' 16%, transparent)' }));
    const layerOf = (key) => LAYERS.find((l) => l.key === key) || { key: key, label: key, color: '#64748b', icon: 'doc', bg: 'transparent' };
    // A status badge (design system fx-badge): tone is success, warning, danger, info, primary, violet or neutral
    const badge = (text, tone) => ({ text: text, css: 'fx-badge' + (tone && tone !== 'neutral' ? ' fx-badge--' + tone : '') });
    // The change's status in the words of the Changes page; ui.status gives the colour and the icon
    const STATUS_WORDS = { ANALYZING: 'Analyzing', PLAN_READY: 'Plan to review', GENERATING: 'Writing code', GENERATED: 'Code to review', DELIVERED: 'Delivered', FAILED: 'Failed', CLOSED: 'Closed' };
    // The plan can only create or modify files (ChangePlan.Item.action)
    const OPERATIONS = { create: 'Create', modify: 'Modify' };
    const code = (prefix, id, n) => prefix + '-' + id.replace(/-/g, '').slice(0, n).toUpperCase();
    const moduleOf = (path) => {
      const parts = path.split('/').filter(Boolean);
      const known = parts.findIndex((p) => /^(modules|components|service|services|controller|dao|ui|api)$/i.test(p));
      return known >= 0 && parts[known + 1] ? parts[known + 1] : (parts.length > 1 ? parts[parts.length - 2] : parts[0]);
    };
    const fileName = (path) => path.split('/').pop() || path;
    // Requirement references a planned file names in its purpose or details (FR-001, AC-002, BR-003)
    const REFS = /\b(?:FR|AC|BR|NFR|US|REQ)-\d+\b/g;
    /**
     * The analysis's risks by kind, from the wording PlanReview gives them (change/PlanReview.java); anything else is a
     * risk the impact analysis itself named.
     */
    const RISK_KINDS = [
      { key: 'tests', title: 'Missing test coverage', test: (r) => r.indexOf('The spec has acceptance criteria but the plan writes no test') === 0 },
      { key: 'api', title: 'API in the spec without an implementation', test: (r) => r.indexOf('No planned file serves the API ') === 0 },
      { key: 'product', title: 'New REST resource under an OBDX product path', test: (r) => r.indexOf('A new REST resource for ') === 0 && r.indexOf("OBDX's own services") >= 0 },
      { key: 'served', title: 'New REST resource on a path the bank\'s code already serves', test: (r) => r.indexOf('A new REST resource for ') === 0 },
      { key: 'name', title: 'New class with the name of an existing one', test: (r) => r.indexOf('A new class has the name of an existing one') === 0 },
      { key: 'other', title: 'Named by the impact analysis', test: () => true }
    ];

    /** What changed from one plan revision to another, in plain words. */
    const planDifferences = (from, to) => {
      const out = [];
      const add = (kind, text, path) => out.push({ kind: kind, text: text, path: path || null, css: 'factory-im-diff factory-im-diff-' + kind.toLowerCase() });
      if ((from.summary || '') !== (to.summary || '')) {
        add('Changed', 'The description of the plan');
      }
      const before = {};
      (from.items || []).forEach((i) => { before[i.path] = i; });
      const after = {};
      (to.items || []).forEach((i) => { after[i.path] = i; });
      (to.items || []).filter((i) => !before[i.path]).forEach((i) => add('Added', OPERATIONS[i.action] + ' ' + i.path, i.path));
      (from.items || []).filter((i) => !after[i.path]).forEach((i) => add('Removed', OPERATIONS[i.action] + ' ' + i.path));
      (to.items || []).filter((i) => before[i.path]).forEach((i) => {
        const a = before[i.path];
        const what = [];
        if (a.action !== i.action) { what.push('operation ' + OPERATIONS[a.action] + ' to ' + OPERATIONS[i.action]); }
        if (a.layer !== i.layer) { what.push('layer ' + a.layer + ' to ' + i.layer); }
        if ((a.purpose || '') !== (i.purpose || '')) { what.push('reason'); }
        if ((a.details || '') !== (i.details || '')) { what.push('details'); }
        if ((a.basedOn || []).join() !== (i.basedOn || []).join()) { what.push('patterns it follows'); }
        if (what.length) {
          add('Changed', i.path + ': ' + what.join(', '), i.path);
        }
      });
      const risksBefore = from.risks || [];
      const risksAfter = to.risks || [];
      risksAfter.filter((r) => risksBefore.indexOf(r) < 0).forEach((r) => add('Added', 'Risk: ' + r));
      risksBefore.filter((r) => risksAfter.indexOf(r) < 0).forEach((r) => add('Removed', 'Risk: ' + r));
      if (out.length === 0) {
        add('Same', 'The two revisions plan the same files and risks.');
      }
      return out;
    };

    function ImpactViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.canManage = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.canComment = ko.pureComputed(() => session.can(this.workspaceId(), 'COMMENT'));
      this.errorMessage = ko.observable('');
      this.changes = ko.observableArray([]);
      this.changeId = ko.observable('');
      this.detail = ko.observable(null);
      this.requirement = ko.observable(null);
      this.workspace = ko.observable(null);
      this.review = ko.observable({ revisions: [], comments: [] });
      this.changeChange = (event) => this.changeId(event.target.value);
      const showError = (error) => this.errorMessage(error.message);
      const failed = (error) => { showError(error); toast.error(error.message); };

      const items = ko.pureComputed(() => (this.detail() && this.detail().plan ? this.detail().plan.items : []));
      const count = (test) => items().filter(test).length;
      this.hasPlan = ko.pureComputed(() => !!(this.detail() && this.detail().plan));

      // --- the change and its plan's status, first ---

      this.latestRevision = ko.pureComputed(() => {
        const list = this.review().revisions;
        return list.length ? list[list.length - 1] : null;
      });
      // The newest request for changes that is still open: no newer revision and no approval after it
      this.openRequest = ko.pureComputed(() => {
        const comments = this.review().comments;
        const latest = this.latestRevision();
        const request = comments.filter((c) => c.kind === 'CHANGES_REQUESTED').pop();
        if (!request || !this.detail() || this.detail().status !== 'PLAN_READY') {
          return null;
        }
        const newer = latest && request.revision !== null && latest.revision > request.revision;
        return newer ? null : { author: request.author, text: request.text, when: ui.when(request.createdAt) };
      });
      this.summary = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return null;
        }
        const latest = this.latestRevision();
        return {
          title: d.title,
          code: code('CHG', d.id, 3),
          status: ui.status(d.status, STATUS_WORDS[d.status]),
          message: d.message || '',
          description: d.plan ? d.plan.summary : (d.status === 'FAILED' ? 'The impact analysis failed.' : 'The impact analysis is running.'),
          version: this.workspace() ? 'OBDX ' + this.workspace().obdxVersion : '',
          requirement: (this.requirement() ? this.requirement().title : '') ,
          reqCode: code('REQ', d.requirementId, 4),
          revision: latest ? 'Revision ' + latest.revision + ' · ' + (latest.origin === 'EDITED' ? 'edited' : 'from the impact analysis')
            + (latest.createdBy && latest.origin === 'EDITED' ? ' by ' + latest.createdBy : '') + ' · ' + ui.when(latest.createdAt) : ''
        };
      });
      this.counts = ko.pureComputed(() => [
        { label: 'files', value: items().length },
        { label: 'to create', value: count((i) => i.action === 'create') },
        { label: 'to modify', value: count((i) => i.action === 'modify') },
        { label: 'tests', value: count((i) => i.layer === 'test') },
        { label: 'risks', value: this.risks().length }
      ]);
      // The approval gate: what is blocked, who can unblock it, and what happened
      this.gate = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return null;
        }
        if (d.planApprovedAt) {
          return { css: 'fx-alert fx-alert--success factory-im-gate', icon: 'check',
            text: 'Plan approved by ' + (d.planApprovedBy || 'a lead') + ' ' + ui.when(d.planApprovedAt) + '. Code generation could start.' };
        }
        if (d.status === 'PLAN_READY') {
          return { css: 'fx-alert fx-alert--warning factory-im-gate', icon: 'alert',
            text: 'Code generation is blocked until the plan is approved by someone with the right to approve.' };
        }
        if (d.status === 'ANALYZING') {
          return { css: 'fx-alert fx-alert--info factory-im-gate', icon: 'clock', text: 'The impact analysis is running. The plan shows here when it is ready.' };
        }
        if (d.status === 'FAILED') {
          return { css: 'fx-alert fx-alert--danger factory-im-gate', icon: 'alert', text: (d.message || 'The impact analysis failed.') + ' Analyze again to make a plan.' };
        }
        return { css: 'fx-alert fx-alert--info factory-im-gate', icon: 'info', text: d.message || '' };
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
      this.savePlanTitle = ko.pureComputed(() => (this.canSavePlan() ? 'Save the edited plan as a new revision' : (this.canEditPlan() ? 'Change the description first' : this.editTitle())));
      this.savePlan = () => {
        const plan = Object.assign({}, this.detail().plan, { summary: this.summaryDraft().trim() });
        api.put('changes/' + this.detail().id + '/plan', JSON.stringify(plan))
          .then((d) => { this.editing(false); this.detail(d); this.errorMessage(''); toast.success('Plan saved as a new revision.'); return loadReview(d.id); })
          .catch(showError);
      };
      this.createPlan = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }));

      // --- tabs ---

      this.tab = ko.observable('files');
      this.tabs = ui.tabs(this.tab, [
        { value: 'files', label: 'Affected Files', icon: 'doc', count: ko.pureComputed(() => items().length) },
        { value: 'graph', label: 'Dependencies', icon: 'plug' },
        { value: 'risks', label: 'Risks', icon: 'alert', count: ko.pureComputed(() => this.risks().length) },
        { value: 'revisions', label: 'Revisions', icon: 'clock', count: ko.pureComputed(() => this.review().revisions.length) },
        { value: 'review', label: 'Review', icon: 'check', count: ko.pureComputed(() => this.review().comments.length) },
        { value: 'requirement', label: 'Requirement', icon: 'list' }
      ]);
      // Arrow keys, Home and End move between the tabs
      this.tabKey = (event) => {
        const keys = this.tabs.map((t) => t.value);
        const at = keys.indexOf(this.tab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.tab(keys[next]);
        const button = document.getElementById('im-' + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };

      // --- affected files with scope filters ---

      this.fileSearch = ko.observable('');
      this.layerFilter = ko.observable('');
      this.actionFilter = ko.observable('');
      this.moduleFilter = ko.observable('');
      this.riskOnly = ko.observable(false);
      this.fileSearchInput = ui.value(this.fileSearch);
      this.actionChange = ui.value(this.actionFilter);
      this.moduleChange = ui.value(this.moduleFilter);
      this.riskOnlyChange = ui.checked(this.riskOnly);
      this.moduleOptions = ko.pureComputed(() => Array.from(new Set(items().map((i) => moduleOf(i.path)))).sort());
      // One chip per layer the plan touches, with its count; a chip filters the table and the dependency view's focus
      this.scopeChips = ko.pureComputed(() => [{ key: '', label: 'All', n: items().length }]
        .concat(LAYERS.map((l) => ({ key: l.key, label: l.label, n: count((i) => i.layer === l.key) })).filter((c) => c.n))
        .map((c) => ({
          label: c.label + ' ' + c.n,
          pressed: this.layerFilter() === c.key ? 'true' : 'false',
          css: 'factory-im-scopechip' + (this.layerFilter() === c.key ? ' factory-im-scopechip-on' : ''),
          dot: c.key ? { background: layerOf(c.key).color } : { display: 'none' },
          pick: () => this.layerFilter(c.key)
        })));
      // Files a risk of the analysis names, by their path or file name
      const riskyPaths = ko.pureComputed(() => {
        const risks = this.risks().join('\n');
        return items().filter((i) => risks.indexOf(i.path) >= 0 || risks.indexOf(fileName(i.path)) >= 0).map((i) => i.path);
      });
      this.filtersOn = ko.pureComputed(() => !!(this.fileSearch() || this.layerFilter() || this.actionFilter() || this.moduleFilter() || this.riskOnly()));
      this.clearFilters = () => {
        ['impactFileSearch', 'impactAction', 'impactModule'].forEach((id) => {
          const el = document.getElementById(id);
          if (el) {
            el.value = '';
          }
        });
        const risky = document.getElementById('impactRiskOnly');
        if (risky) {
          risky.checked = false;
        }
        [this.fileSearch, this.layerFilter, this.actionFilter, this.moduleFilter].forEach((o) => o(''));
        this.riskOnly(false);
      };
      this.files = ko.pureComputed(() => {
        const text = this.fileSearch().trim().toLowerCase();
        const reqCode = this.detail() ? code('REQ', this.detail().requirementId, 4) : '';
        const risky = riskyPaths();
        return items().filter((i) => (!text || (i.path + ' ' + (i.purpose || '')).toLowerCase().indexOf(text) >= 0)
          && (!this.layerFilter() || i.layer === this.layerFilter()) && (!this.actionFilter() || i.action === this.actionFilter())
          && (!this.moduleFilter() || moduleOf(i.path) === this.moduleFilter()) && (!this.riskOnly() || risky.indexOf(i.path) >= 0)).map((i) => {
          const refs = Array.from(new Set(((i.purpose || '') + ' ' + (i.details || '')).match(REFS) || []));
          const follows = (i.basedOn || []).map(fileName);
          return {
            path: i.path,
            pathWrap: i.path.replace(/\//g, '/​'),
            name: fileName(i.path),
            module: moduleOf(i.path),
            layer: layerOf(i.layer).label,
            layerDot: { background: layerOf(i.layer).color },
            operation: i.action === 'create' ? badge('Create', 'primary') : badge('Modify', 'violet'),
            reason: i.purpose || '',
            details: i.details || '',
            requirement: refs.length ? refs.join(', ') : reqCode,
            requirementTitle: refs.length ? 'Named in the reason for this file' : 'The change\'s requirement; the plan links no single item of it to this file',
            evidence: [i.action === 'modify' ? 'Exists in the imported code' : 'New file']
              .concat(follows.length ? ['Follows ' + follows.join(', ')] : [])
              .concat(risky.indexOf(i.path) >= 0 ? ['Named in a risk'] : []).join(' · '),
            risky: risky.indexOf(i.path) >= 0
          };
        });
      });
      this.filePager = ui.pages(this.files, 10, [10, 25, 50]);

      // --- the dependency view: focus on a file, hide layers ---

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
      this.focusPath = ko.observable(null);
      this.hiddenLayers = ko.observableArray([]);
      this.showAll = () => { this.focusPath(null); this.hiddenLayers([]); };
      this.graphFiltered = ko.pureComputed(() => !!this.focusPath() || this.hiddenLayers().length > 0);
      // A file name that can wrap onto two lines: break points after . - _ and between camelCase words
      const breakable = (name) => name.replace(/([._-])/g, '$1​').replace(/([a-z0-9])([A-Z])/g, '$1​$2');
      const graphLayers = () => LAYERS.filter((l) => l.key !== 'test');
      this.graph = ko.pureComputed(() => {
        const hidden = this.hiddenLayers();
        const layers = graphLayers().filter((l) => hidden.indexOf(l.key) < 0);
        let columns = layers.map((l) => ({ layer: l, files: items().filter((i) => i.layer === l.key) })).filter((c) => c.files.length);
        // Focus: the chosen file with the files of the layers next to it, which is what its arrows join
        const focus = this.focusPath();
        const focusColumn = focus ? columns.findIndex((c) => c.files.some((f) => f.path === focus)) : -1;
        if (focusColumn >= 0) {
          columns = columns.map((c, ci) => ({ layer: c.layer, files: ci === focusColumn ? c.files.filter((f) => f.path === focus)
            : Math.abs(ci - focusColumn) === 1 ? c.files : [] })).filter((c) => c.files.length);
        }
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
            const focused = f.path === focus;
            nodes.push({
              x: x, y: y, w: nodeW, h: nodeH, ci: ci, kind: c.layer.label, path: f.path,
              name: breakable(fileName(f.path)), action: OPERATIONS[f.action] || f.action,
              label: fileName(f.path) + ', ' + c.layer.label + ', ' + (OPERATIONS[f.action] || f.action) + (focused ? ', in focus' : ''),
              css: 'factory-im-node' + (focused ? ' factory-im-node-focus' : ''),
              pressed: focused ? 'true' : 'false',
              icon: 'factory-nav-icon factory-ico-' + c.layer.icon, iconStyle: { background: c.layer.bg, color: c.layer.color },
              style: { left: x + 'px', top: y + 'px', width: nodeW + 'px', height: nodeH + 'px', borderColor: c.layer.color },
              pick: () => this.focusPath(focused ? null : f.path)
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
          outer: { width: Math.round(width * z) + 'px', height: Math.round(height * z) + 'px' },
          note: focus ? 'Showing ' + fileName(focus) + ' and the files of the layers next to it.' : ''
        };
      });
      // The legend doubles as the layer switches (expand or hide a layer); tests are listed under Risks and Files
      this.legend = ko.pureComputed(() => graphLayers().map((l) => {
        const n = count((i) => i.layer === l.key);
        const shown = this.hiddenLayers().indexOf(l.key) < 0;
        return {
          label: l.label + ' (' + n + ')',
          title: shown ? 'Hide the ' + l.label + ' layer' : 'Show the ' + l.label + ' layer',
          pressed: shown ? 'true' : 'false',
          disabled: n === 0,
          swatch: { background: l.color },
          css: 'factory-im-legendbtn' + (shown ? '' : ' factory-im-legendbtn-off'),
          toggle: () => (shown ? this.hiddenLayers.push(l.key) : this.hiddenLayers.remove(l.key))
        };
      }));

      // --- risks, from the analysis only ---

      this.risks = ko.pureComputed(() => (this.detail() && this.detail().plan ? this.detail().plan.risks || [] : []));
      this.riskGroups = ko.pureComputed(() => {
        const left = this.risks().slice();
        return RISK_KINDS.map((k) => {
          const mine = left.filter(k.test);
          mine.forEach((r) => left.splice(left.indexOf(r), 1));
          return { title: k.title, key: k.key, risks: mine };
        }).filter((g) => g.risks.length);
      });
      // Files no planned test names (a name match only, shown as a hint under the risks)
      this.untested = ko.pureComputed(() => items().filter((i) => i.layer !== 'test' && i.layer !== 'config'
        && !items().some((t) => t.layer === 'test' && t.path.toLowerCase().indexOf(fileName(i.path).replace(/\.\w+$/, '').toLowerCase()) >= 0)).map((i) => i.path));
      this.tests = ko.pureComputed(() => items().filter((i) => i.layer === 'test').map((i) => ({ path: i.path, purpose: i.purpose, action: OPERATIONS[i.action] })));

      // --- revisions ---

      this.compareFrom = ko.observable('');
      this.compareTo = ko.observable('');
      this.compareFromChange = ui.value(this.compareFrom);
      this.compareToChange = ui.value(this.compareTo);
      this.revisionOptions = ko.pureComputed(() => this.review().revisions.slice().reverse().map((r) => ({
        value: String(r.revision),
        label: 'Revision ' + r.revision + ' · ' + (r.origin === 'EDITED' ? 'edited' + (r.createdBy ? ' by ' + r.createdBy : '') : 'impact analysis') + ' · ' + ui.when(r.createdAt)
      })));
      this.revisionRows = ko.pureComputed(() => this.review().revisions.slice().reverse().map((r) => ({
        revision: r.revision,
        origin: r.origin === 'EDITED' ? 'Edited' : 'Impact analysis',
        by: r.createdBy || '–',
        when: ui.when(r.createdAt),
        files: r.plan.items.length + ' file(s), ' + (r.plan.risks || []).length + ' risk(s)'
      })));
      this.differences = ko.pureComputed(() => {
        const revisions = this.review().revisions;
        const from = revisions.find((r) => String(r.revision) === this.compareFrom());
        const to = revisions.find((r) => String(r.revision) === this.compareTo());
        if (!from || !to) {
          return [];
        }
        return from.revision === to.revision ? [] : planDifferences(from.plan, to.plan);
      });
      this.compareNote = ko.pureComputed(() => {
        const n = this.review().revisions.length;
        if (n < 2) {
          return n === 0 ? 'No revisions recorded for this plan yet.' : 'Only one revision so far. Editing the plan or analyzing again adds the next one.';
        }
        return this.compareFrom() === this.compareTo() ? 'Choose two different revisions.' : 'From revision ' + this.compareFrom() + ' to revision ' + this.compareTo() + ':';
      });
      const resetCompare = () => {
        const list = this.review().revisions;
        this.compareTo(list.length ? String(list[list.length - 1].revision) : '');
        this.compareFrom(list.length > 1 ? String(list[list.length - 2].revision) : this.compareTo());
      };

      // --- review: comments, a request for changes, the approval ---

      this.commentText = ko.observable('');
      this.reviewTimeline = ko.pureComputed(() => {
        const entries = this.review().revisions.map((r) => ({
          at: r.createdAt, kind: 'Revision ' + r.revision, css: 'factory-im-event factory-im-event-revision',
          who: r.origin === 'EDITED' ? (r.createdBy || 'Someone') + ' edited the plan' : 'The impact analysis made the plan',
          text: r.plan.items.length + ' file(s), ' + (r.plan.risks || []).length + ' risk(s)'
        })).concat(this.review().comments.map((c) => ({
          at: c.createdAt,
          kind: c.kind === 'APPROVED' ? 'Approved' : c.kind === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Comment',
          css: 'factory-im-event factory-im-event-' + c.kind.toLowerCase().replace('_', '-'),
          who: c.author + (c.revision ? ' · on revision ' + c.revision : ''),
          text: c.kind === 'APPROVED' && !c.text ? 'Approved the plan for code generation.' : c.text
        })));
        return entries.sort((a, b) => new Date(b.at) - new Date(a.at)).map((e) => Object.assign(e, { when: ui.when(e.at) }));
      });
      const base = () => 'changes/' + this.detail().id;
      const loadReview = (id) => api.get('changes/' + id + '/plan-review').then((review) => {
        if (this.detail() && this.detail().id === id) {
          this.review(review);
          resetCompare();
        }
      }).catch(() => this.review({ revisions: [], comments: [] }));
      this.canPostComment = ko.pureComputed(() => !!this.detail() && this.canComment() && this.commentText().trim() !== '');
      this.commentTip = ko.pureComputed(() => (!this.canComment() ? 'You need the right to comment in this workspace' : 'Add the comment to the plan'));
      this.canRequestChanges = ko.pureComputed(() => !!this.detail() && this.detail().status === 'PLAN_READY' && this.canApprove());
      this.requestTip = ko.pureComputed(() => (!this.detail() || this.detail().status !== 'PLAN_READY' ? 'Only a plan that waits for approval can be sent back'
        : (this.canApprove() ? 'Do not approve the plan as it is: say what has to change' : 'Only someone with the right to approve can request changes')));
      const post = (kind, message) => api.post(base() + '/plan-comments', { kind: kind, text: this.commentText().trim() }).then(() => {
        this.commentText('');
        toast.success(message);
        return loadReview(this.detail().id);
      }).catch(failed);
      this.addComment = () => post('COMMENT', 'Comment added.');
      // From the summary: the review tab, with the box for the reason in focus
      this.goRequestChanges = () => {
        this.tab('review');
        setTimeout(() => {
          const box = document.querySelector('#planComment textarea');
          if (box) {
            box.focus();
          }
        }, 80);
      };
      this.requestChanges = () => {
        if (!this.commentText().trim()) {
          failed(new Error('Write what has to change in the box first.'));
          const box = document.querySelector('#planComment textarea');
          if (box) {
            box.focus();
          }
          return;
        }
        dialog.confirm({ title: 'Request changes to this plan?', message: 'The plan stays unapproved, so no code is generated, until it is edited or analyzed again and approved.',
          confirmLabel: 'Request Changes', danger: true }).then((ok) => {
          if (ok) {
            post('CHANGES_REQUESTED', 'Changes requested. The plan stays unapproved.');
          }
        });
      };

      this.canAnalyze = ko.pureComputed(() => !!this.detail() && this.canManage() && ['PLAN_READY', 'FAILED'].indexOf(this.detail().status) >= 0);
      this.analyzeTip = ko.pureComputed(() => (!this.detail() ? 'Choose a change first' : (!this.canManage() ? 'You need the right to manage code'
        : (['PLAN_READY', 'FAILED'].indexOf(this.detail().status) < 0 ? 'Only a plan that is not approved yet can be analyzed again' : 'Run the impact analysis again; the result becomes the next revision'))));
      this.canApprovePlan = ko.pureComputed(() => !!this.detail() && this.detail().status === 'PLAN_READY' && this.canApprove());
      this.approveTip = ko.pureComputed(() => (!this.detail() ? 'Choose a change first'
        : (this.detail().status !== 'PLAN_READY' ? (this.detail().planApprovedAt ? 'This plan is already approved' : 'There is no plan to approve yet')
          : (this.canApprove() ? 'Approve the plan; the model then writes the code' : 'Only someone with the right to approve can approve the plan'))));
      this.approvePlan = () => {
        const latest = this.latestRevision();
        dialog.confirm({ title: 'Approve this plan?', message: 'The model will write ' + items().length + ' file(s) for this change'
          + (latest ? ' from revision ' + latest.revision : '') + '.', confirmLabel: 'Approve Plan' }).then((ok) => {
          if (!ok) {
            return;
          }
          api.post(base() + '/approve-plan').then((d) => {
            this.detail(d);
            this.errorMessage('');
            toast.success('Plan approved. The model is writing the code.');
            return loadReview(d.id);
          }).catch(failed);
        });
      };
      this.analyzeAgain = () => api.post(base() + '/analyze').then((d) => { this.detail(d); this.errorMessage(''); toast.info('Impact analysis started again.'); }).catch(failed);
      this.openWorkbench = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }));

      // --- the requirement ---

      this.reqCode = ko.pureComputed(() => (this.detail() ? code('REQ', this.detail().requirementId, 4) : ''));
      this.specScreens = ko.pureComputed(() => (this.requirement() && this.requirement().spec ? this.requirement().spec.screens : []));
      this.specApis = ko.pureComputed(() => (this.requirement() && this.requirement().spec ? this.requirement().spec.apis : []));

      // --- loading ---

      this.changeId.subscribe((id) => {
        this.detail(null);
        this.requirement(null);
        this.review({ revisions: [], comments: [] });
        this.showAll();
        if (!id) {
          return;
        }
        this.editing(false);
        api.get('changes/' + id).then((d) => {
          this.detail(d);
          setTimeout(measureGraph, 60);
          loadReview(d.id);
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
      let paneObserver = null;
      let paneWatches = [];
      this.connected = () => {
        accUtils.announce('Impact Analysis page loaded.');
        document.title = 'Impact Analysis';
        subscription = this.workspaceId.subscribe(loadList);
        workspaceSelection.load().then(loadList).catch(showError);
        window.addEventListener('resize', measureGraph);
        // The graph fits its card again when the card is resized
        if (window.ResizeObserver) {
          let frame = 0;
          paneObserver = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measureGraph); });
          const watchPanes = () => setTimeout(() => {
            const wrap = document.getElementById('dependencyGraphWrap');
            paneObserver.disconnect();
            if (wrap) {
              paneObserver.observe(wrap);
            }
          }, 60);
          paneWatches = [this.detail.subscribe(watchPanes), this.tab.subscribe(watchPanes)];
          watchPanes();
        }
      };
      this.disconnected = () => {
        if (paneObserver) {
          paneObserver.disconnect();
          paneWatches.forEach((s) => s.dispose());
        }
        window.removeEventListener('resize', measureGraph);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return ImpactViewModel;
  }
);
