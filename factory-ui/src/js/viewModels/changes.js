/*
 * Changes page. First the list: what is waiting, as state chips with counts (planning, needs approval, writing code,
 * code to review, failed, delivered, closed) and a search, then each change as a compact row (state, files written,
 * build, when, the next step and a menu). A change opens in place of the list: one header (title, its IDs, the status
 * and the one next action), the five stages (plan, approve, write the code, build, deliver), one problem bar, and
 * three resizable panels: the files as a tree (marked by their state, with state chips that filter it), the selected
 * file's diff or code with line numbers and highlighting, and a side panel with the file's details, validation, the
 * plan and the assistant. The change's facts and history are in a side sheet. The actions are those of before: plan,
 * approve, continue generation, write again, edit, check, build, deliver as a patch or an SVN branch (asked first; an
 * incomplete one with a warning), close and delete.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session',
        '../services/ui', '../services/assistant', '../services/dialog', '../services/toast', '../services/pageRequests', '../services/busy',
        '../services/syntax', '../services/dashboard', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, assistant, dialog, toast, pageRequests, busyService, highlight, dashboard) {
    const POLL_MS = 2000;
    const LIST_POLL_MS = 5000;
    // The list's state chips, in the order of the work; Code to review takes in partly written changes
    const CHIPS = [
      ['ANALYZING', 'Planning', 'is-primary'], ['PLAN_READY', 'Needs approval', 'is-warning'], ['GENERATING', 'Writing code', 'is-primary'],
      ['GENERATED', 'Code to review', 'is-warning'], ['FAILED', 'Failed', 'is-danger'], ['DELIVERED', 'Delivered', 'is-success'], ['CLOSED', 'Closed', '']
    ];
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    const code = (id) => 'CHG-' + id.replace(/-/g, '').slice(0, 3).toUpperCase();
    const reqCode = (id) => 'REQ-' + String(id || '').replace(/-/g, '').slice(0, 4).toUpperCase();
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    // A status badge (design system fx-badge, with a dot) from the older tone names
    const TONES = { blue: 'primary', amber: 'warning', green: 'success', red: 'danger', violet: 'violet', grey: '' };
    const pill = (text, tone) => ({ text: text, css: 'fx-badge' + (TONES[tone] ? ' fx-badge--' + TONES[tone] : '') });
    const ask = (title, message, confirmLabel, danger) => dialog.confirm({ title: title, message: message, confirmLabel: confirmLabel, danger: !!danger });
    // The page's words for a quick check; ui.status gives the colour and the icon
    const CHECK_WORDS = { PASSED: 'Passed', WARNING: 'Warning', FAILED: 'Failed', NOT_CHECKED: 'Not checked' };
    // Jenkins results in the status categories ui.status knows
    const BUILD_RESULT = { SUCCESS: 'PASSED', FAILURE: 'FAILED', UNSTABLE: 'WARNING', ABORTED: 'CANCELLED', NOT_BUILT: 'CANCELLED' };
    const RUNNING = ['ANALYZING', 'GENERATING'];
    // A file's state in the workbench, from its status, its plan action and its check message: the server marks a file
    // the model's limit stopped part-way as FAILED with the message "Cut off: ..." (its part is kept), and a kept rewrite
    // with "Rewrite in progress: ..." (ChangeService.recordPartial, withRewrite)
    const CUT_OFF = 'Cut off:';
    const REWRITE = 'Rewrite in progress:';
    const stateOf = (f) => {
      if (f.status === 'FAILED') {
        return (f.checkMessage || '').indexOf(CUT_OFF) === 0 ? 'partial' : 'failed';
      }
      if (f.status === 'PENDING') {
        return 'pending';
      }
      if (f.status === 'UNCHANGED') {
        return 'unchanged';
      }
      return f.action === 'create' ? 'created' : 'modified';
    };
    const STATES = {
      created: { label: 'Created', badge: 'A', tip: 'A new file, written' },
      modified: { label: 'Modified', badge: 'M', tip: 'An existing file, changed' },
      partial: { label: 'Cut off', badge: 'Cut off', tip: 'The model\'s limit stopped it part-way; its part is kept and Continue generation goes on from it' },
      failed: { label: 'Failed', badge: 'Failed', tip: 'The model could not write it' },
      pending: { label: 'Not written', badge: 'Not written', tip: 'Not written yet' },
      unchanged: { label: 'Unchanged', badge: 'Unchanged', tip: 'Written, with no difference from the original' }
    };
    const STATE_ORDER = ['created', 'modified', 'partial', 'failed', 'pending', 'unchanged'];
    // Requirement references in a plan item's text (FR-001, AC-002, BR-003)
    const REFS = /\b(?:FR|AC|BR|NFR|US|REQ)-\d+\b/g;

    function ChangesViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.canManage = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.errorMessage = ko.observable('');
      this.busy = ko.observable(false);

      const requirementOptions = ko.observableArray([]);
      this.requirementId = ko.observable(null);
      this.changes = ko.observableArray([]);

      this.detail = ko.observable(null);
      this.jenkins = ko.observable(null);
      this.editingPlan = ko.observable(false);
      this.planJson = ko.observable('');
      this.file = ko.observable(null);
      this.fileMode = ko.observable('diff');
      this.editContent = ko.observable('');
      this.regenerateNote = ko.observable('');

      this.risks = ko.pureComputed(() => (this.detail() && this.detail().plan ? this.detail().plan.risks : []));
      this.planRows = ko.pureComputed(() => (this.detail() && this.detail().plan ? this.detail().plan.items : []).map((item) => ({
        action: item.action, layer: item.layer, path: item.path, purpose: item.purpose || '', details: item.details || '',
        basedOn: (item.basedOn || []).join(', '), name: item.path.split('/').pop(),
        badge: item.action === 'create' ? 'A' : 'M', badgeCss: 'factory-ch-badge factory-ch-badge-' + (item.action === 'create' ? 'a' : 'm'),
        open: () => this.openFile(item.path)
      })));
      this.canBuild = ko.pureComputed(() => {
        const d = this.detail();
        const jenkins = this.jenkins();
        if (!d || !jenkins || !this.canManage() || d.buildStatus === 'BUILDING') {
          return false;
        }
        return jenkins.mode === 'BRANCH' ? d.status === 'DELIVERED' : (d.status === 'GENERATED' || d.status === 'DELIVERED');
      });
      this.buildRows = ko.pureComputed(() => (this.detail() ? this.detail().builds : []).map((b) => ({
        round: b.round, job: b.job, number: b.buildNumber ? '#' + b.buildNumber : '', buildUrl: b.buildUrl,
        result: b.result, resultState: ui.status(BUILD_RESULT[b.result] || b.result, b.result ? b.result.charAt(0) + b.result.slice(1).toLowerCase() : 'Not reported'),
        errors: b.errors.slice(0, 3).join(' | ') + (b.errors.length > 3 ? ' (+' + (b.errors.length - 3) + ' more)' : ''),
        log: b.logExcerpt || '', fixed: b.fixedFiles.join(', ')
      })));
      this.hasCode = ko.pureComputed(() => !!this.detail() && this.detail().files.some((f) => f.status !== 'PENDING'));
      this.fileRows = ko.pureComputed(() => (this.detail() ? this.detail().files : []).map((f) => ({
        path: f.path,
        status: ui.status(stateOf(f) === 'partial' ? 'WARNING' : f.status, STATES[stateOf(f)].label + (f.edited ? ' (edited)' : '') + (f.attempts > 1 ? ', ' + f.attempts + ' attempts' : '')),
        checkState: ui.status(f.checkStatus || 'NOT_CHECKED', CHECK_WORDS[f.checkStatus || 'NOT_CHECKED']),
        checkMessage: f.checkMessage || '',
        added: '+' + f.linesAdded,
        removed: '-' + f.linesRemoved,
        selected: this.file() !== null && this.file().path === f.path,
        openAction: () => this.openFile(f.path)
      })));
      const showError = (error) => this.errorMessage(error.message);
      // After an action: the error stays on the page and a toast says it failed
      const failed = (error) => { showError(error); toast.error(error.message); };
      const done = (message) => (detail) => { show(detail); toast.success(message); };
      let pollTimer = null;
      let listTimer = null;

      // The list: every change of the workspace with its files and builds (the same details Home loads), and the
      // requirements, for their IDs and titles and for New change
      this.listLoading = ko.observable(true);
      const requirementTitles = ko.observable({});
      const loadList = () => {
        const id = this.workspaceId();
        clearTimeout(listTimer);
        if (!id) {
          this.changes([]);
          requirementOptions([]);
          this.listLoading(false);
          return Promise.resolve();
        }
        return Promise.all([api.get('workspaces/' + id + '/changes/details'), api.get('workspaces/' + id + '/requirements'),
          api.get('workspaces/' + id + '/jenkins')])
          .then(([changeList, requirementList, jenkins]) => {
            if (id !== this.workspaceId()) {
              return;
            }
            this.jenkins(jenkins);
            const titles = {};
            requirementList.forEach((r) => { titles[r.id] = r.title; });
            requirementTitles(titles);
            this.changes(changeList.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
            requirementOptions(requirementList.filter((r) => r.status === 'APPROVED').map((r) => ({ value: r.id, label: r.title })));
            // While a change in the list is being analyzed or written, the list follows it
            if (!this.detail() && changeList.some((c) => RUNNING.indexOf(c.status) >= 0 || c.buildStatus === 'BUILDING')) {
              listTimer = setTimeout(loadList, LIST_POLL_MS);
            }
          }).catch(showError).finally(() => this.listLoading(false));
      };

      const show = (detail) => {
        const previous = this.detail();
        this.detail(detail);
        this.errorMessage('');
        clearTimeout(listTimer);
        if (!previous || previous.id !== detail.id) {
          this.file(null);
          this.openTabs([]);
          this.collapsed({});
          this.editingPlan(false);
          this.treeFilter('all');
          this.infoOpen(false);
          const first = firstFile(detail);
          if (first) {
            this.openFile(first.path);
          }
          window.scrollTo(0, 0);
        } else if (this.file()) {
          this.openFile(this.file().path, true);
        }
        // A toast when a background step this page was watching ends
        if (previous && previous.id === detail.id && RUNNING.indexOf(previous.status) >= 0 && previous.status !== detail.status) {
          if (detail.status === 'FAILED' || /^Code generation failed/.test(detail.message || '')) {
            toast.error('Failed: ' + (detail.message || 'the step did not finish.'));
          } else if (detail.status === 'PLAN_READY') {
            toast.success('Plan ready');
          } else if (detail.status === 'GENERATED') {
            toast.success('Code written');
          }
        }
        clearTimeout(pollTimer);
        if (detail.status === 'ANALYZING' || detail.status === 'GENERATING' || detail.buildStatus === 'BUILDING') {
          pollTimer = setTimeout(() => this.open(detail.id), POLL_MS);
        }
      };

      this.open = (id) => api.get('changes/' + id).then(show).catch(showError);
      // Back to the list, which is loaded again (the change may have moved on)
      this.backToList = () => {
        clearTimeout(pollTimer);
        this.detail(null);
        this.file(null);
        this.infoOpen(false);
        loadList();
        window.scrollTo(0, 0);
      };
      const base = () => 'changes/' + this.detail().id;

      this.create = () => api.post('requirements/' + this.requirementId() + '/changes')
        .then((detail) => { this.requirementId(null); show(detail); toast.success('Change created. The impact analysis is running.'); })
        .catch(failed);
      this.analyzeAgain = () => api.post(base() + '/analyze').then(done('Impact analysis started again.')).catch(failed);
      // A plan the analysis says may be missing files is refused with what looks missing; only confirming that approves it
      const INCOMPLETE_PLAN = 'Incomplete plan: ';
      // (the confirmation names the plan revision the refusal named: a plan changed meanwhile is refused again)
      const approveIncomplete = (error) => {
        if (error.status !== 409 || String(error.message).indexOf(INCOMPLETE_PLAN) !== 0) {
          return failed(error);
        }
        const revision = /\brevision (\d+) of the plan\b/.exec(error.message);
        return ask('Approve an incomplete plan?', error.message.substring(INCOMPLETE_PLAN.length).replace(/^./, (c) => c.toUpperCase()),
          'Approve Incomplete Plan', true).then((ok) => (ok ? api.post(base() + '/approve-plan?incomplete=true'
            + (revision ? '&revision=' + revision[1] : ''))
          .then(done('Plan approved although files may be missing. The model is writing the code.')).catch(approveIncomplete) : null));
      };
      this.approvePlan = () => ask('Approve this plan?', 'The model will write ' + this.detail().plan.items.length + ' file(s) for this change.', 'Approve Plan')
        .then((ok) => (ok ? api.post(base() + '/approve-plan').then(done('Plan approved. The model is writing the code.')).catch(approveIncomplete) : null));
      this.togglePlanJson = () => {
        this.editingPlan(!this.editingPlan());
        this.planJson(this.editingPlan() ? JSON.stringify(this.detail().plan, null, 2) : '');
      };
      this.savePlan = () => api.put(base() + '/plan', this.planJson())
        .then((detail) => { this.editingPlan(false); show(detail); toast.success('Plan saved.'); })
        .catch(failed);
      // Planned files the model has not written (not yet, or it could not): delivering leaves them out
      this.unwritten = ko.pureComputed(() => (this.detail() ? this.detail().files : [])
        .filter((f) => f.status === 'PENDING' || f.status === 'FAILED').map((f) => f.path));
      const incompleteNote = () => this.unwritten().length + ' planned file(s) are not written and would be left out: '
        + this.unwritten().slice(0, 5).join(', ') + (this.unwritten().length > 5 ? ' …' : '') + '.';
      this.deliver = () => (this.unwritten().length
        ? ask('Submit an incomplete change?', incompleteNote() + ' The branch may not build. Write them first with Continue generation or Write again.', 'Submit Without Them', true)
        : ask('Submit for review?', 'The reviewed code is committed to a new SVN branch. Trunk is not changed.', 'Submit for Review')).then((ok) => {
        if (!ok) {
          return;
        }
        this.busy(true);
        commit(this.unwritten().length ? ['incomplete=true'] : []).finally(() => this.busy(false));
      });
      // Files that fail their checks are refused by the server (409 "Failing checks: ..."): delivering them is confirmed
      const FAILED_CHECKS = 'Failing checks: ';
      const commit = (query) => busyService.block(api.post(base() + '/deliver' + (query.length ? '?' + query.join('&') : '')),
        'Committing the change to a new SVN branch…')
        .then(done('Committed to a new SVN branch for review.'))
        .catch((error) => (error.status === 409 && String(error.message).indexOf(FAILED_CHECKS) === 0 && query.indexOf('failedChecks=true') < 0
          ? ask('Submit files that fail their checks?', error.message.substring(FAILED_CHECKS.length).replace(/^./, (c) => c.toUpperCase()),
            'Submit Anyway', true).then((ok) => (ok ? commit(query.concat('failedChecks=true')) : null))
          : failed(error)));
      this.continueGeneration = () => api.post(base() + '/continue').then(done('The model is writing the files not written yet.')).catch(failed);
      // The patch link: an incomplete change is confirmed first, and only the confirmed download asks for it
      // (the link itself never carries the flag, so opening it in a new tab is refused, not downloaded)
      const confirmPatch = () => ask('Download an incomplete patch?', incompleteNote(), 'Download Without Them', true).then((ok) => {
        if (ok) {
          window.location.href = this.patchUrl() + '?incomplete=true';
        }
      });
      this.downloadPatch = (event) => {
        if (!this.unwritten().length) {
          return;
        }
        event.preventDefault();
        confirmPatch();
      };
      this.build = () => api.post(base() + '/build').then(done('Jenkins build started.')).catch(failed);
      this.checkAgain = () => api.post(base() + '/check').then(done('Quick checks run again.')).catch(failed);
      const close = (reason, force) => api.post(base() + '/close', { reason: reason, force: force })
        .then((detail) => { show(detail); loadList(); });
      const liveBranch = () => this.detail().branchUrl && !this.detail().branchDeletedRevision;
      this.closeMerged = () => ask('Close this change as merged?', liveBranch()
        ? 'The factory checks in SVN that the branch is merged into trunk, then removes the branch (it stays in the SVN history).'
        : 'The change is closed as merged or applied.', 'Close as Merged').then((ok) => {
        if (!ok) {
          return;
        }
        this.busy(true);
        close('MERGED', false)
          .catch((error) => {
            if (error.status === 409 && error.message.indexOf('Merge the branch first') >= 0) {
              return ask('Close anyway?', error.message + ' Close anyway and remove the branch?', 'Close Anyway', true)
                .then((force) => (force ? close('MERGED', true) : 'cancelled'));
            }
            throw error;
          })
          .then((result) => { if (result !== 'cancelled') { toast.success('Change closed as merged.'); } })
          .catch(failed).finally(() => this.busy(false));
      });
      this.abandon = () => ask('Abandon this change?', liveBranch() ? 'Its branch is removed from SVN (it stays in the SVN history).' : 'The change is closed without being merged.', 'Abandon', true).then((ok) => {
        if (!ok) {
          return;
        }
        this.busy(true);
        close('ABANDONED', false).then(() => toast.success('Change abandoned.')).catch(failed).finally(() => this.busy(false));
      });
      this.canClose = ko.pureComputed(() => {
        const d = this.detail();
        return !!d && this.canManage() && d.buildStatus !== 'BUILDING'
          && ['PLAN_READY', 'GENERATED', 'DELIVERED', 'FAILED'].indexOf(d.status) >= 0;
      });

      // Delete, from the change's menu or a row's menu in the list
      const removeChange = (id) => ask('Delete this change?', 'The change, its plan and its generated code are deleted. This cannot be undone.', 'Delete', true).then((ok) => {
        if (!ok) {
          return;
        }
        api.del('changes/' + id).then(() => {
          if (this.detail() && this.detail().id === id) {
            this.backToList();
          } else {
            loadList();
          }
          toast.success('Change deleted.');
        }).catch(failed);
      });
      this.remove = () => removeChange(this.detail().id);

      this.openTabs = ko.observableArray([]);
      this.openFile = (path, keepMode) => api.get(base() + '/file?path=' + encodeURIComponent(path))
        .then((file) => {
          this.file(file);
          if (this.openTabs().indexOf(path) < 0) {
            this.openTabs.push(path);
          }
          if (!keepMode) {
            this.fileMode('diff');
          }
        }).catch(showError);
      this.showDiff = () => this.fileMode('diff');
      this.showFull = () => this.fileMode('full');
      this.showSplit = () => this.fileMode('split');
      this.startEdit = () => {
        this.editContent(this.file().generated || '');
        this.fileMode('edit');
      };
      this.saveEdit = () => api.put(base() + '/file', { path: this.file().path, content: this.editContent() })
        .then((detail) => { this.fileMode('diff'); show(detail); toast.success('Draft saved.'); })
        .catch(failed);
      this.regenerate = () => api.post(base() + '/regenerate', { path: this.file().path, note: this.regenerateNote() || null })
        .then((detail) => { this.regenerateNote(''); show(detail); toast.info('The model is writing the file again.'); })
        .catch(failed);

      // ---- The status of a change, in the list and in its header ----
      const STATUS_PILLS = {
        ANALYZING: pill('Planning', 'blue'), PLAN_READY: pill('Needs approval', 'amber'), GENERATING: pill('Writing code', 'blue'),
        GENERATED: pill('Code to review', 'green'), DELIVERED: pill('Delivered', 'green'), FAILED: pill('Failed', 'red'), CLOSED: pill('Closed', 'grey')
      };
      const unwrittenOf = (c) => c.files.filter((f) => f.status === 'PENDING' || f.status === 'FAILED').length;
      // A written change with planned files missing says so: it is only partly written, and is not delivered
      const statusOf = (c) => (c.status === 'GENERATED' && unwrittenOf(c) ? ui.status('WARNING', 'Partly written')
        : ui.status(c.status, c.status === 'CLOSED' && c.closedReason === 'MERGED' ? 'Merged' : c.status === 'CLOSED' && c.closedReason === 'ABANDONED' ? 'Abandoned' : STATUS_PILLS[c.status].text));
      this.changeCode = ko.pureComputed(() => (this.detail() ? code(this.detail().id) : ''));
      this.statusPill = ko.pureComputed(() => (this.detail() ? statusOf(this.detail()) : ui.status('', '–')));

      // ---- The list: state chips with counts, a search, compact rows ----
      this.search = ko.observable('');
      this.stateFilter = ko.observable('');
      this.chips = ko.pureComputed(() => {
        const all = this.changes();
        const n = (v) => all.filter((c) => c.status === v).length;
        return [{ value: '', text: 'All ' + all.length, title: 'Every change', dot: '',
          pressed: ko.pureComputed(() => String(!this.stateFilter())), pick: () => this.stateFilter('') }]
          .concat(CHIPS.filter((c) => n(c[0]) > 0 || this.stateFilter() === c[0]).map((c) => ({
            value: c[0], text: c[1] + ' ' + n(c[0]), dot: c[2] ? 'factory-rq-fdot ' + c[2] : 'factory-rq-fdot',
            title: 'Show only changes that are ' + c[1].toLowerCase(),
            pressed: ko.pureComputed(() => String(this.stateFilter() === c[0])),
            pick: () => this.stateFilter(this.stateFilter() === c[0] ? '' : c[0])
          })));
      });
      this.clearFilters = () => { this.search(''); this.stateFilter(''); };
      this.filtered = ko.pureComputed(() => !!(this.search() || '').trim() || !!this.stateFilter());
      // The next step of a change in the list, in a few words; it opens the change, where the step is done
      const rowNext = (c) => {
        if (c.status === 'ANALYZING') {
          return { text: 'Follow the analysis', label: 'The impact analysis is running. Opens the change.' };
        }
        if (c.status === 'PLAN_READY') {
          return this.canApprove() ? { text: 'Review and approve the plan', label: 'The plan waits for approval. Opens the change.' }
            : { text: 'Waiting for approval', label: 'The plan waits for someone with the right to approve. Opens the change.' };
        }
        if (c.status === 'GENERATING') {
          return { text: 'Follow the writing', label: 'The model is writing the code. Opens the change.' };
        }
        if (c.status === 'GENERATED') {
          return unwrittenOf(c) ? { text: 'Finish the code', label: 'Planned files are not written yet. Opens the change.' }
            : { text: 'Review and submit', label: 'Review the code, then submit it for review. Opens the change.' };
        }
        if (c.status === 'FAILED') {
          return { text: 'Analyze again', label: 'The last step failed. Opens the change.' };
        }
        if (c.status === 'DELIVERED') {
          return { text: 'Merge, then close', label: 'Delivered to an SVN branch: merge it, then close the change. Opens the change.' };
        }
        return null;
      };
      // The last Jenkins result of a change, only when it has one
      const buildOf = (c) => {
        if (c.buildStatus === 'BUILDING') {
          return ui.status('RUNNING', 'Building');
        }
        return c.buildStatus === 'PASSED' ? ui.status('PASSED', 'Build passed') : c.buildStatus === 'FAILED' ? ui.status('FAILED', 'Build failed') : null;
      };
      this.rows = ko.pureComputed(() => {
        const text = (this.search() || '').trim().toLowerCase();
        const titles = requirementTitles();
        const ws = workspaceName();
        return this.changes().map((c) => Object.assign({}, c, { code: code(c.id), reqCode: reqCode(c.requirementId), requirementTitle: titles[c.requirementId] || 'Requirement' }))
          .filter((c) => (!text || (c.code + ' ' + c.title + ' ' + c.reqCode + ' ' + c.requirementTitle).toLowerCase().indexOf(text) >= 0)
            && (!this.stateFilter() || c.status === this.stateFilter()))
          .map((c) => {
            const planned = c.files.length;
            const written = planned - unwrittenOf(c);
            const canManage = this.canManage();
            return {
              id: c.id, title: c.title, code: c.code, reqCode: c.reqCode, requirementTitle: c.requirementTitle, workspace: ws,
              status: statusOf(c),
              files: planned ? { text: written + ' of ' + planned + ' files', title: written + ' of the ' + planned + ' planned files are written',
                style: { width: Math.round(100 * written / planned) + '%' } } : null,
              build: buildOf(c),
              next: rowNext(c),
              doneText: c.status === 'CLOSED' ? (c.closedReason === 'MERGED' ? 'Closed as merged' : 'Closed') : '',
              when: dashboard.ago(c.updatedAt),
              whenTitle: dashboard.when(c.updatedAt),
              select: () => this.open(c.id),
              menuItems: [{ value: 'open', label: 'Open' }, { value: 'impact', label: 'Open Impact Analysis', disabled: !c.plan, title: c.plan ? null : 'The change has no plan yet' },
                { value: 'patch', label: 'Download patch', disabled: !c.files.some((f) => f.status !== 'PENDING'), title: 'Only the files written; an incomplete change asks first in the change' },
                { separator: true }, { value: 'delete', label: 'Delete', danger: true, disabled: !canManage, title: canManage ? null : 'You need the right to manage code' }],
              menu: (event) => {
                const v = event.detail.value;
                if (v === 'open') {
                  this.open(c.id);
                } else if (v === 'impact') {
                  openImpactOf(c.id);
                } else if (v === 'patch') {
                  if (unwrittenOf(c)) {
                    // An incomplete patch is confirmed in the change, where it says which files are left out
                    this.open(c.id).then(() => confirmPatch());
                  } else {
                    window.location.href = 'api/changes/' + c.id + '/patch';
                  }
                } else if (v === 'delete') {
                  removeChange(c.id);
                }
              }
            };
          });
      });
      this.shownText = ko.pureComputed(() => (this.filtered() ? this.rows().length + ' of ' + this.changes().length + ' shown' : ''));
      // The page's answer first: how many changes, and how many wait for someone
      this.lead = ko.pureComputed(() => {
        const all = this.changes();
        if (this.listLoading() || !all.length) {
          return 'Code changes planned from approved requirements, from the plan to the SVN branch';
        }
        const n = (s) => all.filter((c) => c.status === s).length;
        const open = all.filter((c) => c.status !== 'CLOSED').length;
        return [plural(all.length, 'change') + (open < all.length ? ', ' + open + ' open' : ''),
          n('PLAN_READY') ? n('PLAN_READY') + ' need' + (n('PLAN_READY') === 1 ? 's' : '') + ' approval' : '',
          n('GENERATED') ? n('GENERATED') + ' to review' : '',
          n('ANALYZING') + n('GENERATING') ? (n('ANALYZING') + n('GENERATING')) + ' running' : '',
          n('FAILED') ? n('FAILED') + ' failed' : ''].filter(Boolean).join(' · ');
      });
      this.emptyText = ko.pureComputed(() => (requirementOptions().length
        ? 'No changes yet. Start one from an approved requirement.'
        : 'No changes yet. Approve a requirement first; then start a change from it here.'));
      this.openRequirements = () => navigate('requirements');
      this.pageMenuItems = ko.pureComputed(() => [{ value: 'refresh', label: 'Refresh the list', icon: 'refresh' }]);
      this.pageMenu = () => { this.listLoading(true); loadList(); };

      // ---- The change's header: its IDs, the one next action, the stages, the one problem ----
      this.workspaceInfo = ko.observable(null);
      this.headerMeta = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return '';
        }
        const w = this.workspaceInfo();
        return [code(d.id), reqCode(d.requirementId), w ? w.name + ' · OBDX ' + w.obdxVersion : workspaceName(),
          d.baseRevision ? 'code at r' + d.baseRevision : null].filter(Boolean).join(' · ');
      });
      // The files by state, as chips over the tree (only states some file has); a chip filters the tree
      this.counts = ko.pureComputed(() => {
        const files = this.detail() ? this.detail().files : [];
        return STATE_ORDER.map((key) => {
          const n = files.filter((f) => stateOf(f) === key).length;
          return { key: key, label: STATES[key].label, n: n, title: STATES[key].tip + '. Show only these files.',
            badge: STATES[key].badge.length === 1 ? STATES[key].badge : '', badgeCss: STATES[key].badge.length === 1 ? 'factory-ch-badge factory-ch-badge-' + key : 'factory-ch-fdot factory-ch-fdot-' + key,
            pressed: ko.pureComputed(() => String(this.treeFilter() === key)),
            css: 'factory-ch-fstate factory-ch-fstate-' + key, pick: () => this.treeFilter(this.treeFilter() === key ? 'all' : key) };
        }).filter((c) => c.n > 0);
      });
      // Partial generation: what is written, what the limit cut off, what is not written, and that delivery leaves them out
      const partialText = (d) => {
        const n = (key) => d.files.filter((f) => stateOf(f) === key).length;
        const written = d.files.length - this.unwritten().length;
        return written + ' of ' + d.files.length + ' planned files are written'
          + (n('partial') ? '; ' + n('partial') + ' cut off by the model\'s limit (the part written is kept)' : '')
          + (n('failed') ? '; ' + n('failed') + ' failed' : '') + (n('pending') ? '; ' + n('pending') + ' not written yet' : '')
          + '. Continue generation goes on from where it stopped; delivering now leaves the others out.';
      };
      /** The change's last message under the header, shortened; not when the problem bar shows it (a failure). */
      this.lastMessage = ko.pureComputed(() => {
        const d = this.detail();
        return d && d.message && !this.running() && d.status !== 'FAILED' ? ui.shortError(d.message) : null;
      });
      const failedChecks = () => (this.detail() ? this.detail().files.filter((f) => f.checkStatus === 'FAILED' && f.status === 'GENERATED').length : 0);
      const MANAGE = 'You need the right to manage code.';
      /** The one primary action of the header, from the change's state; shown off with its reason when not allowed. */
      this.primary = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return null;
        }
        const s = d.status;
        if (s === 'PLAN_READY') {
          return { label: 'Approve plan', icon: 'check', id: 'approvePlanHeadButton', run: this.approvePlan, allowed: this.canApprove(), why: 'Someone with the right to approve does this.' };
        }
        if (s === 'FAILED') {
          return { label: 'Analyze again', icon: 'refresh', id: 'analyzeAgainButton', run: this.analyzeAgain, allowed: this.canManage(), why: MANAGE };
        }
        if (s === 'GENERATED' && this.unwritten().length) {
          return { label: 'Continue generation', icon: 'refresh', id: 'continueButton', run: this.continueGeneration, allowed: this.canManage(), why: MANAGE };
        }
        if (s === 'GENERATED') {
          return { label: 'Submit for review', icon: 'share', id: 'deliverButton', run: this.deliver, allowed: this.canManage() && !this.busy(), why: MANAGE };
        }
        if (s === 'DELIVERED') {
          return { label: 'Close as merged', icon: 'check', id: 'closeMergedButton', run: this.closeMerged, allowed: this.canClose() && !this.busy(), why: MANAGE };
        }
        return null;
      });
      /** What comes next, in one line, when there is no problem to show. */
      this.nextAction = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return null;
        }
        const s = d.status;
        if (s === 'ANALYZING') {
          return { text: 'Wait for the impact analysis; the plan shows here when it is ready.' };
        }
        if (s === 'PLAN_READY') {
          return { text: 'Review the plan (Plan, or Impact Analysis for the files, risks and review) and approve it; no code is written before.' };
        }
        if (s === 'GENERATING') {
          return { text: 'The model is writing the code. The files already written stay if it stops.' };
        }
        if (s === 'GENERATED') {
          return { text: 'Review the code, then submit it to a new SVN branch for review (you are asked first).' };
        }
        if (s === 'DELIVERED') {
          return { text: 'Delivered to ' + (d.branchUrl || 'SVN') + '. Merge the branch in SVN, then Close as merged (you are asked first).' };
        }
        if (s === 'CLOSED') {
          return { text: d.closedReason === 'MERGED' ? 'Closed as merged.' : 'Closed without being merged.' };
        }
        return null;
      });
      /** The one problem: the most important thing that is wrong, with its fix. */
      this.problem = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return null;
        }
        if (d.status === 'FAILED') {
          // A model server's raw error (its JSON, the model's address, the account) as one plain line; the whole text under Details
          const said = ui.shortError(d.message || 'The last step failed.');
          return { css: 'factory-rqd-problem is-error', lead: 'Failed.', detail: said.text + ' Analyze again to make a new plan.', details: said.details };
        }
        if (d.status === 'GENERATED' && this.unwritten().length) {
          return { css: 'factory-rqd-problem', lead: 'Partial generation:', detail: partialText(d), fix: { label: 'Show them', run: () => this.treeFilter('unwritten') } };
        }
        if (d.buildStatus === 'FAILED') {
          const n = this.lastBuild() ? (this.lastBuild().errors || []).length : 0;
          return { css: 'factory-rqd-problem is-error', lead: 'The Jenkins build failed' + (n ? ' with ' + plural(n, 'error') : '') + '.',
            detail: d.buildMessage ? ui.shortError(d.buildMessage).text : 'See Validation for the errors and the files they name.', fix: { label: 'Open Validation', run: () => this.tab('validation') } };
        }
        if (d.status === 'GENERATED' && failedChecks()) {
          return { css: 'factory-rqd-problem', lead: plural(failedChecks(), 'file') + ' failed the quick checks:', detail: 'open them, then Write again or Edit, and run the checks again.',
            fix: { label: 'Show them', run: () => this.treeFilter('warn') } };
        }
        if (d.status === 'PLAN_READY' && d.plan && d.plan.incomplete) {
          return { css: 'factory-rqd-problem', lead: 'Files may be missing from this plan.', detail: 'The analysis did not finish it; approving asks you to confirm that.',
            fix: { label: 'Open Impact Analysis', run: () => this.openImpact() } };
        }
        return null;
      });
      // Plan, approve, write the code, build, deliver: each with what the factory recorded for it
      this.stepper = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const s = d.status;
        const planned = d.files.length;
        const written = planned - this.unwritten().length;
        const codeDone = ['GENERATED', 'DELIVERED', 'CLOSED'].indexOf(s) >= 0 && planned > 0 && !this.unwritten().length;
        const delivered = !!d.deliveredRevision;
        const buildBad = d.buildStatus === 'FAILED' || (!d.buildStatus && this.checkSummary().failed > 0);
        const steps = [
          { name: 'Plan', state: d.plan ? 'done' : s === 'FAILED' ? 'failed' : s === 'ANALYZING' ? 'current' : 'todo',
            sub: d.plan ? plural(d.plan.items.length, 'file') + ' planned' : s === 'FAILED' ? 'The analysis failed' : 'Analyzing',
            go: d.plan ? () => this.tab('plan') : null, goLabel: 'Show the plan' },
          { name: 'Approve', state: d.planApprovedAt ? 'done' : s === 'PLAN_READY' ? 'current' : 'todo',
            sub: d.planApprovedAt ? 'By ' + (d.planApprovedBy || 'a lead') + ' · ' + dashboard.ago(d.planApprovedAt) : s === 'PLAN_READY' ? 'Waiting for approval' : 'Not yet',
            go: d.plan ? () => this.openImpact() : null, goLabel: 'Open Impact Analysis: the files, risks and review of the plan' },
          { name: 'Write code', state: codeDone ? 'done' : (s === 'GENERATING' || (s === 'GENERATED' && this.unwritten().length)) ? 'current' : 'todo',
            sub: !planned || !d.planApprovedAt ? 'Not yet' : s === 'GENERATING' ? written + ' of ' + planned + ' written so far' : written + ' of ' + planned + ' files written' },
          { name: 'Build', state: !codeDone ? 'todo' : buildBad ? 'failed' : this.validationOk() ? 'done' : s === 'GENERATED' ? 'current' : 'todo',
            sub: !codeDone ? 'Not yet' : this.validationTitle(), go: codeDone ? () => this.tab('validation') : null, goLabel: 'Show the quick checks and builds' },
          { name: 'Deliver', state: delivered ? 'done' : codeDone && s === 'GENERATED' && this.validationOk() ? 'current' : 'todo',
            sub: delivered ? 'SVN r' + d.deliveredRevision + (s === 'CLOSED' ? (d.closedReason === 'MERGED' ? ' · merged' : ' · closed') : ' · merge, then close')
              : s === 'CLOSED' ? 'Closed' : 'Not delivered' }
        ];
        return steps.map((st, i) => Object.assign(st, {
          n: i + 1, go: st.go || null, goLabel: st.goLabel || '',
          css: 'factory-rqd-step is-' + st.state, current: st.state === 'current' ? 'step' : null
        }));
      });
      this.stepperLabel = ko.pureComputed(() => {
        const at = this.stepper().find((st) => st.state === 'current' || st.state === 'failed');
        return 'Stages: ' + (at ? at.name + ', ' + at.sub : this.stepper().every((st) => st.state === 'done') ? 'all done' : 'none started');
      });

      // ---- Change details and history (side sheet) ----
      this.infoOpen = ko.observable(false);
      this.openInfo = () => this.infoOpen(true);
      this.facts = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const w = this.workspaceInfo();
        const at = (by, value) => (by ? by + ' · ' : '') + ui.when(value);
        return [
          { label: 'Requirement', value: reqCode(d.requirementId) + ' · ' + (requirementTitles()[d.requirementId] || 'Requirement') },
          { label: 'Workspace', value: w ? w.name + ' · OBDX ' + w.obdxVersion : workspaceName() },
          { label: 'Requested', value: at(d.createdBy || '?', d.createdAt) },
          d.baseRevision ? { label: 'Code read at', value: 'r' + d.baseRevision, mono: true } : null,
          d.planApprovedAt ? { label: 'Plan approved', value: at(d.planApprovedBy, d.planApprovedAt) } : null,
          d.branchUrl ? { label: 'SVN branch', value: d.branchUrl + (d.branchDeletedRevision ? ' (removed at r' + d.branchDeletedRevision + ')' : ''), mono: true } : null,
          d.deliveredRevision ? { label: 'Delivered at', value: 'r' + d.deliveredRevision, mono: true } : null,
          d.closedAt ? { label: 'Closed', value: (d.closedReason === 'MERGED' ? 'As merged' : 'Abandoned') + ' · ' + at(d.closedBy, d.closedAt) } : null,
          { label: 'Last update', value: ui.when(d.updatedAt) }
        ].filter(Boolean);
      });
      this.openRequirement = () => {
        if (this.detail()) {
          pageRequests.requirement(this.detail().requirementId);
        }
        navigate('requirements');
      };

      // ---- The selected file's details: requirement, reason, generation, validation ----
      this.fileDetail = ko.pureComputed(() => {
        const file = this.file();
        const d = this.detail();
        if (!file || !d) {
          return null;
        }
        const view = d.files.find((f) => f.path === file.path) || null;
        const item = d.plan ? d.plan.items.find((i) => i.path === file.path) || null : null;
        const text = item ? (item.purpose || '') + ' ' + (item.details || '') : '';
        const refs = Array.from(new Set(text.match(REFS) || []));
        const state = view ? stateOf(view) : null;
        const message = view && view.checkMessage ? view.checkMessage : '';
        const rewrite = message.indexOf(REWRITE) === 0 ? message.split('\n')[0] : '';
        const checkText = rewrite ? message.split('\n').slice(1).join('\n') : message;
        const name = file.path.split('/').pop();
        const lastBuild = this.lastBuild();
        return {
          path: file.path,
          state: state ? STATES[state].label : 'Not in the plan',
          stateCss: 'factory-ch-badge factory-ch-badge-' + (state || 'pending'),
          requirement: refs.length ? refs.join(', ') : 'REQ-' + d.requirementId.replace(/-/g, '').slice(0, 4).toUpperCase(),
          requirementNote: refs.length ? 'Named in the plan for this file' : 'The change\'s requirement; the plan names no single item of it for this file',
          reason: item ? item.purpose || '–' : 'Not in the plan',
          details: item ? item.details || '' : '',
          action: item ? (item.action === 'create' ? 'Create' : 'Modify') + ' · ' + item.layer : '',
          follows: item && item.basedOn && item.basedOn.length ? item.basedOn.join(', ') : '',
          generation: !view ? '' : (state === 'pending' ? 'Not written yet' : state === 'partial' ? 'Cut off part-way; the part written is kept'
            : STATES[state].label) + (view.attempts ? ' · ' + view.attempts + (view.attempts === 1 ? ' attempt' : ' attempts') : '')
            + (view.edited ? ' · edited by a reviewer' : ''),
          rewrite: rewrite,
          lines: view && (view.linesAdded || view.linesRemoved) ? '+' + view.linesAdded + ' / -' + view.linesRemoved + ' lines' : '',
          check: ui.status((view && view.checkStatus) || 'NOT_CHECKED', CHECK_WORDS[(view && view.checkStatus) || 'NOT_CHECKED']),
          checkMessage: state === 'partial' ? '' : checkText,
          buildErrors: lastBuild ? (lastBuild.errors || []).filter((e) => e.indexOf(name) >= 0).slice(0, 5) : [],
          buildNote: lastBuild ? 'Last Jenkins build: ' + (lastBuild.result || 'running') : 'No Jenkins build yet',
          resumes: state === 'partial' || !!rewrite
        };
      });
      // Write again and Edit, only where the server allows them: a written change, someone who may manage code
      this.canWriteAgain = ko.pureComputed(() => !!this.detail() && this.detail().status === 'GENERATED' && this.canManage() && !this.busy());
      this.canEditFile = ko.pureComputed(() => this.canWriteAgain() && !!this.file() && !!this.file().generated);
      this.writeAgainTip = ko.pureComputed(() => {
        const d = this.detail();
        if (!d || d.status !== 'GENERATED') {
          return d && d.status === 'GENERATING' ? 'Wait until the model has finished writing.' : 'Files can be written again while the code is being reviewed, before delivery.';
        }
        if (!this.canManage()) {
          return 'You need the right to manage code.';
        }
        return this.fileDetail() && this.fileDetail().resumes
          ? 'Without a note, Write again goes on from the part kept; with a note it starts the file afresh.'
          : 'Write this file again, with your note to the model if you give one.';
      });
      // Live progress of the background step, from the polled change: its files and its message
      this.running = ko.pureComputed(() => !!this.detail() && RUNNING.indexOf(this.detail().status) >= 0);
      this.progress = ko.pureComputed(() => {
        const d = this.detail();
        if (!this.running()) {
          return null;
        }
        const note = 'Checked every ' + (POLL_MS / 1000) + ' s · last update ' + ui.when(d.updatedAt);
        if (d.status === 'ANALYZING') {
          return { text: (d.message || 'Analyzing the impact on the codebase...') + ' The server reports no step counts while it analyzes.', max: 0, note: note };
        }
        const planned = d.files.length;
        const pending = d.files.filter((f) => f.status === 'PENDING').length;
        if (!planned || !pending) {
          // Writing one file again: every file already has a result, so only the message says what is happening
          return { text: d.message || 'Writing the code...', max: 0, note: note };
        }
        const written = planned - pending;
        const failedFiles = d.files.filter((f) => f.status === 'FAILED').length;
        return {
          text: written + ' of ' + planned + ' files written' + (failedFiles ? ', ' + failedFiles + ' failed' : ''),
          value: written, max: planned, label: 'Files written', style: { width: Math.round(100 * written / planned) + '%' }, note: note
        };
      });
      // New change: from an approved requirement (the list's New change menu)
      this.requirementChoices = requirementOptions;
      this.requirementMenu = ko.pureComputed(() => (requirementOptions().length
        ? requirementOptions().map((r) => ({ value: r.value, label: r.label }))
        : [{ value: '', label: 'No approved requirements yet', disabled: true }]));
      this.startFrom = (event) => { if (event.detail.value) { this.requirementId(event.detail.value); this.create(); } };

      // The side panel: the selected file, validation, the plan and the assistant, one row of tabs (the history is in
      // the change details sheet)
      this.tab = ko.observable('file');
      this.tabs = ui.tabs(this.tab, [
        { value: 'file', label: 'File' },
        { value: 'validation', label: 'Validation' },
        { value: 'plan', label: 'Plan' },
        { value: 'assistant', label: 'Assistant' }
      ]);
      this.tabKey = (event) => {
        const keys = this.tabs.map((t) => t.value);
        const at = keys.indexOf(this.tab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.tab(keys[next]);
        const button = document.getElementById('wb-' + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };
      this.fileFilter = ko.observable('');
      this.fileFilterInput = ui.value(this.fileFilter);
      // Every file is marked by its state: created (A), modified (M), cut off, failed, not written or unchanged
      const badgeOf = (f) => {
        const state = f ? stateOf(f) : 'pending';
        return { badge: STATES[state].badge, badgeCss: 'factory-ch-badge factory-ch-badge-' + state, badgeTip: STATES[state].tip, state: state };
      };
      this.treeFilter = ko.observable('all');
      this.showAllFiles = () => this.treeFilter('all');
      this.collapsed = ko.observable({});
      const workspaceName = () => {
        const option = workspaceSelection.options().find((o) => o.value === this.workspaceId());
        return option ? option.label.split(' (')[0] : 'Workspace';
      };
      /** The change's files as nested folders, each folder with its files and subfolders, sorted. */
      const folderTree = (files) => {
        const root = { name: workspaceName(), path: '', folders: {}, files: [] };
        files.forEach((f) => {
          const parts = f.path.split('/');
          let node = root;
          parts.slice(0, -1).forEach((part, i) => {
            if (!node.folders[part]) {
              node.folders[part] = { name: part, path: parts.slice(0, i + 1).join('/'), folders: {}, files: [] };
            }
            node = node.folders[part];
          });
          node.files.push(f);
        });
        return root;
      };
      const pickFiles = (d) => {
        const text = this.fileFilter().trim().toLowerCase();
        const filter = this.treeFilter();
        return d.files.filter((f) => (!text || f.path.toLowerCase().indexOf(text) >= 0)
          && (filter === 'all' || (filter === 'warn' ? (f.checkStatus === 'WARNING' || f.checkStatus === 'FAILED')
            : filter === 'unwritten' ? (f.status === 'PENDING' || f.status === 'FAILED') : stateOf(f) === filter)));
      };
      /** Files in the order the tree shows them. */
      const orderedFiles = (node) => Object.keys(node.folders).sort().reduce((list, key) => list.concat(orderedFiles(node.folders[key])), [])
        .concat(node.files.slice().sort((a, b) => a.path.localeCompare(b.path)));
      const firstFile = (d) => orderedFiles(folderTree(d.files)).find((f) => f.status === 'GENERATED') || orderedFiles(folderTree(d.files))[0] || null;
      this.tree = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const collapsed = this.collapsed();
        const rows = [];
        const toggle = (path) => () => {
          const next = Object.assign({}, this.collapsed());
          next[path] = !next[path];
          this.collapsed(next);
        };
        const walk = (node, depth) => {
          Object.keys(node.folders).sort().forEach((key) => {
            // A folder with one subfolder and no files shows as one row: com/bank/obdx
            let folder = node.folders[key];
            let name = folder.name;
            while (Object.keys(folder.folders).length === 1 && folder.files.length === 0) {
              folder = folder.folders[Object.keys(folder.folders)[0]];
              name += '/' + folder.name;
            }
            const open = !collapsed[folder.path];
            rows.push({
              folder: true, name: name, path: folder.path, open: open, toggle: toggle(folder.path), level: depth + 1,
              icon: 'factory-nav-icon factory-ico-folder-fill', style: { paddingLeft: (depth * 12 + 2) + 'px' }, css: 'factory-ch-node factory-ch-folder'
            });
            if (open) {
              walk(folder, depth + 1);
            }
          });
          node.files.slice().sort((a, b) => a.path.localeCompare(b.path)).forEach((f) => rows.push({
            folder: false, name: f.path.split('/').pop(), style: { paddingLeft: (depth * 12 + 2) + 'px' }, path: f.path, level: depth + 1,
            badge: badgeOf(f).badge, badgeCss: badgeOf(f).badgeCss, badgeTip: badgeOf(f).badgeTip,
            selected: ko.pureComputed(() => (this.file() && this.file().path === f.path ? 'true' : 'false')),
            css: ko.pureComputed(() => 'factory-ch-node factory-ch-file factory-ch-file-' + badgeOf(f).state
              + (this.file() && this.file().path === f.path ? ' factory-ch-file-on' : '')),
            open: () => this.openFile(f.path)
          }));
        };
        const files = pickFiles(d);
        if (files.length === 0) {
          return [];
        }
        const root = folderTree(files);
        const rootOpen = !collapsed[''];
        rows.push({
          folder: true, name: root.name, path: '', open: rootOpen, toggle: toggle(''), icon: 'factory-nav-icon factory-ico-bank', level: 1,
          style: { paddingLeft: '2px' }, css: 'factory-ch-node factory-ch-folder factory-ch-root'
        });
        if (rootOpen) {
          walk(root, 1);
        }
        return rows;
      });
      const TREE_FILTERS = [{ value: 'all', label: 'All files' }]
        .concat(STATE_ORDER.map((key) => ({ value: key, label: STATES[key].label + (STATES[key].badge.length === 1 ? ' (' + STATES[key].badge + ')' : '') })))
        .concat([{ value: 'unwritten', label: 'Not written yet, cut off or failed' }, { value: 'warn', label: 'With check warnings or failures' }]);
      /**
       * Keys in the file tree: up and down move between rows, Home and End to the ends, right opens a folder and left
       * closes it, Enter or Space opens the file or folder.
       */
      this.treeKey = (event) => {
        const rows = [...document.querySelectorAll('#fileTree [role=treeitem]')];
        const at = rows.indexOf(document.activeElement);
        const go = (i) => {
          const row = rows[Math.min(Math.max(i, 0), rows.length - 1)];
          if (row) {
            row.focus();
          }
        };
        const row = at >= 0 ? rows[at] : null;
        const isFolder = !!row && row.hasAttribute('aria-expanded');
        const keepFocus = () => {
          const path = row.getAttribute('data-path');
          setTimeout(() => {
            const again = document.querySelector('#fileTree [role=treeitem][data-path="' + path.replace(/"/g, '\\"') + '"]');
            if (again) {
              again.focus();
            }
          }, 60);
        };
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          go(at + (event.key === 'ArrowDown' ? 1 : -1));
        } else if (event.key === 'Home' || event.key === 'End') {
          go(event.key === 'Home' ? 0 : rows.length - 1);
        } else if (row && (event.key === 'Enter' || event.key === ' ' || (isFolder && ((event.key === 'ArrowRight' && row.getAttribute('aria-expanded') === 'false')
          || (event.key === 'ArrowLeft' && row.getAttribute('aria-expanded') === 'true'))))) {
          row.click();
          keepFocus();
        } else {
          return true;
        }
        event.preventDefault();
        return false;
      };
      // (each state is a chip over the tree; the menu has the other filters and the folders)
      this.treeFilterItems = ko.pureComputed(() => TREE_FILTERS.filter((f) => STATE_ORDER.indexOf(f.value) < 0)
        .map((f) => ({ value: f.value, label: f.label, icon: this.treeFilter() === f.value ? 'check' : '' }))
        .concat([{ separator: true }, { value: 'expand', label: 'Expand all folders' }, { value: 'collapse', label: 'Collapse all folders' }]));
      this.treeFilterLabel = ko.pureComputed(() => (this.treeFilter() === 'all' ? 'Filter files'
        : 'Filter files: ' + TREE_FILTERS.find((f) => f.value === this.treeFilter()).label));
      this.pickTreeFilter = (event) => {
        const value = event.detail.value;
        if (value === 'expand') {
          this.collapsed({});
        } else if (value === 'collapse') {
          const all = {};
          (this.detail() ? this.detail().files : []).forEach((f) => {
            const parts = f.path.split('/');
            parts.slice(0, -1).forEach((part, i) => { all[parts.slice(0, i + 1).join('/')] = true; });
          });
          this.collapsed(all);
        } else {
          this.treeFilter(value);
        }
      };
      // The selected file's lines: the diff, or the whole generated file, with line numbers
      this.codeLines = ko.pureComputed(() => {
        const file = this.file();
        if (!file) {
          return [];
        }
        const lang = highlight.langOf(file.path);
        const state = highlight.start();
        if (this.fileMode() === 'full') {
          return (file.generated || file.original || '').split('\n').map((line, i) => ({ n: i + 1, sign: '', text: line, html: highlight.html(line, lang, state), css: 'factory-ch-line' }));
        }
        if (!file.diff) {
          const empty = file.generated === null ? '(not written yet)' : '(no changes)';
          return [{ n: '', sign: '', text: empty, html: highlight.escape(empty), css: 'factory-ch-line' }];
        }
        // Removed lines are coloured with the old file's state, the others with the new file's
        const oldState = highlight.start();
        let n = 0;
        return file.diff.replace(/\n$/, '').split('\n').filter((line) => !/^(Index:|====|\+\+\+|---)/.test(line)).map((line) => {
          const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
          if (hunk) {
            n = Number(hunk[1]) - 1;
            return { n: '', sign: '', text: line, html: highlight.escape(line), css: 'factory-ch-line factory-ch-hunk' };
          }
          const sign = line.charAt(0);
          if (sign !== '-') {
            n++;
          }
          return {
            n: sign === '-' ? '' : n, sign: sign === '+' || sign === '-' ? sign : '', text: line.slice(1),
            html: highlight.html(line.slice(1), lang, sign === '-' ? oldState : state),
            css: 'factory-ch-line' + (sign === '+' ? ' factory-ch-add' : sign === '-' ? ' factory-ch-del' : '')
          };
        });
      });
      // Before and after side by side: removed lines on the left, added lines on the right, paired in order
      this.splitLines = ko.pureComputed(() => {
        const file = this.file();
        if (!file || !file.diff) {
          const empty = file && file.generated === null ? '(not written yet)' : '(no changes)';
          return [{ css: 'factory-ch-srow', ln: '', lt: empty, rn: '', rt: '', lhtml: highlight.escape(empty), rhtml: '', lcss: 'factory-ch-sside', rcss: 'factory-ch-sside' }];
        }
        const rows = [];
        let dels = [];
        let adds = [];
        let oldN = 0;
        let newN = 0;
        const lang = highlight.langOf(file.path);
        const left = highlight.start();
        const right = highlight.start();
        const flush = () => {
          for (let i = 0; i < Math.max(dels.length, adds.length); i++) {
            const l = dels[i];
            const r = adds[i];
            rows.push({
              css: 'factory-ch-srow', ln: l ? l.n : '', lt: l ? l.text : '', rn: r ? r.n : '', rt: r ? r.text : '',
              lhtml: l ? highlight.html(l.text, lang, left) : '', rhtml: r ? highlight.html(r.text, lang, right) : '',
              lcss: 'factory-ch-sside' + (l ? ' factory-ch-del' : ' factory-ch-sempty'), rcss: 'factory-ch-sside' + (r ? ' factory-ch-add' : ' factory-ch-sempty')
            });
          }
          dels = [];
          adds = [];
        };
        file.diff.replace(/\n$/, '').split('\n').filter((line) => !/^(Index:|====|\+\+\+|---)/.test(line)).forEach((line) => {
          const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
          if (hunk) {
            flush();
            oldN = Number(hunk[1]) - 1;
            newN = Number(hunk[2]) - 1;
            rows.push({ css: 'factory-ch-srow factory-ch-hunk', ln: '', lt: line, rn: '', rt: '', lhtml: highlight.escape(line), rhtml: '', lcss: 'factory-ch-sside', rcss: 'factory-ch-sside' });
            return;
          }
          const sign = line.charAt(0);
          if (sign === '-') {
            dels.push({ n: ++oldN, text: line.slice(1) });
          } else if (sign === '+') {
            adds.push({ n: ++newN, text: line.slice(1) });
          } else {
            flush();
            rows.push({ css: 'factory-ch-srow', ln: ++oldN, lt: line.slice(1), rn: ++newN, rt: line.slice(1), lhtml: highlight.html(line.slice(1), lang, left),
              rhtml: highlight.html(line.slice(1), lang, right), lcss: 'factory-ch-sside', rcss: 'factory-ch-sside' });
          }
        });
        flush();
        return rows;
      });
      const fileOf = (path) => (this.detail() ? this.detail().files.find((f) => f.path === path) : null);
      this.fileStatus = ko.pureComputed(() => {
        const f = this.file() ? fileOf(this.file().path) : null;
        return f ? ui.status(stateOf(f) === 'partial' ? 'WARNING' : f.status, STATES[stateOf(f)].label + (f.edited ? ' (edited)' : '')) : null;
      });
      this.fileTabs = ko.pureComputed(() => this.openTabs().map((path) => {
        const f = fileOf(path);
        const badge = badgeOf(f, f ? f.action : 'modify');
        return {
          name: path.split('/').pop(), path: path, badge: badge.badge, badgeCss: badge.badgeCss,
          css: 'factory-ch-filetab' + (this.file() && this.file().path === path ? ' factory-ch-filetab-on' : ''),
          open: () => { if (!this.file() || this.file().path !== path) { this.openFile(path); } },
          close: () => this.closeTab(path)
        };
      }));
      this.closeTab = (path) => {
        const tabs = this.openTabs().filter((p) => p !== path);
        this.openTabs(tabs);
        if (this.file() && this.file().path === path) {
          if (tabs.length) {
            this.openFile(tabs[tabs.length - 1]);
          } else {
            this.file(null);
          }
        }
      };
      this.closeFile = () => (this.file() ? this.closeTab(this.file().path) : null);
      this.totals = ko.pureComputed(() => {
        const files = this.detail() ? this.detail().files : [];
        return {
          changed: files.filter((f) => f.status === 'GENERATED').length,
          added: '+' + files.reduce((sum, f) => sum + f.linesAdded, 0),
          removed: '-' + files.reduce((sum, f) => sum + f.linesRemoved, 0),
          total: files.length
        };
      });

      // Validation: quick checks over the files and the Jenkins builds
      this.checkSummary = ko.pureComputed(() => {
        const files = this.detail() ? this.detail().files : [];
        const c = (s) => files.filter((f) => f.checkStatus === s).length;
        return { passed: c('PASSED'), failed: c('FAILED'), warning: c('WARNING'), notChecked: files.length - c('PASSED') - c('FAILED') - c('WARNING') };
      });
      this.lastBuild = ko.pureComputed(() => {
        const builds = this.detail() ? this.detail().builds : [];
        return builds.length ? builds[builds.length - 1] : null;
      });
      this.validationTitle = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return '';
        }
        if (d.buildStatus === 'BUILDING') {
          return 'Build running';
        }
        if (d.buildStatus === 'PASSED') {
          return 'Build passed';
        }
        if (d.buildStatus === 'FAILED') {
          return 'Build failed';
        }
        const s = this.checkSummary();
        return s.failed ? 'Quick checks failed' : (s.passed ? 'Quick checks passed' : 'Not validated yet');
      });
      this.validationOk = ko.pureComputed(() => this.validationTitle() === 'Build passed' || this.validationTitle() === 'Quick checks passed');
      this.validationNote = ko.pureComputed(() => {
        const b = this.lastBuild();
        return b ? (b.job + (b.buildNumber ? ' #' + b.buildNumber : '') + ' · ' + (b.result || '') + ' · ' + ui.when(b.finishedAt || b.startedAt)) : 'Run quick checks, or build with Jenkins once it is set up.';
      });
      // What the last Jenkins build reported, split into test failures and the rest
      const lastErrors = () => (this.lastBuild() ? this.lastBuild().errors || [] : []);
      const isTest = (e) => /test|junit|assert|expected/i.test(e);
      this.buildErrors = ko.pureComputed(() => lastErrors().filter((e) => !isTest(e)));
      this.testErrors = ko.pureComputed(() => lastErrors().filter(isTest));
      this.testNote = ko.pureComputed(() => {
        const b = this.lastBuild();
        if (!b) {
          return 'Test results: no Jenkins build has run for this change yet. They come from the build\'s JUnit report.';
        }
        return b.result === 'SUCCESS' ? 'The last build (' + b.job + (b.buildNumber ? ' #' + b.buildNumber : '') + ') reported no failed tests.'
          : 'The last build reported no failed tests; see Build History for its other errors.';
      });
      const seconds = (b) => (b && b.finishedAt && b.startedAt ? Math.max(1, Math.round((new Date(b.finishedAt) - new Date(b.startedAt)) / 1000)) : null);
      const duration = (n) => (n === null ? '' : n >= 60 ? Math.floor(n / 60) + 'm ' + (n % 60) + 's' : n + 's');
      // The last build as three stages (shown only once there is a build); Jenkins reports one result and one duration
      // for the whole build, and no integration tests or static analysis of their own, so those are not shown
      this.pipeline = ko.pureComputed(() => {
        const s = this.checkSummary();
        const b = this.lastBuild();
        const running = b && (b.result === 'RUNNING' || b.result === 'QUEUED' || this.detail().buildStatus === 'BUILDING');
        const ok = b && b.result === 'SUCCESS';
        const total = duration(seconds(b));
        const stage = (name, state, time, title) => ({
          name: name, time: time, title: title,
          css: 'factory-ch-pipe factory-ch-pipe-' + state,
          icon: 'factory-nav-icon factory-ico-' + (state === 'ok' ? 'check' : state === 'bad' ? 'x' : state === 'warn' ? 'alert' : 'clock')
        });
        const notRun = 'No Jenkins build of this change yet.';
        return [
          stage('Compile', !b ? 'none' : running ? 'run' : this.buildErrors().length ? 'bad' : ok ? 'ok' : 'bad', b ? (total || 'Running') : 'Not run',
            b ? 'The whole Jenkins build took ' + (total || 'not finished yet') + '; Jenkins does not time each stage.' : notRun),
          stage('Unit tests', !b ? 'none' : running ? 'run' : this.testErrors().length ? 'bad' : ok ? 'ok' : 'none', b ? 'In the build' : 'Not run',
            b ? 'Part of the Jenkins build; it has no separate duration. Integration tests and static analysis are not reported separately.' : notRun),
          stage('OBDX checks', s.failed ? 'bad' : s.warning ? 'warn' : s.passed ? 'ok' : 'none', s.passed + ' passed · ' + s.warning + ' warn',
            'Quick checks of each file: ' + s.passed + ' passed, ' + s.warning + ' warnings, ' + s.failed + ' failed. They take no measurable time.')
        ];
      });
      this.buildTitle = ko.pureComputed(() => {
        const jenkins = this.jenkins();
        if (!jenkins || !jenkins.mode || jenkins.mode === 'NONE') {
          return 'Set up Jenkins for this workspace on the Integrations page first.';
        }
        return this.canBuild() ? 'Build this change with Jenkins' : 'Jenkins builds this change once it is delivered or generated.';
      });

      // History of the change from its own dates (the audit log has the rest, for administrators)
      this.history = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const items = [{ text: 'Change created by ' + (d.createdBy || '?'), at: d.createdAt }];
        if (d.planApprovedAt) {
          items.push({ text: 'Plan approved by ' + d.planApprovedBy, at: d.planApprovedAt });
        }
        d.builds.forEach((b) => items.push({ text: 'Round ' + b.round + ': ' + b.job + ' ' + (b.result || '') + (b.fixedFiles.length ? ', fixed ' + b.fixedFiles.length + ' files' : ''), at: b.startedAt }));
        // Files written again and failed deliveries, from the audit log (ChangeService.events)
        (d.events || []).forEach((e) => items.push({ text: e.text + (e.by ? ' by ' + e.by : ''), at: e.at }));
        if (d.deliveredRevision) {
          items.push({ text: 'Delivered to ' + (d.branchUrl || 'SVN') + ' at r' + d.deliveredRevision, at: d.updatedAt });
        }
        if (d.closedAt) {
          items.push({ text: 'Closed as ' + (d.closedReason || '').toLowerCase() + ' by ' + d.closedBy, at: d.closedAt });
        }
        return items.sort((a, b) => new Date(a.at) - new Date(b.at)).map((i) => Object.assign(i, { when: ui.when(i.at) }));
      });
      this.patchUrl = ko.pureComputed(() => (this.detail() ? 'api/changes/' + this.detail().id + '/patch' : '#'));
      // Impact Analysis and Build, Test & Review open on this change
      const openImpactOf = (id) => { pageRequests.change(id); navigate('impact'); };
      this.openImpact = () => openImpactOf(this.detail().id);
      this.openBuild = () => { pageRequests.change(this.detail().id); navigate('build'); };
      // The change's menu: everything that is not the one primary action, each where the server takes it
      this.moreItems = ko.pureComputed(() => {
        const d = this.detail();
        const s = d ? d.status : '';
        const primary = this.primary() ? this.primary().id : '';
        return [
          { value: 'check', label: 'Run quick checks again', icon: 'check', disabled: !this.hasCode() || !this.canManage() },
          primary !== 'continueButton' && s === 'GENERATED' && this.unwritten().length ? { value: 'continue', label: 'Continue generation', icon: 'refresh', disabled: !this.canManage() } : null,
          primary !== 'deliverButton' && s === 'GENERATED' ? { value: 'deliver', label: 'Submit for review…', icon: 'share', id: 'deliverMenuItem', disabled: !this.canManage() || this.busy(),
            title: this.unwritten().length ? 'Planned files are not written: you are asked first' : null } : null,
          primary !== 'analyzeAgainButton' ? { value: 'analyze', label: 'Analyze again', icon: 'refresh', disabled: !this.canManage() || ['PLAN_READY', 'FAILED'].indexOf(s) < 0,
            title: ['PLAN_READY', 'FAILED'].indexOf(s) < 0 ? 'Only a plan that is not approved yet can be analyzed again' : null } : null,
          { value: 'patch', label: 'Download patch', icon: 'download', disabled: !this.hasCode() },
          { separator: true },
          { value: 'impact', label: 'Open Impact Analysis', icon: 'branch', disabled: !(d && d.plan) },
          { value: 'build', label: 'Open Build, Test & Review', icon: 'flask' },
          { value: 'info', label: 'Change details and history', icon: 'clock' },
          { separator: true },
          primary !== 'closeMergedButton' ? { value: 'close', label: 'Close as merged', icon: 'check', disabled: !this.canClose() } : null,
          { value: 'abandon', label: 'Abandon', icon: 'x', disabled: !this.canClose() },
          { value: 'remove', label: 'Delete', icon: 'trash', danger: true, disabled: !this.canManage() }
        ].filter(Boolean);
      });
      this.moreAction = (event) => {
        const action = event.detail.value;
        if (action === 'patch') {
          if (this.unwritten().length) {
            confirmPatch();
          } else {
            window.location.href = this.patchUrl();
          }
          return;
        }
        ({ check: this.checkAgain, continue: this.continueGeneration, deliver: this.deliver, analyze: this.analyzeAgain, close: this.closeMerged,
          abandon: this.abandon, remove: this.remove, impact: this.openImpact, build: this.openBuild, info: this.openInfo })[action]();
      };
      this.aiTab = ko.observable('chat');
      this.analyseFile = () => {
        if (this.file()) {
          this.tab('assistant');
          this.aiTab('chat');
          this.ai.ask('Review the open file ' + this.file().path + ': what could be wrong, and what would you change?');
        }
      };

      this.ai = assistant.create(() => {
        const d = this.detail();
        if (!d) {
          return '';
        }
        const file = this.file();
        return 'Change "' + d.title + '" (' + d.status + ').\nPlan: ' + (d.plan ? d.plan.summary + '\nRisks: ' + d.plan.risks.join('; ')
          + '\nFiles:\n' + d.plan.items.map((i) => '- ' + i.action + ' ' + i.path + ' (' + i.layer + '): ' + i.purpose).join('\n') : 'none yet')
          + '\nQuick checks: ' + d.files.map((f) => f.path + ' ' + (f.checkStatus || 'not checked') + (f.checkMessage ? ' - ' + f.checkMessage : '')).join('; ')
          + (file ? '\n\nSelected file ' + file.path + ' diff:\n' + (file.diff || '').slice(0, 9000) : '');
      }, ['Add unit tests for validation', 'Update error message in UI', 'Check impact on other screens', 'Explain this code']);

      // What the assistant answers from: the same parts the context above sends to the model
      this.aiContext = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const file = this.file();
        const chips = [{ label: this.changeCode(), title: 'Change "' + d.title + '" and its status' },
          { label: d.plan ? 'Plan, ' + d.plan.items.length + ' files' : 'No plan yet', title: d.plan ? 'The plan summary, its risks and its files' : 'The plan is not ready, so the model is told there is none' },
          { label: 'Quick checks', title: 'The quick check result of each file' }];
        if (file) {
          chips.push({ label: file.path.split('/').pop() + ' (diff)', title: 'The diff of the open file ' + file.path + ((file.diff || '').length > 9000 ? ', its first 9,000 characters' : '') });
        }
        return chips;
      });

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Changes page loaded.');
        document.title = 'Changes';
        const loadWorkspace = () => {
          this.workspaceInfo(null);
          if (this.workspaceId()) {
            api.get('workspaces/' + this.workspaceId()).then((w) => this.workspaceInfo(w)).catch(() => null);
          }
        };
        subscription = this.workspaceId.subscribe(() => {
          clearTimeout(pollTimer);
          this.detail(null);
          this.file(null);
          this.infoOpen(false);
          this.clearFilters();
          this.listLoading(true);
          loadWorkspace();
          loadList();
        });
        loadWorkspace();
        // A change asked for from another page (Home, Requirements, the command palette) opens; else the list shows
        const wanted = pageRequests.change();
        pageRequests.change(null);
        workspaceSelection.load().then(() => {
          if (wanted) {
            this.open(wanted);
          }
          return loadList();
        }).catch(showError);
      };
      this.disconnected = () => {
        clearTimeout(pollTimer);
        clearTimeout(listTimer);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return ChangesViewModel;
  }
);
