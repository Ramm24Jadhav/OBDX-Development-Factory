/*
 * Everything the Overview page, the Workspaces page and the notification bell show about the workspaces the user can
 * see: each workspace with its requirements, screens, changes (with their Jenkins builds), code index and imports, plus
 * what needs the user's attention. Loaded from the same endpoints the other pages use; nothing here is stored.
 */
define(['knockout', './api', './session', './workspaceSelection'], function (ko, api, session, workspaceSelection) {
  const OPEN_CHANGES = ['ANALYZING', 'PLAN_READY', 'GENERATING', 'GENERATED'];
  const data = ko.observableArray([]);
  const model = ko.observable(null);
  const loading = ko.observable(false);
  const error = ko.observable('');
  let pending = null;

  const settled = (promise) => promise.then((value) => value, () => null);
  const isIndexed = (w) => w.indexedRevision !== null && w.indexedRevision !== undefined;

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
    return value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
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
    return Promise.all([
      settled(api.get('workspaces/' + w.id + '/requirements')),
      settled(api.get('workspaces/' + w.id + '/designs')),
      settled(api.get('workspaces/' + w.id + '/changes')),
      settled(api.get('workspaces/' + w.id + '/index')),
      settled(api.get('workspaces/' + w.id + '/imports'))
    ]).then(([requirements, designs, changes, index, imports]) =>
      // The builds are in each change's detail; a workspace has few changes.
      Promise.all((changes || []).map((c) => settled(api.get('changes/' + c.id)))).then((details) => ({
        workspace: w,
        requirements: requirements || [],
        designs: designs || [],
        changes: changes || [],
        builds: details.filter(Boolean).reduce((all, d) => all.concat((d.builds || []).map((b) => Object.assign({}, b, {
          changeTitle: d.title, branchUrl: d.branchUrl, workspaceName: w.name, workspaceId: w.id
        }))), []),
        index: index,
        imports: imports || []
      })));
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

  // What needs the user: code not imported, specifications that failed or have open questions, screens in review,
  // plans waiting for approval, generated or failed changes, and models never chosen (administrators).
  const attention = ko.pureComputed(() => {
    const items = [];
    data().forEach((d) => {
      const w = d.workspace;
      const state = codeState(d);
      if (state.key === 'new' || state.key === 'failed') {
        items.push({ tone: 'red', title: w.name + ': code not imported',
          text: state.key === 'failed' ? (d.imports[0].message || 'The last import failed.') : 'Import the code so the factory can search and change it.',
          at: d.imports.length ? d.imports[0].createdAt : w.createdAt, open: open('code', w.id) });
      }
      d.requirements.forEach((r) => {
        if (r.status === 'FAILED') {
          items.push({ tone: 'red', title: r.title, text: w.name + ': the specification could not be made. Open it to try again.', at: r.updatedAt, open: open('requirements', w.id) });
        } else if (r.status === 'READY' && r.openQuestions > 0) {
          items.push({ tone: 'amber', title: r.title, text: w.name + ': ' + r.openQuestions + ' open question' + (r.openQuestions === 1 ? '' : 's') + ' to answer.', at: r.updatedAt, open: open('requirements', w.id) });
        }
      });
      d.designs.forEach((s) => {
        if (s.status === 'IN_REVIEW') {
          items.push({ tone: 'amber', title: s.name, text: w.name + ': screen waiting for review.', at: s.updatedAt, open: open('designer', w.id) });
        }
      });
      d.changes.forEach((c) => {
        if (c.status === 'PLAN_READY') {
          items.push({ tone: 'amber', title: c.title, text: w.name + ': the plan is ready for approval.', at: c.updatedAt, open: open('changes', w.id) });
        } else if (c.status === 'GENERATED') {
          items.push({ tone: 'amber', title: c.title, text: w.name + ': code generated, ready to review and deliver.', at: c.updatedAt, open: open('changes', w.id) });
        } else if (c.status === 'FAILED') {
          items.push({ tone: 'red', title: c.title, text: w.name + ': ' + (c.message || 'the change failed.'), at: c.updatedAt, open: open('changes', w.id) });
        }
      });
    });
    if (session.isAdmin() && model() && !model().saved) {
      items.push({ tone: 'amber', title: 'Models not chosen yet', text: 'The factory is using the models from its settings file. Choose them on the Models page.', open: open('models') });
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
    codeState: codeState,
    isIndexed: isIndexed,
    openChanges: OPEN_CHANGES,
    ago: ago,
    when: when,
    duration: duration
  };
});
