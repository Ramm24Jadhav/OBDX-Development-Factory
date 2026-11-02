/*
 * Requirements page: the workspace's requirements as a searchable, filterable list (ID, title, source document, type,
 * spec status, the four workflow steps Home shows and the next step as a link to where it is taken), uploading a
 * BRD/FSD or describing a requirement in a panel above it, and the selected one with its lifecycle
 * (draft, analysis, approval, design, build, review, completed), its drafted specification by part (screens, business
 * rules, APIs, host interfaces, roles, open questions), traceability to screens and changes, and the actions: upload or
 * describe a requirement, answer open questions, update the spec with the answers, edit it as JSON, approve, retry and
 * delete.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/dialog', '../services/toast', '../services/pageRequests', '../services/dashboard', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, dialog, toast, pageRequests, dashboard) {
    const POLL_MS = 2000;
    // A status badge (design system fx-badge, with a dot) from the older tone names
    const TONES = { blue: 'primary', amber: 'warning', green: 'success', red: 'danger', violet: 'violet', grey: '' };
    const pill = (text, tone) => ({ text: text, css: 'fx-badge' + (TONES[tone] ? ' fx-badge--' + TONES[tone] : '') });
    // Server statuses in the shared categories (ui.status), with this page's own words
    const WORDS = { PROCESSING: 'In Progress', READY: 'In Review', APPROVED: 'Approved', FAILED: 'Failed' };
    const DESIGN_WORDS = { DRAFT: 'Draft', IN_REVIEW: 'In Review', APPROVED: 'Approved' };
    const CHANGE_WORDS = {
      ANALYZING: 'Analyzing', PLAN_READY: 'Plan ready', GENERATING: 'Generating', GENERATED: 'Generated',
      DELIVERED: 'Delivered', FAILED: 'Failed', CLOSED: 'Closed'
    };
    const reqStatus = (s) => ui.status(s, WORDS[s]);
    const shortId = (id) => 'REQ-' + id.replace(/-/g, '').slice(0, 4).toUpperCase();
    const fileType = (name) => {
      if (!name) {
        return 'Described';
      }
      const lower = name.toLowerCase();
      if (lower.indexOf('fsd') >= 0) {
        return 'FSD';
      }
      return lower.indexOf('brd') >= 0 ? 'BRD' : (name.split('.').pop() || 'Document').toUpperCase();
    };
    const size = (bytes) => (bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB');
    // What the server reads (DocumentTextExtractor) and its size limit (RequirementController)
    const ACCEPTED = ['.docx', '.doc', '.pdf', '.html', '.htm', '.txt', '.md'];
    const MAX_BYTES = 25 * 1024 * 1024;
    const NOT_STATED = 'Not stated in the specification';
    const day = (value) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
    // A spec part that may be text or a list of texts (or of objects with a description)
    const texts = (v) => (Array.isArray(v) ? v : (v ? [v] : [])).map((x) => (typeof x === 'string' ? x : (x.description || x.text || x.name || ''))).filter(Boolean);
    const saveFile = (name, text, type) => {
      const url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const copy = (text) => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('Copying is not available in this browser.')));

    function RequirementsViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
      this.canEdit = ko.pureComputed(() => session.can(this.workspaceId(), 'EDIT_REQUIREMENTS'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.busy = ko.observable(false);
      const items = ko.observableArray([]);
      // The first load of the list has not answered yet (loading state), or failed (listError)
      this.listLoading = ko.observable(true);
      this.listError = ko.observable('');
      this.listErrorText = ko.pureComputed(() => (/failed to fetch|networkerror|load failed/i.test(this.listError())
        ? 'Could not reach the factory. Check your connection, then try again.' : this.listError()));
      // With no requirements the list takes the whole width
      this.layoutCss = ko.pureComputed(() => 'factory-row factory-row-side factory-rq-layout'
        + (!this.listLoading() && items().length === 0 ? ' factory-rq-layout-empty' : ''));

      // New requirement: a document (creating 'upload') or a description ('text'), in a panel above the list
      this.creating = ko.observable(null);
      this.createError = ko.observable('');
      this.newTitle = ko.observable('');
      this.newText = ko.observable('');
      this.chosenFile = ko.observable(null);
      this.chosenFileName = ko.pureComputed(() => (this.chosenFile() ? this.chosenFile().name + ' (' + size(this.chosenFile().size) + ')' : 'No file chosen'));
      const focusLater = (id) => setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.focus();
        }
      }, 0);
      const startCreating = (kind) => {
        this.creating(kind);
        this.createError('');
        focusLater(kind === 'upload' ? 'reqFile' : 'reqText');
      };
      this.startUpload = () => startCreating('upload');
      this.startText = () => startCreating('text');
      this.cancelCreate = () => {
        const kind = this.creating();
        this.creating(null);
        this.createError('');
        focusLater(kind === 'upload' ? 'uploadTabButton' : 'newRequirementButton');
      };

      // Every screen design and change of the workspace (one request each): the list's progress and the selected
      // requirement's screens and changes
      const allDesigns = ko.observableArray([]);
      const allChanges = ko.observableArray([]);
      this.detail = ko.observable(null);
      this.designs = ko.pureComputed(() => (this.detail() ? allDesigns().filter((d) => d.requirementId === this.detail().id) : []));
      this.changes = ko.pureComputed(() => (this.detail() ? allChanges().filter((c) => c.requirementId === this.detail().id) : []));

      // The list: each requirement with its source, its spec status, where its workflow stands (Home's four steps)
      // and what to act on next
      this.total = ko.pureComputed(() => items().length);
      const entries = ko.pureComputed(() => items().map((r) => {
        const flow = dashboard.workflow(r, allDesigns(), allChanges(), this.workspaceId());
        const own = !flow.perm || session.can(this.workspaceId(), flow.perm);
        return Object.assign({}, r, { flow: flow, mine: !flow.finished && !!flow.perm && own, stage: flow.finished ? 'done' : String(flow.step) });
      }));

      // Search and filters. Only what a requirement records: spec status, workflow step, type and source document
      this.search = ko.observable('');
      this.statusFilter = ko.observable('');
      this.stageFilter = ko.observable('');
      this.typeFilter = ko.observable('');
      this.sourceFilter = ko.observable('');
      this.actionFilter = ko.observable(false);
      const counted = (label, n) => label + ' (' + n + ')';
      this.statusOptions = ko.pureComputed(() => [{ value: '', label: 'All statuses' }].concat(Object.keys(WORDS)
        .map((s) => ({ value: s, n: items().filter((r) => r.status === s).length }))
        .filter((o) => o.n > 0 || o.value === this.statusFilter())
        .map((o) => ({ value: o.value, label: counted(WORDS[o.value], o.n) }))));
      this.stageOptions = ko.pureComputed(() => [{ value: '', label: 'All steps' }].concat(['1', '2', '3', '4', 'done']
        .map((s) => ({ value: s, n: entries().filter((r) => r.stage === s).length }))
        .filter((o) => o.n > 0 || o.value === this.stageFilter())
        .map((o) => ({ value: o.value, label: counted(o.value === 'done' ? 'All steps done' : dashboard.steps[+o.value - 1], o.n) }))));
      const distinct = (key) => {
        const seen = {};
        items().forEach((r) => { seen[r[key]] = (seen[r[key]] || 0) + 1; });
        return Object.keys(seen).sort().map((v) => ({ value: v, label: counted(v, seen[v]) }));
      };
      this.typeOptions = ko.pureComputed(() => [{ value: '', label: 'All types' }].concat(distinct('type')));
      this.sourceOptions = ko.pureComputed(() => [{ value: '', label: 'All source documents' }].concat(distinct('source')));
      // A filter with a single choice filters nothing, so it is left out
      this.showTypeFilter = ko.pureComputed(() => this.typeOptions().length > 2 || !!this.typeFilter());
      this.showSourceFilter = ko.pureComputed(() => this.sourceOptions().length > 2 || !!this.sourceFilter());
      this.actionCount = ko.pureComputed(() => entries().filter((r) => r.mine).length);
      this.actionPressed = ko.pureComputed(() => String(this.actionFilter()));
      this.toggleAction = () => this.actionFilter(!this.actionFilter());
      this.activeFilters = ko.pureComputed(() => [this.statusFilter(), this.stageFilter(), this.typeFilter(), this.sourceFilter()].filter(Boolean).length);
      this.moreFilters = ko.observable(false);
      this.toggleFilters = () => this.moreFilters(!this.moreFilters());
      this.filterButtonCss = ko.pureComputed(() => 'fx-btn fx-btn--secondary fx-btn--icon factory-rq-filterbtn' + (this.moreFilters() ? ' factory-rq-filterbtn-on' : ''));
      this.filterLabel = ko.pureComputed(() => (this.moreFilters() ? 'Hide filters' : 'Show filters') + (this.activeFilters() ? ' (' + this.activeFilters() + ' on)' : ''));
      this.clearFilters = () => {
        this.search('');
        this.statusFilter('');
        this.stageFilter('');
        this.typeFilter('');
        this.sourceFilter('');
        this.actionFilter(false);
      };
      this.filtered = ko.pureComputed(() => !!(this.search() || '').trim() || this.activeFilters() > 0 || this.actionFilter());

      // Opens what a row's next step points at: on this page the requirement (its open questions when those are the
      // step), elsewhere the Design Studio or the change
      const act = (r) => () => {
        if (r.flow.target !== 'requirement') {
          r.flow.open();
          return;
        }
        this.open(r.id).then(() => {
          if (r.flow.questions) {
            this.part('questions');
          }
          focusLater('requirementDetailTitle');
        });
      };
      this.rows = ko.pureComputed(() => {
        const text = (this.search() || '').trim().toLowerCase();
        return entries().filter((r) => (!text || (r.code + ' ' + r.title + ' ' + r.source).toLowerCase().indexOf(text) >= 0)
          && (!this.statusFilter() || r.status === this.statusFilter())
          && (!this.stageFilter() || r.stage === this.stageFilter())
          && (!this.typeFilter() || r.type === this.typeFilter())
          && (!this.sourceFilter() || r.source === this.sourceFilter())
          && (!this.actionFilter() || r.mine))
          .map((r) => {
            const flow = r.flow;
            const selected = ko.pureComputed(() => !!this.detail() && this.detail().id === r.id);
            return Object.assign({}, r, {
              css: ko.pureComputed(() => 'factory-rq-row' + (selected() ? ' is-on' : '')),
              current: ko.pureComputed(() => (selected() ? 'true' : null)),
              select: () => this.openRow(r),
              sourceIcon: r.fileName ? 'factory-nav-icon factory-ico-doc' : 'factory-nav-icon factory-ico-edit',
              steps: flow.steps.map((st) => ({ name: st.name, css: 'factory-rq-step is-' + st.state })),
              stepText: flow.stepText,
              stepLabel: 'Progress: ' + flow.stepText,
              // The next step as a link, unless the workflow is finished
              next: flow.finished ? null : {
                status: flow.status,
                text: !flow.perm || r.mine ? flow.act : 'Waiting for ' + flow.who,
                label: flow.status.text + ': ' + (!flow.perm || r.mine ? flow.next : 'waiting for ' + flow.who) + ' Opens ' + flow.place + '.',
                go: act(r)
              }
            });
          });
      });
      this.shownText = ko.pureComputed(() => (this.filtered() ? this.rows().length + ' of ' + this.total() + ' shown' : ''));
      this.pageMenuItems = [
        { value: 'refresh', label: 'Refresh the list' },
        { value: 'csv', label: 'Download the list (CSV)' }
      ];
      this.pageMenu = (event) => {
        const value = event.detail.value;
        if (value === 'refresh') {
          loadList();
          loadLinks();
        } else if (value === 'csv') {
          const quote = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
          const lines = [['ID', 'Title', 'Source document', 'Type', 'Status', 'Progress', 'Screens', 'Open questions', 'Updated'].map(quote).join(',')]
            .concat(entries().map((r) => [r.code, r.title, r.source, r.type, r.statusPill.text, r.flow.stepText + ' · ' + r.flow.status.text,
              r.screens, r.openQuestions, r.updatedAt].map(quote).join(',')));
          saveFile('requirements.csv', lines.join('\r\n'), 'text/csv');
        }
      };

      // The selected requirement
      this.spec = ko.pureComputed(() => (this.detail() ? this.detail().spec : null));
      this.questions = ko.observableArray([]);
      this.editingJson = ko.observable(false);
      this.specJson = ko.observable('');
      this.part = ko.observable('specification');
      const n = (key) => ko.pureComputed(() => (this.spec() ? (this.spec()[key] || []).length : 0));
      this.parts = ui.tabs(this.part, [
        { value: 'specification', label: 'Specification' },
        { value: 'screens', label: 'Screens', count: n('screens') },
        { value: 'rules', label: 'Business Rules', count: n('businessRules') },
        { value: 'apis', label: 'APIs', count: n('apis') },
        { value: 'hosts', label: 'Host Interfaces', count: n('hostInteractions') },
        { value: 'roles', label: 'Roles', count: n('roles') },
        { value: 'questions', label: 'Open Questions', count: n('openQuestions') },
        { value: 'trace', label: 'Traceability' }
      ]);
      this.code = ko.pureComputed(() => (this.detail() ? shortId(this.detail().id) : ''));
      this.statusPill = ko.pureComputed(() => reqStatus(this.detail() ? this.detail().status : 'PROCESSING'));
      // While the spec is drafted the page polls the requirement; this is when it last did
      this.drafting = ko.pureComputed(() => !!this.detail() && this.detail().status === 'PROCESSING');
      this.lastChecked = ko.observable('');
      this.draftingText = ko.pureComputed(() => 'Drafting the specification. The page checks every ' + (POLL_MS / 1000)
        + ' seconds' + (this.lastChecked() ? ', last at ' + this.lastChecked() : '') + ', and tells you when it is ready.');
      this.canMakeScreens = ko.pureComputed(() => !!this.detail() && this.detail().status === 'APPROVED' && this.canEdit());
      this.typeText = ko.pureComputed(() => (this.detail() ? fileType(this.detail().fileName) : ''));
      this.modulePill = ko.pureComputed(() => {
        const s = this.spec();
        return s && s.module ? { text: s.module, css: 'fx-badge fx-badge--violet', title: 'Module' }
          : Object.assign(pill('Module not set', 'grey'), { title: 'The specification does not record a module.' });
      });
      this.priorityPill = ko.pureComputed(() => {
        const s = this.spec();
        const p = s && s.priority ? String(s.priority) : '';
        const tone = /high|critical/i.test(p) ? 'red' : /medium/i.test(p) ? 'amber' : 'grey';
        return p ? Object.assign(pill(p, tone), { title: 'Priority' })
          : Object.assign(pill('Not set', 'grey'), { title: 'The specification does not record a priority.' });
      });
      this.canEditSpec = ko.pureComputed(() => !!this.spec() && this.canEdit() && this.detail().status !== 'APPROVED');
      this.editBlockedReason = ko.pureComputed(() => {
        const d = this.detail();
        if (!d || !d.spec) {
          return 'There is no specification to edit yet.';
        }
        if (!this.canEdit()) {
          return 'You cannot edit requirements in this workspace.';
        }
        return 'An approved requirement is locked. Start a new requirement for further changes.';
      });
      this.relatedChanges = ko.pureComputed(() => this.changes().map((c) => 'CHG-' + c.id.replace(/-/g, '').slice(0, 3).toUpperCase()).join(', ') || 'None');

      // Lifecycle: each stage is done, current or to come
      this.stages = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const designs = this.designs();
        const changes = this.changes();
        const approved = d.status === 'APPROVED';
        const designed = designs.length > 0 && designs.every((s) => s.status === 'APPROVED');
        const built = changes.some((c) => ['GENERATED', 'DELIVERED', 'CLOSED'].indexOf(c.status) >= 0);
        const reviewed = changes.some((c) => c.status === 'DELIVERED' || c.status === 'CLOSED');
        const completed = changes.some((c) => c.status === 'CLOSED' && c.closedReason === 'MERGED');
        const done = [true, d.status !== 'PROCESSING', approved, designed, built, reviewed, completed];
        const failed = d.status === 'FAILED';
        const names = ['Draft', 'Analysis', 'Approved', 'Design', 'Build', 'Review', 'Completed'];
        const current = done.indexOf(false);
        return names.map((name, i) => ({
          name: name, number: i + 1,
          css: 'factory-' + (failed ? (i === 0 ? 'st-done' : i === 1 ? 'st-failed' : 'st-todo')
            : (done[i] ? 'st-done' : (i === current ? 'st-now' : 'st-todo'))),
          check: failed ? i === 0 : done[i]
        }));
      });

      this.overview = ko.pureComputed(() => {
        const s = this.spec();
        if (!s) {
          return [];
        }
        const row = (label, list, fallback) => (list.length > 1 ? { label: label, list: list, value: '' }
          : { label: label, list: null, value: list[0] || fallback, missing: !list.length });
        // Scope: what the spec says will be built, when it does not state the scope itself
        const scope = texts(s.scope).length ? texts(s.scope)
          : s.screens.map((x) => (x.changeType === 'new' ? 'New screen ' : x.changeType === 'enhance' ? 'Change to screen ' : 'Screen ') + x.name)
            .concat(s.apis.map((a) => 'API ' + a.name), s.hostInteractions.map((h) => 'Host interface ' + h.system));
        return [
          row('Business Objective', texts(s.objective || s.businessObjective || s.summary || s.title), NOT_STATED),
          row('Scope', scope, NOT_STATED),
          row('Out of Scope', texts(s.outOfScope), NOT_STATED),
          row('Target Users', texts(s.targetUsers).length ? texts(s.targetUsers) : [s.roles.map((r) => r.name).join(', ')].filter(Boolean), NOT_STATED),
          row('Assumptions', texts(s.assumptions), NOT_STATED),
          row('Decisions', (s.decisions || []).map((x) => x.question + ' ' + x.answer), 'None yet')
        ];
      });
      // Acceptance criteria: the spec's own, or what can be checked from its screens, messages and roles
      this.criteria = ko.pureComputed(() => {
        const s = this.spec();
        if (!s) {
          return { items: [], note: '' };
        }
        // The document's own, with their IDs and the requirements they verify
        const own = (s.acceptanceCriteria || []).filter((c) => c.description).map((c) => (c.id ? c.id + ' · ' : '') + c.description
          + ((c.requirements || []).length ? ' (verifies ' + c.requirements.join(', ') + ')' : ''));
        if (own.length) {
          return { items: own, note: '' };
        }
        const items = [];
        s.screens.forEach((screen) => {
          const required = screen.fields.filter((f) => f.mandatory === true).map((f) => f.label || f.name);
          if (required.length) {
            items.push(screen.name + ' requires ' + required.slice(0, 4).join(', ') + (required.length > 4 ? ' and ' + (required.length - 4) + ' more' : ''));
          }
          screen.actions.forEach((a) => items.push(screen.name + ': ' + a.name + (a.description ? ' – ' + a.description : '')));
        });
        (s.messages || []).forEach((m) => items.push('Shows "' + m.text + '"' + (m.type ? ' (' + m.type + ')' : '')));
        s.roles.filter((r) => r.access).forEach((r) => items.push(r.name + ': ' + r.access));
        return {
          items: items,
          note: items.length ? 'Worked out from the screens, messages and roles: the specification has no acceptance criteria yet. Add them with Edit the specification (JSON) in the requirement actions menu.' : ''
        };
      });
      this.rules = ko.pureComputed(() => (this.spec() ? this.spec().businessRules.map((r) => Object.assign({}, r, {
        text: (r.id ? r.id + ' · ' : '') + r.description
      })) : []));
      // Traceability: each functional requirement of the document with its priority, screens and the acceptance
      // criteria that verify it
      this.traceRows = ko.pureComputed(() => {
        const s = this.spec();
        if (!s) {
          return [];
        }
        const criteria = s.acceptanceCriteria || [];
        return (s.requirements || []).map((r) => {
          const verified = criteria.filter((c) => (c.requirements || []).indexOf(r.id) >= 0).map((c) => c.id).filter(Boolean);
          const priority = (r.priority || '').toLowerCase();
          return {
            id: r.id || '–',
            title: r.title || '',
            description: r.description || '',
            priority: r.priority ? pill(r.priority, priority === 'must' ? 'blue' : priority === 'should' ? 'amber' : 'grey') : null,
            screens: (r.screens || []).join(', ') || '–',
            criteria: verified.join(', ') || 'None',
            untested: verified.length === 0
          };
        });
      });
      this.nonFunctional = ko.pureComputed(() => (this.spec() ? (this.spec().nonFunctional || []).map((n) => ({
        text: [n.id, n.category].filter(Boolean).join(' · ') + (n.id || n.category ? ': ' : '') + n.description
      })) : []));
      this.screens = ko.pureComputed(() => (this.spec() ? this.spec().screens.map((s) => Object.assign({}, s, {
        kind: s.changeType === 'new' ? pill('New', 'blue') : s.changeType === 'enhance' ? pill('Change', 'amber') : pill('Unknown', 'grey'),
        fieldCount: s.fields.length + ' fields', actionNames: s.actions.map((a) => a.name).join(', '),
        fieldRows: s.fields.map((f) => Object.assign({}, f, {
          mandatoryText: f.mandatory === true ? 'Yes' : f.mandatory === false ? 'No' : 'Not stated',
          rules: (f.validations || []).join('; ')
        }))
      })) : []));
      this.apis = ko.pureComputed(() => (this.spec() ? this.spec().apis : []));
      this.hosts = ko.pureComputed(() => (this.spec() ? this.spec().hostInteractions : []));
      this.roles = ko.pureComputed(() => (this.spec() ? this.spec().roles : []));
      this.messages = ko.pureComputed(() => (this.spec() ? this.spec().messages : []));
      this.attachment = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        return d.fileName ? [{ name: d.fileName, type: fileType(d.fileName), size: size(d.sizeBytes), uploaded: day(d.createdAt) }]
          : (d.documentText ? [{ name: 'Description', type: 'Text', size: size(d.sizeBytes || d.documentText.length), uploaded: day(d.createdAt) }] : []);
      });
      this.showingText = ko.observable(false);
      this.downloadText = () => {
        const d = this.detail();
        saveFile((d.fileName ? d.fileName.replace(/\.[^.]+$/, '') : d.title) + '.txt', d.documentText || '');
      };
      this.attachmentMenuItems = ko.pureComputed(() => [
        { value: 'copy', label: 'Copy the text' },
        { value: 'show', label: this.showingText() ? 'Hide the text' : 'Show the text' }
      ]);
      this.attachmentMenu = (event) => {
        if (event.detail.value === 'copy') {
          copy(this.detail().documentText || '').then(() => toast.success('Text copied.')).catch(failed);
        } else {
          this.showingText(!this.showingText());
        }
      };
      this.stakeholders = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const list = d.approvedBy ? [{ name: d.approvedBy, role: 'Approver', department: 'Not recorded' }] : [];
        return list.concat(this.roles().map((r) => ({ name: r.name, role: 'User role (spec)', department: 'Not recorded' })));
      });

      // Other requirements of the workspace, with what they share with this one
      const otherSpecs = ko.observable({});
      this.related = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const mine = d.spec ? d.spec.screens : [];
        const myScreens = mine.map((x) => x.name);
        const myCode = [].concat(...mine.map((x) => x.relatedCode || []));
        return items().filter((r) => r.id !== d.id).map((r) => {
          const spec = otherSpecs()[r.id];
          const screens = spec ? spec.screens.filter((x) => myScreens.includes(x.name)).map((x) => x.name) : [];
          const code = spec ? [].concat(...spec.screens.map((x) => x.relatedCode || [])).filter((c) => myCode.includes(c)) : [];
          return {
            code: r.code, title: r.title, statusPill: r.statusPill, openAction: r.openAction,
            relationship: screens.length ? 'Shares the screen ' + screens.join(', ')
              : code.length ? 'Touches the same code: ' + code[0].split('/').pop() + (code.length > 1 ? ' and ' + (code.length - 1) + ' more' : '')
                : 'Same workspace'
          };
        });
      });
      const loadOtherSpecs = (list) => {
        const known = otherSpecs();
        Promise.all(list.filter((r) => !(r.id in known)).slice(0, 20).map((r) => api.get('requirements/' + r.id)
          .then((x) => [r.id, x.spec || { screens: [] }]).catch(() => [r.id, { screens: [] }])))
          .then((pairs) => {
            if (pairs.length) {
              const next = Object.assign({}, otherSpecs());
              pairs.forEach((p) => { next[p[0]] = p[1]; });
              otherSpecs(next);
            }
          });
      };
      this.viewAll = () => {
        this.search('');
        this.statusFilter('');
        this.typeFilter('');
        ['reqSearch', 'reqStatusFilter', 'reqTypeFilter'].forEach((id) => {
          const el = document.getElementById(id);
          if (el) {
            el.value = '';
          }
        });
        const list = document.querySelector('.factory-rq-listcard');
        if (list) {
          list.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
      this.showRules = () => this.part('rules');
      this.trace = ko.pureComputed(() => {
        const s = this.spec();
        if (!s) {
          return [];
        }
        return s.screens.map((screen) => {
          const design = this.designs().find((d) => d.name === screen.name);
          return {
            screen: screen.name,
            design: design ? design.name + ' v' + design.currentVersion : 'Not designed yet',
            designStatus: design ? ui.status(design.status, DESIGN_WORDS[design.status]) : ui.status('NOT_STARTED', 'Not started'),
            code: screen.relatedCode.slice(0, 3).join(', ') || 'No related code found',
            change: this.changes().length ? this.changes().map((c) => c.title).join(', ') : 'No change yet'
          };
        });
      });
      this.changeRows = ko.pureComputed(() => this.changes().map((c) => ({
        title: c.title, status: ui.status(c.status, CHANGE_WORDS[c.status]), files: c.files.length + ' files', updated: day(c.updatedAt),
        open: () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }))
      })));
      this.designRows = ko.pureComputed(() => this.designs().map((d) => ({
        name: d.name, status: ui.status(d.status, DESIGN_WORDS[d.status]), version: 'v' + d.currentVersion, updated: day(d.updatedAt),
        open: () => { pageRequests.studio(this.detail() ? this.detail().id : null); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'studio' })); }
      })));

      let pollTimer = null;
      const showError = (error) => this.errorMessage(error.message);
      // After an action: the error stays on the page and a toast says it failed
      const failed = (error) => { showError(error); toast.error(error.message); };

      const loadList = () => {
        const id = this.workspaceId();
        if (!id) {
          items([]);
          this.listLoading(false);
          return Promise.resolve();
        }
        return api.get('workspaces/' + id + '/requirements').then((list) => {
          if (id !== this.workspaceId()) {
            return;
          }
          items(list.map((r) => Object.assign({}, r, {
            code: shortId(r.id), type: fileType(r.fileName), statusPill: reqStatus(r.status),
            source: r.fileName || 'Typed description',
            updated: day(r.updatedAt),
            openAction: () => this.open(r.id)
          })));
          this.listError('');
          if (!this.detail() && list.length) {
            this.open(list[0].id);
          }
          loadOtherSpecs(list);
        }).catch((error) => this.listError(error.message)).finally(() => this.listLoading(false));
      };
      this.retryList = () => {
        this.listLoading(true);
        loadList();
        loadLinks();
      };

      /**
       * An open question with its options as buttons. Picking an option replaces an empty answer or another option,
       * and is added to an answer the analyst typed, so several options can be combined.
       */
      const question = (q, editable) => {
        const answerValue = ko.observable(q.answer || '');
        const options = (q.options || []).slice();
        if (q.suggestedAnswer && !options.includes(q.suggestedAnswer)) {
          options.unshift(q.suggestedAnswer);
        }
        const parts = () => answerValue().split(';').map((part) => part.trim()).filter(Boolean);
        return {
          question: q.question,
          context: (q.reason || '') + (q.reference ? ' (' + q.reference + ')' : ''),
          editable: editable,
          suggestedAnswer: q.suggestedAnswer || '',
          answerValue: answerValue,
          answered: ko.pureComputed(() => !!answerValue().trim()),
          options: options.map((option) => ({
            label: option === q.suggestedAnswer ? option + ' (usual)' : option,
            editable: editable,
            css: ko.pureComputed(() => 'fx-chip' + (parts().includes(option) ? ' is-on' : '')),
            pick: () => {
              const current = answerValue().trim();
              if (!current || options.includes(current)) {
                answerValue(option);
              } else if (!parts().includes(option)) {
                answerValue(current + '; ' + option);
              }
            }
          }))
        };
      };
      this.hasSuggestions = ko.pureComputed(() => this.questions().some((q) => q.editable && q.suggestedAnswer && !q.answerValue().trim()));
      this.useSuggestions = () => this.questions().forEach((q) => {
        if (q.suggestedAnswer && !q.answerValue().trim()) {
          q.answerValue(q.suggestedAnswer);
        }
      });

      // The workspace's screen designs and changes (with their builds). Without them the progress shows only the spec.
      const loadLinks = () => {
        const id = this.workspaceId();
        if (!id) {
          allDesigns([]);
          allChanges([]);
          return;
        }
        api.get('workspaces/' + id + '/designs').then((list) => { if (id === this.workspaceId()) { allDesigns(list); } }).catch(() => allDesigns([]));
        api.get('workspaces/' + id + '/changes/details').then((list) => { if (id === this.workspaceId()) { allChanges(list); } }).catch(() => allChanges([]));
      };
      const show = (detail) => {
        const same = this.detail() && this.detail().id === detail.id;
        if (!same) {
          this.showingText(false);
        }
        // Drafting finished while the page was watching it
        if (same && this.detail().status === 'PROCESSING' && detail.status !== 'PROCESSING') {
          if (detail.status === 'FAILED') {
            toast.error('Drafting failed for ' + shortId(detail.id) + (detail.message ? ': ' + detail.message : '. Use Try again.'));
          } else {
            toast.success('The specification for ' + shortId(detail.id) + ' is ready to review.');
          }
        }
        this.lastChecked(new Date().toLocaleTimeString());
        this.detail(detail);
        this.errorMessage('');
        this.questions(detail.spec ? detail.spec.openQuestions.map((q) => question(q, detail.status === 'READY' && this.canEdit())) : []);
        if (this.editingJson()) {
          this.specJson(detail.spec ? JSON.stringify(detail.spec, null, 2) : '');
        }
        clearTimeout(pollTimer);
        if (detail.status === 'PROCESSING') {
          pollTimer = setTimeout(() => this.open(detail.id), POLL_MS);
        }
        loadList();
      };
      this.open = (id) => api.get('requirements/' + id).then(show).catch(showError);
      // A row of the list: opens it, then moves to it when the detail sits below the list (narrow windows)
      this.openRow = (r) => this.open(r.id).then(() => {
        const panel = document.getElementById('requirementDetail');
        if (panel && window.matchMedia('(max-width: 1000px)').matches) {
          panel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        }
      });

      // The native picker: keep the file and empty the box so the same file can be chosen again after an upload
      this.fileSelected = (event) => {
        const file = event.target.files[0] || null;
        event.target.value = '';
        this.createError('');
        const ext = file ? (file.name.split('.').pop() || '').toLowerCase() : '';
        if (file && ACCEPTED.indexOf('.' + ext) < 0) {
          this.chosenFile(null);
          this.createError(file.name + ' is not a document the factory can read. Choose a Word (.docx, .doc), PDF, HTML, .txt or .md file.');
        } else if (file && file.size > MAX_BYTES) {
          this.chosenFile(null);
          this.createError(file.name + ' is ' + size(file.size) + ', larger than 25 MB. Remove large images or split it, then choose it again.');
        } else {
          this.chosenFile(file);
        }
      };
      // An upload or a description that was not accepted: said in the panel, with the server's reason
      const createFailed = (error) => {
        this.createError(/failed to fetch|networkerror|load failed/i.test(error.message)
          ? 'Could not reach the factory. Check your connection, then try again.' : error.message);
        focusLater('createError');
      };
      this.upload = () => {
        const form = new FormData();
        form.append('file', this.chosenFile());
        if (this.newTitle()) {
          form.append('title', this.newTitle());
        }
        this.busy(true);
        api.upload('workspaces/' + this.workspaceId() + '/requirements', form)
          .then((detail) => { this.chosenFile(null); this.newTitle(''); this.creating(null); show(detail); toast.success('Document uploaded. The factory is drafting the specification.'); })
          .catch(createFailed)
          .finally(() => this.busy(false));
      };
      this.submitText = () => {
        this.busy(true);
        api.post('workspaces/' + this.workspaceId() + '/requirements/text', { title: this.newTitle() || null, text: this.newText() })
          .then((detail) => { this.newText(''); this.newTitle(''); this.creating(null); show(detail); toast.success('Requirement added. The factory is drafting the specification.'); })
          .catch(createFailed)
          .finally(() => this.busy(false));
      };

      const answers = () => this.questions().map((q, index) => ({ index: index, answer: q.answerValue() }));
      const base = () => 'requirements/' + this.detail().id;
      this.saveAnswers = () => api.put(base() + '/answers', { answers: answers() }).then((d) => { show(d); toast.success('Answers saved.'); }).catch(failed);
      this.refine = () => api.put(base() + '/answers', { answers: answers() })
        .then(() => api.post(base() + '/refine'))
        .then((d) => { show(d); toast.info('Updating the specification with the answers.'); })
        .catch(failed);
      this.approve = () => api.post(base() + '/approve').then((d) => { show(d); toast.success('Requirement approved.'); }).catch(failed);
      this.retry = () => api.post(base() + '/retry').then((d) => { show(d); toast.info('Drafting the specification again.'); }).catch(failed);
      this.remove = () => {
        dialog.confirm({ title: 'Delete this requirement?', message: 'The requirement and its drafted specification are deleted. This cannot be undone.', confirmLabel: 'Delete', danger: true }).then((ok) => {
          if (!ok) {
            return;
          }
          api.del(base()).then(() => { this.detail(null); loadList(); toast.success('Requirement deleted.'); }).catch(failed);
        });
      };
      this.toggleJson = () => {
        this.editingJson(!this.editingJson());
        this.specJson(this.editingJson() && this.spec() ? JSON.stringify(this.spec(), null, 2) : '');
      };
      this.saveJson = () => api.put(base() + '/spec', this.specJson())
        .then((detail) => { this.editingJson(false); show(detail); toast.success('Specification saved.'); })
        .catch(failed);
      this.makeScreens = () => api.post(base() + '/designs')
        .then(() => { toast.success('Screens generated. Review them in the Design Studio.'); pageRequests.studio(this.detail().id); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'studio' })); })
        .catch(failed);
      this.planChange = () => api.post(base() + '/changes')
        .then(() => { toast.success('Change planned.'); window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' })); })
        .catch(failed);
      this.detailMenuItems = ko.pureComputed(() => {
        const d = this.detail();
        const approved = !!d && d.status === 'APPROVED' && this.canEdit();
        // Editing the JSON is rarely needed, so it waits here rather than beside Approve
        return [
          { value: 'screens', label: 'Make screens in the designer', disabled: !approved },
          { value: 'change', label: 'Plan the change', disabled: !approved },
          { separator: true },
          { value: 'json', label: this.editingJson() ? 'Close the JSON editor' : 'Edit the specification (JSON)', id: 'editJsonButton',
            disabled: !this.canEditSpec() && !this.editingJson(), title: this.canEditSpec() ? null : this.editBlockedReason() },
          { value: 'copy', label: 'Copy the specification (JSON)' },
          { value: 'delete', label: 'Delete', disabled: !this.canEdit(), danger: true }
        ];
      });
      this.detailMenu = (event) => {
        const value = event.detail.value;
        if (value === 'screens') {
          this.makeScreens();
        } else if (value === 'change') {
          this.planChange();
        } else if (value === 'json') {
          this.toggleJson();
        } else if (value === 'copy') {
          copy(JSON.stringify(this.spec(), null, 2)).then(() => toast.success('Specification copied.')).catch(failed);
        } else if (value === 'delete') {
          this.remove();
        }
      };
      this.createdText = ko.pureComputed(() => (this.detail() ? new Date(this.detail().createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''));
      this.updatedText = ko.pureComputed(() => (this.detail() ? new Date(this.detail().updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''));

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Requirements page loaded.');
        document.title = 'Requirements';
        subscription = this.workspaceId.subscribe(() => {
          clearTimeout(pollTimer);
          this.detail(null);
          items([]);
          this.listLoading(true);
          this.clearFilters();
          loadList();
          loadLinks();
        });
        // A requirement asked for from another page (the command palette), or a new one (Home, the palette)
        workspaceSelection.load().then(() => { loadLinks(); return loadList(); }).then(() => {
          const wanted = pageRequests.requirement();
          if (wanted) { pageRequests.requirement(null); this.open(wanted); }
          const create = pageRequests.newRequirement();
          if (create) {
            pageRequests.newRequirement(null);
            if (this.canEdit()) {
              startCreating(create);
            }
          }
        }).catch((error) => { this.listError(error.message); this.listLoading(false); });
      };
      this.disconnected = () => {
        clearTimeout(pollTimer);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return RequirementsViewModel;
  }
);
