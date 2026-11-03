/*
 * The workspace selected on the Code and Profile pages, shared so it stays selected when switching pages.
 */
define(['knockout', './api', './preferences'], function (ko, api, preferences) {
  const current = ko.observable(null);
  // A page with work that a workspace change would lose (the Design Studio's unsaved edits) registers a guard:
  // { blocks: () => true while there is such work, confirm: () => Promise<boolean> }. Every change of the workspace
  // (the top bar, the bell, the palette, another page's link) asks it first; Cancel keeps the workspace, and the top
  // bar's picker shows it again.
  const guards = [];
  let asking = null;
  const selectedId = ko.pureComputed({
    read: current,
    write: (id) => {
      if (id === current.peek()) {
        return;
      }
      const blocking = guards.filter((g) => g.blocks());
      if (blocking.length === 0) {
        current(id);
        return;
      }
      if (!asking) {
        asking = blocking.reduce((chain, g) => chain.then((ok) => ok && g.confirm()), Promise.resolve(true))
          .catch(() => false).finally(() => { asking = null; });
      }
      asking.then((ok) => (ok ? current(id) : refused(refused.peek() + 1)));
    }
  });
  // Counts the changes a guard refused, so a picker that already shows the other workspace can show this one again
  const refused = ko.observable(0);
  /** Registers a guard asked before the workspace changes; returns a function that removes it. */
  const guardChange = (guard) => {
    guards.push(guard);
    return () => { const at = guards.indexOf(guard); if (at >= 0) { guards.splice(at, 1); } };
  };
  const options = ko.observableArray([]);

  /** Reloads the workspace list and selects the first workspace if none is selected yet. */
  function load() {
    return api.get('workspaces').then(function (list) {
      options(list.map(function (workspace) {
        return { value: workspace.id, label: workspace.name + ' (' + workspace.bankName + ', ' + workspace.obdxVersion + ')', obdxVersion: workspace.obdxVersion };
      }));
      const stillExists = list.some(function (workspace) { return workspace.id === selectedId(); });
      if (!stillExists) {
        const preferred = list.find(function (workspace) { return workspace.id === preferences.workspace(); });
        selectedId(preferred ? preferred.id : (list.length > 0 ? list[0].id : null));
      }
      return list;
    });
  }

  /** The selected workspace's OBDX version (shown beside the top bar's workspace picker), or null */
  const selectedVersion = ko.pureComputed(function () {
    const selected = options().find(function (o) { return o.value === selectedId(); });
    return selected && selected.obdxVersion ? selected.obdxVersion : null;
  });

  // The repository's latest revision per workspace, from a check the user ran on the Code page (POST svn/test), kept
  // for this browser session: {ok, revision, root, at} or {ok: false, error, at}. Other pages read it, never call SVN.
  const headChecks = {};

  return { selectedId: selectedId, guardChange: guardChange, refused: refused, options: options, selectedVersion: selectedVersion, load: load, headChecks: headChecks };
});
