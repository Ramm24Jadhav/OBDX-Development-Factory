/*
 * The workspace selected on the Code and Profile pages, shared so it stays selected when switching pages.
 */
define(['knockout', './api', './preferences'], function (ko, api, preferences) {
  const selectedId = ko.observable(null);
  const options = ko.observableArray([]);

  /** Reloads the workspace list and selects the first workspace if none is selected yet. */
  function load() {
    return api.get('workspaces').then(function (list) {
      options(list.map(function (workspace) {
        return { value: workspace.id, label: workspace.name + ' (' + workspace.bankName + ', ' + workspace.obdxVersion + ')' };
      }));
      const stillExists = list.some(function (workspace) { return workspace.id === selectedId(); });
      if (!stillExists) {
        const preferred = list.find(function (workspace) { return workspace.id === preferences.workspace(); });
        selectedId(preferred ? preferred.id : (list.length > 0 ? list[0].id : null));
      }
      return list;
    });
  }

  return { selectedId: selectedId, options: options, load: load };
});
