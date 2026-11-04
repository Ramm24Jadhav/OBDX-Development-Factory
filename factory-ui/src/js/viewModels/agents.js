/*
 * Agent Runs page: an auditable record of the AI work the factory did, across the workspaces the user can see. Each run
 * comes from what that work left behind: a requirement's drafted specification, screens generated from a requirement,
 * a change's impact analysis and generated code, build fix rounds, and code imports (embeddings for search).
 * Outcomes are read from the records and their messages: succeeded, partially completed, failed, timed out, quota
 * exhausted, interrupted, running and queued. The factory keeps no run table, so what it does not record (the model of
 * older work, prompt versions, tokens, the time of each step) is said so, never filled in.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/dashboard', '../services/workspaceSelection',
        '../services/pageRequests', '../services/ui', '../services/toast', '../services/dialog', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, dashboard, workspaceSelection, pageRequests, ui, toast, dialog) {
    const AGENTS = {
      requirements: { name: 'Requirements Agent', task: 'Draft specification', icon: 'doc', tone: 'amber' },
      ui: { name: 'UI Agent', task: 'Generate screens', icon: 'monitor', tone: 'violet' },
      analysis: { name: 'Analysis Agent', task: 'Impact analysis', icon: 'branch', tone: 'blue' },
      code: { name: 'Code Generator', task: 'Generate code', icon: 'code', tone: 'violet' },
      debug: { name: 'Debug Agent', task: 'Fix build errors', icon: 'flask', tone: 'blue' },
      indexing: { name: 'Indexing Agent', task: 'Index code', icon: 'cube', tone: 'green' }
    };
    // Outcomes in the shared status categories (ui.status), with this page's words
    const OUTCOMES = {
      succeeded: ui.status('SUCCEEDED', 'Succeeded'),
      partial: ui.status('WARNING', 'Partially completed'),
      failed: ui.status('FAILED', 'Failed'),
      timedout: ui.status('ERROR', 'Timed out'),
      quota: ui.status('FAILED', 'Quota exhausted'),
      interrupted: ui.status('ABORTED', 'Interrupted'),
      running: ui.status('RUNNING', 'Running'),
      queued: ui.status('QUEUED', 'Queued')
    };
    // A planned file's state as a run output
    const FILE_STATE = { GENERATED: 'Written', UNCHANGED: 'Unchanged', FAILED: 'Not written (failed)', PENDING: 'Not written yet' };
    const ORDER = ['running', 'queued', 'failed', 'quota', 'timedout', 'interrupted', 'partial', 'succeeded'];
    // While a run is queued or running, the page reloads the real data this often
    const POLL_MS = 5000;
    const busy = (outcome) => outcome === 'running' || outcome === 'queued';
    const words = (status) => String(status || '').toLowerCase().replace(/_/g, ' ');
    const httpUrl = (url) => (url && /^https?:\/\//i.test(url) ? url : '');
    const hash = (text) => {
      let h = 0;
      for (let i = 0; i < text.length; i++) {
        h = (h * 31 + text.charCodeAt(i)) >>> 0;
      }
      return ('0000' + (h % 10000)).slice(-4);
    };
    // Why a run stopped, from the message the factory wrote (the model gateway's and the jobs' own words)
    const cause = (message) => {
      const m = String(message || '');
      if (/daily limit|rate limit|tokens per day|quota/i.test(m)) {
        return 'quota';
      }
      if (/did not answer within|timed out|time-?out/i.test(m)) {
        return 'timedout';
      }
      if (/server restarted|interrupted/i.test(m)) {
        return 'interrupted';
      }
      return '';
    };
    const shortWhen = (value) => new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const durationText = (ms) => {
      const s = Math.max(0, Math.round(ms / 1000));
      return s >= 3600 ? Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm' : s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's';
    };

    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const copy = (text) => ui.copy(text).then(() => toast.success('Copied ' + text), () => toast.error('Could not copy. Select the text and copy it instead.'));

    function AgentsViewModel() {
      this.errorMessage = dashboard.error;
      this.loading = dashboard.loading;
      this.isAdmin = session.isAdmin;
      const chatModel = ko.pureComputed(() => (dashboard.model() ? dashboard.model().chatModel : ''));
      const embeddingModel = ko.pureComputed(() => (dashboard.model() ? dashboard.model().embeddingModel : ''));
      // Starting work again: the result is a toast, and the list reloads to show the new state
      const again = (request, what) => request.then(() => { toast.success(what); dashboard.load(); }).catch((error) => toast.error(error.message));
      // Links to the record a run read or wrote, opened on its own page
      const link = (kind, label, workspaceId, open) => ({ kind: kind, label: label, go: () => { workspaceSelection.selectedId(workspaceId); open(); } });
      const openRequirement = (r, w) => link('Requirement', r.title, w.id, () => { pageRequests.requirement(r.id); navigate('requirements'); });
      const openChange = (c, w, page, kind) => link(kind, c.title, w.id, () => { pageRequests.change(c.id); navigate(page); });

      // Every run, newest first
      this.runs = ko.pureComputed(() => {
        const runs = [];
        const add = (r) => runs.push(r);
        dashboard.data().forEach((d) => {
          const w = d.workspace;
          const can = (permission) => session.can(w.id, permission);
          d.requirements.forEach((r) => {
            const outcome = r.status === 'PROCESSING' ? 'running' : r.status === 'FAILED' ? (cause(r.message) || 'failed') : 'succeeded';
            add({
              key: 'req' + r.id, agent: 'requirements', task: 'Draft specification: ' + r.title, workspace: w.name, workspaceId: w.id,
              outcome: outcome, started: r.createdAt, finished: r.status === 'PROCESSING' ? null : r.updatedAt, approx: true,
              requirement: r.title, requirementId: r.id, message: r.message || '', page: 'requirements', model: chatModel(),
              reason: r.status === 'FAILED' ? (r.message || 'The draft failed; the factory kept no message.') : '',
              events: [{ at: r.createdAt, text: 'Document added: ' + (r.fileName || r.title) },
                { at: r.updatedAt, text: (r.status === 'PROCESSING' ? 'Drafting' : 'Status ' + words(r.status)) + (r.message ? ': ' + r.message : '')
                  + (r.status === 'PROCESSING' ? '' : ' (' + r.openQuestions + ' open questions)'), last: true }],
              inputs: [{ kind: 'Document', label: r.fileName || 'Text entered on the Requirements page' }],
              outputs: r.status === 'PROCESSING' || r.status === 'FAILED' ? [] : [openRequirement(r, w)].concat([{ kind: 'Specification', label: 'Version ' + (r.currentVersion || 1) + ', ' + r.openQuestions + ' open questions' }]),
              retry: r.status === 'FAILED' ? { label: 'Retry', allowed: can('EDIT_REQUIREMENTS'), why: 'Needs the right to edit requirements in this workspace.',
                run: () => again(api.post('requirements/' + r.id + '/retry'), 'The specification draft started again.') } : null,
              notRecorded: 'A specification draft keeps its latest status and message, not a step-by-step log or the time of each step.'
            });
          });
          // Screens generated from a requirement, one run per requirement
          const byRequirement = {};
          d.designs.filter((s) => s.requirementId).forEach((s) => { (byRequirement[s.requirementId] = byRequirement[s.requirementId] || []).push(s); });
          Object.keys(byRequirement).forEach((rid) => {
            const list = byRequirement[rid].slice().sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
            const req = d.requirements.find((r) => r.id === rid);
            add({
              key: 'ui' + rid, agent: 'ui', task: 'Generate screens for ' + (req ? req.title : 'a requirement'), workspace: w.name, workspaceId: w.id,
              outcome: 'succeeded', started: list[0].updatedAt, finished: null, approx: true, requirement: req ? req.title : '', requirementId: rid,
              message: list.length + ' screens designed', page: 'studio', model: chatModel(), reason: '',
              events: list.map((s) => ({ at: s.updatedAt, text: s.name + ': version ' + s.currentVersion + ', ' + words(s.status) + ' (last update)' })),
              inputs: req ? [openRequirement(req, w)] : [],
              outputs: list.map((s) => link('Design', s.name + ' (v' + s.currentVersion + ', ' + words(s.status) + ')', w.id, () => { pageRequests.design(s.id); navigate('studio'); })),
              retry: null,
              notRecorded: 'Screen generation keeps each screen\'s latest version and status, so the times are the last updates and the run has no duration.'
            });
          });
          d.changeDetails.forEach((c) => {
            const req = d.requirements.find((r) => r.id === c.requirementId);
            const reqLink = req ? [openRequirement(req, w)] : [];
            const analysisOutcome = c.status === 'ANALYZING' ? 'running' : (!c.plan && c.status === 'FAILED') ? (cause(c.message) || 'failed') : 'succeeded';
            add({
              key: 'an' + c.id, agent: 'analysis', task: 'Impact analysis: ' + c.title, workspace: w.name, workspaceId: w.id, changeId: c.id,
              outcome: analysisOutcome, started: c.createdAt, finished: c.status === 'ANALYZING' ? null : (c.planApprovedAt || c.updatedAt), approx: true,
              requirement: req ? req.title : '', requirementId: c.requirementId, message: c.plan ? c.plan.summary : (c.message || ''), page: 'impact', by: c.createdBy,
              model: chatModel(), reason: analysisOutcome !== 'succeeded' && analysisOutcome !== 'running' ? (c.message || 'The analysis failed; the factory kept no message.') : '',
              planReview: !!c.plan,
              events: [{ at: c.createdAt, text: 'Change requested' + (c.createdBy ? ' by ' + c.createdBy : '') }]
                .concat(c.planApprovedAt ? [{ at: c.planApprovedAt, text: 'Plan approved' + (c.planApprovedBy ? ' by ' + c.planApprovedBy : '') }] : [])
                .concat(c.message && !c.plan ? [{ at: c.updatedAt, text: c.message, last: true }] : []),
              inputs: reqLink.concat(d.designs.filter((s) => s.requirementId === c.requirementId).map((s) => ({ kind: 'Design', label: s.name + ' (v' + s.currentVersion + ')' }))),
              outputs: c.plan ? [openChange(c, w, 'impact', 'Plan'), { kind: 'Planned files', label: c.plan.items.length + ' file(s), ' + (c.plan.risks || []).length + ' risk(s)' }] : [],
              retry: ['PLAN_READY', 'FAILED'].indexOf(c.status) >= 0 && !(c.status === 'FAILED' && c.plan) ? { label: c.status === 'FAILED' ? 'Retry' : 'Analyze again',
                allowed: can('MANAGE_CODE'), why: 'Needs the right to manage code in this workspace.',
                confirm: c.status === 'PLAN_READY' ? 'The plan waiting for approval is replaced by a new one.' : '',
                run: () => again(api.post('changes/' + c.id + '/analyze'), 'The impact analysis started again.') } : null,
              notRecorded: 'The analysis keeps its plan, its revisions and the change\'s latest message. The searches it ran and the time of each step are not recorded.'
            });
            if (c.planApprovedAt) {
              const written = c.files.filter((f) => f.status === 'GENERATED' || f.status === 'UNCHANGED');
              const unwritten = c.files.filter((f) => f.status === 'PENDING' || f.status === 'FAILED');
              const generating = c.status === 'GENERATING';
              const stopped = cause(c.message);
              const outcome = generating ? 'running' : !unwritten.length && c.status !== 'FAILED' ? 'succeeded'
                : written.length ? 'partial' : (stopped || 'failed');
              add({
                key: 'cg' + c.id, agent: 'code', task: 'Generate code: ' + c.title, workspace: w.name, workspaceId: w.id, changeId: c.id,
                outcome: outcome, started: c.planApprovedAt, finished: generating ? null : c.updatedAt, approx: true,
                requirement: req ? req.title : '', requirementId: c.requirementId, page: 'changes', by: c.planApprovedBy, model: chatModel(),
                message: generating ? (c.message || 'Writing files') : written.length + ' of ' + c.files.length + ' file(s) written',
                reason: outcome === 'succeeded' || generating ? '' : (c.message || unwritten.length + ' planned file(s) are not written.'),
                stopCause: outcome === 'partial' ? stopped : '',
                events: [{ at: c.planApprovedAt, text: 'Plan approved; writing ' + c.files.length + ' files' }]
                  .concat(c.files.map((f) => ({ at: null, text: (f.action === 'create' ? 'Create ' : 'Modify ') + f.path + ': ' + words(f.status)
                    + (f.attempts > 1 ? ', ' + f.attempts + ' attempts' : '') + (f.checkStatus ? '; checks ' + words(f.checkStatus) : '') + (f.checkMessage ? ' - ' + f.checkMessage : '') })))
                  .concat([{ at: c.updatedAt, text: c.message || 'Last update: ' + words(c.status), last: true }]),
                inputs: reqLink.concat([openChange(c, w, 'impact', 'Approved plan')]),
                outputs: [openChange(c, w, 'changes', 'Change')].concat(c.files.map((f) => ({ kind: FILE_STATE[f.status] || words(f.status), label: f.path + (f.linesAdded || f.linesRemoved ? ' +' + f.linesAdded + ' -' + f.linesRemoved : '') }))),
                resume: c.status === 'GENERATED' && unwritten.length && c.buildStatus !== 'BUILDING' ? { label: 'Continue generation', allowed: can('MANAGE_CODE'),
                  why: 'Needs the right to manage code in this workspace.',
                  run: () => again(api.post('changes/' + c.id + '/continue'), 'Generation continues with the ' + unwritten.length + ' file(s) not written yet.') } : null,
                notRecorded: 'The time each file was written is not recorded; each file shows its latest result.'
              });
            }
            c.builds.filter((b) => b.fixedFiles.length).forEach((b) => add({
              key: 'fx' + b.id, agent: 'debug', task: 'Fix build errors (round ' + b.round + '): ' + c.title, workspace: w.name, workspaceId: w.id, changeId: c.id,
              outcome: b.finishedAt ? 'succeeded' : 'running', started: b.startedAt, finished: b.finishedAt, approx: false,
              requirement: req ? req.title : '', requirementId: c.requirementId, page: 'build', model: chatModel(),
              message: b.fixedFiles.length + ' file(s) written again after ' + b.errors.length + ' error(s)', reason: '',
              events: [{ at: b.startedAt, text: b.job + (b.buildNumber ? ' #' + b.buildNumber : '') + ' started (round ' + b.round + ')' }]
                .concat(b.errors.map((e) => ({ at: null, text: 'Error sent to the model: ' + e })))
                .concat(b.fixedFiles.map((f) => ({ at: null, text: 'Written again: ' + f })))
                .concat(b.finishedAt ? [{ at: b.finishedAt, text: 'Round finished: ' + (b.result || 'no result') }] : []),
              inputs: [openChange(c, w, 'build', 'Build round ' + b.round + ' (' + (b.result || 'no result') + ')'), { kind: 'Errors', label: b.errors.length + ' error(s) from Jenkins' }],
              outputs: b.fixedFiles.map((f) => ({ kind: 'Fixed file', label: f })),
              buildLog: b.logExcerpt || '', consoleUrl: httpUrl(b.buildUrl) ? b.buildUrl.replace(/\/?$/, '/console') : '',
              notRecorded: 'The factory keeps an excerpt of the Jenkins console, the errors and the fixed files. The full console is in Jenkins.'
            }));
          });
          d.imports.forEach((j) => {
            const outcome = j.status === 'QUEUED' ? 'queued' : j.status === 'RUNNING' ? 'running' : j.status === 'FAILED' ? (cause(j.message) || 'failed') : 'succeeded';
            add({
              key: 'ix' + j.id, agent: 'indexing', task: 'Index code' + (j.toRevision ? ' at r' + j.toRevision : '') + ' and create embeddings', workspace: w.name, workspaceId: w.id,
              outcome: outcome, started: j.startedAt || j.createdAt, finished: j.finishedAt, approx: false, requirement: '', requirementId: '',
              message: j.message || j.filesIndexed + ' files indexed', page: 'code', model: embeddingModel(), importId: j.id,
              reason: j.status === 'FAILED' ? (j.message || 'The import failed; the factory kept no message.') : '',
              events: [{ at: j.createdAt, text: 'Queued' + (j.toRevision ? ' (r' + (j.fromRevision || 0) + ' to r' + j.toRevision + ')' : '') }]
                .concat(j.startedAt ? [{ at: j.startedAt, text: 'Started' }] : [])
                .concat(j.message ? [{ at: j.finishedAt, text: j.message }] : [])
                .concat(j.finishedAt ? [{ at: j.finishedAt, text: 'Finished: ' + words(j.status) }] : []),
              inputs: [{ kind: 'Repository', label: (w.svnUrl || w.name) + (j.toRevision ? ' r' + (j.fromRevision || 0) + ' to r' + j.toRevision : '') }],
              outputs: j.status === 'QUEUED' ? [] : [{ kind: 'Index', label: j.filesScanned + ' scanned, ' + j.filesIndexed + ' indexed, ' + j.filesRemoved + ' removed' },
                { kind: 'Embeddings', label: j.chunksIndexed + ' pieces, ' + j.embeddingsCreated + ' embeddings' }],
              retry: j.status === 'FAILED' ? { label: 'Retry', allowed: can('MANAGE_CODE'), why: 'Needs the right to manage code in this workspace.',
                run: () => again(api.post('workspaces/' + w.id + '/imports'), 'The code import started again.') } : null,
              notRecorded: 'Import progress is kept as counts and the latest message, not as a line-by-line log or a list of files.'
            });
          });
        });
        return runs.filter((r) => r.started).sort((a, b) => new Date(b.started) - new Date(a.started)).map((r) => {
          const agent = AGENTS[r.agent];
          const ms = r.finished ? new Date(r.finished) - new Date(r.started) : null;
          return Object.assign(r, {
            id: 'RUN-' + new Date(r.started).getFullYear() + '-' + hash(r.key), agentName: agent.name, agentTask: agent.task,
            agentCss: 'factory-ag-agent factory-ov2-icon-' + agent.tone, agentIcon: 'factory-nav-icon factory-ico-' + agent.icon,
            pill: OUTCOMES[r.outcome], startedText: ui.when(r.started), startedShort: shortWhen(r.started),
            finishedText: r.finished ? ui.when(r.finished) + (r.approx ? ' (last update of the record)' : '') : busy(r.outcome) ? 'Not finished yet' : 'Not recorded',
            isLive: busy(r.outcome), buildLog: r.buildLog || '', consoleUrl: r.consoleUrl || '', retry: r.retry || null, resume: r.resume || null,
            by: r.by || '', reason: r.reason || '', stopCause: r.stopCause || '',
            duration: ms === null ? (busy(r.outcome) ? 'Running' : 'Not recorded') : (r.approx ? '~' : '') + durationText(ms)
          });
        });
      });

      // Filters: search, outcome (tabs), agent, workspace, requirement and the date started
      this.tab = ko.observable('all');
      const count = (o) => this.matching().filter((r) => r.outcome === o).length;
      this.tabs = ko.pureComputed(() => ui.tabs(this.tab, [{ value: 'all', label: 'All', count: this.matching().length }]
        .concat(ORDER.filter((o) => count(o) || o === this.tab()).map((o) => ({ value: o, label: OUTCOMES[o].text, count: count(o) })))));
      this.tabKey = (event) => {
        const keys = this.tabs().map((t) => t.value);
        const at = keys.indexOf(this.tab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.tab(keys[next]);
        const button = document.getElementById('ag-' + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };
      this.search = ko.observable('');
      this.searchInput = ui.value(this.search);
      // Agent takes several values (fx-multiselect); none chosen means all
      this.agentFilter = ko.observableArray([]);
      this.agentOptions = Object.keys(AGENTS).map((k) => ({ value: k, label: AGENTS[k].name + ' (' + AGENTS[k].task.toLowerCase() + ')' }));
      // Workspace: follows the top bar (choosing one here switches the top bar too), or all of them until the top bar
      // changes or the page opens again
      this.workspaceFilter = ko.observable(workspaceSelection.selectedId() || '');
      this.workspaceChange = (event) => {
        const id = event.target.value;
        this.workspaceFilter(id);
        if (id && id !== workspaceSelection.selectedId()) {
          workspaceSelection.selectedId(id);
        }
      };
      this.workspaceOptions = ko.pureComputed(() => dashboard.data().map((d) => ({ id: d.workspace.id, name: d.workspace.name })));
      this.requirementFilter = ko.observable('');
      this.requirementChange = ui.value(this.requirementFilter);
      this.requirementOptions = ko.pureComputed(() => {
        const seen = {};
        this.runs().filter((r) => r.requirementId && (!this.workspaceFilter() || r.workspaceId === this.workspaceFilter()))
          .forEach((r) => { seen[r.requirementId] = r.requirement || r.requirementId; });
        return Object.keys(seen).map((id) => ({ id: id, title: seen[id] })).sort((a, b) => a.title.localeCompare(b.title));
      });
      // Started between (fx-date-range, yyyy-mm-dd)
      this.fromDate = ko.observable('');
      this.toDate = ko.observable('');
      this.resetFilters = () => {
        const el = document.getElementById('runSearch');
        if (el) { el.value = ''; }
        this.search(''); this.agentFilter([]); this.workspaceFilter(''); this.requirementFilter(''); this.fromDate(''); this.toDate('');
        this.tab('all');
      };
      // The runs that match every filter but the outcome tab (the tabs count these)
      this.matching = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        const agents = this.agentFilter() || [];
        return this.runs().filter((r) => (!agents.length || agents.indexOf(r.agent) >= 0)
          && (!this.workspaceFilter() || r.workspaceId === this.workspaceFilter())
          && (!this.requirementFilter() || r.requirementId === this.requirementFilter())
          && (!this.fromDate() || new Date(r.started) >= new Date(this.fromDate() + 'T00:00:00'))
          && (!this.toDate() || new Date(r.started) <= new Date(this.toDate() + 'T23:59:59'))
          && (!text || (r.id + ' ' + r.task + ' ' + r.requirement + ' ' + r.workspace + ' ' + r.agentName + ' ' + r.pill.text + ' ' + r.message).toLowerCase().indexOf(text) >= 0));
      });
      this.visibleRuns = ko.pureComputed(() => this.matching().filter((r) => this.tab() === 'all' || r.outcome === this.tab()));
      this.filtered = ko.pureComputed(() => this.visibleRuns().length !== this.runs().length);
      this.pager = ui.pages(this.visibleRuns, 10, [10, 25, 50]);
      this.selectedKey = ko.observable(null);
      const pickRun = (key) => { this.selectedKey(key); this.detailTab('timeline'); };
      // Checked runs (client side)
      this.checked = ko.observableArray([]);
      this.allSelected = ko.pureComputed(() => this.pager.rows().length > 0 && this.pager.rows().every((r) => this.checked.indexOf(r.key) >= 0));
      this.toggleAll = (event) => {
        const keys = this.pager.rows().map((r) => r.key);
        this.checked(event.target.checked ? Array.from(new Set(this.checked().concat(keys))) : this.checked().filter((k) => keys.indexOf(k) < 0));
      };
      this.selectedText = ko.pureComputed(() => (this.checked().length ? ' · ' + this.checked().length + ' selected' : ''));
      const toggleKey = (key) => { if (this.checked.indexOf(key) >= 0) { this.checked.remove(key); } else { this.checked.push(key); } };
      this.bulkText = ko.pureComputed(() => this.checked().length + (this.checked().length === 1 ? ' run selected' : ' runs selected'));
      this.copyIds = () => {
        const ids = this.runs().filter((r) => this.checked.indexOf(r.key) >= 0).map((r) => r.id);
        ui.copy(ids.join('\n')).then(() => toast.success('Copied ' + ids.length + (ids.length === 1 ? ' run ID.' : ' run IDs.')),
          () => toast.error('Could not copy. Select the text and copy it instead.'));
      };
      this.clearChecked = () => this.checked([]);
      // Keyboard on the runs table: arrows or J/K move, Enter opens the details, X checks the row
      this.keys = ui.tableKeys(ko.pureComputed(() => this.rows()), { open: (row) => row.pick(), toggle: (row) => toggleKey(row.key) });
      this.rows = ko.pureComputed(() => this.pager.rows().map((r, i) => Object.assign({}, r, {
        css: ko.pureComputed(() => 'factory-clickable' + (this.selectedKey() === r.key ? ' is-selected' : '') + (this.keys.cursor() === i ? ' is-cursor' : '')),
        pick: () => { this.keys.cursor(i); pickRun(r.key); },
        sub: r.workspace + (r.requirement && r.task.indexOf(r.requirement) < 0 ? ' · ' + r.requirement : ''),
        isSelected: ko.pureComputed(() => this.checked.indexOf(r.key) >= 0),
        toggle: (event) => { if (event.target.checked) { this.checked.push(r.key); } else { this.checked.remove(r.key); } },
        stop: (event) => event.stopPropagation(),
        menuItems: [{ value: 'details', label: 'View details' }, { value: 'log', label: 'View log' }, { value: 'open', label: 'Open result' }, { value: 'copy', label: 'Copy run ID' }],
        action: (event) => {
          const value = event.detail.value;
          if (value === 'details') {
            pickRun(r.key);
          } else if (value === 'log') {
            pickRun(r.key);
            this.logOpen(true);
          } else if (value === 'open') {
            open(r);
          } else if (value === 'copy') {
            copy(r.id);
          }
        }
      })));

      // The selected run
      this.run = ko.pureComputed(() => this.runs().find((r) => r.key === this.selectedKey()) || (this.selectedKey() === 'none' ? null : this.visibleRuns()[0] || null));
      this.closeRun = () => this.selectedKey('none');
      this.detailTab = ko.observable('timeline');
      this.detailTabs = ui.tabs(this.detailTab, [
        { value: 'timeline', label: 'Timeline' }, { value: 'io', label: 'Inputs & outputs' }, { value: 'details', label: 'Details' },
        { value: 'related', label: 'Related', count: ko.pureComputed(() => this.related().length) }
      ]);
      this.detailKey = (event) => {
        const keys = this.detailTabs.map((t) => t.value);
        const at = keys.indexOf(this.detailTab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.detailTab(keys[next]);
        const button = document.getElementById('agd-' + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };

      // Records loaded for the selected run: the plan's revisions and comments (analysis), and for administrators the
      // audit events of the run's workspace. Loaded once per run or workspace; a failure leaves them out and says so.
      this.planReview = ko.observable(null);
      this.audit = ko.observable(null);
      this.extraNote = ko.observable('');
      let reviewFor = null;
      let auditFor = null;
      ko.computed(() => {
        const r = this.run();
        if (!r) {
          return;
        }
        if (r.agent === 'analysis' && r.changeId && reviewFor !== r.changeId) {
          reviewFor = r.changeId;
          this.planReview(null);
          api.get('changes/' + r.changeId + '/plan-review').then((v) => { if (reviewFor === r.changeId) { this.planReview(v); } })
            .catch(() => this.extraNote('The plan\'s revisions could not be loaded.'));
        }
        if (session.isAdmin() && auditFor !== r.workspaceId) {
          auditFor = r.workspaceId;
          this.audit(null);
          api.get('admin/audit?workspaceId=' + encodeURIComponent(r.workspaceId) + '&limit=500').then((list) => { if (auditFor === r.workspaceId) { this.audit(list); } })
            .catch(() => this.extraNote('The audit trail could not be loaded.'));
        }
      });
      // Audit events that name the run's record: its change or requirement title, or the import job
      const auditEvents = (r) => {
        const list = this.audit() || [];
        const title = r.changeId ? r.task.replace(/^[^:]+: /, '') : r.requirement;
        return list.filter((e) => e.workspaceId === r.workspaceId && ((r.importId && e.target === r.importId)
          || (r.agent !== 'indexing' && title && (e.target === title || e.detail === r.changeId))))
          .filter((e) => r.agent === 'requirements' ? /^REQUIREMENT_/.test(e.action) : r.agent === 'ui' ? /^(DESIGN_|REQUIREMENT_APPROVED)/.test(e.action)
            : r.agent === 'analysis' ? /^CHANGE_(CREATED|PLAN_)/.test(e.action) : r.agent === 'code' ? /^CHANGE_(PLAN_APPROVED|FILE_EDITED|DELIVERED|CLOSED)/.test(e.action)
              : r.agent === 'debug' ? /^CHANGE_BUILD_/.test(e.action) : /^IMPORT_/.test(e.action))
          .map((e) => ({ at: e.at, text: words(e.action) + (e.detail && e.detail !== r.changeId ? ': ' + e.detail : ''), by: e.username || '', source: 'Audit' }));
      };
      // The timeline: every event with a real time, oldest first; events the factory kept without a time follow
      this.timeline = ko.pureComputed(() => {
        const r = this.run();
        if (!r) {
          return [];
        }
        const review = this.planReview();
        const fromReview = r.agent === 'analysis' && review && reviewFor === r.changeId
          ? review.revisions.map((v) => ({ at: v.createdAt, text: 'Plan revision ' + v.revision + ' (' + words(v.origin) + ')' + ' – ' + (v.plan && v.plan.items ? v.plan.items.length : 0) + ' file(s)', by: v.createdBy, source: 'Plan' }))
            .concat(review.comments.map((m) => ({ at: m.createdAt, text: words(m.kind) + (m.revision ? ' on revision ' + m.revision : '') + (m.text ? ': ' + m.text : ''), by: m.author, source: 'Review' })))
          : [];
        const timed = r.events.filter((e) => e.at).map((e) => Object.assign({ source: 'Record', by: '' }, e)).concat(fromReview, auditEvents(r))
          .sort((a, b) => new Date(a.at) - new Date(b.at));
        const untimed = r.events.filter((e) => !e.at).map((e) => Object.assign({ source: 'Record', by: '' }, e));
        return timed.concat(untimed).map((e) => ({
          when: e.at ? ui.when(e.at) : 'Time not recorded', text: e.text, by: e.by ? 'by ' + e.by : '', source: e.source,
          dotCss: 'fx-timeline-dot' + (e.source === 'Audit' ? ' factory-ag-dot-audit' : e.at ? ' fx-timeline-dot--success' : '')
        }));
      });
      this.inputs = ko.pureComputed(() => (this.run() ? this.run().inputs.map((x) => Object.assign({ go: null }, x)) : []));
      this.outputs = ko.pureComputed(() => (this.run() ? this.run().outputs.map((x) => Object.assign({ go: null }, x)) : []));
      this.modelText = ko.pureComputed(() => {
        const r = this.run();
        return 'Not recorded for this run.' + (r && r.model ? ' In use now: ' + r.model + '.' : '');
      });
      this.stopText = ko.pureComputed(() => {
        const r = this.run();
        if (!r || !r.stopCause) {
          return '';
        }
        return r.stopCause === 'quota' ? 'Stopped by the model\'s limit (quota exhausted).' : r.stopCause === 'timedout' ? 'Stopped because the model timed out.' : 'Stopped because the server restarted.';
      });

      // The log sheet: the run's recorded events, the build console excerpt
      this.logOpen = ko.observable(false);
      this.openLog = () => this.logOpen(true);
      this.logHeading = ko.pureComputed(() => (this.run() ? 'Log: ' + this.run().id : 'Log'));
      this.logSubtitle = ko.pureComputed(() => (this.run() ? this.run().task : ''));
      this.logText = ko.pureComputed(() => this.timeline().map((e) => '[' + e.when + '] ' + (e.source !== 'Record' ? e.source + ': ' : '') + e.text + (e.by ? ' (' + e.by + ')' : '')).join('\n') || 'No events for this run.');
      // Runs for the same requirement (or, without one, the same workspace)
      this.related = ko.pureComputed(() => {
        const r = this.run();
        if (!r) {
          return [];
        }
        return this.runs().filter((x) => x.key !== r.key && x.workspaceId === r.workspaceId && (r.requirementId ? x.requirementId === r.requirementId : !x.requirementId))
          .slice(0, 12).map((x) => Object.assign({}, x, { pick: () => pickRun(x.key) }));
      });

      // Actions: open the result; retry or continue only where the server takes it and the user may
      const open = (r) => { workspaceSelection.selectedId(r.workspaceId); if (r.changeId) { pageRequests.change(r.changeId); } if (r.agent === 'requirements') { pageRequests.requirement(r.requirementId); } if (r.page === 'code') { pageRequests.codeTab('index'); } navigate(r.page); };
      this.viewResult = () => { if (this.run()) { open(this.run()); } };
      this.resultLabel = ko.pureComputed(() => {
        const page = this.run() ? this.run().page : '';
        return { requirements: 'Open the requirement', studio: 'Open the Design Studio', impact: 'Open the plan', changes: 'Open the change', build: 'Open the build', code: 'Open Code › Index' }[page] || 'Open the result';
      });
      const action = (kind) => ko.pureComputed(() => (this.run() ? this.run()[kind] : null));
      this.retryAction = action('retry');
      this.resumeAction = action('resume');
      const perform = (a) => {
        if (!a || !a.allowed) {
          return;
        }
        if (a.confirm) {
          dialog.confirm({ title: a.label + '?', message: a.confirm, confirmLabel: a.label }).then((ok) => { if (ok) { a.run(); } });
        } else {
          a.run();
        }
      };
      this.retry = () => perform(this.retryAction());
      this.resume = () => perform(this.resumeAction());
      this.moreItems = [{ value: 'log', label: 'View log' }, { value: 'copy', label: 'Copy run ID' }, { value: 'workspace', label: 'Open the workspace' }];
      this.moreAction = (event) => {
        const value = event.detail.value;
        const r = this.run();
        if (!r) {
          return;
        }
        if (value === 'log') {
          this.logOpen(true);
        } else if (value === 'copy') {
          copy(r.id);
        } else if (value === 'workspace') {
          workspaceSelection.selectedId(r.workspaceId);
          navigate('workspaces');
        }
      };
      // New Agent Task: a split button (design system .fx-split); each kind of work starts on its own page
      this.taskMenu = ui.menu();
      this.taskItems = [
        { label: 'Draft a specification from a BRD/FSD', icon: 'doc', page: 'requirements' },
        { label: 'Plan a change (impact analysis)', icon: 'branch', page: 'changes' },
        { label: 'Change a screen with AI', icon: 'design', page: 'studio' },
        { label: 'Import and index code', icon: 'code', page: 'code', codeTab: 'index' }
      ].map((t) => Object.assign(t, { iconClass: 'factory-nav-icon factory-ico-' + t.icon, run: () => { this.taskMenu.close(); if (t.codeTab) { pageRequests.codeTab(t.codeTab); } navigate(t.page); } }));
      this.newTaskDefault = () => navigate('requirements');

      // Live updates: while a run is queued or running, reload the real data every few seconds; stop when nothing runs
      // or the page is left. A run that finishes meanwhile shows a toast.
      this.anyBusy = ko.pureComputed(() => this.runs().some((r) => busy(r.outcome)));
      let attached = false;
      let timer = null;
      let lastOutcome = null;
      const schedule = () => {
        window.clearTimeout(timer);
        timer = null;
        if (attached && this.anyBusy()) {
          timer = window.setTimeout(() => dashboard.load().then(schedule), POLL_MS);
        }
      };
      const watchFinished = (runs) => {
        if (attached && lastOutcome) {
          runs.filter((r) => !busy(r.outcome) && busy(lastOutcome[r.key])).forEach((r) => {
            if (r.outcome === 'succeeded') {
              toast.success(r.id + ' finished: ' + r.task);
            } else {
              toast.error(r.id + ' ' + r.pill.text.toLowerCase() + ': ' + r.task);
            }
          });
        }
        lastOutcome = {};
        runs.forEach((r) => { lastOutcome[r.key] = r.outcome; });
      };
      const subscriptions = [];
      this.connected = () => {
        accUtils.announce('Agent Runs page loaded.');
        document.title = 'Agent Runs';
        attached = true;
        lastOutcome = null;
        this.workspaceFilter(workspaceSelection.selectedId() || '');
        subscriptions.push(workspaceSelection.selectedId.subscribe((id) => this.workspaceFilter(id || '')));
        subscriptions.push(this.runs.subscribe(watchFinished));
        subscriptions.push(this.anyBusy.subscribe((value) => { if (value && !timer) { schedule(); } }));
        dashboard.load().then(() => { watchFinished(this.runs()); schedule(); });
      };
      this.disconnected = () => {
        attached = false;
        window.clearTimeout(timer);
        timer = null;
        this.logOpen(false);
        subscriptions.splice(0).forEach((s) => s.dispose());
      };
    }

    return AgentsViewModel;
  }
);
