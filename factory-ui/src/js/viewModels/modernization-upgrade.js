/*
 * Upgrade plan (UI path, step 3): which screens get which premium components, one change per wave. Components come from
 * the inventory (Add); unticking one leaves it out of every wave. Waves are grouped by module (small modules first) or by
 * component; a wave starts once the one before it is delivered, and its run opens in the workspace.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    const STATE = { planned: ['Planned', 'blue'], starting: ['Starting', 'grey'], building: ['Building', 'blue'], validating: ['Validating', 'amber'],
      delivered: ['Delivered', 'green'], rejected: ['Rejected', 'red'], failed: ['Failed', 'red'] };

    function UpgradePlanViewModel() {
      const self = this;
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.plan = ko.observable(null);
      self.grouping = ko.observable('module');
      self.components = ko.observable([]);
      self.off = ko.observable([]);
      self.order = ko.observable([]);
      self.split = ko.observable([]);
      self.dirty = ko.observable(false);
      self.selectedWave = ko.observable(0);
      self.steps = mz.steps('ui', 3);
      self.pathName = mz.pathName('ui');
      self.groupOptions = [{ value: 'module', label: 'By module' }, { value: 'component', label: 'By component' }];

      self.tiles = ko.pureComputed(() => {
        const p = self.plan();
        if (!p) { return []; }
        const included = p.components.filter((c) => c.included).length;
        return [['Components in the plan', included + ' of ' + p.components.length], ['Screens they touch', mz.num(p.screens)], ['Waves (one change each)', String(p.waves.length)],
          ['Waves delivered', p.delivered + ' of ' + p.waves.length], ['Premium JET pack', p.packVersion]].map((t) => ({ k: t[0], v: t[1] }));
      });
      self.componentRows = ko.pureComputed(() => (self.plan() ? self.plan().components : []).map((c) => {
        const pill = mz.compatPill(c.compatibility);
        return { element: c.element, premium: c.premium, screens: c.screens + (c.screens === 1 ? ' screen' : ' screens'), compat: pill.text, compatCss: pill.css,
          checked: c.included, css: 'factory-mu-comp' + (c.included ? '' : ' is-off'),
          toggle: () => {
            const off = self.off().slice();
            const i = off.indexOf(c.element);
            if (i >= 0) { off.splice(i, 1); } else { off.push(c.element); }
            self.off(off);
            self.dirty(true);
            preview();
            return true;
          } };
      }));
      // Move a wave earlier or later, or cut it in two by its screens; the waves show as they would be, then Save keeps it
      const moveWave = (i, step) => {
        const keys = self.plan().waves.map((w) => w.key);
        const j = i + step;
        if (j < 0 || j >= keys.length) { return; }
        const t = keys[i]; keys[i] = keys[j]; keys[j] = t;
        self.order(keys);
        self.selectedWave(j);
        self.dirty(true);
        preview();
      };
      const splitWave = (w) => {
        self.split(self.split().concat([w.key]));
        const keys = [];
        self.plan().waves.forEach((x) => { if (x.key === w.key) { keys.push(w.key + '#1', w.key + '#2'); } else { keys.push(x.key); } });
        self.order(keys);
        self.dirty(true);
        preview();
      };
      self.waves = ko.pureComputed(() => (self.plan() ? self.plan().waves : []).map((w, i, all) => {
        const s = STATE[w.state] || [w.state, 'grey'];
        const on = i === self.selectedWave();
        return { n: w.n, name: w.name, screens: w.screens.length, comps: w.components.slice(0, 3).join(', ') + (w.components.length > 3 ? ' +' + (w.components.length - 3) : ''),
          change: w.changeTitle || '—', state: s[0], stateCss: ui.pill(s[0], s[1]).css, selected: on ? 'true' : 'false', css: 'factory-mu-wave' + (on ? ' is-on' : ''),
          pick: () => self.selectedWave(i), key: (vm, event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); self.selectedWave(i); return false; } return true; },
          menu: [{ value: 'start', label: 'Start this wave', disabled: !w.canStart || !self.canManage() || self.dirty() }, { value: 'open', label: 'Open the change', disabled: !w.runId },
            { separator: true }, { value: 'earlier', label: 'Move earlier', disabled: i === 0 || !!w.runId || !self.canManage() },
            { value: 'later', label: 'Move later', disabled: i === all.length - 1 || !!w.runId || !self.canManage() },
            { value: 'split', label: 'Split in two', disabled: w.screens.length < 2 || !!w.runId || !self.canManage() || w.key.indexOf('#') >= 0 }],
          menuAction: (event) => {
            const v = event.detail.value;
            if (v === 'start') { startWave(w); } else if (v === 'open') { mz.open('modernization-workspace', { runId: w.runId }); }
            else if (v === 'earlier' || v === 'later') { moveWave(i, v === 'earlier' ? -1 : 1); } else if (v === 'split') { splitWave(w); }
          } };
      }));
      self.wave = ko.pureComputed(() => {
        const p = self.plan();
        if (!p || !p.waves.length) { return null; }
        const w = p.waves[Math.min(self.selectedWave(), p.waves.length - 1)];
        const allMap = p.components.filter((c) => w.components.indexOf(c.element) >= 0).every((c) => c.compatibility !== 'custom');
        return {
          n: w.n, name: w.name, summary: w.screens.length + ' screens · ' + w.components.length + (w.components.length === 1 ? ' component' : ' components'),
          screens: w.screens.slice(0, 30).map((s) => ({ name: s.name, id: s.id, uses: s.uses + ' uses' })),
          more: w.screens.length > 30 ? (w.screens.length - 30) + ' more screens' : '',
          checks: [
            { ok: allMap, text: allMap ? 'Every component in it maps (direct or property mapping)' : 'Some components need custom work; the workspace shows what' },
            // The pack in the code: installed (its change delivered) or going in with this wave's change
            { ok: !!packState() && !!packState().installed, text: packState() && packState().installed ? 'Premium JET pack ' + packState().installed + ' is in the code'
              : 'Premium JET pack ' + p.packVersion + ' is not in the code yet: it goes in with this change' },
            { ok: !w.waitsFor, text: w.waitsFor || 'Nothing to wait for' }
          ].map((c) => Object.assign(c, { css: 'factory-mu-check ' + (c.ok ? 'is-ok' : 'is-wait') })),
          button: w.state === 'delivered' ? 'See it in History' : w.state === 'validating' || w.state === 'review' ? 'Open it in Review' : w.runId && w.state !== 'planned' ? 'Open it in the workspace' : 'Start wave ' + w.n,
          canAct: (w.runId && w.state !== 'planned') || (w.canStart && self.canManage() && !self.dirty()),
          act: () => (w.state === 'delivered' ? mz.open('modernization-history') : (w.state === 'validating' || w.state === 'review') ? mz.open('modernization-review', { runId: w.runId })
            : w.runId && w.state !== 'planned' ? mz.open('modernization-workspace', { runId: w.runId }) : startWave(w)),
          second: w.state === 'delivered' ? 'Open its review' : '',
          secondAct: () => mz.open('modernization-review', { runId: w.runId }),
          title: w.waitsFor || (self.dirty() ? 'Save the plan first' : !self.canManage() ? 'Starting needs the Manage code permission' : null),
          hint: self.dirty() && !w.runId ? 'Save the plan first; the wave starts from the saved plan.' : ''
        };
      });
      self.savedText = ko.pureComputed(() => {
        const p = self.plan();
        if (self.dirty()) { return 'Unsaved changes'; }
        return p && p.saved ? 'Saved · ' + ui.when(p.savedAt) + (p.savedBy ? ' by ' + p.savedBy : '') : 'Not saved yet';
      });
      self.savedCss = ko.pureComputed(() => ui.pill(self.savedText(), self.dirty() ? 'amber' : self.plan() && self.plan().saved ? 'green' : 'grey').css);
      self.footLabel = ko.pureComputed(() => {
        const p = self.plan();
        const next = p ? p.waves.find((w) => w.canStart) : null;
        return next ? 'Save and start wave ' + next.n : 'Save the plan';
      });

      const query = () => {
        const q = ['grouping=' + encodeURIComponent(self.grouping())];
        self.components().forEach((c) => q.push('components=' + encodeURIComponent(c)));
        self.off().forEach((c) => q.push('off=' + encodeURIComponent(c)));
        self.order().forEach((c) => q.push('order=' + encodeURIComponent(c)));
        self.split().forEach((c) => q.push('split=' + encodeURIComponent(c)));
        if (!self.order().length) { q.push('order='); }
        return q.join('&');
      };
      // The waves as they would be with the page's choices, nothing saved
      const preview = () => api.get('workspaces/' + self.workspaceId() + '/modernization/upgrade-plan?' + query()).then((p) => self.plan(p)).catch((e) => toast.error(ui.errorText(e)));
      self.grouping.subscribe(() => { if (self.plan()) { self.dirty(true); self.selectedWave(0); preview(); } });

      const save = () => api.put('workspaces/' + self.workspaceId() + '/modernization/upgrade-plan', { grouping: self.grouping(), components: self.components(), off: self.off(), order: self.order(), split: self.split() })
        .then((p) => { self.plan(p); self.dirty(false); return p; });
      self.saveDraft = () => save().then(() => { self.actionError(''); toast.success('Plan saved.'); }).catch((e) => self.actionError(ui.errorText(e)));
      self.actionError = ko.observable('');
      self.clearError = () => self.actionError('');
      const packState = ko.observable(null);
      const startWave = (w) => {
        if (!self.canManage()) { return Promise.resolve(); }
        return api.post('workspaces/' + self.workspaceId() + '/modernization/upgrade-plan/start?wave=' + encodeURIComponent(w.key)).then((run) => {
          toast.success('Wave ' + w.n + ' started as a change.');
          mz.open('modernization-workspace', { runId: run.id });
        }).catch((e) => self.actionError(ui.errorText(e)));
      };
      self.saveAndStart = () => {
        if (!self.canManage()) { return; }
        save().then((p) => {
          const next = p.waves.find((w) => w.canStart);
          if (next) { return startWave(next); }
          toast.success('Plan saved.');
          return null;
        }).catch((e) => self.actionError(ui.errorText(e)));
      };
      self.csvHref = ko.pureComputed(() => (self.workspaceId() ? 'api/workspaces/' + self.workspaceId() + '/modernization/upgrade-plan.csv' : '#'));
      self.add = () => mz.open('modernization-components');
      self.back = () => mz.open('modernization-mapping');
      self.moreItems = [{ value: 'draft', label: 'Save as draft' }, { value: 'csv', label: 'Export the plan' }, { value: 'add', label: 'Add components' }];
      self.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'draft') { self.saveDraft(); } else if (v === 'csv') { window.location.href = self.csvHref(); } else { self.add(); }
      };

      const load = (id) => {
        if (!id) { self.loading(false); return; }
        self.loading(true);
        self.plan(null);
        const asked = mz.take();
        const add = (asked.components || []).map((c) => 'add=' + encodeURIComponent(c)).join('&');
        api.get('workspaces/' + id + '/modernization/packs').then((list) => packState((list || []).find((x) => x.pack === 'jet-premium' || x.id === 'jet-premium') || null)).catch(() => packState(null));
        api.get('workspaces/' + id + '/modernization/upgrade-plan' + (add ? '?' + add : '')).then((p) => {
          self.components(p.components.map((c) => c.element));
          self.off(p.components.filter((c) => !c.included).map((c) => c.element));
          self.grouping(p.grouping);
          self.order(p.order || []);
          self.split(p.split || []);
          self.plan(p);
          self.dirty(add.length > 0 && p.components.length > 0);
          self.error(null);
        }).catch((e) => { self.plan(null); self.error(ui.errorText(e)); }).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe((id) => load(id));
      self.connected = () => {
        accUtils.announce('Upgrade plan loaded.', 'assertive');
        document.title = 'Upgrade plan';
        load(self.workspaceId());
      };
      self.disconnected = () => sub.dispose();
    }

    return UpgradePlanViewModel;
  }
);
