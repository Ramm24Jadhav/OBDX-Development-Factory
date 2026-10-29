/*
 * Requirements page: the workspace's requirements as a searchable list, and the selected one with its lifecycle
 * (draft, analysis, approval, design, build, review, completed), its drafted specification by part (screens, business
 * rules, APIs, host interfaces, roles, open questions), traceability to screens and changes, and the actions: upload or
 * describe a requirement, answer open questions, update the spec with the answers, edit it as JSON, approve, retry and
 * delete.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        'ojs/ojknockout', 'ojs/ojinputtext', 'ojs/ojbutton', 'ojs/ojfilepicker', 'ojs/ojmenu'],
  function (ko, accUtils, api, workspaceSelection, session, ui) {
    const POLL_MS = 2000;
    const STATUS = { PROCESSING: ui.pill('In Progress', 'blue'), READY: ui.pill('In Review', 'amber'), APPROVED: ui.pill('Approved', 'green'), FAILED: ui.pill('Failed', 'red') };
    const DESIGN = { DRAFT: ui.pill('Draft', 'grey'), IN_REVIEW: ui.pill('In Review', 'amber'), APPROVED: ui.pill('Approved', 'green') };
    const CHANGE = {
      ANALYZING: ui.pill('Analyzing', 'blue'), PLAN_READY: ui.pill('Plan ready', 'amber'), GENERATING: ui.pill('Generating', 'blue'),
      GENERATED: ui.pill('Generated', 'amber'), DELIVERED: ui.pill('Delivered', 'green'), FAILED: ui.pill('Failed', 'red'), CLOSED: ui.pill('Closed', 'grey')
    };
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
      this.tab = ko.observable('all');
      const items = ko.observableArray([]);
      this.tabs = ui.tabs(this.tab, [
        { value: 'all', label: 'All Requirements' },
        { value: 'upload', label: 'BRD/FSD Upload' },
        { value: 'questions', label: 'Open Questions' },
        { value: 'traceability', label: 'Traceability' },
        { value: 'reports', label: 'Reports' }
      ]);

      // New requirement: a document or a description
      this.newTitle = ko.observable('');
      this.newText = ko.observable('');
      this.chosenFile = ko.observable(null);
      this.chosenFileName = ko.pureComputed(() => (this.chosenFile() ? this.chosenFile().name : 'No file chosen'));
      this.startUpload = () => this.tab('upload');

      // The list, with search and the status filter
      this.search = ko.observable('');
      this.statusFilter = ko.observable('');
      this.typeFilter = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.statusChange = ui.value(this.statusFilter);
      this.typeChange = ui.value(this.typeFilter);
      this.detail = ko.observable(null);
      this.designs = ko.observableArray([]);
      this.changes = ko.observableArray([]);
      this.total = ko.pureComputed(() => items().length);
      this.rows = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        return items().filter((r) => (!text || (r.title + ' ' + r.code).toLowerCase().indexOf(text) >= 0)
          && (!this.statusFilter() || r.status === this.statusFilter())
          && (!this.typeFilter() || r.type === this.typeFilter()))
          .map((r) => Object.assign({}, r, {
            css: ko.pureComputed(() => 'factory-rq-item' + (this.detail() && this.detail().id === r.id ? ' factory-rq-item-on' : '')),
            countText: r.screens + ' screen' + (r.screens === 1 ? '' : 's') + ' · ' + r.openQuestions + ' open question' + (r.openQuestions === 1 ? '' : 's'),
            tags: [r.type]
          }));
      });
      this.moreFilters = ko.observable(false);
      this.toggleFilters = () => {
        if (this.moreFilters()) {
          this.typeFilter('');
        }
        this.moreFilters(!this.moreFilters());
      };
      this.filterButtonCss = ko.pureComputed(() => 'factory-rq-filterbtn' + (this.moreFilters() ? ' factory-rq-filterbtn-on' : ''));
      this.pageMenu = (event) => {
        const value = event.detail.selectedValue;
        if (value === 'refresh') {
          loadList();
        } else if (value === 'csv') {
          const quote = (v) => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
          const lines = [['ID', 'Title', 'Type', 'Status', 'Screens', 'Open questions', 'Updated'].map(quote).join(',')]
            .concat(items().map((r) => [r.code, r.title, r.type, r.statusPill.text, r.screens, r.openQuestions, r.updatedAt].map(quote).join(',')));
          saveFile('requirements.csv', lines.join('\r\n'), 'text/csv');
        } else {
          this.tab(value);
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
      this.statusPill = ko.pureComputed(() => (this.detail() ? STATUS[this.detail().status] : STATUS.PROCESSING));
      this.typeText = ko.pureComputed(() => (this.detail() ? fileType(this.detail().fileName) : ''));
      this.modulePill = ko.pureComputed(() => {
        const s = this.spec();
        return s && s.module ? { text: s.module, css: 'factory-ov-pill factory-rq-module', title: 'Module' }
          : Object.assign(ui.pill('Module not set', 'grey'), { title: 'The specification does not record a module.' });
      });
      this.priorityPill = ko.pureComputed(() => {
        const s = this.spec();
        const p = s && s.priority ? String(s.priority) : '';
        const tone = /high|critical/i.test(p) ? 'red' : /medium/i.test(p) ? 'amber' : 'grey';
        return p ? Object.assign(ui.pill(p, tone), { title: 'Priority' })
          : Object.assign(ui.pill('Not set', 'grey'), { title: 'The specification does not record a priority.' });
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
        const own = texts(s.acceptanceCriteria);
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
          note: items.length ? 'Worked out from the screens, messages and roles: the specification has no acceptance criteria yet. Add them with Edit Requirement.' : ''
        };
      });
      this.rules = ko.pureComputed(() => (this.spec() ? this.spec().businessRules : []));
      this.screens = ko.pureComputed(() => (this.spec() ? this.spec().screens.map((s) => Object.assign({}, s, {
        kind: s.changeType === 'new' ? ui.pill('New', 'blue') : s.changeType === 'enhance' ? ui.pill('Change', 'amber') : ui.pill('Unknown', 'grey'),
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
      this.attachmentMenu = (event) => {
        if (event.detail.selectedValue === 'copy') {
          copy(this.detail().documentText || '').catch(showError);
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
            designStatus: design ? DESIGN[design.status] : ui.pill('Not started', 'grey'),
            code: screen.relatedCode.slice(0, 3).join(', ') || 'No related code found',
            change: this.changes().length ? this.changes().map((c) => c.title).join(', ') : 'No change yet'
          };
        });
      });
      this.changeRows = ko.pureComputed(() => this.changes().map((c) => ({
        title: c.title, status: CHANGE[c.status] || ui.pill(c.status, 'grey'), files: c.files.length + ' files', updated: day(c.updatedAt),
        open: () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' }))
      })));
      this.designRows = ko.pureComputed(() => this.designs().map((d) => ({
        name: d.name, status: DESIGN[d.status], version: 'v' + d.currentVersion, updated: day(d.updatedAt),
        open: () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'designer' }))
      })));

      // Open questions across all requirements (Open Questions tab) and of the selected one
      this.allQuestions = ko.pureComputed(() => items().filter((r) => r.openQuestions > 0));
      this.reports = ko.pureComputed(() => {
        const list = items();
        const c = (s) => list.filter((r) => r.status === s).length;
        return [
          { label: 'Requirements', value: list.length },
          { label: 'Approved', value: c('APPROVED') },
          { label: 'In review', value: c('READY') },
          { label: 'Drafting', value: c('PROCESSING') },
          { label: 'Failed', value: c('FAILED') },
          { label: 'Open questions', value: list.reduce((sum, r) => sum + r.openQuestions, 0) },
          { label: 'Screens specified', value: list.reduce((sum, r) => sum + r.screens, 0) }
        ];
      });

      let pollTimer = null;
      const showError = (error) => this.errorMessage(error.message);

      const loadList = () => {
        const id = this.workspaceId();
        if (!id) {
          items([]);
          return Promise.resolve();
        }
        return api.get('workspaces/' + id + '/requirements').then((list) => {
          items(list.map((r) => Object.assign({}, r, {
            code: shortId(r.id), type: fileType(r.fileName), statusPill: STATUS[r.status] || ui.pill(r.status, 'grey'),
            updated: new Date(r.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
            openAction: () => { this.tab('all'); this.open(r.id); }
          })));
          if (!this.detail() && list.length) {
            this.open(list[0].id);
          }
          loadOtherSpecs(list);
        }).catch(showError);
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
            css: ko.pureComputed(() => 'factory-chip' + (parts().includes(option) ? ' factory-chip-on' : '')),
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

      const loadLinks = (detail) => {
        const id = this.workspaceId();
        api.get('workspaces/' + id + '/designs')
          .then((list) => this.designs(list.filter((d) => d.requirementId === detail.id))).catch(() => this.designs([]));
        api.get('workspaces/' + id + '/changes')
          .then((list) => Promise.all(list.map((c) => api.get('changes/' + c.id).catch(() => null))))
          .then((list) => this.changes(list.filter((c) => c && c.requirementId === detail.id))).catch(() => this.changes([]));
      };
      const show = (detail) => {
        const same = this.detail() && this.detail().id === detail.id;
        if (!same) {
          this.showingText(false);
        }
        this.detail(detail);
        this.errorMessage('');
        this.questions(detail.spec ? detail.spec.openQuestions.map((q) => question(q, detail.status === 'READY' && this.canEdit())) : []);
        if (this.editingJson()) {
          this.specJson(detail.spec ? JSON.stringify(detail.spec, null, 2) : '');
        }
        if (!same) {
          loadLinks(detail);
        }
        clearTimeout(pollTimer);
        if (detail.status === 'PROCESSING') {
          pollTimer = setTimeout(() => this.open(detail.id), POLL_MS);
        }
        loadList();
      };
      this.open = (id) => api.get('requirements/' + id).then(show).catch(showError);

      this.fileSelected = (event) => this.chosenFile(event.detail.files[0] || null);
      this.upload = () => {
        const form = new FormData();
        form.append('file', this.chosenFile());
        if (this.newTitle()) {
          form.append('title', this.newTitle());
        }
        this.busy(true);
        api.upload('workspaces/' + this.workspaceId() + '/requirements', form)
          .then((detail) => { this.chosenFile(null); this.newTitle(''); this.tab('all'); show(detail); })
          .catch(showError)
          .finally(() => this.busy(false));
      };
      this.submitText = () => {
        this.busy(true);
        api.post('workspaces/' + this.workspaceId() + '/requirements/text', { title: this.newTitle() || null, text: this.newText() })
          .then((detail) => { this.newText(''); this.newTitle(''); this.tab('all'); show(detail); })
          .catch(showError)
          .finally(() => this.busy(false));
      };

      const answers = () => this.questions().map((q, index) => ({ index: index, answer: q.answerValue() }));
      const base = () => 'requirements/' + this.detail().id;
      this.saveAnswers = () => api.put(base() + '/answers', { answers: answers() }).then(show).catch(showError);
      this.refine = () => api.put(base() + '/answers', { answers: answers() })
        .then(() => api.post(base() + '/refine'))
        .then(show)
        .catch(showError);
      this.approve = () => api.post(base() + '/approve').then(show).catch(showError);
      this.retry = () => api.post(base() + '/retry').then(show).catch(showError);
      this.remove = () => {
        if (!window.confirm('Delete this requirement and its drafted spec?')) {
          return;
        }
        api.del(base()).then(() => { this.detail(null); loadList(); }).catch(showError);
      };
      this.toggleJson = () => {
        this.editingJson(!this.editingJson());
        this.specJson(this.editingJson() && this.spec() ? JSON.stringify(this.spec(), null, 2) : '');
      };
      this.saveJson = () => api.put(base() + '/spec', this.specJson())
        .then((detail) => { this.editingJson(false); show(detail); })
        .catch(showError);
      this.makeScreens = () => api.post(base() + '/designs')
        .then(() => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'designer' })))
        .catch(showError);
      this.planChange = () => api.post(base() + '/changes')
        .then(() => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'changes' })))
        .catch(showError);
      this.detailMenu = (event) => {
        const value = event.detail.selectedValue;
        if (value === 'screens') {
          this.makeScreens();
        } else if (value === 'change') {
          this.planChange();
        } else if (value === 'copy') {
          copy(JSON.stringify(this.spec(), null, 2)).catch(showError);
        } else if (value === 'delete') {
          this.remove();
        }
      };
      this.specJsonInput = ui.value(this.specJson);
      this.newTextInput = ui.value(this.newText);
      this.createdText = ko.pureComputed(() => (this.detail() ? new Date(this.detail().createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''));
      this.updatedText = ko.pureComputed(() => (this.detail() ? new Date(this.detail().updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''));
      this.tab.subscribe((t) => { if (t === 'traceability') { this.part('trace'); } });

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Requirements page loaded.');
        document.title = 'Requirements';
        subscription = this.workspaceId.subscribe(() => { this.detail(null); this.designs([]); this.changes([]); loadList(); });
        workspaceSelection.load().then(loadList).catch(showError);
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
