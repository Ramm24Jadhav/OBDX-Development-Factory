/*
 * Modernization page: the inventory of a workspace's OBDX application (screens, services, roles, flows), scanned from
 * its code, to plan moving it to a new frontend. The screens can be downloaded as CSV for wave planning.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojselectsingle', 'ojs/ojinputtext', 'ojs/ojbutton', 'ojs/ojtoolbar'],
  function (ko, accUtils, api, workspaceSelection, session, ArrayDataProvider) {
    const lastSegment = (id) => id.substring(id.lastIndexOf('/') + 1);

    function ModernizationViewModel() {
      this.workspaceProvider = new ArrayDataProvider(workspaceSelection.options, { keyAttributes: 'value' });
      this.workspaceId = workspaceSelection.selectedId;
      this.canScan = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.inventory = ko.observable(null);
      this.errorMessage = ko.observable('');
      this.emptyMessage = ko.observable('');
      this.busy = ko.observable(false);
      this.moduleFilter = ko.observable('');
      this.search = ko.observable('');

      this.moduleOptions = ko.observableArray([]);
      this.moduleProvider = new ArrayDataProvider(this.moduleOptions, { keyAttributes: 'value' });
      this.scannedText = ko.pureComputed(() => {
        const inventory = this.inventory();
        return inventory ? 'Scanned from revision r' + inventory.revision + ' on ' + new Date(inventory.scannedAt).toLocaleString() + '.' : '';
      });
      this.tiles = ko.pureComputed(() => {
        const s = this.inventory() ? this.inventory().summary : null;
        return s ? [
          { label: 'Screens', value: s.screens, detail: s.complexity.S + ' small, ' + s.complexity.M + ' medium, ' + s.complexity.L + ' large' },
          { label: 'Modules', value: s.modules, detail: s.fields + ' fields in all' },
          { label: 'Backend services', value: s.endpoints, detail: 'REST services in this codebase' },
          { label: 'Services the UI calls', value: s.calledServices, detail: s.callsWithoutBackend + ' not in this codebase (OBDX product)' },
          { label: 'Roles and segments', value: s.roles, detail: 'from security annotations and the UI' },
          { label: 'User flows', value: s.flows, detail: 'screens linked by navigation' }
        ] : [];
      });
      this.screenRows = ko.pureComputed(() => {
        const inventory = this.inventory();
        if (!inventory) {
          return [];
        }
        const text = this.search().trim().toLowerCase();
        const names = {};
        inventory.screens.forEach((s) => { names[s.id] = s.name; });
        return inventory.screens
          .filter((s) => !this.moduleFilter() || s.module === this.moduleFilter())
          .filter((s) => !text || (s.name + ' ' + s.files.join(' ') + ' ' + s.calls.join(' ')).toLowerCase().indexOf(text) >= 0)
          .map((s) => ({
            id: s.id,
            name: s.name,
            module: s.module,
            kind: s.kind,
            complexity: s.complexity,
            score: s.score,
            fieldCount: s.fields.length,
            actions: s.actions,
            calls: s.calls.join(', ') || '-',
            opens: s.opens.map((id) => names[id] || lastSegment(id)).join(', ') || '-',
            files: s.files,
            fields: s.fields.map((f) => f.type + (f.label ? ': ' + f.label : '') + (f.binding ? ' (' + f.binding + ')' : ''))
          }));
      });
      this.screenCount = ko.pureComputed(() => this.screenRows().length);
      this.endpointRows = ko.pureComputed(() => (this.inventory() ? this.inventory().endpoints : []).map((e) => ({
        method: e.method, path: e.path, code: e.javaClass + '.' + e.javaMethod, product: e.product ? 'Oracle product' : 'Bank',
        usedBy: e.usedBy.length ? e.usedBy.map(lastSegment).join(', ') : '-'
      })));
      this.callRows = ko.pureComputed(() => (this.inventory() ? this.inventory().calls : []).map((c) => ({
        method: c.method, path: c.path, endpoint: c.endpoint || 'Not in this codebase (OBDX product service)', missing: !c.endpoint,
        screens: c.screens.map(lastSegment).join(', ')
      })));
      this.flows = ko.pureComputed(() => (this.inventory() ? this.inventory().flows : []));
      this.roles = ko.pureComputed(() => (this.inventory() ? this.inventory().roles : []).map((r) => ({
        name: r.name, source: r.source, evidence: r.evidence.join(', ')
      })));
      this.modules = ko.pureComputed(() => (this.inventory() ? this.inventory().modules : []));
      this.csvUrl = ko.pureComputed(() => 'api/workspaces/' + this.workspaceId() + '/inventory/screens.csv');

      const showError = (error) => this.errorMessage(error.message);
      const show = (inventory) => {
        this.errorMessage('');
        this.inventory(inventory);
        this.emptyMessage(inventory ? '' : 'This workspace has not been scanned yet. Import its code (Code page) or scan it now.');
        this.moduleFilter('');
        this.moduleOptions([{ value: '', label: 'All modules' }].concat((inventory ? inventory.modules : [])
          .map((m) => ({ value: m.name, label: m.name + ' (' + m.screens + ')' }))));
      };
      const load = (id) => {
        this.inventory(null);
        this.errorMessage('');
        this.emptyMessage('');
        if (!id) {
          return;
        }
        api.get('workspaces/' + id + '/inventory')
          .then((inventory) => { if (id === this.workspaceId()) { show(inventory || null); } })
          .catch(showError);
      };
      this.scan = () => {
        this.busy(true);
        api.post('workspaces/' + this.workspaceId() + '/inventory/scan').then(show).catch(showError).finally(() => this.busy(false));
      };

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Modernization page loaded.');
        document.title = 'Modernization';
        subscription = this.workspaceId.subscribe(load);
        const before = this.workspaceId();
        workspaceSelection.load().then(() => { if (this.workspaceId() === before) { load(before); } }).catch(showError);
      };
      this.disconnected = () => {
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return ModernizationViewModel;
  }
);
