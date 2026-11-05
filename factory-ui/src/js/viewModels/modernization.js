/*
 * Modernization Overview (docs/MODERNIZATION.md): what the analysis of the code found, the two paths with how far each
 * is (screens or modules delivered to SVN), the findings that point to the next screen, the modules by state and the
 * recent activity. Every number comes from the stored analysis, the pack registry and the runs' changes. The analysis
 * runs in the background with its steps shown here (and Stop); the workspace can be changed from the analysis card.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    const PATHS = {
      ui: { icon: 'design', title: 'Modernize the OBDX UI', text: 'Keep Oracle JET and swap the standard components for the factory’s premium ones, screen by screen.',
        scope: 'All modules or chosen ones', ready: 'Premium Oracle JET pack' },
      migration: { icon: 'code', title: 'Migrate to a modern technology', text: 'Move chosen modules to React, React Native or Angular while keeping the OBDX services.',
        scope: 'Chosen modules or all', ready: 'React, React Native' }
    };
    const KPI_ICONS = { modules: 'folder', screens: 'doc', components: 'cube', direct: 'check', mapping: 'refresh', custom: 'alert' };
    const KPI_TONE = { direct: 'green', mapping: 'amber', custom: 'red' };

    function ModernizationViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.data = ko.observable(null);
      self.canManage = mz.canManage;
      self.workspaceOptions = workspaceSelection.options;
      self.pickWorkspace = (event) => { const id = event.detail.value; if (id && id !== self.workspaceId()) { self.workspaceId(id); } };
      self.job = mz.analysis;
      self.running = mz.analysisRunning;
      self.jobSteps = ko.pureComputed(() => (self.job() ? self.job().steps : []).map((st) => ({ name: st.name, css: 'factory-mo-jobstep is-' + st.state,
        mark: st.state === 'done' ? '✓' : st.state === 'running' ? '…' : st.state === 'failed' || st.state === 'stopped' ? '✕' : '' })));
      self.jobBar = ko.pureComputed(() => ({ width: (self.job() ? self.job().percent : 0) + '%' }));
      self.jobProblem = ko.pureComputed(() => (self.job() && (self.job().state === 'failed' || self.job().state === 'stopped') ? self.job() : null));
      self.stopAnalysis = () => mz.stopAnalysis();
      const done = mz.analysisDone.subscribe(() => load(self.workspaceId()));
      self.analysis = ko.pureComputed(() => (self.data() ? self.data().analysis : null));
      self.analysed = ko.pureComputed(() => !!self.analysis() && self.analysis().done);
      self.analysisText = ko.pureComputed(() => {
        const a = self.analysis();
        if (self.running()) { return 'Running'; }
        if (!a || !a.done) { return 'Not analysed yet'; }
        return a.upToDate ? 'Up to date' : 'Older than the code';
      });
      self.analysisWhen = ko.pureComputed(() => (self.analysis() && self.analysis().done ? ui.when(self.analysis().at) : ''));
      self.analysisCss = ko.pureComputed(() => ui.pill(self.analysisText(), self.running() ? 'blue' : self.analysis() && self.analysis().upToDate ? 'green' : 'amber').css);
      self.revisionText = ko.pureComputed(() => {
        const a = self.analysis();
        return a && a.codeRevision ? 'r' + a.codeRevision : 'Not imported';
      });

      self.kpis = ko.pureComputed(() => (self.data() ? self.data().kpis : []).map((k) => ({
        id: k.id, label: k.label, value: mz.num(k.value),
        iconClass: 'factory-nav-icon factory-ico-' + (KPI_ICONS[k.id] || 'cube'),
        hasPercent: k.percent !== null && k.percent !== undefined,
        percent: (k.percent || 0) + '%',
        percentCss: ui.pill('', KPI_TONE[k.id] || 'grey').css,
        css: 'fx-kpi factory-mo-kpi factory-mo-kpi-' + k.id
      })));

      // The direct share decides which path the analysis recommends
      const directShare = ko.pureComputed(() => {
        const k = (self.data() ? self.data().kpis : []).find((x) => x.id === 'direct');
        return k && k.percent !== null ? k.percent : null;
      });
      self.paths = ko.pureComputed(() => {
        const d = self.data();
        if (!d) { return []; }
        return d.paths.map((p) => {
          const meta = PATHS[p.id];
          const begun = p.state === 'started';
          const draft = p.state === 'draft';
          const recommended = p.id === 'ui' ? directShare() !== null && directShare() >= 50 : false;
          const target = begun ? (p.id === 'ui' ? 'modernization-components' : 'modernization-planner') : 'modernization-path';
          return {
            id: p.id, title: meta.title, text: meta.text, iconClass: 'factory-nav-icon factory-ico-' + meta.icon,
            recommended: recommended,
            tag: p.chosen ? (begun ? 'Started' : 'Draft saved') : recommended ? 'Recommended' : p.id === 'migration' ? 'Strategic' : '',
            tagCss: ui.pill('', p.chosen ? (begun ? 'blue' : 'amber') : recommended ? 'green' : 'violet').css,
            facts: [
              { k: 'Scope', v: p.chosen && d.choice && d.choice.scope === 'some' ? d.choice.modules.length + ' chosen modules' : meta.scope },
              p.id === 'ui' ? { k: 'Covered by the pack', v: directShare() === null ? 'Analyze to see' : directShare() + '% direct replacements' }
                : { k: 'Ready now', v: d.choice && d.choice.technology && p.chosen ? d.choice.technology : meta.ready },
              // The size of the work, as the analysis counted it (the factory gives no estimate of days)
              { k: 'Size of the work', v: p.of ? p.of + ' ' + p.unit : 'Analyze to see' }
            ],
            percent: p.percent + '%',
            barStyle: { width: p.percent + '%' },
            note: p.of ? p.note : 'Analyze the code to see the ' + p.unit + '.',
            button: begun ? 'Continue' : draft ? 'Continue the draft' : 'Start',
            css: 'fx-card factory-mo-path' + (p.chosen ? ' is-chosen' : '') + (recommended && !p.chosen ? ' is-recommended' : ''),
            buttonCss: p.id === 'ui' ? 'fx-btn fx-btn--primary' : 'fx-btn fx-btn--secondary',
            disabled: !begun && !self.canManage(),
            title: !begun && !self.canManage() ? 'Starting needs the Manage code permission' : null,
            go: () => mz.open(target, { path: p.id })
          };
        });
      });

      const TONE = { primary: 'is-primary', warning: 'is-warning', danger: 'is-danger', info: 'is-info' };
      self.insights = ko.pureComputed(() => (self.data() ? self.data().insights : []).map((i) => {
        const parts = (i.route || '').split('?');
        const query = {};
        (parts[1] || '').split('&').filter(Boolean).forEach((kv) => { const x = kv.split('='); query[x[0]] = decodeURIComponent(x[1] || ''); });
        return {
          text: i.text, css: 'factory-mo-insight ' + (TONE[i.tone] || ''), hasRoute: !!i.route,
          href: '?ojr=' + parts[0],
          go: (vm, event) => { if (event && (event.ctrlKey || event.metaKey)) { return true; } mz.open(parts[0], query); return false; }
        };
      }));

      self.states = ko.pureComputed(() => (self.data() ? self.data().modules : null));
      self.ring = ko.pureComputed(() => {
        const s = self.states();
        const p = s && s.total ? Math.round(100 * s.done / s.total) : 0;
        return { style: { '--p': p, '--c': 'var(--fx-primary)' }, label: s ? s.done + ' of ' + s.total : '–',
          text: s ? s.done + ' of ' + s.total + ' modules done, ' + s.inProgress + ' in progress, ' + s.planned + ' planned, ' + s.notStarted + ' not started' : '' };
      });
      self.legend = ko.pureComputed(() => {
        const s = self.states();
        if (!s) { return []; }
        return [['Done', s.done, 'var(--fx-primary)'], ['In progress', s.inProgress, 'var(--fx-info)'], ['Planned', s.planned, 'var(--fx-primary-border)'],
          ['Not started', s.notStarted, 'var(--fx-surface-3)']].map((x) => ({ label: x[0], value: x[1], style: { background: x[2] } }));
      });
      self.activity = ko.pureComputed(() => (self.data() ? self.data().activity : []).map((a) => ({ what: a.what, when: ui.when(a.at), by: a.by || '' })));

      self.start = () => mz.open('modernization-path');
      self.openAnalysis = () => mz.open('modernization-analysis');
      self.openHistory = () => mz.open('modernization-history');
      self.analyze = () => { if (self.workspaceId()) { mz.startAnalysis().catch(() => null); } };
      self.analyzeTitle = ko.pureComputed(() => (!self.canManage() ? 'You can view this workspace; ask for Manage code to analyze it.' : self.running() ? 'The analysis is running' : null));
      self.startTitle = ko.pureComputed(() => (!self.workspaceId() ? 'Choose a workspace first' : !self.canManage() ? 'Starting needs the Manage code permission' : null));
      self.tryAgain = () => load(self.workspaceId());

      const load = (id) => {
        if (!id) { self.data(null); self.loading(false); return Promise.resolve(); }
        self.loading(true);
        return api.get('workspaces/' + id + '/modernization/overview').then((d) => {
          if (id === self.workspaceId()) { self.data(d); self.error(null); }
        }).catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe((id) => load(id));

      self.connected = () => {
        accUtils.announce('Modernization overview loaded.', 'assertive');
        document.title = 'Modernization';
        load(self.workspaceId());
        mz.followAnalysis();
      };
      self.disconnected = () => { sub.dispose(); done.dispose(); };
    }

    return ModernizationViewModel;
  }
);
