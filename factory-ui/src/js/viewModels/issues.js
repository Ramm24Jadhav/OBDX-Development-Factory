/*
 * Issues page (Issue Analyzer): file an error a bank reported with its description, logs and screenshots; the factory
 * finds the evidence, the bank's matching code and the Oracle notes and manuals in the Library, the model diagnoses it,
 * and the page shows the cause, the evidence and fix steps. Then check the fix with new logs, ask questions, record
 * what fixed it, release the diagnosis to the bank, draft an Oracle SR, or (leads) share the fix and manage the links
 * bank administrators report through. Issues with the same error within a day are grouped.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/dialog', '../services/toast', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, dialog, toast, pageRequests) {
    const POLL_MS = 2000;
    const DAY_MS = 24 * 3600 * 1000;
    const ACCEPTED = '.log,.txt,.out,.png,.jpg,.jpeg';
    const CATEGORIES = ['CONFIGURATION', 'DEPENDENCY', 'INFRASTRUCTURE', 'SECURITY', 'DATA', 'INTEGRATION', 'PRODUCT_DEFECT',
      'CUSTOMIZATION', 'UNKNOWN'];
    const label = (value) => value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ') : '';
    const where = (item) => item.source + (item.line ? (item.kind === 'ORACLE_NOTE' || item.kind === 'MANUAL' ? ', page ' : ':') + item.line : '');
    const when = (value) => value ? new Date(value).toLocaleString() : '';
    // Issue statuses in the shared status categories (ui.status), with this page's words
    const CATEGORY_OF = { DIAGNOSED: 'READY', RESOLVED: 'APPROVED', NOT_RESOLVED: 'WARNING', ESCALATED: 'IN_REVIEW' };
    const WORDS = { NEW: 'New', ANALYZING: 'Analyzing', DIAGNOSED: 'Diagnosed', FAILED: 'Failed', RESOLVED: 'Resolved',
      NOT_RESOLVED: 'Not resolved', ESCALATED: 'Escalated' };
    const issueStatus = (s) => ui.status(CATEGORY_OF[s] || s, WORDS[s]);
    const TONE = { PROBABLE: 'success', POSSIBLE: 'warning', INCONCLUSIVE: '', LOW: 'success', MEDIUM: 'warning', HIGH: 'danger',
      ERROR_GONE: 'success', BANK_WORKS: 'success', STILL_FAILING: 'danger', BANK_STILL_FAILING: 'danger', DIFFERENT_ERROR: 'warning',
      NOT_COMPARABLE: '', CHECKING: 'primary', FAILED: 'danger', ADMIN: 'primary', LIVE_OK: 'success', LIVE_UNREACHABLE: 'danger',
      LIVE_CERTIFICATE: 'warning' };
    const badge = (text, key) => ({ text: text, css: 'fx-badge' + (TONE[key] ? ' fx-badge--' + TONE[key] : '') });
    const CHECK_WORDS = { CHECKING: 'Checking', ERROR_GONE: 'Original error gone', STILL_FAILING: 'Still failing',
      DIFFERENT_ERROR: 'A different error', NOT_COMPARABLE: 'Cannot compare', FAILED: 'Check failed', BANK_WORKS: 'Bank: works now',
      BANK_STILL_FAILING: 'Bank: still failing', LIVE_OK: 'Live check: reachable', LIVE_UNREACHABLE: 'Live check: not reachable',
      LIVE_CERTIFICATE: 'Live check: certificate' };
    const pageUrl = (params) => window.location.origin + window.location.pathname + '?ojr=report&embed=1&' + params;

    function IssuesViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
      this.canFile = ko.pureComputed(() => session.can(this.workspaceId(), 'VIEW'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.canRelease = ko.pureComputed(() => session.can(this.workspaceId(), 'MANAGE_CODE'));
      this.accepted = ACCEPTED;
      const showError = (error) => this.errorMessage(ui.errorText(error));

      // Files chosen for a form (new issue, fix check): a list with remove buttons, a drop zone
      const filePicker = () => {
        const files = ko.observableArray([]);
        const over = ko.observable(false);
        const add = (list) => files(files().concat(Array.from(list || [])));
        return {
          files: files,
          rows: ko.pureComputed(() => files().map((file) => ({ name: file.name, remove: () => files.remove(file) }))),
          selected: (event) => { add(event.target.files); event.target.value = ''; },
          dragOver: (event) => { event.preventDefault(); over(true); return false; },
          dragLeave: () => { over(false); },
          drop: (event) => { event.preventDefault(); over(false); add(event.dataTransfer.files); return false; },
          css: ko.pureComputed(() => 'fx-dropzone factory-is-drop' + (over() ? ' is-over' : ''))
        };
      };

      // New issue
      this.environmentOptions = [{ value: '', label: 'Not given' }].concat(['DEV', 'SIT', 'UAT', 'PROD'].map((e) => ({ value: e, label: e })));
      this.newTitle = ko.observable('');
      this.newEnvironment = ko.observable('');
      this.newDescription = ko.observable('');
      this.newLog = ko.observable('');
      this.newFiles = filePicker();
      this.canSubmit = ko.pureComputed(() => !!(this.newDescription().trim() || this.newLog().trim() || this.newFiles.files().length > 0));

      // List, with groups of the same error
      const all = ko.observableArray([]);
      this.listLoading = ko.observable(true);
      this.groupFilter = ko.observable(null);
      this.rows = ko.pureComputed(() => all().filter((r) => !this.groupFilter() || r.groupId === this.groupFilter()));
      /** Groups with an issue filed in the last day: probably one outage or configuration problem. */
      this.repeated = ko.pureComputed(() => {
        const groups = {};
        all().forEach((r) => { if (r.groupId) { (groups[r.groupId] = groups[r.groupId] || []).push(r); } });
        return Object.keys(groups).map((id) => groups[id]).filter((g) => g.length > 1
          && g.some((r) => Date.now() - new Date(r.createdAt).getTime() < DAY_MS)).map((g) => ({
          text: g.length + ' issues with the same error, the latest filed ' + when(g.map((r) => r.createdAt).sort().pop())
            + '. Probably one outage or configuration problem: "' + g[0].title + '".',
          show: () => this.groupFilter(g[0].groupId)
        }));
      });
      this.clearGroupFilter = () => this.groupFilter(null);

      // Detail
      this.detail = ko.observable(null);
      const base = () => 'workspaces/' + this.workspaceId() + '/issues/' + this.detail().id;
      this.status = ko.pureComputed(() => this.detail() ? issueStatus(this.detail().status) : null);
      this.analyzing = ko.pureComputed(() => !!this.detail() && this.detail().status === 'ANALYZING');
      this.messageCss = ko.pureComputed(() => 'fx-alert factory-is-alert ' + (this.detail() && this.detail().status === 'FAILED'
        ? 'fx-alert--danger' : 'fx-alert--warning'));
      this.fromBank = ko.pureComputed(() => !!this.detail() && this.detail().source === 'BANK');
      this.reporterText = ko.pureComputed(() => {
        const d = this.detail();
        return d && d.source === 'BANK' ? 'Reported through an issue link by ' + d.createdBy.replace(/^bank: /, '')
          + (d.reporterEmail ? ' (' + d.reporterEmail + ')' : '') : '';
      });
      this.releasedText = ko.pureComputed(() => {
        const d = this.detail();
        return d && d.releasedAt ? 'Released to the bank on ' + when(d.releasedAt) + '.' : 'Not released to the bank yet: they see "being looked at".';
      });
      this.canReleaseNow = ko.pureComputed(() => this.fromBank() && this.canRelease() && !this.analyzing() && !!this.detail().diagnosis
        && !this.detail().releasedAt);
      this.screenshots = ko.observableArray([]);
      this.logFiles = ko.observableArray([]);
      this.evidenceItems = ko.observableArray([]);
      this.codeItems = ko.observableArray([]);
      this.view = ko.observable(null);
      this.resolution = ko.observable('');
      this.descriptionText = ko.pureComputed(() => (this.detail() && this.detail().description) || '(no description)');
      this.groupRows = ko.observableArray([]);
      this.checks = ko.observableArray([]);
      this.questions = ko.observableArray([]);
      this.checkLog = ko.observable('');
      this.checkFiles = filePicker();
      this.canCheck = ko.pureComputed(() => !!(this.checkLog().trim() || this.checkFiles.files().length > 0));
      this.question = ko.observable('');

      // Live checks of hosts the issue mentions (developers and leads; leads for PROD issues)
      this.targets = ko.observableArray([]);
      this.prodNote = ko.pureComputed(() => (this.detail() && this.detail().environment === 'PROD' && !this.canApprove()
        ? 'This is a production issue: only a lead can run live checks.' : ''));
      const loadTargets = (detail) => {
        if (!this.canRelease() || !detail.evidence) {
          this.targets([]);
          return;
        }
        api.get('workspaces/' + detail.workspaceId + '/issues/' + detail.id + '/live-targets').then((list) => this.targets(list.map((t) => ({
          label: t.host + ':' + t.port + (t.tls ? ' (TLS)' : ''),
          source: 'from ' + t.source,
          check: () => api.post('workspaces/' + detail.workspaceId + '/issues/' + detail.id + '/live-checks', { host: t.host, port: t.port })
            .then((d) => { show(d); toast.info('Checked ' + t.host + ':' + t.port + '.'); }).catch(showError)
        })))).catch(() => this.targets([]));
      };

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
            forBank: s.audience === 'ADMIN',
            audience: badge('Bank can do it', 'ADMIN'),
            evidence: cite(s.evidence)
          })),
          oracle: (d.oracleReferences || []).map((r) => ({
            title: (r.kind === 'ORACLE_NOTE' ? 'Oracle note: ' : 'Manual: ') + r.title,
            meta: [r.reference, r.version ? 'for OBDX ' + r.version : ''].filter(Boolean).join(' · '),
            why: r.why || '',
            versionNote: r.versionNote || '',
            href: r.documentId ? 'api/knowledge/documents/' + r.documentId + '/file' : ''
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
          all([]);
          this.listLoading(false);
          return Promise.resolve();
        }
        return api.get('workspaces/' + id + '/issues').then((list) => {
          all(list.map((i) => ({
            id: i.id,
            title: i.title,
            status: issueStatus(i.status),
            category: label(i.category),
            environment: i.environment || '',
            createdBy: i.createdBy || '',
            createdAt: i.createdAt,
            groupId: i.groupId,
            updated: when(i.updatedAt),
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
            hidden: f.hiddenAreas === null || f.hiddenAreas === undefined ? ''
              : f.hiddenAreas === 0 ? 'No customer data found by the local model' : 'Customer data hidden (' + f.hiddenAreas + ' area' + (f.hiddenAreas === 1 ? '' : 's') + ')',
            remove: () => dialog.confirm({
              title: 'Remove this screenshot?', message: f.name + ' is deleted from the issue. Analyze again afterwards.', confirmLabel: 'Remove', danger: true
            }).then((ok) => (ok ? api.del('workspaces/' + detail.workspaceId + '/issues/' + detail.id + '/files/' + f.position).then(show).catch(showError) : null)),
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
        this.groupRows(detail.group.map((g) => ({
          title: g.title, status: issueStatus(g.status), when: when(g.createdAt), open: () => this.open(g.id)
        })));
        this.checks(detail.checks.map((c) => ({
          result: badge(CHECK_WORDS[c.result] || label(c.result), c.result),
          summary: c.summary,
          meta: c.createdBy + ' · ' + when(c.createdAt),
          details: c.result.indexOf('LIVE_') === 0 ? c.evidence.items.map((i) => i.text) : [],
          files: detail.checkFiles.filter((f) => f.checkId === c.id).map((f) => ({ name: f.name, href: filesBase + f.position }))
        })));
        loadTargets(detail);
        this.questions(detail.questions.map((q) => ({
          question: q.question,
          answer: q.status === 'ANSWERING' ? 'Thinking…' : (q.answer || ''),
          failed: q.status === 'FAILED',
          meta: q.askedBy + ' · ' + when(q.createdAt) + (q.model ? ' · answered by ' + q.model : '')
        })));
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
        const running = detail.status === 'ANALYZING' || detail.checks.some((c) => c.result === 'CHECKING')
          || detail.questions.some((q) => q.status === 'ANSWERING');
        if (running) {
          pollTimer = setTimeout(() => this.open(detail.id), POLL_MS);
        }
        loadList();
      };

      this.open = (id) => api.get('workspaces/' + this.workspaceId() + '/issues/' + id).then(show).catch(showError);

      this.submit = () => {
        const form = new FormData();
        [['title', this.newTitle()], ['description', this.newDescription()], ['logText', this.newLog()],
          ['environment', this.newEnvironment()]].forEach((pair) => { if (pair[1]) { form.append(pair[0], pair[1]); } });
        this.newFiles.files().forEach((file) => form.append('files', file));
        api.upload('workspaces/' + this.workspaceId() + '/issues', form)
          .then((detail) => {
            this.newTitle(''); this.newDescription(''); this.newLog(''); this.newEnvironment(''); this.newFiles.files([]);
            show(detail);
          })
          .catch(showError);
      };

      this.analyze = () => api.post(base() + '/analyze').then(show).catch(showError);
      this.release = () => api.post(base() + '/release').then((d) => { show(d); toast.success('Released: the bank now sees the summary and their steps.'); })
        .catch(showError);
      const outcome = (path, status, words) => api.post(base() + path, { status: status, resolution: this.resolution() })
        .then((d) => { show(d); toast.success('Marked as ' + words + '.'); }).catch(showError);
      this.markResolved = () => outcome('/outcome', 'RESOLVED', 'resolved');
      this.markNotResolved = () => outcome('/outcome', 'NOT_RESOLVED', 'not resolved');
      this.markEscalated = () => outcome('/outcome', 'ESCALATED', 'escalated to Oracle');
      this.groupSize = ko.pureComputed(() => (this.detail() ? this.detail().group.length + 1 : 0));
      this.groupResolved = () => outcome('/group-outcome', 'RESOLVED', 'resolved for all ' + this.groupSize() + ' issues');
      this.groupEscalated = () => outcome('/group-outcome', 'ESCALATED', 'escalated for all ' + this.groupSize() + ' issues');
      this.draftSr = () => api.post(base() + '/sr-draft').then(show).catch(showError);
      this.copySr = () => ui.copy(this.detail().srDraft)
        .then(() => toast.success('Copied. Paste it into a new Service Request in My Oracle Support.'))
        .catch(() => toast.error('Copying is not allowed here; select the text and copy it.'));
      this.runCheck = () => {
        const form = new FormData();
        if (this.checkLog()) { form.append('logText', this.checkLog()); }
        this.checkFiles.files().forEach((file) => form.append('files', file));
        api.upload(base() + '/checks', form).then((d) => { this.checkLog(''); this.checkFiles.files([]); show(d); }).catch(showError);
      };
      this.ask = () => api.post(base() + '/questions', { text: this.question() }).then((d) => { this.question(''); show(d); }).catch(showError);
      this.remove = () => dialog.confirm({
        title: 'Delete this issue?', message: 'Its files, evidence, checks and diagnosis are deleted. This cannot be undone.',
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

      // Links bank administrators report through (leads)
      this.links = ko.observableArray([]);
      this.linkLabel = ko.observable('');
      this.linkDays = ko.observable('30');
      this.newLinkUrl = ko.observable('');
      const loadLinks = () => {
        if (!this.workspaceId() || !this.canApprove()) {
          this.links([]);
          return Promise.resolve();
        }
        return api.get('workspaces/' + this.workspaceId() + '/issue-links').then((list) => this.links(list.map((l) => ({
          label: l.label,
          meta: (l.active ? 'Active until ' + new Date(l.expiresAt).toLocaleDateString()
            : l.revokedAt ? 'Revoked on ' + new Date(l.revokedAt).toLocaleDateString() : 'Expired on ' + new Date(l.expiresAt).toLocaleDateString())
            + ' · made by ' + l.createdBy,
          active: l.active,
          revoke: () => dialog.confirm({
            title: 'Revoke this link?', message: 'The bank can no longer report through "' + l.label + '". Follow links of issues already reported keep working.',
            confirmLabel: 'Revoke', danger: true
          }).then((ok) => {
            if (ok) {
              api.del('workspaces/' + this.workspaceId() + '/issue-links/' + l.id).then(loadLinks).catch(showError);
            }
          })
        })))).catch(showError);
      };
      this.createLink = () => api.post('workspaces/' + this.workspaceId() + '/issue-links',
        { label: this.linkLabel(), days: parseInt(this.linkDays(), 10) || null })
        .then((created) => {
          this.linkLabel('');
          this.newLinkUrl(pageUrl('token=' + encodeURIComponent(created.token)));
          toast.success('Link made. Copy it now: it is shown only once.');
          return loadLinks();
        }).catch(showError);
      this.copyLink = () => ui.copy(this.newLinkUrl()).then(() => toast.success('Link copied.')).catch(() => toast.error('Select the link and copy it.'));

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Issues page loaded.');
        document.title = 'Issues';
        subscription = this.workspaceId.subscribe(() => { this.detail(null); this.groupFilter(null); this.newLinkUrl(''); loadList(); loadLinks(); });
        workspaceSelection.load().then(() => {
          loadList();
          loadLinks();
          // Opened from a notification
          const requested = pageRequests.issue();
          if (requested) {
            pageRequests.issue(null);
            this.open(requested);
          }
        }).catch(showError);
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
