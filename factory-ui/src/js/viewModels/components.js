/*
 * Component factory: the premium component packs from the registry (target-packs/components). Each component is a card
 * with two sides: what the workspace has today (the stock JET element, or nothing) and the pack's component, live, in
 * the workspace's component style. Readiness is only what the registry records: Available when every quality gate
 * passed, In test when built, Planned when named but not built; a preview shows only what a pack has built.
 *
 * Each card has its own theme (light or dark, a brand), design option (the carousel) and motion; "Apply to all" makes a
 * card's choice the workspace default. The panel shows a component's checks, API, mapping, the four packs side by side,
 * and Customise, which saves a copy in My copies. Manage pack installs or upgrades a pack in the code through a change.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast', '../services/session',
        '../services/jetPack', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, session, jetPack) {
    const pill = ui.pill;
    const READY = { available: ['Available', 'green'], 'in-test': ['In test', 'amber'], planned: ['Planned', 'grey'], 'not-in-pack': ['Not in this pack', 'grey'] };
    const MAPPING = {
      'direct-replacement': ['Direct replacement', 'green'], 'property-mapping': ['Property mapping', 'blue'], 'event-mapping': ['Event mapping', 'blue'],
      'custom-transformation': ['Custom transformation', 'amber'], 'manual-intervention': ['Manual intervention', 'red'], unsupported: ['Unsupported', 'grey'], new: ['New', 'violet']
    };
    // The mapping filter's groups (the board's chips)
    const MAP_GROUPS = [['all', 'All'], ['direct', 'Direct'], ['needs', 'Needs mapping'], ['transform', 'Transformation or manual'], ['unsupported', 'Unsupported'], ['new', 'New']];
    const GROUP_OF = { 'direct-replacement': 'direct', 'property-mapping': 'needs', 'event-mapping': 'needs', 'custom-transformation': 'transform', 'manual-intervention': 'transform', unsupported: 'unsupported', new: 'new' };
    const GATE = { passed: ['Passed', 'green'], failed: ['Failing', 'red'], 'not-run': ['Not run yet', 'grey'], 'not-applicable': ['Not needed', 'grey'] };
    const GATE_NAMES = { unit: 'Unit tests', accessibility: 'Accessibility', visual: 'Visual snapshot', themes: 'Light and dark themes', responsive: 'Phone, tablet and laptop', parity: 'Parity with the JET element' };
    const LOOKS = [['elevated', 'Elevated'], ['soft', 'Soft'], ['glass', 'Glass'], ['outline', 'Outline'], ['vivid', 'Vivid'], ['pill', 'Pill'], ['brutal', 'Neo-brutalist'], ['redwood', 'Redwood']];
    const HOVER = [['none', 'None'], ['lift', 'Lift'], ['glow', 'Glow'], ['shine', 'Shine']];
    const CLICK = [['none', 'None'], ['press', 'Press'], ['ripple', 'Ripple'], ['bounce', 'Bounce']];
    const SCROLL = [['none', 'None'], ['fadeup', 'Fade up'], ['scale', 'Scale in'], ['slide', 'Slide in'], ['blur', 'Blur in']];
    const MODES = [['light', 'Light'], ['dark', 'Dark']];
    const BRANDS = [['workspace', 'Workspace brand', null], ['indigo', 'Indigo', '#4f46e5'], ['emerald', 'Emerald', '#059669'], ['burgundy', 'Burgundy', '#9f1239'], ['gold', 'Gold', '#b45309']];
    const LOGO = { 'jet-premium': 'J', react: 'R', 'react-native': 'N', angular: 'A' };
    // What each built component previews as (its kind in the live preview)
    const PREVIEW = { button: 'button', 'icon-button': 'iconbutton', 'text-field': 'field', amount: 'amount', select: 'select', 'checkbox-group': 'check',
      'choice-group': 'radio', date: 'date', dialog: 'dialog', toast: 'toast', card: 'card', tabs: 'tabs', 'data-grid': 'table' };
    const A11Y = {
      button: 'A real button: Enter and Space press it, the focus ring shows, busy stops a second press.', iconbutton: 'Named by its label for screen readers, with a tooltip; 44 px target.',
      field: 'Label tied to the field, errors announced and tied with aria-describedby, required said once.', amount: 'Label tied to the field; the currency is read with the label; errors announced.',
      select: 'The native select: every screen reader and phone knows it.', check: 'A fieldset with a legend; every choice is a labelled checkbox.', radio: 'A fieldset with a legend; arrow keys move between choices.',
      date: 'The browser\'s date input; min, max and blocked days explained in the message.', dialog: 'Modal: focus moves in, stays inside and goes back; Escape closes it.',
      toast: 'Errors are alerts and stay; others are status messages that close on time.', card: 'A card that is a button says so; Enter and Space open it.',
      tabs: 'A tablist: arrow keys, Home and End move; only the chosen tab is in the tab order.', table: 'A caption, column headers with scope, aria-sort on sortable columns.'
    };
    const RESPONSIVE = 'From a 375 px phone to a laptop: nothing runs past the edge, controls stay at least 24 by 24 px (checked by the browser gates).';
    const VARIANTS = [['', 'As shipped'], ['default', 'Default'], ['secondary', 'Secondary'], ['outline', 'Outline'], ['ghost', 'Ghost'], ['destructive', 'Destructive'], ['link', 'Link']];
    const CORNERS = [['', 'As shipped'], ['square', 'Square'], ['rounded', 'Rounded'], ['pill', 'Pill']];
    const SIZES = [['compact', 'Compact'], ['standard', 'Standard'], ['large', 'Large']];
    const COLOURS = [['brand', 'Brand'], ['neutral', 'Neutral'], ['success', 'Success']];
    const PER_VIEW = 6;
    // The premium JET pack keeps the JET attribute and event names
    const JET_PROPS = { label: 'label-hint', readOnly: 'readonly', helpText: 'help.instruction', error: 'messages-custom', maxLength: 'length.max', clearable: 'clear-icon',
      horizontal: 'layout', open: 'open() / close()', title: 'dialog-title', tabs: 'options', rows: 'data', keyField: 'key-attributes', selectionMode: 'selection-mode',
      cancelBehavior: 'cancel-behavior', disabledDays: 'disabled-days' };
    const JET_EVENTS = { onChange: 'on-value-changed', onAction: 'on-oj-action', onOpenChange: 'on-oj-close', onClose: 'on-oj-close', onSelectionChange: 'on-selection-changed',
      onSort: 'on-oj-sort', onSelectedChange: 'on-selected-changed' };
    const nameOf = (list, v) => (list.find((x) => x[0] === v) || [v, v])[1];
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const kebab = (s) => String(s || '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const chromingOf = (variant) => ({ default: 'callToAction', secondary: 'solid', outline: 'outlined', ghost: 'borderless', destructive: 'danger', link: 'borderless' }[variant] || 'callToAction');

    function ComponentsViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.workspaceName = ko.pureComputed(() => { const w = workspaceSelection.options().find((o) => o.value === self.workspaceId()); return w ? (w.name || w.label.split(' (')[0]) : 'this workspace'; });
      self.canManage = ko.pureComputed(() => !!self.workspaceId() && session.can(self.workspaceId(), 'MANAGE_CODE'));
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.catalogue = ko.observable(null);
      self.saved = ko.observable(null);
      self.draft = ko.observable(null);
      self.packStates = ko.observable([]);
      self.used = ko.observable(null);
      self.packReady = jetPack.ready;
      self.packId = ko.observable('jet-premium');
      self.version = ko.observable('current');
      self.category = ko.observable('foundation');
      self.query = ko.observable('');
      self.readiness = ko.observable('all');
      self.mapGroup = ko.observable('all');
      self.dashboard = ko.observable('all');
      self.limits = ko.observable({});

      self.readinessOptions = [{ value: 'all', label: 'All' }, { value: 'available', label: 'Available' }, { value: 'in-test', label: 'In test' }, { value: 'planned', label: 'Planned' }];
      self.mapChips = MAP_GROUPS.map((g) => ({ label: g[1], pressed: ko.pureComputed(() => (self.mapGroup() === g[0] ? 'true' : 'false')),
        css: ko.pureComputed(() => 'factory-cf-chip' + (self.mapGroup() === g[0] ? ' is-on' : '')), pick: () => self.mapGroup(g[0]) }));
      self.dashChips = [['all', 'All dashboards'], ['retail', 'Retail and SMB'], ['corporate', 'Corporate']].map((g) => ({ label: g[1],
        pressed: ko.pureComputed(() => (self.dashboard() === g[0] ? 'true' : 'false')), css: ko.pureComputed(() => 'factory-cf-chip' + (self.dashboard() === g[0] ? ' is-on' : '')),
        pick: () => self.dashboard(g[0]) }));

      const pack = ko.pureComputed(() => { const c = self.catalogue(); return c ? c.packs.find((p) => p.id === self.packId()) || c.packs[0] : null; });
      self.pack = pack;
      self.packName = ko.pureComputed(() => (pack() ? pack().name : ''));
      self.packLead = ko.pureComputed(() => (pack() ? pack().description : ''));
      const stateOf = (id) => self.packStates().find((s) => s.pack === id) || null;
      const installedOf = (id) => { const s = stateOf(id); return s && s.installed ? s.installed : null; };

      self.tiles = ko.pureComputed(() => {
        const c = self.catalogue();
        if (!c) { return []; }
        return c.packs.map((p) => {
          const total = c.components;
          const pct = (n) => Math.round(n / total * 100) + '%';
          const inst = installedOf(p.id);
          return {
            id: p.id, name: p.name, logo: LOGO[p.id] || p.name[0], pkg: p.packageName + ' ' + p.version,
            range: p.id === 'jet-premium' && c.jet && c.jet.major ? c.jet.found + ' · ' + c.jet.buildName + ' build' : p.frameworkRange,
            state: inst ? pill('Installed ' + inst, 'green') : pill('Preview', 'amber'),
            counts: p.counts.available + ' available · ' + p.counts.inTest + ' in test · ' + p.counts.planned + ' planned',
            available: { width: pct(p.counts.available) }, inTest: { width: pct(p.counts.inTest) },
            selected: ko.pureComputed(() => self.packId() === p.id),
            css: ko.pureComputed(() => 'factory-cf-tile' + (self.packId() === p.id ? ' is-selected' : '')),
            pick: () => { self.packId(p.id); self.version('current'); }
          };
        });
      });

      // The pack's version: what is installed (or the preview) and the one being built
      self.versionChips = ko.pureComputed(() => {
        const p = pack();
        if (!p) { return []; }
        const inst = installedOf(p.id);
        const list = [{ v: 'current', label: p.version + (inst === p.version ? ' installed' : ' preview') }];
        if (p.next) { list.push({ v: 'next', label: p.next.version + ' next' }); }
        return list.map((x) => ({ label: x.label, pressed: ko.pureComputed(() => (self.version() === x.v ? 'true' : 'false')),
          css: ko.pureComputed(() => 'factory-cf-chip' + (self.version() === x.v ? ' is-on' : '')), pick: () => self.version(x.v) }));
      });
      const nextAdds = ko.pureComputed(() => (self.version() === 'next' && pack() && pack().next ? pack().next.adds : []));

      // The JET release the premium pack is built for, from the workspace's Project Profile scan
      self.jet = ko.pureComputed(() => {
        const c = self.catalogue();
        if (!c || !c.jet || self.packId() !== 'jet-premium') { return null; }
        const t = c.jet;
        const found = !!t.major && t.note.indexOf('older than') < 0;
        return { note: t.note, detail: t.buildDetail, evidence: t.evidence && t.evidence.length ? 'Seen in ' + t.evidence.slice(0, 2).join(', ') : '',
          css: 'factory-cf-jet' + (found ? '' : ' is-warn'), showProfile: t.status !== 'no-workspace' };
      });

      const all = ko.pureComputed(() => {
        const c = self.catalogue();
        if (!c) { return []; }
        const out = [];
        c.categories.forEach((cat) => cat.components.forEach((m) => out.push({ m: m, cat: cat })));
        return out;
      });
      const copies = ko.pureComputed(() => ((self.draft() && self.draft().copies) || []));

      self.categories = ko.pureComputed(() => {
        const c = self.catalogue();
        if (!c) { return []; }
        return c.categories.map((cat) => ({
          id: cat.id, name: cat.name, count: cat.components.length,
          css: ko.pureComputed(() => 'factory-cf-cat' + (self.category() === cat.id && !self.query().trim() ? ' is-active' : '')),
          pick: () => { self.query(''); self.category(cat.id); }
        }));
      });
      self.copiesCount = ko.pureComputed(() => copies().length);
      self.copiesCss = ko.pureComputed(() => 'factory-cf-cat' + (self.category() === 'copies' ? ' is-active' : ''));
      self.showCopies = () => { self.query(''); self.category('copies'); };
      self.inCopies = ko.pureComputed(() => self.category() === 'copies');
      self.inWidgets = ko.pureComputed(() => self.category() === 'widgets' && !self.query().trim());

      // The style of one component: its own choice over the workspace default
      const styleOf = (id) => {
        const d = self.draft();
        if (!d) { return { look: 'elevated', motion: { hover: 'lift', click: 'press', scroll: 'fadeup' }, mode: 'light', brand: 'workspace', own: {} }; }
        const own = (d.components || {})[id] || {};
        return { look: own.look || d.defaults.look, motion: Object.assign({}, d.defaults.motion, own.motion || {}), mode: own.mode || d.defaults.mode,
          brand: own.brand || d.defaults.brand, own: own };
      };
      const setOwn = (id, change) => {
        const d = self.draft();
        if (!d) { return; }
        const next = clone(d);
        next.components = next.components || {};
        const own = Object.assign({ look: null, motion: null, mode: null, brand: null }, next.components[id] || {});
        change(own, next.defaults);
        if (own.motion && !own.motion.hover && !own.motion.click && !own.motion.scroll) { own.motion = null; }
        if (own.look || own.mode || own.brand || own.motion) { next.components[id] = own; } else { delete next.components[id]; }
        self.draft(next);
      };
      const previewCss = (s, extra) => jetPack.styleClasses({ look: s.look, motion: s.motion, mode: s.mode }) + ' factory-cf-live' + (extra ? ' ' + extra : '');
      const brandStyle = (brand) => { const b = BRANDS.find((x) => x[0] === brand); return b && b[2] ? { '--bx-brand': b[2], '--bx-brand-2': b[2] } : {}; };
      const visibleDash = (m) => self.dashboard() === 'all' || !m.dashboard || m.dashboard.toLowerCase().indexOf(self.dashboard() === 'retail' ? 'retail' : 'corporate') >= 0;

      const matches = ko.pureComputed(() => {
        const q = self.query().trim().toLowerCase();
        const p = self.packId();
        const adds = nextAdds();
        return all().filter((e) => {
          const inPack = e.m.packs[p];
          if (!q && e.cat.id !== self.category()) { return false; }
          if (q && (e.m.name + ' ' + e.m.purpose + ' ' + (e.m.workspaceElement || '') + ' ' + (e.m.dashboard || '') + ' '
            + Object.keys(e.m.packs).map((k) => (e.m.packs[k].name || '') + ' ' + (e.m.packs[k].builtOn || '')).join(' ')).toLowerCase().indexOf(q) < 0) { return false; }
          if (self.readiness() !== 'all' && inPack.readiness !== self.readiness()) { return false; }
          if (self.mapGroup() !== 'all' && GROUP_OF[inPack.mapping] !== self.mapGroup()) { return false; }
          if (e.cat.id === 'widgets' && !q && !visibleDash(e.m)) { return false; }
          if (self.version() === 'next' && adds.indexOf(e.m.id) < 0 && !inPack.source) { return false; }
          return true;
        });
      });
      const viewKey = ko.pureComputed(() => [self.category(), self.query().trim(), self.readiness(), self.mapGroup(), self.packId(), self.version(), self.dashboard()].join('|'));
      const limit = ko.pureComputed(() => self.limits()[viewKey()] || PER_VIEW);
      self.moreLeft = ko.pureComputed(() => Math.max(0, matches().length - limit()));
      self.showMore = () => { const l = Object.assign({}, self.limits()); l[viewKey()] = limit() + PER_VIEW; self.limits(l); };
      self.moreText = ko.pureComputed(() => 'Show ' + Math.min(PER_VIEW, self.moreLeft()) + ' more (' + self.moreLeft() + ' left)');

      // One card: the stock JET side, the pack side live, its theme, design carousel and motion
      self.openMotion = ko.observable(null);
      self.cards = ko.pureComputed(() => {
        const p = pack();
        if (!p) { return []; }
        const usedSet = self.used();
        const adds = nextAdds();
        const q = self.query().trim();
        return matches().slice(0, limit()).map((e) => {
          const m = e.m;
          const ip = m.packs[p.id];
          const s = styleOf(m.id);
          const built = !!ip.source;
          const isNew = adds.indexOf(m.id) >= 0;
          const kind = PREVIEW[m.id] || 'generic';
          const usedHere = m.workspaceKind === 'element' && (!usedSet || usedSet.has(m.workspaceElement));
          const lookIndex = Math.max(0, LOOKS.findIndex((x) => x[0] === s.look));
          const setLook = (i) => setOwn(m.id, (o) => { o.look = LOOKS[(i + LOOKS.length) % LOOKS.length][0]; });
          const differsTheme = !!(s.own.mode || s.own.brand);
          const differsDesign = !!(s.own.look || s.own.motion);
          return {
            id: m.id, name: m.name, purpose: m.purpose, foundation: m.foundation,
            readiness: pill.apply(null, isNew ? ['Planned for ' + p.next.version, 'grey'] : READY[ip.readiness]),
            mapping: pill.apply(null, MAPPING[ip.mapping]), proposed: ip.mappingConfidence === 'proposed',
            where: q ? 'in ' + e.cat.name : (m.dashboard || ''), builtOn: 'Built on ' + (ip.builtOn || '—'),
            jetUsed: usedHere, jetKind: kind, jetElement: m.workspaceElement || '', jetLabel: (m.sample && m.sample.label) || m.name,
            jetNote: m.workspaceKind === 'element' ? 'Not used in ' + self.workspaceName() + ' today' : m.workspaceKind === 'none' ? 'Nothing in ' + self.workspaceName() + ' today: this is new'
              : 'Today an OBDX ' + (m.workspaceKind === 'widget' ? 'widget' : 'screen') + ' built by hand',
            tag: isNew ? 'New in ' + p.next.version : 'New', logo: LOGO[p.id] || p.name[0], packName: p.name,
            live: built && self.packReady() && p.id !== 'react-native', kind: kind, native: built && p.id === 'react-native',
            emptyText: isNew ? 'Planned for ' + p.next.version + ': it ships when it passes its checks' : ip.readiness === 'not-in-pack' ? 'Not in this pack' : 'Not in this pack yet',
            nameInPack: ip.name || '—', label: (m.sample && m.sample.label) || m.name,
            css: previewCss(s), brand: brandStyle(s.brand),
            // The theme bar
            modes: MODES.map((x) => ({ label: x[1], value: x[0] })), mode: ko.pureComputed({ read: () => styleOf(m.id).mode, write: (v) => setOwn(m.id, (o) => { o.mode = v; }) }),
            swatches: BRANDS.map((b) => ({ label: b[1], on: s.brand === b[0] ? 'true' : 'false', css: 'factory-cf-swatch is-' + b[0] + (s.brand === b[0] ? ' is-on' : ''),
              pick: () => setOwn(m.id, (o) => { o.brand = b[0]; }) })),
            themeText: nameOf(BRANDS, s.brand) + ' · ' + s.mode, differsTheme: differsTheme,
            applyTheme: () => {
              const next = clone(self.draft());
              next.defaults.mode = s.mode; next.defaults.brand = s.brand;
              Object.keys(next.components || {}).forEach((k) => { next.components[k].mode = null; next.components[k].brand = null;
                if (!next.components[k].look && !next.components[k].motion) { delete next.components[k]; } });
              self.draft(next);
              toast.info(nameOf(BRANDS, s.brand) + ' · ' + s.mode + ' is now the theme of every component. Save the style to keep it.');
            },
            // The design carousel
            canDesign: built, lookLabel: nameOf(LOOKS, s.look) + ' · ' + (lookIndex + 1) + ' of ' + LOOKS.length,
            prevLook: () => setLook(lookIndex - 1), nextLook: () => setLook(lookIndex + 1),
            dots: LOOKS.map((x, i) => ({ label: x[1], on: i === lookIndex ? 'true' : 'false', css: 'factory-cf-dot' + (i === lookIndex ? ' is-on' : ''), pick: () => setLook(i) })),
            // Motion
            motionTitle: 'Motion: ' + nameOf(HOVER, s.motion.hover) + ' · ' + nameOf(CLICK, s.motion.click) + ' · ' + nameOf(SCROLL, s.motion.scroll),
            motionOpen: ko.pureComputed(() => self.openMotion() === m.id), motionExpanded: ko.pureComputed(() => (self.openMotion() === m.id ? 'true' : 'false')),
            toggleMotion: () => self.openMotion(self.openMotion() === m.id ? null : m.id),
            motionGroups: [['hover', 'Hover', HOVER], ['click', 'Click', CLICK], ['scroll', 'Scroll', SCROLL]].map((g) => ({ label: g[1],
              chips: g[2].map((x) => ({ label: x[1], on: s.motion[g[0]] === x[0] ? 'true' : 'false', css: 'factory-cf-chip' + (s.motion[g[0]] === x[0] ? ' is-on' : ''),
                pick: () => setOwn(m.id, (o) => { o.motion = Object.assign({}, o.motion || {}); o.motion[g[0]] = x[0]; }) })) })),
            differsDesign: differsDesign,
            applyDesign: () => {
              const next = clone(self.draft());
              next.defaults.look = s.look; next.defaults.motion = clone(s.motion);
              Object.keys(next.components || {}).forEach((k) => { next.components[k].look = null; next.components[k].motion = null;
                if (!next.components[k].mode && !next.components[k].brand) { delete next.components[k]; } });
              self.draft(next);
              toast.info(nameOf(LOOKS, s.look) + ' and its motion are now the design of every component. Save the style to keep it.');
            },
            details: () => self.openDetail(m.id, 'overview'), customise: () => self.openDetail(m.id, 'customise')
          };
        });
      });
      self.resultText = ko.pureComputed(() => {
        const n = matches().length;
        const q = self.query().trim();
        const p = pack();
        const cat = (self.categories().find((c) => c.id === self.category()) || {}).name;
        const v = p ? p.packageName + ' ' + (self.version() === 'next' && p.next ? p.next.version : p.version) : '';
        const shown = Math.min(n, limit());
        return (q ? n + ' of ' + all().length + ' components match “' + q + '”' : n + ' of ' + (self.categories().find((c) => c.id === self.category()) || { count: n }).count + ' in ' + cat)
          + ' · ' + self.packName() + ' ' + v.split(' ').pop() + (n ? ' · showing ' + shown : '');
      });
      self.filtered = ko.pureComputed(() => !!self.query().trim() || self.readiness() !== 'all' || self.mapGroup() !== 'all');
      self.clearFilters = () => { self.query(''); self.readiness('all'); self.mapGroup('all'); };

      // My copies ----------------------------------------------------------------------------------------------------
      self.copyCards = ko.pureComputed(() => copies().map((cp) => {
        const e = all().find((x) => x.m.id === cp.component);
        const p = self.catalogue() ? self.catalogue().packs.find((x) => x.id === cp.pack) : null;
        const s = styleOf(cp.component);
        return { name: cp.name, note: [nameOf(CORNERS, cp.corners), nameOf(SIZES, cp.size), nameOf(COLOURS, cp.colour)].concat(cp.variant ? [nameOf(VARIANTS, cp.variant)] : []).join(', ')
            + (cp.at ? ' · ' + ui.when(cp.at) : ''),
          from: 'From ' + (e && p ? e.m.packs[p.id].name : cp.component) + ' · ' + (p ? p.name : cp.pack), kind: PREVIEW[cp.component] || 'generic',
          label: e && e.m.sample && e.m.sample.label ? e.m.sample.label : (e ? e.m.name : cp.name), live: self.packReady() && cp.pack !== 'react-native',
          css: previewCss(s, 'is-copy'), style: Object.assign(brandStyle(s.brand), copyVars(cp)), chroming: chromingOf(cp.variant),
          remove: () => self.removeCopy(cp.name) };
      }));
      const copyVars = (o) => {
        const v = {};
        if (o.corners === 'square') { v['--bx-radius'] = '2px'; v['--bx-radius-lg'] = '4px'; }
        if (o.corners === 'pill') { v['--bx-radius'] = '999px'; v['--bx-radius-lg'] = '24px'; }
        if (o.size === 'compact') { v['--bx-height'] = '36px'; }
        if (o.size === 'large') { v['--bx-height'] = '52px'; }
        if (o.colour === 'neutral') { v['--bx-brand'] = '#475569'; v['--bx-brand-2'] = '#334155'; }
        if (o.colour === 'success') { v['--bx-brand'] = '#059669'; v['--bx-brand-2'] = '#047857'; }
        return v;
      };
      self.removeCopy = (name) => {
        api.del('workspaces/' + self.workspaceId() + '/component-style/copies/' + encodeURIComponent(name)).then((s) => {
          self.saved(Object.assign({}, self.saved(), { style: Object.assign({}, self.saved().style, { copies: s.style.copies }) }));
          self.draft(Object.assign(clone(self.draft()), { copies: s.style.copies }));
          toast.success(name + ' removed. The shipped component is not affected.');
        }).catch((e) => toast.error(ui.errorText(e)));
      };

      // The panel: Overview, API and code, Mapping, Compare, Customise -------------------------------------------------
      self.detailId = ko.observable(null);
      self.detailOpen = ko.observable(false);
      self.detailTab = ko.observable('overview');
      self.detailOpen.subscribe((open) => { if (!open) { self.detailId(null); } });
      self.closeDetail = () => self.detailOpen(false);
      const ed = { variant: ko.observable(''), corners: ko.observable(''), size: ko.observable('standard'), colour: ko.observable('brand') };
      self.ed = ed;
      self.openDetail = (id, tab) => {
        ed.variant(''); ed.corners(''); ed.size('standard'); ed.colour('brand');
        self.detailId(id); self.detailTab(tab || 'overview'); self.detailOpen(true);
      };
      self.detailTabs = ko.pureComputed(() => ui.tabs(self.detailTab, [{ value: 'overview', label: 'Overview' }, { value: 'api', label: 'API and code' },
        { value: 'mapping', label: 'Mapping' }, { value: 'compare', label: 'Compare' }, { value: 'customise', label: 'Customise' }]));
      self.variantOptions = VARIANTS.map((x) => ({ value: x[0], label: x[1] }));
      self.cornerOptions = CORNERS.map((x) => ({ value: x[0], label: x[1] }));
      self.sizeOptions = SIZES.map((x) => ({ value: x[0], label: x[1] }));
      self.colourOptions = COLOURS.map((x) => ({ value: x[0], label: x[1] }));
      self.detail = ko.pureComputed(() => {
        const id = self.detailId();
        const e = id && all().find((x) => x.m.id === id);
        const c = self.catalogue();
        if (!e || !c) { return null; }
        const p = pack();
        const ip = e.m.packs[p.id];
        const s = styleOf(e.m.id);
        const kind = PREVIEW[e.m.id] || 'generic';
        const syntax = p.id === 'jet-premium' || p.id === 'angular' ? 'html' : 'jsx';
        const base = kebab(ip.name || e.m.name);
        const parts = [ed.variant(), ed.corners(), ed.size() !== 'standard' ? ed.size() : '', ed.colour() !== 'brand' ? ed.colour() : ''].filter(Boolean);
        const copyName = parts.length ? base + '-' + parts.join('-') : base + '-copy';
        const attrs = [['look', s.look], ['variant', ed.variant()], ['corners', ed.corners()], ['size', ed.size() !== 'standard' ? ed.size() : ''],
          ['tone', ed.colour() !== 'brand' ? ed.colour() : '']].filter((a) => a[1]).map((a) => a[0] + '="' + a[1] + '"').join(' ');
        const tag = ip.name || base;
        const jm = e.m.jetMapping;
        const api_ = e.m.api;
        const deps = (p.dependencies || []).map((d) => ({ name: d.name, version: d.version, licence: d.licence }));
        const mainEvent = (pk) => (pk === 'jet-premium' ? 'on-oj-action / on-value-changed' : pk === 'angular' ? '(action) / [(value)]' : 'onAction / onChange');
        return {
          title: ip.name || e.m.name, subtitle: e.m.name + ' · ' + p.name + ' · ' + p.packageName + ' ' + p.version, purpose: e.m.purpose,
          foundation: e.m.foundation, readiness: pill.apply(null, READY[ip.readiness]), mapping: pill.apply(null, MAPPING[ip.mapping]),
          live: !!ip.source && self.packReady() && p.id !== 'react-native', native: !!ip.source && p.id === 'react-native', kind: kind,
          label: (e.m.sample && e.m.sample.label) || e.m.name, css: previewCss(s, 'is-pinned'), style: Object.assign(brandStyle(s.brand), copyVars({ corners: ed.corners(), size: ed.size(), colour: ed.colour() })),
          chroming: chromingOf(ed.variant()),
          gates: Object.keys(ip.gates).map((g) => ({ name: GATE_NAMES[g] || g, state: pill.apply(null, GATE[ip.gates[g]] || [ip.gates[g], 'grey']) })),
          builtOnRows: c.packs.map((q) => ({ pack: q.name, builtOn: e.m.packs[q.id].builtOn || '—', repo: q.repository || '—' })),
          accessibility: A11Y[kind] || 'Keyboard and screen reader behaviour as the JET element, in the pack design.', responsive: RESPONSIVE, deps: deps,
          workspace: e.m.workspaceKind === 'element' ? 'Replaces ' + e.m.workspaceElement + ' in the workspace.' : e.m.workspaceKind === 'none' ? 'New: nothing in the workspace to replace.'
            : 'Rebuilds an ' + (e.m.workspaceKind === 'widget' ? 'OBDX widget' : 'OBDX screen') + ' from pack components.',
          // API and code
          hasApi: !!api_, props: api_ ? api_.properties.map((x) => ({ name: p.id === 'jet-premium' ? JET_PROPS[x.name] || kebab(x.name) : x.name, type: x.type, def: x.defaultValue, doc: x.doc })) : [],
          events: api_ ? api_.events.map((x) => ({ name: p.id === 'jet-premium' ? JET_EVENTS[x.name] || kebab(x.name) : p.id === 'angular' ? '(' + x.name.replace(/^on/, '').replace(/^./, (ch) => ch.toLowerCase()) + ')' : x.name,
            payload: x.payload, when: x.when })) : [],
          example: api_ && api_.example ? api_.example[p.id] || '' : '',
          // Mapping
          hasMapping: !!jm, mapFrom: jm ? jm.source : '', mapTo: ip.name || '—', mapStatus: jm ? pill.apply(null, MAPPING[jm.status] || [jm.status, 'grey']) : null,
          confidence: jm ? 'Confidence ' + jm.confidence : '', evidence: jm ? jm.evidence : ip.mappingEvidence,
          mapProps: jm ? jm.properties.map((x) => ({ from: x.from, to: x.to || 'Not carried over', conversion: x.conversion || (x.to === x.from ? 'Same name' : '') })) : [],
          binding: jm ? jm.binding : '', notCarried: jm && jm.unsupported && jm.unsupported.length ? jm.unsupported.join(', ') : 'Nothing',
          person: jm && jm.manual && jm.manual.length ? jm.manual.join(' ') : 'Nothing: the change is mechanical.',
          // Compare
          compareHead: c.packs.map((q) => ({ name: q.name, logo: LOGO[q.id] })),
          compareRows: [
            ['Name', (q) => e.m.packs[q.id].name || '—'], ['Built on', (q) => e.m.packs[q.id].builtOn || '—'], ['Package', (q) => q.packageName + ' ' + q.version],
            ['Readiness', (q) => READY[e.m.packs[q.id].readiness][0]], ['Mapping from JET', (q) => MAPPING[e.m.packs[q.id].mapping][0]], ['Main event', (q) => mainEvent(q.id)],
            ['Binding', (q) => (q.id === 'jet-premium' ? 'Knockout, as the JET element' : q.id === 'angular' ? 'Signals and form controls' : 'Props and state')],
            ['Theming', () => 'The bank tokens and the component style'], ['Input', (q) => (q.id === 'react-native' ? 'Touch, screen readers on the device' : 'Keyboard, pointer and touch')]
          ].map((r) => ({ label: r[0], cells: c.packs.map((q) => ({ text: r[1](q) })) })),
          // Customise
          canCustomise: !!ip.source, code: syntax === 'jsx' ? '<' + tag + (attrs ? ' ' + attrs : '') + ' />' : '<' + tag + (attrs ? ' ' + attrs : '') + '></' + tag + '>',
          copyName: copyName, changed: parts.length > 0, copyLine: parts.length ? 'Saves as ' + copyName : 'Change a setting to make a copy',
          saveCopy: () => {
            if (!parts.length) { toast.info('Change a setting first. The copy starts from ' + (ip.name || e.m.name) + ' as shipped.'); return; }
            api.post('workspaces/' + self.workspaceId() + '/component-style/copies', { name: copyName, component: e.m.id, pack: p.id, variant: ed.variant() || null,
              corners: ed.corners() || 'rounded', size: ed.size(), colour: ed.colour() }).then((saved) => {
              self.saved(Object.assign({}, self.saved(), { style: Object.assign({}, self.saved().style, { copies: saved.style.copies }) }));
              self.draft(Object.assign(clone(self.draft()), { copies: saved.style.copies }));
              self.detailOpen(false);
              self.query('');
              self.category('copies');
              toast.success(copyName + ' saved in My copies for ' + self.workspaceName() + '. ' + (ip.name || e.m.name) + ' stays as shipped.');
            }).catch((err) => toast.error(ui.errorText(err)));
          }
        };
      });

      // Manage pack --------------------------------------------------------------------------------------------------
      self.manageOpen = ko.observable(false);
      self.compat = ko.observable(null);
      self.openManage = () => { self.compat(null); self.manageOpen(true); };
      self.manage = ko.pureComputed(() => {
        const p = pack();
        const c = self.catalogue();
        if (!p || !c) { return null; }
        const st = stateOf(p.id) || {};
        const foundation = all().filter((e) => e.m.foundation);
        const notReady = foundation.filter((e) => e.m.packs[p.id].readiness !== 'available').length;
        return {
          logo: LOGO[p.id], name: p.name, pkg: p.packageName,
          line: (st.installed ? 'Installed ' + st.installed + ' in ' + self.workspaceName() : 'Not installed · preview ' + p.version) + ' · ' + p.frameworkRange,
          counts: p.counts.available + ' available · ' + p.counts.inTest + ' in test · ' + p.counts.planned + ' planned, of ' + c.components,
          pending: st.pending ? (st.installed ? 'Upgrade to ' : 'Install of ') + st.pending + ' is waiting for review as a change (' + (st.pendingState || 'building') + ').' : '',
          pendingChange: st.pendingChange ? '?ojr=modernization-review&run=' + st.pendingRun : '',
          upgradeAvailable: !!st.installed && st.installed !== p.version && !st.pending, upgradeTo: p.version,
          canInstall: !st.installed && !st.pending && p.id === 'jet-premium', ready: notReady === 0,
          starterNote: p.id === 'jet-premium' ? '' : p.name + ' comes with its target pack\'s starter: new ' + p.name + ' apps start with it, so it is not installed in the JET code.',
          previewNote: notReady ? 'This pack is a preview: it can be installed in a workspace once its foundation set passes every check (' + notReady + ' of ' + foundation.length + ' not yet).' : '',
          next: p.next ? { version: p.next.version, adds: p.next.adds.map((id) => { const x = all().find((y) => y.m.id === id); return x ? x.m.name : id; }).join(', '), notes: p.next.notes.join(' ') } : null,
          deps: (p.dependencies || []).map((d) => ({ name: d.name, version: d.version, licence: d.licence })),
          docsHref: 'api/component-packs/' + p.id + '/documentation.html'
        };
      });
      self.install = () => {
        const p = pack();
        api.post('workspaces/' + self.workspaceId() + '/modernization/packs/' + p.id + '/install', {}).then((run) => {
          toast.success((installedOf(p.id) ? 'Upgrade to ' : 'Install of ') + p.packageName + ' ' + p.version + ' opened as a change for review in ' + self.workspaceName() + '.');
          return loadPackStates(self.workspaceId());
        }).catch((e) => toast.error(ui.errorText(e)));
      };
      self.checkCompat = () => {
        api.get('workspaces/' + self.workspaceId() + '/modernization/packs/' + pack().id + '/compatibility').then((lines) => self.compat(lines.map((l) => ({
          text: l.text, mark: l.state === 'ok' ? '✓' : l.state === 'warn' ? '!' : 'i', css: 'factory-cf-compat is-' + l.state })))).catch((e) => toast.error(ui.errorText(e)));
      };

      // Saving the style ---------------------------------------------------------------------------------------------
      const comparable = (s) => JSON.stringify({ defaults: s.defaults, components: s.components || {} });
      self.dirty = ko.pureComputed(() => !!self.saved() && !!self.draft() && comparable(self.draft()) !== comparable(self.saved().style));
      self.ownCount = ko.pureComputed(() => Object.keys((self.draft() && self.draft().components) || {}).length);
      self.styleText = ko.pureComputed(() => {
        const s = self.saved();
        if (!s) { return ''; }
        if (self.dirty()) { return 'Unsaved style changes · ' + self.ownCount() + (self.ownCount() === 1 ? ' component' : ' components') + ' customised'; }
        return s.savedAt ? 'Style saved · ' + ui.when(s.savedAt) + (s.savedBy ? ' by ' + s.savedBy : '') : 'Default style · not saved yet';
      });
      self.styleCss = ko.pureComputed(() => pill(self.styleText(), self.dirty() ? 'amber' : self.saved() && self.saved().savedAt ? 'green' : 'grey').css);
      self.discard = () => { if (self.saved()) { self.draft(clone(self.saved().style)); } };
      self.save = () => {
        const id = self.workspaceId();
        if (!id) { return; }
        if (!self.dirty()) { toast.info('Nothing to save: the style is as saved.'); return; }
        api.put('workspaces/' + id + '/component-style', self.draft()).then((s) => {
          self.saved(s);
          self.draft(clone(s.style));
          toast.success('Component style saved for ' + self.workspaceName() + '. New code and pack upgrades use it; existing screens change only through a reviewed change.');
        }).catch((e) => toast.error(ui.errorText(e)));
      };

      // The workspace defaults, in their own panel (kept from the first version of the page)
      self.defaultsOpen = ko.observable(false);
      const def = { look: ko.observable('elevated'), hover: ko.observable('lift'), click: ko.observable('press'), scroll: ko.observable('fadeup'), mode: ko.observable('light'), brand: ko.observable('workspace') };
      self.def = def;
      const opts = (list) => list.map((x) => ({ value: x[0], label: x[1] }));
      self.allLooks = opts(LOOKS); self.allHover = opts(HOVER); self.allClick = opts(CLICK); self.allScroll = opts(SCROLL); self.allModes = opts(MODES); self.allBrands = opts(BRANDS);
      const defaults = ko.pureComputed(() => (self.draft() ? self.draft().defaults : { look: 'elevated', motion: { hover: 'lift', click: 'press', scroll: 'fadeup' }, mode: 'light', brand: 'workspace' }));
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

      // Loading ------------------------------------------------------------------------------------------------------
      const loadStyle = (id) => {
        if (!id) { self.saved(null); self.draft(null); return Promise.resolve(); }
        return api.get('workspaces/' + id + '/component-style').then((s) => {
          s.style.components = s.style.components || {};
          s.style.copies = s.style.copies || [];
          self.saved(s);
          self.draft(clone(s.style));
        });
      };
      const loadCatalogue = (id) => api.get(id ? 'workspaces/' + id + '/component-packs' : 'component-packs').then((c) => self.catalogue(c));
      const loadPackStates = (id) => (id ? api.get('workspaces/' + id + '/modernization/packs').then((s) => self.packStates(s)).catch(() => self.packStates([])) : Promise.resolve());
      const loadUsed = (id) => (id ? api.get('workspaces/' + id + '/modernization/components').then((v) => self.used(v.counted ? new Set(v.rows.map((r) => r.element)) : null))
        .catch(() => self.used(null)) : Promise.resolve(self.used(null)));
      const loadAll = (id) => Promise.all([loadCatalogue(id), loadStyle(id), loadPackStates(id), loadUsed(id)]);
      self.workspaceId.subscribe((id) => { loadAll(id).catch((e) => self.error(ui.errorText(e))); });

      self.connected = () => {
        accUtils.announce('Component factory page loaded.', 'assertive');
        document.title = 'Component factory';
        self.loading(true);
        jetPack.load().catch(() => null);
        loadAll(self.workspaceId()).then(() => self.error(null)).catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
      // The live previews' sample values
      self.pv = { text: ko.observable('A. Sharma'), amount: ko.observable(1250), choice: ko.observable('S'), checks: ko.observable(['E']), day: ko.observable('2026-11-12'), tab: ko.observable('c'),
        options: [{ value: 'S', label: 'Savings •••• 4521' }, { value: 'C', label: 'Current •••• 0187' }], checkOptions: [{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }],
        tabs: [{ id: 'c', label: 'Current' }, { id: 's', label: 'Savings' }, { id: 'd', label: 'Deposits' }],
        rows: [{ id: 1, date: '12 Nov', text: 'Electricity bill', amount: '-1,240.00' }, { id: 2, date: '11 Nov', text: 'Salary', amount: '85,000.00' }],
        columns: [{ headerText: 'Date', field: 'date' }, { headerText: 'Description', field: 'text' }, { headerText: 'Amount', field: 'amount', style: 'text-align:right' }],
        messages: [{ severity: 'confirmation', summary: 'Beneficiary added', autoTimeout: -1 }],
        press: () => { toast.info('Pressed: on a screen this runs the action.'); } };
    }

    return ComponentsViewModel;
  }
);
