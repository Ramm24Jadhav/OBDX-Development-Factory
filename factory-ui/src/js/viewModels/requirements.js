/*
 * Requirements page. It leads with what is waiting: the four workflow stages (and Done) with how many requirements are
 * at each and how many need the user, each a filter. Then the list: chips by spec status (and Needs you) with counts, a
 * search and the type and source filters; compact rows with the title, ID, type and source, a stage chip, the state,
 * whether the step is the user's, when it changed, the next step as a link and a ⋯ menu. New requirement opens a side
 * panel: upload a BRD/FSD (or drop it) or describe it.
 *
 * The selected requirement sits beside the list: one header (title, ID line, stage and state, the one next action,
 * Source and history, a ⋯ menu), the four stages with what was recorded at each, one problem bar for the most
 * important blocker (or the next step in one line), and its specification in up to six tabs (Overview with roles,
 * Requirements with the criteria that verify them, Rules and APIs, Screens, Questions, Traceability), with the
 * document's own wording told apart from what the factory drafted. The source document and the versions are in a side
 * panel. Actions: answer open questions, update the spec with the answers, edit it as JSON, approve, retry, make the
 * screens, plan the change and delete.
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
    // The spec status chips of the list (with Needs you first): value, words, dot
    const CHIPS = [['mine', 'Needs you', ''], ['PROCESSING', 'Drafting', 'is-primary'], ['READY', 'Spec in review', 'is-warning'],
      ['APPROVED', 'Spec approved', 'is-success'], ['FAILED', 'Drafting failed', 'is-danger']];
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
    const day = (value) => (value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
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
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const smooth = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

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
      this.layoutCss = ko.pureComputed(() => 'factory-rq-layout' + (!this.listLoading() && items().length === 0 ? ' factory-rq-layout-empty' : ''));
      const focusLater = (id, wait) => setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.focus();
        }
      }, wait || 0);

      // New requirement: a side panel with a document (creating 'upload') or a description ('text')
      this.createOpen = ko.observable(false);
      this.creating = ko.observable('upload');
      this.createError = ko.observable('');
      this.newTitle = ko.observable('');
      this.newText = ko.observable('');
      this.chosenFile = ko.observable(null);
      this.chosenFileName = ko.pureComputed(() => (this.chosenFile() ? this.chosenFile().name + ' (' + size(this.chosenFile().size) + ')' : 'No file chosen'));
      // The sheet focuses its Close button first; the field gets the focus after it
      const startCreating = (kind) => {
        this.creating(kind);
        this.createError('');
        this.createOpen(true);
        focusLater(kind === 'upload' ? 'reqFile' : 'reqText', 80);
      };
      this.startUpload = () => startCreating('upload');
      this.startText = () => startCreating('text');
      this.startNew = () => startCreating(this.creating() || 'upload');
      this.cancelCreate = () => this.createOpen(false);
      this.createOpen.subscribe((open) => { if (!open) { this.createError(''); this.dragging(false); } });
      this.dragging = ko.observable(false);
      this.dropCss = ko.pureComputed(() => 'factory-rq-drop' + (this.dragging() ? ' is-over' : ''));

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

      // Search and filters. Only what a requirement records: spec status (or Needs you), stage, type and source document
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
      // The stages: how many requirements are at each, how many of those failed or need the user; a box filters the list
      const STAGES = [['1', 'Spec'], ['2', 'Screens'], ['3', 'Plan'], ['4', 'Code'], ['done', 'Done']];
      this.stages = ko.pureComputed(() => STAGES.map((s) => {
        const at = entries().filter((r) => r.stage === s[0]);
        const failed = at.filter((r) => r.flow.status.category === 'failed').length;
        const mine = at.filter((r) => r.mine).length;
        const parts = [failed ? failed + ' failed' : '', mine ? mine + ' need' + (mine === 1 ? 's' : '') + ' you' : ''].filter(Boolean);
        const sub = s[0] === 'done' ? (at.length ? 'Delivered or closed' : 'None yet') : (parts.join(' · ') || (at.length ? 'Nothing needs you' : 'None now'));
        return {
          value: s[0], name: s[1], done: s[0] === 'done', count: at.length, sub: sub,
          css: 'factory-rq-stage' + (at.length ? ' has-work' : '') + (failed ? ' has-failed' : (mine ? ' has-mine' : '')),
          label: s[1] + ': ' + plural(at.length, 'requirement') + ', ' + sub + '. ' + (this.stageFilter() === s[0] ? 'Shown; choose again to show all.' : 'Show only these.'),
          pressed: ko.pureComputed(() => String(this.stageFilter() === s[0])),
          pick: () => this.stageFilter(this.stageFilter() === s[0] ? '' : s[0])
        };
      }));
      this.stageOptions = ko.pureComputed(() => [{ value: '', label: 'All steps' }].concat(this.stages().filter((s) => s.count > 0 || s.value === this.stageFilter())
        .map((s) => ({ value: s.value, label: counted(s.value === 'done' ? 'All steps done' : s.name, s.count) }))));
      // The chips: All, Needs you and each spec status some requirement has (or that is chosen)
      this.actionCount = ko.pureComputed(() => entries().filter((r) => r.mine).length);
      this.chips = ko.pureComputed(() => {
        const n = (v) => (v === 'mine' ? this.actionCount() : items().filter((r) => r.status === v).length);
        const on = (v) => (v === 'mine' ? this.actionFilter() : !this.actionFilter() && this.statusFilter() === v);
        return [{ value: '', text: 'All ' + items().length, title: 'Every requirement', dot: '',
          pressed: ko.pureComputed(() => String(!this.actionFilter() && !this.statusFilter())), pick: () => { this.actionFilter(false); this.statusFilter(''); } }]
          .concat(CHIPS.filter((c) => n(c[0]) > 0 || on(c[0])).map((c) => ({
            value: c[0], text: c[1] + ' ' + n(c[0]), dot: c[2] ? 'factory-rq-fdot ' + c[2] : '',
            title: c[0] === 'mine' ? 'Requirements whose next step is yours' : 'Spec status: ' + WORDS[c[0]],
            pressed: ko.pureComputed(() => String(on(c[0]))),
            pick: () => {
              if (c[0] === 'mine') {
                this.statusFilter('');
                this.actionFilter(!this.actionFilter());
              } else {
                this.actionFilter(false);
                this.statusFilter(this.statusFilter() === c[0] ? '' : c[0]);
              }
            }
          })));
      });
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
      this.actionPressed = ko.pureComputed(() => String(this.actionFilter()));
      this.toggleAction = () => { this.statusFilter(''); this.actionFilter(!this.actionFilter()); };
      // The funnel counts the filters it holds (type and source); the chips and stages show their own choice
      this.activeFilters = ko.pureComputed(() => [this.typeFilter(), this.sourceFilter()].filter(Boolean).length);
      this.moreFilters = ko.observable(false);
      this.toggleFilters = () => this.moreFilters(!this.moreFilters());
      this.filterButtonCss = ko.pureComputed(() => 'fx-btn fx-btn--secondary fx-btn--icon factory-rq-filterbtn' + (this.moreFilters() ? ' factory-rq-filterbtn-on' : ''));
      this.filterLabel = ko.pureComputed(() => (this.moreFilters() ? 'Hide filters' : 'Filter by type or document') + (this.activeFilters() ? ' (' + this.activeFilters() + ' on)' : ''));
      this.clearFilters = () => {
        this.search('');
        this.statusFilter('');
        this.stageFilter('');
        this.typeFilter('');
        this.sourceFilter('');
        this.actionFilter(false);
      };
      this.filtered = ko.pureComputed(() => !!(this.search() || '').trim() || !!this.statusFilter() || !!this.stageFilter() || this.activeFilters() > 0 || this.actionFilter());

      // Opens what a row's next step points at: on this page the requirement (its open questions when those are the
      // step), elsewhere the Design Studio or the change
      const act = (r) => () => {
        if (r.flow.target !== 'requirement') {
          r.flow.open();
          return;
        }
        this.openRow(r).then(() => {
          if (r.flow.questions) {
            this.part('questions');
          }
          focusLater('requirementDetailTitle');
        });
      };
      const openStudio = (id) => () => { pageRequests.studio(id); navigate('studio'); };
      this.rows = ko.pureComputed(() => {
        const text = (this.search() || '').trim().toLowerCase();
        const canEdit = this.canEdit();
        return entries().filter((r) => (!text || (r.code + ' ' + r.title + ' ' + r.source).toLowerCase().indexOf(text) >= 0)
          && (!this.statusFilter() || r.status === this.statusFilter())
          && (!this.stageFilter() || r.stage === this.stageFilter())
          && (!this.typeFilter() || r.type === this.typeFilter())
          && (!this.sourceFilter() || r.source === this.sourceFilter())
          && (!this.actionFilter() || r.mine))
          .map((r) => {
            const flow = r.flow;
            const selected = ko.pureComputed(() => !!this.detail() && this.detail().id === r.id);
            const menuItems = [{ value: 'open', label: 'Open' }]
              .concat(flow.designs.length ? [{ value: 'studio', label: 'Open the screens in the Design Studio' }] : [])
              .concat(flow.change ? [{ value: 'change', label: 'Open the change' }] : [])
              .concat([{ separator: true }, { value: 'delete', label: 'Delete', danger: true, disabled: !canEdit, title: canEdit ? null : 'Only analysts and leads can do this' }]);
            return Object.assign({}, r, {
              css: ko.pureComputed(() => 'factory-rq-row' + (selected() ? ' is-on' : '')),
              current: ko.pureComputed(() => (selected() ? 'true' : null)),
              select: () => this.openRow(r),
              stage: {
                text: flow.finished ? 'Done' : dashboard.steps[flow.step - 1],
                label: flow.stepText,
                bars: flow.steps.map((st) => 'factory-rq-bar is-' + st.state)
              },
              status: flow.status,
              when: dashboard.ago(r.updatedAt),
              whenTitle: dashboard.when(r.updatedAt),
              // The next step as a link, unless the workflow is finished
              next: flow.finished ? null : {
                text: !flow.perm || r.mine ? flow.act : 'Waiting for ' + flow.who,
                label: flow.status.text + ': ' + (!flow.perm || r.mine ? flow.next : 'waiting for ' + flow.who) + ' Opens ' + flow.place + '.',
                go: act(r)
              },
              menuItems: menuItems,
              menu: (event) => {
                const v = event.detail.value;
                if (v === 'open') {
                  this.openRow(r);
                } else if (v === 'studio') {
                  openStudio(r.id)();
                } else if (v === 'change') {
                  dashboard.openRecord('changes', this.workspaceId(), 'change', flow.change.id)();
                } else if (v === 'delete') {
                  removeRequirement(r.id);
                }
              }
            });
          });
      });
      this.shownText = ko.pureComputed(() => (this.filtered() ? this.rows().length + ' of ' + this.total() + ' shown' : ''));
      this.lead = ko.pureComputed(() => {
        if (this.listLoading() || this.listError()) {
          return 'Business requirements from BRDs, FSDs and descriptions, with where each one stands';
        }
        if (!this.total()) {
          return 'Upload a BRD or FSD, or describe what the bank needs; the factory drafts the specification.';
        }
        const failed = entries().filter((r) => r.flow.status.category === 'failed').length;
        return [plural(this.total(), 'requirement'), this.actionCount() ? this.actionCount() + ' need' + (this.actionCount() === 1 ? 's' : '') + ' you' : 'none needs you',
          failed ? failed + ' failed' : ''].filter(Boolean).join(' · ');
      });
      this.pageMenuItems = ko.pureComputed(() => [
        { value: 'refresh', label: 'Refresh the list' },
        { value: 'csv', label: 'Download the list (CSV)' }
      ].concat(this.canEdit() ? [{ separator: true }, { value: 'upload', label: 'Upload a BRD or FSD' }, { value: 'text', label: 'Describe a requirement' }] : []));
      this.pageMenu = (event) => {
        const value = event.detail.value;
        if (value === 'refresh') {
          loadList();
          loadLinks();
        } else if (value === 'upload') {
          this.startUpload();
        } else if (value === 'text') {
          this.startText();
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
      this.part = ko.observable('overview');
      this.code = ko.pureComputed(() => (this.detail() ? shortId(this.detail().id) : ''));
      this.statusPill = ko.pureComputed(() => reqStatus(this.detail() ? this.detail().status : 'PROCESSING'));
      this.sourceName = ko.pureComputed(() => (this.detail() ? this.detail().fileName || 'Typed description' : ''));
      const workspaceName = ko.pureComputed(() => {
        const w = workspaceSelection.options().find((o) => o.value === this.workspaceId());
        return w ? w.label.replace(/ \(.*\)$/, '') : '';
      });
      // The ID line under the title: ID, workspace, spec version, source document, last change
      this.idLine = ko.pureComputed(() => {
        const d = this.detail();
        return !d ? '' : [shortId(d.id), workspaceName(), d.currentVersion ? 'spec v' + d.currentVersion : '', this.sourceName(), 'updated ' + day(d.updatedAt)]
          .filter(Boolean).join(' · ');
      });
      // While the spec is drafted the page polls the requirement; this is when it last did
      this.drafting = ko.pureComputed(() => !!this.detail() && this.detail().status === 'PROCESSING');
      this.lastChecked = ko.observable('');
      this.draftingText = ko.pureComputed(() => 'The page checks every ' + (POLL_MS / 1000)
        + ' seconds' + (this.lastChecked() ? ', last at ' + this.lastChecked() : '') + ', and tells you when the spec is ready.');
      // The server's warnings about the spec (duplicate FR, AC or NFR IDs); none from an older server
      this.specWarnings = ko.pureComputed(() => (this.detail() && Array.isArray(this.detail().warnings) ? this.detail().warnings : []));
      // An approved spec's next steps, each with what the server checks: screens EDIT_DESIGNS, a change MANAGE_CODE
      this.canMakeScreens = ko.pureComputed(() => !!this.detail() && this.detail().status === 'APPROVED' && session.can(this.workspaceId(), 'EDIT_DESIGNS'));
      this.canPlanChange = ko.pureComputed(() => !!this.detail() && this.detail().status === 'APPROVED' && session.can(this.workspaceId(), 'MANAGE_CODE'));
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

      // Where the workflow stands: the same four steps and next step as the list and Home
      const unanswered = () => (this.spec() ? this.spec().openQuestions.filter((q) => !q.answer).length : 0);
      this.flow = ko.pureComputed(() => {
        const d = this.detail();
        return d ? dashboard.workflow(Object.assign({}, d, { openQuestions: unanswered() }), allDesigns(), allChanges(), this.workspaceId())
          : { steps: [], stepText: '', status: reqStatus('PROCESSING') };
      });
      // The header's pill: the stage and its state ("Plan · Failed")
      this.headPill = ko.pureComputed(() => {
        const f = this.flow();
        const st = f.status || this.statusPill();
        return Object.assign({}, st, { text: (f.finished ? 'Done' : dashboard.steps[(f.step || 1) - 1]) + ' · ' + st.text });
      });
      /**
       * The four stages with what the factory recorded at each (spec status and approval, screens approved, the plan,
       * the code and its build); a stage with a place to go (the screens, the change) opens it.
       */
      this.stepper = ko.pureComputed(() => {
        const d = this.detail();
        const f = this.flow();
        if (!d || !f.steps.length) {
          return [];
        }
        const s = this.spec();
        const own = f.designs || [];
        const c = f.change;
        const open = unanswered();
        const approvedScreens = own.filter((x) => x.status === 'APPROVED').length;
        const specSub = { PROCESSING: 'Drafting', FAILED: 'Drafting stopped' }[d.status]
          || (d.status === 'READY' ? (open ? plural(open, 'open question') : (s && s.openQuestions.length ? 'Answers not in the spec yet' : 'Ready for approval'))
            : 'Approved' + (d.currentVersion ? ' v' + d.currentVersion : '') + (d.approvedBy ? ' by ' + d.approvedBy : '') + (d.approvedAt ? ', ' + day(d.approvedAt) : ''));
        const screensSub = own.length ? approvedScreens + ' of ' + plural(own.length, 'screen') + ' approved'
          : (d.status !== 'APPROVED' ? 'Not started' : (s && s.screens.length === 0 ? 'No screens in the spec' : 'None yet'));
        let planSub = 'Not started';
        let codeSub = 'Not started';
        if (c) {
          const planned = !!c.planApprovedAt;
          planSub = planned ? 'Plan approved' + (c.planApprovedBy ? ' by ' + c.planApprovedBy : '') + ', ' + day(c.planApprovedAt)
            : { ANALYZING: 'Analysing the impact', PLAN_READY: 'Plan ready for review', FAILED: 'Analysis failed', CLOSED: 'Closed' }[c.status] || 'Not started';
          if (planned) {
            codeSub = { GENERATING: 'Writing the code', FAILED: 'Code generation failed', CLOSED: 'Closed', DELIVERED: 'Delivered, ' + day(c.updatedAt) }[c.status]
              || (c.buildStatus === 'FAILED' ? 'Build failed' : c.buildStatus === 'BUILDING' ? 'Building' : c.status === 'GENERATED' ? 'Ready to review, ' + plural((c.files || []).length, 'file') : 'Not started');
          }
        }
        const changeGo = c ? dashboard.openRecord('changes', this.workspaceId(), 'change', c.id) : null;
        const gos = [null, own.length ? openStudio(d.id) : null, changeGo, c && c.planApprovedAt ? changeGo : null];
        const goLabels = ['', 'Open the screens in the Design Studio', 'Open the change', 'Open the change'];
        return f.steps.map((st, i) => ({
          n: i + 1, name: st.name, state: st.state, sub: [specSub, screensSub, planSub, codeSub][i],
          css: 'factory-rqd-step is-' + st.state, current: st.state === 'current' ? 'step' : null,
          go: gos[i], goLabel: goLabels[i]
        }));
      });
      /**
       * The next valid step for this requirement with what it needs (kind picks the header's button), or who it waits
       * for. Approval is offered only when the server would accept it (READY, no open question); it is never automatic.
       */
      this.nextStep = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return { kind: '', title: '', text: '', act: '' };
        }
        const step = (kind, title, text) => ({ kind: kind, title: title, text: text, act: '' });
        const s = this.spec();
        const open = unanswered();
        if (d.status === 'PROCESSING') {
          return step('', 'Drafting the specification.', this.draftingText());
        }
        if (d.status === 'FAILED') {
          return step(this.canEdit() ? 'retry' : '', 'Drafting stopped.', (d.message || 'The draft failed.')
            + (this.canEdit() ? ' Try again to draft it again.' : ' An analyst can try again.'));
        }
        if (d.status === 'READY' && open > 0) {
          return step(this.canEdit() ? 'questions' : '', plural(open, 'open question') + ' to answer.',
            'Answer them, then update the spec with the answers. Approval waits until no question is left.'
            + (this.canEdit() ? '' : ' Waiting for an analyst.'));
        }
        if (d.status === 'READY' && s && s.openQuestions.length > 0) {
          return step(this.canEdit() ? 'refine' : '', 'Every question is answered.',
            'Update the spec with the answers. Approval waits until the answers are in the spec.' + (this.canEdit() ? '' : ' Waiting for an analyst.'));
        }
        if (d.status === 'READY') {
          return step(this.canApprove() ? 'approve' : '', 'Ready for approval.', 'Review the specification below and approve it. Nothing is designed or built before it is approved.'
            + (this.canApprove() ? '' : ' Waiting for someone who can approve.'));
        }
        // Approved: the workflow's next step (screens, plan, the change)
        const f = this.flow();
        if (f.finished) {
          return Object.assign(step('open', 'All steps done.', 'The change is ' + f.status.text.toLowerCase() + '.'), { act: f.act });
        }
        const mine = !f.perm || session.can(this.workspaceId(), f.perm);
        const kind = !mine ? '' : f.step === 2 && !f.designs.length ? (this.canMakeScreens() ? 'screens' : '')
          : f.step === 3 && !f.change ? (this.canPlanChange() ? 'plan' : '') : 'open';
        return Object.assign(step(kind, 'Next:', f.next + (mine ? '' : ' Waiting for ' + f.who + '.')), { act: f.act });
      });
      this.openNext = () => {
        const f = this.flow();
        if (f.open) {
          f.open();
        }
      };

      // Source wording: an item whose text is in the document word for word (the import reads the document's tables
      // as they are, with their IDs) is source text; any other was drafted by the factory or edited by hand
      const squash = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const docText = ko.pureComputed(() => squash(this.detail() ? this.detail().documentText : ''));
      const fromDoc = (t) => !!squash(t) && docText().indexOf(squash(t)) >= 0;
      const docName = ko.pureComputed(() => (this.detail() && this.detail().fileName ? this.detail().fileName : 'the description'));
      // A list with its provenance: each item drafted or not, and a note for the whole list
      const sourced = (list, text) => {
        const items = list.map((x) => Object.assign({}, typeof x === 'string' ? { text: x } : x, { drafted: !fromDoc(text(x)) }));
        const ids = items.some((x) => x.id) ? ', with its own IDs' : '';
        const drafted = items.filter((x) => x.drafted).length;
        return {
          items: items,
          note: drafted === 0 ? 'Word for word from ' + docName() + ids + '.'
            : drafted === items.length ? 'Drafted by the factory: not found word for word in ' + docName() + '.'
              : 'Word for word from ' + docName() + ids + ', except those marked Drafted (written by the factory or edited by hand).'
        };
      };
      // Moves to a part and to one item in it (the requirement or criterion a link names)
      const goTo = (part, target) => () => {
        this.part(part);
        setTimeout(() => {
          const el = document.getElementById(target);
          if (el) {
            el.focus({ preventScroll: true });
            el.scrollIntoView({ block: 'nearest', behavior: smooth() });
          }
        }, 60);
      };
      const anchor = (prefix, id) => 'rqd-' + prefix + '-' + String(id).replace(/[^A-Za-z0-9_-]/g, '');

      this.scopeLists = ko.pureComputed(() => {
        const s = this.spec();
        return !s ? [] : [['Scope', s.scope], ['Out of scope', s.outOfScope], ['Assumptions', s.assumptions]]
          .filter((x) => texts(x[1]).length).map((x) => Object.assign({ label: x[0] }, sourced(texts(x[1]), (t) => t)));
      });
      this.frRows = ko.pureComputed(() => {
        const s = this.spec();
        if (!s) {
          return { items: [], note: '' };
        }
        const list = sourced(s.requirements, (r) => r.description || r.title);
        list.items = list.items.map((r) => {
          const priority = (r.priority || '').toLowerCase();
          return {
            id: r.id || '–', anchor: anchor('fr', r.id || ''), drafted: r.drafted,
            // The title is left out when it only repeats the description
            title: r.title && r.title !== r.description ? r.title : '',
            description: r.description || '',
            priority: r.priority ? pill(r.priority, priority === 'must' ? 'blue' : priority === 'should' ? 'amber' : 'grey') : null,
            screens: (r.screens || []).join(', '),
            criteria: s.acceptanceCriteria.filter((c) => c.id && c.requirements.indexOf(r.id) >= 0)
              .map((c) => ({ id: c.id, go: goTo('reqs', anchor('ac', c.id)) }))
          };
        });
        return list;
      });
      this.nfrRows = ko.pureComputed(() => {
        const s = this.spec();
        return s ? sourced(s.nonFunctional.filter((n) => n.description), (n) => n.description) : { items: [], note: '' };
      });
      this.acRows = ko.pureComputed(() => {
        const s = this.spec();
        if (!s) {
          return { items: [], note: '' };
        }
        const ids = s.requirements.map((r) => r.id);
        const list = sourced(s.acceptanceCriteria.filter((c) => c.description), (c) => c.description);
        list.items = list.items.map((c) => Object.assign({}, c, {
          id: c.id || '–', anchor: anchor('ac', c.id || ''),
          verifies: c.requirements.map((id) => ({ id: id, go: ids.indexOf(id) >= 0 ? goTo('reqs', anchor('fr', id)) : null }))
        }));
        return list;
      });
      // The Requirements tab's sections, as chips that move to each when there are several
      this.reqSections = ko.pureComputed(() => [['fr', 'Functional', this.frRows().items.length], ['ac', 'Acceptance criteria', this.acRows().items.length],
        ['nfr', 'Non-functional', this.nfrRows().items.length]].filter((x) => x[2] > 0)
        .map((x) => ({ text: x[1] + ' ' + x[2], go: goTo('reqs', 'reqSection-' + x[0]) })));
      this.ruleRows = ko.pureComputed(() => {
        const s = this.spec();
        if (!s) {
          return { items: [], note: '' };
        }
        const list = sourced(s.businessRules, (r) => r.description);
        list.items = list.items.map((r) => Object.assign({}, r, { id: r.id || '–', screens: (r.screens || []).join(', '), reference: r.reference || '' }));
        return list;
      });
      this.messageRows = ko.pureComputed(() => (this.spec() ? sourced(this.spec().messages, (m) => m.text) : { items: [], note: '' }));
      // APIs: whether the document names each one, or only an analyst's answer
      this.apiRows = ko.pureComputed(() => {
        const s = this.spec();
        if (!s) {
          return [];
        }
        const answers = squash(s.decisions.map((x) => x.answer).join(' '));
        return s.apis.map((a) => {
          const path = (a.name || '').replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, '');
          const inDoc = fromDoc(a.name) || fromDoc(path);
          const inAnswer = !inDoc && !!squash(path) && answers.indexOf(squash(path)) >= 0;
          return Object.assign({}, a, {
            named: inDoc ? 'The document' : inAnswer ? 'An answer' : 'Not found',
            namedCss: inDoc || inAnswer ? '' : 'factory-rqd-none'
          });
        });
      });
      this.screens = ko.pureComputed(() => (this.spec() ? this.spec().screens.map((s) => Object.assign({}, s, {
        kind: s.changeType === 'new' ? pill('New', 'blue') : s.changeType === 'enhance' ? pill('Change', 'amber') : pill('Unknown', 'grey'),
        actionNames: s.actions.map((a) => a.name).join(', '),
        fieldRows: s.fields.map((f) => Object.assign({}, f, {
          mandatoryText: f.mandatory === true ? 'Yes' : f.mandatory === false ? 'No' : 'Not stated',
          rules: (f.validations || []).join('; ')
        }))
      })) : []));
      this.hosts = ko.pureComputed(() => (this.spec() ? this.spec().hostInteractions : []));
      this.roles = ko.pureComputed(() => (this.spec() ? this.spec().roles : []));
      this.decisions = ko.pureComputed(() => (this.spec() ? this.spec().decisions : []));
      this.questionsText = ko.pureComputed(() => {
        const open = this.questions().filter((q) => !q.answered()).length;
        const all = this.questions().length;
        return open ? open + ' of ' + plural(all, 'question') + ' unanswered. The spec cannot be approved until they are resolved.'
          : 'Every question has an answer. Update the spec with the answers to resolve them.';
      });
      this.goQuestions = goTo('questions', 'questionsOpen');

      // Traceability: each functional requirement with the criteria that verify it and its screens
      this.traceRows = ko.pureComputed(() => this.frRows().items.map((r) => ({
        id: r.id, screens: r.screens || '–', criteria: r.criteria.map((c) => c.id).join(', ') || 'None', untested: r.criteria.length === 0
      })));
      this.trace = ko.pureComputed(() => {
        const s = this.spec();
        if (!s) {
          return [];
        }
        return s.screens.map((screen) => {
          const design = this.designs().find((d) => d.name === screen.name);
          return {
            screen: screen.name,
            design: design ? DESIGN_WORDS[design.status] + ' v' + design.currentVersion : 'Not designed yet',
            designStatus: design ? ui.status(design.status, DESIGN_WORDS[design.status]) : ui.status('NOT_STARTED', 'Not started'),
            code: screen.relatedCode.slice(0, 3).join(', ') || 'No related code found',
            change: this.changes().length ? this.changes().map((c) => c.title).join(', ') : 'No change yet'
          };
        });
      });
      this.changeRows = ko.pureComputed(() => this.changes().map((c) => ({
        title: c.title, status: ui.status(c.status, CHANGE_WORDS[c.status]), files: plural(c.files.length, 'file'), updated: day(c.updatedAt),
        open: dashboard.openRecord('changes', this.workspaceId(), 'change', c.id)
      })));
      this.designRows = ko.pureComputed(() => this.designs().map((d) => ({
        name: d.name, status: ui.status(d.status, DESIGN_WORDS[d.status]), version: 'v' + d.currentVersion, updated: day(d.updatedAt),
        open: openStudio(this.detail() ? this.detail().id : null)
      })));

      // The source document: what the factory read, to download, copy or show (in the Source and history panel)
      this.infoOpen = ko.observable(false);
      this.openInfo = () => this.infoOpen(true);
      this.infoSubtitle = ko.pureComputed(() => (this.detail() ? this.code() + ' · ' + this.detail().title : ''));
      this.attachment = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        return d.fileName ? [{ name: d.fileName, type: fileType(d.fileName), size: size(d.sizeBytes), uploaded: day(d.createdAt) }]
          : (d.documentText ? [{ name: 'Typed description', type: 'Text', size: size(d.sizeBytes || d.documentText.length), uploaded: day(d.createdAt) }] : []);
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

      // Other requirements of the workspace that share a screen or code with this one
      const otherSpecs = ko.observable({});
      this.related = ko.pureComputed(() => {
        const d = this.detail();
        if (!d || !d.spec) {
          return [];
        }
        const myScreens = d.spec.screens.map((x) => x.name);
        const myCode = [].concat(...d.spec.screens.map((x) => x.relatedCode || []));
        return items().filter((r) => r.id !== d.id && otherSpecs()[r.id]).map((r) => {
          const spec = otherSpecs()[r.id];
          const screens = spec.screens.filter((x) => myScreens.includes(x.name)).map((x) => x.name);
          const code = [].concat(...spec.screens.map((x) => x.relatedCode || [])).filter((c) => myCode.includes(c));
          return {
            code: r.code, title: r.title, openAction: r.openAction,
            relationship: screens.length ? 'Shares the screen ' + screens.join(', ')
              : code.length ? 'Touches the same code: ' + code[0].split('/').pop() + (code.length > 1 ? ' and ' + (code.length - 1) + ' more' : '') : ''
          };
        }).filter((r) => r.relationship);
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

      // Revision history: the spec's versions (server) and its approval
      const versions = ko.observableArray([]);
      this.versionsError = ko.observable('');
      let versionsOf = '';
      const loadVersions = (d) => {
        const key = d.id + ':' + d.currentVersion + ':' + d.status;
        if (key === versionsOf) {
          return;
        }
        versionsOf = key;
        api.get('requirements/' + d.id + '/versions')
          .then((list) => { if (this.detail() && this.detail().id === d.id) { versions(list); this.versionsError(''); } })
          .catch(() => { versionsOf = ''; versions([]); this.versionsError('Could not load the versions. Open the requirement again to retry.'); });
      };
      const ORIGINS = {
        DRAFTED: ['Drafted by the factory', ''],
        ANSWERED: ['Answers saved', 'Answers to open questions'],
        REFINED: ['Updated with the answers', 'The factory redrafted it with the answers'],
        EDITED: ['Edited by hand', 'The specification JSON was edited'],
        MODERNIZATION: ['Written by Modernization', 'A run’s brief, made from the code analysis']
      };
      this.history = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const when = (v) => new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const event = (title, text, at, tone, icon) => ({
          title: title, text: text, at: at, when: at ? when(at) : '',
          dot: 'fx-timeline-dot' + (tone ? ' fx-timeline-dot--' + tone : ''), icon: 'factory-nav-icon factory-ico-' + icon
        });
        const list = [];
        if (d.approvedAt) {
          list.push(event('Approved' + (d.approvedBy ? ' by ' + d.approvedBy : ''), d.currentVersion ? 'Spec v' + d.currentVersion + ' approved and locked' : '', d.approvedAt, 'success', 'check'));
        }
        versions().forEach((v) => {
          const o = ORIGINS[v.origin] || [v.origin, ''];
          list.push(event('v' + v.version + ' · ' + o[0], (v.version === d.currentVersion ? 'Current version. ' : '') + (v.origin === 'DRAFTED' ? 'From ' + docName() : o[1]),
            v.createdAt, '', v.origin === 'EDITED' ? 'edit' : 'doc'));
        });
        list.push(event('Added', 'From ' + docName(), d.createdAt, '', 'plus'));
        return list;
      });

      // The parts of the spec, each shown only when the spec has something for it, with how many items it holds
      const PARTS = [
        { value: 'overview', label: 'Overview', title: 'Summary, scope, assumptions and roles', show: () => 1 },
        { value: 'reqs', label: 'Requirements', title: 'Functional and non-functional requirements and the acceptance criteria',
          count: (s) => s.requirements.length, show: (s) => s.requirements.length + s.nonFunctional.length + s.acceptanceCriteria.length },
        { value: 'rules', label: 'Rules and APIs', title: 'Business rules, messages, APIs and host interfaces',
          count: (s) => s.businessRules.length + s.messages.length + s.apis.length + s.hostInteractions.length,
          show: (s) => s.businessRules.length + s.messages.length + s.apis.length + s.hostInteractions.length },
        { value: 'screens', label: 'Screens', title: 'Screens and their fields', count: (s) => s.screens.length, show: (s) => s.screens.length },
        { value: 'questions', label: 'Questions', title: 'Open questions and decisions', count: (s) => s.openQuestions.filter((q) => !q.answer).length,
          alert: true, show: (s) => s.openQuestions.length + s.decisions.length },
        { value: 'trace', label: 'Traceability', title: 'Requirements to criteria and screens, screens to design, code and change', show: (s) => s.requirements.length + s.screens.length }
      ];
      this.shownParts = ko.pureComputed(() => {
        const s = this.spec();
        return !s ? [] : PARTS.filter((p) => p.show(s)).map((p) => {
          const count = p.count ? p.count(s) : 0;
          return {
            value: p.value, title: p.title || p.label, label: p.label, count: count ? String(count) : '',
            countCss: 'factory-rqd-cnt' + (p.alert && count ? ' is-warning' : ''),
            selected: ko.pureComputed(() => this.partNow() === p.value), pick: () => this.part(p.value)
          };
        });
      });
      // A part the spec has nothing for falls back to the overview
      this.partNow = ko.pureComputed(() => (this.shownParts().some((p) => p.value === this.part()) ? this.part() : 'overview'));
      // Left and right arrows move between the tabs, Home and End to the first and last
      this.tabKey = (event) => {
        const parts = this.shownParts();
        const at = parts.findIndex((p) => p.value === this.partNow());
        const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: parts.length - 1 }[event.key];
        if (to === undefined || !parts.length) {
          return true;
        }
        const next = parts[(to + parts.length) % parts.length];
        this.part(next.value);
        focusLater('part-' + next.value);
        return false;
      };

      // The one problem bar: the most important blocker and its fix (the header's button when it is the next step)
      this.problem = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return null;
        }
        const bar = (key, tone, lead, detail, fix) => ({ key: key, css: 'factory-rqd-problem' + (tone === 'danger' ? ' is-error' : ''), lead: lead, detail: detail, fix: fix || null });
        const s = this.spec();
        const open = unanswered();
        const f = this.flow();
        const next = this.nextStep();
        if (d.status === 'FAILED') {
          return bar('failed', 'danger', next.title, next.text);
        }
        if (d.status === 'APPROVED' && !f.finished && f.status && f.status.category === 'failed') {
          const mine = !f.perm || session.can(this.workspaceId(), f.perm);
          return bar('change', 'danger', (f.status.text === 'Failed' ? 'The change failed' : f.status.text) + '.',f.next + (mine ? '' : ' Waiting for ' + f.who + '.'));
        }
        if (this.specWarnings().length) {
          return bar('warnings', 'warning', 'Check the IDs before approving.', this.specWarnings().join(' '),
            this.partNow() === 'reqs' ? null : { label: 'Show the requirements', run: goTo('reqs', 'reqSection-fr') });
        }
        if (d.status === 'READY' && open > 0) {
          return bar('questions', 'warning', plural(open, 'open question') + (open === 1 ? ' blocks' : ' block') + ' approval.', 'Answer them, then update the spec with the answers.'
            + (this.canEdit() ? '' : ' Waiting for an analyst.'));
        }
        if (d.status === 'READY' && s && s.openQuestions.length > 0) {
          return bar('refine', 'warning', 'The answers are not in the spec yet.', 'Update the spec with the answers; approval waits until they are in.'
            + (this.canEdit() ? '' : ' Waiting for an analyst.'));
        }
        return null;
      });

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
          css: ko.pureComputed(() => 'factory-rq-question' + (answerValue().trim() ? '' : ' is-open')),
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
          this.part('overview');
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
        loadVersions(detail);
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
        if (panel && window.matchMedia('(max-width: 1024px)').matches) {
          panel.scrollIntoView({ behavior: smooth(), block: 'start' });
        }
      });

      // The document: from the native picker or dropped on the box. The picker is emptied so the same file can be
      // chosen again after an upload.
      const pickFile = (file) => {
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
      this.fileSelected = (event) => {
        const file = event.target.files[0] || null;
        event.target.value = '';
        pickFile(file);
      };
      this.dragOver = (event) => {
        event.preventDefault();
        this.dragging(true);
        return false;
      };
      this.dragLeave = () => { this.dragging(false); };
      this.dropFile = (event) => {
        event.preventDefault();
        this.dragging(false);
        const files = event.dataTransfer ? event.dataTransfer.files : null;
        if (files && files.length) {
          pickFile(files[0]);
        }
        return false;
      };
      this.removeFile = () => { this.chosenFile(null); focusLater('reqFile'); };
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
          .then((detail) => { this.chosenFile(null); this.newTitle(''); this.createOpen(false); show(detail); toast.success('Document uploaded. The factory is drafting the specification.'); })
          .catch(createFailed)
          .finally(() => this.busy(false));
      };
      this.submitText = () => {
        this.busy(true);
        api.post('workspaces/' + this.workspaceId() + '/requirements/text', { title: this.newTitle() || null, text: this.newText() })
          .then((detail) => { this.newText(''); this.newTitle(''); this.createOpen(false); show(detail); toast.success('Requirement added. The factory is drafting the specification.'); })
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
      const removeRequirement = (id) => {
        dialog.confirm({ title: 'Delete ' + shortId(id) + '?', message: 'The requirement and its drafted specification are deleted. This cannot be undone.', confirmLabel: 'Delete', danger: true }).then((ok) => {
          if (!ok) {
            return;
          }
          api.del('requirements/' + id).then(() => {
            if (this.detail() && this.detail().id === id) {
              this.detail(null);
            }
            loadList();
            toast.success('Requirement deleted.');
          }).catch(failed);
        });
      };
      this.remove = () => removeRequirement(this.detail().id);
      this.toggleJson = () => {
        this.editingJson(!this.editingJson());
        this.specJson(this.editingJson() && this.spec() ? JSON.stringify(this.spec(), null, 2) : '');
      };
      this.saveJson = () => api.put(base() + '/spec', this.specJson())
        .then((detail) => { this.editingJson(false); show(detail); toast.success('Specification saved.'); })
        .catch(failed);
      this.makeScreens = () => api.post(base() + '/designs')
        .then(() => { toast.success('Screens generated. Review them in the Design Studio.'); openStudio(this.detail().id)(); })
        .catch(failed);
      this.planChange = () => api.post(base() + '/changes')
        .then(() => { toast.success('Change planned.'); navigate('changes'); })
        .catch(failed);
      this.detailMenuItems = ko.pureComputed(() => {
        const d = this.detail();
        const approved = !!d && d.status === 'APPROVED';
        const tip = (allowed, who) => (!approved ? 'Approve the specification first' : allowed ? null : 'Only ' + who + ' can do this');
        // Editing the JSON is rarely needed, so it waits here rather than beside Approve
        return [
          { value: 'screens', label: 'Make screens in the Design Studio', disabled: !this.canMakeScreens(), title: tip(this.canMakeScreens(), 'analysts, developers and leads') },
          { value: 'change', label: 'Plan the change', disabled: !this.canPlanChange(), title: tip(this.canPlanChange(), 'developers and leads') },
          { separator: true },
          { value: 'info', label: 'Source and history' },
          { value: 'json', label: this.editingJson() ? 'Close the JSON editor' : 'Edit the specification (JSON)', id: 'editJsonButton',
            disabled: !this.canEditSpec() && !this.editingJson(), title: this.canEditSpec() ? null : this.editBlockedReason() },
          { value: 'copy', label: 'Copy the specification (JSON)', disabled: !this.spec() },
          { value: 'delete', label: 'Delete', disabled: !this.canEdit(), danger: true, title: this.canEdit() ? null : 'Only analysts and leads can do this' }
        ];
      });
      this.detailMenu = (event) => {
        const value = event.detail.value;
        if (value === 'screens') {
          this.makeScreens();
        } else if (value === 'change') {
          this.planChange();
        } else if (value === 'info') {
          this.openInfo();
        } else if (value === 'json') {
          this.toggleJson();
        } else if (value === 'copy') {
          copy(JSON.stringify(this.spec(), null, 2)).then(() => toast.success('Specification copied.')).catch(failed);
        } else if (value === 'delete') {
          this.remove();
        }
      };
      this.updatedText = ko.pureComputed(() => (this.detail() ? day(this.detail().updatedAt) : ''));

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Requirements page loaded.');
        document.title = 'Requirements';
        subscription = this.workspaceId.subscribe(() => {
          clearTimeout(pollTimer);
          this.detail(null);
          this.infoOpen(false);
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
              // { mode: 'text', title, text }: a requirement filled in by another page (Modernization's Convert a module)
              if (typeof create === 'object') {
                this.newTitle(create.title || '');
                this.newText(create.text || '');
              }
              startCreating(create === 'text' || create.mode === 'text' ? 'text' : 'upload');
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
