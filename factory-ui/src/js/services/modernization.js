/*
 * What the Modernization pages share (docs/MODERNIZATION.md): going to a page with what it should open on, the step bar
 * of each path, the labels of run states and mapping results, whether the user may change things, and the code
 * analysis running in the background (followed here so it goes on while the user moves between pages).
 */
define(['knockout', './pageRequests', './session', './workspaceSelection', './ui', './api', './toast', './notifications'],
  function (ko, pageRequests, session, workspaceSelection, ui, api, toast, notifications) {
  /** Opens a Modernization page; request is what it opens on (see pageRequests.modernization). */
  const open = (path, request) => {
    pageRequests.modernization(request || null);
    window.dispatchEvent(new CustomEvent('factory-navigate', { detail: path }));
  };
  /** The request left for this page, read once. */
  const take = () => {
    const r = pageRequests.modernization();
    pageRequests.modernization(null);
    return r || {};
  };

  const STEPS = {
    ui: [['Choose a path', 'modernization-path'], ['Inventory and mapping', 'modernization-components'], ['Upgrade plan', 'modernization-upgrade'],
      ['Build and validate', 'modernization-workspace'], ['Review and deliver', 'modernization-review']],
    migration: [['Choose a path', 'modernization-path'], ['Technology', 'modernization-catalogue'], ['Migration plan', 'modernization-planner'],
      ['Build and validate', 'modernization-workspace'], ['Review and deliver', 'modernization-review']]
  };
  /** The step bar of a path at step n (1 to 5): done steps are links back. */
  const steps = (path, n) => (STEPS[path] || STEPS.ui).map((s, i) => ({
    n: i + 1, label: s[0], route: s[1],
    css: i + 1 < n ? 'is-done' : i + 1 === n ? 'is-current' : '',
    current: i + 1 === n ? 'step' : null,
    done: i + 1 < n,
    href: '?ojr=' + s[1],
    go: (vm, event) => { if (event && (event.ctrlKey || event.metaKey || event.shiftKey)) { return true; } open(s[1]); return false; }
  }));
  const pathName = (path) => (path === 'migration' ? 'Migration path' : 'UI path');

  const RUN = {
    starting: ['Starting', 'grey'], building: ['Building', 'blue'], validating: ['Validating', 'amber'], delivered: ['Delivered', 'green'],
    rejected: ['Rejected', 'red'], failed: ['Failed', 'red']
  };
  const runPill = (state) => ui.pill.apply(null, RUN[state] || [state, 'grey']);

  /** direct, mapping or custom: [label, tone, icon]. */
  const COMPAT = { direct: ['Direct replacement', 'green', 'check'], mapping: ['Property or event mapping', 'amber', 'refresh'], custom: ['Transformation, manual or unsupported', 'red', 'alert'] };
  const compatPill = (c) => ui.pill.apply(null, (COMPAT[c] || [c, 'grey']).slice(0, 2));
  const STATUS = {
    'direct-replacement': 'Direct replacement', 'property-mapping': 'Property mapping', 'event-mapping': 'Event mapping',
    'custom-transformation': 'Custom transformation', 'manual-intervention': 'Manual work', unsupported: 'Not in the pack'
  };
  const statusText = (s) => STATUS[s] || s;
  const CATEGORY = { input: 'Input and form', navigation: 'Navigation', data: 'Data display', layout: 'Layout and container', overlay: 'Popup and overlay', other: 'Other' };

  const canManage = ko.pureComputed(() => {
    const id = workspaceSelection.selectedId();
    return !!id && session.can(id, 'MANAGE_CODE');
  });
  const num = (n) => (n === null || n === undefined ? '–' : Number(n).toLocaleString());

  // The analysis job of the chosen workspace: started, followed every 1.5 s while it runs, told in a toast and the bell
  const analysis = ko.observable(null);
  let timer = null;
  const follow = (id) => {
    window.clearTimeout(timer);
    api.get('workspaces/' + id + '/inventory/analysis').then((job) => {
      if (id !== workspaceSelection.selectedId()) { return; }
      const was = analysis();
      analysis(job || null);
      if (job && job.state === 'running') { timer = window.setTimeout(() => follow(id), 1500); return; }
      if (job && was && was.state === 'running') {
        const ok = job.state === 'done';
        toast[ok ? 'success' : 'error'](job.message);
        notifications.add({ id: 'analysis-' + id + '-' + job.finishedAt, category: 'system', title: ok ? 'Analysis Finished' : job.state === 'stopped' ? 'Analysis Stopped' : 'Analysis Failed',
          icon: ok ? 'check' : 'alert', tone: ok ? 'green' : job.state === 'stopped' ? 'amber' : 'red', text: job.message, related: 'Code analysis', relatedSub: '', at: job.finishedAt,
          page: 'modernization', workspaceId: id, priority: ok ? 'low' : 'high', action: !ok });
        analysisDone.notifySubscribers(job);
      }
    }).catch(() => null);
  };
  const analysisDone = ko.observable(null);
  const startAnalysis = () => {
    const id = workspaceSelection.selectedId();
    return api.post('workspaces/' + id + '/inventory/analysis').then((job) => { analysis(job); toast.info('Analysis started. You can leave this page; the bell tells you when it is done.'); follow(id); return job; })
      .catch((e) => { toast.error(ui.errorText(e)); throw e; });
  };
  const stopAnalysis = () => api.post('workspaces/' + workspaceSelection.selectedId() + '/inventory/analysis/stop').then((job) => analysis(job)).catch((e) => toast.error(ui.errorText(e)));
  const analysisRunning = ko.pureComputed(() => !!analysis() && analysis().state === 'running');
  workspaceSelection.selectedId.subscribe((id) => { analysis(null); if (id) { follow(id); } });
  if (workspaceSelection.selectedId()) { follow(workspaceSelection.selectedId()); }

  return { analysis: analysis, analysisRunning: analysisRunning, analysisDone: analysisDone, startAnalysis: startAnalysis, stopAnalysis: stopAnalysis,
    followAnalysis: () => { if (workspaceSelection.selectedId()) { follow(workspaceSelection.selectedId()); } },
    open: open, take: take, steps: steps, pathName: pathName, runPill: runPill, RUN: RUN, COMPAT: COMPAT, compatPill: compatPill,
    statusText: statusText, CATEGORY: CATEGORY, canManage: canManage, num: num };
});
