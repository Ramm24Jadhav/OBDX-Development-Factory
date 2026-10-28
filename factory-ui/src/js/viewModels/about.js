/*
 * About page: what the factory is, its version and build from the running server, updating it (administrators, when
 * updates are on), what it is built with, the AI models in use, its key features, and links to its documentation.
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
        { value: 'stack', label: 'Technology Stack', icon: 'cog' }, { value: 'support', label: 'Support & Resources', icon: 'help' }
      ]);
      this.tab.subscribe((value) => { const el = document.getElementById('ab-sec-' + value); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });

      this.product = ko.pureComputed(() => {
        const s = this.status();
        return [
          { label: 'Product Name', value: 'OBDX Development Factory', icon: 'cube' },
          { label: 'Build', value: s ? (s.build === 'dev' ? 'Development build' : 'Build ' + s.build) : '–', icon: 'info' },
          { label: 'Version', value: s ? s.version : '–', icon: 'doc' },
          { label: 'Built', value: this.builtAtText() || '–', icon: 'clock' },
          { label: 'Deployment', value: 'On-premise (runs inside the bank)', icon: 'bank' },
          { label: 'Updates', value: s ? (s.enabled ? 'From the factory\'s GitHub releases' : 'Installed by the administrators') : '–', icon: 'refresh' },
          { label: 'Sign-in', value: session.config() ? { local: 'Factory accounts', ldap: 'Bank directory (LDAP)', oidc: 'Single sign-on (OpenID Connect)', saml: 'Single sign-on (SAML)' }[session.config().mode] : '–', icon: 'shield' }
        ].map((r) => Object.assign(r, { iconClass: 'factory-nav-icon factory-ico-' + r.icon }));
      });
      this.build = ko.pureComputed(() => {
        const s = this.status();
        const m = this.model();
        return [
          { label: 'Frontend', value: 'Oracle JET 21 (Knockout)', icon: 'monitor' },
          { label: 'Backend', value: 'Spring Boot 4, Java 21', icon: 'code' },
          { label: 'Database', value: 'PostgreSQL with pgvector', icon: 'cube' },
          { label: 'Latest build', value: s && s.latestBuild ? 'Build ' + s.latestBuild + (s.latestDate ? ' (' + ui.when(s.latestDate) + ')' : '') : 'Not checked', icon: 'refresh' },
          { label: 'Update state', value: s ? s.state.replace('_', ' ').toLowerCase() : '–', icon: 'info' },
          { label: 'Chat model', value: m ? m.chatModel : '–', icon: 'chip' },
          { label: 'Code search model', value: m ? m.embeddingModel : '–', icon: 'search' },
          { label: 'Workspaces', value: this.workspaces() === null ? '–' : String(this.workspaces()), icon: 'folder' }
        ].map((r) => Object.assign(r, { iconClass: 'factory-nav-icon factory-ico-' + r.icon }));
      });
      this.features = [
        'AI-assisted requirements, screens and code generation', 'OBDX version packs and the bank\'s own conventions',
        'Traceability from requirement to screens, plan, files and builds', 'Reusable recipes, templates and components',
        'Local or privately hosted models (Ollama, LM Studio, vLLM) or cloud APIs', 'Impact analysis and change planning before code',
        'Quick checks and Jenkins builds with fix rounds', 'Roles, audit log and encrypted stored secrets'
      ].map((t, i) => ({ text: t, css: 'factory-step-dot factory-dot-' + ['violet', 'blue', 'blue', 'green', 'amber', 'blue', 'blue', 'green'][i] }));
      this.stack = [
        { label: 'Frontend', value: 'Oracle JET 21, Knockout, RequireJS' }, { label: 'Backend', value: 'Java 21, Spring Boot 4, Jackson 3' },
        { label: 'Database', value: 'PostgreSQL with pgvector (or the embedded trial database)' }, { label: 'Build Tools', value: 'Maven, Node.js for the UI' },
        { label: 'Application Server', value: 'Embedded Tomcat; Oracle HTTP Server in front (optional)' }, { label: 'Source Control', value: 'Subversion (SVN)' },
        { label: 'AI Providers', value: 'OpenAI-compatible APIs: Ollama, LM Studio, vLLM, OpenAI, xAI, Groq' }, { label: 'Other Tools', value: 'Jenkins' }
      ];
      this.links = [
        { label: 'Product Documentation', href: REPO + '/blob/HEAD/docs/DEVELOPMENT.md', icon: 'doc' },
        { label: 'Architecture', href: REPO + '/blob/HEAD/docs/ARCHITECTURE.md', icon: 'cube' },
        { label: 'Where the work stands', href: REPO + '/blob/HEAD/docs/HANDOFF.md', icon: 'list' },
        { label: 'Release Notes', href: REPO + '/releases', icon: 'refresh' },
        { label: 'Source Code', href: REPO, icon: 'code' },
        { label: 'Report an Issue', href: REPO + '/issues', icon: 'alert' }
      ].map((l) => Object.assign(l, { iconClass: 'factory-nav-icon factory-ico-' + l.icon }));
      this.openDocs = () => window.open(REPO + '/blob/HEAD/docs/DEVELOPMENT.md', '_blank', 'noopener');

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
