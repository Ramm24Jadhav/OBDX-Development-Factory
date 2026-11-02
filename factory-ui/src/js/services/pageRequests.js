/*
 * Requests one page leaves for another: the top bar's search for the Code page, a new workspace's source started on
 * the Overview page for the Workspaces page, a workspace's details from the Code page, and the requirement or change
 * the command palette opens. The receiving page reads the request and clears it.
 */
define(['knockout'], function (ko) {
  return {
    /** Text to search the selected workspace's code for. */
    codeSearch: ko.observable(''),
    /** { kind: 'folder' | 'url', value: path or URL, browse: true to open the folder browser } */
    newWorkspace: ko.observable(null),
    /** A requirement or change id to open when its page loads (from the command palette) */
    requirement: ko.observable(null),
    change: ko.observable(null),
    /** A screen design to open in the Visual Designer, and a requirement to open in the Design Studio */
    design: ko.observable(null),
    studio: ko.observable(null),
    /** A workspace id whose details the Workspaces page opens in its side sheet (from the Code page) */
    workspace: ko.observable(null),
    /** { path, startLine, endLine } a file the Code page opens in its viewer at those lines (from Knowledge Explorer) */
    codeFile: ko.observable(null)
  };
});
