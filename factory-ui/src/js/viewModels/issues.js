/*
 * Issues page (Issue Analyzer): file an error a bank reported with its description, logs and screenshots; the factory
 * finds the evidence and the bank's matching code, the model diagnoses it, and the page shows the cause, the evidence
 * and fix steps. Then record what fixed it, draft an Oracle SR, or (leads) share the fix as product knowledge.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/dialog', '../services/toast', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, dialog, toast) {
    const POLL_MS = 2000;
    const ACCEPTED = '.log,.txt,.out,.png,.jpg,.jpeg';
    const CATEGORIES = ['CONFIGURATION', 'DEPENDENCY', 'INFRASTRUCTURE', 'SECURITY', 'DATA', 'INTEGRATION', 'PRODUCT_DEFECT',
      'CUSTOMIZATION', 'UNKNOWN'];
    const label = (value) => value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ') : '';
    const where = (item) => item.source + (item.line ? ':' + item.line : '');
    // Issue statuses in the shared status categories (ui.status), with this page's words
    const CATEGORY_OF = { DIAGNOSED: 'READY', RESOLVED: 'APPROVED', NOT_RESOLVED: 'WARNING', ESCALATED: 'IN_REVIEW' };
    const WORDS = { NEW: 'New', ANALYZING: 'Analyzing', DIAGNOSED: 'Diagnosed', FAILED: 'Failed', RESOLVED: 'Resolved',
      NOT_RESOLVED: 'Not resolved', ESCALATED: 'Escalated' };
    const issueStatus = (s) => ui.status(CATEGORY_OF[s] || s, WORDS[s]);
    const TONE = { PROBABLE: 'success', POSSIBLE: 'warning', INCONCLUSIVE: '', LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' };
    const badge = (text, key) => ({ text: text, css: 'fx-badge' + (TONE[key] ? ' fx-badge--' + TONE[key] : '') });

    function IssuesViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
      this.canFile = ko.pureComputed(() => session.can(this.workspaceId(), 'VIEW'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.accepted = ACCEPTED;
      const showError = (error) => this.errorMessage(ui.errorText(error));

      // New issue
      this.environmentOptions = [{ value: '', label: 'Not given' }].concat(['DEV', 'SIT', 'UAT', 'PROD'].map((e) => ({ value: e, label: e })));
      this.newTitle = ko.observable('');
      this.newEnvironment = ko.observable('');
      this.newDescription = ko.observable('');
      this.newLog = ko.observable('');
      this.chosenFiles = ko.observableArray([]);
      this.chosenRows = ko.pureComputed(() => this.chosenFiles().map((file) => ({
        name: file.name,
        remove: () => this.chosenFiles.remove(file)
      })));
      this.canSubmit = ko.pureComputed(() => !!(this.newDescription().trim() || this.newLog().trim() || this.chosenFiles().length > 0));
      const addFiles = (files) => this.chosenFiles(this.chosenFiles().concat(Array.from(files || [])));
      this.filesSelected = (event) => { addFiles(event.target.files); event.target.value = ''; };
      this.dropOver = ko.observable(false);
      this.dragOver = (event) => { event.preventDefault(); this.dropOver(true); return false; };
      this.dragLeave = () => { this.dropOver(false); };
      this.dropFiles = (event) => { event.preventDefault(); this.dropOver(false); addFiles(event.dataTransfer.files); return false; };
      this.dropCss = ko.pureComputed(() => 'fx-dropzone factory-is-drop' + (this.dropOver() ? ' is-over' : ''));

      // List
      this.rows = ko.observableArray([]);
      this.listLoading = ko.observable(true);

      // Detail
      this.detail = ko.observable(null);
      const base = () => 'workspaces/' + this.workspaceId() + '/issues/' + this.detail().id;
      this.status = ko.pureComputed(() => this.detail() ? issueStatus(this.detail().status) : null);
      this.analyzing = ko.pureComputed(() => !!this.detail() && this.detail().status === 'ANALYZING');
      this.messageCss = ko.pureComputed(() => 'fx-alert factory-is-alert ' + (this.detail() && this.detail().status === 'FAILED'
        ? 'fx-alert--danger' : 'fx-alert--warning'));
      this.screenshots = ko.observableArray([]);
      this.logFiles = ko.observableArray([]);
      this.evidenceItems = ko.observableArray([]);
      this.codeItems = ko.observableArray([]);
      this.view = ko.observable(null);
      this.resolution = ko.observable('');
      this.descriptionText = ko.pureComputed(() => (this.detail() && this.detail().description) || '(no description)');

      /** The diagnosis with display text prepared, since templates cannot run JavaScript functions. */
      const viewOf = (detail) => {
        const d = detail.diagnosis;
        if (!d) {
          return null;
        }
        const byId = {};
        (detail.evidence ? detail.evidence.items : []).forEach((item) => { byId[item.id] = item; });
        const cite = (ids) => (ids || []).filter((id) => byId[id]).map((id) => id + ' ' + where(byId[id])).join(', ');
        return {
          category: badge(label(d.category), 'category'),
          state: badge(label(d.state), d.state),
          summary: d.summary || '',
          rootCause: d.rootCause,
          evidence: d.evidence.filter((id) => byId[id]).map((id) => ({ id: id, where: where(byId[id]), text: byId[id].text })),
          steps: d.steps.map((s, i) => ({
            title: (i + 1) + '. ' + s.action,
            why: s.why || '',
            file: s.file || '',
            risk: badge('Risk: ' + label(s.risk), s.risk),
            evidence: cite(s.evidence)
          })),
          alternatives: d.alternatives.map((a) => a.cause + (a.why ? ': ' + a.why : '')),
          missing: d.missingInformation,
          conflicts: d.conflicts || '',
          similar: d.similar.map((s) => ({
            title: s.title,
            where: s.shared ? 'Shared knowledge' : 'This workspace',
            text: label(s.category) + '. Cause: ' + s.rootCause + (s.resolution ? ' Fixed by: ' + s.resolution : '')
          })),
          model: d.model ? 'Diagnosed by ' + d.model : ''
        };
      };

      let pollTimer = null;
      const loadList = () => {
        const id = this.workspaceId();
        if (!id) {
          this.rows([]);
          this.listLoading(false);
          return Promise.resolve();
        }
        return api.get('workspaces/' + id + '/issues').then((list) => {
          this.rows(list.map((i) => ({
            id: i.id,
            title: i.title,
            status: issueStatus(i.status),
            category: label(i.category),
            environment: i.environment || '',
            createdBy: i.createdBy || '',
            updated: new Date(i.updatedAt).toLocaleString(),
            current: ko.pureComputed(() => (this.detail() && this.detail().id === i.id ? 'true' : 'false')),
            open: () => this.open(i.id)
          })));
        }).catch(showError).finally(() => this.listLoading(false));
      };

      const show = (detail) => {
        this.errorMessage('');
        const filesBase = 'api/workspaces/' + detail.workspaceId + '/issues/' + detail.id + '/files/';
        this.screenshots(detail.files.filter((f) => f.kind === 'SCREENSHOT').map((f) => {
          const text = ko.observable(f.extractedText || '');
          return {
            name: f.name,
            src: filesBase + f.position,
            alt: 'Screenshot ' + f.name,
            label: 'Text on ' + f.name,
            text: text,
            hasText: f.extractedText !== null,
            save: () => api.put('workspaces/' + detail.workspaceId + '/issues/' + detail.id + '/files/' + f.position + '/text',
              { text: text() }).then((d) => { show(d); toast.success('Saved. Analyze again to use it.'); }).catch(showError)
          };
        }));
        this.logFiles(detail.files.filter((f) => f.kind === 'LOG').map((f) => ({ name: f.name, href: filesBase + f.position })));
        const evidence = detail.evidence ? detail.evidence.items : [];
        this.evidenceItems(evidence.filter((i) => i.kind !== 'CODE').map((i) => ({
          id: i.id, kind: label(i.kind), where: where(i), text: i.text
        })));
        this.codeItems(evidence.filter((i) => i.kind === 'CODE').map((i) => ({ id: i.id, where: where(i), text: i.text })));
        this.view(viewOf(detail));
        if (!this.detail() || this.detail().id !== detail.id) {
          this.resolution(detail.resolution || '');
          this.sharing(false);
        }
        const finished = this.detail() && this.detail().id === detail.id && this.detail().status === 'ANALYZING' && detail.status !== 'ANALYZING';
        this.detail(detail);
        if (finished) {
          if (detail.status === 'FAILED') {
            toast.error('The analysis failed. ' + (detail.message || ''));
          } else {
            toast.success('The diagnosis is ready.');
          }
        }
        clearTimeout(pollTimer);
        if (detail.status === 'ANALYZING') {
          pollTimer = setTimeout(() => this.open(detail.id), POLL_MS);
        }
        loadList();
      };

      this.open = (id) => api.get('workspaces/' + this.workspaceId() + '/issues/' + id).then(show).catch(showError);

      this.submit = () => {
        const form = new FormData();
        [['title', this.newTitle()], ['description', this.newDescription()], ['logText', this.newLog()],
          ['environment', this.newEnvironment()]].forEach((pair) => { if (pair[1]) { form.append(pair[0], pair[1]); } });
        this.chosenFiles().forEach((file) => form.append('files', file));
        api.upload('workspaces/' + this.workspaceId() + '/issues', form)
          .then((detail) => {
            this.newTitle(''); this.newDescription(''); this.newLog(''); this.newEnvironment(''); this.chosenFiles([]);
            show(detail);
          })
          .catch(showError);
      };

      this.analyze = () => api.post(base() + '/analyze').then(show).catch(showError);
      const outcome = (status, words) => api.post(base() + '/outcome', { status: status, resolution: this.resolution() })
        .then((d) => { show(d); toast.success('Marked as ' + words + '.'); }).catch(showError);
      this.markResolved = () => outcome('RESOLVED', 'resolved');
      this.markNotResolved = () => outcome('NOT_RESOLVED', 'not resolved');
      this.markEscalated = () => outcome('ESCALATED', 'escalated to Oracle');
      this.draftSr = () => api.post(base() + '/sr-draft').then(show).catch(showError);
      this.copySr = () => ui.copy(this.detail().srDraft)
        .then(() => toast.success('Copied. Paste it into a new Service Request in My Oracle Support.'))
        .catch(() => toast.error('Copying is not allowed here; select the text and copy it.'));
      this.remove = () => dialog.confirm({
        title: 'Delete this issue?', message: 'Its files, evidence and diagnosis are deleted. This cannot be undone.',
        confirmLabel: 'Delete', danger: true
      }).then((ok) => {
        if (ok) {
          api.del(base()).then(() => { this.detail(null); loadList(); toast.success('Issue deleted.'); }).catch(showError);
        }
      });

      // Sharing as product knowledge (leads)
      this.categoryOptions = CATEGORIES.map((c) => ({ value: c, label: label(c) }));
      this.sharing = ko.observable(false);
      this.shareTitle = ko.observable('');
      this.shareComponent = ko.observable('');
      this.shareCategory = ko.observable('UNKNOWN');
      this.shareRootCause = ko.observable('');
      this.shareResolution = ko.observable('');
      this.canShare = ko.pureComputed(() => !!this.detail() && this.detail().status === 'RESOLVED' && this.canApprove()
        && !this.detail().sharedKnowledgeId);
      this.startShare = () => {
        const detail = this.detail();
        this.shareTitle(detail.title);
        this.shareComponent('');
        this.shareCategory(detail.diagnosis ? detail.diagnosis.category : 'UNKNOWN');
        this.shareRootCause(detail.diagnosis ? detail.diagnosis.rootCause : '');
        this.shareResolution(detail.resolution || '');
        this.sharing(true);
      };
      this.cancelShare = () => this.sharing(false);
      this.share = () => api.post(base() + '/share', {
        title: this.shareTitle(), component: this.shareComponent(), category: this.shareCategory(),
        rootCause: this.shareRootCause(), resolution: this.shareResolution()
      }).then(() => {
        this.sharing(false);
        toast.success('Shared. Every workspace now uses this fix.');
        loadKnowledge();
        return this.open(this.detail().id);
      }).catch(showError);

      this.knowledge = ko.observableArray([]);
      const loadKnowledge = () => api.get('issue-knowledge').then((list) => this.knowledge(list.map((k) => ({
        title: k.title,
        meta: label(k.category) + (k.component ? ' · ' + k.component : '') + (k.obdxVersion ? ' · OBDX ' + k.obdxVersion : '')
          + ' · shared by ' + k.sharedBy + ' on ' + new Date(k.sharedAt).toLocaleDateString(),
        text: 'Cause: ' + k.rootCause + ' Fixed by: ' + k.resolution,
        canWithdraw: k.canWithdraw,
        withdraw: () => dialog.confirm({
          title: 'Withdraw this fix?', message: '"' + k.title + '" is no longer offered to other workspaces.',
          confirmLabel: 'Withdraw', danger: true
        }).then((ok) => {
          if (ok) {
            api.del('issue-knowledge/' + k.id).then(loadKnowledge).catch(showError);
          }
        })
      })))).catch(showError);

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Issues page loaded.');
        document.title = 'Issues';
        subscription = this.workspaceId.subscribe(() => { this.detail(null); loadList(); });
        workspaceSelection.load().then(loadList).catch(showError);
        loadKnowledge();
      };
      this.disconnected = () => {
        clearTimeout(pollTimer);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return IssuesViewModel;
  }
);
