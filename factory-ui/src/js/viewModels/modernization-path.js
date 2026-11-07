/*
 * Choose a path (step 1 of both paths): the UI path (premium components in the JET code) or the migration path (another
 * technology module by module), its scope, how it runs and whether to analyze again first. Save as draft keeps the
 * choice; Continue saves it as started and opens the next step: the Component inventory or the Technology catalogue.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    const PATHS = [
      { id: 'ui', glyph: '◈', title: 'Modernize the OBDX UI', text: 'Keep Oracle JET and swap the standard components for the factory’s premium ones.',
        tags: [['Lower effort', 'is-success'], ['Faster delivery', 'is-primary'], ['Look and feel', 'is-primary']],
        points: ['Keeps Oracle JET and today’s architecture', 'Premium, accessible components in place of JET ones', 'Same bindings, business logic and OBDX services', 'Screen by screen, each as a reviewed change'],
        benefits: [['Value sooner', 'New look with little disruption'], ['Lower risk', 'OBDX architecture and services stay'], ['One consistent look', 'A premium design system, themed for the bank']] },
      { id: 'migration', glyph: '</>', title: 'Migrate to a modern technology', text: 'Move chosen modules to React, React Native or Angular while keeping the OBDX services.',
        tags: [['Strategic', 'is-primary'], ['Bigger change', 'is-warning'], ['Future ready', 'is-primary']],
        points: ['Rebuild the UI in a technology from the approved list', 'Move modules one at a time', 'OBDX services and integrations unchanged', 'Old and new screens run side by side meanwhile'],
        benefits: [['Modern stack', 'Easier hiring and faster UI work'], ['Safe step by step', 'One module at a time, old and new side by side'], ['Web and mobile', 'React for web, React Native for apps']] }
    ];

    function PathViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.overview = ko.observable(null);
      self.path = ko.observable('ui');
      self.scope = ko.observable('all');
      self.modules = ko.observable([]);
      self.mode = ko.observable('agent');
      self.analysis = ko.observable('latest');
      self.saved = ko.observable(null);
      self.saveError = ko.observable('');
      self.runOpen = ko.observable(false);
      self.job = mz.analysis;
      self.running = mz.analysisRunning;
      self.workspaceOptions = workspaceSelection.options;
      self.pickWorkspace = (event) => { const id = event.detail.value; if (id && id !== self.workspaceId()) { self.workspaceId(id); } };
      // The code the path works from: the workspace's imported branch at its latest revision (another one is imported in Workspaces)
      self.branchOptions = ko.pureComputed(() => {
        const o = self.overview();
        const url = o && o.info && o.info.svnUrl ? o.info.svnUrl : '';
        const tail = url.replace(/^.*?\/((trunk|branches\/[^/]+|tags\/[^/]+).*)$/, '$1') || url || 'trunk';
        return [{ value: 'current', label: tail }];
      });
      self.revisionOptions = ko.pureComputed(() => {
        const a = self.overview() ? self.overview().analysis : null;
        return [{ value: 'latest', label: a && a.codeRevision ? 'r' + a.codeRevision + ' (latest)' : 'Not imported' }];
      });
      self.branch = ko.observable('current');
      self.revision = ko.observable('latest');
      self.analysisState = ko.pureComputed(() => {
        const a = self.overview() ? self.overview().analysis : null;
        if (self.running()) { return ui.pill('Running', 'blue'); }
        if (!a || !a.done) { return ui.pill('Not analysed', 'amber'); }
        return ui.pill('Finished · ' + (a.upToDate ? 'Up to date' : 'Older than the code'), a.upToDate ? 'green' : 'amber');
      });
      self.needsAnalysis = ko.pureComputed(() => !!self.overview() && !self.overview().analysis.done && !self.running());
      self.runSteps = ko.pureComputed(() => (self.job() ? self.job().steps : []).map((st) => ({ t: st.name, mark: st.state })));
      self.runBar = ko.pureComputed(() => ({ width: (self.job() ? self.job().percent : 0) + '%' }));
      self.runTitle = ko.pureComputed(() => (!self.job() ? 'Analysing the code' : self.job().state === 'running' ? 'Analysing the code' : self.job().state === 'done' ? 'Analysis finished' : self.job().state === 'stopped' ? 'Analysis stopped' : 'Analysis failed'));
      self.runMessage = ko.pureComputed(() => (self.job() ? self.job().message : ''));
      self.runDone = ko.pureComputed(() => !!self.job() && self.job().state === 'done');
      self.continueLabel = ko.pureComputed(() => (self.path() === 'ui' ? 'Continue to the component inventory' : 'Continue to choose a technology'));
      self.runCancelLabel = ko.pureComputed(() => (self.running() ? 'Stop' : 'Stay here'));

      self.steps = ko.pureComputed(() => mz.steps(self.path(), 1));
      self.pathName = ko.pureComputed(() => mz.pathName(self.path()));

      const directShare = ko.pureComputed(() => {
        const k = (self.overview() ? self.overview().kpis : []).find((x) => x.id === 'direct');
        return k && k.percent !== null && k.percent !== undefined ? k.percent : null;
      });
      self.cards = ko.pureComputed(() => PATHS.map((p) => {
        const on = self.path() === p.id;
        const recommended = p.id === 'ui' && directShare() !== null && directShare() >= 50;
        const tags = (recommended ? [['Recommended', 'is-solid']] : []).concat(p.tags).map((t) => ({ text: t[0], css: 'factory-mb-tagpill ' + t[1] }));
        let note = null;
        if (p.id === 'ui') {
          note = directShare() === null ? { title: 'Analyze first.', text: 'The analysis says how much of this code the premium pack covers.', tone: 'info', icon: 'ⓘ' }
            : recommended ? { title: 'Recommended by the analysis.', text: directShare() + '% of this code’s components have a direct premium replacement, so this gives value soonest with little risk.', tone: 'success', icon: '✓' }
              : { title: 'Look at the mapping first.', text: 'Only ' + directShare() + '% of the components have a direct premium replacement.', tone: 'warning', icon: '!' };
        } else {
          note = { title: 'When to choose it.', text: 'The bank wants a new technology for its channel. A bigger change, done module by module; the component upgrade can come first.', tone: 'info', icon: 'ⓘ' };
        }
        return {
          id: p.id, title: p.title, text: p.text, glyph: p.glyph, tags: tags, points: p.points, note: note,
          noteCss: 'factory-mb-choose-note is-' + note.tone,
          checked: on ? 'true' : 'false', tab: on ? '0' : '-1',
          css: 'factory-mb-choose-card' + (on ? ' is-on' : ''),
          pick: () => self.path(p.id)
        };
      }));
      // Arrow keys move between the two path cards (a radio group)
      self.cardKey = (event) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.key) < 0) { return; }
        event.preventDefault();
        self.path(self.path() === 'ui' ? 'migration' : 'ui');
        const b = document.getElementById('mpCard-' + self.path());
        if (b) { b.focus(); }
      };
      self.benefits = ko.pureComputed(() => PATHS.find((p) => p.id === self.path()).benefits.map((b) => ({ title: b[0], text: b[1] })));

      const opt = (value, label) => ({ value: value, label: label });
      self.scopeOptions = [opt('all', 'Whole channel'), opt('some', 'Chosen modules')];
      self.modeOptions = [opt('agent', 'Factory does it end to end'), opt('plan', 'Plan only, no code')];
      self.analysisOptions = ko.pureComputed(() => {
        const a = self.overview() && self.overview().analysis;
        return [opt('latest', 'Use the latest analysis' + (a && a.done ? (a.upToDate ? ' (up to date)' : ' (older than the code)') : ' (none yet)')), opt('new', 'Analyze again first')];
      });
      // The three choices as the board draws them: a bordered option per value, the chosen one filled
      const choice = (id, label, value, opts) => ({ id: id, label: label, opts: opts.map((o) => ({ name: o.label, tag: o.tag || null,
        checked: value() === o.value ? 'true' : 'false', css: 'factory-mb-option' + (value() === o.value ? ' is-on' : ''), pick: () => value(o.value) })) });
      self.choices = ko.pureComputed(() => {
        const a = self.overview() && self.overview().analysis;
        return [
          choice('scope', 'Scope', self.scope, self.scopeOptions),
          choice('mode', 'How it runs', self.mode, self.modeOptions),
          choice('analysis', 'Analysis', self.analysis, [{ value: 'latest', label: 'Use the latest analysis', tag: a && a.done ? (a.upToDate ? 'Up to date' : null) : null },
            { value: 'new', label: 'Analyze again first' }])
        ];
      });
      self.moduleOptions = ko.pureComputed(() => (self.overview() ? self.overview().moduleList : []).map((m) => ({ value: m.name, label: m.name + ' (' + m.screens + ' screens)' })));
      self.modulesError = ko.pureComputed(() => (self.scope() === 'some' && self.modules().length === 0 ? 'Choose at least one module.' : ''));

      self.facts = ko.pureComputed(() => {
        const o = self.overview();
        if (!o) { return []; }
        const a = o.analysis;
        const kpi = (id) => { const k = o.kpis.find((x) => x.id === id); return k ? mz.num(k.value) : '–'; };
        // The analysis facts row of the board
        return [
          { k: 'Analysis', v: a.done ? (a.upToDate ? 'Finished' : 'Finished, older than the code') : 'Not analysed', mono: false },
          { k: 'Last analysis', v: a.done ? ui.when(a.at) : '–', mono: false },
          { k: 'Analysed revision', v: a.revision ? 'r' + a.revision : '–', mono: true },
          { k: 'Components found', v: kpi('components'), mono: false },
          { k: 'Screens analysed', v: kpi('screens'), mono: false }
        ].map((f) => Object.assign(f, { css: f.mono ? 'factory-mb-mono' : '' }));
      });
      self.savedText = ko.pureComputed(() => {
        const s = self.saved();
        return s ? (s.state === 'started' ? 'Started' : 'Draft saved') + ' · ' + ui.when(s.savedAt) + (s.savedBy ? ' by ' + s.savedBy : '') : '';
      });
      self.nextLabel = ko.pureComputed(() => (self.analysis() === 'new' ? 'Analyze and continue' : self.path() === 'ui' ? 'Continue to the component inventory' : 'Continue to choose a technology'));
      self.blocked = ko.pureComputed(() => !self.canManage() || !!self.modulesError() || self.running() || !self.overview());
      self.blockedTitle = ko.pureComputed(() => (!self.canManage() ? 'Choosing a path needs the Manage code permission' : self.modulesError() ? self.modulesError()
        : self.running() ? 'The analysis is running' : null));

      const body = (state) => ({ path: self.path(), scope: self.scope(), modules: self.scope() === 'some' ? self.modules() : [], mode: self.mode(),
        analysis: self.analysis(), technology: self.saved() && self.saved().path === self.path() ? self.saved().technology : null, state: state });
      const save = (state) => api.put('workspaces/' + self.workspaceId() + '/modernization/path', body(state)).then((c) => { self.saved(c); return c; });

      self.saveDraft = () => {
        if (self.blocked()) { return; }
        self.saveError('');
        save('draft').then(() => toast.success('Draft saved. Overview shows it with a Continue link.')).catch((e) => self.saveError(ui.errorText(e)));
      };
      self.retrySave = () => { self.saveError(''); self.proceed(); };
      self.cancel = () => mz.open('modernization');
      self.moreItems = ko.pureComputed(() => [{ value: 'draft', label: 'Save as draft', disabled: !!self.blocked() }]);
      self.more = (event) => { const v = event.detail && event.detail.value; if (v === 'draft') { self.saveDraft(); } else if (v === 'overview') { self.cancel(); } };

      const next = () => mz.open(self.path() === 'ui' ? 'modernization-components' : 'modernization-catalogue');
      self.proceed = () => {
        if (self.blocked()) { return; }
        self.saveError('');
        if (self.analysis() !== 'new') {
          save('started').then(next).catch((e) => self.saveError(ui.errorText(e)));
          return;
        }
        // Analyze again first: the analysis runs in the background with its steps in a dialog; Continue opens the next step
        self.runOpen(true);
        mz.startAnalysis().catch(() => self.runOpen(false));
      };
      self.runAnalysis = () => { self.analysis('new'); self.proceed(); };
      self.runCancel = () => { if (self.running()) { mz.stopAnalysis(); } else { self.runOpen(false); } };
      self.runContinue = () => { self.analysis('latest'); save('started').then(() => { self.runOpen(false); next(); }).catch((e) => { self.runOpen(false); self.saveError(ui.errorText(e)); }); };
      const done = mz.analysisDone.subscribe(() => load(self.workspaceId(), true));

      const load = (id, again) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        const asked = again ? {} : mz.take();
        Promise.all([api.get('workspaces/' + id + '/modernization/overview'), api.get('workspaces/' + id + '/modernization/path')]).then((r) => {
          self.overview(r[0]);
          const c = r[1] || null;
          self.saved(c);
          if (c && !again) { self.path(c.path); self.scope(c.scope); self.modules(c.modules || []); self.mode(c.mode); self.analysis(c.analysis); }
          if (asked.path) { self.path(asked.path); }
          if (!r[0].analysis.done) { self.analysis('new'); }
          self.error(null);
        }).catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe((id) => load(id));
      self.connected = () => {
        accUtils.announce('Choose a path loaded.', 'assertive');
        document.title = 'Choose a path';
        load(self.workspaceId());
      };
      self.disconnected = () => { sub.dispose(); done.dispose(); };
    }

    return PathViewModel;
  }
);
