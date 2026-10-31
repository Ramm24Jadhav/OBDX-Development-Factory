/*
 * Project Profile page: the detected stack of a workspace in six cards (OBDX, UI, backend, database, integration, bank
 * conventions) with each fact's confidence and evidence files, confirm/correct/reset of facts, the version pack's
 * reference patterns (with pinning of examples), and an assistant that answers from the profile.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui', '../services/toast',
        '../services/assistant', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, toast, assistant, pageRequests) {
    // Status badges of the design system (fx-badge carries a dot, so status is never colour alone)
    const TONES = { green: 'success', amber: 'warning', red: 'danger', blue: 'primary', violet: 'violet', grey: '' };
    const pill = (text, tone) => ({ text: text, css: 'fx-badge' + (TONES[tone] ? ' fx-badge--' + TONES[tone] : '') });
    const failed = (error) => toast.error(error.message);
    const SECTIONS = [
      { key: 'OBDX', title: '1. OBDX Framework', icon: 'doc' },
      { key: 'UI', title: '2. User Interface', icon: 'monitor' },
      { key: 'BACKEND', title: '3. Backend', icon: 'cog' },
      { key: 'DATA', title: '4. Database', icon: 'cube' },
      { key: 'INTEGRATION', title: '5. Integration', icon: 'link' },
      { key: 'CONVENTIONS', title: '6. Bank Conventions', icon: 'shield' }
    ];
    const CONFIDENCE = { HIGH: pill('High', 'green'), MEDIUM: pill('Medium', 'amber'), LOW: pill('Low', 'red'), NONE: pill('None', 'grey') };
    const STATUS = { confirmed: pill('Confirmed', 'green'), corrected: pill('Corrected', 'blue'), detected: pill('Detected', 'amber'), missing: pill('Not found', 'grey') };
    const CONFIG = /\.(xml|properties|json|ya?ml|conf|config)$/i;

    function ProfileViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.workspace = ko.observable(null);
      this.profile = ko.observable(null);
      this.index = ko.observable(null);
      this.canEdit = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.errorMessage = ko.observable('');
      this.emptyMessage = ko.observable('');
      this.busy = ko.observable(false);
      this.tab = ko.observable('stack');
      this.tabs = ui.tabs(this.tab, [
        { value: 'stack', label: 'Technology Stack' },
        { value: 'conventions', label: 'Bank Conventions' },
        { value: 'patterns', label: 'Reference Patterns' },
        { value: 'dependencies', label: 'Dependencies' },
        { value: 'customizations', label: 'Customizations' },
        { value: 'settings', label: 'Settings' }
      ]);

      const facts = ko.pureComputed(() => (this.profile() ? this.profile().facts : []));
      const count = (status) => facts().filter((f) => f.status === status).length;
      this.detectedAt = ko.pureComputed(() => (this.profile() ? ui.when(this.profile().detectedAt) : ''));
      // Coverage: the share of facts that have a value (detected, confirmed or corrected)
      this.coverage = ko.pureComputed(() => (facts().length ? Math.round(100 * facts().filter((f) => f.value).length / facts().length) : 0));
      this.coverageStyle = ko.pureComputed(() => ({ background: 'conic-gradient(var(--fx-primary) ' + this.coverage() + '%, var(--fx-surface-3) 0)' }));
      // Confidence: the share of facts confirmed or corrected by people, or detected with high or medium confidence
      this.confidence = ko.pureComputed(() => (facts().length ? Math.round(100 * facts().filter((f) => f.status === 'confirmed' || f.status === 'corrected'
        || (f.value && (f.confidence === 'HIGH' || f.confidence === 'MEDIUM'))).length / facts().length) : 0));
      this.confidenceStyle = ko.pureComputed(() => ({ background: 'conic-gradient(var(--fx-primary) ' + this.confidence() + '%, var(--fx-surface-3) 0)' }));
      // The discovery run under the Refresh Discovery button
      this.discoveryPill = ko.pureComputed(() => (this.busy() ? pill('Running', 'blue') : (this.profile() ? pill('Completed', 'green') : pill('Not run', 'grey'))));
      this.statusPill = ko.pureComputed(() => {
        if (!this.profile()) {
          return pill('Not detected', 'grey');
        }
        return count('detected') > 0 ? pill(count('detected') + ' to review', 'amber') : pill('Ready', 'green');
      });
      this.summary = ko.pureComputed(() => facts().length + ' facts: ' + count('confirmed') + ' confirmed, ' + count('corrected')
        + ' corrected, ' + count('detected') + ' to review, ' + count('missing') + ' not found.');

      // The fact being confirmed or corrected
      this.editing = ko.observable(null);
      this.editValue = ko.observable('');
      const factRow = (f) => ({
        key: f.key, label: f.label, value: f.value || 'Not found', missing: !f.value,
        confidence: CONFIDENCE[f.confidence] || CONFIDENCE.NONE, status: STATUS[f.status] || STATUS.detected,
        detected: f.detectedValue || '', evidence: f.evidence,
        open: () => { this.editing(f); this.editValue(f.value || ''); }
      });
      // A card's status pill, with a leading check (or a warning sign when facts wait for confirmation)
      const statusPill = (text, tone, icon) => Object.assign(pill(text, tone), { css: pill(text, tone).css + ' fx-badge--plain', icon: 'factory-nav-icon factory-ico-' + icon });
      const cardStatus = (list) => {
        if (list.length && list.every((f) => f.status === 'confirmed' || f.status === 'corrected')) {
          return statusPill('Verified', 'green', 'check');
        }
        if (list.some((f) => f.status === 'missing')) {
          return statusPill('Partially Detected', 'blue', 'check');
        }
        return list.some((f) => f.status === 'detected') ? statusPill('Needs Confirmation', 'amber', 'alert') : statusPill('Detected', 'blue', 'check');
      };
      this.cards = ko.pureComputed(() => SECTIONS.map((s) => {
        const list = facts().filter((f) => f.section === s.key);
        const evidence = Array.from(new Set(list.reduce((all, f) => all.concat(f.evidence || []), [])));
        return {
          title: s.title, iconClass: 'factory-nav-icon factory-ico-' + s.icon, status: cardStatus(list),
          rows: list.map(factRow),
          evidenceTitle: 'Evidence (' + evidence.length + ' file' + (evidence.length === 1 ? '' : 's') + ')',
          evidence: evidence.slice(0, 2).map((p) => ({ path: p, name: p.split('/').pop() })),
          more: evidence.length > 2 ? '+' + (evidence.length - 2) : '',
          sparse: list.length < 4,
          toConventions: () => this.tab('conventions'),
          open: () => { this.tab('settings'); this.factSection(s.key); this.factSectionTitle(s.title.replace(/^\d+\.\s*/, '')); }
        };
      }).filter((c) => c.rows.length > 0));
      // The All facts table, for one card's section when opened from its chevron
      this.factSection = ko.observable('');
      this.factSectionTitle = ko.observable('');
      this.tab.subscribe(() => this.factSection(''));
      this.showAllFacts = () => this.factSection('');
      this.allFacts = ko.pureComputed(() => facts().filter((f) => !this.factSection() || f.section === this.factSection()).map(factRow));
      this.conventionFacts = ko.pureComputed(() => facts().filter((f) => f.section === 'CONVENTIONS').map(factRow));

      // Dependencies: the frameworks and libraries the profile found, one tag each
      const split = (key) => {
        const f = facts().find((x) => x.key === key);
        return f && f.value ? f.value.split(/\s*[,;]\s*/).filter(Boolean) : [];
      };
      this.dependencies = ko.pureComputed(() => [
        { title: 'Backend frameworks', items: split('backend.frameworks') },
        { title: 'UI libraries', items: split('ui.libraries') },
        { title: 'Integration adapters', items: split('integration.adapters') },
        { title: 'Host systems', items: split('integration.hostSystems') }
      ].filter((d) => d.items.length));

      // Repository structure and key configuration files, from the files the profile and patterns point at
      const evidenceFiles = ko.pureComputed(() => {
        const files = {};
        facts().forEach((f) => (f.evidence || []).forEach((p) => { (files[p] = files[p] || []).push(f.label); }));
        return files;
      });
      // A configuration file is Valid when the facts read from it are confirmed or of high or medium confidence, and
      // Warning when one is of low confidence or the discovery warned about it.
      const fileRevisions = ko.observable(null);
      this.configFiles = ko.pureComputed(() => {
        const warnings = this.profile() ? this.profile().warnings || [] : [];
        return Object.keys(evidenceFiles()).filter((p) => CONFIG.test(p)).sort().map((p) => {
          const name = p.split('/').pop();
          const weak = facts().filter((f) => (f.evidence || []).indexOf(p) >= 0 && f.status === 'detected' && f.confidence === 'LOW');
          const warned = warnings.filter((w) => w.indexOf(name) >= 0);
          const warn = weak.length > 0 || warned.length > 0;
          const revision = fileRevisions() ? fileRevisions()[p] : undefined;
          return {
            path: p, name: name, purpose: evidenceFiles()[p].slice(0, 2).join(', '),
            status: warn ? pill('Warning', 'amber') : pill('Valid', 'green'),
            statusTitle: warn ? (warned.concat(weak.map((f) => f.label + ' has low confidence'))).join('; ') : 'The facts read from this file are reliable',
            modified: revision !== undefined ? 'r' + revision : 'Not known',
            modifiedTitle: revision !== undefined ? 'Last indexed at this revision' : 'This factory server does not report file changes',
            open: () => this.searchFile(p)
          };
        });
      });

      // Repository Structure: folders of the evidence and example files, which can be expanded and collapsed
      const collapsed = ko.observable({});
      this.tree = ko.pureComputed(() => {
        const root = {};
        const paths = Object.keys(evidenceFiles()).concat(this.examplePaths());
        paths.forEach((p) => {
          let node = root;
          p.split('/').slice(0, -1).slice(0, 5).forEach((part) => { node = node[part] = node[part] || {}; });
        });
        const rows = [];
        const walk = (node, depth, prefix) => Object.keys(node).sort().forEach((name) => {
          const key = prefix + name;
          const hasChildren = Object.keys(node[name]).length > 0;
          const open = hasChildren && (collapsed()[key] === undefined ? depth < 2 : !collapsed()[key]);
          rows.push({
            name: name, style: { paddingLeft: (depth * 14) + 'px' }, hasChildren: hasChildren,
            caret: 'factory-nav-icon factory-ico-caret factory-pf2-caret' + (open ? '' : ' factory-pf2-caret-closed'),
            label: (open ? 'Collapse ' : 'Expand ') + name,
            toggle: () => { const c = Object.assign({}, collapsed()); c[key] = open; collapsed(c); }
          });
          if (open) {
            walk(node[name], depth + 1, key + '/');
          }
        });
        walk(root, 0, '');
        return rows.slice(0, 60);
      });

      // Version pack recipes: each part has its reference examples and pin/unpin actions
      this.recipes = ko.observableArray([]);
      this.recipesNote = ko.observable('');
      this.examplePaths = ko.observable([]);
      const showError = (error) => this.errorMessage(error.message);
      const showRecipes = (data) => {
        const id = this.workspaceId();
        const canEdit = this.canEdit();
        const paths = [];
        this.recipesNote(data.indexedFiles === 0
          ? 'Import the code to find reference examples in it.'
          : 'OBDX ' + data.version + ' pack. Examples are picked from the ' + data.indexedFiles + ' indexed files: customization folders first, Oracle product code last.');
        this.recipes(data.recipes.map((r) => ({
          id: r.id, title: r.title, when: r.when || '', guidance: r.guidance,
          scope: (r.actions.length ? r.actions.join(' / ') : 'create / modify') + (r.layers.length ? ' · ' + r.layers.join(' / ') : ''),
          parts: r.parts.map((p) => {
            const url = 'workspaces/' + id + '/recipes/' + r.id + '/parts/' + p.id + '/examples';
            const newPath = ko.observable('');
            p.examples.forEach((e) => paths.push(e.path));
            return {
              id: r.id + '-' + p.id, name: p.name, files: p.files.join(', '),
              template: p.templateContent || '', templateName: p.template || '', canEdit: canEdit, newPath: newPath,
              examples: p.examples.map((e) => ({
                path: e.path, reason: e.reason, pinned: e.pinned, canEdit: canEdit,
                unpin: () => api.del(url + '?path=' + encodeURIComponent(e.path))
                  .then((result) => { showRecipes(result); toast.success('Example unpinned.'); }).catch(failed)
              })),
              pin: () => api.post(url, { path: newPath() })
                .then((result) => { showRecipes(result); toast.success('Example pinned.'); }).catch(failed)
            };
          })
        })));
        this.examplePaths(paths);
      };
      this.customizations = ko.pureComputed(() => {
        const folders = split('conventions.customizationFolders');
        return this.examplePaths().filter((p) => !/com\/ofss|\/ofss\//i.test(p) && (folders.length === 0 || folders.some((f) => p.indexOf(f) >= 0)))
          .filter((p, i, list) => list.indexOf(p) === i).slice(0, 30);
      });
      this.customizationFolders = ko.pureComputed(() => split('conventions.customizationFolders'));

      const base = () => 'workspaces/' + this.workspaceId() + '/profile';
      const show = (profile) => {
        this.profile(profile);
        this.editing(null);
        this.errorMessage('');
        this.emptyMessage('');
      };
      const load = (id) => {
        this.profile(null);
        this.recipes([]);
        this.recipesNote('');
        this.errorMessage('');
        this.emptyMessage('');
        this.editing(null);
        this.workspace(null);
        if (!id) {
          return;
        }
        api.get('workspaces/' + id).then((w) => { if (id === this.workspaceId()) { this.workspace(w); } }).catch(() => null);
        api.get('workspaces/' + id + '/index').then((s) => { if (id === this.workspaceId()) { this.index(s); } }).catch(() => null);
        fileRevisions(null);
        api.get('workspaces/' + id + '/files?limit=20000').then((list) => {
          if (id === this.workspaceId()) {
            const map = {};
            list.forEach((f) => { map[f.path] = f.revision; });
            fileRevisions(map);
          }
        }).catch(() => null);
        api.get(base())
          .then((profile) => { if (id === this.workspaceId()) { show(profile); } })
          .catch((error) => (error.status === 404 ? this.emptyMessage(error.message) : showError(error)));
        api.get('workspaces/' + id + '/recipes')
          .then((data) => { if (id === this.workspaceId()) { showRecipes(data); } })
          .catch(showError);
      };

      this.detect = () => {
        this.busy(true);
        api.post(base() + '/refresh').then((profile) => { show(profile); toast.success('Discovery refreshed.'); })
          .catch(failed).finally(() => this.busy(false));
      };
      const put = (f, value, done) => api.put(base() + '/facts/' + encodeURIComponent(f.key), { value: value })
        .then((profile) => { show(profile); toast.success(done); }).catch(failed);
      this.confirmEditing = () => put(this.editing(), this.editing().value, this.editing().label + ' confirmed.');
      this.saveEditing = () => put(this.editing(), this.editValue(), this.editing().label + ' corrected.');
      this.resetEditing = () => {
        const label = this.editing().label;
        api.del(base() + '/facts/' + encodeURIComponent(this.editing().key))
          .then((profile) => { show(profile); toast.success(label + ' reset to the detected value.'); }).catch(failed);
      };
      this.closeEditing = () => this.editing(null);
      this.editingTitle = ko.pureComputed(() => (this.editing() ? this.editing().label : ''));
      this.editingDetected = ko.pureComputed(() => (this.editing() ? (this.editing().detectedValue || 'Nothing detected') : ''));
      this.editingEvidence = ko.pureComputed(() => (this.editing() ? this.editing().evidence : []));
      this.searchFile = (path) => {
        pageRequests.codeSearch(path.split('/').pop());
        window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'code' }));
      };

      // AI Assistant modes: each tells the model what kind of answer to give
      this.aiMode = ko.observable('ask');
      const MODES = {
        ask: 'Answer the question.',
        explain: 'Explain the detected configuration or file the question names, step by step.',
        usage: 'Find where the named component, class or pattern is used, from the evidence files.',
        generate: 'Suggest code that follows the conventions below; say which facts it relies on.',
        compare: 'Compare the conventions below with what the question describes and list the differences.'
      };
      this.aiModes = ui.tabs(this.aiMode, [
        { value: 'ask', label: 'Ask' }, { value: 'explain', label: 'Explain' }, { value: 'usage', label: 'Find Usage' },
        { value: 'generate', label: 'Generate' }, { value: 'compare', label: 'Compare' }
      ]);
      this.aiExpanded = ko.observable(false);
      this.toggleAi = () => this.aiExpanded(!this.aiExpanded());
      this.ai = assistant.create(() => (this.profile()
        ? 'Answer mode: ' + MODES[this.aiMode()] + '\n'
          + 'Project Profile of workspace ' + (this.workspace() ? this.workspace().name : '') + ' (detected ' + this.detectedAt() + '):\n'
          + facts().map((f) => f.section + ' / ' + f.label + ': ' + (f.value || 'not found') + ' [' + f.status + ', confidence ' + f.confidence + ']'
            + (f.evidence && f.evidence.length ? ' evidence: ' + f.evidence.slice(0, 3).join(', ') : '')).join('\n')
        : ''), ['Explain OBDX configuration', 'Find transaction patterns', 'Show UI component usage', 'What should I confirm first?']);

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Project Profile page loaded.');
        document.title = 'Project Profile';
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
