/*
 * About page: what the factory is, then the answer in four cards (version and build from the running server, the
 * update state with updating for administrators when updates are on, the AI models in use, workspaces and your access),
 * one problem bar for an update, then what it is built with, its key features, links to its documentation, and
 * licensing and support.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/updates', '../services/ui', '../services/toast',
        '../services/dialog', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, updates, ui, toast, dialog) {
    const REPO = 'https://github.com/Ramm24Jadhav/OBDX-Development-Factory';
    const STATE = {
      UP_TO_DATE: ['SUCCEEDED', 'Up to date'], AVAILABLE: ['WARNING', 'Update available'], DOWNLOADING: ['RUNNING', 'Downloading'],
      READY: ['READY', 'Ready to install'], RESTARTING: ['RUNNING', 'Restarting'], FAILED: ['FAILED', 'Update failed'], OFF: ['CLOSED', 'Off']
    };
    const open = (url) => window.open(url, '_blank', 'noopener');

    function AboutViewModel() {
      this.isAdmin = session.isAdmin;
      this.status = updates.status;
      this.error = updates.error;
      this.model = ko.observable(null);
      this.workspaces = ko.observable(null);
      // Reproducible builds stamp the jar with 1980; that is not the real date
      this.builtAtText = ko.pureComputed(() => (this.status() && this.status().builtAt && new Date(this.status().builtAt).getFullYear() > 2000 ? ui.when(this.status().builtAt) : ''));
      this.checking = ko.observable(false);
      this.canUpdate = ko.pureComputed(() => this.isAdmin() && !!this.status() && this.status().enabled);
      this.check = () => {
        this.checking(true);
        updates.refresh(true).then((result) => {
          this.checking(false);
          if (result) {
            toast.info(result.message || (result.state === 'AVAILABLE' ? 'A newer build is available.' : 'This factory has the latest build.'));
          } else if (updates.error()) {
            toast.error('Could not check for updates: ' + updates.error());
          }
        });
      };
      // Updating restarts the factory, so it asks first
      this.install = () => dialog.confirm({
        title: 'Update the factory now?',
        message: 'The factory downloads build ' + (this.status() && this.status().latestBuild) + ' and restarts. It is not available for a short while, so tell the people using it first.',
        confirmLabel: 'Update now'
      }).then((ok) => {
        if (!ok) {
          return;
        }
        updates.install().then(() => {
          if (updates.error()) {
            toast.error('The update did not start: ' + updates.error());
          } else {
            toast.info('The update is downloading. The factory restarts when it is ready.');
          }
        });
      });

      // The answer: version, updates, models, workspaces and access
      this.cards = ko.pureComputed(() => {
        const s = this.status();
        const m = this.model();
        const st = s ? STATE[s.state] || [s.state, s.state] : null;
        const updateSub = !s ? 'Not read yet' : !s.enabled ? 'Installed by the administrators of this factory'
          : s.latestBuild ? 'Latest build ' + s.latestBuild + (s.latestDate ? ', ' + ui.when(s.latestDate) : '') + (s.checkedAt ? ' · checked ' + ui.when(s.checkedAt) : '')
            : s.checkedAt ? 'Checked ' + ui.when(s.checkedAt) : 'Not checked yet';
        return [
          { id: 'abVersion', label: 'Version', icon: 'cube', value: s ? (s.build === 'dev' ? 'Development build' : 'Build ' + s.build) : '–',
            sub: s ? ['Version ' + s.version, this.builtAtText() ? 'built ' + this.builtAtText() : ''].filter(Boolean).join(' · ') : 'Not read yet', pill: null },
          { id: 'abUpdates', label: 'Updates', icon: 'refresh', value: s ? (s.enabled ? 'GitHub releases' : 'By administrators') : '–', sub: updateSub,
            pill: st ? ui.status(st[0], st[1]) : null },
          { id: 'abModels', label: 'AI models in use', icon: 'chip', value: m ? m.chatModel : '–', mono: true,
            sub: m ? 'Search: ' + (m.embeddingModel || 'none') : 'Not read', pill: null },
          { id: 'abAccess', label: 'Workspaces and you', icon: 'user', value: this.workspaces() === null ? '–' : this.workspaces() + (this.workspaces() === 1 ? ' workspace' : ' workspaces'),
            sub: (session.user() ? (session.user().admin ? 'Administrator' : 'Workspace member') : '–') + ' · '
              + (session.config() ? { local: 'Factory accounts', ldap: 'Bank directory (LDAP)', oidc: 'Single sign-on (OIDC)', saml: 'Single sign-on (SAML)' }[session.config().mode] : '–'), pill: null }
        ].map((c) => Object.assign(c, { iconClass: 'factory-nav-icon factory-ico-' + c.icon, valueCss: 'factory-abt-cardvalue' + (c.mono ? ' factory-mono' : '') }));
      });
      // One problem: an update that failed or is waiting, or the check that failed
      this.problem = ko.pureComputed(() => {
        const s = this.status();
        if (this.error()) {
          return { css: 'factory-rqd-problem is-error', lead: 'Could not read the update state.', detail: this.error(), fix: this.canUpdate() ? { label: 'Check again', run: this.check } : null };
        }
        if (!s || !s.enabled) {
          return null;
        }
        const fix = this.isAdmin() && s.latestBuild ? { label: 'Update now', run: this.install, id: 'aboutUpdateButton' } : null;
        if (s.state === 'FAILED') {
          return { css: 'factory-rqd-problem is-error', lead: 'The last update failed.', detail: s.message || 'Try again.', fix: fix };
        }
        if (s.state === 'AVAILABLE') {
          return { css: 'factory-rqd-problem', lead: 'A newer build is available.', detail: 'Build ' + s.latestBuild + '; this is build ' + s.build + '.' + (this.isAdmin() ? ' The factory restarts to update.' : ' Ask an administrator to update.'), fix: fix };
        }
        return null;
      });
      // The update server's own words when there is no problem to show (for example, "Downloading 40%")
      this.updateMessage = ko.pureComputed(() => (!this.problem() && this.status() && this.status().enabled && this.status().message ? this.status().message : ''));

      const icons = (list) => list.map((r) => Object.assign(r, { iconClass: 'factory-nav-icon factory-ico-' + r.icon }));
      this.features = [
        ['AI-assisted requirements, screens and code generation', 'sparkle', 'violet'], ['OBDX version packs and the bank\'s own conventions', 'cube', 'primary'],
        ['Traceability from requirement to delivered code', 'link', 'primary'], ['Reusable recipes, templates and components', 'list', 'success'],
        ['Local, private or cloud AI models', 'chip', 'warning'], ['Impact analysis and change planning before code', 'target', 'primary'],
        ['Quick checks and Jenkins builds with fix rounds', 'flask', 'primary'], ['Roles, audit log and encrypted stored secrets', 'shield', 'success']
      ].map((f) => ({ text: f[0], iconClass: 'factory-nav-icon factory-ico-' + f[1], css: 'factory-abt-fico is-' + f[2] }));
      this.stack = icons([
        { label: 'Frontend', value: 'Oracle JET 21, Knockout, RequireJS', icon: 'monitor' }, { label: 'Backend', value: 'Java 21, Spring Boot 4, Jackson 3', icon: 'code' },
        { label: 'Database', value: 'PostgreSQL with pgvector, or the embedded trial database', icon: 'cube' }, { label: 'Build tools', value: 'Maven, Node.js for the UI', icon: 'cog' },
        { label: 'Application server', value: 'Embedded Tomcat; Oracle HTTP Server in front (optional)', icon: 'laptop' }, { label: 'Source control', value: 'Subversion (SVN)', icon: 'branch' },
        { label: 'AI providers', value: 'OpenAI-compatible: Ollama, LM Studio, vLLM, OpenAI, xAI, Groq', icon: 'chip' }, { label: 'Other tools', value: 'Jenkins', icon: 'rocket' },
        { label: 'Deployment', value: 'On-premise', icon: 'bank' }
      ]);
      this.links = [
        { label: 'Product documentation', href: REPO + '/blob/HEAD/docs/DEVELOPMENT.md', icon: 'doc' },
        { label: 'Architecture', href: REPO + '/blob/HEAD/docs/ARCHITECTURE.md', icon: 'cube' },
        { label: 'Where the work stands', href: REPO + '/blob/HEAD/docs/HANDOFF.md', icon: 'list' },
        { label: 'Release notes: what\'s new in every build', href: REPO + '/releases', icon: 'sparkle' },
        { label: 'Source code', href: REPO, icon: 'code' },
        { label: 'Report an issue', href: REPO + '/issues', icon: 'alert' }
      ].map((l) => Object.assign(l, { iconClass: 'factory-nav-icon factory-ico-' + l.icon + (l.icon === 'alert' ? ' factory-ab-red' : '') }));
      this.releasesUrl = REPO + '/releases';
      this.license = [
        { label: 'License', value: 'No license file in the repository yet' },
        { label: 'Usage limits', value: 'None set by the factory' },
        { label: 'Support', value: 'GitHub issues' },
        { label: 'Oracle code', value: 'Check the bank\'s Oracle terms' }
      ];
      this.openDocs = () => open(REPO + '/blob/HEAD/docs/DEVELOPMENT.md');
      this.openLicense = () => open(REPO + '/blob/HEAD/docs/ARCHITECTURE.md');
      this.openSupport = () => open(REPO + '/issues/new');
      this.moreItems = [
        { value: 'releases', label: 'Release notes', icon: 'sparkle' },
        { value: 'license', label: 'License details', icon: 'doc', description: 'The licensing notes in the architecture document' },
        { value: 'support', label: 'Contact support', icon: 'help', description: 'Opens a new issue in the factory\'s GitHub repository' }
      ];
      this.moreAction = (event) => {
        const v = event.detail.value;
        if (v === 'releases') { open(this.releasesUrl); } else if (v === 'license') { this.openLicense(); } else { this.openSupport(); }
      };

      this.connected = () => {
        accUtils.announce('About page loaded.');
        document.title = 'About';
        updates.refresh(false);
        api.get('model/status').then(this.model).catch(() => null);
        api.get('workspaces').then((list) => this.workspaces(list.length)).catch(() => null);
      };
    }

    return AboutViewModel;
  }
);
