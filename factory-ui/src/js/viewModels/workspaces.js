/*
 * Workspaces page: lists workspaces and creates or deletes them through /api/workspaces.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojtable', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojselectsingle',
        'ojs/ojbutton', 'ojs/ojvalidationgroup'],
  function (ko, accUtils, api, session, ArrayDataProvider) {
    function WorkspacesViewModel() {
      this.isAdmin = session.isAdmin;
      const workspaces = ko.observableArray([]);
      this.workspaceProvider = new ArrayDataProvider(workspaces, { keyAttributes: 'id' });

      this.versionProvider = new ArrayDataProvider([
        { value: '22.x', label: 'OBDX 22.x' },
        { value: '25.x', label: 'OBDX 25.x' }
      ], { keyAttributes: 'value' });

      this.name = ko.observable('');
      this.bankName = ko.observable('');
      this.obdxVersion = ko.observable('22.x');
      this.svnUrl = ko.observable('');
      this.formValid = ko.observable();
      this.saving = ko.observable(false);

      this.errorMessage = ko.observable('');
      this.clearError = () => this.errorMessage('');

      const load = () => api.get('workspaces')
        .then((data) => workspaces(data.map((workspace) => Object.assign({}, workspace, {
          createdAt: new Date(workspace.createdAt).toLocaleString(),
          deleteAction: () => this.deleteWorkspace(workspace.id),
          canDelete: session.isAdmin()
        }))))
        .catch((error) => this.errorMessage(error.message));

      this.createWorkspace = () => {
        const form = document.getElementById('workspaceForm');
        if (this.formValid() !== 'valid') {
          form.showMessages();
          form.focusOn('@firstInvalidShown');
          return;
        }
        this.saving(true);
        api.post('workspaces', {
          name: this.name(),
          bankName: this.bankName(),
          obdxVersion: this.obdxVersion(),
          svnUrl: this.svnUrl() || null
        }).then(() => {
          this.name('');
          this.bankName('');
          this.svnUrl('');
          this.clearError();
          return load();
        }).catch((error) => this.errorMessage(error.message))
          .finally(() => this.saving(false));
      };

      this.deleteWorkspace = (id) => {
        if (!window.confirm('Delete this workspace with its code index, profile and requirements?')) {
          return;
        }
        api.del('workspaces/' + id)
          .then(load)
          .catch((error) => this.errorMessage(error.message));
      };

      this.connected = () => {
        accUtils.announce('Workspaces page loaded.');
        document.title = 'Workspaces';
        load();
      };
    }

    return WorkspacesViewModel;
  }
);
