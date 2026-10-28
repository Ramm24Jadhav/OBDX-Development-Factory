/*
 * Overview page: totals across the workspaces the user can see, recent workspaces, setting up a new workspace,
 * recent requirements, development progress, recent Jenkins builds and recent activity. The data comes from the
 * dashboard service (the same endpoints the other pages use).
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/dashboard',
        '../services/pageRequests', 'ojs/ojarraydataprovider', 'ojs/ojbutton', 'ojs/ojmenu', 'ojs/ojselectsingle', 'ojs/ojinputtext'],
  function (ko, accUtils, api, session, dashboard, pageRequests, ArrayDataProvider) {
    const WEEK_MS = 7 * 24 * 3600 * 1000;
    const pill = (text, tone) => ({ text: text, css: 'factory-ov-pill factory-ov-pill-' + tone });
    const REQUIREMENT = { PROCESSING: pill('In Progress', 'blue'), READY: pill('Review', 'amber'), APPROVED: pill('Approved', 'green'), FAILED: pill('Failed', 'red') };
    const CODE = { ready: pill('Ready', 'green'), importing: pill('Indexing', 'blue'), failed: pill('Check Required', 'amber'), new: pill('Not imported', 'grey') };
    const count = (list, test) => list.filter(test).length;
    const all = (data, key) => data.reduce((sum, d) => sum.concat(d[key]), []);
    const shortId = (id) => 'REQ-' + id.replace(/-/g, '').slice(0, 4).toUpperCase();

    function OverviewViewModel() {
      const data = dashboard.data;
      this.loading = dashboard.loading;
      this.error = dashboard.error;
      this.isAdmin = session.isAdmin;
      this.go = (page) => dashboard.open(page);
      this.greeting = ko.pureComputed(() => {
        const hour = new Date().getHours();
        const part = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
        const user = session.user();
        return user ? part + ', ' + user.displayName.split(/\s+/)[0] : part;
      });

      // Open Workspace: picks a workspace and opens its code.
      this.workspaceMenu = ko.pureComputed(() => data().map((d) => ({ id: d.workspace.id, label: d.workspace.name + ' (' + d.workspace.bankName + ')' })));
      this.openWorkspace = (event) => dashboard.open('code', event.detail.selectedValue)();

      // The five totals
      this.tiles = ko.pureComputed(() => {
        const d = data();
        const requirements = all(d, 'requirements');
        const designs = all(d, 'designs');
        const changes = all(d, 'changes');
        const builds = all(d, 'builds');
        const newThisWeek = count(d, (e) => Date.now() - new Date(e.workspace.createdAt).getTime() < WEEK_MS);
        const inProgress = count(requirements, (r) => r.status === 'PROCESSING' || r.status === 'READY');
        const pendingReview = count(changes, (c) => c.status === 'PLAN_READY' || c.status === 'GENERATED');
        const failedBuilds = count(builds, (b) => b.result && b.result !== 'SUCCESS');
        return [
          { value: d.length, label: 'Workspaces', sub: '↑ ' + newThisWeek + ' new this week', tone: 'blue', subTone: 'up', icon: 'folder', open: this.go('workspaces') },
          { value: requirements.length, label: 'Requirements', sub: '↑ ' + inProgress + ' in progress', tone: 'violet', subTone: 'up', icon: 'doc', open: this.go('requirements') },
          { value: designs.length, label: 'Screens', sub: count(designs, (s) => s.status === 'APPROVED') + ' approved', tone: 'green', subTone: 'good', icon: 'monitor', open: this.go('designer') },
          { value: changes.length, label: 'Code Changes', sub: '↓ ' + pendingReview + ' pending review', tone: 'amber', subTone: 'warn', icon: 'code', open: this.go('changes') },
          { value: builds.length, label: 'Builds', sub: '↓ ' + failedBuilds + ' failed', tone: 'red', subTone: 'bad', icon: 'flask', open: this.go('changes') }
        ].map((t) => Object.assign(t, {
          css: 'factory-ov2-tile factory-ov2-tile-' + t.tone, iconCss: 'factory-ov2-tile-icon factory-ov2-icon-' + t.tone,
          iconClass: 'factory-nav-icon factory-ico-' + t.icon, subCss: 'factory-ov2-sub factory-ov2-' + t.subTone
        }));
      });

      // Recent workspaces: the four most recently imported or created
      this.recentWorkspaces = ko.pureComputed(() => data().map((d) => {
        const w = d.workspace;
        const job = d.imports.length ? d.imports[0] : null;
        const updated = job ? (job.finishedAt || job.createdAt) : w.createdAt;
        return {
          id: w.id, name: w.name, bank: w.bankName, version: w.obdxVersion, location: w.svnUrl || '',
          status: CODE[dashboard.codeState(d).key], updated: dashboard.when(updated), at: updated,
          open: dashboard.open('code', w.id),
          menu: (event) => dashboard.open(event.detail.selectedValue, w.id)()
        };
      }).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 4));

      // Setup New Workspace: the source is checked and the workspace created on the Workspaces page.
      this.sourceKind = ko.observable('folder');
      this.localEnabled = ko.observable(false);
      this.sourceTabs = [{ value: 'folder', label: 'Folder on this computer' }, { value: 'url', label: 'SVN server (URL)' }].map((t) => Object.assign(t, {
        css: ko.pureComputed(() => 'factory-seg' + (this.sourceKind() === t.value ? ' factory-seg-on' : '')),
        disabled: ko.pureComputed(() => t.value === 'folder' && !this.localEnabled()),
        pick: () => this.sourceKind(t.value)
      }));
      this.sourceValue = ko.observable('');
      this.sourceInput = (event) => this.sourceValue(event.target.value);
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

      // Recent requirements
      this.recentRequirements = ko.pureComputed(() => data().reduce((list, d) => list.concat(d.requirements.map((r) => ({
        id: shortId(r.id), title: r.title, workspace: d.workspace.name, type: r.fileName ? 'Document' : 'Described',
        status: REQUIREMENT[r.status] || pill(r.status, 'grey'),
        updated: new Date(r.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
        at: r.updatedAt, open: dashboard.open('requirements', d.workspace.id)
      }))), []).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 4));

      // Development progress, for all workspaces or one
      this.progressWorkspace = ko.observable('all');
      const progressOptions = ko.observableArray([{ value: 'all', label: 'All workspaces' }]);
      ko.computed(() => progressOptions([{ value: 'all', label: 'All workspaces' }]
        .concat(data().map((d) => ({ value: d.workspace.id, label: d.workspace.name })))));
      this.progressProvider = new ArrayDataProvider(progressOptions, { keyAttributes: 'value' });
      this.progress = ko.pureComputed(() => {
        const picked = this.progressWorkspace();
        const d = data().filter((e) => picked === 'all' || e.workspace.id === picked);
        const requirements = all(d, 'requirements');
        const designs = all(d, 'designs');
        const changes = all(d, 'changes');
        const builds = all(d, 'builds');
        const row = (label, icon, tone, done, total) => ({
          label: label, iconClass: 'factory-nav-icon factory-ico-' + icon, iconCss: 'factory-ov2-prog-icon factory-ov2-icon-' + tone,
          barCss: 'factory-ov2-bar-fill factory-ov2-fill-' + tone, text: done + ' / ' + total, width: (total ? Math.round(100 * done / total) : 0) + '%'
        });
        return [
          row('Requirements', 'doc', 'blue', count(requirements, (r) => r.status === 'APPROVED'), requirements.length),
          row('Screens', 'monitor', 'green', count(designs, (s) => s.status === 'APPROVED'), designs.length),
          row('Code Changes', 'code', 'amber', count(changes, (c) => c.status === 'DELIVERED' || c.status === 'CLOSED'), changes.length),
          row('Builds passed', 'flask', 'violet', count(builds, (b) => b.result === 'SUCCESS'), builds.length)
        ];
      });

      // Recent Jenkins builds of changes
      this.recentBuilds = ko.pureComputed(() => all(data(), 'builds').map((b) => {
        const ok = b.result === 'SUCCESS';
        const running = !b.result || !b.finishedAt;
        return {
          number: b.buildNumber ? '#' + b.buildNumber : '–', workspace: b.workspaceName,
          branch: b.branchUrl ? b.branchUrl.split('/').slice(-2).join('/') : 'patch',
          status: running ? 'Running' : (ok ? 'Success' : 'Failed'),
          statusCss: 'factory-ov2-build ' + (running ? 'factory-ov2-build-run' : (ok ? 'factory-ov2-build-ok' : 'factory-ov2-build-bad')),
          iconClass: 'factory-nav-icon ' + (running ? 'factory-ico-clock' : (ok ? 'factory-ico-check' : 'factory-ico-x')),
          duration: dashboard.duration(b.startedAt, b.finishedAt), completed: dashboard.when(b.finishedAt), at: b.finishedAt || b.startedAt,
          open: dashboard.open('changes', b.workspaceId)
        };
      }).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 4));

      // Recent activity across workspaces
      this.activity = ko.pureComputed(() => {
        const items = [];
        const add = (tone, icon, text, workspace, at, open) => items.push({
          dotCss: 'factory-ov2-dot factory-ov2-icon-' + tone, iconClass: 'factory-nav-icon factory-ico-' + icon,
          text: text, workspace: '[' + workspace + ']', at: at, when: dashboard.ago(at), open: open
        });
        data().forEach((d) => {
          const w = d.workspace;
          add('amber', 'folder', 'Workspace "' + w.name + '" created', w.name, w.createdAt, dashboard.open('workspaces'));
          d.imports.forEach((j) => add(j.status === 'FAILED' ? 'red' : 'blue', 'cube',
            j.status === 'FAILED' ? 'Code import failed' : (j.status === 'SUCCEEDED' ? 'Code indexed at r' + j.toRevision : 'Code import started'),
            w.name, j.finishedAt || j.createdAt, dashboard.open('code', w.id)));
          d.requirements.forEach((r) => add('violet', 'doc', 'Requirement "' + r.title + '" ' + (r.status === 'APPROVED' ? 'approved' : 'updated'),
            w.name, r.updatedAt, dashboard.open('requirements', w.id)));
          d.designs.forEach((s) => add('green', 'monitor', 'Screen "' + s.name + '" ' + (s.status === 'APPROVED' ? 'approved' : 'updated'),
            w.name, s.updatedAt, dashboard.open('designer', w.id)));
          d.changes.forEach((c) => add('blue', 'code', 'Change "' + c.title + '" ' + c.status.toLowerCase().replace(/_/g, ' '),
            w.name, c.updatedAt, dashboard.open('changes', w.id)));
          d.builds.forEach((b) => add(b.result === 'SUCCESS' ? 'green' : 'red', b.result === 'SUCCESS' ? 'check' : 'x',
            'Build ' + (b.buildNumber ? '#' + b.buildNumber + ' ' : '') + (b.result === 'SUCCESS' ? 'completed successfully' : (b.result ? 'failed' : 'started')),
            w.name, b.finishedAt || b.startedAt, dashboard.open('changes', w.id)));
        });
        return items.filter((i) => i.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 5);
      });

      this.connected = () => {
        accUtils.announce('Overview page loaded.');
        document.title = 'Overview';
        dashboard.load();
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
