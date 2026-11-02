/*
 * UI Design Studio: the workspace from a BRD to approved screens. A workflow bar that stays at the top (the BRD, five
 * stages and the next action); the BRD's functional requirements with their screens and what is still open; the
 * selected requirement's screen flow; and the selected screen's preview as a phone, tablet or desktop, with the
 * acceptance criteria it helps meet, values the BRD leaves to an analyst, refining it (the AI, back to the generated
 * version, a quick edit), comparing versions and approving it. The Visual Designer stays for detailed work on one screen.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/previewFrame', '../services/pageRequests', '../services/toast', '../services/dialog', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, PreviewFrame, pageRequests, toast, dialog) {
    const POLL_MS = 4000;
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const DESIGN_WORDS = { DRAFT: 'Draft', IN_REVIEW: 'In review', APPROVED: 'Approved' };
    const STAGE_WORDS = { initiate: 'Enter details', review: 'Review', confirm: 'Confirmation', inquiry: 'List or details' };
    const CHANNEL_WORDS = { desktop: 'Desktop', tablet: 'Tablet', 'mobile-web': 'Mobile web', 'mobile-app': 'Mobile app' };
    const ORIGIN_WORDS = { GENERATED: 'generated from the spec', EDITED: 'edited', AI: 'changed by the AI', BLANK: 'blank', IMPORTED: 'imported', RESTORED: 'restored' };
    const PRIORITY_TONES = { must: 'danger', high: 'danger', should: 'warning', medium: 'warning', could: 'info', low: 'info' };
    // The page each preview size shows, in CSS pixels; phone and tablet use the preview's own narrow layouts
    const DEVICES = { phone: { width: 390, height: 720, label: 'Phone' }, tablet: { width: 820, height: 1000, label: 'Tablet' }, desktop: { width: 1280, height: 800, label: 'Desktop' } };
    // Never smaller than this, so the text stays readable; a wider page scrolls inside the preview instead
    const MIN_SCALE = 0.8;
    const priorityBadge = (priority) => (priority
      ? { text: priority, css: 'fx-badge fx-badge--plain fx-badge--' + (PRIORITY_TONES[priority.toLowerCase().split(/\W/)[0]] || 'neutral') }
      : null);
    const storageKey = (workspaceId) => 'factory.studio.requirement.' + workspaceId;
    const remember = (key, value) => { try { window.localStorage.setItem(key, value); } catch (e) { /* private window */ } };
    const recall = (key) => { try { return window.localStorage.getItem(key); } catch (e) { return null; } };
    const fieldsOf = (model) => (model ? model.sections.reduce((all, s) => all.concat(s.components), []) : []);
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const criterionKey = (c) => (c.id && c.id.trim() ? c.id : String(c.description));

    /** What changed from one version of a screen to another, in plain words. */
    const differences = (from, to) => {
      const out = [];
      const add = (kind, text) => out.push({ kind: kind, text: text, css: 'factory-studio-diff-' + kind.toLowerCase() });
      const name = (c) => '"' + (c.label || c.name || c.id) + '"';
      const words = (list) => (list && list.length ? list.join(', ') : 'none');
      if ((from.title || '') !== (to.title || '')) {
        add('Changed', 'Title: "' + (from.title || '') + '" to "' + (to.title || '') + '"');
      }
      const sectionsFrom = from.sections.map((s) => s.title || '');
      const sectionsTo = to.sections.map((s) => s.title || '');
      sectionsTo.filter((t) => t && sectionsFrom.indexOf(t) < 0).forEach((t) => add('Added', 'Section "' + t + '"'));
      sectionsFrom.filter((t) => t && sectionsTo.indexOf(t) < 0).forEach((t) => add('Removed', 'Section "' + t + '"'));
      const key = (c) => c.id || c.name;
      const before = {};
      fieldsOf(from).forEach((c) => { before[key(c)] = c; });
      const after = {};
      fieldsOf(to).forEach((c) => { after[key(c)] = c; });
      Object.keys(after).filter((k) => !before[k]).forEach((k) => add('Added', 'Field ' + name(after[k]) + ' (' + after[k].type + ')'));
      Object.keys(before).filter((k) => !after[k]).forEach((k) => add('Removed', 'Field ' + name(before[k])));
      Object.keys(after).filter((k) => before[k]).forEach((k) => {
        const a = before[k];
        const b = after[k];
        if ((a.label || '') !== (b.label || '')) { add('Changed', 'Label: "' + (a.label || '') + '" to "' + (b.label || '') + '"'); }
        if (a.type !== b.type) { add('Changed', name(b) + ' type: ' + a.type + ' to ' + b.type); }
        if ((a.required === true) !== (b.required === true)) { add('Changed', name(b) + (b.required === true ? ' is now mandatory' : ' is now optional')); }
        if ((a.readonly === true) !== (b.readonly === true)) { add('Changed', name(b) + (b.readonly === true ? ' is now shown only' : ' can now be entered')); }
        if (words(a.options) !== words(b.options)) { add('Changed', name(b) + ' values: ' + words(a.options) + ' to ' + words(b.options)); }
        if ((a.defaultValue || '') !== (b.defaultValue || '')) { add('Changed', name(b) + ' default: ' + (a.defaultValue || 'none') + ' to ' + (b.defaultValue || 'none')); }
        if ((a.maxLength || null) !== (b.maxLength || null)) { add('Changed', name(b) + ' maximum length: ' + (a.maxLength || 'none') + ' to ' + (b.maxLength || 'none')); }
        if (words(a.validations) !== words(b.validations)) { add('Changed', name(b) + ' checks: ' + words(a.validations) + ' to ' + words(b.validations)); }
      });
      const actionsFrom = {};
      from.actions.forEach((a) => { actionsFrom[a.id] = a; });
      const actionsTo = {};
      to.actions.forEach((a) => { actionsTo[a.id] = a; });
      Object.keys(actionsTo).filter((k) => !actionsFrom[k]).forEach((k) => add('Added', 'Button "' + actionsTo[k].label + '"'));
      Object.keys(actionsFrom).filter((k) => !actionsTo[k]).forEach((k) => add('Removed', 'Button "' + actionsFrom[k].label + '"'));
      Object.keys(actionsTo).filter((k) => actionsFrom[k] && actionsFrom[k].label !== actionsTo[k].label)
        .forEach((k) => add('Changed', 'Button "' + actionsFrom[k].label + '" to "' + actionsTo[k].label + '"'));
      if (out.length === 0) {
        add('Same', 'No differences in the title, sections, fields or buttons.');
      }
      return out;
    };

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
      this.requirementOptions = ko.pureComputed(() => this.requirements().map((r) => ({
        value: r.id, label: r.title, description: (r.fileName || 'Text request') + ' · ' + ui.status(r.status).text
      })));
      this.summary = ko.pureComputed(() => this.requirements().find((r) => r.id === this.requirementId()) || null);
      this.flow = ko.observable(null);
      this.changes = ko.observableArray([]);
      const catalog = {};

      // --- the screens, by id, and the groups (each functional requirement, all screens, the others) ---

      this.screens = ko.pureComputed(() => (this.flow() ? this.flow().screens : []));
      const screenById = (id) => this.screens().find((s) => s.id === id) || null;
      const approvedCount = (ids) => ids.filter((id) => { const s = screenById(id); return s && s.status === 'APPROVED'; }).length;
      const criterionByKey = (key) => (this.flow() ? this.flow().criteria.find((c) => criterionKey(c) === key) : null) || { id: '', description: key, requirements: [] };

      this.groupKey = ko.observable('all');
      this.search = ko.observable('');
      this.priority = ko.observable('all');
      const allGroups = ko.pureComputed(() => {
        const flow = this.flow();
        if (!flow) {
          return [];
        }
        const groups = [{
          key: 'all', id: '', title: 'All screens', description: flow.title, priority: null,
          screens: flow.screens.map((s) => s.id), rules: flow.rules, criteria: flow.criteria, all: true
        }];
        flow.requirements.forEach((r, i) => groups.push({
          key: 'fr' + i, id: r.id || '', title: r.title || r.description || 'Requirement ' + (i + 1), description: r.description,
          priority: r.priority, screens: r.screens, screenNames: r.screenNames, rules: r.rules, criteria: r.criteria
        }));
        if (flow.others.length > 0 && flow.requirements.length > 0) {
          groups.push({
            key: 'others', id: '', title: 'Other screens', description: 'Screens no functional requirement names, for example renamed ones.',
            priority: null, screens: flow.others, rules: [], criteria: []
          });
        }
        return groups;
      });
      // What is still open in a group: criteria no screen covers, and questions about it the spec leaves unanswered
      const uncoveredOf = (g) => {
        const flow = this.flow();
        if (!flow || !g) {
          return [];
        }
        const keys = g.all ? flow.uncovered : g.criteria.map(criterionKey).filter((k) => flow.uncovered.indexOf(k) >= 0);
        return keys.map(criterionByKey);
      };
      const questionsOf = (g) => {
        const flow = this.flow();
        if (!flow || !g) {
          return [];
        }
        return g.all ? flow.questions : flow.questions.filter((q) => (g.id && q.requirements.indexOf(g.id) >= 0)
          || q.screens.some((id) => g.screens.indexOf(id) >= 0));
      };
      const screenDecisionsOf = (g) => (g ? g.screens.reduce((n, id) => n + ((screenById(id) || {}).decisions || []).length, 0) : 0);
      const unconfirmedOf = (g) => (g ? g.screens.reduce((n, id) => n + ((screenById(id) || {}).unconfirmed || []).length, 0) : 0);
      const flag = (n, one, many, tone) => (n > 0 ? [{ text: plural(n, one, many), css: 'fx-badge fx-badge--plain fx-badge--' + tone }] : []);
      this.priorities = ko.pureComputed(() => {
        const seen = [];
        allGroups().forEach((g) => { if (g.priority && seen.indexOf(g.priority) < 0) { seen.push(g.priority); } });
        return seen.length < 2 ? [] : ['all'].concat(seen).map((p) => ({
          label: p === 'all' ? 'All' : p,
          pressed: ko.pureComputed(() => (this.priority() === p ? 'true' : 'false')),
          pick: () => this.priority(p)
        }));
      });
      this.groups = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        return allGroups()
          .filter((g) => g.key === 'all' || this.priority() === 'all' || g.priority === this.priority())
          .filter((g) => !text || (g.id + ' ' + g.title + ' ' + (g.description || '')).toLowerCase().indexOf(text) >= 0)
          .map((g) => {
            const approved = approvedCount(g.screens);
            return {
              key: g.key, id: g.id, title: g.title, priority: priorityBadge(g.priority),
              count: g.screens.length === 0 ? 'No screen' : plural(g.screens.length, 'screen', 'screens'),
              progress: g.screens.length === 0 ? '' : approved + '/' + g.screens.length + ' approved',
              progressCss: 'factory-studio-req-progress' + (g.screens.length > 0 && approved === g.screens.length ? ' is-done' : ''),
              flags: flag(uncoveredOf(g).length, 'criterion not covered', 'criteria not covered', 'danger')
                .concat(flag(questionsOf(g).length + screenDecisionsOf(g), 'decision open', 'decisions open', 'violet'))
                .concat(flag(unconfirmedOf(g), 'value to confirm', 'values to confirm', 'warning')),
              css: ko.pureComputed(() => 'factory-studio-req' + (this.groupKey() === g.key ? ' is-selected' : '')),
              current: ko.pureComputed(() => (this.groupKey() === g.key ? 'true' : null)),
              pick: () => this.pickGroup(g.key)
            };
          });
      });
      this.group = ko.pureComputed(() => allGroups().find((g) => g.key === this.groupKey()) || allGroups()[0] || null);
      this.groupPriority = ko.pureComputed(() => (this.group() ? priorityBadge(this.group().priority) : null));
      this.groupRules = ko.pureComputed(() => (this.group() ? this.group().rules.map((r) => (r.id ? r.id + ': ' : '') + r.description) : []));
      this.groupCriteria = ko.pureComputed(() => {
        const flow = this.flow();
        return this.group() && flow ? this.group().criteria.map((c) => {
          const covered = flow.uncovered.indexOf(criterionKey(c)) < 0;
          return {
            id: c.id || '', text: c.description, mark: covered ? 'Covered' : 'Not covered',
            markCss: 'factory-studio-mark' + (covered ? ' is-covered' : ' is-gap'),
            iconCss: 'factory-nav-icon ' + (covered ? 'factory-ico-check' : 'factory-ico-alert')
          };
        }) : [];
      });
      this.groupDescription = ko.pureComputed(() => {
        const g = this.group();
        return g && g.key !== 'all' && g.description && g.description !== g.title ? g.description : '';
      });
      this.missingScreens = ko.pureComputed(() => {
        const g = this.group();
        return g && g.screenNames && g.screens.length === 0 && g.screenNames.length > 0 ? g.screenNames.join(', ') : '';
      });
      this.groupUncovered = ko.pureComputed(() => {
        const flow = this.flow();
        return uncoveredOf(this.group()).map((c) => {
          const screenless = c.requirements.filter((id) => flow.requirements.some((r) => r.id && r.id.toLowerCase() === id.toLowerCase()));
          return {
            id: c.id || '', text: c.description,
            why: c.requirements.length === 0 ? 'Linked to no requirement.'
              : screenless.length > 0 ? 'Its requirement (' + screenless.join(', ') + ') has no screen.' : 'Its requirement is not in the spec.'
          };
        });
      });
      this.uncoveredTitle = ko.pureComputed(() => plural(this.groupUncovered().length, 'acceptance criterion', 'acceptance criteria') + ' not covered by a screen');
      const questionView = (q) => {
        const names = q.screens.map((id) => (screenById(id) || {}).name).filter(Boolean);
        const scope = q.requirements.concat(names);
        const detail = [q.reason, q.suggestedAnswer ? 'Suggested: ' + q.suggestedAnswer : '',
          q.options && q.options.length ? 'Options: ' + q.options.join(', ') : '', q.reference ? 'BRD: ' + q.reference : '']
          .filter(Boolean).join(' · ');
        return { question: q.question, detail: detail, scope: scope.length ? scope.join(' · ') : 'Whole BRD' };
      };
      // Open decisions: the spec's unanswered questions, then those the BRD leaves open on each screen of the group
      const screenDecisionViews = (ids) => ids.map(screenById).filter(Boolean)
        .reduce((all, s) => all.concat((s.decisions || []).map((text) => ({ question: text, detail: '', scope: s.name }))), []);
      this.groupQuestions = ko.pureComputed(() => questionsOf(this.group()).map(questionView)
        .concat(this.group() ? screenDecisionViews(this.group().screens) : []));
      this.questionsTitle = ko.pureComputed(() => plural(this.groupQuestions().length, 'design decision', 'design decisions') + ' still open');

      // --- the selected group's screens, in flow order ---

      this.selectedScreenId = ko.observable(null);
      // One item per screen, kept while the screen is shown, so the list is not drawn again after each change
      const items = {};
      const itemFor = (id) => {
        if (!items[id]) {
          const status = ko.observable(ui.status('DRAFT'));
          const approved = ko.observable(false);
          items[id] = {
            id: id, number: ko.observable(''), name: ko.observable(''), stage: ko.observable(''),
            status: status, approved: approved, criteria: ko.observableArray([]), toConfirm: ko.observable(''), decisions: ko.observable(''),
            statusText: ko.pureComputed(() => status().text), statusIcon: ko.pureComputed(() => status().iconCss),
            css: ko.pureComputed(() => 'factory-studio-node' + (this.selectedScreenId() === id ? ' is-selected' : '') + (approved() ? ' is-approved' : '')),
            pressed: ko.pureComputed(() => (this.selectedScreenId() === id ? 'true' : 'false')),
            pick: () => this.selectedScreenId(id)
          };
        }
        return items[id];
      };
      // The list itself changes only when its screens do; otherwise the items update in place
      this.flowScreens = ko.observableArray([]);
      ko.computed(() => {
        const g = this.group();
        const flow = this.flow();
        const list = g ? g.screens.map(screenById).filter(Boolean) : [];
        const next = list.map((s, i) => {
          const item = itemFor(s.id);
          const questions = flow ? flow.questions.filter((q) => q.screens.indexOf(s.id) >= 0).length : 0;
          item.number(String(i + 1));
          item.name(s.name);
          item.stage(STAGE_WORDS[s.stage] || 'Screen');
          item.status(ui.status(s.status, DESIGN_WORDS[s.status]));
          item.approved(s.status === 'APPROVED');
          const criteria = (s.criteria || []).map((k) => criterionByKey(k).id || 'Criterion');
          item.criteria(criteria.length > 4 ? criteria.slice(0, 3).concat(['+' + (criteria.length - 3)]) : criteria);
          item.toConfirm((s.unconfirmed || []).length ? (s.unconfirmed || []).length + ' to confirm' : '');
          const open = questions + (s.decisions || []).length;
          item.decisions(open ? plural(open, 'decision', 'decisions') : '');
          return item;
        });
        const current = this.flowScreens.peek();
        if (next.length !== current.length || next.some((item, i) => item !== current[i])) {
          this.flowScreens(next);
        }
      });
      this.groupProgress = ko.pureComputed(() => {
        const list = this.flowScreens();
        const approved = list.filter((s) => s.approved()).length;
        return list.length === 0 ? '' : approved + ' of ' + list.length + ' approved';
      });
      this.groupUnapproved = ko.pureComputed(() => this.flowScreens().filter((s) => !s.approved()).map((s) => s.id));
      this.approveGroupLabel = ko.pureComputed(() => {
        const n = this.groupUnapproved().length;
        const g = this.group();
        return 'Approve ' + (n === 1 ? 'this screen' : (g && g.key === 'all' ? 'all ' : 'the ') + n + ' screens');
      });
      // Arrow keys move through the flow; the screen under the focus is shown
      this.nodeKey = (event) => {
        const list = this.flowScreens();
        const at = list.findIndex((s) => s.id === this.selectedScreenId());
        const moves = { ArrowDown: at + 1, ArrowRight: at + 1, ArrowUp: at - 1, ArrowLeft: at - 1, Home: 0, End: list.length - 1 };
        if (!(event.key in moves) || list.length === 0) {
          return true;
        }
        event.preventDefault();
        const to = list[Math.max(0, Math.min(list.length - 1, moves[event.key]))];
        this.selectedScreenId(to.id);
        const node = document.querySelector('[data-studio-node="' + to.id + '"]');
        if (node) {
          node.focus();
        }
        return false;
      };

      // --- the selected screen ---

      this.screen = ko.pureComputed(() => screenById(this.selectedScreenId()));
      this.screenStatus = ko.pureComputed(() => (this.screen() ? ui.status(this.screen().status, DESIGN_WORDS[this.screen().status]) : null));
      this.screenMeta = ko.pureComputed(() => {
        const s = this.screen();
        if (!s) {
          return '';
        }
        return (STAGE_WORDS[s.stage] || 'Screen') + ' · version ' + s.currentVersion
          + (s.status === 'APPROVED' && s.approvedBy ? ' · approved by ' + s.approvedBy : '');
      });
      this.screenEditable = ko.pureComputed(() => !!this.screen() && this.screen().status !== 'APPROVED' && this.canDesign());
      this.screenLocked = ko.pureComputed(() => !!this.screen() && this.screen().status === 'APPROVED');
      this.lockedText = ko.pureComputed(() => (this.screenLocked() ? 'Approved and locked. Reopen it to change it.'
        : 'You can view this screen. Changing screens needs the Analyst or Developer role.'));
      this.screenNeedsSteps = ko.pureComputed(() => !!this.screen() && this.screen().needsSteps && this.screenEditable());
      this.screenCriteria = ko.pureComputed(() => (this.screen() ? (this.screen().criteria || []).map((k) => {
        const c = criterionByKey(k);
        return { id: c.id || 'Criterion', text: c.description };
      }) : []));
      this.screenUnconfirmed = ko.pureComputed(() => (this.screen() ? this.screen().unconfirmed || [] : []));
      this.screenQuestions = ko.pureComputed(() => (this.screen() && this.flow()
        ? this.flow().questions.filter((q) => q.screens.indexOf(this.screen().id) >= 0).map(questionView)
          .concat((this.screen().decisions || []).map((text) => ({ question: text, detail: '', scope: '' }))) : []));
      this.screenIndex = ko.pureComputed(() => this.flowScreens().findIndex((s) => s.id === this.selectedScreenId()));
      this.previousScreen = () => { const i = this.screenIndex(); if (i > 0) { this.selectedScreenId(this.flowScreens()[i - 1].id); } };
      this.nextScreen = () => { const i = this.screenIndex(); if (i >= 0 && i < this.flowScreens().length - 1) { this.selectedScreenId(this.flowScreens()[i + 1].id); } };
      this.hasPrevious = ko.pureComputed(() => this.screenIndex() > 0);
      this.hasNext = ko.pureComputed(() => this.screenIndex() >= 0 && this.screenIndex() < this.flowScreens().length - 1);
      this.position = ko.pureComputed(() => (this.screenIndex() < 0 ? '' : 'Screen ' + (this.screenIndex() + 1) + ' of ' + this.flowScreens().length));

      // One tab level for the selected screen; Refine and Edit only for those who may change screens
      this.tab = ko.observable('coverage');
      this.tabs = ko.pureComputed(() => ui.tabs(this.tab, [{ value: 'coverage', label: 'Coverage' }]
        .concat(this.canDesign() ? [{ value: 'refine', label: 'Refine' }, { value: 'edit', label: 'Edit' }] : [])
        .concat([{ value: 'compare', label: 'Compare versions' }])));
      this.tabKey = (event) => {
        const list = this.tabs();
        const at = list.findIndex((t) => t.value === this.tab());
        const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: list.length - 1 }[event.key];
        if (to === undefined) {
          return true;
        }
        event.preventDefault();
        const tab = list[(to + list.length) % list.length];
        this.tab(tab.value);
        const button = document.getElementById('studio-tab-' + tab.value);
        if (button) {
          button.focus();
        }
        return false;
      };
      this.canDesign.subscribe((can) => { if (!can && (this.tab() === 'refine' || this.tab() === 'edit')) { this.tab('coverage'); } });

      // Quick edit: the screen's title and each field's label and mandatory flag
      this.editTitle = ko.observable('');
      this.editFields = ko.observableArray([]);
      const resetEdit = () => {
        const s = this.screen();
        this.editTitle(s && s.model ? s.model.title || '' : '');
        this.editFields(fieldsOf(s && s.model).filter((c) => c.type !== 'table').map((c) => {
          const required = ko.observable(c.required === true);
          return {
            id: c.id, type: catalog[c.type] || c.type, label: ko.observable(c.label || c.name), required: required,
            readonly: c.readonly === true || c.type === 'display',
            requiredLabel: 'Mandatory: ' + (c.label || c.name),
            toggleRequired: (data, event) => { required(event.target.checked); return true; }
          };
        }));
      };
      this.screen.subscribe(resetEdit);
      this.editDirty = ko.pureComputed(() => {
        const s = this.screen();
        if (!s || !s.model) {
          return false;
        }
        const fields = fieldsOf(s.model);
        return (this.editTitle() || '') !== (s.model.title || '') || this.editFields().some((f) => {
          const c = fields.find((x) => x.id === f.id);
          return c && ((f.label() || '') !== (c.label || c.name) || f.required() !== (c.required === true));
        });
      });
      this.resetEdit = resetEdit;
      this.saveEdit = () => {
        const s = this.screen();
        const model = clone(s.model);
        model.title = this.editTitle().trim() || model.title;
        model.sections.forEach((section) => section.components.forEach((c) => {
          const f = this.editFields().find((x) => x.id === c.id);
          if (f) {
            c.label = (f.label() || '').trim() || c.label;
            c.required = f.required() ? true : null;
          }
        }));
        return api.put('designs/' + s.id + '/model', { model: model, note: 'Quick edit in the Design Studio' })
          .then(() => reloadFlow())
          .then(() => toast.success('Saved as version ' + (screenById(s.id) ? screenById(s.id).currentVersion : '') + '.'))
          .catch(actionError);
      };

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
        api.post('designs/' + s.id + '/ai-change', { instruction: text, targetId: null })
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
        api.get('designs/' + s.id).then((detail) => {
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
        }).then((ok) => ok && api.post('designs/' + s.id + '/restore', { version: g })
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
      const models = {};
      const modelOf = (id, version) => {
        const s = screenById(id);
        if (s && s.currentVersion === version) {
          return Promise.resolve(s.model);
        }
        const key = id + '@' + version;
        if (!models[key]) {
          models[key] = api.get('designs/' + id + '/versions/' + version).catch((error) => { delete models[key]; throw error; });
        }
        return models[key];
      };
      this.differences = ko.observableArray([]);
      ko.computed(() => {
        const s = this.screen();
        const from = Number(this.compareFrom());
        const to = Number(this.compareTo());
        if (!s || !from || !to || this.tab() !== 'compare') {
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

      this.openInDesigner = () => {
        if (this.screen()) {
          pageRequests.design(this.screen().id);
        }
        navigate('designer');
      };
      this.addSteps = () => api.post('designs/' + this.screen().id + '/flow-screens')
        .then((created) => reloadFlow().then(() => toast.success(created.length + ' screens added after "' + this.screen().name + '".')))
        .catch(actionError);
      this.approveScreen = () => approve([this.screen().id]);
      this.reopenScreen = () => dialog.confirm({
        title: 'Reopen this screen?', message: 'It can be changed again, and has to be approved again before code is generated.', confirmLabel: 'Reopen'
      }).then((ok) => ok && api.post('designs/' + this.screen().id + '/reopen').then(() => reloadFlow()).catch(actionError));

      // --- summary of the selected group: channels, screens, fields and the components used ---

      this.facts = ko.pureComputed(() => {
        const list = this.flowScreens().map((s) => screenById(s.id)).filter(Boolean);
        const channels = [];
        list.forEach((s) => (s.channels || []).forEach((c) => { if (channels.indexOf(c) < 0) { channels.push(c); } }));
        const fields = list.reduce((n, s) => n + fieldsOf(s.model).length, 0);
        return [
          { label: 'Screens', value: String(list.length) },
          { label: 'Fields', value: String(fields) },
          { label: 'Channels', value: channels.length ? channels.map((c) => CHANNEL_WORDS[c] || c).join(', ') : 'All channels' },
          { label: 'Preview', value: this.previewKind() === 'jet' ? 'Oracle JET (OBDX)' : this.previewKind() === 'react' ? 'React' : 'React Native' }
        ];
      });
      this.componentsUsed = ko.pureComputed(() => {
        const counts = {};
        this.flowScreens().map((s) => screenById(s.id)).filter(Boolean).forEach((s) => {
          fieldsOf(s.model).forEach((c) => {
            const name = c.type === 'component' && c.component ? c.component : (catalog[c.type] || c.type);
            counts[name] = (counts[name] || 0) + 1;
          });
          if (s.model && s.model.actions.length) {
            counts.Button = (counts.Button || 0) + s.model.actions.length;
          }
        });
        return Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map((name) => ({ name: name, count: String(counts[name]) }));
      });

      // --- the stepper and the next action ---

      const change = ko.pureComputed(() => this.changes()[0] || null);
      const allApproved = ko.pureComputed(() => this.screens().length > 0 && this.screens().every((s) => s.status === 'APPROVED'));
      this.stage = ko.pureComputed(() => {
        const r = this.summary();
        if (!r) {
          return 1;
        }
        if (r.status !== 'APPROVED') {
          return 2;
        }
        if (this.screens().length === 0) {
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
        const total = this.screens().length;
        const approved = this.screens().filter((s) => s.status === 'APPROVED').length;
        const subs = [
          r ? (r.fileName || 'Text request') : 'Upload or pick one',
          r ? (r.status === 'APPROVED' ? 'Approved' : ui.status(r.status, r.status === 'READY' ? 'Needs your approval' : null).text) : 'Drafted by the AI',
          total ? total + ' screens' : 'From the approved spec',
          total ? approved + ' of ' + total + ' approved' : 'All screens of the BRD',
          change() ? ui.status(change().status).text : 'Plan, code and delivery'
        ];
        return ['BRD', 'Spec', 'Screens', 'Approve', 'Code'].map((label, i) => ({
          number: String(i + 1), label: label, sub: subs[i],
          css: 'factory-studio-stepper-item' + (i + 1 < stage ? ' is-done' : i + 1 === stage ? ' is-current' : ''),
          current: i + 1 === stage ? 'step' : null
        }));
      });
      this.next = ko.pureComputed(() => {
        const r = this.summary();
        switch (this.stage()) {
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
      this.barCss = ko.pureComputed(() => 'fx-card factory-studio-bar' + (this.next().tone ? ' factory-studio-bar--' + this.next().tone : ''));
      this.nextButtonCss = ko.pureComputed(() => 'fx-btn ' + (this.next().secondary ? 'fx-btn--secondary' : this.next().tone === 'success' ? 'fx-btn--success' : 'fx-btn--primary'));
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
      this.generate = () => api.post('requirements/' + this.requirementId() + '/designs')
        .then((created) => reloadFlow().then(() => toast.success(created.length + ' screens generated. Review them below.')))
        .catch(actionError);
      // Screens with elements the version pack forbids are refused (409 "Unsupported components: ..."): approving them is confirmed
      const UNSUPPORTED = 'Unsupported components: ';
      const approve = (ids, confirmed) => api.post('requirements/' + this.requirementId() + '/designs/approve' + (confirmed ? '?unsupported=true' : ''), { designIds: ids })
        .then((flow) => {
          const before = this.screens().filter((s) => s.status === 'APPROVED').length;
          setFlow(flow);
          const now = flow.screens.filter((s) => s.status === 'APPROVED').length;
          toast.success((now - before) + (now - before === 1 ? ' screen' : ' screens') + ' approved.'
            + (now === flow.screens.length ? ' Every screen is approved: you can generate the code.' : ''));
        })
        .catch((error) => (!confirmed && error.status === 409 && String(error.message).indexOf(UNSUPPORTED) === 0
          ? dialog.confirm({ title: 'Approve unsupported components?', message: error.message.substring(UNSUPPORTED.length).replace(/^./, (c) => c.toUpperCase()),
            confirmLabel: 'Approve Anyway', danger: true }).then((ok) => ok && approve(ids, true))
          : actionError(error)));
      this.approveGroup = () => approve(this.groupUnapproved());
      this.approveAll = () => dialog.confirm({
        title: 'Approve every screen?',
        message: 'All ' + this.screens().filter((s) => s.status !== 'APPROVED').length + ' remaining screens of this BRD are locked for development. You can reopen a screen later.',
        confirmLabel: 'Approve all'
      }).then((ok) => ok && approve(null));
      this.generateCode = () => api.post('requirements/' + this.requirementId() + '/changes')
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
            return loadRequirements().then(() => this.requirementId(detail.id));
          })
          .catch(actionError);
      };
      this.cancelUpload = () => this.chosenFile(null);

      this.pickGroup = (key) => {
        this.groupKey(key);
        const g = this.group();
        this.selectedScreenId(g && g.screens.length ? g.screens[0] : null);
      };

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
        const group = this.group();
        if (!allGroups().some((g) => g.key === this.groupKey())) {
          this.groupKey('all');
        }
        const ids = group ? group.screens : [];
        if (!this.selectedScreenId() || !screenById(this.selectedScreenId()) || ids.indexOf(this.selectedScreenId()) < 0) {
          this.selectedScreenId(this.group() && this.group().screens.length ? this.group().screens[0] : null);
        }
        resetEdit();
        loadVersions();
        // A change shows the current version again; the frame gets the new model (a new frame asks when ready)
        this.shownVersion(null);
        window.setTimeout(() => { observeStage(); sendAll(); }, 0);
      };
      const reloadFlow = () => {
        const id = this.requirementId();
        if (!id) {
          this.flow(null);
          this.changes([]);
          return Promise.resolve();
        }
        const mine = ++token;
        return Promise.all([api.get('requirements/' + id + '/design-flow'), api.get('workspaces/' + this.workspaceId() + '/changes/details').catch(() => [])])
          .then(([flow, changes]) => {
            if (mine !== token) {
              return;
            }
            this.changes(changes.filter((c) => c.requirementId === id && c.status !== 'CLOSED')
              .concat(changes.filter((c) => c.requirementId === id && c.status === 'CLOSED')));
            setFlow(flow);
          });
      };
      const loadRequirements = () => {
        const id = this.workspaceId();
        if (!id) {
          this.requirements([]);
          return Promise.resolve();
        }
        return api.get('workspaces/' + id + '/requirements').then((list) => {
          this.requirements(list);
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
        this.groupKey('all');
        this.selectedScreenId(null);
        this.errorMessage('');
        this.loading(true);
        reloadFlow().catch(showError).finally(() => this.loading(false));
        poll();
      });
      /** The BRD to open: asked for by another page, the last one used here, or the newest with screens or an approved spec. */
      const pickRequirement = (list) => {
        const wanted = pageRequests.studio();
        pageRequests.studio(null);
        const remembered = recall(storageKey(this.workspaceId()));
        const choice = [wanted, remembered].find((id) => id && list.some((r) => r.id === id))
          || (list.find((r) => r.status === 'APPROVED') || list[0] || {}).id || null;
        if (choice === this.requirementId()) {
          this.requirementId.valueHasMutated();
        } else {
          this.requirementId(choice);
        }
      };
      const loadTarget = (id) => api.get('workspaces/' + id + '/target')
        .then((target) => { if (id === this.workspaceId() && target.preview) { this.previewKind(target.preview); } })
        .catch(() => null);
      const loadWorkspace = () => {
        const id = this.workspaceId();
        this.flow(null);
        this.requirementId(null);
        if (!id) {
          this.requirements([]);
          return Promise.resolve();
        }
        loadTarget(id);
        return loadRequirements().then(pickRequirement).catch(showError);
      };

      let subscription = null;
      this.connected = () => {
        accUtils.announce('UI Design Studio loaded.');
        document.title = 'UI Design Studio';
        window.addEventListener('message', onMessage);
        if (window.ResizeObserver) {
          stageObserver = new ResizeObserver((entries) => this.stageWidth(entries[0].contentRect.width));
          observeStage();
        }
        api.get('design/catalog').then((types) => types.forEach((t) => { catalog[t.type] = t.label.replace(/ \(.*\)$/, ''); })).catch(() => null);
        subscription = this.workspaceId.subscribe(loadWorkspace);
        workspaceSelection.load().then((list) => {
          list.forEach((w) => { bankNames[w.id] = w.bankName; indexed[w.id] = w.indexedRevision !== null && w.indexedRevision !== undefined; });
          return loadWorkspace();
        }).catch(showError);
      };
      this.disconnected = () => {
        window.removeEventListener('message', onMessage);
        clearTimeout(pollTimer);
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
