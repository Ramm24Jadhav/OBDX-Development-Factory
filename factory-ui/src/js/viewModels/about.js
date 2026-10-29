/*
 * About page: what the factory is, its version and build from the running server, updating it (administrators, when
 * updates are on), what it is built with, the AI models in use, its key features, licensing and support, and links to
 * its documentation.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/updates', '../services/ui', 'ojs/ojbutton'],
  function (ko, accUtils, api, session, updates, ui) {
    const REPO = 'https://github.com/Ramm24Jadhav/OBDX-Development-Factory';

    function AboutViewModel() {
      this.isAdmin = session.isAdmin;
      this.status = updates.status;
      this.error = updates.error;
      this.model = ko.observable(null);
      this.workspaces = ko.observable(null);
      // Reproducible builds stamp the jar with 1980; that is not the real date
      this.builtAtText = ko.pureComputed(() => (this.status() && this.status().builtAt && new Date(this.status().builtAt).getFullYear() > 2000 ? ui.when(this.status().builtAt) : ''));
      this.check = () => updates.refresh(true);
      this.install = () => updates.install();
      this.tab = ko.observable('overview');
      this.tabs = ui.tabs(this.tab, [
        { value: 'overview', label: 'Overview', icon: 'cube' }, { value: 'version', label: 'Version Information', icon: 'info' },
        { value: 'news', label: 'What\'s New', icon: 'sparkle' }, { value: 'license', label: 'License & Usage', icon: 'doc' },
        { value: 'stack', label: 'Technology Stack', icon: 'cog' }, { value: 'support', label: 'Support & Resources', icon: 'help' }
      ]);
      this.tab.subscribe((value) => { const el = document.getElementById('ab-sec-' + value); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
      const icons = (list) => list.map((r) => Object.assign(r, { iconClass: 'factory-nav-icon factory-ico-' + r.icon }));

      this.product = ko.pureComputed(() => {
        const s = this.status();
        const rows = [
          { label: 'Product Name', value: 'OBDX Development Factory', icon: 'cube' },
          { label: 'Version', value: s ? s.version : '–', icon: 'doc' },
          { label: 'Build Number', value: s ? (s.build === 'dev' ? 'Development build' : s.build) : '–', icon: 'list' }
        ];
        // Reproducible builds have no real build date; leave the row out then
        if (this.builtAtText()) {
          rows.push({ label: 'Release Date', value: this.builtAtText(), icon: 'clock' });
        }
        rows.push(
          { label: 'Deployment', value: 'On-premise', icon: 'bank' },
          { label: 'Updates', value: s ? (s.enabled ? 'GitHub releases' : 'By administrators') : '–', icon: 'refresh' },
          { label: 'Sign-in', value: session.config() ? { local: 'Factory accounts', ldap: 'Bank directory (LDAP)', oidc: 'Single sign-on (OIDC)', saml: 'Single sign-on (SAML)' }[session.config().mode] : '–', icon: 'shield' },
          { label: 'Your Access', value: session.user() ? (session.user().admin ? 'Administrator' : 'Workspace member') : '–', icon: 'user' });
        return icons(rows);
      });
      this.build = ko.pureComputed(() => {
        const s = this.status();
        const m = this.model();
        return icons([
          { label: 'Frontend', value: 'Oracle JET 21 (Knockout)', icon: 'monitor' },
          { label: 'Backend', value: 'Spring Boot 4, Java 21', icon: 'code' },
          { label: 'Database', value: 'PostgreSQL with pgvector', icon: 'cube' },
          { label: 'Latest build', value: s && s.latestBuild ? 'Build ' + s.latestBuild + (s.latestDate ? ' (' + ui.when(s.latestDate) + ')' : '') : 'Not checked', icon: 'refresh' },
          { label: 'Update state', value: s ? s.state.replace('_', ' ').toLowerCase() : '–', icon: 'info' },
          { label: 'Chat model', value: m ? m.chatModel : '–', icon: 'chip' },
          { label: 'Code search model', value: m ? m.embeddingModel : '–', icon: 'search' },
          { label: 'Workspaces', value: this.workspaces() === null ? '–' : String(this.workspaces()), icon: 'folder' }
        ]);
      });
      this.features = [
        ['AI-assisted requirements, screens and code generation', 'sparkle', 'violet'], ['OBDX version packs and the bank\'s own conventions', 'cube', 'blue'],
        ['Traceability from requirement to delivered code', 'link', 'blue'], ['Reusable recipes, templates and components', 'list', 'green'],
        ['Local, private or cloud AI models', 'chip', 'amber'], ['Impact analysis and change planning before code', 'target', 'blue'],
        ['Quick checks and Jenkins builds with fix rounds', 'flask', 'blue'], ['Roles, audit log and encrypted stored secrets', 'shield', 'green']
      ].map((f) => ({ text: f[0], iconClass: 'factory-nav-icon factory-ico-' + f[1], css: 'factory-ab-fico factory-ab-fico-' + f[2] }));
      this.stack = icons([
        { label: 'Frontend', value: 'Oracle JET 21, Knockout, RequireJS', icon: 'monitor' }, { label: 'Backend', value: 'Java 21, Spring Boot 4, Jackson 3', icon: 'code' },
        { label: 'Database', value: 'PostgreSQL with pgvector, or the embedded trial database', icon: 'cube' }, { label: 'Build Tools', value: 'Maven, Node.js for the UI', icon: 'cog' },
        { label: 'Application Server', value: 'Embedded Tomcat; Oracle HTTP Server in front (optional)', icon: 'laptop' }, { label: 'Source Control', value: 'Subversion (SVN)', icon: 'branch' },
        { label: 'AI Providers', value: 'OpenAI-compatible: Ollama, LM Studio, vLLM, OpenAI, xAI, Groq', icon: 'chip' }, { label: 'Other Tools', value: 'Jenkins', icon: 'rocket' }
      ]);
      this.links = [
        { label: 'Product Documentation', href: REPO + '/blob/HEAD/docs/DEVELOPMENT.md', icon: 'doc' },
        { label: 'Architecture', href: REPO + '/blob/HEAD/docs/ARCHITECTURE.md', icon: 'cube' },
        { label: 'Where the work stands', href: REPO + '/blob/HEAD/docs/HANDOFF.md', icon: 'list' },
        { label: 'Release Notes', href: REPO + '/releases', icon: 'refresh' },
        { label: 'Source Code', href: REPO, icon: 'code' },
        { label: 'Report an Issue', href: REPO + '/issues', icon: 'alert' }
      ].map((l) => Object.assign(l, { iconClass: 'factory-nav-icon factory-ico-' + l.icon + (l.icon === 'alert' ? ' factory-ab-red' : '') }));
      this.releasesUrl = REPO + '/releases';
      this.license = icons([
        { label: 'License', value: 'No license file in the repository yet', icon: 'doc' },
        { label: 'Usage limits', value: 'None set by the factory', icon: 'users' },
        { label: 'Support', value: 'GitHub issues', icon: 'help' },
        { label: 'Oracle code', value: 'Check the bank\'s Oracle terms', icon: 'bank' }
      ]);
      this.openDocs = () => window.open(REPO + '/blob/HEAD/docs/DEVELOPMENT.md', '_blank', 'noopener');
      this.openLicense = () => window.open(REPO + '/blob/HEAD/docs/ARCHITECTURE.md', '_blank', 'noopener');
      this.openSupport = () => window.open(REPO + '/issues/new', '_blank', 'noopener');

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
