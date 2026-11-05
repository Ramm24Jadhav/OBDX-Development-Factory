/*
 * Requests one page leaves for another: the top bar's search for the Code page, a new workspace's source started on
 * the Overview page for the Workspaces page, a workspace's details from the Code page, and the requirement or change
 * the command palette opens. The receiving page reads the request and clears it.
 */
define(['knockout'], function (ko) {
  return {
    /** Text to search the selected workspace's code for (the Code page's Search tab). */
    codeSearch: ko.observable(''),
    /** { kind: 'folder' | 'url', value: path or URL, browse: true to open the folder browser } */
    newWorkspace: ko.observable(null),
    /**
     * 'upload' or 'text': the Requirements page opens its new-requirement panel (Home and the command palette);
     * { mode: 'text', title, text } opens it filled in (Modernization's Convert a module)
     */
    newRequirement: ko.observable(null),
    /** A requirement or change id to open when its page loads (from the command palette) */
    requirement: ko.observable(null),
    change: ko.observable(null),
    /** A screen to open in the Design Studio's Edit, and a requirement to open in the Design Studio */
    design: ko.observable(null),
    studio: ko.observable(null),
    /** true while a page wants the app menu folded to icons (the Design Studio's Edit); the shell follows it */
    foldMenu: ko.observable(false),
    /** A workspace id whose details the Workspaces page opens in its side sheet (from the Code page) */
    workspace: ko.observable(null),
    /** { path, startLine, endLine } a file the Code page opens on Explore with those lines marked (Modernization findings) */
    codeFile: ko.observable(null),
    /**
     * A Code page tab to open: 'explore', 'search', 'map', 'rules', 'checks', 'index', 'facts' or 'settings' (Integrations
     * and Modernization open Settings, import notifications open Index, the palette's G K opens Explore, G P and the
     * links from Home, Workspaces, Modernization and the AI Prompt Library open Codebase facts, Modernization and the AI
     * Prompt Library open Quick checks)
     */
    codeTab: ko.observable(null),
    /** A fact key the Code page opens on Codebase facts, for example 'obdx.version' (the Workspaces sheet) */
    codeFact: ko.observable(null)
  };
});
