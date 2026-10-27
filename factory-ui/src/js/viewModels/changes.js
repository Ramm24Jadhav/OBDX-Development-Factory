/*
 * Changes page: impact analysis, plan review and approval, generated code review (diff, edit, write again) and
 * delivery as a patch or an SVN branch.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session',
        'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojselectsingle', 'ojs/ojinputtext', 'ojs/ojbutton', 'ojs/ojtoolbar'],
  function (ko, accUtils, api, workspaceSelection, session, ArrayDataProvider) {
    const POLL_MS = 2000;
    const STATUS_LABELS = {
      ANALYZING: 'analyzing', PLAN_READY: 'plan to review', GENERATING: 'writing code', GENERATED: 'code to review',
      DELIVERED: 'delivered', FAILED: 'failed', CLOSED: 'closed'
    };

    function ChangesViewModel() {
      this.workspaceProvider = new ArrayDataProvider(workspaceSelection.options, { keyAttributes: 'value' });
      this.workspaceId = workspaceSelection.selectedId;
      this.canManage = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.errorMessage = ko.observable('');
      this.busy = ko.observable(false);

      const requirementOptions = ko.observableArray([]);
      this.requirementProvider = new ArrayDataProvider(requirementOptions, { keyAttributes: 'value' });
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
        basedOn: (item.basedOn || []).join(', ')
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
        result: b.result, errors: b.errors.slice(0, 3).join(' | ') + (b.errors.length > 3 ? ' (+' + (b.errors.length - 3) + ' more)' : ''),
        log: b.logExcerpt || '', fixed: b.fixedFiles.join(', ')
      })));
      this.hasCode = ko.pureComputed(() => !!this.detail() && this.detail().files.some((f) => f.status !== 'PENDING'));
      this.fileRows = ko.pureComputed(() => (this.detail() ? this.detail().files : []).map((f) => ({
        path: f.path,
        statusText: f.status.toLowerCase() + (f.edited ? ' (edited)' : '') + (f.attempts > 1 ? ', ' + f.attempts + ' attempts' : ''),
        check: (f.checkStatus || 'NOT_CHECKED').toLowerCase().replace('_', ' '),
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
              title: c.title, status: c.status, statusLabel: STATUS_LABELS[c.status], selected: c.id === current,
              openAction: () => this.open(c.id)
            })));
            requirementOptions(requirementList.filter((r) => r.status === 'APPROVED').map((r) => ({ value: r.id, label: r.title })));
          }).catch(showError);
      };

      const show = (detail) => {
        const previous = this.detail();
        this.detail(detail);
        this.errorMessage('');
        if (!previous || previous.id !== detail.id) {
          this.file(null);
          this.editingPlan(false);
        } else if (this.file()) {
          this.openFile(this.file().path, true);
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
        .then((detail) => { this.requirementId(null); show(detail); })
        .catch(showError);
      this.analyzeAgain = () => api.post(base() + '/analyze').then(show).catch(showError);
      this.approvePlan = () => {
        if (!window.confirm('Approve this plan? The model will write ' + this.detail().plan.items.length + ' file(s).')) {
          return;
        }
        api.post(base() + '/approve-plan').then(show).catch(showError);
      };
      this.togglePlanJson = () => {
        this.editingPlan(!this.editingPlan());
        this.planJson(this.editingPlan() ? JSON.stringify(this.detail().plan, null, 2) : '');
      };
      this.savePlan = () => api.put(base() + '/plan', this.planJson())
        .then((detail) => { this.editingPlan(false); show(detail); })
        .catch(showError);
      this.deliver = () => {
        if (!window.confirm('Commit the reviewed code to a new SVN branch? Trunk is not changed.')) {
          return;
        }
        this.busy(true);
        api.post(base() + '/deliver').then(show).catch(showError).finally(() => this.busy(false));
      };
      this.build = () => api.post(base() + '/build').then(show).catch(showError);
      this.checkAgain = () => api.post(base() + '/check').then(show).catch(showError);
      const close = (reason, force) => api.post(base() + '/close', { reason: reason, force: force })
        .then((detail) => { show(detail); loadList(); });
      const liveBranch = () => this.detail().branchUrl && !this.detail().branchDeletedRevision;
      this.closeMerged = () => {
        if (!window.confirm(liveBranch()
          ? 'Close this change as merged? The factory checks in SVN that the branch is merged into trunk, then removes the branch (it stays in the SVN history).'
          : 'Close this change as merged or applied?')) {
          return;
        }
        this.busy(true);
        close('MERGED', false)
          .catch((error) => {
            if (error.status === 409 && error.message.indexOf('Merge the branch first') >= 0
                && window.confirm(error.message + '\n\nClose anyway and remove the branch?')) {
              return close('MERGED', true);
            }
            throw error;
          })
          .catch(showError).finally(() => this.busy(false));
      };
      this.abandon = () => {
        if (!window.confirm('Abandon this change?' + (liveBranch() ? ' Its branch is removed from SVN (it stays in the SVN history).' : ''))) {
          return;
        }
        this.busy(true);
        close('ABANDONED', false).catch(showError).finally(() => this.busy(false));
      };
      this.canClose = ko.pureComputed(() => {
        const d = this.detail();
        return !!d && this.canManage() && d.buildStatus !== 'BUILDING'
          && ['PLAN_READY', 'GENERATED', 'DELIVERED', 'FAILED'].indexOf(d.status) >= 0;
      });

      this.remove = () => {
        if (!window.confirm('Delete this change with its plan and generated code?')) {
          return;
        }
        api.del(base()).then(() => { this.detail(null); this.file(null); loadList(); }).catch(showError);
      };

      this.openFile = (path, keepMode) => api.get(base() + '/file?path=' + encodeURIComponent(path))
        .then((file) => {
          this.file(file);
          if (!keepMode) {
            this.fileMode('diff');
          }
        }).catch(showError);
      this.showDiff = () => this.fileMode('diff');
      this.showFull = () => this.fileMode('full');
      this.startEdit = () => {
        this.editContent(this.file().generated || '');
        this.fileMode('edit');
      };
      this.saveEdit = () => api.put(base() + '/file', { path: this.file().path, content: this.editContent() })
        .then((detail) => { this.fileMode('diff'); show(detail); })
        .catch(showError);
      this.regenerate = () => api.post(base() + '/regenerate', { path: this.file().path, note: this.regenerateNote() || null })
        .then((detail) => { this.regenerateNote(''); show(detail); })
        .catch(showError);

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Changes page loaded.');
        document.title = 'Changes';
        subscription = this.workspaceId.subscribe(() => { this.detail(null); this.file(null); loadList(); });
        workspaceSelection.load().then(loadList).catch(showError);
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
