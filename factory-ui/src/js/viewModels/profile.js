/*
 * Profile page: shows the detected Project Profile of a workspace and lets developers confirm or correct facts.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojselectsingle', 'ojs/ojinputtext', 'ojs/ojbutton', 'ojs/ojtoolbar'],
  function (ko, accUtils, api, workspaceSelection, ArrayDataProvider) {
    const SECTION_TITLES = {
      OBDX: 'OBDX',
      UI: 'User interface',
      BACKEND: 'Backend',
      DATA: 'Database',
      INTEGRATION: 'Integration',
      CONVENTIONS: 'Bank conventions'
    };

    function ProfileViewModel() {
      this.workspaceProvider = new ArrayDataProvider(workspaceSelection.options, { keyAttributes: 'value' });
      this.workspaceId = workspaceSelection.selectedId;
      this.profile = ko.observable(null);
      this.errorMessage = ko.observable('');
      this.emptyMessage = ko.observable('');
      this.busy = ko.observable(false);
      this.editingKey = ko.observable(null);
      this.editValue = ko.observable('');

      this.detectedAt = ko.pureComputed(() => this.profile() ? new Date(this.profile().detectedAt).toLocaleString() : '');
      this.summary = ko.pureComputed(() => {
        const facts = this.profile() ? this.profile().facts : [];
        const count = (status) => facts.filter((fact) => fact.status === status).length;
        return facts.length + ' facts: ' + count('confirmed') + ' confirmed, ' + count('corrected') + ' corrected, '
          + count('detected') + ' to review, ' + count('missing') + ' not found.';
      });
      this.sections = ko.pureComputed(() => {
        const profile = this.profile();
        if (!profile) {
          return [];
        }
        return Object.keys(SECTION_TITLES)
          .map((section) => ({
            title: SECTION_TITLES[section],
            // Each row gets a reference to this page so its buttons can call the page's actions.
            facts: profile.facts.filter((fact) => fact.section === section).map((fact) => Object.assign({ page: this }, fact))
          }))
          .filter((section) => section.facts.length > 0);
      });

      const showError = (error) => this.errorMessage(error.message);
      const base = () => 'workspaces/' + this.workspaceId() + '/profile';
      const show = (profile) => {
        this.profile(profile);
        this.editingKey(null);
        this.errorMessage('');
        this.emptyMessage('');
      };

      const load = (id) => {
        this.profile(null);
        this.errorMessage('');
        this.emptyMessage('');
        this.editingKey(null);
        if (!id) {
          return;
        }
        api.get('workspaces/' + id + '/profile')
          .then((profile) => { if (id === this.workspaceId()) { show(profile); } })
          .catch((error) => (error.status === 404 ? this.emptyMessage(error.message) : showError(error)));
      };

      this.detect = () => {
        this.busy(true);
        api.post(base() + '/refresh').then(show).catch(showError).finally(() => this.busy(false));
      };

      this.confirm = (fact) => api.put(base() + '/facts/' + encodeURIComponent(fact.key), { value: fact.value }).then(show).catch(showError);
      this.reset = (fact) => api.del(base() + '/facts/' + encodeURIComponent(fact.key)).then(show).catch(showError);
      this.startEdit = (fact) => {
        this.editValue(fact.value || '');
        this.editingKey(fact.key);
      };
      this.cancelEdit = () => this.editingKey(null);
      this.saveEdit = (fact) => api.put(base() + '/facts/' + encodeURIComponent(fact.key), { value: this.editValue() })
        .then(show).catch(showError);

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Profile page loaded.');
        document.title = 'Project profile';
        subscription = this.workspaceId.subscribe(load);
        const before = this.workspaceId();
        // If loading the list changed the selection, the subscription has already loaded the profile.
        workspaceSelection.load().then(() => { if (this.workspaceId() === before) { load(before); } }).catch(showError);
      };
      this.disconnected = () => {
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return ProfileViewModel;
  }
);
