/*
 * Requests one page leaves for another: the top bar's search for the Code page, and a new workspace's source started on
 * the Overview page for the Workspaces page. The receiving page reads the request and clears it.
 */
define(['knockout'], function (ko) {
  return {
    /** Text to search the selected workspace's code for. */
    codeSearch: ko.observable(''),
    /** { kind: 'folder' | 'url', value: path or URL, browse: true to open the folder browser } */
    newWorkspace: ko.observable(null)
  };
});
