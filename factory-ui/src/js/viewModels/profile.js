/*
 * Project Profile page: what a workspace's code is built with, as facts grouped by area (OBDX, UI, backend, database,
 * integrations, dependencies, customisations, bank conventions). Each fact shows where it came from (detected from a
 * declaring file, inferred from code patterns, confirmed or corrected by a person, or not found), its evidence files
 * and detection confidence; members who manage the code confirm, correct or reset it, and every change is listed from
 * the audit log. Facts that code generation reads are marked, and missing ones are named at the top. The version
 * pack's reference patterns and an assistant that answers from the profile sit folded away below.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui', '../services/toast',
        '../services/assistant', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, toast, assistant, pageRequests) {
    const failed = (error) => toast.error(error.message);
    const badge = (text, variant) => ({ text: text, css: 'fx-badge' + (variant ? ' fx-badge--' + variant : ' fx-badge--neutral') });

    // The page's areas. A fact goes to the area of its key when listed here, otherwise to the area of its server section.
    const GROUPS = [
      { id: 'obdx', title: 'OBDX framework and version', icon: 'doc' },
      { id: 'ui', title: 'UI technology', icon: 'monitor' },
      { id: 'backend', title: 'Backend', icon: 'cog' },
      { id: 'database', title: 'Database', icon: 'cube' },
      { id: 'integrations', title: 'Integrations', icon: 'link' },
      { id: 'dependencies', title: 'Dependencies', icon: 'list' },
      { id: 'customisations', title: 'Customisations', icon: 'edit' },
      { id: 'conventions', title: 'Bank conventions', icon: 'shield' }
    ];
    const SECTION_GROUP = { OBDX: 'obdx', UI: 'ui', BACKEND: 'backend', DATA: 'database', INTEGRATION: 'integrations', CONVENTIONS: 'conventions' };
    const KEY_GROUP = {
      'backend.frameworks': 'dependencies', 'ui.libraries': 'dependencies',
      'conventions.customizationFolders': 'customisations', 'conventions.packageRoots': 'customisations'
    };

    // Facts the code generation path reads by key (besides giving every known fact to the model when it writes a change):
    // pack/CheckScope and LocalChecks (JET and Java level), the version packs' ifProfile conditions, pack/RecipeService.
    const GENERATION = {
      'ui.jetVersion': 'Decides which version pack rules check the generated UI code (some rules need a minimum JET version).',
      'ui.moduleSystem': 'The RequireJS rules of the version pack check generated code only when this says RequireJS.',
      'backend.eeNamespace': 'The javax or jakarta rules check generated Java only when this is known.',
      'backend.javaVersion': 'Generated Java is checked against this Java level; without it the version pack default is used.',
      'conventions.customizationFolders': 'The change plan\'s reference examples are picked from these folders first.'
    };

    // Where a fact's value comes from. Detection confidence HIGH means the value is declared in a build or configuration
    // file; MEDIUM and LOW mean it was inferred from code patterns, so it is not shown as verified.
    const CONFIDENCE = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', NONE: 'None' };
    const origin = (f) => {
      if (f.status === 'confirmed') {
        return { id: 'people', badge: badge('Confirmed', 'success'), text: 'Confirmed by a person; it matches what was detected.' };
      }
      if (f.status === 'corrected') {
        return { id: 'people', badge: badge('Corrected', 'primary'), text: 'Set by a person; it differs from what was detected.' };
      }
      if (f.status === 'missing') {
        return { id: 'missing', badge: badge('Not found'), text: 'Nothing in the code showed this.' };
      }
      return f.confidence === 'HIGH'
        ? { id: 'detected', badge: badge('Detected', 'info'), text: 'Detected: declared in a build or configuration file. Not yet confirmed by a person.' }
        : { id: 'inferred', badge: badge('Inferred', 'warning'), text: 'Inferred from patterns in the code, not declared anywhere. Confirm or correct it.' };
    };

    function ProfileViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.workspace = ko.observable(null);
      this.profile = ko.observable(null);
      this.history = ko.observableArray([]);
      this.historyError = ko.observable('');
      this.canEdit = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.manageTip = ko.pureComputed(() => (this.canEdit() ? null : 'Only members who manage the code can do this'));
      this.errorMessage = ko.observable('');
      this.emptyMessage = ko.observable('');
      this.busy = ko.observable(false);

      const facts = ko.pureComputed(() => (this.profile() ? this.profile().facts : []));
      const base = () => 'workspaces/' + this.workspaceId() + '/profile';

      // Scan line: when the profile was detected, at which revision, and whether the code index has moved on since
      this.detectedAt = ko.pureComputed(() => (this.profile() ? ui.when(this.profile().detectedAt) : ''));
      this.scanRevision = ko.pureComputed(() => (this.profile() && this.profile().revision !== null ? 'r' + this.profile().revision : 'Not known'));
      this.staleScan = ko.pureComputed(() => {
        const p = this.profile();
        const w = this.workspace();
        return p && w && p.revision !== null && w.indexedRevision !== null && w.indexedRevision > p.revision
          ? 'The code index is at r' + w.indexedRevision + ', newer than this scan (r' + p.revision + '). Refresh discovery to update the profile.' : '';
      });

      // Who changed each fact, newest first (from the audit log)
      const lastChange = (key) => this.history().find((h) => h.key === key) || null;
      const historyRow = (h) => {
        const fact = facts().find((f) => f.key === h.key);
        return {
          when: ui.when(h.at), who: h.username || 'Unknown user', label: fact ? fact.label : h.key,
          text: h.action === 'reset' ? 'reset to the detected value' : 'set to "' + (h.value || '') + '"'
        };
      };
      this.historyRows = ko.pureComputed(() => this.history().map(historyRow));

      // The fact that is open, and the value being typed for it
      this.openKey = ko.observable('');
      this.editValue = ko.observable('');
      this.filter = ko.observable('all');

      const row = (f) => {
        const o = origin(f);
        const changed = lastChange(f.key);
        const evidence = (f.evidence || []).map((p) => ({ path: p, find: () => this.searchFile(p) }));
        return {
          key: f.key, label: f.label, value: f.value || 'Not found', missing: !f.value, origin: o,
          headId: 'fact-' + f.key.replace(/\W/g, '-'), bodyId: 'factBody-' + f.key.replace(/\W/g, '-'),
          open: ko.pureComputed(() => this.openKey() === f.key),
          toggle: () => this.openFact(this.openKey() === f.key ? '' : f.key),
          confidence: f.confidence === 'NONE' ? 'None: not detected' : CONFIDENCE[f.confidence] || f.confidence,
          detected: f.detectedValue || 'Nothing detected',
          showDetected: f.status === 'corrected' || f.status === 'confirmed',
          changed: changed ? ui.when(changed.at) + ' by ' + (changed.username || 'unknown user') : (f.updatedAt ? ui.when(f.updatedAt) : ''),
          evidence: evidence,
          generation: GENERATION[f.key] || '',
          canEdit: this.canEdit(), edit: this.editValue,
          canConfirm: !!f.detectedValue && f.status !== 'confirmed',
          canReset: f.status === 'confirmed' || f.status === 'corrected',
          changes: this.history().filter((h) => h.key === f.key).slice(0, 5).map(historyRow),
          confirm: () => this.put(f, f.detectedValue, f.label + ' confirmed.'),
          save: () => this.put(f, this.editValue(), f.label + ' corrected.'),
          reset: () => this.reset(f)
        };
      };
      const rows = ko.pureComputed(() => facts().map(row));

      // Filters: every fact, the inferred ones, the ones not found, and the ones people set
      const count = (id) => rows().filter((r) => r.origin.id === id).length;
      this.filters = ko.pureComputed(() => [
        { value: 'all', label: 'All', count: rows().length },
        { value: 'inferred', label: 'Inferred', count: count('inferred') },
        { value: 'detected', label: 'Detected', count: count('detected') },
        { value: 'missing', label: 'Not found', count: count('missing') },
        { value: 'people', label: 'Set by people', count: count('people') }
      ].map((x) => Object.assign(x, {
        text: x.label + ' ' + x.count, pressed: this.filter() === x.value ? 'true' : 'false', pick: () => this.filter(x.value)
      })));

      // Areas with at least one fact (after the filter); an area without facts is left out
      this.groups = ko.pureComputed(() => {
        const shown = rows().filter((r) => this.filter() === 'all' || r.origin.id === this.filter());
        return GROUPS.map((g) => {
          const all = facts().filter((f) => (KEY_GROUP[f.key] || SECTION_GROUP[f.section] || 'conventions') === g.id);
          const list = shown.filter((r) => all.some((f) => f.key === r.key));
          return {
            id: g.id, title: g.title, iconClass: 'factory-nav-icon factory-ico-' + g.icon, headingId: 'group-' + g.id, rows: list,
            summary: all.filter((f) => f.value).length + ' of ' + all.length + ' found',
            note: g.id === 'obdx' && this.profile() ? 'The workspace is set to OBDX ' + this.profile().declaredObdxVersion + '.' : ''
          };
        }).filter((g) => g.rows.length > 0);
      });
      this.filterEmpty = ko.pureComputed(() => this.profile() && facts().length > 0 && this.groups().length === 0);

      // Facts code generation reads that have no value
      this.generationMissing = ko.pureComputed(() => facts().filter((f) => GENERATION[f.key] && !f.value)
        .map((f) => ({ label: f.label, open: () => { this.filter('all'); this.openFact(f.key); } })));

      this.openFact = (key) => {
        const f = facts().find((x) => x.key === key);
        this.editValue(f ? (f.value || '') : '');
        this.openKey(key);
        if (key) {
          setTimeout(() => {
            const head = document.getElementById('fact-' + key.replace(/\W/g, '-'));
            if (head) {
              head.scrollIntoView({ block: 'nearest' });
              head.focus();
            }
          }, 0);
        }
      };

      // Version pack recipes: each part has its reference examples and pin/unpin actions
      this.recipes = ko.observableArray([]);
      this.recipesNote = ko.observable('');
      const showError = (error) => this.errorMessage(error.message);
      const showRecipes = (data) => {
        const id = this.workspaceId();
        const canEdit = this.canEdit();
        this.recipesNote(data.indexedFiles === 0
          ? 'Import the code to find reference examples in it.'
          : 'OBDX ' + data.version + ' pack. Examples are picked from the ' + data.indexedFiles + ' indexed files: customization folders first, Oracle product code last.');
        this.recipes(data.recipes.map((r) => ({
          id: r.id, title: r.title, when: r.when || '', guidance: r.guidance,
          scope: (r.actions.length ? r.actions.join(' / ') : 'create / modify') + (r.layers.length ? ' · ' + r.layers.join(' / ') : ''),
          parts: r.parts.map((p) => {
            const url = 'workspaces/' + id + '/recipes/' + r.id + '/parts/' + p.id + '/examples';
            const newPath = ko.observable('');
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
      };

      const loadHistory = (id) => api.get('workspaces/' + id + '/profile/history')
        .then((list) => { if (id === this.workspaceId()) { this.history(list); this.historyError(''); } })
        .catch((error) => { if (id === this.workspaceId()) { this.historyError(error.message); } });
      const show = (profile) => {
        this.profile(profile);
        this.errorMessage('');
        this.emptyMessage('');
        const open = facts().find((f) => f.key === this.openKey());
        this.editValue(open ? (open.value || '') : '');
      };
      const load = (id) => {
        this.profile(null);
        this.history([]);
        this.historyError('');
        this.recipes([]);
        this.recipesNote('');
        this.errorMessage('');
        this.emptyMessage('');
        this.openKey('');
        this.filter('all');
        this.workspace(null);
        if (!id) {
          return;
        }
        api.get('workspaces/' + id).then((w) => { if (id === this.workspaceId()) { this.workspace(w); } }).catch(() => null);
        api.get(base())
          .then((profile) => { if (id === this.workspaceId()) { show(profile); } })
          .catch((error) => (error.status === 404 ? this.emptyMessage(error.message) : showError(error)));
        loadHistory(id);
        api.get('workspaces/' + id + '/recipes')
          .then((data) => { if (id === this.workspaceId()) { showRecipes(data); } })
          .catch(showError);
      };

      this.detect = () => {
        const id = this.workspaceId();
        this.busy(true);
        api.post(base() + '/refresh').then((profile) => {
          show(profile);
          api.get('workspaces/' + id).then((w) => { if (id === this.workspaceId()) { this.workspace(w); } }).catch(() => null);
          toast.success('Discovery refreshed.');
        }).catch(failed).finally(() => this.busy(false));
      };
      const changed = (done) => (profile) => {
        show(profile);
        loadHistory(this.workspaceId());
        toast.success(done);
      };
      this.put = (f, value, done) => api.put(base() + '/facts/' + encodeURIComponent(f.key), { value: value })
        .then(changed(done)).catch(failed);
      this.reset = (f) => api.del(base() + '/facts/' + encodeURIComponent(f.key))
        .then(changed(f.label + ' reset to the detected value.')).catch(failed);
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
