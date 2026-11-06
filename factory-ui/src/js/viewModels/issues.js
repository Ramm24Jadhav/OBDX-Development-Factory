/*
 * Issues page (Issue Analyzer): file an error a bank reported with its description, logs and screenshots; the factory
 * finds the evidence and the bank's matching code, the model diagnoses it, and the page shows the cause, the evidence
 * and fix steps. Then record what fixed it, draft an Oracle SR, or (leads) share the fix as product knowledge.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojselectsingle', 'ojs/ojinputtext', 'ojs/ojbutton', 'ojs/ojtoolbar',
        'ojs/ojtable', 'ojs/ojfilepicker'],
  function (ko, accUtils, api, workspaceSelection, session, ArrayDataProvider) {
    const POLL_MS = 2000;
    const CATEGORIES = ['CONFIGURATION', 'DEPENDENCY', 'INFRASTRUCTURE', 'SECURITY', 'DATA', 'INTEGRATION', 'PRODUCT_DEFECT',
      'CUSTOMIZATION', 'UNKNOWN'];
    const label = (value) => value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ') : '';
    const where = (item) => item.source + (item.line ? ':' + item.line : '');

    function IssuesViewModel() {
      this.workspaceProvider = new ArrayDataProvider(workspaceSelection.options, { keyAttributes: 'value' });
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
      this.canFile = ko.pureComputed(() => session.can(this.workspaceId(), 'VIEW'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.busy = ko.observable(false);
      const showError = (error) => this.errorMessage(error.message);

      // New issue
      this.environmentProvider = new ArrayDataProvider(['DEV', 'SIT', 'UAT', 'PROD'].map((e) => ({ value: e, label: e })),
        { keyAttributes: 'value' });
      this.newTitle = ko.observable('');
      this.newEnvironment = ko.observable(null);
      this.newDescription = ko.observable('');
      this.newLog = ko.observable('');
      this.chosenFiles = ko.observableArray([]);
      this.chosenFileNames = ko.pureComputed(() => this.chosenFiles().length === 0
        ? 'No files chosen' : this.chosenFiles().map((f) => f.name).join(', '));
      this.canSubmit = ko.pureComputed(() => !this.busy()
        && (this.newDescription().trim() || this.newLog().trim() || this.chosenFiles().length > 0));
      this.filesSelected = (event) => this.chosenFiles(this.chosenFiles().concat(Array.from(event.detail.files)));
      this.clearFiles = () => this.chosenFiles([]);

      // List
      const items = ko.observableArray([]);
      this.listProvider = new ArrayDataProvider(items, { keyAttributes: 'id' });

      // Detail
      this.detail = ko.observable(null);
      this.base = () => 'workspaces/' + this.workspaceId() + '/issues/' + this.detail().id;
      this.statusLabel = ko.pureComputed(() => this.detail() ? label(this.detail().status) : '');
      this.analyzing = ko.pureComputed(() => !!this.detail() && this.detail().status === 'ANALYZING');
      this.screenshots = ko.observableArray([]);
      this.logFiles = ko.observableArray([]);
      this.evidenceItems = ko.observableArray([]);
      this.codeItems = ko.observableArray([]);
      this.view = ko.observable(null);
      this.resolution = ko.observable('');

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
          category: label(d.category),
          state: label(d.state),
          stateClass: 'factory-status factory-issue-state-' + d.state.toLowerCase(),
          summary: d.summary || '',
          rootCause: d.rootCause,
          evidence: d.evidence.filter((id) => byId[id]).map((id) => ({ id: id, where: where(byId[id]), text: byId[id].text })),
          steps: d.steps.map((s, i) => ({
            title: (i + 1) + '. ' + s.action,
            why: s.why || '',
            file: s.file || '',
            risk: 'Risk: ' + label(s.risk),
            riskClass: 'factory-status factory-issue-risk-' + s.risk.toLowerCase(),
            evidence: cite(s.evidence)
          })),
          alternatives: d.alternatives.map((a) => a.cause + (a.why ? ': ' + a.why : '')),
          missing: d.missingInformation,
          conflicts: d.conflicts || '',
          similar: d.similar.map((s) => ({
            title: s.title,
            where: s.shared ? 'shared knowledge' : 'this workspace',
            text: label(s.category) + '. Cause: ' + s.rootCause + (s.resolution ? ' Fixed by: ' + s.resolution : '')
          })),
          model: d.model ? 'Diagnosed by ' + d.model : ''
        };
      };

      let pollTimer = null;
      const loadList = () => {
        const id = this.workspaceId();
        if (!id) {
          items([]);
          return Promise.resolve();
        }
        return api.get('workspaces/' + id + '/issues').then((list) => {
          items(list.map((i) => Object.assign({}, i, {
            statusText: label(i.status),
            categoryText: label(i.category),
            environment: i.environment || '',
            updated: new Date(i.updatedAt).toLocaleString(),
            openAction: () => this.open(i.id)
          })));
        }).catch(showError);
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
            text: text,
            hasText: f.extractedText !== null,
            save: () => api.put('workspaces/' + detail.workspaceId + '/issues/' + detail.id + '/files/' + f.position + '/text',
              { text: text() }).then(show).catch(showError)
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
        this.detail(detail);
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
          ['environment', this.newEnvironment() || '']].forEach((pair) => { if (pair[1]) { form.append(pair[0], pair[1]); } });
        this.chosenFiles().forEach((file) => form.append('files', file));
        this.busy(true);
        api.upload('workspaces/' + this.workspaceId() + '/issues', form)
          .then((detail) => {
            this.newTitle(''); this.newDescription(''); this.newLog(''); this.chosenFiles([]);
            show(detail);
          })
          .catch(showError)
          .finally(() => this.busy(false));
      };

      this.analyze = () => api.post(this.base() + '/analyze').then(show).catch(showError);
      const outcome = (status) => api.post(this.base() + '/outcome', { status: status, resolution: this.resolution() })
        .then(show).catch(showError);
      this.markResolved = () => outcome('RESOLVED');
      this.markNotResolved = () => outcome('NOT_RESOLVED');
      this.markEscalated = () => outcome('ESCALATED');
      this.draftSr = () => api.post(this.base() + '/sr-draft').then(show).catch(showError);
      this.copyMessage = ko.observable('');
      this.copySr = () => navigator.clipboard.writeText(this.detail().srDraft)
        .then(() => this.copyMessage('Copied. Paste it into a new Service Request in My Oracle Support.'))
        .catch(() => this.copyMessage('Copying is not allowed here; select the text and copy it.'));
      this.remove = () => {
        if (!window.confirm('Delete this issue with its files and analysis?')) {
          return;
        }
        api.del(this.base()).then(() => { this.detail(null); loadList(); }).catch(showError);
      };

      // Sharing as product knowledge (leads)
      this.categoryProvider = new ArrayDataProvider(CATEGORIES.map((c) => ({ value: c, label: label(c) })), { keyAttributes: 'value' });
      this.sharing = ko.observable(false);
      this.shareTitle = ko.observable('');
      this.shareComponent = ko.observable('');
      this.shareCategory = ko.observable(null);
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
      this.share = () => api.post(this.base() + '/share', {
        title: this.shareTitle(), component: this.shareComponent(), category: this.shareCategory(),
        rootCause: this.shareRootCause(), resolution: this.shareResolution()
      }).then(() => { this.sharing(false); loadKnowledge(); return this.open(this.detail().id); }).catch(showError);

      this.knowledge = ko.observableArray([]);
      this.knowledgeTitle = ko.pureComputed(() => 'Shared product knowledge (' + this.knowledge().length + ')');
      const loadKnowledge = () => api.get('issue-knowledge').then((list) => this.knowledge(list.map((k) => ({
        title: k.title,
        meta: label(k.category) + (k.component ? ' · ' + k.component : '') + (k.obdxVersion ? ' · OBDX ' + k.obdxVersion : '')
          + ' · shared by ' + k.sharedBy + ' on ' + new Date(k.sharedAt).toLocaleDateString(),
        text: 'Cause: ' + k.rootCause + ' Fixed by: ' + k.resolution,
        canWithdraw: k.canWithdraw,
        withdraw: () => {
          if (window.confirm('Withdraw "' + k.title + '" from shared knowledge?')) {
            api.del('issue-knowledge/' + k.id).then(loadKnowledge).catch(showError);
          }
        }
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
