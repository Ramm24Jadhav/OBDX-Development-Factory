/*
 * Modernization Overview (docs/MODERNIZATION.md): what the analysis of the code found, the two paths with how far each
 * is (screens or modules delivered to SVN), the findings that point to the next screen, the modules by state and the
 * recent activity. Every number comes from the stored analysis, the pack registry and the runs' changes. The analysis
 * runs in the background with its steps shown here (and Stop); the workspace can be changed from the analysis card.
 * The page is drawn as on the approved board (docs/design/boards/Landing-*.png), with the parts in app.css "Modernization boards".
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    const PATHS = {
      ui: { glyph: '◈', title: 'Modernize the OBDX UI', text: 'Keep Oracle JET and swap the standard components for the factory’s premium ones, screen by screen.',
        scope: 'All modules or chosen ones', ready: 'Premium Oracle JET pack' },
      migration: { glyph: '</>', title: 'Migrate to a modern technology', text: 'Move chosen modules to React, React Native or Angular while keeping the OBDX services.',
        scope: 'Chosen modules or all', ready: 'React, React Native' }
    };
    // The count chips colour the figure by what it means, as on the board
    const KPI_TONE = { direct: 'is-success', custom: 'is-danger' };
    // Estimated effort, worked out from the analysis (the rule shows on hover); no days are estimated
    const uiEffort = (direct) => (direct === null ? 'Analyze to see' : direct >= 75 ? 'Low' : direct >= 50 ? 'Low to medium' : direct >= 25 ? 'Medium' : 'Medium to high');
    const migrationEffort = (modules) => (!modules ? 'Analyze to see' : modules <= 3 ? 'Medium' : modules <= 9 ? 'Medium to high' : 'High');
    const UI_RULE = 'From the share of components with a direct premium replacement: 75% or more is low, 50 to 74% low to medium, 25 to 49% medium, less is medium to high.';
    const MIGRATION_RULE = 'From the number of modules to move: up to 3 is medium, 4 to 9 medium to high, 10 or more high.';

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
      self.analysisCss = ko.pureComputed(() => 'factory-mb-pill is-sm ' + (self.running() ? 'is-info' : self.analysis() && self.analysis().upToDate ? 'is-success' : 'is-warning'));
      self.revisionText = ko.pureComputed(() => {
        const a = self.analysis();
        return a && a.codeRevision ? 'r' + a.codeRevision : 'Not imported';
      });

      self.kpis = ko.pureComputed(() => (self.data() ? self.data().kpis : []).map((k) => ({
        id: k.id, label: k.label, value: mz.num(k.value), css: 'factory-mb-chip ' + (KPI_TONE[k.id] || '')
      })));
      const moduleCount = ko.pureComputed(() => { const k = (self.data() ? self.data().kpis : []).find((x) => x.id === 'modules'); return k ? k.value : 0; });

      // The direct share decides which path the analysis recommends
      const directShare = ko.pureComputed(() => {
        const k = (self.data() ? self.data().kpis : []).find((x) => x.id === 'direct');
        return k && k.percent !== null ? k.percent : null;
      });
      self.paths = ko.pureComputed(() => {
        const d = self.data();
        if (!d) { return []; }
        const anyChosen = d.paths.some((x) => x.chosen);
        return d.paths.map((p) => {
          const meta = PATHS[p.id];
          const begun = p.state === 'started';
          const draft = p.state === 'draft';
          const recommended = p.id === 'ui' ? directShare() !== null && directShare() >= 50 : false;
          const target = begun ? (p.id === 'ui' ? 'modernization-components' : 'modernization-planner') : 'modernization-path';
          // The board draws one card filled: the chosen path, else the one the analysis recommends (the UI path)
          const lead = anyChosen ? p.chosen : p.id === 'ui';
          const some = p.chosen && d.choice && d.choice.scope === 'some';
          return {
            id: p.id, title: meta.title, text: meta.text, glyph: meta.glyph,
            recommended: recommended,
            tag: p.chosen ? (begun ? 'Started' : 'Draft saved') : recommended ? 'Recommended' : p.id === 'migration' ? 'Strategic' : '',
            tagCss: 'factory-mb-pill ' + (p.chosen ? (begun ? 'is-info' : 'is-warning') : recommended ? 'is-success' : 'is-primary'),
            facts: [
              { k: 'Scope', v: some ? d.choice.modules.length + ' chosen modules' : meta.scope, why: null },
              p.id === 'ui' ? { k: 'Estimated effort', v: uiEffort(directShare()), why: UI_RULE }
                : { k: 'Estimated effort', v: migrationEffort(some ? d.choice.modules.length : moduleCount()), why: MIGRATION_RULE },
              p.id === 'ui' ? { k: 'Covered by the pack', v: directShare() === null ? 'Analyze to see' : directShare() + '% of components', why: null }
                : { k: 'Ready now', v: d.choice && d.choice.technology && p.chosen ? d.choice.technology : meta.ready, why: null }
            ],
            percent: p.percent + '%',
            percentNum: p.percent,
            barStyle: { width: p.percent + '%' },
            note: p.of ? p.note : 'Analyze the code to see the ' + p.unit + '.',
            button: begun ? 'Continue' : draft ? 'Continue the draft' : 'Start',
            css: 'factory-mb-path' + (lead ? ' is-lead' : ''),
            buttonCss: 'factory-mb-btn is-sm ' + (lead ? 'is-primary' : 'is-outline'),
            disabled: !begun && !self.canManage(),
            buttonTitle: !begun && !self.canManage() ? 'Starting needs the Manage code permission' : null,
            go: () => mz.open(target, { path: p.id })
          };
        });
      });

      const TONE = { primary: 'is-primary', warning: 'is-warning', danger: 'is-danger', info: 'is-info' };
      self.insights = ko.pureComputed(() => (self.data() ? self.data().insights : []).map((i, n) => {
        const parts = (i.route || '').split('?');
        const query = {};
        (parts[1] || '').split('&').filter(Boolean).forEach((kv) => { const x = kv.split('='); query[x[0]] = decodeURIComponent(x[1] || ''); });
        return {
          text: i.text, css: 'factory-mb-finding ' + (TONE[i.tone] || '') + (n === 0 ? ' is-first' : ''), hasRoute: !!i.route,
          href: '?ojr=' + parts[0],
          go: (event) => { if (event && (event.ctrlKey || event.metaKey)) { return; } if (event) { event.preventDefault(); } mz.open(parts[0], query); }
        };
      }));

      self.states = ko.pureComputed(() => (self.data() ? self.data().modules : null));
      // One ring, four segments in the order of the legend
      self.ring = ko.pureComputed(() => {
        const s = self.states();
        const share = (n) => (s && s.total ? 100 * n / s.total : 0);
        const a = share(s ? s.done : 0);
        const b = a + share(s ? s.inProgress : 0);
        const c = b + share(s ? s.planned : 0);
        const fill = s && s.total ? 'conic-gradient(var(--mb-ring-done) 0 ' + a + '%, var(--mb-ring-progress) ' + a + '% ' + b + '%, var(--mb-ring-planned) ' + b + '% ' + c + '%, var(--mb-ring-rest) ' + c + '% 100%)'
          : 'var(--mb-ring-rest)';
        return { style: { background: fill }, label: s ? s.done + ' of ' + s.total : '–',
          text: s ? s.done + ' of ' + s.total + ' modules done, ' + s.inProgress + ' in progress, ' + s.planned + ' planned, ' + s.notStarted + ' not started' : '' };
      });
      self.legend = ko.pureComputed(() => {
        const s = self.states();
        if (!s) { return []; }
        return [['Done', s.done, 'var(--fx-primary)'], ['In progress', s.inProgress, '#818cf8'], ['Planned', s.planned, 'var(--fx-primary-border)'],
          ['Not started', s.notStarted, 'var(--fx-surface-3)']].map((x) => ({ label: x[0], value: x[1], style: { background: x[2] } }));
      });
      // The board lists the four latest; View all opens History
      self.activity = ko.pureComputed(() => (self.data() ? self.data().activity : []).slice(0, 4).map((a) => ({ what: a.what, when: ui.when(a.at), by: a.by ? 'By ' + a.by : null })));

      self.start = () => mz.open('modernization-path');
      // The board has no button for the code analysis; the Last analysis date opens it
      self.openAnalysis = (event) => { if (event && (event.ctrlKey || event.metaKey)) { return; } if (event) { event.preventDefault(); } mz.open('modernization-analysis'); };
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
