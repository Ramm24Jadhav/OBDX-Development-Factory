/*
 * About page: what the factory is, its version, and updating it (administrators, when updates are on).
 */
define(['knockout', '../accUtils', '../services/session', '../services/updates', 'ojs/ojbutton'],
  function (ko, accUtils, session, updates) {
    function AboutViewModel() {
      this.isAdmin = session.isAdmin;
      this.status = updates.status;
      this.error = updates.error;
      this.builtAtText = ko.pureComputed(() => (this.status() && this.status().builtAt ? new Date(this.status().builtAt).toLocaleString() : ''));
      this.check = () => updates.refresh(true);
      this.install = () => updates.install();

      this.connected = () => {
        accUtils.announce('About page loaded.');
        document.title = 'About';
        updates.refresh(false);
      };
    }

    return AboutViewModel;
  }
);
