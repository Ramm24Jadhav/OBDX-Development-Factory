/*
 * Component inventory (UI path, step 2): every Oracle JET element the analysis counted in the screens, its premium
 * replacement and how it maps (from the JET mapping registry), where it is used, the compatibility matrix part by part,
 * the usage by module and the findings. Components picked here go to the Upgrade plan.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    const COLUMNS = [['category', 'Category'], ['screens', 'Screens'], ['modules', 'Modules'], ['premium', 'Premium replacement'], ['compatibility', 'Compatibility'], ['effort', 'Effort']];
    const EFFORT = { Low: 'green', Medium: 'amber', High: 'red' };
    const SEVERITY = { high: ['High', 'red'], medium: ['Medium', 'amber'], low: ['Low', 'grey'] };

    function ComponentsInventoryViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.data = ko.observable(null);
      self.tab = ko.observable('inventory');
      self.compat = ko.observable('all');
      self.category = ko.observable('all');
      self.module = ko.observable('');
      self.query = ko.observable('');
      self.selected = ko.observable({});
      self.shownColumns = ko.observable({ category: true, screens: true, modules: true, premium: true, compatibility: true, effort: true });

      self.steps = mz.steps('ui', 2);
      self.pathName = mz.pathName('ui');

      const totals = ko.pureComputed(() => (self.data() ? self.data().totals : null));
      self.counted = ko.pureComputed(() => !!self.data() && self.data().counted);
      const pct = (n) => { const t = totals(); return t && t.uses ? Math.round(100 * n / t.uses) + '%' : ''; };
      self.kpis = ko.pureComputed(() => {
        const t = totals();
        if (!t) { return []; }
        return [['all', 'cube', t.uses, 'Component uses', '', 'grey'], ['direct', 'check', t.direct, 'Direct replacements', pct(t.direct), 'green'],
          ['mapping', 'refresh', t.mapping, 'Property or event mapping', pct(t.mapping), 'amber'], ['custom', 'alert', t.custom, 'Transformation, manual or unsupported', pct(t.custom), 'red'],
          ['screens', 'doc', t.screensAffected, 'Screens affected', '', 'grey']].map((k) => ({
          id: k[0], value: mz.num(k[2]), label: k[3], percent: k[4], percentCss: ui.pill('', k[5]).css, iconClass: 'factory-nav-icon factory-ico-' + k[1],
          filters: k[0] !== 'screens',
          pressed: ko.pureComputed(() => (self.compat() === k[0] ? 'true' : 'false')),
          css: ko.pureComputed(() => 'fx-kpi factory-mc-kpi' + (k[0] !== 'screens' ? ' is-filter' : '') + (self.compat() === k[0] && k[0] !== 'screens' ? ' is-on' : '')),
          pick: () => { if (k[0] !== 'screens') { self.compat(k[0]); self.tab('inventory'); } }
        }));
      });

      self.tabs = ko.pureComputed(() => ui.tabs(self.tab, [{ value: 'inventory', label: 'Inventory' }, { value: 'matrix', label: 'Compatibility matrix' },
        { value: 'modules', label: 'Usage by module' }, { value: 'findings', label: 'Findings', count: self.data() ? self.data().findings.length : 0 }]));
      self.tabKey = (vm, event) => {
        const keys = ['inventory', 'matrix', 'modules', 'findings'];
        const at = keys.indexOf(self.tab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) { return true; }
        event.preventDefault();
        self.tab(keys[next]);
        const b = document.getElementById('mcTab-' + keys[next]);
        if (b) { b.focus(); }
        return false;
      };

      self.categories = ko.pureComputed(() => {
        const d = self.data();
        if (!d) { return []; }
        return [{ id: 'all', name: 'All categories', uses: d.totals.uses }].concat(d.categories).map((c) => ({
          name: c.name, n: mz.num(c.uses), pressed: ko.pureComputed(() => (self.category() === c.id ? 'true' : 'false')),
          css: ko.pureComputed(() => 'factory-mc-facet' + (self.category() === c.id ? ' is-on' : '')), pick: () => self.category(c.id)
        }));
      });
      self.compatFacets = ko.pureComputed(() => {
        const d = self.data();
        if (!d) { return []; }
        const DOT = { all: 'var(--fx-primary)', direct: 'var(--fx-success)', mapping: 'var(--fx-warning)', custom: 'var(--fx-danger)' };
        return [{ id: 'all', name: 'All', uses: d.totals.uses }].concat(d.compatibility).map((c) => ({
          name: c.name, n: mz.num(c.uses), dot: { background: DOT[c.id] }, pressed: ko.pureComputed(() => (self.compat() === c.id ? 'true' : 'false')),
          css: ko.pureComputed(() => 'factory-mc-facet' + (self.compat() === c.id ? ' is-on' : '')), pick: () => self.compat(c.id)
        }));
      });
      self.moduleOptions = ko.pureComputed(() => [{ value: '', label: 'All modules' }].concat((self.data() ? self.data().modules : []).map((m) => ({ value: m.module, label: m.module }))));
      self.filtered = ko.pureComputed(() => self.compat() !== 'all' || self.category() !== 'all' || !!self.module() || !!self.query().trim());
      self.reset = () => { self.compat('all'); self.category('all'); self.module(''); self.query(''); };

      const visibleRows = ko.pureComputed(() => {
        const d = self.data();
        if (!d) { return []; }
        const q = self.query().trim().toLowerCase();
        return d.rows.filter((r) => (self.compat() === 'all' || r.compatibility === self.compat()) && (self.category() === 'all' || r.category === self.category())
          && (!self.module() || r.modules.indexOf(self.module()) >= 0)
          && (!q || (r.element + ' ' + (r.premium || '') + ' ' + mz.CATEGORY[r.category] + ' ' + r.modules.join(' ')).toLowerCase().indexOf(q) >= 0));
      });
      self.viewName = ko.pureComputed(() => ({ all: 'All components', direct: 'Direct replacements', mapping: 'Property or event mapping', custom: 'Transformation, manual or unsupported' })[self.compat()]);
      self.pager = ui.pages(visibleRows, 10, [10, 25, 50]);
      self.col = (name) => ko.pureComputed(() => !!self.shownColumns()[name]);
      self.showCategory = self.col('category');
      self.showScreens = self.col('screens');
      self.showModules = self.col('modules');
      self.showPremium = self.col('premium');
      self.showCompat = self.col('compatibility');
      self.showEffort = self.col('effort');
      self.columnItems = ko.pureComputed(() => COLUMNS.map((c) => ({ value: c[0], label: c[1], checked: !!self.shownColumns()[c[0]] })));
      self.columnAction = (event) => {
        const v = event.detail.value;
        const next = Object.assign({}, self.shownColumns());
        next[v] = !next[v];
        self.shownColumns(next);
      };

      self.rows = ko.pureComputed(() => { const cols = self.shownColumns(); return self.pager.rows().map((r) => {
        const on = ko.pureComputed(() => !!self.selected()[r.element]);
        const pill = mz.compatPill(r.compatibility);
        return {
          element: r.element, category: mz.CATEGORY[r.category] || r.category, uses: mz.num(r.uses), screens: mz.num(r.screens),
          modules: r.modules.slice(0, 2).join(', '), more: r.modules.length > 2 ? '+' + (r.modules.length - 2) : '',
          allModules: r.modules.join(', '), premium: r.premium, premiumMono: !!r.component,
          compat: pill.text, compatCss: pill.css, status: mz.statusText(r.status), effort: r.effort, effortCss: ui.pill(r.effort, EFFORT[r.effort]).css,
          note: r.note || '', checked: on, css: ko.pureComputed(() => 'factory-mc-row' + (on() ? ' is-selected' : '')), cols: cols,
          toggle: () => { const n = Object.assign({}, self.selected()); if (n[r.element]) { delete n[r.element]; } else { n[r.element] = true; } self.selected(n); return true; },
          preview: () => mz.open('modernization-mapping', { element: r.element }),
          menu: [{ value: 'mapping', label: 'Open the mapping' }, { value: 'screens', label: 'Show the screens' }, { value: 'plan', label: 'Add to the plan', disabled: !self.canManage() }],
          menuAction: (event) => {
            const v = event.detail.value;
            if (v === 'mapping') { mz.open('modernization-mapping', { element: r.element }); }
            if (v === 'screens') { mz.open('modernization-mapping', { element: r.element, tab: 'screens' }); }
            if (v === 'plan') { mz.open('modernization-upgrade', { components: [r.element] }); }
          }
        };
      }); });
      self.allOnPage = ko.pureComputed(() => self.rows().length > 0 && self.rows().every((r) => r.checked()));
      self.toggleAll = () => {
        const n = Object.assign({}, self.selected());
        const all = self.allOnPage();
        self.pager.rows().forEach((r) => { if (all) { delete n[r.element]; } else { n[r.element] = true; } });
        self.selected(n);
        return true;
      };
      const picked = ko.pureComputed(() => (self.data() ? self.data().rows : []).filter((r) => self.selected()[r.element]));
      self.selectionText = ko.pureComputed(() => {
        const p = picked();
        if (!p.length) { return 'Pick components to add them to the upgrade plan.'; }
        const mods = new Set();
        p.forEach((r) => r.modules.forEach((m) => mods.add(m)));
        return p.length + (p.length === 1 ? ' component' : ' components') + ' selected · ' + p.reduce((a, r) => a + r.uses, 0) + ' uses · ' + mods.size + (mods.size === 1 ? ' module' : ' modules');
      });
      self.hasPicked = ko.pureComputed(() => picked().length > 0);
      self.canManage = mz.canManage;
      self.addToPlan = () => { if (picked().length) { mz.open('modernization-upgrade', { components: picked().map((r) => r.element) }); } };
      self.compare = () => { const p = picked(); mz.open('modernization-mapping', { element: p.length ? p[0].element : null }); };
      self.viewScreens = () => { const p = picked(); mz.open('modernization-mapping', { element: p.length ? p[0].element : null, tab: 'screens' }); };
      self.back = () => mz.open('modernization-path');
      self.csvHref = ko.pureComputed(() => (self.workspaceId() ? 'api/workspaces/' + self.workspaceId() + '/modernization/components.csv?compatibility='
        + encodeURIComponent(self.compat()) + '&category=' + encodeURIComponent(self.category()) : '#'));
      self.moreItems = [{ value: 'compare', label: 'Compare and preview' }, { value: 'screens', label: 'View the screens' }, { value: 'csv', label: 'Export as CSV' }];
      self.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'compare') { self.compare(); } else if (v === 'screens') { self.viewScreens(); } else if (v === 'csv') { window.location.href = self.csvHref(); }
      };

      self.matrix = ko.pureComputed(() => (self.data() ? self.data().matrix : []).map((m) => {
        const tone = (x) => (x === 'none' || /^(\d+) of \1$/.test(x) ? 'is-ok' : x.indexOf(' of ') > 0 ? 'is-warn' : 'is-bad');
        const result = { 'Drop-in': 'green', 'Needs mapping': 'amber', 'Custom work': 'red', 'Not in the pack': 'red' }[m.result];
        return { element: m.element, properties: m.properties, events: m.events, slots: m.slots, styling: m.styling, propCss: tone(m.properties), eventCss: tone(m.events),
          result: m.result, resultCss: ui.pill(m.result, result).css, open: () => mz.open('modernization-mapping', { element: m.element }) };
      }));
      self.moduleRows = ko.pureComputed(() => (self.data() ? self.data().modules : []).map((m) => ({
        module: m.module, screens: m.screens, uses: mz.num(m.uses), most: m.mostUsed.join(', '), covered: m.coveredPercent + '%',
        coveredCss: ui.pill(m.coveredPercent + '%', m.coveredPercent >= 90 ? 'green' : m.coveredPercent >= 70 ? 'amber' : 'red').css,
        filter: () => { self.module(m.module); self.tab('inventory'); }
      })));
      self.findings = ko.pureComputed(() => (self.data() ? self.data().findings : []).map((f) => {
        const s = SEVERITY[f.severity] || [f.severity, 'grey'];
        return { text: f.text, where: f.where, todo: f.todo, severity: s[0], severityCss: ui.pill(s[0], s[1]).css, hasElement: !!f.element,
          open: () => mz.open('modernization-mapping', { element: f.element }) };
      }));

      const load = (id) => {
        if (!id) { self.data(null); self.loading(false); return; }
        self.loading(true);
        api.get('workspaces/' + id + '/modernization/components').then((d) => {
          if (id === self.workspaceId()) { self.data(d); self.error(null); }
        }).catch((e) => { self.data(null); self.error(ui.errorText(e)); }).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe((id) => { self.selected({}); load(id); });
      self.connected = () => {
        accUtils.announce('Component inventory loaded.', 'assertive');
        document.title = 'Component inventory';
        const asked = mz.take();
        if (asked.compatibility) { self.compat(asked.compatibility); }
        if (asked.tab) { self.tab(asked.tab); }
        load(self.workspaceId());
      };
      self.disconnected = () => sub.dispose();
    }

    return ComponentsInventoryViewModel;
  }
);
