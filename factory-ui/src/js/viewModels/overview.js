/*
 * Overview page: every workspace the user can see, with its code index, requirements, screens and changes, what needs
 * attention and what changed recently. Built from the same endpoints the other pages use; nothing here is stored.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/workspaceSelection', 'ojs/ojbutton'],
  function (ko, accUtils, api, session, workspaceSelection) {
    const OPEN_CHANGES = ['ANALYZING', 'PLAN_READY', 'GENERATING', 'GENERATED'];
    const pill = (text, tone) => ({ text: text, css: 'factory-ov-pill factory-ov-pill-' + tone });
    const STATUS = {
      PROCESSING: pill('Processing', 'blue'), READY: pill('To review', 'amber'), APPROVED: pill('Approved', 'green'), FAILED: pill('Failed', 'red'),
      DRAFT: pill('Draft', 'grey'), IN_REVIEW: pill('In review', 'amber'),
      ANALYZING: pill('Analyzing', 'blue'), PLAN_READY: pill('Plan ready', 'amber'), GENERATING: pill('Generating', 'blue'),
      GENERATED: pill('Generated', 'amber'), DELIVERED: pill('Delivered', 'green'), CLOSED: pill('Closed', 'grey'), OTHER: pill('', 'grey')
    };

    /** "5 minutes ago", "3 days ago", or the date for anything older than a month. */
    function ago(value) {
      if (!value) {
        return '';
      }
      const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
      const steps = [[60, 'second', 1], [3600, 'minute', 60], [86400, 'hour', 3600], [2592000, 'day', 86400]];
      for (const [limit, unit, size] of steps) {
        if (seconds < limit) {
          const n = Math.max(1, Math.floor(seconds / size));
          return n + ' ' + unit + (n === 1 ? '' : 's') + ' ago';
        }
      }
      return new Date(value).toLocaleDateString();
    }

    const count = (list, test) => list.filter(test).length;
    const settled = (promise) => promise.then((value) => value, () => null);

    function OverviewViewModel() {
      this.loading = ko.observable(true);
      this.error = ko.observable('');
      this.isAdmin = session.isAdmin;
      this.greeting = ko.pureComputed(() => {
        const hour = new Date().getHours();
        const part = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
        const user = session.user();
        return user ? part + ', ' + user.displayName.split(/\s+/)[0] : part;
      });

      const workspaces = ko.observableArray([]);
      this.rows = ko.observableArray([]);
      this.tiles = ko.observableArray([]);
      this.attention = ko.observableArray([]);
      this.activity = ko.observableArray([]);
      this.attentionMore = ko.observable(0);
      this.model = ko.observable(null);
      this.hasWorkspaces = ko.pureComputed(() => workspaces().length > 0);

      const go = (page, workspaceId) => (event) => {
        if (event && event.preventDefault && event.type === 'click') {
          event.preventDefault();
        }
        if (workspaceId) {
          workspaceSelection.selectedId(workspaceId);
        }
        window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
      };
      this.go = (page) => go(page);

      // Where to start: shown until the first workspace has code, screens and a change.
      this.steps = [
        { title: 'Add a workspace', text: 'Point the factory at the bank\'s SVN code.', icon: 'factory-nav-icon factory-ico-folder', open: go('workspaces') },
        { title: 'Check the Project Profile', text: 'Confirm what was detected in the code.', icon: 'factory-nav-icon factory-ico-profile', open: go('profile') },
        { title: 'Add a requirement', text: 'Upload a BRD or FSD, or describe the change.', icon: 'factory-nav-icon factory-ico-list', open: go('requirements') },
        { title: 'Design the screens', text: 'Lay out and review the screens.', icon: 'factory-nav-icon factory-ico-design', open: go('designer') }
      ];

      const load = () => {
        this.loading(true);
        this.error('');
        const model = settled(api.get('model/status')).then(this.model);
        return api.get('workspaces').then((list) => {
          workspaces(list);
          return Promise.all(list.map((w) => Promise.all([
            settled(api.get('workspaces/' + w.id + '/requirements')),
            settled(api.get('workspaces/' + w.id + '/designs')),
            settled(api.get('workspaces/' + w.id + '/changes')),
            settled(api.get('workspaces/' + w.id + '/index')),
            settled(api.get('workspaces/' + w.id + '/imports'))
          ]).then(([requirements, designs, changes, index, imports]) => ({
            workspace: w, requirements: requirements || [], designs: designs || [], changes: changes || [],
            index: index, lastImport: imports && imports.length > 0 ? imports[0] : null
          }))));
        }).then((data) => {
          this.build(data);
          return model;
        }).catch((e) => this.error(e.message)).finally(() => this.loading(false));
      };
      this.refresh = () => { load(); };

      this.build = (data) => {
        const all = (key) => data.reduce((sum, d) => sum.concat(d[key]), []);
        const requirements = all('requirements');
        const designs = all('designs');
        const changes = all('changes');
        const indexed = count(data, (d) => d.workspace.indexedRevision !== null && d.workspace.indexedRevision !== undefined);
        const attention = [];
        const activity = [];

        this.rows(data.map((d) => {
          const w = d.workspace;
          const importing = d.lastImport && (d.lastImport.status === 'QUEUED' || d.lastImport.status === 'RUNNING');
          const failed = d.lastImport && d.lastImport.status === 'FAILED';
          let code = { text: 'Not imported', tone: 'factory-ov-pill factory-ov-pill-grey' };
          if (importing) {
            code = { text: 'Importing', tone: 'factory-ov-pill factory-ov-pill-blue' };
          } else if (failed) {
            code = { text: 'Import failed', tone: 'factory-ov-pill factory-ov-pill-red' };
          } else if (w.indexedRevision !== null && w.indexedRevision !== undefined) {
            code = { text: 'Indexed r' + w.indexedRevision, tone: 'factory-ov-pill factory-ov-pill-green' };
          }

          if (!importing && (w.indexedRevision === null || w.indexedRevision === undefined)) {
            attention.push({ icon: 'factory-nav-icon factory-ico-alert factory-ov-warn', title: w.name + ': code not imported',
              text: failed ? d.lastImport.message || 'The last import failed.' : 'Import the code so the factory can search and change it.', open: go('code', w.id) });
          }
          d.requirements.forEach((r) => {
            if (r.status === 'FAILED') {
              attention.push({ icon: 'factory-nav-icon factory-ico-alert factory-ov-warn', title: r.title, text: w.name + ': the specification could not be made. Open it to try again.', open: go('requirements', w.id) });
            } else if (r.status === 'READY' && r.openQuestions > 0) {
              attention.push({ icon: 'factory-nav-icon factory-ico-list factory-ov-warn', title: r.title,
                text: w.name + ': ' + r.openQuestions + ' open question' + (r.openQuestions === 1 ? '' : 's') + ' to answer.', open: go('requirements', w.id) });
            }
            activity.push({ kind: 'Requirement', icon: 'factory-nav-icon factory-ico-list', title: r.title, workspace: w.name, at: r.updatedAt, open: go('requirements', w.id), status: r.status });
          });
          d.designs.forEach((s) => {
            if (s.status === 'IN_REVIEW') {
              attention.push({ icon: 'factory-nav-icon factory-ico-design factory-ov-warn', title: s.name, text: w.name + ': screen waiting for review.', open: go('designer', w.id) });
            }
            activity.push({ kind: 'Screen', icon: 'factory-nav-icon factory-ico-design', title: s.name, workspace: w.name, at: s.updatedAt, open: go('designer', w.id), status: s.status });
          });
          d.changes.forEach((c) => {
            if (c.status === 'PLAN_READY') {
              attention.push({ icon: 'factory-nav-icon factory-ico-branch factory-ov-warn', title: c.title, text: w.name + ': the plan is ready for approval.', open: go('changes', w.id) });
            } else if (c.status === 'GENERATED') {
              attention.push({ icon: 'factory-nav-icon factory-ico-branch factory-ov-warn', title: c.title, text: w.name + ': code generated, ready to review and deliver.', open: go('changes', w.id) });
            } else if (c.status === 'FAILED') {
              attention.push({ icon: 'factory-nav-icon factory-ico-alert factory-ov-warn', title: c.title, text: w.name + ': ' + (c.message || 'the change failed.'), open: go('changes', w.id) });
            }
            activity.push({ kind: 'Change', icon: 'factory-nav-icon factory-ico-branch', title: c.title, workspace: w.name, at: c.updatedAt, open: go('changes', w.id), status: c.status });
          });

          return {
            name: w.name,
            bank: w.bankName,
            version: w.obdxVersion,
            code: code,
            files: d.index ? d.index.files.toLocaleString() : '',
            requirements: d.requirements.length,
            screens: d.designs.length,
            approvedScreens: count(d.designs, (s) => s.status === 'APPROVED'),
            openChanges: count(d.changes, (c) => OPEN_CHANGES.indexOf(c.status) >= 0),
            open: go('code', w.id),
            openDesigner: go('designer', w.id)
          };
        }));

        const model = this.model();
        if (this.isAdmin() && model && !model.saved) {
          attention.push({ icon: 'factory-nav-icon factory-ico-chip factory-ov-warn', title: 'Models not chosen yet',
            text: 'The factory is using the models from its settings file. Choose them on the Models page.', open: go('models') });
        }

        const openChanges = count(changes, (c) => OPEN_CHANGES.indexOf(c.status) >= 0);
        this.tiles([
          { value: data.length, label: 'Workspaces', sub: indexed + ' with code indexed', tone: 'factory-ov-tile-icon factory-ov-tone-blue', icon: 'factory-nav-icon factory-ico-folder', open: go('workspaces') },
          { value: requirements.length, label: 'Requirements', sub: count(requirements, (r) => r.status === 'APPROVED') + ' approved · ' + count(requirements, (r) => r.status === 'READY') + ' to review',
            tone: 'factory-ov-tile-icon factory-ov-tone-green', icon: 'factory-nav-icon factory-ico-list', open: go('requirements') },
          { value: designs.length, label: 'Screens', sub: count(designs, (s) => s.status === 'APPROVED') + ' approved · ' + count(designs, (s) => s.status === 'IN_REVIEW') + ' in review',
            tone: 'factory-ov-tile-icon factory-ov-tone-violet', icon: 'factory-nav-icon factory-ico-design', open: go('designer') },
          { value: openChanges, label: 'Open changes', sub: count(changes, (c) => c.status === 'DELIVERED') + ' delivered · ' + count(changes, (c) => c.status === 'FAILED') + ' failed',
            tone: 'factory-ov-tile-icon factory-ov-tone-amber', icon: 'factory-nav-icon factory-ico-branch', open: go('changes') },
          { value: attention.length, label: 'Need attention', sub: attention.length === 0 ? 'Nothing waiting on you' : 'Listed below',
            tone: 'factory-ov-tile-icon ' + (attention.length === 0 ? 'factory-ov-tone-green' : 'factory-ov-tone-red'),
            icon: 'factory-nav-icon ' + (attention.length === 0 ? 'factory-ico-check' : 'factory-ico-alert'), open: () => {
              const target = document.getElementById('attentionCard');
              if (target) { target.scrollIntoView({ behavior: 'smooth' }); }
            } }
        ]);
        this.attention(attention.slice(0, 8));
        this.attentionMore(Math.max(0, attention.length - 8));
        this.activity(activity.filter((a) => a.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8)
          .map((a) => Object.assign(a, { when: ago(a.at), label: a.kind + ' · ' + a.workspace, pill: STATUS[a.status] || STATUS.OTHER })));
      };

      this.modelText = ko.pureComputed(() => {
        const m = this.model();
        if (!m) {
          return '';
        }
        let host = m.baseUrl;
        try { host = new URL(m.baseUrl).host; } catch (e) { /* keep the text */ }
        return m.chatModel + ' on ' + host;
      });

      this.connected = () => {
        accUtils.announce('Overview page loaded.');
        document.title = 'Overview';
        load();
      };
    }

    return OverviewViewModel;
  }
);
