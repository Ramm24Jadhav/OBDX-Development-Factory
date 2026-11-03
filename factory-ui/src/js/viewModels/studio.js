/*
 * Design Studio: the workspace from a BRD to approved screens, read top to bottom: a header (the BRD and its five
 * stages); the Screens panel (one requirement at a time, its screens as cards in flow order, with a dropdown, arrows and
 * dots to move between requirements); the selected screen (name, step and status, the switcher, More, Approve,
 * Expand), then Review (the BRD-only preview as a phone, tablet or desktop, and "Ready to approve?": acceptance
 * criteria, open decisions, values to confirm and compatibility, Refine with AI, Compare versions; the panel folds to
 * a rail) or Edit. Expand gives the screen the page. Review is the default mode; Edit draws the Visual Designer
 * (viewModels/designer, embedded) for the selected screen in its place, one editor and one preview at a time, and every
 * way out of Edit asks first about unsaved changes. The Studio loads the component catalog and the workspace's UI
 * target once and hands them to the editor (host.catalog, host.target).
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/previewFrame', '../services/pageRequests', '../services/toast', '../services/dialog', '../services/designActions',
        '../services/designDiff', '../services/preferences', './designer', 'ojs/ojmodule-element-utils', 'ojs/ojknockout', 'ojs/ojmodule-element'],
  function (ko, accUtils, api, workspaceSelection, session, ui, PreviewFrame, pageRequests, toast, dialog, designActions, designDiff,
            preferences, DesignerViewModel, moduleUtils) {
    const POLL_MS = 4000;
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const DESIGN_WORDS = { DRAFT: 'Draft', IN_REVIEW: 'In review', APPROVED: 'Approved' };
    const STAGE_WORDS = { initiate: 'Enter details', review: 'Review', confirm: 'Confirmation', inquiry: 'List or details' };
    const ORIGIN_WORDS = { GENERATED: 'generated from the spec', EDITED: 'edited', AI: 'changed by the AI', BLANK: 'blank', IMPORTED: 'imported', RESTORED: 'restored' };
    // The page each preview size shows, in CSS pixels; phone and tablet use the preview's own narrow layouts
    const DEVICES = { phone: { width: 390, height: 720, label: 'Phone' }, tablet: { width: 820, height: 1000, label: 'Tablet' }, desktop: { width: 1280, height: 800, label: 'Desktop' } };
    // Never smaller than this, so the text stays readable; a wider page scrolls inside the preview instead
    const MIN_SCALE = 0.8;
    const storageKey = (workspaceId) => 'factory.studio.requirement.' + workspaceId;
    const remember = (key, value) => { try { window.localStorage.setItem(key, value); } catch (e) { /* private window */ } };
    const recall = (key) => { try { return window.localStorage.getItem(key); } catch (e) { return null; } };
    const fieldsOf = (model) => (model ? model.sections.reduce((all, s) => all.concat(s.components), []) : []);
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const criterionKey = (c) => (c.id && c.id.trim() ? c.id : String(c.description));
    // The "BRD" of the screens that have none
    const NONE = 'none';
    /** What changed from one version of a screen to another, in plain words (the same words as the editor's History). */
    const differences = (from, to) => designDiff(from, to).map((d) => ({ kind: d.kind, text: d.text, css: 'factory-studio-diff-' + d.kind.toLowerCase() }));

    function StudioViewModel() {
      const self = this;
      this.workspaceId = workspaceSelection.selectedId;
      this.canDesign = ko.pureComputed(() => session.can(this.workspaceId(), 'EDIT_DESIGNS'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.canCode = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.canUpload = ko.pureComputed(() => session.can(this.workspaceId(), 'EDIT_REQUIREMENTS'));
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(error.message);
      const actionError = (error) => toast.error(error.message);
      this.loading = ko.observable(false);

      // --- the BRD ---

      this.requirements = ko.observableArray([]);
      this.requirementId = ko.observable(null);
      // Blank and imported screens, and screens whose BRD is gone: the Screens panel's "Without a BRD" requirement, with
      // every BRD (requirementId NONE only when the workspace has no BRD at all)
      this.looseDesigns = ko.observableArray([]);
      this.requirementOptions = ko.pureComputed(() => this.requirements().map((r) => ({
        value: r.id, label: r.title, description: (r.fileName || 'Text request') + ' · ' + ui.status(r.status).text
      })));
      this.summary = ko.pureComputed(() => this.requirements().find((r) => r.id === this.requirementId()) || null);
      this.flow = ko.observable(null);
      this.changes = ko.observableArray([]);
      // The component catalog (type → label) and each workspace's UI target, loaded once for the Studio and its editor
      const catalog = {};
      // The catalog's types once loaded (the readiness panel's compatibility check needs their JET elements)
      const catalogList = ko.observable(null);
      this.obdxVersion = ko.pureComputed(() => workspaceSelection.selectedVersion() || '');
      let catalogLoad = null;
      const catalogTypes = () => {
        if (!catalogLoad) {
          catalogLoad = api.get('design/catalog').catch((error) => { catalogLoad = null; throw error; });
        }
        return catalogLoad;
      };
      const targets = {};
      const targetOf = (workspaceId) => {
        if (!targets[workspaceId]) {
          targets[workspaceId] = api.get('workspaces/' + workspaceId + '/target').catch((error) => { delete targets[workspaceId]; throw error; });
        }
        return targets[workspaceId];
      };

      // --- the screens, by id, and the requirements they are grouped by (the Screens panel's slides) ---

      this.screens = ko.pureComputed(() => (this.flow() ? this.flow().screens : []));
      // The BRD's own screens (in the server's flow order), without the workspace's screens that have no BRD
      const brdScreens = ko.pureComputed(() => this.screens().filter((s) => !s.loose));
      const screenById = (id) => this.screens().find((s) => s.id === id) || null;
      const criterionByKey = (key) => (this.flow() ? this.flow().criteria.find((c) => criterionKey(c) === key) : null) || { id: '', description: key, requirements: [] };

      this.groupKey = ko.observable(null);
      // One slide per functional requirement of the spec, in its order; then the screens no requirement names, and the
      // workspace's screens without a BRD. A spec without requirements has one slide with all its screens.
      const allGroups = ko.pureComputed(() => {
        const flow = this.flow();
        if (!flow) {
          return [];
        }
        const groups = flow.requirements.map((r, i) => ({
          key: 'fr' + i, id: r.id || '', title: r.title || r.description || 'Requirement ' + (i + 1), description: r.description,
          priority: r.priority, screens: r.screens, screenNames: r.screenNames, rules: r.rules, criteria: r.criteria
        }));
        const own = brdScreens().map((s) => s.id);
        if (groups.length === 0 && own.length > 0) {
          groups.push({ key: 'all', id: '', title: 'All screens', description: flow.title, priority: null, screens: own, rules: flow.rules, criteria: flow.criteria, all: true });
        } else if (flow.others.length > 0) {
          groups.push({ key: 'others', id: '', title: 'Other screens', description: 'Screens no functional requirement names, for example renamed ones.', priority: null, screens: flow.others, rules: [], criteria: [] });
        }
        const loose = this.screens().filter((s) => s.loose).map((s) => s.id);
        if (loose.length > 0) {
          groups.push({ key: 'loose', id: '', title: 'Without a BRD', description: 'Blank and imported screens, and screens whose BRD was deleted.', priority: null, screens: loose, rules: [], criteria: [], loose: true });
        }
        return groups;
      });
      this.group = ko.pureComputed(() => allGroups().find((g) => g.key === this.groupKey()) || allGroups()[0] || null);
      // The selected screen's group is a group of screens without a BRD: no stages, approved one at a time
      this.loose = ko.pureComputed(() => this.requirementId() === NONE || (!!this.group() && !!this.group().loose));
      const groupLabel = (g) => (g.loose ? 'Without a BRD' : g.id ? g.id + ' · ' + g.title : g.title);
      this.groupOptions = ko.pureComputed(() => allGroups().map((g) => ({ value: g.key, label: groupLabel(g) })));
      this.manyGroups = ko.pureComputed(() => allGroups().length > 1);
      this.groupIndex = ko.pureComputed(() => Math.max(0, allGroups().findIndex((g) => g.key === (this.group() || {}).key)));
      this.groupPosition = ko.pureComputed(() => 'Requirement ' + (this.groupIndex() + 1) + ' of ' + allGroups().length);
      this.hasPreviousGroup = ko.pureComputed(() => this.groupIndex() > 0);
      this.hasNextGroup = ko.pureComputed(() => this.groupIndex() < allGroups().length - 1);
      this.groupDots = ko.pureComputed(() => allGroups().map((g, i) => ({
        label: 'Show ' + (g.id || g.title),
        css: 'factory-studio-dot' + (i === this.groupIndex() ? ' is-current' : ''),
        current: i === this.groupIndex() ? 'true' : 'false',
        pick: () => this.pickGroup(g.key)
      })));

      // What is open for a group: criteria no screen covers, and questions the spec leaves unanswered
      const uncoveredOf = (g) => {
        const flow = this.flow();
        if (!flow || !g) {
          return [];
        }
        const keys = g.all ? flow.uncovered : g.criteria.map(criterionKey).filter((k) => flow.uncovered.indexOf(k) >= 0);
        return keys.map(criterionByKey);
      };
      const questionView = (q) => {
        const names = q.screens.map((id) => (screenById(id) || {}).name).filter(Boolean);
        const scope = q.requirements.concat(names);
        const detail = [q.reason, q.suggestedAnswer ? 'Suggested: ' + q.suggestedAnswer : '',
          q.options && q.options.length ? 'Options: ' + q.options.join(', ') : '', q.reference ? 'BRD: ' + q.reference : '']
          .filter(Boolean).join(' · ');
        return { question: q.question, detail: detail, scope: scope.length ? scope.join(' · ') : 'Whole BRD' };
      };

      // --- the selected group's screens, as cards in flow order ---

      this.selectedScreenId = ko.observable(null);
      // One card per screen, kept while the screen is shown, so the row is not drawn again after each change
      const items = {};
      const itemFor = (id) => {
        if (!items[id]) {
          const approved = ko.observable(false);
          items[id] = {
            id: id, number: ko.observable(''), name: ko.observable(''), meta: ko.observable(''), warn: ko.observable(''), approved: approved,
            css: ko.pureComputed(() => 'factory-studio-node' + (this.selectedScreenId() === id ? ' is-selected' : '') + (approved() ? ' is-approved' : '')),
            pressed: ko.pureComputed(() => (this.selectedScreenId() === id ? 'true' : 'false')),
            current: ko.pureComputed(() => (this.selectedScreenId() === id ? 'true' : null)),
            pick: () => this.selectScreen(id)
          };
        }
        return items[id];
      };
      this.flowScreens = ko.observableArray([]);
      ko.computed(() => {
        const g = this.group();
        const flow = this.flow();
        const own = brdScreens();
        const list = g ? g.screens.map(screenById).filter(Boolean) : [];
        const next = list.map((s) => {
          const item = itemFor(s.id);
          const questions = flow ? flow.questions.filter((q) => q.screens.indexOf(s.id) >= 0).length : 0;
          const at = own.indexOf(s);
          // Numbered through the whole BRD, so a screen keeps its number in every requirement
          item.number(s.loose ? '–' : String(at + 1));
          item.name(s.name);
          item.meta((s.loose ? (ORIGIN_WORDS[s.origin] ? s.origin.charAt(0) + s.origin.slice(1).toLowerCase() : 'Blank') : (STAGE_WORDS[s.stage] || 'Screen')) + ' · ' + (DESIGN_WORDS[s.status] || ui.status(s.status).text));
          const open = questions + (s.decisions || []).length;
          item.warn([(s.unconfirmed || []).length ? (s.unconfirmed || []).length + ' to confirm' : '', open ? plural(open, 'decision', 'decisions') : '']
            .filter(Boolean).map((w) => ' · ' + w).join(''));
          item.approved(s.status === 'APPROVED');
          return item;
        });
        const current = this.flowScreens.peek();
        if (next.length !== current.length || next.some((item, i) => item !== current[i])) {
          this.flowScreens(next);
        }
      });
      // Up to four cards share the row's width; from five they keep 232 px and the row scrolls
      this.cardsCss = ko.pureComputed(() => 'factory-studio-nodes' + (this.flowScreens().length > 4 ? ' is-scrolling' : ''));
      this.groupUnapproved = ko.pureComputed(() => this.flowScreens().filter((s) => !s.approved()).map((s) => s.id));
      this.groupCount = ko.pureComputed(() => {
        const list = this.flowScreens();
        const approved = list.filter((s) => s.approved()).length;
        return list.length === 0 ? '' : approved + ' of ' + plural(list.length, 'screen', 'screens') + ' approved' + (list.length > 4 ? ' · scroll for more →' : '');
      });
      this.missingScreens = ko.pureComputed(() => {
        const g = this.group();
        return g && g.screenNames && g.screens.length === 0 && g.screenNames.length > 0 ? g.screenNames.join(', ') : '';
      });
      // Arrow keys, Home and End move through the cards; the screen under the focus is shown
      this.nodeKey = (event) => {
        const list = this.flowScreens();
        const at = list.findIndex((s) => s.id === this.selectedScreenId());
        const moves = { ArrowDown: at + 1, ArrowRight: at + 1, ArrowUp: at - 1, ArrowLeft: at - 1, Home: 0, End: list.length - 1 };
        if (!(event.key in moves) || list.length === 0) {
          return true;
        }
        event.preventDefault();
        event.stopPropagation();
        const to = list[Math.max(0, Math.min(list.length - 1, moves[event.key]))];
        this.selectScreen(to.id).then(() => {
          const node = document.querySelector('[data-studio-node="' + to.id + '"]');
          if (node) {
            node.focus();
            node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        });
        return false;
      };
      // ← and → on the Screens panel (outside the cards) move to the previous or next requirement
      this.carouselKey = (event) => {
        if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || (event.target && event.target.closest && event.target.closest('fx-select, input, [data-studio-node]'))) {
          return true;
        }
        event.preventDefault();
        if (event.key === 'ArrowLeft') {
          this.previousGroup();
        } else {
          this.nextGroup();
        }
        return false;
      };

      // --- the selected screen ---

      this.screen = ko.pureComputed(() => screenById(this.selectedScreenId()));
      this.screenStatus = ko.pureComputed(() => (this.screen() ? ui.status(this.screen().status, DESIGN_WORDS[this.screen().status]) : null));
      // "Requirement FR-001 · Step 1 of 3 · Enter details · Version 8"
      this.screenMeta = ko.pureComputed(() => {
        const s = this.screen();
        const g = this.group();
        if (!s) {
          return '';
        }
        const step = g ? g.screens.indexOf(s.id) : -1;
        const where = s.loose ? 'Without a BRD' : g && g.id ? 'Requirement ' + g.id : g ? g.title : '';
        return [where, step >= 0 && g.screens.length > 1 ? 'Step ' + (step + 1) + ' of ' + g.screens.length : '',
          s.loose ? '' : (STAGE_WORDS[s.stage] || 'Screen'), 'Version ' + s.currentVersion,
          s.status === 'APPROVED' && s.approvedBy ? 'approved by ' + s.approvedBy : ''].filter(Boolean).join(' · ');
      });
      this.screenEditable = ko.pureComputed(() => !!this.screen() && this.screen().status !== 'APPROVED' && this.canDesign());
      this.screenLocked = ko.pureComputed(() => !!this.screen() && this.screen().status === 'APPROVED');
      this.lockedText = ko.pureComputed(() => (this.screenLocked() ? 'Approved and locked. Reopen it to change it.'
        : 'You can view this screen. Changing screens needs the Analyst or Developer role.'));
      this.screenNeedsSteps = ko.pureComputed(() => !!this.screen() && this.screen().needsSteps && this.screenEditable());
      this.screenUnconfirmed = ko.pureComputed(() => (this.screen() ? this.screen().unconfirmed || [] : []));
      this.screenQuestions = ko.pureComputed(() => (this.screen() && this.flow()
        ? this.flow().questions.filter((q) => q.screens.indexOf(this.screen().id) >= 0).map(questionView)
          .concat((this.screen().decisions || []).map((text) => ({ question: text, detail: '', scope: '' }))) : []));
      // The ‹ 1 / 5 › switcher goes through the whole BRD (or through the screens without a BRD)
      const switchList = ko.pureComputed(() => {
        const s = this.screen();
        return s && s.loose ? this.screens().filter((x) => x.loose) : brdScreens();
      });
      this.screenIndex = ko.pureComputed(() => switchList().findIndex((s) => s.id === this.selectedScreenId()));
      this.hasPrevious = ko.pureComputed(() => this.screenIndex() > 0);
      this.hasNext = ko.pureComputed(() => this.screenIndex() >= 0 && this.screenIndex() < switchList().length - 1);
      this.position = ko.pureComputed(() => (this.screenIndex() < 0 ? '' : (this.screenIndex() + 1) + ' / ' + switchList().length));
      this.positionLabel = ko.pureComputed(() => (this.screenIndex() < 0 ? 'Screens' : 'Screen ' + (this.screenIndex() + 1) + ' of ' + switchList().length));
      /** Selects a screen and the requirement it is in (the switcher can cross requirements). */
      const showScreen = (id) => guard().then((ok) => {
        if (!ok) {
          return false;
        }
        const g = this.group();
        if (!g || g.screens.indexOf(id) < 0) {
          const other = allGroups().find((x) => x.screens.indexOf(id) >= 0);
          if (other) {
            this.groupKey(other.key);
          }
        }
        this.selectedScreenId(id);
        return true;
      });
      this.previousScreen = () => { const i = this.screenIndex(); if (i > 0) { showScreen(switchList()[i - 1].id); } };
      this.nextScreen = () => { const i = this.screenIndex(); if (i >= 0 && i < switchList().length - 1) { showScreen(switchList()[i + 1].id); } };
      this.showScreen = showScreen;

      // Review | Edit: one tab list; arrow keys, Home and End move between the two
      this.modeKey = (event) => {
        const to = { ArrowRight: 'edit', ArrowLeft: 'review', Home: 'review', End: 'edit' }[event.key];
        if (!to) {
          return true;
        }
        event.preventDefault();
        Promise.resolve(to === 'edit' ? this.showEdit() : this.showReview()).then(() => {
          const button = document.getElementById('studioMode-' + this.mode());
          if (button) {
            button.focus();
          }
        });
        return false;
      };

      // The readiness panel shows its checks, or the version compare ("Compare versions")
      this.readinessView = ko.observable('checks');
      this.showCompare = () => this.readinessView('compare');
      this.showChecksList = () => this.readinessView('checks');
      // Refine with the AI: a plain-language change to the whole screen
      this.instruction = ko.observable('');
      this.refining = ko.observable(false);
      this.refine = () => {
        const s = this.screen();
        const text = (this.instruction() || '').trim();
        if (!s || !text) {
          toast.info('Describe the change first, for example "make remarks optional".');
          return;
        }
        this.refining(true);
        api.post('designs/' + encodeURIComponent(s.id) + '/ai-change', { instruction: text, targetId: null })
          .then(() => { this.instruction(''); return reloadFlow(); })
          .then(() => toast.success('The screen was changed. Check the preview.'))
          .catch(actionError)
          .finally(() => this.refining(false));
      };

      // --- versions: compare two, preview an earlier one, go back to the generated one ---

      this.versions = ko.observableArray([]);
      let versionsOf = null;
      const loadVersions = () => {
        const s = this.screen();
        if (!s) {
          this.versions([]);
          return;
        }
        const wanted = s.id + '@' + s.currentVersion;
        if (versionsOf === wanted) {
          return;
        }
        versionsOf = wanted;
        designActions.detail(s.id).then((detail) => {
          if (versionsOf === wanted) {
            this.versions(detail.versions || []);
          }
        }).catch(() => { versionsOf = null; });
      };
      this.screen.subscribe(loadVersions);
      const versionLabel = (v) => 'version ' + v.version + ' (' + (ORIGIN_WORDS[v.origin] || 'saved') + ')';
      this.versionOptions = ko.pureComputed(() => this.versions().slice().sort((a, b) => b.version - a.version).map((v) => ({
        value: v.version, label: 'Version ' + v.version, description: (ORIGIN_WORDS[v.origin] || 'saved') + (v.note ? ' · ' + v.note : '')
      })));
      // Regenerating from the approved spec gives the screen as first generated, so it goes back to that version
      this.generatedVersion = ko.pureComputed(() => {
        const generated = this.versions().filter((v) => v.origin === 'GENERATED').map((v) => v.version);
        return generated.length ? Math.max.apply(null, generated) : null;
      });
      // The current version is the generated one, or restores it (a regenerated screen)
      this.asGenerated = ko.pureComputed(() => {
        const g = this.generatedVersion();
        const s = this.screen();
        const current = s ? this.versions().find((v) => v.version === s.currentVersion) : null;
        return !!g && !!s && (g === s.currentVersion || (!!current && current.origin === 'RESTORED' && current.note === 'Restored version ' + g));
      });
      this.regenerateText = ko.pureComputed(() => {
        const g = this.generatedVersion();
        const s = this.screen();
        if (!g) {
          return 'This screen was not generated from the spec, so there is nothing to regenerate it from.';
        }
        return this.asGenerated() ? 'The screen is as generated from the approved spec (version ' + g + ').'
          : 'Makes the screen again from the approved spec, as version ' + g + ' had it. Later changes stay in the version history.';
      });
      this.regenerate = () => {
        const s = this.screen();
        const g = this.generatedVersion();
        return dialog.confirm({
          title: 'Regenerate this screen?',
          message: '"' + s.name + '" is made again from the approved spec and saved as a new version. Changes since version ' + g + ' stay in its history.',
          confirmLabel: 'Regenerate'
        }).then((ok) => ok && api.post('designs/' + encodeURIComponent(s.id) + '/restore', { version: g })
          .then(() => reloadFlow())
          .then(() => toast.success('Regenerated as version ' + (screenById(s.id) ? screenById(s.id).currentVersion : '') + '.'))
          .catch(actionError));
      };

      this.compareFrom = ko.observable(null);
      this.compareTo = ko.observable(null);
      this.versions.subscribe((list) => {
        const s = this.screen();
        const numbers = list.map((v) => v.version).sort((a, b) => a - b);
        this.compareTo(s ? s.currentVersion : numbers[numbers.length - 1] || null);
        this.compareFrom(numbers.length > 1 ? numbers[numbers.length - 2] : null);
      });
      const modelOf = (id, version) => {
        const s = screenById(id);
        return s && s.currentVersion === version ? Promise.resolve(s.model) : designActions.versionModel(id, version);
      };
      this.differences = ko.observableArray([]);
      ko.computed(() => {
        const s = this.screen();
        const from = Number(this.compareFrom());
        const to = Number(this.compareTo());
        if (!s || !from || !to || this.readinessView() !== 'compare') {
          return;
        }
        if (from === to) {
          this.differences([{ kind: 'Same', text: 'Pick two different versions.', css: 'factory-studio-diff-same' }]);
          return;
        }
        Promise.all([modelOf(s.id, from), modelOf(s.id, to)]).then(([a, b]) => {
          if (this.screen() === s && Number(this.compareFrom()) === from && Number(this.compareTo()) === to) {
            this.differences(differences(a, b));
          }
        }).catch(actionError);
      });
      // The preview can show an earlier version for a moment; any other screen or change shows the current one again
      this.shownVersion = ko.observable(null);
      this.previewFromLabel = ko.pureComputed(() => 'Preview version ' + (this.compareFrom() || ''));
      this.previewFrom = () => {
        const s = this.screen();
        const version = Number(this.compareFrom());
        const info = this.versions().find((v) => v.version === version);
        modelOf(s.id, version).then((model) => {
          if (this.screen() === s) {
            this.shownVersion({ id: s.id, version: version, model: model, label: info ? versionLabel(info) : 'version ' + version });
            sendAll();
          }
        }).catch(actionError);
      };
      this.showCurrent = () => { this.shownVersion(null); sendAll(); };

      // --- Ready to approve? Four checks of the selected screen, from the server's data, one open at a time ---

      // The screen's elements against the workspace's OBDX version (as the editor's compatibility marks)
      const compat = ko.observable(null);
      let compatFor = null;
      ko.computed(() => {
        const s = this.screen();
        const types = catalogList();
        const ws = this.workspaceId();
        if (!s || !s.model || !types || !ws) {
          return;
        }
        const names = [];
        const jet = {};
        types.forEach((t) => { const m = t.jetComponent ? /^[a-z][a-z0-9-]*/.exec(t.jetComponent) : null; jet[t.type] = m ? m[0] : null; });
        fieldsOf(s.model).forEach((c) => {
          const e = c.type === 'component' ? c.component : jet[c.type];
          if (e && names.indexOf(e) < 0) {
            names.push(e);
          }
        });
        if (s.model.actions.length) {
          names.push('oj-button');
        }
        const key = ws + '|' + s.id + '@' + s.currentVersion;
        if (key === compatFor) {
          return;
        }
        compatFor = key;
        compat(null);
        if (names.length === 0) {
          compat({ version: '', elements: [] });
          return;
        }
        api.get('workspaces/' + encodeURIComponent(ws) + '/design-compatibility?' + names.sort().map((n) => 'element=' + encodeURIComponent(n)).join('&'))
          .then((report) => { if (compatFor === key) { compat({ version: report.obdxVersion, elements: report.elements }); } })
          .catch(() => { if (compatFor === key) { compatFor = null; } });
      });
      // The spec's screens (their fields): a field of the requirement missing from the screen is an open check, the same
      // rule as the editor's Checks
      const specScreens = ko.observable([]);
      const norm = (text) => (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const missingFields = ko.pureComputed(() => {
        const s = this.screen();
        const spec = s && !s.loose && s.model ? specScreens().find((x) => norm(x.name) === norm(s.name) || norm(x.name) === norm(s.model.name)) : null;
        if (!spec) {
          return null;
        }
        const components = fieldsOf(s.model);
        return (spec.fields || []).filter((f) => !components.some((c) => norm(c.name) === norm(f.name) || (f.label && norm(c.label) === norm(f.label))));
      });
      this.openCheck = ko.observable('criteria');
      // "Add it" asks the AI (the Refine box) for what a criterion needs; "Resolve" opens the spec; "Confirm" opens the field
      const askFor = (text) => {
        this.instruction(text);
        window.setTimeout(() => { const box = document.querySelector('#studioRefine input'); if (box) { box.focus(); } }, 0);
      };
      this.checks = ko.pureComputed(() => {
        const s = this.screen();
        if (!s) {
          return [];
        }
        const g = this.group();
        const covered = (s.criteria || []).map((k) => criterionByKey(k).id || 'a criterion');
        const missing = s.loose ? [] : uncoveredOf(g);
        const questions = this.screenQuestions();
        const values = this.screenUnconfirmed();
        const report = compat();
        const unsupported = report ? report.elements.filter((e) => e.status === 'UNSUPPORTED') : [];
        const verified = report ? report.elements.filter((e) => e.status === 'VERIFIED').length : 0;
        const unverified = report ? report.elements.filter((e) => e.status === 'UNVERIFIED').length : 0;
        const fields = missingFields();
        const list = [
          { key: 'fields', title: 'Fields from the requirement', ok: !fields || fields.length === 0,
            count: !fields ? 'Not compared' : fields.length ? fields.length + ' missing' : 'All on the screen',
            items: !fields ? [{ text: s.loose ? 'A screen without a BRD has no fields to compare.' : 'The spec has no screen with this name, so its fields cannot be compared.', action: '' }]
              : fields.length ? fields.map((f) => ({ text: '"' + (f.label || f.name) + '" is not on the screen', action: this.screenEditable() && !this.narrow() ? 'Open in Edit' : '',
                run: () => inEditor((vm) => vm.showChecks()) }))
                : [{ text: 'Every field of the requirement is on the screen.', action: '' }] },
          { key: 'criteria', title: 'Acceptance criteria', ok: missing.length === 0,
            count: s.loose ? 'No BRD' : missing.length ? missing.length + ' missing' : covered.length ? 'All covered' : 'None linked',
            items: (covered.length ? [{ text: (covered.length === 1 ? covered[0] + ' is' : covered.slice(0, -1).join(', ') + ' and ' + covered[covered.length - 1] + ' are') + ' on this screen', action: '' }]
              : [{ text: s.loose ? 'A screen without a BRD has no acceptance criteria.' : 'No criterion of the spec is linked to this screen\'s requirement.', action: '' }])
              .concat(missing.map((c) => ({ text: (c.id || 'A criterion') + ' is not on any screen yet', action: this.screenEditable() ? 'Add it' : '',
                run: () => askFor('Add what ' + (c.id || 'this criterion') + ' needs: ' + c.description) }))) },
          { key: 'decisions', title: 'Open decisions', ok: questions.length === 0, count: questions.length ? questions.length + ' open' : 'None',
            items: questions.length ? questions.map((q) => ({ text: q.question, detail: q.detail, action: this.summary() ? 'Resolve' : '', run: this.openSpec }))
              : [{ text: 'Nothing the BRD leaves open for this screen.', action: '' }] },
          { key: 'values', title: 'Values to confirm', ok: values.length === 0, count: values.length ? plural(values.length, 'field', 'fields') : 'None',
            items: values.length ? values.map((v) => ({ text: v, action: this.screenEditable() && !this.narrow() ? 'Confirm' : '', run: () => inEditor((vm) => vm.selectByText(v)) }))
              : [{ text: 'Every choice and table has its values from the BRD.', action: '' }] },
          { key: 'compat', title: 'OBDX ' + (report && report.version ? report.version : this.obdxVersion()) + ' compatibility', ok: unsupported.length === 0,
            count: !report ? 'Checking…' : unsupported.length ? unsupported.length + ' unsupported' : verified + ' verified',
            items: !report ? [{ text: 'Checking the components against the version pack…', action: '' }]
              : unsupported.map((e) => ({ text: e.element + ': ' + e.evidence, action: this.screenEditable() && !this.narrow() ? 'Open in Edit' : '', run: () => inEditor((vm) => vm.showChecks()) }))
                .concat(unsupported.length ? [] : [{ text: 'No unsupported components' + (unverified ? ' (' + unverified + ' unverified: the code shows no use of them either way)' : ''), action: '' }]) }
        ];
        return list.map((c) => Object.assign(c, {
          id: 'studioCheck-' + c.key,
          open: ko.pureComputed(() => this.openCheck() === c.key),
          expanded: ko.pureComputed(() => (this.openCheck() === c.key ? 'true' : 'false')),
          iconCss: 'factory-studio-check-icon' + (c.ok ? ' is-ok' : ' is-warn'),
          countCss: 'factory-studio-check-count' + (c.ok ? ' is-ok' : ' is-warn'),
          toggle: () => this.openCheck(this.openCheck() === c.key ? null : c.key),
          items: c.items.map((it) => Object.assign({ detail: '', run: () => {} }, it))
        }));
      });
      this.checksOpen = ko.pureComputed(() => this.checks().filter((c) => !c.ok).length);
      this.checksSummary = ko.pureComputed(() => (this.checksOpen() === 0 ? 'All checks pass'
        : this.checksOpen() + ' of ' + this.checks().length + ' checks need attention'));
      this.checksRailLabel = ko.pureComputed(() => (this.checksOpen() === 0 ? 'All checks pass' : plural(this.checksOpen(), 'check needs', 'checks need') + ' attention'));

      // --- Review or Edit: Edit draws the designer (viewModels/designer, embedded) for the selected screen ---

      this.mode = ko.observable('review');
      this.editing = ko.pureComputed(() => this.mode() === 'edit');
      // Phones get Review only: the editor needs a wider screen
      const phoneQuery = window.matchMedia('(max-width: 767px)');
      this.narrow = ko.observable(phoneQuery.matches);
      const onNarrow = (event) => this.narrow(event.matches);
      // The editor while Edit is open; its preview is the only one then (Review's frame is not drawn). One designer view
      // model serves every Edit of this page, emptied when Edit closes, so closed editors leave nothing behind.
      this.editor = ko.observable(null);
      let editorVm = null;
      // A fresh view for every oj-module: crossing 768 px draws the module again, and view nodes are not reused
      this.editorConfig = ko.pureComputed(() => {
        const vm = this.editor();
        return vm && !this.narrow() ? moduleUtils.createView({ viewPath: 'views/designer.html' }).then((view) => ({ view: view, viewModel: vm })) : { view: [] };
      });
      // --- the page's layout: Expand (Review and Edit each remember theirs), the readiness panel's fold, the Screens
      // panel hidden; kept per person (services/preferences) ---
      const smallQuery = window.matchMedia('(max-width: 1365px)');
      const small = ko.observable(smallQuery.matches);
      const onSmall = (event) => small(event.matches);
      // Docked editor panels drop to rails at 1024 px and below
      const tabletQuery = window.matchMedia('(max-width: 1024px)');
      this.tabletWide = ko.observable(tabletQuery.matches);
      const onTablet = (event) => this.tabletWide(event.matches);
      this.expanded = ko.pureComputed(() => !this.narrow() && (this.editing() ? preferences.studioEditExpanded() : preferences.studioExpanded()));
      this.toggleExpand = () => (this.editing() ? preferences.studioEditExpanded(!preferences.studioEditExpanded()) : preferences.studioExpanded(!preferences.studioExpanded()));
      this.expandLabel = ko.pureComputed(() => (this.editing() ? (this.expanded() ? 'Show the screens' : 'Expand the editor') : (this.expanded() ? 'Exit full view' : 'Expand')));
      this.expandIcon = ko.pureComputed(() => (this.expanded() ? '⤡' : '⤢'));
      this.screensHidden = ko.pureComputed(() => preferences.studioScreensHidden());
      this.hideScreens = () => preferences.studioScreensHidden(true);
      this.showScreens = () => preferences.studioScreensHidden(false);
      this.showScreensPanel = ko.pureComputed(() => !this.expanded() && !this.screensHidden());
      // The readiness panel: open or folded to a rail; unset, it follows the window (folded below 1366 px)
      this.readinessFolded = ko.pureComputed(() => (preferences.studioReadiness() ? preferences.studioReadiness() === 'folded' : small()));
      this.foldReadiness = () => preferences.studioReadiness('folded');
      this.unfoldReadiness = () => preferences.studioReadiness('open');
      this.reviewBodyCss = ko.pureComputed(() => 'factory-studio-review' + (this.expanded() ? ' is-expanded' : this.readinessFolded() ? ' is-folded' : ''));
      // The editor's panels: rails with floating panels when expanded or on a tablet, docked columns otherwise
      this.editorRails = ko.pureComputed(() => this.expanded() || this.tabletWide());
      // On phones the readiness panel opens below the summary line
      this.phoneReadiness = ko.observable(false);
      this.togglePhoneReadiness = () => this.phoneReadiness(!this.phoneReadiness());
      /** Asks before the editor's unsaved changes are lost (another screen, Review, another BRD); true when they may go. */
      const guard = () => (this.editor() ? this.editor().confirmDiscard() : Promise.resolve(true));
      this.selectScreen = (id) => guard().then((ok) => {
        if (ok && id && id !== this.selectedScreenId()) {
          this.selectedScreenId(id);
        }
        return ok;
      });
      const host = {
        select: (id) => this.selectScreen(id),
        changed: () => reloadFlow().catch(actionError),
        deleted: () => { closeEditor(); Promise.all([loadRequirements(), reloadFlow()]).catch(actionError); },
        leave: () => this.showReview(),
        element: () => document.getElementById('studioEditor'),
        // The Studio's header (Save changes, the switcher) counts as inside the editor for Ctrl+Z
        contains: (node) => { const head = document.getElementById('studioScreenHead'); return !!head && head.contains(node); },
        // true: the side panels are rails that open floating panels (Expand, or a tablet); false: docked columns
        rails: () => this.editorRails(),
        catalog: catalogTypes,
        target: targetOf,
        // The editor's screen order is the server's flow order (each review and confirmation after its initiate screen)
        order: () => this.screens().map((s) => s.id)
      };
      /** Runs fn with the editor once it shows the selected screen (Edit is opened first). */
      const inEditor = (fn) => {
        this.showEdit();
        const vm = this.editor();
        // On a phone Edit has no editor to run it in
        if (!vm || this.narrow()) {
          return;
        }
        const ready = () => vm.detail() && vm.detail().id === this.selectedScreenId();
        if (ready()) {
          fn(vm);
          return;
        }
        // Waits for the screen; gives up when it cannot be opened, Edit closes, another screen is chosen or the page narrows
        const watches = [];
        const stop = () => watches.splice(0).forEach((w) => w.dispose());
        watches.push(vm.detail.subscribe(() => { if (ready()) { stop(); window.setTimeout(() => fn(vm), 0); } }));
        watches.push(vm.loadFailures.subscribe(stop));
        watches.push(this.editor.subscribe((now) => { if (now !== vm) { stop(); } }));
        watches.push(this.selectedScreenId.subscribe(stop));
        watches.push(this.narrow.subscribe(stop));
      };
      const closeEditor = () => {
        const wasOpen = this.editing();
        if (this.editor()) {
          this.editor().clear();
        }
        this.mode('review');
        this.editor(null);
        if (wasOpen) {
          window.setTimeout(() => { observeStage(); sendAll(); }, 0);
        }
      };
      this.showEdit = () => {
        const s = this.screen();
        if (!s || this.editor()) {
          return;
        }
        if (editorVm) {
          editorVm.load(s.id);
        } else {
          editorVm = new DesignerViewModel({ embedded: true, designId: s.id, host: host });
        }
        this.editor(editorVm);
        this.mode('edit');
      };
      this.showReview = () => (this.editing() ? guard().then((ok) => { if (ok) { closeEditor(); } return ok; }) : Promise.resolve(true));
      // The editor follows the selected screen
      this.selectedScreenId.subscribe((id) => {
        const vm = this.editor();
        if (!vm) {
          return;
        }
        if (!id) {
          closeEditor();
        } else if (!vm.detail() || vm.detail().id !== id) {
          vm.load(id);
        }
      });
      this.modes = [['review', 'Review'], ['edit', 'Edit']].map(([value, label]) => ({
        value: value, label: label, id: 'studioMode-' + value,
        pressed: ko.pureComputed(() => (this.mode() === value ? 'true' : 'false')),
        tabindex: ko.pureComputed(() => (this.mode() === value ? '0' : '-1')),
        pick: () => (value === 'edit' ? this.showEdit() : this.showReview())
      }));
      // The editor's checks (fields placed, placeholder values, buttons, compatibility) are in Edit's Checks panel
      this.openChecks = () => inEditor((vm) => vm.showChecks());
      // Unsaved changes in Edit: the header says so and offers Save changes instead of Approve (approval locks a saved
      // version); after a save it says Saved and offers Approve again
      this.editorDirty = ko.pureComputed(() => !!this.editor() && this.editor().dirty());
      this.justSaved = ko.observable(false);
      this.editorDirty.subscribe((dirty) => { if (dirty) { this.justSaved(false); } });
      this.selectedScreenId.subscribe(() => this.justSaved(false));
      this.saveChanges = () => {
        const vm = this.editor();
        return vm ? vm.save().then(() => { if (!vm.dirty()) { this.justSaved(true); } }) : Promise.resolve();
      };
      this.approveOffered = ko.pureComputed(() => this.canApprove() && !this.screenLocked() && !this.editorDirty());
      // An approved screen opens read-only in Edit
      this.editLocked = ko.pureComputed(() => this.editing() && this.screenLocked());
      // After an approval or reopening, the editor shows the screen's new state (locked or open)
      const refreshEditor = () => {
        const vm = this.editor();
        if (vm && this.selectedScreenId()) {
          vm.load(this.selectedScreenId());
        }
      };
      this.addSteps = () => api.post('designs/' + encodeURIComponent(this.screen().id) + '/flow-screens')
        .then((created) => reloadFlow().then(() => toast.success(created.length + ' screens added after "' + this.screen().name + '".')))
        .catch(actionError);
      this.approveScreen = () => {
        const s = this.screen();
        const vm = this.editor();
        if (!s) {
          return Promise.resolve(null);
        }
        if (vm && vm.dirty()) {
          toast.info('Save the changes first: approval locks a saved version.');
          return Promise.resolve(null);
        }
        const version = vm && vm.detail() ? vm.detail().currentVersion : s.currentVersion;
        // A screen without a BRD is approved on its own
        return s.loose || this.requirementId() === NONE
          ? designActions.approveScreen(s.id, s.name, version)
            .then((detail) => detail && reloadFlow().then(() => { refreshEditor(); toast.success('"' + detail.name + '" is approved for development.'); }))
            .catch(actionError)
          : approve([s.id], { count: 1, name: s.name, version: version });
      };
      this.reopenScreen = () => designActions.reopen(this.screen().id, this.screen().name)
        .then((detail) => detail && reloadFlow().then(() => { refreshEditor(); toast.success('"' + detail.name + '" is reopened for changes.'); }))
        .catch(actionError);

      // The selected screen's More menu: share for review, import into it, its review and confirmation screens, delete
      this.screenMenuItems = ko.pureComputed(() => {
        const s = this.screen();
        return [
          // A review link shows a saved version, so it waits for unsaved changes to be saved
          { value: 'share', label: 'Share for review', icon: 'link', disabled: !this.screenEditable() || this.narrow() || (!!this.editor() && this.editor().dirty()),
            title: this.editor() && this.editor().dirty() ? 'Save the changes first: the link shows a saved version.' : null },
          { value: 'import', label: 'Import from Figma, an image or a PDF', icon: 'upload', disabled: !this.screenEditable() || this.narrow() },
          { value: 'flow', label: 'Add review and confirmation screens', disabled: !this.screenEditable() || !s || (!!s.stage && s.stage !== 'initiate') },
          { value: 'comment', label: 'Comment on the screen', icon: 'edit', disabled: this.narrow() }
        ].concat(this.editing() && this.editor() ? [
          { value: 'discard', label: 'Discard the changes', icon: 'x', disabled: !this.editorDirty() },
          { value: 'previous', label: 'Bring back the previous version', icon: 'refresh', disabled: !this.editor().canRestorePrevious() }
        ] : []).concat([
          { separator: true },
          { value: 'delete', label: 'Delete screen', icon: 'trash', danger: true, disabled: !this.canDesign() }
        ]);
      });
      this.screenMenu = (event) => {
        const value = event.detail.value;
        if (value === 'share') {
          inEditor((vm) => vm.showDrawer('share'));
        } else if (value === 'import') {
          inEditor((vm) => vm.showDrawer('import'));
        } else if (value === 'comment') {
          inEditor((vm) => vm.commentOnScreen());
        } else if (value === 'flow') {
          this.addSteps();
        } else if (value === 'discard' && this.editor()) {
          this.editor().discard();
        } else if (value === 'previous' && this.editor()) {
          this.editor().restorePrevious();
        } else if (value === 'delete') {
          this.deleteScreen();
        }
      };
      this.deleteScreen = () => {
        const s = this.screen();
        const vm = this.editor();
        if (vm && vm.detail() && vm.detail().id === s.id) {
          // The editor asks, deletes and tells the Studio (host.deleted)
          vm.remove();
          return Promise.resolve();
        }
        // Review, or Edit on a phone (an editor that never opened the screen): the Studio's own delete; Edit closes after
        return dialog.confirm({
          title: 'Delete this screen?', danger: true, confirmLabel: 'Delete',
          message: '"' + s.name + '", all its versions and its comments are deleted. This cannot be undone.'
        }).then((ok) => ok && api.del('designs/' + encodeURIComponent(s.id))
          .then(() => { closeEditor(); return Promise.all([loadRequirements(), reloadFlow()]); })
          .then(() => toast.success('"' + s.name + '" is deleted.')))
          .catch(actionError);
      };


      // --- the stepper and the next action ---

      const change = ko.pureComputed(() => this.changes()[0] || null);
      const allApproved = ko.pureComputed(() => brdScreens().length > 0 && brdScreens().every((s) => s.status === 'APPROVED'));
      this.stage = ko.pureComputed(() => {
        const r = this.summary();
        // A workspace with screens but no BRD: no stages (their code comes with a change started elsewhere)
        if (this.requirementId() === NONE) {
          return 0;
        }
        if (!r) {
          return 1;
        }
        if (r.status !== 'APPROVED') {
          return 2;
        }
        if (brdScreens().length === 0) {
          return 3;
        }
        if (!allApproved()) {
          return 4;
        }
        return change() ? 6 : 5;
      });
      this.steps = ko.pureComputed(() => {
        const stage = this.stage();
        const r = this.summary();
        const total = brdScreens().length;
        const approved = brdScreens().filter((s) => s.status === 'APPROVED').length;
        const subs = [
          r ? (r.fileName || 'Text request') : 'Upload or pick one',
          r ? (r.status === 'APPROVED' ? 'Approved' : ui.status(r.status, r.status === 'READY' ? 'Needs your approval' : null).text) : 'Drafted by the AI',
          total ? total + ' screens' : 'From the approved spec',
          total ? approved + ' of ' + total + ' approved' : 'All screens of the BRD',
          change() ? ui.status(change().status).text : 'Plan, code and delivery'
        ];
        // The current stage says what is left in it: "Approve 0 of 5 screens"
        const current = ['BRD', 'Spec', 'Screens', total ? 'Approve ' + approved + ' of ' + plural(total, 'screen', 'screens') : 'Approve', change() ? 'Code: ' + subs[4] : 'Code'];
        return ['BRD', 'Spec', 'Screens', 'Approve', 'Code'].map((label, i) => ({
          number: String(i + 1), label: label, sub: subs[i], done: i + 1 < stage,
          text: i + 1 === stage ? current[i] : label,
          mark: i + 1 < stage ? '✓' : String(i + 1),
          css: 'factory-studio-stepper-item' + (i + 1 < stage ? ' is-done' : i + 1 === stage ? ' is-current' : ''),
          current: i + 1 === stage ? 'step' : null,
          notFirst: i > 0
        }));
      });
      this.next = ko.pureComputed(() => {
        const r = this.summary();
        switch (this.stage()) {
          case 0:
            return { title: 'Screens without a BRD', text: 'Blank and imported screens, and screens whose BRD was deleted. Review, edit and approve them here; their code comes with a change on the Changes page.', action: null };
          case 1:
            return { title: 'Start with a BRD', text: 'Upload the business requirements document. The AI drafts its specification: screens, fields, rules and questions.', action: null };
          case 2:
            if (r.status === 'PROCESSING') {
              return { title: 'The AI is drafting the specification', text: r.message || 'This takes a few minutes for a long BRD. The page updates by itself.', action: null, busy: true };
            }
            if (r.status === 'FAILED') {
              return { title: 'Drafting the specification failed', text: (r.message || 'The model did not answer.') + ' Open the spec to try again.', label: 'Open the spec', action: this.openSpec, tone: 'danger' };
            }
            return {
              title: 'Review and approve the specification',
              text: r.openQuestions ? r.openQuestions + ' open questions need answers before approval.' : 'Check what the AI drafted, then approve it. Screens are made from the approved spec.',
              label: 'Review the spec', action: this.openSpec
            };
          case 3:
            return this.canDesign()
              ? { title: 'Generate the screens', text: 'One screen per screen in the spec, with its fields, rules and the channels the BRD names.', label: 'Generate screens', action: this.generate }
              : { title: 'Screens not made yet', text: 'Someone with the Analyst or Developer role generates them.', action: null };
          case 4:
            return {
              title: 'Review and approve the screens',
              text: 'Check each requirement\'s flow, refine screens, then approve them. Code is generated from approved screens only.',
              label: this.canApprove() ? 'Approve all ' + this.screens().filter((s) => s.status !== 'APPROVED').length + ' remaining screens' : null,
              action: this.canApprove() ? this.approveAll : null, secondary: true
            };
          case 5:
            if (!codeImported()) {
              return { title: 'Import the code first', text: "Every screen is approved. The change is planned against the bank's code, so import the workspace code (from SVN or a folder) before generating it.", label: 'Open Workspaces', action: () => navigate('workspaces'), tone: 'success' };
            }
            return this.canCode()
              ? { title: 'Ready for code', text: 'Every screen is approved. The factory analyses the impact on the bank\'s code, plans the change and writes it.', label: 'Generate code', action: this.generateCode, tone: 'success' }
              : { title: 'Ready for code', text: 'Every screen is approved. A developer starts the change on the Changes page.', label: 'Open Changes', action: () => navigate('changes'), tone: 'success' };
          default:
            return { title: 'Code is under way', text: change().title + ': ' + ui.status(change().status).text + '.', label: 'Open the change', action: this.openChange, tone: 'success' };
        }
      });
      // The header's next action, for the stages before and after approving (Approve All is in the Screens panel)
      this.headerAction = ko.pureComputed(() => (this.stage() !== 4 && this.next().action ? this.next() : null));
      this.nextButtonCss = ko.pureComputed(() => 'fx-btn ' + (this.next().secondary ? 'fx-btn--secondary' : this.next().tone === 'success' ? 'fx-btn--success' : 'fx-btn--primary'));
      // On phones: "Step 4 of 5 · Approve" and "· 0 of 5 approved"
      this.stageChip = ko.pureComputed(() => {
        const st = this.steps().find((x) => x.current);
        return this.stage() === 0 ? 'Screens without a BRD' : st ? 'Step ' + st.number + ' of 5 · ' + st.label : 'Code is under way';
      });
      this.stageChipSub = ko.pureComputed(() => {
        const st = this.steps().find((x) => x.current);
        return st ? '· ' + st.sub : '';
      });
      this.hasScreens = ko.pureComputed(() => this.screens().length > 0);

      // --- actions ---

      this.openSpec = () => {
        pageRequests.requirement(this.requirementId());
        navigate('requirements');
      };
      this.openChange = () => {
        pageRequests.change(change().id);
        navigate('changes');
      };
      this.generate = () => api.post('requirements/' + encodeURIComponent(this.requirementId()) + '/designs')
        .then((created) => reloadFlow().then(() => toast.success(created.length + ' screens generated. Review them below.')))
        .catch(actionError);

      // + New screen: generate them from the approved spec, or a blank screen, or one imported from a design tool (a
      // blank screen first, then the editor's import); blank and imported screens are under "Screens without a BRD"
      this.newKind = ko.observable(null);
      this.newName = ko.observable('');
      this.newMenuItems = ko.pureComputed(() => (this.stage() === 3 ? [{ value: 'generate', label: 'Generate screens from the spec', icon: 'wand' }] : [])
        .concat([
          { value: 'blank', label: 'Blank screen', icon: 'plus' },
          { value: 'import', label: 'Import from Figma, an image or a PDF', icon: 'upload', disabled: this.narrow() }
        ]));
      this.newMenu = (event) => {
        const value = event.detail.value;
        if (value === 'generate') {
          this.generate();
        } else {
          this.newKind(value);
          window.setTimeout(() => { const box = document.querySelector('#studioNewName input'); if (box) { box.focus(); } }, 50);
        }
      };
      this.newTitle = ko.pureComputed(() => (this.newKind() === 'import' ? 'Import a screen' : 'Blank screen'));
      this.newHint = ko.pureComputed(() => (this.newKind() === 'import'
        ? 'Name the screen, then choose the Figma frame, image or PDF. The import becomes its first designed version.'
        : 'An empty screen to build from the components. It is listed under Screens without a BRD.'));
      this.cancelNew = () => { this.newKind(null); this.newName(''); };
      this.createNew = () => {
        const name = (this.newName() || '').trim();
        const kind = this.newKind();
        if (!name) {
          toast.info('Name the screen first, for example "Fixed deposit opening".');
          return Promise.resolve();
        }
        return guard().then((ok) => ok && api.post('workspaces/' + this.workspaceId() + '/designs', { name: name })
          .then((detail) => {
            this.cancelNew();
            // Opened in Edit under Screens without a BRD; an import continues in the editor's import drawer
            openAfterLoad = { id: detail.id, edit: true, then: kind === 'import' ? (vm) => vm.openImport() : null };
            return loadRequirements().then(() => {
              closeEditor();
              if (this.requirementId()) {
                return reloadFlow();
              }
              this.requirementId(NONE);
              return null;
            });
          })
          .then(() => toast.success('"' + name + '" is created.')))
          .catch(actionError);
      };
      // A screen to select (and open in Edit) once the flow it is in has loaded
      let openAfterLoad = null;
      const openPending = () => {
        const wanted = openAfterLoad;
        if (!wanted || !screenById(wanted.id)) {
          return;
        }
        openAfterLoad = null;
        const current = this.group();
        if (!current || current.screens.indexOf(wanted.id) < 0) {
          const other = allGroups().find((g) => g.screens.indexOf(wanted.id) >= 0);
          this.groupKey(other ? other.key : null);
        }
        this.selectedScreenId(wanted.id);
        if (wanted.edit && !this.narrow()) {
          inEditor((vm) => { if (wanted.then) { wanted.then(vm); } });
        }
      };
      // Every approval asks first, and again for elements the version pack forbids (services/designActions)
      const approve = (ids, question) => designActions.approveScreens(this.requirementId(), ids, question)
        .then((flow) => {
          if (!flow) {
            return;
          }
          const before = this.screens().filter((s) => s.status === 'APPROVED').length;
          // A flow still loading (after a save) is older than this one: it is not shown
          token++;
          setFlow(flow);
          refreshEditor();
          const now = flow.screens.filter((s) => s.status === 'APPROVED').length;
          toast.success((now - before) + (now - before === 1 ? ' screen' : ' screens') + ' approved.'
            + (now === flow.screens.length ? ' Every screen is approved: you can generate the code.' : ''));
        })
        .catch(actionError);
      // Approve All: every screen of the BRD not approved yet; the question says how many still have open checks
      const openChecksOf = (s) => (s.unconfirmed || []).length + (s.decisions || []).length
        + (this.flow() ? this.flow().questions.filter((q) => q.screens.indexOf(s.id) >= 0).length : 0);
      this.canApproveAll = ko.pureComputed(() => this.canApprove() && this.requirementId() !== NONE && !!this.summary()
        && brdScreens().some((s) => s.status !== 'APPROVED'));
      this.approveAll = () => {
        if (this.editorDirty()) {
          toast.info('Save the changes first: approval locks a saved version.');
          return Promise.resolve(null);
        }
        const remaining = brdScreens().filter((s) => s.status !== 'APPROVED');
        return approve(null, { every: true, count: remaining.length, open: remaining.filter((s) => openChecksOf(s) > 0).length });
      };
      this.generateCode = () => api.post('requirements/' + encodeURIComponent(this.requirementId()) + '/changes')
        .then((created) => {
          toast.success('The change was started. The factory is analysing the impact on the code.');
          pageRequests.change(created.id);
          navigate('changes');
        })
        .catch(actionError);

      // Upload a BRD from this page
      this.chosenFile = ko.observable(null);
      this.chosenName = ko.pureComputed(() => (this.chosenFile() ? this.chosenFile().name : ''));
      this.fileSelected = (event) => {
        this.chosenFile(event.target.files[0] || null);
        event.target.value = '';
      };
      this.upload = () => {
        const form = new FormData();
        form.append('file', this.chosenFile());
        api.upload('workspaces/' + this.workspaceId() + '/requirements', form)
          .then((detail) => {
            this.chosenFile(null);
            toast.success('BRD uploaded. The AI is drafting its specification.');
            return loadRequirements().then(() => switchBrd(detail.id)).then((ok) => {
              if (!ok) {
                toast.info('"' + (detail.title || 'The BRD') + '" is in the BRD picker when you are done editing.');
              }
            });
          })
          .catch(actionError);
      };
      this.cancelUpload = () => this.chosenFile(null);

      // A requirement (the dropdown, ‹ ›, the dots, ← →): asks first about unsaved changes, then shows its first screen
      this.pickGroup = (key) => (key === (this.group() || {}).key ? Promise.resolve(true) : guard().then((ok) => {
        if (!ok) {
          this.groupPick((this.group() || {}).key || null);
          return false;
        }
        this.groupKey(key);
        const g = this.group();
        this.selectedScreenId(g && g.screens.length ? g.screens[0] : null);
        return true;
      }));
      this.previousGroup = () => { const i = this.groupIndex(); return i > 0 ? this.pickGroup(allGroups()[i - 1].key) : Promise.resolve(false); };
      this.nextGroup = () => { const i = this.groupIndex(); return i < allGroups().length - 1 ? this.pickGroup(allGroups()[i + 1].key) : Promise.resolve(false); };
      // The requirement dropdown follows the selected requirement; choosing one goes through pickGroup
      this.groupPick = ko.observable(null);
      ko.computed(() => { const g = this.group(); this.groupPick(g ? g.key : null); });
      this.groupPick.subscribe((key) => { if (key && key !== (this.group() || {}).key) { this.pickGroup(key); } });
      // The BRD picker: another BRD asks first about the editor's unsaved changes, and stays on this one when kept
      // Every change of the BRD the user starts (the picker, an upload, a screen asked for) goes through switchBrd
      this.brdPick = ko.observable(null);
      this.requirementId.subscribe((id) => this.brdPick(id));
      const switchBrd = (id) => (id === this.requirementId() ? Promise.resolve(true) : guard().then((ok) => {
        if (ok) {
          this.requirementId(id);
        } else {
          this.brdPick(this.requirementId());
        }
        return ok;
      }));
      this.brdPick.subscribe((id) => {
        if (id !== this.requirementId()) {
          switchBrd(id);
        }
      });

      // --- the preview: one frame showing the selected screen as a phone, tablet or desktop ---

      this.device = ko.observable(DEVICES[recall('factory.studio.device')] ? recall('factory.studio.device') : 'phone');
      this.device.subscribe((d) => remember('factory.studio.device', d));
      this.devices = Object.keys(DEVICES).map((value) => ({
        label: DEVICES[value].label, icon: 'factory-nav-icon factory-ico-' + (value === 'desktop' ? 'monitor' : value),
        pressed: ko.pureComputed(() => (this.device() === value ? 'true' : 'false')),
        pick: () => this.device(value)
      }));
      this.frameCss = ko.pureComputed(() => 'factory-studio-frame factory-studio-frame--' + this.device());
      this.stageWidth = ko.observable(600);
      this.frameBox = ko.pureComputed(() => {
        const d = DEVICES[this.device()];
        const bezel = this.device() === 'desktop' ? 2 : 20;
        const fit = (this.stageWidth() - bezel) / d.width;
        const scale = Math.min(1, this.device() === 'phone' ? fit : Math.max(MIN_SCALE, fit));
        return {
          width: Math.round(d.width * scale + bezel) + 'px', height: Math.round(d.height * scale + bezel) + 'px',
          innerWidth: d.width + 'px', innerHeight: d.height + 'px', transform: 'scale(' + scale + ')'
        };
      });
      this.previewKind = ko.observable('jet');
      this.previewSrc = ko.pureComputed(() => PreviewFrame.srcFor(this.previewKind()));
      const bankNames = {};
      const indexed = {};
      const codeImported = () => indexed[this.workspaceId()] !== false;
      const context = () => ({
        bank: bankNames[this.workspaceId()] || 'Online banking',
        breadcrumb: 'Dashboard' + (this.group() && this.group().key !== 'all' ? ' / ' + this.group().title : ''),
        warnings: {},
        editing: false,
        brdOnly: true
      });
      const frames = () => Array.prototype.slice.call(document.querySelectorAll('iframe[data-studio-screen]'));
      // The frame never reloads: it is sent whichever screen (or earlier version) is shown
      const send = (frame) => {
        const shown = this.shownVersion();
        const s = this.screen();
        const model = shown && s && shown.id === s.id ? shown.model : s && s.model;
        if (model && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'factory-preview', model: clone(model), highlight: null, context: context() }, window.location.origin);
        }
      };
      const sendAll = () => frames().forEach(send);
      const onMessage = (event) => {
        if (event.origin !== window.location.origin || !event.data) {
          return;
        }
        const frame = frames().find((f) => f.contentWindow === event.source);
        if (frame && event.data.type === 'factory-preview-ready') {
          send(frame);
        }
      };
      let stageObserver = null;
      const observeStage = () => {
        const stage = document.querySelector('.factory-studio-stage');
        if (stageObserver && stage) {
          stageObserver.disconnect();
          stageObserver.observe(stage);
        }
      };
      this.selectedScreenId.subscribe(() => {
        this.shownVersion(null);
        window.setTimeout(() => { observeStage(); sendAll(); }, 0);
      });

      // --- loading ---

      let pollTimer = null;
      let token = 0;
      const setFlow = (flow) => {
        this.flow(flow);
        if (!allGroups().some((g) => g.key === this.groupKey())) {
          this.groupKey(allGroups().length ? allGroups()[0].key : null);
        }
        const group = this.group();
        const ids = group ? group.screens : [];
        if (!this.selectedScreenId() || !screenById(this.selectedScreenId()) || ids.indexOf(this.selectedScreenId()) < 0) {
          this.selectedScreenId(ids.length ? ids[0] : null);
        }
        loadVersions();
        // A change shows the current version again; the frame gets the new model (a new frame asks when ready)
        this.shownVersion(null);
        window.setTimeout(() => { observeStage(); sendAll(); }, 0);
        openPending();
      };
      /** The workspace's screens without a BRD (blank, imported, or their BRD deleted), marked loose, in the order made. */
      const looseScreens = () => api.get('workspaces/' + encodeURIComponent(this.workspaceId()) + '/designs').then((list) => {
        const ids = this.requirements().map((r) => r.id);
        const loose = list.filter((d) => !d.requirementId || ids.indexOf(d.requirementId) < 0);
        this.looseDesigns(loose);
        return Promise.all(loose.map((d) => api.get('designs/' + encodeURIComponent(d.id)))).then((details) => details.map((d) => {
          const first = (d.versions || []).slice().sort((a, b) => a.version - b.version)[0];
          return {
            id: d.id, name: d.name, status: d.status, currentVersion: d.currentVersion, approvedBy: d.approvedBy, model: d.model,
            stage: d.model ? d.model.stage : null, channels: d.model ? d.model.channels || [] : [], criteria: [], unconfirmed: [], decisions: [],
            needsSteps: false, loose: true, origin: first ? first.origin : 'BLANK'
          };
        }));
      });
      const emptyFlow = { title: 'Screens without a BRD', requirements: [], others: [], rules: [], criteria: [], uncovered: [], questions: [], screens: [] };
      // The BRD's flow with the workspace's screens without a BRD after its own (the Screens panel's last requirement)
      const reloadFlow = () => {
        const id = this.requirementId();
        if (!id) {
          this.flow(null);
          this.changes([]);
          return Promise.resolve();
        }
        const mine = ++token;
        return Promise.all([id === NONE ? Promise.resolve(emptyFlow) : api.get('requirements/' + encodeURIComponent(id) + '/design-flow'),
          looseScreens().catch(() => []),
          id === NONE ? Promise.resolve([]) : api.get('workspaces/' + this.workspaceId() + '/changes/details').catch(() => []),
          id === NONE ? Promise.resolve(null) : api.get('requirements/' + encodeURIComponent(id)).catch(() => null)])
          .then(([flow, loose, changes, requirement]) => {
            if (mine !== token) {
              return;
            }
            specScreens(requirement && requirement.spec ? requirement.spec.screens || [] : []);
            this.changes(changes.filter((c) => c.requirementId === id && c.status !== 'CLOSED')
              .concat(changes.filter((c) => c.requirementId === id && c.status === 'CLOSED')));
            setFlow(Object.assign({}, flow, { screens: flow.screens.concat(loose) }));
          });
      };
      const loadRequirements = () => {
        const id = this.workspaceId();
        if (!id) {
          this.requirements([]);
          return Promise.resolve();
        }
        return Promise.all([api.get('workspaces/' + id + '/requirements'), api.get('workspaces/' + id + '/designs').catch(() => [])])
          .then(([list, designs]) => {
            this.requirements(list);
            const ids = list.map((r) => r.id);
            this.looseDesigns(designs.filter((d) => !d.requirementId || ids.indexOf(d.requirementId) < 0));
            return list;
          });
      };
      const poll = () => {
        clearTimeout(pollTimer);
        const r = this.summary();
        if (r && r.status === 'PROCESSING') {
          pollTimer = setTimeout(() => loadRequirements().then(() => {
            if (this.summary() && this.summary().status !== 'PROCESSING') {
              return reloadFlow();
            }
            return null;
          }).then(poll).catch(showError), POLL_MS);
        }
      };
      this.requirementId.subscribe((id) => {
        if (id && this.workspaceId()) {
          remember(storageKey(this.workspaceId()), id);
        }
        this.groupKey(null);
        this.selectedScreenId(null);
        this.errorMessage('');
        this.loading(true);
        reloadFlow().catch(showError).finally(() => this.loading(false));
        poll();
      });
      // The address the page was opened with (?ojr=studio&requirement=<id>&screen=<id>), read once
      // Only ids that look like ids are used (UUIDs, or "none" for Screens without a BRD); anything else is ignored
      const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const idOrNull = (value, allowNone) => (value && (UUID.test(value) || (allowNone && value === NONE)) ? value : null);
      let fromAddress = (() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('ojr') === 'studio' ? { requirement: idOrNull(params.get('requirement'), true), screen: idOrNull(params.get('screen'), false) } : null;
      })();
      // A screen asked for: by another page (pageRequests.design, from the old designer links: opens in Edit) or by the
      // address (Review); kept while the workspace is switched to the screen's own
      let pendingScreen = null;
      /** Resolves with the BRD of the screen asked for (NONE without one), or undefined when none is asked for. */
      const screenRequest = (list) => {
        const requested = idOrNull(pageRequests.design(), false);
        pageRequests.design(null);
        // A screen waiting for its workspace counts only once that workspace is the selected one (a refused switch drops it)
        const waiting = pendingScreen && pendingScreen.workspace === this.workspaceId() ? pendingScreen : null;
        // A BRD asked for by another page wins over the address
        const wanted = requested ? { id: requested, edit: true } : waiting
          || (fromAddress && fromAddress.screen && !pageRequests.studio() ? { id: fromAddress.screen, edit: false } : null);
        pendingScreen = null;
        if (!wanted) {
          return Promise.resolve(undefined);
        }
        return api.get('designs/' + encodeURIComponent(wanted.id)).then((d) => {
          if (d.workspaceId && d.workspaceId !== this.workspaceId()) {
            // The switch asks first when Edit has unsaved changes (workspaceSelection's guard)
            pendingScreen = { id: wanted.id, edit: wanted.edit, workspace: d.workspaceId };
            workspaceSelection.selectedId(d.workspaceId);
            return null;
          }
          openAfterLoad = { id: d.id, edit: wanted.edit, then: null };
          // A screen without a BRD is in every BRD's "Without a BRD" requirement: the BRD stays as it is
          return d.requirementId && list.some((r) => r.id === d.requirementId) ? d.requirementId
            : this.requirementId() || (list.find((r) => r.status === 'APPROVED') || list[0] || {}).id || NONE;
        }).catch((error) => {
          toast.warning(error.status === 403 ? 'You don\'t have access to that screen.'
            : 'That screen is not there any more. It may have been deleted.');
          return undefined;
        });
      };
      // A screen asked for while the Studio is already open (an old designer link from the command palette or a toast)
      const onDesignRequest = (id) => {
        if (!id || !this.workspaceId()) {
          return;
        }
        guard().then((ok) => {
          if (!ok) {
            pageRequests.design(null);
            return null;
          }
          return screenRequest(this.requirements()).then((forScreen) => {
            if (forScreen === null || forScreen === undefined) {
              return;
            }
            if (forScreen === this.requirementId()) {
              openPending();
            } else {
              this.requirementId(forScreen);
            }
          });
        }).catch(showError);
      };
      // The address follows the selected BRD and screen, so a copied link opens them (replaceState: no history entry)
      const showInAddress = () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('ojr') !== 'studio' || !window.history.replaceState) {
          return;
        }
        const rid = this.requirementId();
        const sid = this.selectedScreenId();
        const url = window.location.pathname + '?ojr=studio' + (rid ? '&requirement=' + encodeURIComponent(rid) : '')
          + (sid ? '&screen=' + encodeURIComponent(sid) : '');
        if (url !== window.location.pathname + window.location.search) {
          window.history.replaceState(window.history.state, '', url);
        }
      };
      this.selectedScreenId.subscribe(showInAddress);
      this.requirementId.subscribe(showInAddress);
      // The router keeps other parameters on the next page's address, so they go when the Studio does
      const clearAddress = () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('ojr') !== 'studio' && (params.has('requirement') || params.has('screen')) && window.history.replaceState) {
          params.delete('requirement');
          params.delete('screen');
          window.history.replaceState(window.history.state, '', window.location.pathname + '?' + params.toString());
        }
      };
      /** The BRD to open: a screen's, one asked for by another page or the address, the last one used here, or the newest. */
      const pickRequirement = (list, forScreen) => {
        const wanted = forScreen || pageRequests.studio() || (fromAddress && fromAddress.requirement);
        pageRequests.studio(null);
        fromAddress = null;
        const remembered = recall(storageKey(this.workspaceId()));
        // "none" stands for the screens without a BRD only in a workspace that has no BRD
        const known = (id) => id && (list.some((r) => r.id === id) || (id === NONE && list.length === 0 && this.looseDesigns().length > 0));
        const choice = [wanted, remembered].find(known)
          || (list.find((r) => r.status === 'APPROVED') || list[0] || {}).id || (this.looseDesigns().length ? NONE : null);
        if (choice === this.requirementId()) {
          this.requirementId.valueHasMutated();
        } else {
          this.requirementId(choice);
        }
      };
      const loadTarget = (id) => targetOf(id)
        .then((target) => { if (id === this.workspaceId() && target.preview) { this.previewKind(target.preview); } })
        .catch(() => null);
      const loadWorkspace = () => {
        const id = this.workspaceId();
        closeEditor();
        this.flow(null);
        this.requirementId(null);
        if (!id) {
          this.requirements([]);
          return Promise.resolve();
        }
        // Asked again on each workspace load (the target may have changed on another page), then shared with the editor
        delete targets[id];
        loadTarget(id);
        return loadRequirements()
          .then((list) => screenRequest(list).then((forScreen) => {
            // null: switching to the screen's workspace, which loads again
            if (forScreen !== null && id === this.workspaceId()) {
              pickRequirement(list, forScreen);
            }
          }))
          .catch(showError);
      };

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Design Studio loaded.');
        document.title = 'Design Studio';
        window.addEventListener('message', onMessage);
        phoneQuery.addEventListener('change', onNarrow);
        smallQuery.addEventListener('change', onSmall);
        tabletQuery.addEventListener('change', onTablet);
        // The app menu folds to icons while Edit is open, for the canvas
        menuFold = ko.computed(() => pageRequests.foldMenu(this.editing() && !this.narrow()));
        if (window.ResizeObserver) {
          stageObserver = new ResizeObserver((entries) => this.stageWidth(entries[0].contentRect.width));
          observeStage();
        }
        catalogTypes().then((types) => { types.forEach((t) => { catalog[t.type] = t.label.replace(/ \(.*\)$/, ''); }); catalogList(types); }).catch(() => null);
        alive = true;
        subscription = this.workspaceId.subscribe(loadWorkspace);
        // Another workspace asks first while Edit has unsaved changes (the top bar, the bell, a link to another workspace)
        unguard = workspaceSelection.guardChange({ blocks: () => !!this.editor() && this.editor().dirty(), confirm: guard });
        workspaceSelection.load().then((list) => {
          list.forEach((w) => { bankNames[w.id] = w.bankName; indexed[w.id] = w.indexedRevision !== null && w.indexedRevision !== undefined; });
          return loadWorkspace();
        }).then(() => {
          // Not when the page was left while it loaded
          if (alive) {
            if (designRequests) {
              designRequests.dispose();
            }
            designRequests = pageRequests.design.subscribe(onDesignRequest);
          }
        }).catch(showError);
      };
      let designRequests = null;
      let menuFold = { dispose: () => {} };
      let alive = false;
      let unguard = null;
      // Leaving the page with unsaved changes in Edit asks first (the editor's own guard)
      this.canExit = () => (this.editor() ? this.editor().canExit() : Promise.resolve());
      this.disconnected = () => {
        window.removeEventListener('message', onMessage);
        phoneQuery.removeEventListener('change', onNarrow);
        smallQuery.removeEventListener('change', onSmall);
        tabletQuery.removeEventListener('change', onTablet);
        menuFold.dispose();
        pageRequests.foldMenu(false);
        if (this.editor()) {
          this.editor().clear();
        }
        this.editor(null);
        this.mode('review');
        clearTimeout(pollTimer);
        alive = false;
        if (designRequests) {
          designRequests.dispose();
          designRequests = null;
        }
        if (unguard) {
          unguard();
          unguard = null;
        }
        clearAddress();
        window.setTimeout(clearAddress, 0);
        if (stageObserver) {
          stageObserver.disconnect();
        }
        if (subscription) {
          subscription.dispose();
        }
      };
      self.refresh = () => reloadFlow().catch(showError);
    }

    return StudioViewModel;
  }
);
