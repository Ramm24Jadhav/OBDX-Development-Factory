/*
 * What the Modernization pages share (docs/MODERNIZATION.md): going to a page with what it should open on, the step bar
 * of each path, the labels of run states and mapping results, and whether the user may change things.
 */
define(['knockout', './pageRequests', './session', './workspaceSelection', './ui'], function (ko, pageRequests, session, workspaceSelection, ui) {
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

  return { open: open, take: take, steps: steps, pathName: pathName, runPill: runPill, RUN: RUN, COMPAT: COMPAT, compatPill: compatPill,
    statusText: statusText, CATEGORY: CATEGORY, canManage: canManage, num: num };
});
