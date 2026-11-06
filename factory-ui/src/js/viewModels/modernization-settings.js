/*
 * Technology settings: what the factory uses when it moves a module to React, React Native or Angular, for this
 * workspace. Edit settings turns the editable rows into fields; the OBDX connection rows stay locked; the Look rows are
 * the component style saved in the Component factory. Running migrations keep the settings they started with.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/ui', '../services/toast',
        '../services/modernization', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, ui, toast, mz) {
    function SettingsViewModel() {
      const self = this;
      const ICONS = { project: 'folder', obdx: 'plug', rules: 'check', tests: 'flask', look: 'design' };
      self.groupIcon = (id) => ICONS[id] || 'cog';
      self.workspaceId = workspaceSelection.selectedId;
      self.canManage = mz.canManage;
      self.loading = ko.observable(true);
      self.error = ko.observable(null);
      self.data = ko.observable(null);
      self.technology = ko.observable('react');
      self.editing = ko.observable(false);
      self.draft = {};

      self.techs = ko.pureComputed(() => (self.data() ? self.data().technologies : []).map((t) => ({ id: t.id, name: t.name, state: t.state === 'ready' ? 'Ready' : 'Preview',
        stateCss: ui.pill('', t.state === 'ready' ? 'green' : 'amber').css, checked: self.technology() === t.id ? 'true' : 'false',
        css: 'factory-ms-tech' + (self.technology() === t.id ? ' is-on' : ''), pick: () => { if (self.technology() !== t.id) { self.technology(t.id); self.editing(false); load(); } } })));
      self.preview = ko.pureComputed(() => !!self.data() && self.data().state !== 'ready');
      self.groups = ko.pureComputed(() => (self.data() ? self.data().groups : []).map((g) => ({ title: g.title, lead: g.lead, id: g.id,
        rows: g.rows.map((r) => {
          if (!self.draft[r.key]) { self.draft[r.key] = ko.observable(r.value); }
          return { key: r.key, label: r.label, value: r.value, editable: r.editable, locked: r.locked, css: r.mono ? 'factory-mo-mono' : '', source: r.source === 'workspace' ? 'Changed for this workspace' : '',
            draft: self.draft[r.key] };
        }) })));
      self.savedText = ko.pureComputed(() => {
        const d = self.data();
        return d && d.saved ? 'Saved · ' + ui.when(d.savedAt) + (d.savedBy ? ' by ' + d.savedBy : '') : 'Defaults';
      });
      self.startEdit = () => {
        Object.keys(self.draft).forEach((k) => { const row = (self.data().groups.flatMap((g) => g.rows)).find((r) => r.key === k); if (row) { self.draft[k](row.value); } });
        self.editing(true);
      };
      self.cancel = () => self.editing(false);
      self.save = () => {
        const values = {};
        self.data().groups.forEach((g) => g.rows.filter((r) => r.editable).forEach((r) => { values[r.key] = self.draft[r.key](); }));
        api.put('workspaces/' + self.workspaceId() + '/modernization/settings/' + self.technology(), { values: values }).then((d) => {
          self.data(d);
          self.editing(false);
          toast.success(d.name + ' settings saved for this workspace. Running migrations keep their settings.');
        }).catch((e) => toast.error(ui.errorText(e)));
      };
      self.openFactory = () => mz.open('components');

      const load = () => {
        const id = self.workspaceId();
        if (!id) { self.loading(false); return; }
        self.loading(true);
        self.draft = {};
        api.get('workspaces/' + id + '/modernization/settings?technology=' + encodeURIComponent(self.technology())).then((d) => { self.data(d); self.error(null); })
          .catch((e) => self.error(ui.errorText(e))).then(() => self.loading(false));
      };
      const sub = self.workspaceId.subscribe(() => { self.editing(false); load(); });
      self.connected = () => {
        accUtils.announce('Technology settings loaded.', 'assertive');
        document.title = 'Technology settings';
        const asked = mz.take();
        if (asked.technology) { self.technology(asked.technology); }
        load();
      };
      self.disconnected = () => sub.dispose();
    }

    return SettingsViewModel;
  }
);
