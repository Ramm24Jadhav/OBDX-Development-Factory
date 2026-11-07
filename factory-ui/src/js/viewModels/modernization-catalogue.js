/*
 * Technology catalogue (migration path, step 2): technologies that keep OBDX as it is, in four tabs. Technologies:
 * cards filtered by platform and pack readiness, and the chosen one's fit, target pack (version, libraries, build),
 * how many of the 8 OBDX rules it covers, what its pack does, its components and limits. Comparison: the technologies
 * side by side with the chosen one highlighted. Target packs: each pack's version and last update. How it connects to
 * OBDX: what the new UI does and what stays on the OBDX side. Use sets the workspace's target app (technology and
 * folder), saves it with the path choice and opens the Migration planner; only a technology whose pack is ready.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    const READY = { ready: ['Pack ready', 'green', 'var(--fx-success)'], 'in-progress': ['Pack in progress', 'amber', 'var(--fx-warning)'], planned: ['Planned', 'blue', 'var(--fx-info)'] };
    const readyOf = (t) => READY[t.readiness] || [t.readiness, 'grey', 'var(--fx-border-strong)'];

    function CatalogueViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.data = ko.observable(null);
      self.current = ko.observable(null);
      self.choice = ko.observable(null);
      self.platform = ko.observable('all');
      self.readiness = ko.observable('all');
      self.query = ko.observable('');
      self.picked = ko.observable('react');
      self.tab = ko.observable('technologies');
      self.detailTab = ko.observable('overview');
      self.panelOpen = ko.observable(false);
      self.appFolder = ko.observable('');
      self.steps = mz.steps('migration', 2);
      self.pathName = mz.pathName('migration');
      self.platformOptions = [{ value: 'all', label: 'All' }, { value: 'web', label: 'Web' }, { value: 'mobile', label: 'Mobile' }];

      const all = ko.pureComputed(() => (self.data() ? self.data().technologies : []));
      // Readiness chips, with the colour dot each card's state uses
      self.readinessChips = ko.pureComputed(() => [['all', 'All', null], ['ready', 'Pack ready'], ['in-progress', 'Pack in progress'], ['planned', 'Planned']].map((c) => {
        const on = self.readiness() === c[0];
        const n = c[0] === 'all' ? all().length : all().filter((t) => t.readiness === c[0]).length;
        return { label: c[1] + ' (' + n + ')', dot: c[0] === 'all' ? null : { background: READY[c[0]][2] }, pressed: on ? 'true' : 'false', css: 'fx-chip' + (on ? ' is-on' : ''), pick: () => self.readiness(c[0]) };
      }));
      const shown = ko.pureComputed(() => {
        const q = self.query().trim().toLowerCase();
        return all().filter((t) => (self.platform() === 'all' || t.platform === self.platform()) && (self.readiness() === 'all' || t.readiness === self.readiness())
          && (!q || (t.name + ' ' + t.text + ' ' + t.language).toLowerCase().indexOf(q) >= 0));
      });
      const card = (t) => {
        const r = readyOf(t);
        const on = self.picked() === t.id;
        const inUse = self.current() && self.current().target === t.pack;
        return { id: t.id, name: t.name, logo: t.logo, text: t.text, meta: t.meta, ready: r[0], readyCss: ui.pill(r[0], r[1]).css, inUse: inUse,
          checked: on ? 'true' : 'false', css: 'fx-card factory-mt-card' + (on ? ' is-on' : ''), pick: () => { self.picked(t.id); self.detailTab('overview'); } };
      };
      self.web = ko.pureComputed(() => shown().filter((t) => t.platform === 'web').map(card));
      self.mobile = ko.pureComputed(() => shown().filter((t) => t.platform === 'mobile').map(card));
      self.notOffered = ko.pureComputed(() => (self.data() ? self.data().notOffered : []).map((n) => ({ name: n[0], why: n[1] })));
      self.rules = ko.pureComputed(() => (self.data() ? self.data().obdxRules : []).map((r) => ({ id: r[0], text: r[1] })));
      self.connects = ko.pureComputed(() => (self.data() ? self.data().connects || [] : []).map((c) => ({ concern: c[0], ui: c[1], obdx: c[2] })));

      const pickedTech = ko.pureComputed(() => all().find((t) => t.id === self.picked()) || all()[0] || null);
      self.detail = ko.pureComputed(() => {
        const t = pickedTech();
        if (!t) { return null; }
        const r = readyOf(t);
        const f = t.facts;
        const ready = t.readiness === 'ready';
        const covered = ready ? 8 : 0;
        const caps = self.data() ? self.data().capabilities || [] : [];
        const version = f && f.versions && f.versions.length ? f.versions[0] : null;
        return {
          id: t.id, name: t.name, logo: t.logo, text: t.text, ready: r[0], readyCss: ui.pill(r[0], r[1]).css, points: t.points, isReady: ready,
          packBox: [['Target pack', version ? version[0] : t.readiness === 'in-progress' ? 'in progress' : 'planned']]
            .concat(f ? f.stack.map((s) => [s[0], s[1]]) : []).concat([['Components', f ? f.components + ' mapped' : '—'], ['Build', f ? f.build : '—']]).map((x) => ({ k: x[0], v: x[1] })),
          rulesN: covered, meter: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ css: 'factory-mt-meter-seg' + (i < covered ? ' is-on' : '') })),
          rulesText: ready ? 'Every converted module is checked against all 8 rules.' : 'Checks come with the target pack.',
          caps: caps.map((c) => ({ text: c, css: 'factory-mt-cap' + (ready ? ' is-on' : '') })),
          packFacts: f ? [['Conversion rules', f.rules], ['Code templates', f.templates + (f.templateKinds.length ? ' (' + f.templateKinds.map((k) => k.replace(/\.[a-z.]+$/, '')).join(', ') + ')' : '')],
            ['Starter project', f.starterFiles + ' files: ' + f.description], ['Components', f.components], ['Where it lives', 'target-packs/' + f.id]].map((x) => ({ k: x[0], v: String(x[1]) })) : [],
          packNote: f ? f.description : t.readiness === 'in-progress' ? 'The component pack exists; the target pack that writes whole screens is being built.' : 'Not in the factory yet.',
          versions: f ? f.versions.map((v, i) => ({ version: v[0] + ' · ' + v[1], note: v[2], inUse: i === 0 })) : [],
          ruleTitles: f ? f.ruleTitles : [],
          replaces: (t.replaces || []).map((x) => ({ component: x[0], jet: x[1] })),
          limits: (t.limits || []).map((x) => ({ limit: x[0], workaround: x[1] })),
          language: t.language, besideJet: t.besideJet ? 'Runs beside the JET screens' : 'A separate app',
          defaultFolder: f ? f.defaultAppFolder : '',
          starterHref: f ? (self.workspaceId() ? 'api/workspaces/' + encodeURIComponent(self.workspaceId()) + '/targets/' : 'api/targets/') + encodeURIComponent(f.id) + '/starter.zip' : null
        };
      });
      self.picked.subscribe(() => { const d = self.detail(); if (d && !(self.current() && self.current().target === pickedTech().pack)) { self.appFolder(d.defaultFolder || ''); } });

      self.tabs = ko.pureComputed(() => ui.tabs(self.tab, [{ value: 'technologies', label: 'Technologies' }, { value: 'comparison', label: 'Comparison' },
        { value: 'packs', label: 'Target packs' }, { value: 'obdx', label: 'How it connects to OBDX' }]));
      self.detailTabs = ko.pureComputed(() => ui.tabs(self.detailTab, [{ value: 'overview', label: 'Overview' }, { value: 'pack', label: 'Target pack' }, { value: 'components', label: 'Components' }, { value: 'limits', label: 'Limits' }]));
      const keyed = (obs, keys, prefix) => (vm, event) => {
        const at = keys.indexOf(obs());
        const n = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (n < 0) { return true; }
        event.preventDefault();
        obs(keys[n]);
        const b = document.getElementById(prefix + keys[n]);
        if (b) { b.focus(); }
        return false;
      };
      self.tabKey = keyed(self.tab, ['technologies', 'comparison', 'packs', 'obdx'], 'mtTab-');
      self.detailKey = keyed(self.detailTab, ['overview', 'pack', 'components', 'limits'], 'mtDTab-');

      // Comparison: one column per technology, the chosen one highlighted
      self.compareHead = ko.pureComputed(() => all().map((t) => ({ name: t.name, css: self.picked() === t.id ? 'is-picked' : '', pick: () => self.picked(t.id) })));
      self.compareRows = ko.pureComputed(() => {
        const row = (k, f) => ({ k: k, cells: all().map((t) => ({ text: f(t), css: self.picked() === t.id ? 'is-picked' : '' })) });
        return [row('Platform', (t) => (t.platform === 'web' ? 'Web' : 'Mobile')), row('Used by banks', (t) => t.usedByBanks), row('Language', (t) => t.language),
          row('Beside the JET screens', (t) => (t.besideJet ? 'Yes' : 'Separate app')), row('Keeps the 8 OBDX rules', (t) => (t.readiness === 'ready' ? '8 of 8' : 'When ready')),
          row('Target pack', (t) => readyOf(t)[0]), row('Version', (t) => (t.facts && t.facts.versions.length ? t.facts.versions[0][0] : '—'))];
      });
      self.packRows = ko.pureComputed(() => all().map((t) => {
        const r = readyOf(t);
        const v = t.facts && t.facts.versions.length ? t.facts.versions[0] : null;
        return { name: t.name, ready: r[0], readyCss: ui.pill(r[0], r[1]).css, version: v ? v[0] : '—', updated: v ? ui.when(v[1]).replace(/,.*$/, '') : '—',
          rules: t.facts ? t.facts.rules : '—', templates: t.facts ? t.facts.templates : '—', starter: t.facts ? t.facts.starterFiles + ' files' : '—' };
      }));
      self.inUseText = ko.pureComputed(() => {
        const c = self.current();
        return c && c.target && c.target !== 'jet' ? 'In use for this workspace: ' + c.title + ' in ' + c.appFolder + '/' : 'No technology chosen for this workspace yet.';
      });
      self.folderError = ko.pureComputed(() => (/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(self.appFolder().trim()) ? '' : 'Enter the app folder in the repository, for example web.'));
      self.canUse = ko.pureComputed(() => !!self.detail() && self.detail().isReady && self.canManage() && !self.folderError());
      self.useLabel = ko.pureComputed(() => (self.detail() ? (self.detail().isReady ? 'Use ' + self.detail().name : 'Not ready to use yet') : 'Use'));
      self.useTitle = ko.pureComputed(() => (!self.detail() ? null : !self.detail().isReady ? 'Greyed out until the ' + self.detail().name + ' target pack is ready'
        : !self.canManage() ? 'Choosing the technology needs the Manage code permission' : self.folderError() || null));
      self.use = () => {
        if (!self.canUse()) { return; }
        const t = pickedTech();
        const id = self.workspaceId();
        api.put('workspaces/' + id + '/target', { target: t.pack, appFolder: self.appFolder().trim() }).then(() => {
          const c = self.choice() || {};
          return api.put('workspaces/' + id + '/modernization/path', { path: 'migration', scope: c.scope || 'all', modules: c.modules || [], mode: c.mode || 'agent',
            analysis: 'latest', technology: t.name, state: 'started' });
        }).then(() => {
          toast.success(t.name + ' is the technology for this workspace, in ' + self.appFolder().trim() + '/.');
          mz.open('modernization-planner');
        }).catch((e) => toast.error(ui.errorText(e)));
      };
      self.openPack = () => self.panelOpen(true);
      self.closePack = () => self.panelOpen(false);
      self.back = () => mz.open('modernization-path', { path: 'migration' });

      const load = (id) => {
        self.loading(true);
        Promise.all([api.get('modernization/catalogue'), id ? api.get('workspaces/' + id + '/target').catch(() => null) : null,
          id ? api.get('workspaces/' + id + '/modernization/path').catch(() => null) : null]).then((r) => {
          self.data(r[0]);
          self.current(r[1]);
          self.choice(r[2] || null);
          const inUse = r[1] && r[1].target && r[1].target !== 'jet' ? r[0].technologies.find((t) => t.pack === r[1].target) : null;
          self.picked(inUse ? inUse.id : 'react');
          self.appFolder(inUse ? r[1].appFolder : (self.detail() ? self.detail().defaultFolder : ''));
          self.error(null);
        }).catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
      self.tryAgain = () => load(self.workspaceId());
      const sub = self.workspaceId.subscribe((id) => load(id));
      self.connected = () => {
        accUtils.announce('Technology catalogue loaded.', 'assertive');
        document.title = 'Technology catalogue';
        mz.take();
        load(self.workspaceId());
      };
      self.disconnected = () => sub.dispose();
    }

    return CatalogueViewModel;
  }
);
