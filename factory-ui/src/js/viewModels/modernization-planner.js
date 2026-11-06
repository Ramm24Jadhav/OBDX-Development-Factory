/*
 * Migration planner (migration path, step 3): the order to move the modules in, from what each one needs first (read
 * from the code), the team's planned weeks per module, the timeline, the dependency diagram, module sizes and findings.
 * Five tabs: the module plan (the table with priority, grouping and paging, the suggested order with its reasons, the
 * timeline and the dependencies together), then each of dependencies, timeline, risk and size, and findings on its own.
 * Priority comes from how many modules need a module first. Make the plan and start saves it and starts the first
 * module in the workspace. No days, risk scores or estimates.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    const STATE = { delivered: ['Delivered', 'green'], 'in-progress': ['In progress', 'blue'], planned: ['Planned', 'violet'], 'not-started': ['Not started', 'grey'] };
    const SIZE = { S: ['Small', 'green'], M: ['Medium', 'amber'], L: ['Large', 'red'] };
    const PRIORITY = { critical: ['Critical', 'blue'], high: ['High', 'red'], medium: ['Medium', 'amber'] };
    // Critical: three or more modules need it first; High: at least one does; Medium: none
    const priorityOf = (m) => (m.neededBy.length >= 3 ? 'critical' : m.neededBy.length >= 1 ? 'high' : 'medium');

    function PlannerViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.data = ko.observable(null);
      self.rows = ko.observableArray([]);
      self.dirty = ko.observable(false);
      self.tab = ko.observable('plan');
      self.priorityFilter = ko.observable('all');
      self.groupBy = ko.observable('none');
      self.checked = ko.observable({});
      self.query = ko.observable('');
      self.sizeFilter = ko.observable('all');
      self.stateFilter = ko.observable('all');
      self.scale = ko.observable('weeks');
      self.selected = ko.observable('');
      self.fullOpen = ko.observable(false);
      self.steps = mz.steps('migration', 3);
      self.pathName = mz.pathName('migration');
      self.sizeOptions = [{ value: 'all', label: 'Any size' }, { value: 'S', label: 'Small' }, { value: 'M', label: 'Medium' }, { value: 'L', label: 'Large' }];
      self.stateOptions = [{ value: 'all', label: 'Any state' }, { value: 'in-plan', label: 'In the plan' }, { value: 'delivered', label: 'Delivered' }, { value: 'in-progress', label: 'In progress' },
        { value: 'planned', label: 'Planned' }, { value: 'not-started', label: 'Not started' }, { value: 'out', label: 'Out of the plan' }];
      self.scaleOptions = [{ value: 'weeks', label: 'Weeks' }, { value: 'months', label: 'Months' }];
      self.priorityOptions = [{ value: 'all', label: 'Any priority' }, { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }];
      self.groupOptions = [{ value: 'none', label: 'Group by: none' }, { value: 'size', label: 'Group by: size' }, { value: 'state', label: 'Group by: state' }, { value: 'priority', label: 'Group by: priority' }];

      // One editable row per module: order, weeks and in the plan are the team's
      const row = (m) => ({ name: m.name, facts: m, order: ko.observable(m.order), from: ko.observable(m.from === null ? '' : String(m.from)),
        to: ko.observable(m.to === null ? '' : String(m.to)), inPlan: ko.observable(m.inPlan) });
      const numberOrNull = (v) => { const n = parseInt(String(v).trim(), 10); return Number.isFinite(n) ? n : null; };
      const ordered = ko.pureComputed(() => self.rows().slice().sort((a, b) => a.order() - b.order() || a.name.localeCompare(b.name)));
      const stateOf = (r) => {
        const s = r.facts.state;
        if (s === 'delivered' || s === 'in-progress') { return s; }
        return r.inPlan() && numberOrNull(r.from()) !== null ? 'planned' : 'not-started';
      };
      self.tiles = ko.pureComputed(() => {
        const d = self.data();
        if (!d) { return []; }
        const rows = self.rows();
        const inPlan = rows.filter((r) => r.inPlan());
        const weeks = Math.max(0, ...inPlan.map((r) => numberOrNull(r.to()) || 0));
        return [['Modules', rows.length + (inPlan.length !== rows.length ? ' (' + inPlan.length + ' in the plan)' : ''), 'blue'], ['Screens', mz.num(rows.reduce((n, r) => n + r.facts.screens, 0)), 'blue'],
          ['Components', mz.num(rows.reduce((n, r) => n + r.facts.uses, 0)), 'blue'], ['Large modules', String(rows.filter((r) => r.facts.size === 'L').length), rows.some((r) => r.facts.size === 'L') ? 'red' : 'grey'],
          ['Dependency groups', String(groups()), 'blue'], ['Planned by the team', weeks ? weeks + (weeks === 1 ? ' week' : ' weeks') : 'Not planned yet', 'green'],
          ['Delivered', rows.filter((r) => r.facts.state === 'delivered').length + ' of ' + inPlan.length, 'green']].map((t) => ({ k: t[0], v: t[1], css: 'fx-kpi factory-mh-kpi is-' + t[2] }));
      });
      // Modules that hang together through what they need (each group can move without the others)
      const groups = ko.pureComputed(() => {
        const names = self.rows().map((r) => r.name);
        const parent = {};
        names.forEach((n) => { parent[n] = n; });
        const find = (n) => (parent[n] === n ? n : (parent[n] = find(parent[n])));
        self.rows().forEach((r) => r.facts.needs.forEach((n) => { if (parent[n] !== undefined) { parent[find(r.name)] = find(n); } }));
        return new Set(names.map(find)).size;
      });
      const filtered = ko.pureComputed(() => {
        const q = self.query().trim().toLowerCase();
        return ordered().filter((r) => (!q || r.name.toLowerCase().indexOf(q) >= 0) && (self.sizeFilter() === 'all' || r.facts.size === self.sizeFilter())
          && (self.priorityFilter() === 'all' || priorityOf(r.facts) === self.priorityFilter())
          && (self.stateFilter() === 'all' || (self.stateFilter() === 'in-plan' ? r.inPlan() : self.stateFilter() === 'out' ? !r.inPlan() : stateOf(r) === self.stateFilter())));
      });
      self.pager = ui.pages(filtered, 10, [10, 25, 50]);
      const groupKey = (r) => (self.groupBy() === 'size' ? (SIZE[r.facts.size] || [r.facts.size])[0] : self.groupBy() === 'state' ? STATE[stateOf(r)][0] : self.groupBy() === 'priority' ? PRIORITY[priorityOf(r.facts)][0] : '');
      self.table = ko.pureComputed(() => {
        const out = [];
        let last = null;
        const page = self.pager.rows().slice();
        if (self.groupBy() !== 'none') { page.sort((a, b) => groupKey(a).localeCompare(groupKey(b)) || a.order() - b.order()); }
        page.forEach((r) => {
          const g = groupKey(r);
          if (self.groupBy() !== 'none' && g !== last) { out.push({ isGroup: true, label: g + ' (' + filtered().filter((x) => groupKey(x) === g).length + ')' }); last = g; }
          out.push(tableRow(r));
        });
        return out;
      });
      const tableRow = (r) => {
            const st = STATE[stateOf(r)];
            const sz = SIZE[r.facts.size] || [r.facts.size, 'grey'];
            const on = self.selected() === r.name;
            const idx = ordered().indexOf(r);
            const pr = PRIORITY[priorityOf(r.facts)];
            const ticked = !!self.checked()[r.name];
            return { isGroup: false, name: r.name, order: r.order, screens: r.facts.screens, uses: mz.num(r.facts.uses), size: sz[0], sizeCss: ui.pill(sz[0], sz[1]).css,
              priority: pr[0], priorityCss: ui.pill(pr[0], pr[1]).css, ticked: ticked,
              tick: () => { const n = Object.assign({}, self.checked()); if (n[r.name]) { delete n[r.name]; } else { n[r.name] = true; } self.checked(n); return true; },
              needs: r.facts.needs.join(', ') || '—', from: r.from, to: r.to, state: st[0], stateCss: ui.pill(st[0], st[1]).css,
              inPlan: r.inPlan(), css: 'factory-mpl-row' + (on ? ' is-on' : '') + (r.inPlan() ? '' : ' is-out'), editable: self.canManage() && r.facts.state !== 'delivered',
              fromInput: (event) => { r.from(event.target.value); self.dirty(true); },
              toInput: (event) => { r.to(event.target.value); self.dirty(true); },
              pick: () => self.selected(on ? '' : r.name),
              menu: [{ value: 'open', label: 'Open in the workspace', disabled: !r.facts.runId }, { value: 'start', label: 'Start this module', disabled: !self.canManage() || stateOf(r) === 'in-progress' || stateOf(r) === 'delivered' || !self.data().technology },
                { value: 'earlier', label: 'Move earlier', disabled: idx === 0 || !self.canManage() }, { value: 'later', label: 'Move later', disabled: idx === ordered().length - 1 || !self.canManage() },
                { value: 'out', label: r.inPlan() ? 'Take out of the plan' : 'Put back in the plan', disabled: !self.canManage() }],
              menuAction: (event) => {
                const v = event.detail.value;
                if (v === 'open') { mz.open('modernization-workspace', { runId: r.facts.runId }); }
                if (v === 'start') { startModule(r.name); }
                if (v === 'earlier' || v === 'later') { move(r, v === 'earlier' ? -1 : 1); }
                if (v === 'out') { r.inPlan(!r.inPlan()); self.dirty(true); }
              } };
      };
      self.checkedCount = ko.pureComputed(() => Object.keys(self.checked()).length);
      self.checkedText = ko.pureComputed(() => self.checkedCount() + (self.checkedCount() === 1 ? ' module picked' : ' modules picked'));
      const setPlan = (on) => { self.rows().forEach((r) => { if (self.checked()[r.name]) { r.inPlan(on); } }); self.checked({}); self.dirty(true); };
      self.takeOut = () => setPlan(false);
      self.putIn = () => setPlan(true);
      self.clearChecked = () => self.checked({});
      const move = (r, step) => {
        const list = ordered();
        const i = list.indexOf(r);
        const j = i + step;
        if (j < 0 || j >= list.length) { return; }
        list.forEach((x, k) => x.order(k + 1));
        list[i].order(j + 1);
        list[j].order(i + 1);
        self.dirty(true);
      };
      self.suggested = ko.pureComputed(() => (self.data() ? self.data().suggested : []).map((n, i) => ({ n: i + 1, name: n, css: 'factory-mpl-step' + (self.selected() === n ? ' is-on' : ''),
        pressed: self.selected() === n ? 'true' : 'false', pick: () => self.selected(self.selected() === n ? '' : n) })));
      // Why this order: what the chosen module (or the first ones) need, and where the large modules go
      self.orderReasons = ko.pureComputed(() => {
        const order = self.data() ? self.data().suggested : [];
        const by = {};
        self.rows().forEach((r) => { by[r.name] = r.facts; });
        const out = [];
        const pick = self.selected() && by[self.selected()] ? self.selected() : null;
        if (pick) {
          const m = by[pick];
          out.push(m.needs.length ? pick + ' needs ' + m.needs.join(', ') + ' first, so it moves after ' + (m.needs.length === 1 ? 'it' : 'them') + '.' : pick + ' needs no other module, so it can move first.');
          if (m.neededBy.length) { out.push(m.neededBy.join(', ') + (m.neededBy.length === 1 ? ' needs ' : ' need ') + pick + ', so ' + (m.neededBy.length === 1 ? 'it waits' : 'they wait') + ' for it.'); }
        } else if (order.length) {
          const first = order.filter((n) => by[n] && by[n].needs.length === 0);
          if (first.length) { out.push(first.slice(0, 3).join(', ') + (first.length === 1 ? ' needs' : ' need') + ' no other module, so the plan starts there.'); }
        }
        self.rows().filter((r) => r.facts.size === 'L').slice(0, 2).forEach((r) => {
          const at = order.indexOf(r.name);
          if (at >= 0) { out.push(r.name + ' is a large module; it comes at step ' + (at + 1) + ', after what it needs.'); }
        });
        if (self.data() && self.data().cycles.length) { out.push('Some modules need each other (' + self.data().cycles.join('; ') + '): move them together.'); }
        return out;
      });
      self.useSuggested = () => {
        const order = self.data().suggested;
        self.rows().forEach((r) => r.order(order.indexOf(r.name) + 1));
        self.dirty(true);
        toast.info('The suggested order is in the table. Save to keep it.');
      };
      self.timeline = ko.pureComputed(() => ordered().filter((r) => r.inPlan() && numberOrNull(r.from()) !== null && numberOrNull(r.to()) !== null).map((r) => ({
        label: r.name, from: numberOrNull(r.from()), to: numberOrNull(r.to()), state: stateOf(r) === 'in-progress' ? 'in-progress' : stateOf(r),
        note: stateOf(r) === 'delivered' ? '✓ delivered' : stateOf(r) === 'in-progress' ? 'in progress' : '' })));
      self.timelineTotal = ko.pureComputed(() => Math.max(4, ...self.timeline().map((t) => t.to)));
      // Week 1 of the plan: the Monday of the week the plan was first saved (today is the plan's week now)
      self.timelineStart = ko.pureComputed(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * Math.max(0, (self.today() || 1) - 1));
        return d.toISOString();
      });
      self.today = ko.pureComputed(() => (self.data() && self.data().today ? self.data().today : 0));
      self.nodes = ko.pureComputed(() => self.rows().map((r) => ({ id: r.name, label: r.name, state: r.facts.state === 'delivered' ? 'delivered' : '' })));
      self.edges = ko.pureComputed(() => {
        const out = [];
        self.rows().forEach((r) => r.facts.needs.forEach((n) => out.push({ from: r.name, to: n })));
        return out;
      });
      // The full-screen view: modules in columns, each needing only the columns to its left
      self.levels = ko.pureComputed(() => {
        const by = {};
        self.rows().forEach((r) => { by[r.name] = r.facts; });
        const depth = {};
        const level = (n, seen) => {
          if (depth[n] !== undefined) { return depth[n]; }
          if (seen[n] || !by[n]) { return 0; }
          seen[n] = true;
          const d = by[n].needs.length ? 1 + Math.max(...by[n].needs.map((x) => level(x, seen))) : 0;
          depth[n] = d;
          return d;
        };
        self.rows().forEach((r) => level(r.name, {}));
        const sel = by[self.selected()];
        const cols = [];
        Object.keys(depth).sort().forEach((n) => { (cols[depth[n]] = cols[depth[n]] || []).push(n); });
        return cols.filter(Boolean).map((names, i) => ({ title: (i + 1) + ' · ' + (i === 0 ? 'Moves first' : 'Needs column ' + i),
          modules: names.map((n) => ({ name: n, pressed: self.selected() === n ? 'true' : 'false',
            css: 'factory-mpl-node' + (self.selected() === n ? ' is-on' : sel && sel.needs.indexOf(n) >= 0 ? ' is-need' : sel && sel.neededBy.indexOf(n) >= 0 ? ' is-dep' : ''),
            pick: () => self.selected(self.selected() === n ? '' : n) })) }));
      });
      self.selectedSentence = ko.pureComputed(() => {
        const r = self.rows().find((x) => x.name === self.selected());
        if (!r) { return 'Pick a module to see what it needs and what needs it.'; }
        return r.name + ' highlighted: ' + (r.facts.needs.length ? 'it needs ' + r.facts.needs.join(', ') : 'it needs no other module')
          + (r.facts.neededBy.length ? '; ' + r.facts.neededBy.join(', ') + (r.facts.neededBy.length === 1 ? ' needs' : ' need') + ' it.' : '.');
      });
      self.depRows = ko.pureComputed(() => ordered().map((r) => ({ name: r.name, needs: r.facts.needs.join(', ') || '—', neededBy: r.facts.neededBy.join(', ') || '—', calls: r.facts.calls })));
      self.sizeRows = ko.pureComputed(() => ordered().map((r) => {
        const c = r.facts.complexity || {};
        const sz = SIZE[r.facts.size] || [r.facts.size, 'grey'];
        return { name: r.name, screens: r.facts.screens, fields: r.facts.fields, calls: r.facts.calls, outside: r.facts.callsWithoutBackend, small: c.S || 0, medium: c.M || 0, large: c.L || 0,
          size: sz[0], sizeCss: ui.pill(sz[0], sz[1]).css };
      }));
      // Risk and size: why a module needs more care, from what the analysis counted, and what the plan does about it
      self.riskRows = ko.pureComputed(() => ordered().map((r) => {
        const f = r.facts;
        const why = [];
        const todo = [];
        if (f.size === 'L') { why.push('Large: ' + f.screens + ' screens'); todo.push('Move it after what it needs; give it more weeks'); }
        if (f.neededBy.length >= 3) { why.push(f.neededBy.length + ' modules need it'); todo.push('Move it early and review it first'); }
        if (f.callsWithoutBackend) { why.push(f.callsWithoutBackend + ' calls to services outside this code'); todo.push('Check those services exist in OBDX before moving'); }
        if ((f.complexity || {}).L) { why.push(f.complexity.L + ' complex screens'); todo.push('Extra journey tests for those screens'); }
        const sz = SIZE[f.size] || [f.size, 'grey'];
        return { name: r.name, screens: f.screens, size: sz[0], sizeCss: ui.pill(sz[0], sz[1]).css, why: why.join('; '), todo: todo.join('; ') };
      }).filter((x) => x.why));
      self.findings = ko.pureComputed(() => (self.data() ? self.data().findings : []).map((f) => ({ text: f.text, where: f.where, todo: f.todo,
        severity: f.severity === 'medium' ? 'Medium' : f.severity === 'high' ? 'High' : 'Low', css: ui.pill(f.severity, f.severity === 'medium' ? 'amber' : f.severity === 'high' ? 'red' : 'grey').css })));
      self.tabs = ko.pureComputed(() => ui.tabs(self.tab, [{ value: 'plan', label: 'Module plan' }, { value: 'dependencies', label: 'Dependencies' }, { value: 'timeline', label: 'Timeline' },
        { value: 'size', label: 'Risk and size' }, { value: 'findings', label: 'Findings', count: self.data() ? self.data().findings.length : 0 }]));
      self.tabKey = (vm, event) => {
        const keys = ['plan', 'dependencies', 'timeline', 'size', 'findings'];
        const at = keys.indexOf(self.tab());
        const n = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (n < 0) { return true; }
        event.preventDefault();
        self.tab(keys[n]);
        const b = document.getElementById('mplTab-' + keys[n]);
        if (b) { b.focus(); }
        return false;
      };
      self.filterCount = ko.pureComputed(() => (self.sizeFilter() !== 'all' ? 1 : 0) + (self.stateFilter() !== 'all' ? 1 : 0) + (self.priorityFilter() !== 'all' ? 1 : 0));
      self.filterLabel = ko.pureComputed(() => 'Filters' + (self.filterCount() ? ' · ' + self.filterCount() : ''));
      self.clearFilters = () => { self.sizeFilter('all'); self.stateFilter('all'); self.priorityFilter('all'); self.query(''); };
      self.tryAgain = () => load(self.workspaceId());
      self.startTitle = ko.pureComputed(() => (!self.canManage() ? 'Starting needs the Manage code permission' : !self.data() || !self.data().technology ? 'Greyed out until the technology is chosen in the catalogue'
        : !self.rows().some((r) => r.inPlan()) ? 'Greyed out until a module is in the plan' : null));
      self.savedText = ko.pureComputed(() => {
        const d = self.data();
        if (self.dirty()) { return 'Unsaved changes'; }
        return d && d.saved ? 'Saved · ' + ui.when(d.savedAt) + (d.savedBy ? ' by ' + d.savedBy : '') : 'Not saved yet';
      });
      self.savedCss = ko.pureComputed(() => ui.pill(self.savedText(), self.dirty() ? 'amber' : self.data() && self.data().saved ? 'green' : 'grey').css);

      const body = () => ({ modules: self.rows().map((r) => ({ name: r.name, order: r.order(), from: numberOrNull(r.from()), to: numberOrNull(r.to()), inPlan: r.inPlan() })) });
      const weeksError = () => {
        const bad = self.rows().find((r) => {
          const f = numberOrNull(r.from());
          const t = numberOrNull(r.to());
          return (f === null) !== (t === null) || (f !== null && (f < 1 || t < f));
        });
        return bad ? bad.name + ': give both weeks, the last not before the first.' : null;
      };
      const save = () => {
        const err = weeksError();
        if (err) { toast.error(err); return Promise.reject(new Error(err)); }
        return api.put('workspaces/' + self.workspaceId() + '/modernization/planner', body()).then((d) => { apply(d); return d; });
      };
      self.saveDraft = () => save().then(() => toast.success('Plan saved.')).catch((e) => { if (e && e.status) { toast.error(ui.errorText(e)); } });
      const startModule = (name) => api.post('workspaces/' + self.workspaceId() + '/modernization/planner/start' + (name ? '?module=' + encodeURIComponent(name) : '')).then((run) => {
        toast.success(run.subject + ' started as a change.');
        mz.open('modernization-workspace', { runId: run.id });
      }).catch((e) => toast.error(ui.errorText(e)));
      self.makeAndStart = () => save().then(() => startModule(null)).catch((e) => { if (e && e.status) { toast.error(ui.errorText(e)); } });
      self.canStart = ko.pureComputed(() => self.canManage() && !!self.data() && !!self.data().technology && self.rows().some((r) => r.inPlan()));
      self.csvHref = ko.pureComputed(() => (self.workspaceId() ? 'api/workspaces/' + self.workspaceId() + '/modernization/planner.csv' : '#'));
      self.back = () => mz.open('modernization-catalogue');
      self.openFull = () => self.fullOpen(true);
      self.closeFull = () => self.fullOpen(false);
      self.moreItems = [{ value: 'draft', label: 'Save as draft' }, { value: 'csv', label: 'Export the plan' }, { value: 'suggested', label: 'Use the suggested order' }];
      self.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'draft') { self.saveDraft(); } else if (v === 'csv') { window.location.href = self.csvHref(); } else { self.useSuggested(); }
      };

      const apply = (d) => {
        self.data(d);
        self.rows(d.modules.map(row));
        self.dirty(false);
        self.error(null);
      };
      const load = (id) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        api.get('workspaces/' + id + '/modernization/planner').then(apply).catch((e) => { self.data(null); self.error(ui.errorText(e)); }).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe((id) => load(id));
      self.connected = () => {
        accUtils.announce('Migration planner loaded.', 'assertive');
        document.title = 'Migration planner';
        mz.take();
        load(self.workspaceId());
      };
      self.disconnected = () => sub.dispose();
    }

    return PlannerViewModel;
  }
);
