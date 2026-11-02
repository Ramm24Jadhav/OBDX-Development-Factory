/*
 * Changes page, the implementation workbench, built around reviewing generated code and recovering from a generation
 * that stopped. At the top: the change, its workspace and OBDX version, its status, how many files are created,
 * modified, cut off, failed or not written, the validation state and the next action. Below, three resizable panels:
 * the files as a tree (marked by their state), the selected file's diff or code with line numbers and highlighting, and
 * a side panel with the file's details (requirement, reason, generation, checks), validation, the plan, the assistant
 * and the history. The actions are those of before: plan, approve, continue generation, write again, edit, check,
 * build, deliver as a patch or an SVN branch (asked first; an incomplete one with a warning), close and delete.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session',
        '../services/ui', '../services/assistant', '../services/dialog', '../services/toast', '../services/pageRequests', '../services/busy',
        '../services/syntax', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, assistant, dialog, toast, pageRequests, busyService, highlight) {
    const POLL_MS = 2000;
    // A status badge (design system fx-badge, with a dot) from the older tone names
    const TONES = { blue: 'primary', amber: 'warning', green: 'success', red: 'danger', violet: 'violet', grey: '' };
    const pill = (text, tone) => ({ text: text, css: 'fx-badge' + (TONES[tone] ? ' fx-badge--' + TONES[tone] : '') });
    const ask = (title, message, confirmLabel, danger) => dialog.confirm({ title: title, message: message, confirmLabel: confirmLabel, danger: !!danger });
    const STATUS_LABELS = {
      ANALYZING: 'analyzing', PLAN_READY: 'plan to review', GENERATING: 'writing code', GENERATED: 'code to review',
      DELIVERED: 'delivered', FAILED: 'failed', CLOSED: 'closed'
    };
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

      this.statusLabel = ko.pureComputed(() => (this.detail() ? STATUS_LABELS[this.detail().status] : ''));
      this.facts = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return '';
        }
        return ['Requested by ' + (d.createdBy || '?'),
          d.baseRevision ? 'code at r' + d.baseRevision : null,
          d.planApprovedBy ? 'plan approved by ' + d.planApprovedBy : null].filter(Boolean).join(' · ');
      });
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
      this.diffLines = ko.pureComputed(() => {
        const file = this.file();
        if (!file || !file.diff) {
          return [{ text: file && file.generated === null ? '(not written)' : '(no changes)', css: 'factory-diff-meta' }];
        }
        return file.diff.replace(/\n$/, '').split('\n').map((line) => ({
          text: line + '\n',
          css: line.startsWith('+++') || line.startsWith('---') || line.startsWith('Index:') || line.startsWith('====')
            ? 'factory-diff-meta' : line.startsWith('@@') ? 'factory-diff-hunk'
              : line.startsWith('+') ? 'factory-diff-add' : line.startsWith('-') ? 'factory-diff-del' : ''
        }));
      });

      const showError = (error) => this.errorMessage(error.message);
      // After an action: the error stays on the page and a toast says it failed
      const failed = (error) => { showError(error); toast.error(error.message); };
      const done = (message) => (detail) => { show(detail); toast.success(message); };
      let pollTimer = null;

      const loadList = () => {
        const id = this.workspaceId();
        if (!id) {
          this.changes([]);
          requirementOptions([]);
          return Promise.resolve();
        }
        return Promise.all([api.get('workspaces/' + id + '/changes'), api.get('workspaces/' + id + '/requirements'),
          api.get('workspaces/' + id + '/jenkins')])
          .then(([changeList, requirementList, jenkins]) => {
            this.jenkins(jenkins);
            const current = this.detail() ? this.detail().id : null;
            this.changes(changeList.map((c) => ({
              id: c.id, title: c.title, status: c.status, statusLabel: STATUS_LABELS[c.status], selected: c.id === current,
              label: 'CHG-' + c.id.replace(/-/g, '').slice(0, 3).toUpperCase() + ' · ' + c.title,
              openAction: () => this.open(c.id)
            })));
            if (!current && changeList.length) {
              this.open(changeList[0].id);
            }
            requirementOptions(requirementList.filter((r) => r.status === 'APPROVED').map((r) => ({ value: r.id, label: r.title })));
          }).catch(showError);
      };

      const show = (detail) => {
        const previous = this.detail();
        this.detail(detail);
        this.errorMessage('');
        if (!previous || previous.id !== detail.id) {
          this.file(null);
          this.openTabs([]);
          this.collapsed({});
          this.editingPlan(false);
          const first = firstFile(detail);
          if (first) {
            this.openFile(first.path);
          }
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
        loadList();
      };

      this.open = (id) => api.get('changes/' + id).then(show).catch(showError);
      const base = () => 'changes/' + this.detail().id;

      this.create = () => api.post('requirements/' + this.requirementId() + '/changes')
        .then((detail) => { this.requirementId(null); show(detail); toast.success('Change created. The impact analysis is running.'); })
        .catch(failed);
      this.analyzeAgain = () => api.post(base() + '/analyze').then(done('Impact analysis started again.')).catch(failed);
      // A plan the analysis says may be missing files is refused with what looks missing; only confirming that approves it
      const INCOMPLETE_PLAN = 'Incomplete plan: ';
      const approveIncomplete = (error) => (error.status === 409 && String(error.message).indexOf(INCOMPLETE_PLAN) === 0
        ? ask('Approve an incomplete plan?', error.message.substring(INCOMPLETE_PLAN.length).replace(/^./, (c) => c.toUpperCase()),
          'Approve Incomplete Plan', true).then((ok) => (ok ? api.post(base() + '/approve-plan?incomplete=true')
          .then(done('Plan approved although files may be missing. The model is writing the code.')).catch(failed) : null))
        : failed(error));
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
        busyService.block(api.post(base() + '/deliver' + (this.unwritten().length ? '?incomplete=true' : '')), 'Committing the change to a new SVN branch…')
          .then(done('Committed to a new SVN branch for review.')).catch(failed).finally(() => this.busy(false));
      });
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

      this.remove = () => ask('Delete this change?', 'The change, its plan and its generated code are deleted. This cannot be undone.', 'Delete', true).then((ok) => {
        if (!ok) {
          return;
        }
        api.del(base()).then(() => { this.detail(null); this.file(null); loadList(); toast.success('Change deleted.'); }).catch(failed);
      });

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

      // ---- The workbench layout ----
      const STATUS_PILLS = {
        ANALYZING: pill('Analyzing', 'blue'), PLAN_READY: pill('Plan to review', 'amber'), GENERATING: pill('Writing code', 'blue'),
        GENERATED: pill('In Development', 'green'), DELIVERED: pill('Delivered', 'green'), FAILED: pill('Failed', 'red'), CLOSED: pill('Closed', 'grey')
      };
      const code = (id) => 'CHG-' + id.replace(/-/g, '').slice(0, 3).toUpperCase();
      this.changeCode = ko.pureComputed(() => (this.detail() ? code(this.detail().id) : ''));
      // A written change with planned files missing says so: it is only partly written, and is not delivered
      this.statusPill = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return ui.status('', '–');
        }
        if (d.status === 'GENERATED' && this.unwritten().length) {
          return ui.status('WARNING', 'Partly written');
        }
        return ui.status(d.status, STATUS_PILLS[d.status].text);
      });

      // ---- The summary at the top: counts, validation and the next action ----
      this.workspaceInfo = ko.observable(null);
      this.counts = ko.pureComputed(() => {
        const files = this.detail() ? this.detail().files : [];
        return STATE_ORDER.map((key) => {
          const n = files.filter((f) => stateOf(f) === key).length;
          return { key: key, label: STATES[key].label, n: n, title: STATES[key].tip,
            css: 'factory-ch-count factory-ch-count-' + key + (n ? '' : ' factory-ch-count-zero'), pick: () => this.treeFilter(key) };
        });
      });
      this.headerMeta = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return '';
        }
        const w = this.workspaceInfo();
        return [w ? w.name + ' · OBDX ' + w.obdxVersion : workspaceName(), 'REQ-' + d.requirementId.replace(/-/g, '').slice(0, 4).toUpperCase(),
          d.baseRevision ? 'code at r' + d.baseRevision : null, 'requested by ' + (d.createdBy || '?'),
          d.branchUrl ? 'branch ' + d.branchUrl.split('/').slice(-2).join('/') : null].filter(Boolean).join(' · ');
      });
      // Partial generation: what is written, what the limit cut off, what is not written, and that delivery leaves them out
      this.partial = ko.pureComputed(() => {
        const d = this.detail();
        if (!d || d.status !== 'GENERATED' || !this.unwritten().length) {
          return null;
        }
        const n = (key) => d.files.filter((f) => stateOf(f) === key).length;
        const written = d.files.length - this.unwritten().length;
        return 'Partial generation: ' + written + ' of ' + d.files.length + ' planned files are written'
          + (n('partial') ? '; ' + n('partial') + ' cut off by the model\'s limit (the part written is kept)' : '')
          + (n('failed') ? '; ' + n('failed') + ' failed' : '') + (n('pending') ? '; ' + n('pending') + ' not written yet' : '')
          + '. The files written are kept. Continue generation goes on from where it stopped; delivering now leaves the others out.';
      });
      /** What to do next, from the change's state; action names a function of this page and is shown only when allowed. */
      this.nextAction = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return null;
        }
        const s = d.status;
        const failedChecks = d.files.filter((f) => f.checkStatus === 'FAILED' && f.status === 'GENERATED').length;
        if (s === 'ANALYZING') {
          return { text: 'Wait for the impact analysis; the plan shows here when it is ready.' };
        }
        if (s === 'PLAN_READY') {
          return { text: 'Review the plan and approve it; no code is written before.', label: 'Approve Plan', id: 'nextApprovePlan', run: this.approvePlan,
            allowed: this.canApprove(), why: 'Someone with the right to approve does this.' };
        }
        if (s === 'GENERATING') {
          return { text: 'The model is writing the code. The files already written stay if it stops.' };
        }
        if (s === 'FAILED') {
          return { text: (d.message || 'The last step failed.') + ' Analyze again to make a new plan.', label: 'Analyze Again', id: 'nextAnalyze',
            run: this.analyzeAgain, allowed: this.canManage(), why: 'You need the right to manage code.' };
        }
        if (s === 'GENERATED' && this.unwritten().length) {
          return { text: 'Finish the code: Continue generation writes the files not written yet, going on from any part kept.',
            label: 'Continue generation', id: 'nextContinue', run: this.continueGeneration, allowed: this.canManage(), why: 'You need the right to manage code.' };
        }
        if (s === 'GENERATED' && failedChecks) {
          return { text: failedChecks + ' file(s) failed their quick checks: open them, then Write again or Edit, and Validate.' };
        }
        if (s === 'GENERATED') {
          return { text: 'Review the code, then submit it to a new SVN branch for review (you are asked first).', label: 'Submit for Review',
            id: 'nextDeliver', run: this.deliver, allowed: this.canManage() && !this.busy(), why: 'You need the right to manage code.' };
        }
        if (s === 'DELIVERED') {
          return { text: 'Delivered to ' + (d.branchUrl || 'SVN') + '. Merge the branch in SVN, then Close as Merged (you are asked first).' };
        }
        return { text: d.closedReason === 'MERGED' ? 'Closed as merged.' : 'Closed.' };
      });

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
      // The header menus: switch to another change, start one from an approved requirement, more actions
      this.changeMenu = ko.pureComputed(() => (this.changes().length
        ? this.changes().map((c) => ({ value: c.id, label: c.label, icon: c.selected ? 'check' : '' }))
        : [{ value: '', label: 'No changes yet', disabled: true }]));
      this.pickChange = (event) => { if (event.detail.value) { this.open(event.detail.value); } };
      this.choosingRequirement = ko.observable(false);
      this.cancelChoose = () => this.choosingRequirement(false);
      this.requirementChoices = ko.pureComputed(() => requirementOptions().map((r) => Object.assign({}, r, {
        start: () => { this.choosingRequirement(false); this.requirementId(r.value); this.create(); }
      })));
      this.requirementMenu = ko.pureComputed(() => (requirementOptions().length
        ? requirementOptions().map((r) => ({ value: r.value, label: r.label }))
        : [{ value: '', label: 'No approved requirements yet', disabled: true }]));
      this.startFrom = (event) => { if (event.detail.value) { this.requirementId(event.detail.value); this.create(); } };
      this.saveDraftTitle = ko.pureComputed(() => (this.fileMode() === 'edit' ? 'Save your edit of the open file'
        : 'Nothing to save: generated code is saved as it is written. Use Edit on a file to change it, then Save Draft.'));
      this.requirementTitle = ko.observable('');

      // The side panel: the selected file, validation, the plan, the assistant and the history, one row of tabs
      this.tab = ko.observable('file');
      this.tabs = ui.tabs(this.tab, [
        { value: 'file', label: 'File' },
        { value: 'validation', label: 'Validation' },
        { value: 'plan', label: 'Plan' },
        { value: 'assistant', label: 'Assistant' },
        { value: 'history', label: 'History' }
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
          && (filter === 'all' || (filter === 'warn' ? (f.checkStatus === 'WARNING' || f.checkStatus === 'FAILED') : stateOf(f) === filter)));
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
        .concat([{ value: 'warn', label: 'With check warnings or failures' }]);
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
      this.treeFilterItems = ko.pureComputed(() => TREE_FILTERS.map((f) => ({ value: f.value, label: f.label, icon: this.treeFilter() === f.value ? 'check' : '' }))
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
      this.proposed = ko.pureComputed(() => (this.detail() ? this.detail().files : []).filter((f) => f.status === 'GENERATED').map((f) => ({
        name: f.path.split('/').pop(), path: f.path, added: '+' + f.linesAdded, removed: f.linesRemoved ? '-' + f.linesRemoved : '0',
        badge: f.action === 'create' ? 'A' : 'M', badgeCss: 'factory-ch-badge factory-ch-badge-' + (f.action === 'create' ? 'a' : 'm'),
        open: () => this.openFile(f.path)
      })));
      this.viewDiff = () => {
        const target = this.file() || (this.proposed()[0] ? { path: this.proposed()[0].path } : null);
        if (target) {
          this.fileMode('diff');
          if (!this.file() || this.file().path !== target.path) {
            this.openFile(target.path);
          }
        }
      };
      // Review notes: the quick checks' warnings and failures
      this.reviewNotes = ko.pureComputed(() => (this.detail() ? this.detail().files : [])
        .filter((f) => f.checkStatus === 'WARNING' || f.checkStatus === 'FAILED').map((f) => ({
          path: f.path, name: f.path.split('/').pop(), message: f.checkMessage || 'No message', level: f.checkStatus === 'FAILED' ? 'Failed' : 'Warning',
          dot: 'factory-step-dot ' + (f.checkStatus === 'FAILED' ? 'factory-dot-red' : 'factory-dot-amber'),
          openAction: () => this.openFile(f.path)
        })));
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
          return 'Build Successful';
        }
        if (d.buildStatus === 'FAILED') {
          return 'Build Failed';
        }
        const s = this.checkSummary();
        return s.failed ? 'Quick checks failed' : (s.passed ? 'Quick checks passed' : 'Not validated yet');
      });
      this.validationOk = ko.pureComputed(() => this.validationTitle() === 'Build Successful' || this.validationTitle() === 'Quick checks passed');
      this.validationNote = ko.pureComputed(() => {
        const b = this.lastBuild();
        return b ? (b.job + (b.buildNumber ? ' #' + b.buildNumber : '') + ' · ' + (b.result || '') + ' · ' + ui.when(b.finishedAt || b.startedAt)) : 'Run quick checks, or build with Jenkins once it is set up.';
      });
      this.validationStages = ko.pureComputed(() => {
        const s = this.checkSummary();
        const b = this.lastBuild();
        const stage = (name, state, detail) => ({
          name: name, detail: detail, css: 'factory-step-dot factory-dot-' + ({ ok: 'green', bad: 'red', warn: 'amber', run: 'blue' }[state] || 'grey'),
          icon: 'factory-nav-icon factory-ico-' + (state === 'ok' ? 'check' : state === 'bad' ? 'x' : state === 'warn' ? 'alert' : 'clock')
        });
        return [
          stage('OBDX Quick Checks', s.failed ? 'bad' : s.warning ? 'warn' : s.passed ? 'ok' : 'none', s.passed + ' passed, ' + s.failed + ' failed, ' + s.warning + ' warnings'),
          stage('Jenkins Build', !b ? 'none' : b.result === 'SUCCESS' ? 'ok' : (b.result === 'RUNNING' || b.result === 'QUEUED') ? 'run' : 'bad',
            b ? (b.result || '') + (b.finishedAt ? ' · ' + Math.max(1, Math.round((new Date(b.finishedAt) - new Date(b.startedAt)) / 1000)) + 's' : '') : 'Not run'),
          stage('Fix Rounds', !b ? 'none' : 'ok', (this.detail() ? this.detail().builds.length : 0) + ' rounds')
        ];
      });
      this.bottom = ko.observable('build');
      this.bottomTabs = ui.tabs(this.bottom, [
        { value: 'build', label: 'Build & Test' }, { value: 'static', label: 'Static Analysis' }, { value: 'checks', label: 'Quick Checks' },
        { value: 'tests', label: 'Test Results' }, { value: 'builds', label: 'Build History' }
      ]);
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
      // The build pipeline as five stages; Jenkins reports one result and one duration for the whole build
      this.pipeline = ko.pureComputed(() => {
        const s = this.checkSummary();
        const b = this.lastBuild();
        const running = b && (b.result === 'RUNNING' || b.result === 'QUEUED' || this.detail().buildStatus === 'BUILDING');
        const ok = b && b.result === 'SUCCESS';
        const total = duration(seconds(b));
        const jenkinsState = !b ? 'none' : running ? 'run' : ok ? 'ok' : 'bad';
        const stage = (name, state, time, title) => ({
          name: name, time: time, title: title,
          css: 'factory-ch-pipe factory-ch-pipe-' + state,
          icon: 'factory-nav-icon factory-ico-' + (state === 'ok' ? 'check' : state === 'bad' ? 'x' : state === 'warn' ? 'alert' : 'clock')
        });
        const notRun = 'No Jenkins build of this change yet.';
        return [
          stage('Compile', !b ? 'none' : running ? 'run' : this.buildErrors().length ? 'bad' : ok ? 'ok' : 'bad', b ? (total || 'Running') : 'Not run',
            b ? 'The whole Jenkins build took ' + (total || 'not finished yet') + '; Jenkins does not time each stage.' : notRun),
          stage('Unit Tests', !b ? 'none' : running ? 'run' : this.testErrors().length ? 'bad' : ok ? 'ok' : 'none', b ? 'In the build' : 'Not run',
            b ? 'Part of the Jenkins build; it has no separate duration.' : notRun),
          stage('Integration Tests', !b ? 'none' : jenkinsState === 'ok' ? 'ok' : 'none', b ? 'In the build' : 'Not run',
            b ? 'Part of the Jenkins build, if its job runs them.' : notRun),
          stage('Static Analysis', 'none', b ? 'Not reported' : 'Not run', 'The Jenkins builds of this workspace do not publish static analysis separately.'),
          stage('OBDX Checks', s.failed ? 'bad' : s.warning ? 'warn' : s.passed ? 'ok' : 'none', s.passed + ' passed · ' + s.warning + ' warn',
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
        if (d.deliveredRevision) {
          items.push({ text: 'Delivered to ' + (d.branchUrl || 'SVN') + ' at r' + d.deliveredRevision, at: d.updatedAt });
        }
        if (d.closedAt) {
          items.push({ text: 'Closed as ' + (d.closedReason || '').toLowerCase() + ' by ' + d.closedBy, at: d.closedAt });
        }
        return items.sort((a, b) => new Date(a.at) - new Date(b.at)).map((i) => Object.assign(i, { when: ui.when(i.at) }));
      });
      this.patchUrl = ko.pureComputed(() => (this.detail() ? 'api/changes/' + this.detail().id + '/patch' : '#'));
      this.openImpact = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'impact' }));
      this.openBuild = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'build' }));
      this.moreItems = ko.pureComputed(() => [
        { value: 'analyze', label: 'Analyze again', icon: 'refresh', disabled: !this.canManage() },
        { value: 'newchange', label: 'New change from a requirement…', icon: 'plus', disabled: !this.canManage() || this.requirementChoices().length === 0 },
        { value: 'patch', label: 'Download patch', icon: 'doc' },
        { value: 'impact', label: 'Open Impact Analysis', icon: 'branch' },
        { value: 'build', label: 'Open Build, Test & Review', icon: 'flask' },
        { separator: true },
        { value: 'close', label: 'Close as merged', icon: 'check', disabled: !this.canClose() },
        { value: 'abandon', label: 'Abandon', icon: 'x', disabled: !this.canClose() },
        { value: 'remove', label: 'Delete', icon: 'trash', danger: true, disabled: !this.canManage() }
      ]);
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
        if (action === 'newchange') {
          this.choosingRequirement(true);
          return;
        }
        ({ analyze: this.analyzeAgain, close: this.closeMerged, abandon: this.abandon, remove: this.remove, impact: this.openImpact, build: this.openBuild })[action]();
      };
      this.aiTab = ko.observable('chat');
      this.aiTabs = ui.tabs(this.aiTab, [
        { value: 'chat', label: 'Chat' },
        { value: 'suggested', label: 'Suggested Changes', count: ko.pureComputed(() => this.planRows().length) },
        { value: 'analysis', label: 'Code Analysis' }
      ]);
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
        subscription = this.workspaceId.subscribe(() => { this.detail(null); this.file(null); loadWorkspace(); loadList(); });
        loadWorkspace();
        // A change asked for from another page (the command palette)
        workspaceSelection.load().then(loadList).then(() => {
          const wanted = pageRequests.change();
          if (wanted) { pageRequests.change(null); this.open(wanted); }
        }).catch(showError);
      };
      this.disconnected = () => {
        clearTimeout(pollTimer);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return ChangesViewModel;
  }
);
