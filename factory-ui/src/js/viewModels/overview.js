/*
 * Home: what needs the user now and how the work is going, in the workspace chosen in the top bar (or in all
 * workspaces). First what needs someone (failed or interrupted work, approvals, open questions; filter chips by kind),
 * then the work in progress by stage (each requirement's workflow that is not delivered or closed, under its step,
 * with what the factory recorded for each stage), one Recent card (activity, requirements, builds) and the workspaces
 * as small cards. With no workspace yet it shows only the setup. The data comes from the dashboard service (the same
 * endpoints the other pages use); every item opens its own record.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/dashboard',
        '../services/pageRequests', '../services/ui', '../services/workspaceSelection'],
  function (ko, accUtils, api, session, dashboard, pageRequests, ui, workspaceSelection) {
    const WEEK_MS = 7 * 24 * 3600 * 1000;
    // Status chips of the design system (ui.status: one colour and icon per category, the page's own words)
    const REQUIREMENT_WORDS = { PROCESSING: 'Drafting', READY: 'Review', APPROVED: 'Approved', FAILED: 'Failed' };
    // The same words as the Workspaces page
    const CODE = {
      ready: ui.status('SUCCEEDED', 'Indexed'), importing: ui.status('IMPORTING', 'Importing'),
      failed: ui.status('FAILED', 'Import failed'), new: ui.status('NEW', 'Not imported')
    };
    const WORK_SHOWN = 8;
    // Attention kinds as filter chips, in this order, with the dot colour of their tone
    const KIND_CHIPS = [['failed', 'Failed', 'red'], ['approval', 'Approvals', 'amber'], ['questions', 'Questions', 'amber'],
      ['review', 'To review', 'amber'], ['setup', 'Setup', 'amber']];
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
              step: s.step, stepText: s.stepText, status: s.status,
              next: s.perm && !can(s.perm) ? waiting(s.next, s.who) : s.next,
              open: s.open
            });
          });
        });
        // Newest first; the newest is marked as the one last worked on
        return rows.sort((a, b) => new Date(b.at) - new Date(a.at))
          .map((r, i) => Object.assign(r, { latest: i === 0, domId: i === 0 ? 'continueFirst' : null }));
      });
      // The rows by stage (Spec, Screens, Plan, Code), the newest first within each; only stages that have work
      this.workShown = ko.pureComputed(() => this.continueItems().slice(0, WORK_SHOWN));
      this.workHidden = ko.pureComputed(() => Math.max(0, this.continueItems().length - WORK_SHOWN));
      this.workGroups = ko.pureComputed(() => dashboard.steps.map((name, i) => ({
        key: 'step' + (i + 1), label: (i + 1) + ' · ' + name, rows: this.workShown().filter((r) => r.step === i + 1)
      })).filter((g) => g.rows.length));

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
      // Filter chips by kind (All, Failed, Approvals ...), each with its count; only kinds that have items
      this.attentionKind = ko.observable('');
      this.attentionKinds = ko.pureComputed(() => {
        const items = this.attentionAll();
        const chip = (value, label, tone, n) => ({
          text: label + ' ' + n, dot: tone ? 'factory-home-dot factory-home-dot-' + tone : 'factory-home-dot is-none',
          pressed: ko.pureComputed(() => String(this.attentionKind() === value)),
          pick: () => { this.attentionKind(value); this.attentionExpanded(false); }
        });
        return [chip('', 'All', '', items.length)].concat(KIND_CHIPS
          .map((k) => [k, count(items, (a) => a.kind === k[0])]).filter((x) => x[1] > 0).map((x) => chip(x[0][0], x[0][1], x[0][2], x[1])));
      });
      this.attentionFiltered = ko.pureComputed(() => {
        const kind = this.attentionKind();
        const list = this.attentionAll().filter((a) => !kind || a.kind === kind);
        return list.length || !kind ? list : this.attentionAll();
      });
      this.attention = ko.pureComputed(() => (this.attentionExpanded() ? this.attentionFiltered() : this.attentionFiltered().slice(0, ATTENTION_SHOWN)));
      this.attentionHidden = ko.pureComputed(() => Math.max(0, this.attentionFiltered().length - ATTENTION_SHOWN));
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

      // ---------- Progress by stage: the work at each step, and what the factory recorded for it ----------
      // Each figure says what it counts (in its tooltip, with the breakdown); none is shown that the factory does not record.
      this.stages = ko.pureComputed(() => {
        const d = this.scoped();
        const requirements = all(d, 'requirements');
        const designs = all(d, 'designs');
        const changes = all(d, 'changes');
        const builds = all(d, 'builds');
        const parts = (list) => list.filter((p) => p[0] > 0).map((p) => p[0] + ' ' + p[1]).join(' · ');
        const closed = count(changes, (c) => c.status === 'CLOSED');
        const figure = (key, label, done, total, doneWord, definition, sub, page) => {
          const percent = total ? Math.round(100 * done / total) : 0;
          return {
            key: key, page: page, text: total ? done + ' of ' + total + ' ' + label.toLowerCase() + ' ' + doneWord : 'No ' + label.toLowerCase() + ' yet',
            title: definition + (sub ? ' ' + sub + '.' : ''), hasBar: total > 0, percent: percent, width: percent + '%',
            barLabel: label + ': ' + done + ' of ' + total + ' ' + doneWord, open: this.go(page)
          };
        };
        const figures = [
          [figure('requirements', 'Requirements', count(requirements, (r) => r.status === 'APPROVED'), requirements.length, 'approved',
            'Requirements whose spec is approved, of all requirements.',
            parts([[count(requirements, (r) => r.status === 'PROCESSING'), 'being drafted'], [count(requirements, (r) => r.status === 'READY'), 'waiting for answers or approval'],
              [count(requirements, (r) => r.status === 'FAILED'), 'failed']]), 'requirements')],
          [figure('screens', 'Screens', count(designs, (s) => s.status === 'APPROVED'), designs.length, 'approved',
            'Screen designs approved, of all screen designs.',
            parts([[count(designs, (s) => s.status === 'IN_REVIEW'), 'in review'], [count(designs, (s) => s.status === 'DRAFT'), 'draft']]), 'studio')],
          [],
          [figure('changes', 'Changes', count(changes, (c) => c.status === 'DELIVERED'), changes.length - closed, 'delivered',
            'Changes delivered to SVN, of all changes that are not closed.',
            parts([[count(changes, (c) => dashboard.openChanges.indexOf(c.status) >= 0), 'open'], [count(changes, (c) => c.status === 'FAILED'), 'failed'], [closed, 'closed']]), 'changes'),
          figure('builds', 'Builds', count(builds, (b) => b.result === 'SUCCESS'), builds.length, 'passed',
            'Jenkins builds of changes that passed, of all builds.',
            parts([[count(builds, (b) => b.result && b.result !== 'SUCCESS'), 'failed'], [count(builds, (b) => !b.result), 'running']]), 'build')]
        ];
        const items = this.continueItems();
        return dashboard.steps.map((name, i) => {
          const n = count(items, (r) => r.step === i + 1);
          return {
            n: i + 1, name: name, count: n ? n + ' in progress' : 'None now', countLabel: name + ': ' + (n ? n + ' in progress' : 'nothing in progress'),
            css: 'factory-home-stage' + (n ? ' has-work' : ''), figures: figures[i]
          };
        });
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
      // One Recent card: activity, requirements or builds, each with its own View all
      this.recentTab = ko.observable('activity');
      const RECENT = { activity: ['notifications', 'All activity'], requirements: ['requirements', 'All requirements'], builds: ['build', 'All builds'] };
      this.recentTabs = [{ value: 'activity', label: 'Activity' }, { value: 'requirements', label: 'Requirements' }, { value: 'builds', label: 'Builds' }].map((t) => Object.assign(t, {
        pressed: ko.pureComputed(() => String(this.recentTab() === t.value)),
        pick: () => this.recentTab(t.value)
      }));
      this.recentLink = ko.pureComputed(() => ({ page: RECENT[this.recentTab()][0], label: RECENT[this.recentTab()][1] }));
      this.openRecentLink = (event) => this.go(this.recentLink().page)(event);

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
        const state = dashboard.codeState(d).key;
        const current = w.id === (this.entry() && this.entry().workspace.id);
        return {
          id: w.id, name: w.name, meta: w.bankName + ' · OBDX ' + w.obdxVersion, location: w.svnUrl || '',
          status: state === 'ready' ? ui.status('SUCCEEDED', 'Indexed · r' + w.indexedRevision) : CODE[state],
          when: dashboard.ago(updated), whenTitle: 'Code last updated ' + dashboard.when(updated), at: updated,
          current: current ? 'true' : 'false', css: 'factory-home-ws' + (current ? ' is-current' : ''),
          open: dashboard.open('code', w.id),
          menu: (event) => dashboard.open(event.detail.value, w.id)()
        };
      }).sort((a, b) => new Date(b.at) - new Date(a.at)));
      this.carousel = ui.carousel();
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
        dashboard.load().then(() => { loadedOnce(true); this.carousel.attach('homeWorkspaceTrack'); });
        this.carousel.attach('homeWorkspaceTrack');
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
