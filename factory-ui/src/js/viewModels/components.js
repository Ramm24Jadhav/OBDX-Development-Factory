/*
 * Component factory: the premium component packs from the registry (target-packs/components). Each pack with its
 * readiness, and each component with its name in the pack, what it replaces in the workspace's JET UI, its proposed
 * mapping and what it is built on. Readiness is only what the registry records: a component is Available when every
 * quality gate passed, In test when it is built, Planned when it is named but not built.
 *
 * The workspace's component style (a design option, motion and preview theme, by default and per component) is saved
 * here; new code and pack upgrades use it. Live previews come with the pack builds.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast) {
    const pill = ui.pill;
    const READY = { available: ['Available', 'green'], 'in-test': ['In test', 'amber'], planned: ['Planned', 'grey'], 'not-in-pack': ['Not in this pack', 'grey'] };
    const MAPPING = {
      'direct-replacement': ['Direct replacement', 'green'], 'property-mapping': ['Property mapping', 'blue'], 'event-mapping': ['Event mapping', 'blue'],
      'custom-transformation': ['Custom transformation', 'amber'], 'manual-intervention': ['Manual intervention', 'red'], unsupported: ['Unsupported', 'grey'], new: ['New', 'violet']
    };
    const STATE = { planned: ['Planned', 'grey'], starter: ['Starter components', 'blue'], preview: ['Preview', 'amber'], released: ['Released', 'green'] };
    const GATE = { passed: ['Passed', 'green'], failed: ['Failing', 'red'], 'not-run': ['Not run yet', 'grey'], 'not-applicable': ['Not needed', 'grey'] };
    const GATE_NAMES = { unit: 'Unit tests', accessibility: 'Accessibility', visual: 'Visual snapshot', themes: 'Light and dark themes', responsive: 'Phone, tablet and laptop', parity: 'Parity with the JET element' };
    const LOOKS = [['elevated', 'Elevated'], ['soft', 'Soft'], ['glass', 'Glass'], ['outline', 'Outline'], ['vivid', 'Vivid'], ['pill', 'Pill'], ['brutal', 'Neo-brutalist'], ['redwood', 'Redwood']];
    const HOVER = [['none', 'None'], ['lift', 'Lift'], ['glow', 'Glow'], ['shine', 'Shine']];
    const CLICK = [['none', 'None'], ['press', 'Press'], ['ripple', 'Ripple'], ['bounce', 'Bounce']];
    const SCROLL = [['none', 'None'], ['fadeup', 'Fade up'], ['scale', 'Scale in'], ['slide', 'Slide in'], ['blur', 'Blur in']];
    const MODES = [['light', 'Light'], ['dark', 'Dark']];
    const BRANDS = [['workspace', 'Workspace brand'], ['indigo', 'Indigo'], ['emerald', 'Emerald'], ['burgundy', 'Burgundy'], ['gold', 'Gold']];
    const PAGE = 25;
    const nameOf = (list, v) => (list.find((x) => x[0] === v) || [v, v])[1];
    const options = (list) => list.map((x) => ({ value: x[0], label: x[1] }));
    const withDefault = (list, def) => [{ value: '', label: 'Workspace default (' + nameOf(list, def) + ')' }].concat(options(list));
    const clone = (o) => JSON.parse(JSON.stringify(o));

    function ComponentsViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.catalogue = ko.observable(null);
      self.saved = ko.observable(null);
      self.draft = ko.observable(null);
      self.packId = ko.observable('jet-premium');
      self.category = ko.observable('foundation');
      self.query = ko.observable('');
      self.readiness = ko.observable('all');
      self.mapping = ko.observable('all');

      self.readinessOptions = [{ value: 'all', label: 'All' }, { value: 'available', label: 'Available' }, { value: 'in-test', label: 'In test' }, { value: 'planned', label: 'Planned' }];
      self.mappingOptions = [{ value: 'all', label: 'Any mapping' }].concat(Object.keys(MAPPING).map((k) => ({ value: k, label: MAPPING[k][0] })));

      const pack = ko.pureComputed(() => {
        const c = self.catalogue();
        return c ? c.packs.find((p) => p.id === self.packId()) || c.packs[0] : null;
      });
      self.pack = pack;
      self.packName = ko.pureComputed(() => (pack() ? pack().name : ''));
      self.packLead = ko.pureComputed(() => (pack() ? pack().description : ''));

      self.tiles = ko.pureComputed(() => {
        const c = self.catalogue();
        if (!c) { return []; }
        return c.packs.map((p) => {
          const total = c.components;
          const pct = (n) => Math.round(n / total * 100) + '%';
          return {
            id: p.id, name: p.name, pkg: p.packageName + ' ' + p.version,
            range: p.id === 'jet-premium' && c.jet && c.jet.major ? c.jet.found + ' · ' + c.jet.buildName + ' build' : p.frameworkRange, state: pill.apply(null, STATE[p.state] || [p.state, 'grey']),
            counts: p.counts.available + ' available · ' + p.counts.inTest + ' in test · ' + p.counts.planned + ' planned',
            available: pct(p.counts.available), inTest: pct(p.counts.inTest),
            selected: ko.pureComputed(() => self.packId() === p.id),
            css: ko.pureComputed(() => 'factory-cf-tile' + (self.packId() === p.id ? ' is-selected' : '')),
            pick: () => self.packId(p.id)
          };
        });
      });

      // The JET release the premium pack is built for, from the workspace's Project Profile scan
      self.jet = ko.pureComputed(() => {
        const c = self.catalogue();
        if (!c || !c.jet || self.packId() !== 'jet-premium') { return null; }
        const t = c.jet;
        const found = !!t.major && t.note.indexOf('older than') < 0;
        return {
          note: t.note, detail: t.buildDetail,
          evidence: t.evidence && t.evidence.length ? 'Seen in ' + t.evidence.slice(0, 2).join(', ') : '',
          css: 'factory-cf-jet' + (found ? '' : ' is-warn'),
          showProfile: t.status !== 'no-workspace'
        };
      });

      const all = ko.pureComputed(() => {
        const c = self.catalogue();
        if (!c) { return []; }
        const out = [];
        c.categories.forEach((cat) => cat.components.forEach((m) => out.push({ m: m, cat: cat })));
        return out;
      });

      self.categories = ko.pureComputed(() => {
        const c = self.catalogue();
        if (!c) { return []; }
        return c.categories.map((cat) => ({
          id: cat.id, name: cat.name, count: cat.components.length,
          css: ko.pureComputed(() => 'factory-cf-cat' + (self.category() === cat.id && !self.query().trim() ? ' is-active' : '')),
          pick: () => { self.query(''); self.category(cat.id); }
        }));
      });

      const style = (id) => {
        const d = self.draft();
        if (!d) { return null; }
        const own = (d.components || {})[id] || {};
        const motion = Object.assign({}, d.defaults.motion, own.motion || {});
        return { look: own.look || d.defaults.look, motion: motion, mode: own.mode || d.defaults.mode, brand: own.brand || d.defaults.brand, own: Object.keys(own).length > 0 };
      };

      self.rows = ko.pureComputed(() => {
        const q = self.query().trim().toLowerCase();
        const p = self.packId();
        return all().filter((e) => {
          const inPack = e.m.packs[p];
          if (!q && e.cat.id !== self.category()) { return false; }
          if (q && (e.m.name + ' ' + e.m.purpose + ' ' + (e.m.workspaceElement || '') + ' ' + Object.keys(e.m.packs).map((k) => (e.m.packs[k].name || '') + ' ' + (e.m.packs[k].builtOn || '')).join(' ')).toLowerCase().indexOf(q) < 0) { return false; }
          if (self.readiness() !== 'all' && inPack.readiness !== self.readiness()) { return false; }
          if (self.mapping() !== 'all' && inPack.mapping !== self.mapping()) { return false; }
          return true;
        }).map((e) => {
          const inPack = e.m.packs[p];
          const s = style(e.m.id);
          return {
            id: e.m.id, name: e.m.name, purpose: e.m.purpose, foundation: e.m.foundation, category: q ? e.cat.name : '',
            dashboard: e.m.dashboard || '',
            workspace: e.m.workspaceKind === 'element' ? e.m.workspaceElement : e.m.workspaceKind === 'widget' ? 'OBDX widget' : e.m.workspaceKind === 'screen' ? 'OBDX screen' : 'Nothing today',
            packName: inPack.name || '—', builtOn: inPack.builtOn,
            readiness: pill.apply(null, READY[inPack.readiness]),
            mapping: pill.apply(null, MAPPING[inPack.mapping]), proposed: inPack.mappingConfidence === 'proposed',
            styleText: s ? nameOf(LOOKS, s.look) + (s.own ? ' · its own style' : '') : '',
            open: () => self.openDetail(e.m.id)
          };
        });
      });
      self.pager = ui.pager(self.rows, PAGE);
      self.resultText = ko.pureComputed(() => {
        const n = self.rows().length;
        const q = self.query().trim();
        const cat = (self.categories().find((c) => c.id === self.category()) || {}).name;
        return n + (n === 1 ? ' component' : ' components') + (q ? ' match “' + q + '”' : ' in ' + cat) + ' · ' + self.packName();
      });
      self.filtered = ko.pureComputed(() => !!self.query().trim() || self.readiness() !== 'all' || self.mapping() !== 'all');
      self.clearFilters = () => { self.query(''); self.readiness('all'); self.mapping('all'); };

      // The detail panel and its style choice ------------------------------------------------------------------------
      self.detailId = ko.observable(null);
      self.detailOpen = ko.observable(false);
      self.detailOpen.subscribe((open) => { if (!open) { self.detailId(null); } });
      self.openDetail = (id) => { self.detailId(id); self.detailOpen(true); };
      self.detail = ko.pureComputed(() => {
        const id = self.detailId();
        const e = id && all().find((x) => x.m.id === id);
        if (!e) { return null; }
        const c = self.catalogue();
        const current = e.m.packs[self.packId()];
        return {
          name: e.m.name, purpose: e.m.purpose, subtitle: e.cat.name + (e.m.dashboard ? ' · ' + e.m.dashboard : ''),
          workspace: e.m.workspaceKind === 'element' ? 'Replaces ' + e.m.workspaceElement + ' in the workspace.' : e.m.workspaceKind === 'none' ? 'New: nothing in the workspace to replace.' : 'Rebuilds an ' + (e.m.workspaceKind === 'widget' ? 'OBDX widget' : 'OBDX screen') + ' from pack components.',
          packs: c.packs.map((p) => {
            const ip = e.m.packs[p.id];
            return { pack: p.name, name: ip.name || '—', readiness: pill.apply(null, READY[ip.readiness]), mapping: pill.apply(null, MAPPING[ip.mapping]),
              proposed: ip.mappingConfidence === 'proposed', builtOn: ip.builtOn, source: ip.source || '' };
          }),
          gates: Object.keys(current.gates).map((g) => ({ name: GATE_NAMES[g] || g, state: pill.apply(null, GATE[current.gates[g]] || [current.gates[g], 'grey']) })),
          gatesFor: self.packName(), evidence: current.mappingEvidence
        };
      });

      // The component's own style: an empty choice takes the workspace default.
      const choice = { look: ko.observable(''), hover: ko.observable(''), click: ko.observable(''), scroll: ko.observable(''), mode: ko.observable(''), brand: ko.observable('') };
      self.choice = choice;
      let loadingChoice = false;
      self.detailId.subscribe((id) => {
        const d = self.draft();
        const own = (id && d && (d.components || {})[id]) || {};
        loadingChoice = true;
        choice.look(own.look || ''); choice.mode(own.mode || ''); choice.brand(own.brand || '');
        choice.hover((own.motion && own.motion.hover) || ''); choice.click((own.motion && own.motion.click) || ''); choice.scroll((own.motion && own.motion.scroll) || '');
        loadingChoice = false;
      });
      Object.keys(choice).forEach((k) => choice[k].subscribe(() => {
        const id = self.detailId();
        const d = self.draft();
        if (loadingChoice || !id || !d) { return; }
        const next = clone(d);
        next.components = next.components || {};
        const motion = { hover: choice.hover() || null, click: choice.click() || null, scroll: choice.scroll() || null };
        const own = { look: choice.look() || null, mode: choice.mode() || null, brand: choice.brand() || null, motion: motion.hover || motion.click || motion.scroll ? motion : null };
        if (own.look || own.mode || own.brand || own.motion) { next.components[id] = own; } else { delete next.components[id]; }
        self.draft(next);
      }));
      const defaults = ko.pureComputed(() => (self.draft() ? self.draft().defaults : { look: 'elevated', motion: { hover: 'lift', click: 'press', scroll: 'fadeup' }, mode: 'light', brand: 'workspace' }));
      self.lookOptions = ko.pureComputed(() => withDefault(LOOKS, defaults().look));
      self.hoverOptions = ko.pureComputed(() => withDefault(HOVER, defaults().motion.hover));
      self.clickOptions = ko.pureComputed(() => withDefault(CLICK, defaults().motion.click));
      self.scrollOptions = ko.pureComputed(() => withDefault(SCROLL, defaults().motion.scroll));
      self.modeOptions = ko.pureComputed(() => withDefault(MODES, defaults().mode));
      self.brandOptions = ko.pureComputed(() => withDefault(BRANDS, defaults().brand));

      // The workspace defaults, in their own panel.
      self.defaultsOpen = ko.observable(false);
      const def = { look: ko.observable('elevated'), hover: ko.observable('lift'), click: ko.observable('press'), scroll: ko.observable('fadeup'), mode: ko.observable('light'), brand: ko.observable('workspace') };
      self.def = def;
      self.allLooks = options(LOOKS); self.allHover = options(HOVER); self.allClick = options(CLICK); self.allScroll = options(SCROLL); self.allModes = options(MODES); self.allBrands = options(BRANDS);
      self.openDefaults = () => {
        const d = defaults();
        def.look(d.look); def.hover(d.motion.hover); def.click(d.motion.click); def.scroll(d.motion.scroll); def.mode(d.mode); def.brand(d.brand);
        self.defaultsOpen(true);
      };
      self.applyDefaults = () => {
        const next = clone(self.draft());
        next.defaults = { look: def.look(), motion: { hover: def.hover(), click: def.click(), scroll: def.scroll() }, mode: def.mode(), brand: def.brand() };
        self.draft(next);
        self.defaultsOpen(false);
      };
      self.defaultsText = ko.pureComputed(() => {
        const d = defaults();
        return nameOf(LOOKS, d.look) + ' · ' + nameOf(HOVER, d.motion.hover) + ', ' + nameOf(CLICK, d.motion.click) + ', ' + nameOf(SCROLL, d.motion.scroll) + ' · ' + nameOf(BRANDS, d.brand) + ', ' + d.mode;
      });

      // Saving the style ---------------------------------------------------------------------------------------------
      self.dirty = ko.pureComputed(() => !!self.saved() && JSON.stringify(self.draft()) !== JSON.stringify(self.saved().style));
      self.ownCount = ko.pureComputed(() => Object.keys((self.draft() && self.draft().components) || {}).length);
      self.styleText = ko.pureComputed(() => {
        const s = self.saved();
        if (!s) { return ''; }
        if (self.dirty()) { return 'Unsaved style changes' + (self.ownCount() ? ' · ' + self.ownCount() + ' with their own style' : ''); }
        return s.savedAt ? 'Style saved · ' + ui.when(s.savedAt) + (s.savedBy ? ' by ' + s.savedBy : '') : 'Default style · not saved yet';
      });
      self.styleCss = ko.pureComputed(() => pill(self.styleText(), self.dirty() ? 'amber' : self.saved() && self.saved().savedAt ? 'green' : 'grey').css);
      self.discard = () => { if (self.saved()) { self.draft(clone(self.saved().style)); } };
      self.save = () => {
        const id = self.workspaceId();
        if (!id || !self.dirty()) { return; }
        api.put('workspaces/' + id + '/component-style', self.draft()).then((s) => {
          self.saved(s);
          self.draft(clone(s.style));
          toast.success('Component style saved. New code and pack upgrades use it; existing screens change only through a reviewed change.');
        }).catch((e) => toast.error(ui.errorText(e)));
      };

      const loadStyle = (id) => {
        if (!id) { self.saved(null); self.draft(null); return Promise.resolve(); }
        return api.get('workspaces/' + id + '/component-style').then((s) => {
          s.style.components = s.style.components || {};
          self.saved(s);
          self.draft(clone(s.style));
        });
      };
      const loadCatalogue = (id) => api.get(id ? 'workspaces/' + id + '/component-packs' : 'component-packs').then((c) => self.catalogue(c));
      self.workspaceId.subscribe((id) => { Promise.all([loadCatalogue(id), loadStyle(id)]).catch((e) => self.error(ui.errorText(e))); });

      self.connected = () => {
        accUtils.announce('Component factory page loaded.', 'assertive');
        document.title = 'Component factory';
        self.loading(true);
        Promise.all([loadCatalogue(self.workspaceId()), loadStyle(self.workspaceId())]).then(() => {
          self.error(null);
        }).catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
    }

    return ComponentsViewModel;
  }
);
