/*
 * Requests one page leaves for another: the top bar's search for the Code page, a new workspace's source started on
 * the Overview page for the Workspaces page, and the requirement or change the command palette opens. The receiving page reads the request and clears it.
 */
define(['knockout'], function (ko) {
  return {
    /** Text to search the selected workspace's code for. */
    codeSearch: ko.observable(''),
    /** { kind: 'folder' | 'url', value: path or URL, browse: true to open the folder browser } */
    newWorkspace: ko.observable(null),
    /** A requirement or change id to open when its page loads (from the command palette) */
    requirement: ko.observable(null),
    change: ko.observable(null)
  };
});
