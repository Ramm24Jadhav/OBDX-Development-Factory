/*
 * Home: what to do next in the workspace chosen in the top bar (or in all workspaces). First the work to continue
 * (each requirement's workflow that is not delivered or closed, newest first) and what needs someone (failed or
 * interrupted work, approvals, open questions); then progress with what each number counts, recent requirements,
 * activity, builds and the workspaces. With no workspace yet it shows only the setup. The data comes from the
 * dashboard service (the same endpoints the other pages use); every item opens its own record.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/dashboard',
        '../services/pageRequests', '../services/ui', '../services/workspaceSelection'],
  function (ko, accUtils, api, session, dashboard, pageRequests, ui, workspaceSelection) {
    const WEEK_MS = 7 * 24 * 3600 * 1000;
    // Status chips of the design system (ui.status: one colour and icon per category, the page's own words)
    const REQUIREMENT_WORDS = { PROCESSING: 'Drafting', READY: 'Review', APPROVED: 'Approved', FAILED: 'Failed' };
    const CODE = {
      ready: ui.status('SUCCEEDED', 'Ready'), importing: ui.status('IMPORTING', 'Indexing'),
      failed: ui.status('FAILED', 'Check Required'), new: ui.status('NEW', 'Not imported')
    };
    // What an attention item is, as a status chip
    const KIND = {
      failed: ui.status('FAILED', 'Failed'), approval: ui.status('IN_REVIEW', 'Approval'), questions: ui.status('READY', 'Questions'),
      review: ui.status('GENERATED', 'To review'), setup: ui.status('DRAFT', 'Setup')
    };
    const ATTENTION_SHOWN = 5;
    const count = (list, test) => list.filter(test).length;
    const all = (data, key) => data.reduce((sum, d) => sum.concat(d[key]), []);
    const newest = (values) => values.filter(Boolean).sort().pop();
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    // The next step for someone without the right to take it: what happened, and who acts
    // ("Impact analysis failed. Waiting for a developer." or "Waiting for someone who can approve: review the plan ...")
    const waiting = (next, who) => {
      const cut = next.indexOf('. ');
      return cut > 0 ? next.slice(0, cut + 1) + ' Waiting for ' + who + '.' : 'Waiting for ' + who + ': ' + next.charAt(0).toLowerCase() + next.slice(1);
    };
    // Whether the first load has finished (kept between visits, so returning to Home shows the data at once)
    const loadedOnce = ko.observable(false);

    function OverviewViewModel() {
      const data = dashboard.data;
      this.data = data;
      this.loading = dashboard.loading;
      this.error = dashboard.error;
      // A network failure in plain words; a server answer as it came
      this.errorText = ko.pureComputed(() => (/failed to fetch|networkerror|load failed/i.test(this.error())
        ? 'Could not reach the factory. Check your connection and that the factory is running, then try again.'
        : 'Could not load the dashboard: ' + this.error() + '. Try again in a moment.'));
      this.isAdmin = session.isAdmin;
      this.go = (page) => dashboard.open(page);
      this.reload = () => dashboard.load();
      this.greeting = ko.pureComputed(() => {
        const hour = new Date().getHours();
        const part = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
        const user = session.user();
        return user ? part + ', ' + user.displayName.split(/\s+/)[0] : part;
      });

      // ---------- States: loading, first run (no workspaces), error, ready ----------
      this.starting = ko.pureComputed(() => !loadedOnce() && !this.error());
      this.firstRun = ko.pureComputed(() => loadedOnce() && !this.error() && data().length === 0);
      this.ready = ko.pureComputed(() => data().length > 0);

      // ---------- Scope: the workspace chosen in the top bar, or all workspaces ----------
      this.entry = ko.pureComputed(() => data().find((e) => e.workspace.id === workspaceSelection.selectedId()) || data()[0] || null);
      this.scope = ko.observable('workspace');
      this.allScope = ko.pureComputed(() => this.scope() === 'all');
      this.scoped = ko.pureComputed(() => (this.allScope() ? data() : (this.entry() ? [this.entry()] : [])));
      this.scopeName = ko.pureComputed(() => (this.allScope() ? 'all workspaces' : (this.entry() ? this.entry().workspace.name : '')));
      this.scopeTabs = [{ value: 'workspace', label: ko.pureComputed(() => (this.entry() ? this.entry().workspace.name : 'This workspace')) },
        { value: 'all', label: 'All workspaces' }].map((t) => Object.assign(t, {
        pressed: ko.pureComputed(() => String(this.scope() === t.value)),
        pick: () => this.scope(t.value)
      }));
      // The chosen workspace in one line: bank, OBDX version and where its code stands
      this.lead = ko.pureComputed(() => {
        const e = this.entry();
        if (this.allScope()) {
          return plural(data().length, 'workspace') + ' you can see.';
        }
        if (!e) {
          return '';
        }
        const state = dashboard.codeState(e).key;
        const code = { ready: 'code indexed at r' + e.workspace.indexedRevision, importing: 'code import running', failed: 'code import failed', new: 'code not imported' }[state];
        return e.workspace.bankName + ' · OBDX ' + e.workspace.obdxVersion + ' · ' + code;
      });
      this.canAddRequirement = ko.pureComputed(() => !!this.entry() && session.can(this.entry().workspace.id, 'EDIT_REQUIREMENTS'));
      this.newRequirement = () => { pageRequests.newRequirement('upload'); dashboard.open('requirements', this.entry().workspace.id)(); };
      // Parts that could not be loaded: said once, so a count is never shown as complete when it is not
      this.missing = ko.pureComputed(() => this.scoped().filter((e) => e.missing.length)
        .map((e) => e.missing.join(', ') + ' of ' + e.workspace.name).join('; '));

      // ---------- Continue where you left off ----------
      // One row per requirement whose workflow is still open (its latest change is not delivered or closed): the
      // step it is at, its status and the next thing to do, with who can do it when the user cannot.
      this.continueItems = ko.pureComputed(() => {
        const rows = [];
        this.scoped().forEach((d) => {
          const w = d.workspace;
          const can = (permission) => session.can(w.id, permission);
          d.requirements.forEach((r) => {
            // step (1-4), status chip, next step, the permission it needs and who does it otherwise, where it opens
            const s = dashboard.workflow(r, d.designs, d.changeDetails, w.id);
            if (s.finished) {
              return;
            }
            const at = newest([r.updatedAt, s.change && s.change.updatedAt].concat(s.designs.map((x) => x.updatedAt)));
            rows.push({
              key: r.id, title: r.title, workspace: w.name, at: at, when: dashboard.ago(at), whenTitle: dashboard.when(at),
              stepText: s.stepText, status: s.status,
              next: s.perm && !can(s.perm) ? waiting(s.next, s.who) : s.next,
              steps: s.steps.map((st) => ({ name: st.name, css: 'factory-home-step' + (st.state === 'done' ? ' is-done' : (st.state === 'current' ? ' is-current' : '')) })),
              open: s.open
            });
          });
        });
        return rows.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 4);
      });
      this.continueFirst = ko.pureComputed(() => this.continueItems()[0] || null);
      this.continueMore = ko.pureComputed(() => this.continueItems().slice(1));

      // ---------- Attention required ----------
      const TONE_ORDER = { red: 0, amber: 1 };
      this.attentionExpanded = ko.observable(false);
      this.attentionAll = ko.pureComputed(() => {
        const ids = this.scoped().map((e) => e.workspace.id);
        return dashboard.attention().filter((a) => !a.workspaceId || ids.indexOf(a.workspaceId) >= 0)
          .slice().sort((a, b) => (TONE_ORDER[a.tone] - TONE_ORDER[b.tone]) || (new Date(b.at || 0) - new Date(a.at || 0)))
          .map((a) => Object.assign({}, a, {
            // The shared item names its workspace; one workspace's list does not need it
            text: !this.allScope() && a.workspaceName && a.text.indexOf(a.workspaceName + ': ') === 0
              ? a.text.charAt(a.workspaceName.length + 2).toUpperCase() + a.text.slice(a.workspaceName.length + 3) : a.text,
            chip: a.kind === 'failed' && /interrupted/.test(a.title + a.text) ? ui.status('FAILED', 'Interrupted') : KIND[a.kind]
          }));
      });
      this.attention = ko.pureComputed(() => (this.attentionExpanded() ? this.attentionAll() : this.attentionAll().slice(0, ATTENTION_SHOWN)));
      this.attentionHidden = ko.pureComputed(() => Math.max(0, this.attentionAll().length - ATTENTION_SHOWN));
      this.toggleAttention = () => this.attentionExpanded(!this.attentionExpanded());
      this.attentionToggleText = ko.pureComputed(() => (this.attentionExpanded() ? 'Show fewer' : 'Show ' + this.attentionHidden() + ' more'));
      // Items in the other workspaces, so nothing is hidden by the workspace choice
      this.attentionElsewhere = ko.pureComputed(() => {
        if (this.allScope() || !this.entry()) {
          return [];
        }
        const here = this.entry().workspace.id;
        return data().filter((e) => e.workspace.id !== here).map((e) => ({
          id: e.workspace.id, n: count(dashboard.attention(), (a) => a.workspaceId === e.workspace.id)
        })).filter((x) => x.n > 0).map((x) => {
          const e = data().find((y) => y.workspace.id === x.id);
          return { label: e.workspace.name + ' (' + x.n + ')', pick: () => workspaceSelection.selectedId(x.id) };
        });
      });

      // ---------- Progress: each number says what it counts ----------
      this.progress = ko.pureComputed(() => {
        const d = this.scoped();
        const requirements = all(d, 'requirements');
        const designs = all(d, 'designs');
        const changes = all(d, 'changes');
        const builds = all(d, 'builds');
        const parts = (list) => list.filter((p) => p[0] > 0).map((p) => p[0] + ' ' + p[1]).join(' · ');
        const closed = count(changes, (c) => c.status === 'CLOSED');
        const row = (key, label, icon, tone, done, total, doneWord, definition, sub, page) => {
          const percent = total ? Math.round(100 * done / total) : 0;
          return {
            key: key, label: label, iconClass: 'factory-nav-icon factory-ico-' + icon, iconCss: 'factory-home-metric-icon factory-ov2-icon-' + tone,
            value: total ? done + ' of ' + total : 'None yet', doneWord: total ? doneWord : '', definition: definition, sub: sub, hasBar: total > 0,
            barCss: 'fx-progress factory-home-bar factory-home-bar-' + tone, percent: percent, width: percent + '%',
            barLabel: label + ': ' + done + ' of ' + total + ' ' + doneWord, open: this.go(page)
          };
        };
        return [
          row('requirements', 'Requirements', 'doc', 'blue', count(requirements, (r) => r.status === 'APPROVED'), requirements.length, 'approved',
            'Requirements whose spec is approved, of all requirements.',
            parts([[count(requirements, (r) => r.status === 'PROCESSING'), 'being drafted'], [count(requirements, (r) => r.status === 'READY'), 'waiting for answers or approval'],
              [count(requirements, (r) => r.status === 'FAILED'), 'failed']]), 'requirements'),
          row('screens', 'Screens', 'monitor', 'green', count(designs, (s) => s.status === 'APPROVED'), designs.length, 'approved',
            'Screen designs approved, of all screen designs.',
            parts([[count(designs, (s) => s.status === 'IN_REVIEW'), 'in review'], [count(designs, (s) => s.status === 'DRAFT'), 'draft']]), 'studio'),
          row('changes', 'Code changes', 'code', 'amber', count(changes, (c) => c.status === 'DELIVERED'), changes.length - closed, 'delivered',
            'Changes delivered to SVN, of all changes that are not closed.',
            parts([[count(changes, (c) => dashboard.openChanges.indexOf(c.status) >= 0), 'open'], [count(changes, (c) => c.status === 'FAILED'), 'failed'], [closed, 'closed']]), 'changes'),
          row('builds', 'Builds', 'flask', 'violet', count(builds, (b) => b.result === 'SUCCESS'), builds.length, 'passed',
            'Jenkins builds of changes that passed, of all builds.',
            parts([[count(builds, (b) => b.result && b.result !== 'SUCCESS'), 'failed'], [count(builds, (b) => !b.result), 'running']]), 'build')
        ];
      });

      // ---------- Recent requirements, builds and activity (in the scope) ----------
      this.recentRequirements = ko.pureComputed(() => this.scoped().reduce((list, d) => list.concat(d.requirements.map((r) => ({
        title: r.title, workspace: d.workspace.name, type: r.fileName ? 'Document' : 'Described',
        status: ui.status(r.status, REQUIREMENT_WORDS[r.status]), when: dashboard.ago(r.updatedAt), whenTitle: dashboard.when(r.updatedAt),
        at: r.updatedAt, open: dashboard.openRecord('requirements', d.workspace.id, 'requirement', r.id)
      }))), []).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 4));

      this.recentBuilds = ko.pureComputed(() => all(this.scoped(), 'builds').map((b) => {
        const running = !b.result || !b.finishedAt;
        return {
          title: (b.buildNumber ? '#' + b.buildNumber + ' ' : '') + b.changeTitle, workspace: b.workspaceName,
          status: running ? ui.status('RUNNING', 'Running') : (b.result === 'SUCCESS' ? ui.status('SUCCEEDED', 'Passed') : ui.status('FAILED', 'Failed')),
          duration: dashboard.duration(b.startedAt, b.finishedAt), when: dashboard.ago(b.finishedAt || b.startedAt), whenTitle: dashboard.when(b.finishedAt || b.startedAt),
          at: b.finishedAt || b.startedAt, open: dashboard.openRecord('changes', b.workspaceId, 'change', b.changeId)
        };
      }).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 4));

      // Recent activity as a timeline: the dot says how it ended (done, failed, still running)
      this.activity = ko.pureComputed(() => {
        const items = [];
        const DOT = { done: ' fx-timeline-dot--success', failed: ' fx-timeline-dot--danger', running: ' fx-timeline-dot--running', none: '' };
        const add = (state, icon, text, workspace, at, open) => items.push({
          dotCss: 'fx-timeline-dot' + DOT[state], iconClass: 'factory-nav-icon factory-ico-' + icon,
          text: text, workspace: workspace, at: at, when: dashboard.ago(at), whenTitle: dashboard.when(at), open: open
        });
        this.scoped().forEach((d) => {
          const w = d.workspace;
          add('none', 'folder', 'Workspace "' + w.name + '" created', w.name, w.createdAt, dashboard.open('workspaces'));
          d.imports.forEach((j) => add(j.status === 'FAILED' ? 'failed' : (j.status === 'SUCCEEDED' ? 'done' : 'running'), 'cube',
            j.status === 'FAILED' ? 'Code import failed' : (j.status === 'SUCCEEDED' ? 'Code indexed at r' + j.toRevision : 'Code import started'),
            w.name, j.finishedAt || j.createdAt, dashboard.open('code', w.id)));
          d.requirements.forEach((r) => add(r.status === 'APPROVED' ? 'done' : (r.status === 'FAILED' ? 'failed' : 'none'), 'doc',
            'Requirement "' + r.title + '" ' + (r.status === 'APPROVED' ? 'approved' : 'updated'), w.name, r.updatedAt,
            dashboard.openRecord('requirements', w.id, 'requirement', r.id)));
          d.designs.forEach((s) => add(s.status === 'APPROVED' ? 'done' : 'none', 'monitor', 'Screen "' + s.name + '" ' + (s.status === 'APPROVED' ? 'approved' : 'updated'),
            w.name, s.updatedAt, s.requirementId ? dashboard.openRecord('studio', w.id, 'studio', s.requirementId) : dashboard.openRecord('studio', w.id, 'design', s.id)));
          d.changes.forEach((c) => add(c.status === 'FAILED' ? 'failed' : (c.status === 'DELIVERED' || c.status === 'MERGED' ? 'done' : 'none'), 'code',
            'Change "' + c.title + '" ' + c.status.toLowerCase().replace(/_/g, ' '), w.name, c.updatedAt, dashboard.openRecord('changes', w.id, 'change', c.id)));
          d.builds.forEach((b) => add(b.result === 'SUCCESS' ? 'done' : (b.result ? 'failed' : 'running'), b.result === 'SUCCESS' ? 'check' : (b.result ? 'x' : 'refresh'),
            'Build ' + (b.buildNumber ? '#' + b.buildNumber + ' ' : '') + (b.result === 'SUCCESS' ? 'completed successfully' : (b.result ? 'failed' : 'started')),
            w.name, b.finishedAt || b.startedAt, dashboard.openRecord('changes', w.id, 'change', b.changeId)));
        });
        return items.filter((i) => i.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);
      });

      // ---------- Workspaces (all of them), each with a menu of its pages ----------
      this.workspaceSummary = ko.pureComputed(() => {
        const added = count(data(), (e) => Date.now() - new Date(e.workspace.createdAt).getTime() < WEEK_MS);
        return plural(data().length, 'workspace') + (added ? ' · ' + added + ' added in the last 7 days' : '');
      });
      this.workspaceActions = [{ value: 'code', label: 'Open code' }, { value: 'code:facts', label: 'Codebase facts' },
        { value: 'requirements', label: 'Requirements' }, { value: 'studio', label: 'Design Studio' }];
      this.workspaces = ko.pureComputed(() => data().map((d) => {
        const w = d.workspace;
        const job = d.imports.length ? d.imports[0] : null;
        const updated = job ? (job.finishedAt || job.createdAt) : w.createdAt;
        return {
          id: w.id, name: w.name, meta: w.bankName + ' · OBDX ' + w.obdxVersion, location: w.svnUrl || '',
          status: CODE[dashboard.codeState(d).key], when: dashboard.ago(updated), whenTitle: 'Code last updated ' + dashboard.when(updated), at: updated,
          current: w.id === (this.entry() && this.entry().workspace.id) ? 'true' : 'false',
          open: dashboard.open('code', w.id),
          menu: (event) => dashboard.open(event.detail.value, w.id)()
        };
      }).sort((a, b) => new Date(b.at) - new Date(a.at)));
      this.connectCodeBase = () => {
        pageRequests.newWorkspace({ kind: 'folder', value: '' });
        dashboard.open('workspaces')();
      };

      // ---------- First run: set up the first workspace (checked and created on the Workspaces page) ----------
      this.sourceKind = ko.observable('folder');
      this.localEnabled = ko.observable(false);
      this.sourceTabs = [{ value: 'folder', label: 'Folder on this computer' }, { value: 'url', label: 'SVN server (URL)' }].map((t) => Object.assign(t, {
        pressed: ko.pureComputed(() => String(this.sourceKind() === t.value)),
        disabled: ko.pureComputed(() => String(t.value === 'folder' && !this.localEnabled())),
        tip: ko.pureComputed(() => (t.value === 'folder' && !this.localEnabled() ? 'Folders on this computer are turned off on this server. Use an SVN URL.' : null)),
        pick: () => {
          if (!(t.value === 'folder' && !this.localEnabled())) {
            this.sourceKind(t.value);
          }
        }
      }));
      this.sourceValue = ko.observable('');
      this.sourceLabel = ko.pureComputed(() => (this.sourceKind() === 'folder' ? 'Project folder' : 'SVN repository URL'));
      this.scanRepositories = ko.observable(true);
      this.scanToggle = (event) => this.scanRepositories(event.target.checked);
      this.found = ko.observableArray([]);
      this.browse = () => {
        pageRequests.newWorkspace({ kind: 'folder', value: this.sourceValue().trim(), browse: true });
        dashboard.open('workspaces')();
      };
      this.createWorkspace = () => {
        pageRequests.newWorkspace({ kind: this.sourceKind(), value: this.sourceValue().trim() });
        dashboard.open('workspaces')();
      };

      this.connected = () => {
        accUtils.announce('Home page loaded.');
        document.title = 'Home';
        dashboard.load().then(() => loadedOnce(true));
        if (session.isAdmin()) {
          api.get('sources/local').then((local) => {
            this.localEnabled(!!local.enabled);
            if (!local.enabled) {
              this.sourceKind('url');
              return;
            }
            this.found(local.found.map((r) => ({ name: r.name, use: () => this.sourceValue(r.path) })));
          }).catch(() => this.sourceKind('url'));
        }
      };
    }

    return OverviewViewModel;
  }
);
