/*
 * UI Design Studio: one page from a BRD to approved screens. A five-step stepper (BRD, spec, screens, approval, code)
 * with the next action; the BRD's functional requirements with the screens each one needs; the selected requirement's
 * description, rules and criteria beside its user flow and every screen in phone or desktop frames; refining a screen
 * (with the AI, or a quick edit of labels and mandatory flags); approving all of a requirement's screens at once; and
 * the hand-off to code generation. The Visual Designer stays for detailed work on one screen.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/previewFrame', '../services/pageRequests', '../services/toast', '../services/dialog', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, PreviewFrame, pageRequests, toast, dialog) {
    const POLL_MS = 4000;
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const DESIGN_WORDS = { DRAFT: 'Draft', IN_REVIEW: 'In review', APPROVED: 'Approved' };
    const STAGE_WORDS = { initiate: 'Enter details', review: 'Review', confirm: 'Confirmation', inquiry: 'List or details' };
    const CHANNEL_WORDS = { desktop: 'Desktop', tablet: 'Tablet', 'mobile-web': 'Mobile web', 'mobile-app': 'Mobile app' };
    const PRIORITY_TONES = { must: 'danger', high: 'danger', should: 'warning', medium: 'warning', could: 'info', low: 'info' };
    const priorityBadge = (priority) => (priority
      ? { text: priority, css: 'fx-badge fx-badge--plain fx-badge--' + (PRIORITY_TONES[priority.toLowerCase().split(/\W/)[0]] || 'neutral') }
      : null);
    const storageKey = (workspaceId) => 'factory.studio.requirement.' + workspaceId;
    const remember = (key, value) => { try { window.localStorage.setItem(key, value); } catch (e) { /* private window */ } };
    const recall = (key) => { try { return window.localStorage.getItem(key); } catch (e) { return null; } };
    const fieldsOf = (model) => (model ? model.sections.reduce((all, s) => all.concat(s.components), []) : []);
    const clone = (value) => JSON.parse(JSON.stringify(value));

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
          screens: flow.screens.map((s) => s.id), rules: flow.rules, criteria: flow.criteria
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
              count: g.screens.length === 0 ? 'No screen' : g.screens.length + (g.screens.length === 1 ? ' screen' : ' screens'),
              progress: g.screens.length === 0 ? '' : approved + '/' + g.screens.length + ' approved',
              progressCss: 'factory-studio-req-progress' + (g.screens.length > 0 && approved === g.screens.length ? ' is-done' : ''),
              css: ko.pureComputed(() => 'factory-studio-req' + (this.groupKey() === g.key ? ' is-selected' : '')),
              current: ko.pureComputed(() => (this.groupKey() === g.key ? 'true' : null)),
              pick: () => this.pickGroup(g.key)
            };
          });
      });
      this.group = ko.pureComputed(() => allGroups().find((g) => g.key === this.groupKey()) || allGroups()[0] || null);
      this.groupPriority = ko.pureComputed(() => (this.group() ? priorityBadge(this.group().priority) : null));
      this.groupRules = ko.pureComputed(() => (this.group() ? this.group().rules.map((r) => (r.id ? r.id + ': ' : '') + r.description) : []));
      this.groupCriteria = ko.pureComputed(() => (this.group() ? this.group().criteria.map((c) => (c.id ? c.id + ': ' : '') + c.description) : []));
      this.groupDescription = ko.pureComputed(() => {
        const g = this.group();
        return g && g.key !== 'all' && g.description && g.description !== g.title ? g.description : '';
      });
      this.missingScreens = ko.pureComputed(() => {
        const g = this.group();
        return g && g.screenNames && g.screens.length === 0 && g.screenNames.length > 0 ? g.screenNames.join(', ') : '';
      });

      // --- the selected group's screens, in flow order ---

      this.selectedScreenId = ko.observable(null);
      // One item per screen, kept while the screen is shown, so its phone frame is not loaded again after each change
      const items = {};
      const itemFor = (id) => {
        if (!items[id]) {
          const status = ko.observable(ui.status('DRAFT'));
          const approved = ko.observable(false);
          items[id] = {
            id: id, number: ko.observable(''), name: ko.observable(''), caption: ko.observable(''), stage: ko.observable(''),
            status: status, approved: approved, last: ko.observable(false),
            statusText: ko.pureComputed(() => status().text), statusCss: ko.pureComputed(() => status().css),
            statusIcon: ko.pureComputed(() => status().iconCss),
            css: ko.pureComputed(() => 'factory-studio-step' + (this.selectedScreenId() === id ? ' is-selected' : '') + (approved() ? ' is-approved' : '')),
            frameCss: ko.pureComputed(() => 'factory-studio-phone' + (this.selectedScreenId() === id ? ' is-selected' : '')),
            pressed: ko.pureComputed(() => (this.selectedScreenId() === id ? 'true' : 'false')),
            pick: () => this.selectedScreenId(id)
          };
        }
        return items[id];
      };
      // The list itself changes only when its screens do; otherwise the items update in place and the frames stay
      this.flowScreens = ko.observableArray([]);
      ko.computed(() => {
        const g = this.group();
        const list = g ? g.screens.map(screenById).filter(Boolean) : [];
        const next = list.map((s, i) => {
          const item = itemFor(s.id);
          item.number(String(i + 1));
          item.name(s.name);
          item.caption((i + 1) + '. ' + s.name);
          item.stage(STAGE_WORDS[s.stage] || 'Screen');
          item.status(ui.status(s.status, DESIGN_WORDS[s.status]));
          item.approved(s.status === 'APPROVED');
          item.last(i === list.length - 1);
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
      this.screenNeedsSteps = ko.pureComputed(() => !!this.screen() && this.screen().needsSteps && this.screenEditable());
      this.screenIndex = ko.pureComputed(() => this.flowScreens().findIndex((s) => s.id === this.selectedScreenId()));
      this.previousScreen = () => { const i = this.screenIndex(); if (i > 0) { this.selectedScreenId(this.flowScreens()[i - 1].id); } };
      this.nextScreen = () => { const i = this.screenIndex(); if (i >= 0 && i < this.flowScreens().length - 1) { this.selectedScreenId(this.flowScreens()[i + 1].id); } };
      this.hasPrevious = ko.pureComputed(() => this.screenIndex() > 0);
      this.hasNext = ko.pureComputed(() => this.screenIndex() >= 0 && this.screenIndex() < this.flowScreens().length - 1);
      this.desktopCaption = ko.pureComputed(() => {
        const i = this.screenIndex();
        return i < 0 ? '' : 'Screen ' + (i + 1) + ' of ' + this.flowScreens().length + ': ' + this.screen().name;
      });

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
        const list = this.flowScreens().map((s) => screenById(s.id));
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
        this.flowScreens().map((s) => screenById(s.id)).forEach((s) => {
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
              text: 'Check each requirement\'s flow below, refine screens with the AI or a quick edit, then approve them. Code is generated from approved screens only.',
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
      this.nextCss = ko.pureComputed(() => 'fx-card factory-studio-next' + (this.next().tone ? ' factory-studio-next--' + this.next().tone : ''));
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
      const approve = (ids) => api.post('requirements/' + this.requirementId() + '/designs/approve', { designIds: ids })
        .then((flow) => {
          const before = this.screens().filter((s) => s.status === 'APPROVED').length;
          setFlow(flow);
          const now = flow.screens.filter((s) => s.status === 'APPROVED').length;
          toast.success((now - before) + (now - before === 1 ? ' screen' : ' screens') + ' approved.'
            + (now === flow.screens.length ? ' Every screen is approved: you can generate the code.' : ''));
        })
        .catch(actionError);
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

      // --- the preview frames: one per screen (phone) or the selected one (desktop) ---

      this.device = ko.observable(recall('factory.studio.device') || 'phone');
      this.device.subscribe((d) => remember('factory.studio.device', d));
      this.devices = [['phone', 'Phone', 'factory-ico-phone'], ['desktop', 'Desktop', 'factory-ico-monitor']].map(([value, label, icon]) => ({
        label: label, icon: 'factory-nav-icon ' + icon,
        pressed: ko.pureComputed(() => (this.device() === value ? 'true' : 'false')),
        pick: () => this.device(value)
      }));
      this.isPhone = ko.pureComputed(() => this.device() === 'phone');
      this.previewKind = ko.observable('jet');
      this.previewSrc = ko.pureComputed(() => PreviewFrame.srcFor(this.previewKind()));
      const bankNames = {};
      const indexed = {};
      const codeImported = () => indexed[this.workspaceId()] !== false;
      const context = () => ({
        bank: bankNames[this.workspaceId()] || 'Online banking',
        breadcrumb: 'Dashboard' + (this.group() && this.group().key !== 'all' ? ' / ' + this.group().title : ''),
        warnings: {},
        editing: false
      });
      const frames = () => Array.prototype.slice.call(document.querySelectorAll('iframe[data-studio-screen]'));
      // A phone frame names its screen; the desktop frame ("selected") shows the selected one, so it never reloads
      const screenOf = (frame) => {
        const id = frame.getAttribute('data-studio-screen');
        return id === 'selected' ? this.selectedScreenId() : id;
      };
      const send = (frame) => {
        const s = screenById(screenOf(frame));
        if (s && s.model && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'factory-preview', model: clone(s.model), highlight: null, context: context() }, window.location.origin);
        }
      };
      const sendAll = () => frames().forEach(send);
      const onMessage = (event) => {
        if (event.origin !== window.location.origin || !event.data) {
          return;
        }
        const frame = frames().find((f) => f.contentWindow === event.source);
        if (!frame) {
          return;
        }
        if (event.data.type === 'factory-preview-ready') {
          send(frame);
        } else if (event.data.type === 'factory-preview-select') {
          this.selectedScreenId(screenOf(frame));
        }
      };
      // The desktop frame shows a 1280px page scaled to the width of its card
      this.stageWidth = ko.observable(900);
      this.desktopScale = ko.pureComputed(() => Math.min(1, Math.max(0.3, (this.stageWidth() - 2) / 1280)));
      this.desktopTransform = ko.pureComputed(() => 'scale(' + this.desktopScale() + ')');
      this.desktopHeight = ko.pureComputed(() => Math.round(800 * this.desktopScale()) + 'px');
      let stageObserver = null;
      const observeStage = () => {
        const stage = document.querySelector('.factory-studio-desktop');
        if (stageObserver && stage) {
          stageObserver.disconnect();
          stageObserver.observe(stage);
        }
      };
      this.device.subscribe(() => window.setTimeout(observeStage, 0));
      // The desktop frame stays loaded and shows whichever screen is selected
      this.selectedScreenId.subscribe(() => window.setTimeout(sendAll, 0));

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
        // Frames that stay on the page get the new models; new frames ask for theirs when they are ready
        window.setTimeout(sendAll, 0);
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
