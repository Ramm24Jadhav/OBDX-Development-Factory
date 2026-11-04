/*
 * Everything the Overview page, the Workspaces page and the notification bell show about the workspaces the user can
 * see: each workspace with its requirements, screens, changes (with their Jenkins builds), code index and imports, plus
 * what needs the user's attention. Loaded from the same endpoints the other pages use; nothing here is stored.
 */
define(['knockout', './api', './session', './workspaceSelection', './preferences', './pageRequests', './ui'], function (ko, api, session, workspaceSelection, preferences, pageRequests, ui) {
  const OPEN_CHANGES = ['ANALYZING', 'PLAN_READY', 'GENERATING', 'GENERATED'];
  // The parts of a workspace's data, by endpoint. A part that could not be loaded is named in the entry's `missing`
  // (pages say so rather than showing it as empty).
  const PARTS = ['requirements', 'designs', 'changes', 'index', 'imports', 'changes/details'];
  const data = ko.observableArray([]);
  const model = ko.observable(null);
  const loading = ko.observable(false);
  const error = ko.observable('');
  let pending = null;

  const settled = (promise) => promise.then((value) => value, () => null);
  const isIndexed = (w) => w.indexedRevision !== null && w.indexedRevision !== undefined;
  // Work the server marked as stopped by a restart (requirements, changes, builds and imports say so in their message)
  const interrupted = (message) => /interrupted/i.test(message || '');
  // The first clause of a server message, for a one-line status ("Impact analysis failed: <model error>" gives
  // "Impact analysis failed"); the whole message stays on the record's own page
  const firstClause = (message) => {
    const text = String(message || '').trim();
    const cut = text.search(/: |\. /);
    const part = cut > 0 ? text.slice(0, cut) : text.replace(/\.$/, '');
    return part.length > 90 ? part.slice(0, 89) + '…' : part;
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

  /** "29 Oct 2026, 10:24" */
  function when(value) {
    return value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: preferences.hour12() }) : '';
  }

  /** "4m 32s" */
  function duration(from, to) {
    if (!from || !to) {
      return '';
    }
    const seconds = Math.max(0, Math.round((new Date(to) - new Date(from)) / 1000));
    return seconds >= 60 ? Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's' : seconds + 's';
  }

  /** Where a workspace's code stands: imported, importing, failed or not imported. */
  function codeState(entry) {
    const job = entry.imports.length > 0 ? entry.imports[0] : null;
    if (job && (job.status === 'QUEUED' || job.status === 'RUNNING')) {
      return { key: 'importing', text: 'In Progress', tone: 'amber', icon: 'clock' };
    }
    if (job && job.status === 'FAILED') {
      return { key: 'failed', text: 'Check Required', tone: 'red', icon: 'alert' };
    }
    if (isIndexed(entry.workspace)) {
      return { key: 'ready', text: 'Completed', tone: 'green', icon: 'check' };
    }
    return { key: 'new', text: 'Not imported', tone: 'grey', icon: 'clock' };
  }

  function loadWorkspace(w) {
    const missing = [];
    // Every change's detail (its files and builds) comes in one request, not one per change
    return Promise.all(PARTS.map((part) => api.get('workspaces/' + w.id + '/' + part)
      .catch(() => { missing.push(part === 'changes/details' ? 'builds' : part); return null; })))
      .then(([requirements, designs, changes, index, imports, changeDetails]) => {
        const details = (changeDetails || []).filter(Boolean);
        return {
          workspace: w,
          requirements: requirements || [],
          designs: designs || [],
          changes: changes || [],
          changeDetails: details,
          builds: details.reduce((all, d) => all.concat((d.builds || []).map((b) => Object.assign({}, b, {
            changeId: d.id, changeTitle: d.title, branchUrl: d.branchUrl, workspaceName: w.name, workspaceId: w.id
          }))), []),
          index: index,
          imports: imports || [],
          missing: missing
        };
      });
  }

  /** Loads (or reloads) everything. Calls made while a load runs share it. */
  function load() {
    if (pending) {
      return pending;
    }
    loading(true);
    error('');
    pending = Promise.all([api.get('workspaces'), settled(api.get('model/status'))])
      .then(([list, status]) => {
        model(status);
        return Promise.all(list.map(loadWorkspace));
      })
      .then((entries) => { data(entries); return entries; })
      .catch((e) => { error(e.message); return []; })
      .finally(() => { loading(false); pending = null; });
    return pending;
  }

  /** Opens a page, first selecting the workspace when one is given. */
  function open(page, workspaceId) {
    return (event) => {
      if (event && event.preventDefault && event.type === 'click') {
        event.preventDefault();
      }
      if (workspaceId) {
        workspaceSelection.selectedId(workspaceId);
      }
      window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    };
  }

  /**
   * Opens one record on its page: request names the page request the receiving page reads once it has loaded
   * (requirement, change, design or studio, see pageRequests) and id the record.
   */
  function openRecord(page, workspaceId, request, id) {
    const go = open(page, workspaceId);
    return (event) => {
      if (request && id) {
        pageRequests[request](id);
      }
      go(event);
    };
  }

  /** The latest Jenkins build of a change (its detail), or null */
  function latestBuild(detail) {
    const builds = (detail && detail.builds) || [];
    return builds.slice().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] || null;
  }

  // The four steps of a requirement's workflow (Home and the Requirements list)
  const STEPS = ['Spec', 'Screens', 'Plan', 'Code'];

  /**
   * Where a requirement's workflow stands, from its status, its screens and its latest change (designs: the
   * workspace's design summaries; changes: its change details): step (1-4), a status chip, the next thing to do, the
   * permission that needs and who does it otherwise, what opens (open; target and place name it), a short action
   * label (act), and finished when the latest change is delivered or closed. stepText and steps describe the four
   * steps for display.
   */
  function workflow(r, designs, changes, workspaceId) {
    const own = designs.filter((s) => s.requirementId === r.id);
    const c = changes.filter((x) => x.requirementId === r.id).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;
    const openRequirement = openRecord('requirements', workspaceId, 'requirement', r.id);
    const openChange = c ? openRecord('changes', workspaceId, 'change', c.id) : null;
    const approved = own.filter((x) => x.status === 'APPROVED').length;
    let s;
    if (c && (c.status === 'DELIVERED' || c.status === 'CLOSED')) {
      s = { step: 4, finished: true, status: ui.status(c.status, c.status === 'DELIVERED' ? 'Delivered' : 'Closed'), next: '', open: openChange, act: 'Open the change' };
    } else if (r.status === 'PROCESSING') {
      s = { step: 1, status: ui.status('PROCESSING', 'Drafting'), next: 'The spec is being drafted. Open it to follow progress.', open: openRequirement, act: 'Follow progress' };
    } else if (r.status === 'FAILED') {
      s = { step: 1, status: ui.status('FAILED', interrupted(r.message) ? 'Interrupted' : 'Failed'), next: 'Drafting the spec stopped. Open it to try again.',
        perm: 'EDIT_REQUIREMENTS', who: 'an analyst', open: openRequirement, act: 'Try again' };
    } else if (r.status === 'READY' && r.openQuestions > 0) {
      s = { step: 1, status: ui.status('READY', r.openQuestions + ' open question' + (r.openQuestions === 1 ? '' : 's')),
        next: 'Answer the open questions, then approve the spec.', perm: 'EDIT_REQUIREMENTS', who: 'an analyst', open: openRequirement, questions: true, act: 'Answer the questions' };
    } else if (r.status === 'READY') {
      s = { step: 1, status: ui.status('READY', 'Ready for approval'), next: 'Review the spec and approve it.', perm: 'APPROVE', who: 'someone who can approve', open: openRequirement, act: 'Review and approve' };
    } else if (!c) {
      if (!own.length) {
        s = { step: 2, status: ui.status('APPROVED', 'Spec approved'), next: 'Design the screens, or plan the change if it has none.', open: openRequirement, act: 'Make the screens' };
      } else if (approved < own.length) {
        s = { step: 2, status: ui.status(own.some((x) => x.status === 'IN_REVIEW') ? 'IN_REVIEW' : 'DRAFT', approved + ' of ' + own.length + ' screens approved'),
          next: 'Finish the screens and approve them.', perm: 'EDIT_DESIGNS', who: 'an analyst or developer', open: openRecord('studio', workspaceId, 'studio', r.id), act: 'Approve the screens', target: 'studio' };
      } else {
        s = { step: 3, status: ui.status('APPROVED', 'Screens approved'), next: 'Plan the change.', perm: 'MANAGE_CODE', who: 'a developer', open: openRequirement, act: 'Plan the change' };
      }
    } else if (c.status === 'ANALYZING') {
      s = { step: 3, status: ui.status('ANALYZING', 'Analysing'), next: 'The impact analysis is running.', open: openChange, act: 'Follow progress' };
    } else if (c.status === 'PLAN_READY') {
      s = { step: 3, status: ui.status('PLAN_READY', 'Plan ready'), next: 'Review the plan and approve it.', perm: 'APPROVE', who: 'someone who can approve', open: openChange, act: 'Review the plan' };
    } else if (c.status === 'GENERATING') {
      s = { step: 4, status: ui.status('GENERATING', 'Writing code'), next: 'The code is being written.', open: openChange, act: 'Follow progress' };
    } else if (c.status === 'FAILED') {
      s = { step: c.planApprovedAt ? 4 : 3, status: ui.status('FAILED', interrupted(c.message) ? 'Interrupted' : 'Failed'),
        next: (firstClause(c.message) || 'The change failed') + '. Open the change to try again.', perm: 'MANAGE_CODE', who: 'a developer', open: openChange, act: 'Open the change' };
    } else if (c.buildStatus === 'FAILED') {
      s = { step: 4, status: ui.status('FAILED', 'Build failed'), next: 'The last build failed. See the errors and build again.', perm: 'MANAGE_CODE', who: 'a developer', open: openChange, act: 'See the errors' };
    } else if (c.buildStatus === 'BUILDING') {
      s = { step: 4, status: ui.status('BUILDING', 'Building'), next: 'Jenkins is building the change.', open: openChange, act: 'Follow the build' };
    } else {
      s = { step: 4, status: ui.status('GENERATED', 'Ready to review'), next: 'Review the code, build it and deliver it.', perm: 'MANAGE_CODE', who: 'a developer', open: openChange, act: 'Review the code' };
    }
    const target = s.target || (s.open === openChange ? 'change' : 'requirement');
    return Object.assign(s, {
      designs: own, change: c, target: target,
      place: { requirement: 'the requirement', studio: 'the Design Studio', change: 'the change' }[target],
      stepText: s.finished ? 'All 4 steps done' : 'Step ' + s.step + ' of 4 · ' + STEPS[s.step - 1],
      steps: STEPS.map((name, i) => ({ name: name, state: s.finished || i + 1 < s.step ? 'done' : (i + 1 === s.step ? 'current' : 'todo') }))
    });
  }

  // What needs someone: failed or interrupted work (spec drafts, changes, builds, imports), approvals waiting (specs,
  // screens, plans), open questions, generated code to review and deliver, code never imported, and models never
  // chosen (administrators). Each item opens its record; `action` says what the user can do there with their role.
  const attention = ko.pureComputed(() => {
    const items = [];
    data().forEach((d) => {
      const w = d.workspace;
      const can = (permission) => session.can(w.id, permission);
      const add = (item) => items.push(Object.assign({ workspaceId: w.id, workspaceName: w.name }, item));
      const state = codeState(d);
      if (state.key === 'new' || state.key === 'failed') {
        const job = d.imports[0];
        add({ key: 'code:' + w.id, kind: state.key === 'failed' ? 'failed' : 'setup', tone: state.key === 'failed' ? 'red' : 'amber',
          title: w.name + ': ' + (state.key === 'new' ? 'code not imported' : (interrupted(job.message) ? 'code import interrupted' : 'code import failed')),
          text: state.key === 'failed' ? (job.message || 'The last import failed.') : 'Import the code so the factory can search and change it.',
          action: can('MANAGE_CODE') ? 'Import the code' : 'Ask a developer or lead to import it',
          at: job ? job.createdAt : w.createdAt, open: openRecord('code', w.id, 'codeTab', 'index') });
      }
      const titles = {};
      d.requirements.forEach((r) => {
        titles[r.id] = r.title;
        const openIt = openRecord('requirements', w.id, 'requirement', r.id);
        if (r.status === 'FAILED') {
          add({ key: 'req:' + r.id, kind: 'failed', tone: 'red', title: r.title,
            text: w.name + ': ' + (interrupted(r.message) ? 'drafting the spec was interrupted by a restart.' : 'the specification could not be made.'),
            action: can('EDIT_REQUIREMENTS') ? 'Open it to try again' : 'Waiting for an analyst to try again', at: r.updatedAt, open: openIt });
        } else if (r.status === 'READY' && r.openQuestions > 0) {
          add({ key: 'req:' + r.id, kind: 'questions', tone: 'amber', title: r.title,
            text: w.name + ': ' + r.openQuestions + ' open question' + (r.openQuestions === 1 ? '' : 's') + ' to answer.',
            action: can('EDIT_REQUIREMENTS') ? 'Answer the questions' : 'Waiting for an analyst to answer', at: r.updatedAt, open: openIt });
        } else if (r.status === 'READY') {
          add({ key: 'req:' + r.id, kind: 'approval', tone: 'amber', title: r.title, text: w.name + ': the spec is ready for approval.',
            action: can('APPROVE') ? 'Review and approve the spec' : 'Waiting for someone who can approve', at: r.updatedAt, open: openIt });
        }
      });
      // Screens in review, one item per requirement (a screen without one opens in the Design Studio's editor)
      const review = {};
      d.designs.filter((s) => s.status === 'IN_REVIEW').forEach((s) => {
        const group = s.requirementId || 'design:' + s.id;
        (review[group] = review[group] || []).push(s);
      });
      Object.keys(review).forEach((group) => {
        const list = review[group];
        const first = list[0];
        const at = list.map((s) => s.updatedAt).sort().pop();
        add({ key: 'review:' + group, kind: 'approval', tone: 'amber',
          title: first.requirementId ? (titles[first.requirementId] || first.name) : first.name,
          text: w.name + ': ' + (list.length === 1 ? 'a screen is' : list.length + ' screens are') + ' waiting for approval.',
          action: can('APPROVE') ? 'Review and approve' : 'Waiting for someone who can approve', at: at,
          open: first.requirementId ? openRecord('studio', w.id, 'studio', first.requirementId) : openRecord('studio', w.id, 'design', first.id) });
      });
      const details = {};
      d.changeDetails.forEach((c) => { details[c.id] = c; });
      d.changes.forEach((c) => {
        const openIt = openRecord('changes', w.id, 'change', c.id);
        // The change's build status (BUILDING, PASSED or FAILED) is the state of its last Jenkins build
        const detail = details[c.id];
        const build = latestBuild(detail);
        if (c.status === 'PLAN_READY') {
          add({ key: 'change:' + c.id, kind: 'approval', tone: 'amber', title: c.title, text: w.name + ': the plan is ready for approval.',
            action: can('APPROVE') ? 'Review and approve the plan' : 'Waiting for someone who can approve', at: c.updatedAt, open: openIt });
        } else if (c.status === 'GENERATED' && detail && detail.buildStatus === 'FAILED') {
          add({ key: 'change:' + c.id, kind: 'failed', tone: 'red', title: c.title,
            text: w.name + ': build ' + (build && build.buildNumber ? '#' + build.buildNumber + ' ' : '') + (interrupted(detail.buildMessage) ? 'was interrupted by a restart.' : 'failed.'),
            action: can('MANAGE_CODE') ? 'See the errors and build again' : 'Waiting for a developer', at: (build && (build.finishedAt || build.startedAt)) || c.updatedAt, open: openIt });
        } else if (c.status === 'GENERATED') {
          add({ key: 'change:' + c.id, kind: 'review', tone: 'amber', title: c.title, text: w.name + ': code generated, ready to review and deliver.',
            action: can('MANAGE_CODE') ? 'Review and deliver' : 'Waiting for a developer', at: c.updatedAt, open: openIt });
        } else if (c.status === 'FAILED') {
          add({ key: 'change:' + c.id, kind: 'failed', tone: 'red', title: c.title,
            text: w.name + ': ' + (interrupted(c.message) ? 'interrupted by a restart.' : (firstClause(c.message) || 'the change failed') + '.'),
            action: can('MANAGE_CODE') ? 'Open it to try again or close it' : 'Waiting for a developer', at: c.updatedAt, open: openIt });
        }
      });
    });
    if (session.isAdmin() && model() && !model().saved) {
      items.push({ key: 'models', kind: 'setup', tone: 'amber', title: 'Models not chosen yet', text: 'The factory is using the models from its settings file. Choose them on the Models page.',
        action: 'Choose the models', workspaceId: null, open: open('models') });
    }
    return items.map((item) => Object.assign(item, { when: ago(item.at) }));
  });

  session.user.subscribe((user) => { if (user) { load(); } else { data([]); } });

  return {
    data: data,
    model: model,
    loading: loading,
    error: error,
    attention: attention,
    load: load,
    open: open,
    openRecord: openRecord,
    latestBuild: latestBuild,
    workflow: workflow,
    steps: STEPS,
    interrupted: interrupted,
    firstClause: firstClause,
    codeState: codeState,
    isIndexed: isIndexed,
    openChanges: OPEN_CHANGES,
    ago: ago,
    when: when,
    duration: duration
  };
});
