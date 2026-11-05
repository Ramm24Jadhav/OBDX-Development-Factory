/*
 * Technology catalogue (migration path, step 2): technologies that keep OBDX as it is, filtered by platform and pack
 * readiness, the chosen one's fit, target pack, components and limits, the comparison, the target packs and the 8 OBDX
 * rules. Use sets the workspace's target app (technology and folder), saves it with the path choice and opens the
 * Migration planner; only a technology whose target pack is ready can be used.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    const READY = { ready: ['Pack ready', 'green'], 'in-progress': ['Pack in progress', 'amber'], planned: ['Planned', 'blue'] };

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
      self.tab = ko.observable('comparison');
      self.detailTab = ko.observable('overview');
      self.panelOpen = ko.observable(false);
      self.appFolder = ko.observable('');
      self.steps = mz.steps('migration', 2);
      self.pathName = mz.pathName('migration');
      self.platformOptions = [{ value: 'all', label: 'All' }, { value: 'web', label: 'Web' }, { value: 'mobile', label: 'Mobile' }];
      self.readinessOptions = [{ value: 'all', label: 'All' }, { value: 'ready', label: 'Pack ready' }, { value: 'in-progress', label: 'In progress' }, { value: 'planned', label: 'Planned' }];

      const all = ko.pureComputed(() => (self.data() ? self.data().technologies : []));
      const shown = ko.pureComputed(() => {
        const q = self.query().trim().toLowerCase();
        return all().filter((t) => (self.platform() === 'all' || t.platform === self.platform()) && (self.readiness() === 'all' || t.readiness === self.readiness())
          && (!q || (t.name + ' ' + t.text + ' ' + t.language).toLowerCase().indexOf(q) >= 0));
      });
      const card = (t) => {
        const r = READY[t.readiness] || [t.readiness, 'grey'];
        const on = self.picked() === t.id;
        const inUse = self.current() && self.current().target === t.pack;
        return { id: t.id, name: t.name, logo: t.logo, text: t.text, meta: t.meta, ready: r[0], readyCss: ui.pill(r[0], r[1]).css, inUse: inUse,
          checked: on ? 'true' : 'false', css: 'fx-card factory-mt-card' + (on ? ' is-on' : ''), pick: () => { self.picked(t.id); self.detailTab('overview'); } };
      };
      self.web = ko.pureComputed(() => shown().filter((t) => t.platform === 'web').map(card));
      self.mobile = ko.pureComputed(() => shown().filter((t) => t.platform === 'mobile').map(card));
      self.notOffered = ko.pureComputed(() => (self.data() ? self.data().notOffered : []).map((n) => ({ name: n[0], why: n[1] })));
      self.rules = ko.pureComputed(() => (self.data() ? self.data().obdxRules : []).map((r) => ({ id: r[0], text: r[1] })));

      const pickedTech = ko.pureComputed(() => all().find((t) => t.id === self.picked()) || all()[0] || null);
      self.detail = ko.pureComputed(() => {
        const t = pickedTech();
        if (!t) { return null; }
        const r = READY[t.readiness] || [t.readiness, 'grey'];
        const f = t.facts;
        return {
          id: t.id, name: t.name, logo: t.logo, ready: r[0], readyCss: ui.pill(r[0], r[1]).css, points: t.points, isReady: t.readiness === 'ready',
          packFacts: f ? [['Conversion rules', f.rules], ['Code templates', f.templates], ['Starter project', f.starterFiles + ' files'], ['Components', f.components],
            ['Where it lives', 'target-packs/' + f.id]].map((x) => ({ k: x[0], v: String(x[1]) })) : [],
          packNote: f ? f.description : t.readiness === 'in-progress' ? 'The component pack exists; the target pack that writes whole screens is being built.' : 'Not in the factory yet.',
          ruleTitles: f ? f.ruleTitles : [],
          rulesText: t.readiness === 'ready' ? 'All 8 OBDX rules are part of every brief and checked in Validation.' : 'The 8 OBDX rules apply when the pack is ready.',
          replaces: (t.replaces || []).map((x) => ({ component: x[0], jet: x[1] })),
          limits: (t.limits || []).map((x) => ({ limit: x[0], workaround: x[1] })),
          language: t.language, besideJet: t.besideJet ? 'Runs beside the JET screens' : 'A separate app',
          defaultFolder: f ? f.defaultAppFolder : '',
          starterHref: f ? 'api/targets/' + f.id + '/starter.zip' : null
        };
      });
      self.picked.subscribe(() => { const d = self.detail(); if (d && !(self.current() && self.current().target === pickedTech().pack)) { self.appFolder(d.defaultFolder || ''); } });

      self.tabs = ko.pureComputed(() => ui.tabs(self.tab, [{ value: 'comparison', label: 'Comparison' }, { value: 'packs', label: 'Target packs' }, { value: 'obdx', label: 'How it connects to OBDX' }]));
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
      self.tabKey = keyed(self.tab, ['comparison', 'packs', 'obdx'], 'mtTab-');
      self.detailKey = keyed(self.detailTab, ['overview', 'pack', 'components', 'limits'], 'mtDTab-');
      self.comparison = ko.pureComputed(() => all().map((t) => {
        const r = READY[t.readiness] || [t.readiness, 'grey'];
        return { name: t.name, platform: t.platform === 'web' ? 'Web' : 'Mobile', used: t.usedByBanks, rules: t.readiness === 'ready' ? 'Yes' : 'When ready',
          beside: t.besideJet ? 'Yes' : 'Separate app', language: t.language, ready: r[0], readyCss: ui.pill(r[0], r[1]).css };
      }));
      self.packRows = ko.pureComputed(() => all().map((t) => {
        const r = READY[t.readiness] || [t.readiness, 'grey'];
        return { name: t.name, ready: r[0], readyCss: ui.pill(r[0], r[1]).css, rules: t.facts ? t.facts.rules : '—', templates: t.facts ? t.facts.templates : '—',
          starter: t.facts ? t.facts.starterFiles + ' files' : '—' };
      }));
      self.inUseText = ko.pureComputed(() => {
        const c = self.current();
        return c && c.target && c.target !== 'jet' ? 'In use for this workspace: ' + c.title + ' in ' + c.appFolder + '/' : 'No technology chosen for this workspace yet.';
      });
      self.folderError = ko.pureComputed(() => (/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(self.appFolder().trim()) ? '' : 'Enter the app folder in the repository, for example web.'));
      self.canUse = ko.pureComputed(() => !!self.detail() && self.detail().isReady && self.canManage() && !self.folderError());
      self.useLabel = ko.pureComputed(() => (self.detail() ? 'Use ' + self.detail().name : 'Use'));
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
