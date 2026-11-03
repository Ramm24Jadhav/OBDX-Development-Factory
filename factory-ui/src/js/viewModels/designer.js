/*
 * Visual Designer, in three zones: on the left the components, the open screen's layers and the workspace's screens; in
 * the middle the canvas (journey stepper, a toolbar for screen size, zoom, the validation and focus-order previews, the
 * live preview to click and drop on, "Ask AI" to change it); on the right the inspector, one list of sections
 * (properties, data binding, validation, visibility conditions, events and actions, style, accessibility). The title
 * row keeps design or code, more, preview and save version. The requirement's rules, comments, history with compare,
 * and the AI Assistant share one drawer under the canvas.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/previewFrame', '../services/session',
        '../services/assistant', '../services/ui', '../services/dialog', '../services/toast', '../services/pageRequests', '../services/designDiff',
        '../services/designActions', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, PreviewFrame, session, assistant, ui, dialog, toast, pageRequests, designDiff, designActions) {
    // Asks before an action (design system dialog); resolves true when confirmed
    const ask = (title, message, confirmLabel, danger) => dialog.confirm({ title: title, message: message, confirmLabel: confirmLabel, danger: !!danger });
    // A screen's status in the shared categories (ui.status): {text, css, iconCss}
    const screenStatus = (status, words) => ui.status(status, words);
    const DISCARD = ['Discard your unsaved changes?', 'The changes since the last saved version are lost.', 'Discard'];
    // Screen sizes to check a design at; "fit" uses the canvas width, "custom" a width the designer types
    const VIEWPORTS = [
      { key: 'fit', label: 'Fit to canvas', width: null },
      { key: 'desktop', label: 'Desktop · 1440', width: 1440 },
      { key: 'laptop', label: 'Laptop · 1280', width: 1280 },
      { key: 'tablet-landscape', label: 'Tablet landscape · 1024', width: 1024 },
      { key: 'tablet', label: 'Tablet · 768', width: 768 },
      { key: 'phone', label: 'Phone · 390', width: 390 },
      { key: 'phone-small', label: 'Small phone · 360', width: 360 },
      { key: 'custom', label: 'Custom width', width: null }
    ];
    const clone = (value) => JSON.parse(JSON.stringify(value));
    // Palette groups in the order of the OBDX UX Extensibility Toolkit
    const GROUPS = ['Forms', 'Controls', 'Custom components', 'OBDX framework components', 'Business components', 'JET composite components',
      'Partials', 'JET components in this code', 'Other components used in this code'];
    // The built-in Forms and Controls items, listed under the design's group names by their type
    const BUILT_IN_GROUPS = [
      { title: 'Form Controls', types: ['text', 'textarea', 'number', 'amount', 'date', 'select', 'account', 'radio', 'checkbox', 'switch'] },
      { title: 'Data Display', types: ['display', 'table'] },
      { title: 'Actions', types: ['action'] }
    ];
    const ICONS = {
      text: 'Aa', textarea: '¶', number: '123', amount: '₹', date: '▦', select: '▾', account: '◧', radio: '◉',
      checkbox: '☑', switch: '◐', display: '≡', table: '▤', action: '▭', component: '⧉'
    };
    const SHORT_LABELS = { 'Table (options are its columns)': 'Table', 'Switch (on/off)': 'Switch', 'Multi-line text': 'Text area' };
    // Compatibility with the workspace's OBDX version, as the server finds it from evidence (ComponentCompatibility)
    const COMPAT_WORDS = { VERIFIED: 'Verified', UNSUPPORTED: 'Unsupported', UNVERIFIED: 'Unverified' };
    const COMPAT_MARKS = { VERIFIED: '✓', UNSUPPORTED: '✕', UNVERIFIED: '?' };
    const camel = (label) => (label || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)
      .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())).join('');

    /**
     * params (optional): { embedded: true, designId, host } when the Design Studio shows the designer as its Edit mode.
     * Embedded, the designer has no title, board, Screens tab or New drawer of its own; it opens designId, previews the
     * BRD's values only, and tells the host (select(id), changed(detail), deleted(id), leave(); element() is where it is
     * drawn) instead of opening
     * screens itself. Its keys, preview frame and size observer stay inside its own element.
     */
    function DesignerViewModel(params) {
      const self = this;
      const options = params || {};
      const embedded = options.embedded === true;
      const host = options.host || {};
      this.embedded = embedded;
      // The element the designer is drawn in (the oj-module, or the page), for every lookup of its own elements
      let root = document;
      const find = (selector) => root.querySelector(selector);
      const findAll = (selector) => root.querySelectorAll(selector);
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
      this.infoMessage = ko.observable('');
      this.busy = ko.observable(false);

      this.blankName = ko.observable('');
      this.designs = ko.observableArray([]);
      // The workspace's screens and requirements as the server lists them, the bank of each workspace, and the
      // approved requirement of the open screen (its spec drives the journey and the checks)
      const rawDesigns = ko.observableArray([]);
      const requirements = ko.observableArray([]);
      const bankNames = {};
      this.requirement = ko.observable(null);
      const designOptions = ko.observableArray([]);
      this.designPick = ko.observable(null);

      this.detail = ko.observable(null);
      this.working = ko.observable(null);
      this.dirty = ko.observable(false);
      this.selectedId = ko.observable(null);
      this.aiInstruction = ko.observable('');
      this.commentText = ko.observable('');
      this.canDesign = ko.pureComputed(() => session.can(this.workspaceId(), 'EDIT_DESIGNS'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.editable = ko.pureComputed(() => this.detail() !== null && this.detail().status !== 'APPROVED' && this.canDesign());
      this.statusText = ko.pureComputed(() => {
        const d = this.detail();
        return d ? d.status.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) + ' · v' + d.currentVersion : '';
      });

      this.headerStatus = ko.pureComputed(() => screenStatus(this.detail() ? this.detail().status : '', this.statusText()));
      // The approval group in the title row: the review link and Approve, apart from Save Version and Ask AI
      this.shareBlocked = ko.pureComputed(() => {
        if (!this.editable()) {
          return this.detail() && this.detail().status === 'APPROVED' ? 'An approved screen cannot be shared for review. Reopen it first.' : 'You cannot change screens in this workspace.';
        }
        return this.dirty() ? 'Save the changes first: the link shows a saved version.' : '';
      });
      this.approveBlocked = ko.pureComputed(() => {
        if (!this.canApprove()) {
          return 'You cannot approve screens in this workspace.';
        }
        if (!this.editable()) {
          return 'You cannot change screens in this workspace.';
        }
        return this.dirty() ? 'Save the changes first: approval locks a saved version.' : '';
      });
      this.isApproved = ko.pureComputed(() => !!this.detail() && this.detail().status === 'APPROVED');
      this.shareOpen = ko.pureComputed(() => this.drawer() === 'share');

      // Panels: the left one shows components, layers or screens; the right one is the inspector of the selection; the
      // top bar opens one drawer at a time (a new screen, an import, the review link)
      this.leftTab = ko.observable('components');
      // Embedded, the Studio's library lists the screens, so the panel has no Screens tab
      this.leftTabs = [['components', 'Components'], ['layers', 'Layers']].concat(embedded ? [] : [['screens', 'Screens']]).map(([key, label]) => ({
        key: key,
        label: label,
        id: 'leftTab-' + key,
        selected: ko.pureComputed(() => this.leftTab() === key),
        css: ko.pureComputed(() => 'factory-dz-tab' + (this.leftTab() === key ? ' factory-dz-tab-active' : '')),
        pick: () => this.leftTab(key)
      }));
      // Arrow keys move between the left panel's tabs, as in any tab list
      this.leftTabKey = (event) => {
        const keys = this.leftTabs.map((t) => t.key);
        const at = keys.indexOf(this.leftTab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        this.leftTab(keys[next]);
        const tab = find('#leftTab-' + keys[next]);
        if (tab) {
          tab.focus();
        }
        event.preventDefault();
        return false;
      };
      this.drawer = ko.observable(null);
      this.toggleDrawer = (name) => () => this.drawer(this.drawer() === name ? null : name);
      this.openNew = this.toggleDrawer('new');
      this.openImport = this.toggleDrawer('import');
      this.openShare = this.toggleDrawer('share');
      this.closeDrawer = () => this.drawer(null);
      this.showComments = () => { this.contextTab('comments'); this.contextOpen(true); };
      this.showHistory = () => { this.contextTab('history'); this.contextOpen(true); };
      this.showAssistant = () => { this.contextTab('assistant'); this.contextOpen(true); };
      // The inspector: one list of sections in a fixed order; which are open is kept while other elements are selected
      const INSPECTOR = [['properties', 'Properties'], ['binding', 'Data Binding'], ['validation', 'Validation'],
        ['visibility', 'Visibility Conditions'], ['events', 'Events and Actions'], ['style', 'Style'], ['accessibility', 'Accessibility']];
      this.sectionOpen = {};
      INSPECTOR.forEach(([key]) => { this.sectionOpen[key] = ko.observable(key === 'properties'); });
      this.sectionToggle = (event) => {
        const key = event.target && event.target.getAttribute ? event.target.getAttribute('data-section') : null;
        if (key && this.sectionOpen[key] && event.target.tagName === 'DETAILS') {
          this.sectionOpen[key](event.target.open);
        }
      };
      /** Opens an inspector section and brings it into view (and its first box into focus, when asked). */
      const openSection = (key, focusSelector) => {
        this.rightOpen(true);
        this.sectionOpen[key](true);
        setTimeout(() => {
          const section = find('#rightPanel details[data-section="' + key + '"]');
          if (section) {
            section.open = true;
            section.scrollIntoView({ block: 'nearest' });
          }
          const box = focusSelector ? find(focusSelector) : null;
          if (box) {
            box.focus();
          }
        }, 80);
      };
      // Design shows the canvas; Code shows what the screen is made of (and the app code for app targets)
      this.mode = ko.observable('design');
      this.setDesignMode = () => this.mode('design');
      this.setCodeMode = () => this.mode('code');
      this.modelJson = ko.pureComputed(() => (this.working() ? JSON.stringify(this.working(), null, 2) : ''));
      // Preview: the canvas alone, without the panels
      this.previewMode = ko.observable(false);
      this.togglePreview = () => {
        this.previewMode(!this.previewMode());
        this.mode('design');
      };

      // The side panels float over the canvas and collapse to rails; whether each is open is remembered in this browser.
      const remembered = (key, fallback) => {
        try {
          const value = window.localStorage.getItem('factory.designer.' + key);
          return value === null ? fallback : value === 'true';
        } catch (e) {
          return fallback;
        }
      };
      const remember = (key, value) => {
        try {
          window.localStorage.setItem('factory.designer.' + key, String(value));
        } catch (e) {
          // private window or blocked storage: the panels just open as before next time
        }
      };
      this.leftOpen = ko.observable(remembered('leftOpen', true));
      this.rightOpen = ko.observable(remembered('rightOpen', true));
      this.leftOpen.subscribe((open) => remember('leftOpen', open));
      this.rightOpen.subscribe((open) => remember('rightOpen', open));
      // The drawer under the canvas (rules, comments, history, AI Assistant) starts closed so the canvas gets the room
      this.contextTab = ko.observable('rules');
      this.contextOpen = ko.observable(remembered('contextOpen', false));
      this.contextOpen.subscribe((open) => remember('contextOpen', open));
      this.collapseLeft = () => this.leftOpen(false);
      this.collapseRight = () => this.rightOpen(false);
      const openLeftOn = (tab) => () => { this.leftTab(tab); this.leftOpen(true); };
      this.railComponents = openLeftOn('components');
      this.railLayers = openLeftOn('layers');
      this.railScreens = openLeftOn('screens');
      this.railProperties = () => this.rightOpen(true);
      this.railComments = () => this.showComments();
      this.railHistory = () => this.showHistory();
      this.railAssistant = () => this.showAssistant();
      this.bodyClass = ko.pureComputed(() => 'factory-dz-body' + (this.leftOpen() ? ' factory-dz-left-open' : '')
        + (this.rightOpen() ? ' factory-dz-right-open' : '') + (this.detail() ? '' : ' factory-dz-nodetail')
        + (this.previewMode() ? ' factory-dz-previewing' : '') + (this.contextOpen() ? ' factory-dz-ctx-open' : ''));

      const catalog = ko.observableArray([]);
      this.typeOptions = catalog;
      this.columnsOptions = [1, 2, 3].map((n) => ({ value: n, label: n + (n === 1 ? ' column' : ' columns') }));
      this.kindOptions = [
        { value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }, { value: 'link', label: 'Link' }
      ];

      // --- compatibility: each element of the screen against the workspace's OBDX version ---

      /** The element code generation uses for a component: the catalog's JET element, or the component's own name. */
      const elementOf = (component) => {
        if (!component) {
          return null;
        }
        if (component.type === 'component') {
          return component.component || null;
        }
        const entry = catalog().find((t) => t.value === component.type);
        const match = entry && entry.jet ? /^[a-z][a-z0-9-]*/.exec(entry.jet) : null;
        return match ? match[0] : null;
      };
      const compatibility = ko.observable({ version: '', imported: false, entries: {} });
      this.compatibilityOf = (element) => (element ? compatibility().entries[element] || null : null);
      this.obdxVersion = ko.pureComputed(() => compatibility().version);
      const screenElements = ko.pureComputed(() => {
        const model = this.working();
        if (!model || !catalog().length) {
          return [];
        }
        const names = [];
        model.sections.forEach((s) => s.components.forEach((c) => {
          const element = elementOf(c);
          if (element && names.indexOf(element) < 0) {
            names.push(element);
          }
        }));
        if (model.actions.length) {
          names.push('oj-button');
        }
        return names.sort();
      });
      // Asked again only when the set of elements changes, not on every edit
      let askedFor = null;
      ko.computed(() => {
        const names = screenElements();
        const workspace = this.workspaceId();
        const key = workspace + '|' + names.join(',');
        if (!workspace || names.length === 0 || key === askedFor) {
          return;
        }
        askedFor = key;
        api.get('workspaces/' + workspace + '/design-compatibility?' + names.map((n) => 'element=' + encodeURIComponent(n)).join('&'))
          .then((report) => {
            const entries = Object.assign({}, compatibility().version === report.obdxVersion ? compatibility().entries : {});
            report.elements.forEach((e) => { entries[e.element] = e; });
            compatibility({ version: report.obdxVersion, imported: report.codeImported, entries: entries });
          })
          .catch(() => { askedFor = null; });
      }).extend({ rateLimit: 400 });
      this.compatibilitySummary = ko.pureComputed(() => {
        const names = screenElements();
        const counts = { VERIFIED: 0, UNSUPPORTED: 0, UNVERIFIED: 0 };
        names.forEach((n) => { const e = this.compatibilityOf(n); if (e) { counts[e.status]++; } });
        const known = counts.VERIFIED + counts.UNSUPPORTED + counts.UNVERIFIED;
        return {
          shown: known > 0,
          text: 'OBDX ' + this.obdxVersion() + ': ' + counts.VERIFIED + ' verified · ' + counts.UNSUPPORTED + ' unsupported · '
            + counts.UNVERIFIED + ' unverified',
          css: 'factory-dz-compat-chip' + (counts.UNSUPPORTED ? ' factory-dz-compat-chip-bad' : ''),
          title: 'The elements this screen uses, checked against the OBDX ' + this.obdxVersion() + ' version pack and the bank\'s imported code. '
            + 'Verified: the bank\'s code uses it. Unsupported: a version pack rule forbids it. Unverified: no evidence either way.'
            + (compatibility().imported ? '' : ' The code is not imported yet, so nothing can be verified.')
        };
      });

      // Errors stay above the canvas and show a toast; other feedback is a toast
      const showError = (error) => { this.infoMessage(''); this.errorMessage(error.message); toast.error(error.message); };
      const showInfo = (text) => { this.errorMessage(''); this.infoMessage(''); toast.success(text); };
      this.clearMessages = () => { this.errorMessage(''); this.infoMessage(''); };
      // Enter in the Ask AI box applies the instruction
      this.aiKeydown = (event) => {
        if (event.key === 'Enter') {
          this.askAi();
        }
      };

      // --- canvas (the preview) ---

      this.viewport = ko.observable('fit');
      this.customWidth = ko.observable(1100);
      // The canvas shows the chosen width, scaled down when it is wider than the canvas
      this.stageWidth = ko.observable(1000);
      let stageObserver = null;
      this.deviceWidth = ko.pureComputed(() => {
        const vp = VIEWPORTS.find((v) => v.key === this.viewport());
        const custom = Math.round(Number(this.customWidth()) || 0);
        return vp.key === 'custom' ? Math.min(Math.max(custom, 320), 2560) : vp.width;
      });
      // Zoom: fit (the chosen width scaled down to the canvas) or a fixed percentage
      this.zoom = ko.observable('fit');
      this.zoomOptions = [{ value: 'fit', label: 'Fit' }, { value: '100', label: '100%' }, { value: '75', label: '75%' }, { value: '50', label: '50%' }];
      // The minus and plus buttons step through the fixed zooms; from Fit they start at the zoom Fit shows now
      const ZOOM_STEPS = [50, 75, 100];
      const zoomNow = () => (this.zoom() === 'fit' ? Math.round(this.deviceScale() * 100) : Number(this.zoom()));
      this.canZoomOut = ko.pureComputed(() => zoomNow() > ZOOM_STEPS[0]);
      this.canZoomIn = ko.pureComputed(() => zoomNow() < ZOOM_STEPS[ZOOM_STEPS.length - 1]);
      this.zoomOut = () => {
        const lower = ZOOM_STEPS.filter((z) => z < zoomNow());
        if (lower.length) {
          this.zoom(String(lower[lower.length - 1]));
        }
      };
      this.zoomIn = () => {
        const higher = ZOOM_STEPS.filter((z) => z > zoomNow());
        if (higher.length) {
          this.zoom(String(higher[0]));
        }
      };
      this.deviceScale = ko.pureComputed(() => {
        if (this.zoom() !== 'fit') {
          return Number(this.zoom()) / 100;
        }
        const width = this.deviceWidth();
        const room = Math.max(this.stageWidth() - 32, 200);
        return width ? Math.min(1, room / width) : 1;
      });
      this.frameWidth = ko.pureComputed(() => (this.deviceWidth() ? Math.round(this.deviceWidth() * this.deviceScale()) + 'px' : '100%'));
      this.frameInnerWidth = ko.pureComputed(() => (this.deviceWidth() ? this.deviceWidth() + 'px' : (100 / this.deviceScale()) + '%'));
      const SIZE_GROUPS = [
        { key: 'fit', keys: ['fit', 'desktop', 'laptop', 'custom'], title: 'Desktop (fit to the canvas)', icon: 'desktop' },
        { key: 'tablet', keys: ['tablet', 'tablet-landscape'], title: 'Tablet · 768', icon: 'tablet' },
        { key: 'phone', keys: ['phone', 'phone-small'], title: 'Mobile · 390', icon: 'phone' }
      ];
      this.sizeButtons = SIZE_GROUPS.map((g) => ({
        title: g.title,
        label: g.icon === 'desktop' ? 'Desktop' : g.icon === 'tablet' ? 'Tablet' : 'Phone',
        icon: 'factory-dz-devico factory-dz-devico-' + g.icon,
        on: ko.pureComputed(() => g.keys.includes(this.viewport())),
        css: ko.pureComputed(() => 'factory-dz-size' + (g.keys.includes(this.viewport()) ? ' factory-dz-size-on' : '')),
        pick: () => this.viewport(g.key)
      }));
      this.viewportOptions = VIEWPORTS.map((v) => ({ value: v.key, label: v.label }));
      // Canvas previews: the messages each field shows when it is checked, and the order the Tab key follows
      this.validationPreview = ko.observable(false);
      this.showFocusOrder = ko.observable(false);
      this.toggleValidationPreview = () => this.validationPreview(!this.validationPreview());
      this.toggleFocusOrder = () => this.showFocusOrder(!this.showFocusOrder());
      this.frameInnerHeight = ko.pureComputed(() => (100 / this.deviceScale()) + '%');
      this.frameTransform = ko.pureComputed(() => (this.deviceScale() < 1 ? 'scale(' + this.deviceScale() + ')' : 'none'));
      this.viewportText = ko.pureComputed(() => {
        const width = this.deviceWidth();
        return width ? width + ' px' + (this.deviceScale() < 1 ? ' · shown at ' + Math.round(this.deviceScale() * 100) + '%' : '')
          : Math.round(this.stageWidth()) + ' px';
      });
      const preview = new PreviewFrame((id) => this.selectedId(id), (targetId, sectionId) => dropOnCanvas(targetId, sectionId));
      // The workspace's UI target decides the renderer: JET, or the React Native / React app's own components.
      this.previewKind = ko.observable('jet');
      this.targetTitle = ko.observable('');
      this.appTarget = ko.pureComputed(() => this.previewKind() !== 'jet');
      this.previewSrc = ko.pureComputed(() => PreviewFrame.srcFor(this.previewKind()));
      this.previewKind.subscribe((kind) => {
        preview.reload();
        if (kind === 'react-native') {
          this.viewport('phone');
        }
      });
      this.previewNote = ko.pureComputed(() => (this.appTarget()
        ? 'Preview with the components of the ' + this.targetTitle() + ' app'
          + (this.previewKind() === 'react-native' ? ' (React Native Web; check on a device with Expo)' : '')
        : 'Oracle JET with the Redwood theme, in an OBDX page, with ' + (embedded ? 'the BRD\'s values only' : 'sample data')));

      // Code the design becomes in a React Native or React app (current saved version)
      this.codeModule = ko.observable('app');
      this.codeFiles = ko.observableArray([]);
      this.showCode = () => api.get('designs/' + this.detail().id + '/code?module=' + encodeURIComponent(this.codeModule() || 'app'))
        .then((files) => this.codeFiles(files)).catch(showError);

      // --- editing the working model ---

      // Undo and redo of edits: the models before each change (cleared when another screen opens)
      const undoStack = ko.observableArray([]);
      const redoStack = ko.observableArray([]);
      this.canUndo = ko.pureComputed(() => this.editable() && undoStack().length > 0);
      this.canRedo = ko.pureComputed(() => this.editable() && redoStack().length > 0);
      const sameAsSaved = (model) => !!this.detail() && JSON.stringify(model) === JSON.stringify(this.detail().model);

      /** Applies a change to a copy of the working model, so every change re-renders editor and preview. */
      const update = (change) => {
        if (!this.editable()) {
          return;
        }
        const before = this.working();
        const model = clone(before);
        change(model);
        if (JSON.stringify(model) === JSON.stringify(before)) {
          return;
        }
        undoStack.push(before);
        if (undoStack().length > 100) {
          undoStack.shift();
        }
        redoStack([]);
        this.working(model);
        this.dirty(!sameAsSaved(model));
      };
      this.undo = () => {
        if (!this.canUndo()) {
          return;
        }
        redoStack.push(this.working());
        const model = undoStack.pop();
        this.working(model);
        this.dirty(!sameAsSaved(model));
      };
      this.redo = () => {
        if (!this.canRedo()) {
          return;
        }
        undoStack.push(this.working());
        const model = redoStack.pop();
        this.working(model);
        this.dirty(!sameAsSaved(model));
      };
      // Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z), except while typing in a box, which has its own undo
      // Embedded, only keys pressed inside the designer (or with nothing focused) count, never in a dialog or menu over it;
      // Escape with nothing selected leaves the editor
      const onKeydown = (event) => {
        const typing = event.target && (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable);
        const inside = root === document || event.target === document.body || (root.contains && root.contains(event.target));
        if (!inside || event.defaultPrevented || document.querySelector('.fx-dialog')) {
          return;
        }
        if (embedded && event.key === 'Escape' && !typing && !event.target.closest('[role="menu"], .fx-menu, .fx-popup')
            && !this.selectedId() && !this.drawer() && !this.previewMode() && host.leave) {
          event.preventDefault();
          host.leave();
          return;
        }
        if (typing || !(event.ctrlKey || event.metaKey) || !this.detail()) {
          return;
        }
        const key = event.key.toLowerCase();
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault();
          this.undo();
        } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
          event.preventDefault();
          this.redo();
        }
      };

      const locate = (model, id) => {
        for (const section of model.sections) {
          const index = section.components.findIndex((c) => c.id === id);
          if (index >= 0) {
            return { section: section, index: index, component: section.components[index] };
          }
        }
        return null;
      };

      const newId = (model, prefix) => {
        const used = new Set();
        model.sections.forEach((s) => { used.add(s.id); s.components.forEach((c) => used.add(c.id)); });
        model.actions.forEach((a) => used.add(a.id));
        let n = 1;
        while (used.has(prefix + '-new-' + n)) {
          n++;
        }
        return prefix + '-new-' + n;
      };

      const typeLabel = (component) => {
        if (component.type === 'component') {
          return '<' + component.component + '>';
        }
        const entry = catalog().find((t) => t.value === component.type);
        return entry ? SHORT_LABELS[entry.label] || entry.label : component.type;
      };

      /** A two-way binding to one property of the working model. */
      const modelProperty = (read, write) => ko.pureComputed({
        read: () => (this.working() ? read(this.working()) : null),
        write: (value) => update((model) => write(model, value))
      });

      this.screenTitle = modelProperty((m) => m.title, (m, v) => { m.title = v; });
      this.screenName = modelProperty((m) => m.name, (m, v) => { m.name = v; });

      // --- what is selected: a component, a section, an action button, or nothing (the screen) ---

      this.selectedKind = ko.pureComputed(() => {
        const model = this.working();
        const id = this.selectedId();
        if (!model || !id) {
          return 'screen';
        }
        if (locate(model, id)) {
          return 'component';
        }
        if (model.sections.some((s) => s.id === id)) {
          return 'section';
        }
        return model.actions.some((a) => a.id === id) ? 'action' : 'screen';
      });
      this.selectScreen = () => this.selectedId(null);

      this.addSection = () => update((m) => {
        const id = newId(m, 's');
        m.sections.push({ id: id, title: 'New section', columns: 2, components: [] });
        setTimeout(() => this.selectedId(id));
      });
      this.addAction = () => update((m) => {
        const id = newId(m, 'a');
        m.actions.push({ id: id, label: 'New button', kind: m.actions.length === 0 ? 'primary' : 'secondary' });
        setTimeout(() => this.selectedId(id));
      });

      /** Moves a component up or down, across section boundaries at the ends of a section. */
      const move = (id, delta) => update((m) => {
        const flat = [];
        m.sections.forEach((s, si) => s.components.forEach((c, ci) => flat.push({ si: si, ci: ci })));
        const position = flat.findIndex((p) => m.sections[p.si].components[p.ci].id === id);
        const target = position + delta;
        if (position < 0 || target < 0 || target >= flat.length) {
          return;
        }
        const from = flat[position];
        const to = flat[target];
        const [component] = m.sections[from.si].components.splice(from.ci, 1);
        if (from.si === to.si) {
          m.sections[to.si].components.splice(to.ci, 0, component);
        } else if (delta > 0) {
          m.sections[to.si].components.unshift(component);
        } else {
          m.sections[to.si].components.push(component);
        }
      });
      this.moveSelectedUp = () => move(this.selectedId(), -1);
      this.moveSelectedDown = () => move(this.selectedId(), 1);
      this.removeSelected = () => {
        const id = this.selectedId();
        const kind = this.selectedKind();
        update((m) => {
          if (kind === 'component') {
            const found = locate(m, id);
            found.section.components.splice(found.index, 1);
          } else if (kind === 'section') {
            m.sections = m.sections.filter((s) => s.id !== id);
          } else if (kind === 'action') {
            m.actions = m.actions.filter((a) => a.id !== id);
          }
        });
        this.selectedId(null);
      };
      this.duplicateSelected = () => update((m) => {
        const found = locate(m, this.selectedId());
        if (found) {
          const copy = clone(found.component);
          copy.id = newId(m, 'c');
          copy.name = (copy.name || 'field') + 'Copy';
          found.section.components.splice(found.index + 1, 0, copy);
          setTimeout(() => this.selectedId(copy.id));
        }
      });

      // --- layers: the screen's sections, components and buttons as a tree ---

      // Each row carries its compatibility mark (see compatibility below) and its hidden condition
      const layerMark = (element) => {
        const entry = this.compatibilityOf(element);
        return entry ? { css: 'factory-dz-compat factory-dz-compat-' + entry.status.toLowerCase(), text: COMPAT_MARKS[entry.status],
          title: COMPAT_WORDS[entry.status] + ': ' + entry.evidence } : { css: 'factory-dz-compat', text: '', title: '' };
      };
      this.layers = ko.pureComputed(() => {
        const model = this.working();
        if (!model) {
          return [];
        }
        const selected = this.selectedId();
        return model.sections.map((section) => ({
          id: section.id,
          page: self,
          title: section.title || 'Section',
          selected: section.id === selected,
          selectAction: () => this.selectedId(section.id),
          components: section.components.map((c) => ({
            id: c.id,
            page: self,
            label: (c.label || c.name) + (c.required === true ? ' *' : ''),
            icon: ICONS[c.type] || '•',
            typeLabel: typeLabel(c),
            conditional: !!(c.visibleWhen && c.visibleWhen.field),
            mark: layerMark(elementOf(c)),
            selected: c.id === selected,
            selectAction: () => this.selectedId(c.id)
          }))
        }));
      });
      this.actionLayers = ko.pureComputed(() => {
        const model = this.working();
        const selected = this.selectedId();
        return model ? model.actions.map((a) => ({
          id: a.id, label: a.label, kind: a.kind, mark: layerMark('oj-button'), selected: a.id === selected, selectAction: () => this.selectedId(a.id)
        })) : [];
      });
      /**
       * Keys in the layers tree: up and down move between rows, Home and End to the ends, Enter or Space selects, and
       * Alt with up or down moves the selected component (the keyboard way to drag it).
       */
      this.layerKey = (event) => {
        const rows = [...findAll('#designLayers [data-layer]')];
        const at = rows.indexOf(document.activeElement);
        const focusRow = (row) => {
          if (row) {
            row.focus();
          }
        };
        if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          const id = document.activeElement && document.activeElement.getAttribute('data-cid');
          if (id && this.editable()) {
            this.selectedId(id);
            move(id, event.key === 'ArrowUp' ? -1 : 1);
            setTimeout(() => focusRow(find('#designLayers [data-cid="' + id + '"]')), 30);
          }
          event.preventDefault();
          return false;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          focusRow(rows[Math.min(Math.max(at + (event.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1)]);
          event.preventDefault();
          return false;
        }
        if (event.key === 'Home' || event.key === 'End') {
          focusRow(rows[event.key === 'Home' ? 0 : rows.length - 1]);
          event.preventDefault();
          return false;
        }
        if ((event.key === 'Enter' || event.key === ' ') && at >= 0) {
          // Selecting redraws the tree, so the same row gets the focus back
          const key = rows[at].getAttribute('data-layer');
          rows[at].click();
          setTimeout(() => focusRow(find('#designLayers [data-layer="' + key + '"]')), 30);
          event.preventDefault();
          return false;
        }
        return true;
      };
      this.componentCount = ko.pureComputed(() => (this.working()
        ? this.working().sections.reduce((n, s) => n + s.components.length, 0) : 0));

      // --- palette: standard components and those found in the workspace's code ---

      const codeItems = ko.observableArray([]);
      // The workspace's own components, made in the designer: placing one copies its HTML, CSS and JS into the element
      const customItems = ko.observableArray([]);
      const paletteItems = ko.pureComputed(() => customItems().map((c) => ({
        id: 'custom:' + c.id, customId: c.id, group: 'Custom components', label: c.name, type: 'component', tag: c.tag,
        params: [], description: (c.description || c.name) + (c.source ? ' · from ' + c.source : ''),
        html: c.html, css: c.css, script: c.script
      })).concat(codeItems()));
      this.paletteNote = ko.observable('');
      this.paletteFilter = ko.observable('');
      const paletteRow = (item) => ({
        id: item.id,
        page: self,
        drag: true,
        label: SHORT_LABELS[item.label] || item.label,
        icon: ICONS[item.type] || '⧉',
        detail: [item.tag ? '<' + item.tag + '>' : '', item.module || '', item.uses ? 'used ' + item.uses + '×' : '']
          .filter(Boolean).join(' · '),
        title: item.description || item.label,
        custom: !!item.customId,
        deleteAction: (event) => {
          if (event && event.stopPropagation) {
            event.stopPropagation();
          }
          deleteCustom(item);
        },
        addAction: () => addFromPalette(item, null)
      });
      // The whole "OBDX Components" tree folds away
      this.paletteOpen = ko.observable(true);
      this.togglePalette = () => this.paletteOpen(!this.paletteOpen());
      this.paletteGroups = ko.pureComputed(() => {
        const filter = (this.paletteFilter() || '').trim().toLowerCase();
        const matches = (item) => !filter || (item.label + ' ' + (item.tag || '') + ' ' + (item.module || '')).toLowerCase().includes(filter);
        const builtIn = paletteItems().filter((item) => (item.group === 'Forms' || item.group === 'Controls') && matches(item));
        // Layout: a section of the screen; it is added with a click, not dragged into another section
        const layout = !filter || 'section layout'.includes(filter) ? [{
          id: 'layout:section', page: self, drag: false, label: 'Section', icon: '▭', detail: '', custom: false,
          title: 'A section of the screen with its own title and columns. Click to add one.',
          deleteAction: () => {},
          addAction: () => {
            if (this.editable()) {
              this.addSection();
            }
          }
        }] : [];
        return [{ title: 'Layout', open: true, items: layout }]
          .concat(BUILT_IN_GROUPS.map((g) => ({
            title: g.title, open: true, items: builtIn.filter((item) => g.types.includes(item.type)).map(paletteRow)
          })))
          .concat(GROUPS.filter((group) => group !== 'Forms' && group !== 'Controls').map((group) => ({
            title: group,
            open: group !== 'Other components used in this code' || !!filter,
            items: paletteItems().filter((item) => item.group === group && matches(item)).map(paletteRow)
          })))
          .filter((group) => group.items.length > 0);
      });
      const loadCustom = (id) => api.get('workspaces/' + id + '/custom-components').then((list) => customItems(list));
      const loadPalette = (id) => Promise.all([
        api.get('workspaces/' + id + '/design-palette').then((palette) => {
          codeItems(palette.items);
          this.paletteNote(palette.note || '');
        }),
        loadCustom(id)
      ]);

      // --- making a custom component from a description, an image or a Figma frame ---

      this.newComponentName = ko.observable('');
      this.newComponentPrompt = ko.observable('');
      this.newComponentSource = ko.observable('prompt');
      this.newComponentFile = ko.observable(null);
      this.newComponentFileName = ko.pureComputed(() => (this.newComponentFile() ? this.newComponentFile().name : 'No file chosen'));
      this.newComponentFileSelected = (event) => this.newComponentFile(event.target.files[0] || null);
      this.newComponentLink = ko.observable('');
      this.componentSources = ko.pureComputed(() => [['prompt', 'Describe it'], ['file', 'Image or PDF'], ['figma', 'Figma link']]
        .map(([key, label]) => ({
          label: label,
          css: 'factory-dz-seg' + (this.newComponentSource() === key ? ' factory-dz-seg-active' : ''),
          pick: () => this.newComponentSource(key)
        })));
      this.openNewComponent = () => this.drawer(this.drawer() === 'component' ? null : 'component');
      this.createComponent = () => {
        const id = this.workspaceId();
        const source = this.newComponentSource();
        const name = this.newComponentName().trim();
        const prompt = this.newComponentPrompt().trim();
        let call;
        if (source === 'file') {
          if (!this.newComponentFile()) {
            showError(new Error('Choose an image or PDF of the component.'));
            return;
          }
          const form = new FormData();
          form.append('file', this.newComponentFile());
          form.append('name', name);
          form.append('prompt', prompt);
          call = api.upload('workspaces/' + id + '/custom-components/file', form);
        } else if (source === 'figma') {
          call = api.post('workspaces/' + id + '/custom-components/figma', { name: name, prompt: prompt, link: this.newComponentLink(), token: this.figmaToken() });
        } else {
          call = api.post('workspaces/' + id + '/custom-components', { name: name, prompt: prompt });
        }
        this.busy(true);
        showInfo('Making the component...');
        call.then((component) => {
          this.newComponentName('');
          this.newComponentPrompt('');
          this.newComponentFile(null);
          this.newComponentLink('');
          this.drawer(null);
          this.leftTab('components');
          this.leftOpen(true);
          showInfo('"' + component.name + '" is in Custom components. Drag it onto the screen.');
          return loadCustom(id);
        }).catch(showError).finally(() => this.busy(false));
      };
      const deleteCustom = (item) => ask('Delete the custom component?', '"' + item.label + '" is deleted. Screens that use it keep their copy.', 'Delete', true).then((ok) => {
        if (!ok) {
          return;
        }
        api.del('workspaces/' + this.workspaceId() + '/custom-components/' + item.customId)
          .then(() => { showInfo('Custom component deleted.'); return loadCustom(this.workspaceId()); }).catch(showError);
      });

      /** A new component (or action button) for a palette item; returns the component, or null for a button. */
      const fromPalette = (m, item) => {
        if (item.type === 'action') {
          const id = newId(m, 'a');
          m.actions.push({ id: id, label: 'New button', kind: m.actions.length === 0 ? 'primary' : 'secondary' });
          setTimeout(() => this.selectedId(id));
          return null;
        }
        const entry = catalog().find((t) => t.value === item.type);
        const params = {};
        (item.params || []).forEach((p) => { params[p] = ''; });
        return {
          id: newId(m, 'c'),
          type: item.type,
          name: camel(SHORT_LABELS[item.label] || item.label) || 'field',
          label: SHORT_LABELS[item.label] || item.label,
          options: entry && entry.hasOptions ? (item.type === 'table' ? ['Column 1', 'Column 2'] : ['Option 1', 'Option 2']) : [],
          validations: [],
          component: item.type === 'component' ? item.tag : null,
          params: item.type === 'component' ? params : {},
          html: item.html || null,
          css: item.css || null,
          script: item.script || null
        };
      };

      /**
       * Adds a palette item before the component with targetId, or at the end of the section with sectionId, or
       * else after the selected component (or at the end of the selected section, or of the last section).
       */
      const addFromPalette = (item, targetId, sectionId) => update((m) => {
        const component = fromPalette(m, item);
        if (!component) {
          return;
        }
        const target = targetId ? locate(m, targetId) : null;
        const selectedComponent = !target && !sectionId && this.selectedId() ? locate(m, this.selectedId()) : null;
        const section = (sectionId && m.sections.find((s) => s.id === sectionId))
          || (!target && !selectedComponent && m.sections.find((s) => s.id === this.selectedId()))
          || m.sections[m.sections.length - 1];
        if (target) {
          target.section.components.splice(target.index, 0, component);
        } else if (selectedComponent && !sectionId) {
          selectedComponent.section.components.splice(selectedComponent.index + 1, 0, component);
        } else {
          section.components.push(component);
        }
        setTimeout(() => this.selectedId(component.id));
      });

      // --- drag and drop: palette items and layers onto the layers tree or the canvas ---

      // A component of the screen being moved (draggedId), or a palette item being added (draggedItem)
      let draggedId = null;
      let draggedItem = null;
      this.dragStart = (event) => {
        draggedId = event.currentTarget.getAttribute('data-cid');
        draggedItem = null;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', draggedId);
      };
      this.paletteDragStart = (event) => {
        const id = event.currentTarget.getAttribute('data-pid');
        draggedItem = paletteItems().find((item) => item.id === id) || null;
        draggedId = null;
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', id);
      };
      // Where a drop on the layers tree would land: a line above the row it goes before, or the section it goes into
      let dropMark = null;
      const markDrop = (element, css) => {
        if (dropMark && (dropMark.element !== element || dropMark.css !== css)) {
          dropMark.element.classList.remove(dropMark.css);
          dropMark = null;
        }
        if (element && !dropMark) {
          element.classList.add(css);
          dropMark = { element: element, css: css };
        }
      };
      // A drop on the canvas arrives as a message after dragend, so the dragged thing is forgotten a moment later.
      this.dragEnd = () => {
        markDrop(null);
        setTimeout(() => { draggedId = null; draggedItem = null; }, 300);
      };
      this.dragOver = (event) => {
        if (draggedId || (draggedItem && this.editable())) {
          event.preventDefault();
          const row = event.currentTarget.hasAttribute('data-cid') ? event.currentTarget : null;
          if (row) {
            event.stopPropagation();
            markDrop(row, 'factory-layer-drop-before');
          } else {
            markDrop(event.currentTarget, 'factory-layer-drop-into');
          }
        }
      };
      this.dragLeave = (event) => {
        if (dropMark && dropMark.element === event.currentTarget && !event.currentTarget.contains(event.relatedTarget)) {
          markDrop(null);
        }
      };
      // Enter or Space on a palette item adds it, like a click
      this.paletteKey = (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
          event.currentTarget.click();
          event.preventDefault();
          return false;
        }
        return true;
      };
      const moveComponent = (id, targetId, sectionId) => update((m) => {
        const from = locate(m, id);
        if (!from) {
          return;
        }
        const [component] = from.section.components.splice(from.index, 1);
        const to = targetId ? locate(m, targetId) : null;
        if (to) {
          to.section.components.splice(to.index, 0, component);
        } else {
          (m.sections.find((s) => s.id === sectionId) || from.section).components.push(component);
        }
      });
      const drop = (targetId, sectionId) => {
        const id = draggedId;
        const item = draggedItem;
        draggedId = null;
        draggedItem = null;
        if (item) {
          addFromPalette(item, targetId, sectionId);
        } else if (id && id !== targetId) {
          moveComponent(id, targetId, sectionId);
        }
      };
      const dropOnCanvas = (targetId, sectionId) => {
        if (this.editable()) {
          drop(targetId, sectionId);
        }
      };
      this.dropOnComponent = (event) => {
        event.preventDefault();
        event.stopPropagation();
        markDrop(null);
        drop(event.currentTarget.getAttribute('data-cid'), null);
      };
      this.dropOnSection = (event) => {
        event.preventDefault();
        markDrop(null);
        drop(null, event.currentTarget.getAttribute('data-sid'));
      };

      // --- properties of the selection ---

      this.selectedComponent = ko.pureComputed(() => {
        const model = this.working();
        const found = model && this.selectedId() ? locate(model, this.selectedId()) : null;
        return found ? found.component : null;
      });
      this.selectedTitle = ko.pureComputed(() => {
        const c = this.selectedComponent();
        if (c) {
          return c.label || c.name;
        }
        const model = this.working();
        const id = this.selectedId();
        const section = model && id ? model.sections.find((s) => s.id === id) : null;
        if (section) {
          return section.title || 'Section';
        }
        const action = model && id ? model.actions.find((a) => a.id === id) : null;
        return action ? action.label + ' button' : 'Screen';
      });
      // What Ask AI changes: the selected element only, or the whole screen
      this.aiScope = ko.pureComputed(() => (this.selectedKind() === 'screen' ? 'Whole screen' : this.selectedTitle()));
      this.aiScoped = ko.pureComputed(() => this.selectedKind() !== 'screen');
      this.aiPlaceholder = ko.pureComputed(() => (this.aiScoped()
        ? 'Ask AI to change ' + this.selectedTitle() + ' only…'
        : 'Ask AI to change this screen, e.g. make remarks optional'));
      this.clearAiScope = () => this.selectedId(null);
      this.selectedTypeLabel = ko.pureComputed(() => (this.selectedComponent() ? typeLabel(this.selectedComponent()) : ''));
      this.selectedHasOptions = ko.pureComputed(() => {
        const c = this.selectedComponent();
        const entry = c ? catalog().find((t) => t.value === c.type) : null;
        return entry ? entry.hasOptions : false;
      });
      this.selectedIsComponent = ko.pureComputed(() => !!this.selectedComponent() && this.selectedComponent().type === 'component');
      this.optionsLabel = ko.pureComputed(() => (this.selectedComponent() && this.selectedComponent().type === 'table'
        ? 'Columns (one per line)' : 'Options (one per line)'));

      const componentProperty = (read, write) => modelProperty(
        (m) => { const found = locate(m, this.selectedId()); return found ? read(found.component) : null; },
        (m, value) => { const found = locate(m, this.selectedId()); if (found) { write(found.component, value); } });
      const sectionProperty = (read, write) => modelProperty(
        (m) => { const s = m.sections.find((x) => x.id === this.selectedId()); return s ? read(s) : null; },
        (m, value) => { const s = m.sections.find((x) => x.id === this.selectedId()); if (s) { write(s, value); } });
      const actionProperty = (read, write) => modelProperty(
        (m) => { const a = m.actions.find((x) => x.id === this.selectedId()); return a ? read(a) : null; },
        (m, value) => { const a = m.actions.find((x) => x.id === this.selectedId()); if (a) { write(a, value); } });
      const lines = (text) => (text || '').split('\n').map((line) => line.trim()).filter((line) => line);

      this.propLabel = componentProperty((c) => c.label, (c, v) => { c.label = v; });
      this.propName = componentProperty((c) => c.name, (c, v) => { c.name = v; });
      this.propType = componentProperty((c) => c.type, (c, v) => {
        c.type = v;
        const entry = catalog().find((t) => t.value === v);
        if (entry && entry.hasOptions && (!c.options || c.options.length === 0)) {
          c.options = v === 'table' ? ['Column 1', 'Column 2'] : ['Option 1', 'Option 2'];
        }
      });
      // Mandatory as a segmented choice: yes, no, or not specified
      this.requiredChoices = ko.pureComputed(() => {
        const c = this.selectedComponent();
        const current = !c ? null : c.required === true ? 'yes' : c.required === false ? 'no' : 'unknown';
        return [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Not specified' }].map((choice) => ({
          label: choice.label,
          active: choice.value === current,
          pick: () => update((m) => {
            const found = locate(m, this.selectedId());
            if (found) {
              found.component.required = choice.value === 'yes' ? true : choice.value === 'no' ? false : null;
            }
          })
        }));
      });
      this.propMaxLength = componentProperty((c) => c.maxLength || null, (c, v) => { c.maxLength = v || null; });
      this.propDefault = componentProperty((c) => c.defaultValue || '', (c, v) => { c.defaultValue = v || null; });
      this.propPlaceholder = componentProperty((c) => c.placeholder || '', (c, v) => { c.placeholder = v || null; });
      this.propHelp = componentProperty((c) => c.helpText || '', (c, v) => { c.helpText = v || null; });
      this.propReadonly = componentProperty((c) => c.readonly === true, (c, v) => { c.readonly = v ? true : null; });
      this.propOptions = componentProperty((c) => (c.options || []).join('\n'), (c, v) => { c.options = lines(v); });
      this.propValidations = componentProperty((c) => (c.validations || []).join('\n'), (c, v) => { c.validations = lines(v); });
      this.propComponent = componentProperty((c) => c.component || '', (c, v) => { c.component = (v || '').trim() || null; });
      // Parameters as "name: value" lines
      this.propParams = componentProperty(
        (c) => Object.keys(c.params || {}).map((key) => key + ': ' + c.params[key]).join('\n'),
        (c, v) => {
          const params = {};
          lines(v).forEach((line) => {
            const colon = line.indexOf(':');
            const key = (colon < 0 ? line : line.slice(0, colon)).trim();
            if (key) {
              params[key] = colon < 0 ? '' : line.slice(colon + 1).trim();
            }
          });
          c.params = params;
        });
      // Where an element's values come from: its fixed options, or an API (the requirement's APIs are offered)
      const VALUE_TYPES = ['select', 'account', 'radio', 'checkbox', 'table', 'component'];
      this.selectedHasValues = ko.pureComputed(() => !!this.selectedComponent() && VALUE_TYPES.includes(this.selectedComponent().type));
      this.valueSources = ko.pureComputed(() => {
        const c = this.selectedComponent();
        const api = !!(c && c.dataSource);
        return [['fixed', 'Fixed list'], ['api', 'From an API']].map(([key, label]) => ({
          label: label,
          css: 'factory-dz-seg' + ((key === 'api') === api ? ' factory-dz-seg-active' : ''),
          pick: () => update((m) => {
            const found = locate(m, this.selectedId());
            if (!found) {
              return;
            }
            if (key === 'api' && !found.component.dataSource) {
              const guess = found.component.type === 'account' ? 'GET /digx/v1/accounts/demandDeposit' : '';
              found.component.dataSource = { api: guess, path: found.component.type === 'account' ? 'accounts' : '', valueField: 'id', labelField: 'displayName' };
            } else if (key === 'fixed') {
              found.component.dataSource = null;
            }
          })
        }));
      });
      this.selectedFromApi = ko.pureComputed(() => !!this.selectedComponent() && !!this.selectedComponent().dataSource);
      const sourceField = (key) => componentProperty((c) => (c.dataSource ? c.dataSource[key] || '' : ''), (c, v) => {
        if (c.dataSource) {
          c.dataSource[key] = (v || '').trim();
        }
      });
      this.propApi = sourceField('api');
      this.propApiPath = sourceField('path');
      this.propApiValue = sourceField('valueField');
      this.propApiLabel = sourceField('labelField');
      this.apiSuggestions = ko.pureComputed(() => {
        const requirement = this.requirement();
        return requirement && requirement.spec ? (requirement.spec.apis || []).map((a) => ((a.method ? a.method + ' ' : '') + a.name).trim()) : [];
      });

      // Conditions: shown only when, mandatory only when another element meets a condition
      this.conditionFields = ko.pureComputed(() => {
        const model = this.working();
        const id = this.selectedId();
        return model ? model.sections.reduce((all, s) => all.concat(s.components), [])
          .filter((c) => c.id !== id).map((c) => ({ value: c.id, label: c.label || c.name })) : [];
      });
      this.conditionOperators = [
        { value: 'filled', label: 'has a value' }, { value: 'empty', label: 'is empty' },
        { value: 'equals', label: 'is' }, { value: 'notEquals', label: 'is not' }
      ];
      const conditionPart = (key, part) => componentProperty(
        (c) => (c[key] ? c[key][part] || (part === 'operator' ? 'filled' : '') : (part === 'operator' ? 'filled' : '')),
        (c, v) => {
          if (part === 'field') {
            c[key] = v ? { field: v, operator: c[key] ? c[key].operator : 'filled', value: c[key] ? c[key].value : '' } : null;
          } else if (c[key]) {
            c[key][part] = v;
          }
        });
      this.visibleField = conditionPart('visibleWhen', 'field');
      this.visibleOperator = conditionPart('visibleWhen', 'operator');
      this.visibleValue = conditionPart('visibleWhen', 'value');
      this.requiredField = conditionPart('requiredWhen', 'field');
      this.requiredOperator = conditionPart('requiredWhen', 'operator');
      this.requiredValue = conditionPart('requiredWhen', 'value');
      this.visibleNeedsValue = ko.pureComputed(() => ['equals', 'notEquals'].includes(this.visibleOperator()));
      this.requiredNeedsValue = ko.pureComputed(() => ['equals', 'notEquals'].includes(this.requiredOperator()));

      // --- the selection's compatibility, focus order and accessibility ---

      this.selectedCompat = ko.pureComputed(() => {
        const kind = this.selectedKind();
        const element = kind === 'component' ? elementOf(this.selectedComponent()) : kind === 'action' ? 'oj-button' : null;
        if (!element) {
          return null;
        }
        const entry = this.compatibilityOf(element);
        const status = entry ? entry.status : null;
        return {
          element: '<' + element + '>',
          text: status ? COMPAT_WORDS[status] + ' for OBDX ' + this.obdxVersion() : 'Checking…',
          evidence: entry ? entry.evidence : '',
          css: 'factory-dz-compat-line' + (status ? ' factory-dz-compat-line-' + status.toLowerCase() : ''),
          mark: status ? COMPAT_MARKS[status] : '…'
        };
      });
      // Keyboard focus moves through the screen in document order: the sections top to bottom, each section's fields in
      // the order of its layers, then the buttons. Read-only values, tables and elements with their own code are left out.
      const FOCUSLESS = ['display', 'table', 'component'];
      this.focusOrder = ko.pureComputed(() => {
        const model = this.working();
        if (!model) {
          return [];
        }
        const order = [];
        model.sections.forEach((s) => s.components.forEach((c) => {
          if (!FOCUSLESS.includes(c.type) && c.readonly !== true && !c.html && !c.script) {
            order.push({ id: c.id, label: c.label || c.name, kind: typeLabel(c), note: c.visibleWhen && c.visibleWhen.field ? 'only while shown' : '' });
          }
        }));
        model.actions.forEach((a) => order.push({ id: a.id, label: a.label, kind: 'Button', note: '' }));
        const selected = this.selectedId();
        return order.map((item, i) => Object.assign(item, {
          number: i + 1,
          css: 'factory-dz-focusrow' + (item.id === selected ? ' factory-dz-focusrow-on' : ''),
          selectAction: () => this.selectedId(item.id)
        }));
      });
      this.focusPosition = ko.pureComputed(() => {
        const item = this.focusOrder().find((f) => f.id === this.selectedId());
        return item ? item.number + ' of ' + this.focusOrder().length : 'Not a tab stop';
      });
      // What a screen reader announces for the selected field, and what to fix
      this.accessibility = ko.pureComputed(() => {
        const c = this.selectedComponent();
        const action = this.selectedKind() === 'action' && this.working() ? this.working().actions.find((a) => a.id === this.selectedId()) : null;
        if (!c && !action) {
          return null;
        }
        const notes = [];
        const add = (level, text) => notes.push({ text: text, css: 'factory-dz-check factory-dz-check-' + level, icon: level === 'ok' ? '✓' : level === 'warn' ? '!' : 'i' });
        if (action) {
          if (action.label && action.label.trim()) {
            add('ok', 'Announced as the button "' + action.label + '"');
          } else {
            add('warn', 'The button has no label, so a screen reader has nothing to announce');
          }
          return { name: action.label || '', description: '', notes: notes };
        }
        if (c.label && c.label.trim()) {
          add('ok', 'Announced by its label "' + c.label + '"' + (c.required === true ? ', as required' : ''));
        } else {
          add('warn', 'No label: a screen reader announces nothing useful. Give it a label under Properties.');
        }
        if (c.placeholder && (!c.label || !c.label.trim())) {
          add('warn', 'A placeholder disappears while typing and is not a label');
        }
        if (c.helpText) {
          add('ok', 'Its help text describes it');
        }
        if (c.visibleWhen && c.visibleWhen.field) {
          add('info', 'Shown only when another field meets a condition; it is out of the focus order while hidden');
        }
        if (c.html || c.script) {
          add('info', 'It is drawn by its own HTML: check its labels and keyboard use there');
        }
        if (c.type === 'table') {
          add('info', 'A table needs a caption or a heading; its columns are its headers');
        }
        return { name: c.label || '', description: c.helpText || '', notes: notes };
      });
      // The events of the selection: the conditions it drives or follows, or what a button does
      this.selectedEvents = ko.pureComputed(() => {
        const id = this.selectedId();
        const model = this.working();
        if (!model || !id) {
          return [];
        }
        return this.eventRows().filter((row) => row.ids.indexOf(id) >= 0);
      });

      // The element's own HTML, CSS and JS; a value binding commits when the box loses focus, so the canvas does not redraw per key
      this.codeTab = ko.observable('html');
      this.codeTabs = ko.pureComputed(() => [['html', 'HTML'], ['css', 'CSS'], ['js', 'JS']].map(([key, label]) => {
        const c = this.selectedComponent();
        const filled = !!c && !!c[key === 'js' ? 'script' : key];
        return {
          label: label + (filled ? ' ●' : ''),
          css: 'factory-dz-seg' + (this.codeTab() === key ? ' factory-dz-seg-active' : ''),
          pick: () => this.codeTab(key)
        };
      }));
      const codeField = (key) => componentProperty((c) => c[key] || '', (c, v) => { c[key] = (v || '').trim() ? v : null; });
      this.propHtml = codeField('html');
      this.propCss = codeField('css');
      this.propScript = codeField('script');
      this.hasOwnCode = ko.pureComputed(() => {
        const c = this.selectedComponent();
        return !!c && !!(c.html || c.css || c.script);
      });
      const escapeHtml = (text) => String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      /** Plain markup like the generated element, to start editing from. */
      this.startFromGenerated = () => {
        const c = this.selectedComponent();
        if (!c) {
          return;
        }
        const label = '<label for="' + escapeHtml(c.name) + '">' + escapeHtml(c.label) + (c.required ? ' *' : '') + '</label>\n';
        const options = (c.options || []).map((o) => escapeHtml(o));
        let markup;
        if (c.type === 'select' || c.type === 'account') {
          markup = label + '<select id="' + escapeHtml(c.name) + '">\n' + options.map((o) => '  <option>' + o + '</option>').join('\n') + '\n</select>';
        } else if (c.type === 'radio' || c.type === 'checkbox') {
          markup = '<fieldset>\n  <legend>' + escapeHtml(c.label) + '</legend>\n' + options.map((o) => '  <label><input type="' + c.type
            + '" name="' + escapeHtml(c.name) + '"> ' + o + '</label>').join('\n') + '\n</fieldset>';
        } else if (c.type === 'table') {
          markup = '<table>\n  <thead><tr>' + options.map((o) => '<th>' + o + '</th>').join('') + '</tr></thead>\n  <tbody></tbody>\n</table>';
        } else if (c.type === 'textarea') {
          markup = label + '<textarea id="' + escapeHtml(c.name) + '" rows="3"></textarea>';
        } else {
          const type = c.type === 'date' ? 'date' : c.type === 'number' || c.type === 'amount' ? 'number' : 'text';
          markup = label + '<input id="' + escapeHtml(c.name) + '" type="' + type + '"' + (c.placeholder ? ' placeholder="' + escapeHtml(c.placeholder) + '"' : '') + '>';
        }
        this.propHtml(markup);
        this.codeTab('html');
      };
      this.clearOwnCode = () => update((m) => {
        const found = locate(m, this.selectedId());
        if (found) {
          found.component.html = null;
          found.component.css = null;
          found.component.script = null;
        }
      });

      this.propSectionTitle = sectionProperty((s) => s.title || '', (s, v) => { s.title = v || null; });
      this.propSectionColumns = sectionProperty((s) => s.columns || 2, (s, v) => { s.columns = v; });
      this.propActionLabel = actionProperty((a) => a.label, (a, v) => { a.label = v; });
      this.propActionKind = actionProperty((a) => a.kind, (a, v) => { a.kind = v; });

      // The screen's place in an OBDX transaction flow, and the channels it is for
      this.stageOptions = [
        { value: 'initiate', label: 'Initiate (enter the details)' }, { value: 'review', label: 'Review (check before confirming)' },
        { value: 'confirm', label: 'Confirm (the outcome)' }, { value: 'inquiry', label: 'Inquiry (list, lookup or details)' }
      ];
      this.propStage = modelProperty((m) => m.stage || null, (m, v) => { m.stage = v || null; });
      const CHANNELS = [['desktop', 'Desktop web'], ['tablet', 'Tablet'], ['mobile-web', 'Mobile web'], ['mobile-app', 'Mobile app']];
      this.channelChoices = ko.pureComputed(() => {
        const chosen = (this.working() && this.working().channels) || [];
        return CHANNELS.map(([key, label]) => ({
          label: label,
          css: 'factory-dz-channel' + (chosen.includes(key) ? ' factory-dz-channel-on' : ''),
          on: chosen.includes(key),
          pick: () => update((m) => {
            const list = (m.channels || []).slice();
            m.channels = list.includes(key) ? list.filter((x) => x !== key) : list.concat([key]);
          })
        }));
      });
      this.channelsText = ko.pureComputed(() => {
        const chosen = (this.working() && this.working().channels) || [];
        return chosen.length === 0 ? 'All channels' : CHANNELS.filter(([key]) => chosen.includes(key)).map(([, label]) => label).join(', ');
      });
      /** The canvas size for the screen's channels: a phone for mobile-only screens, a tablet for tablet-only ones. */
      const sizeForChannels = (channels) => {
        if (!channels || channels.length === 0 || channels.includes('desktop')) {
          return 'fit';
        }
        return channels.includes('tablet') && !channels.some((c) => c.startsWith('mobile')) ? 'tablet' : 'phone';
      };
      this.canMakeFlow = ko.pureComputed(() => this.editable() && (!this.working() || !this.working().stage || this.working().stage === 'initiate'));
      this.makeFlowScreens = () => {
        if (this.dirty()) {
          showError(new Error('Save or discard your changes first.'));
          return;
        }
        this.busy(true);
        api.post('designs/' + this.detail().id + '/flow-screens')
          .then((created) => api.get('designs/' + this.detail().id).then((detail) => {
            show(detail, true);
            showInfo('Made ' + created.map((d) => '"' + d.name + '"').join(' and ') + ' from this screen. Open them in the journey above.');
          }))
          .catch(showError)
          .finally(() => this.busy(false));
      };

      // --- the journey: the screens of the open screen's requirement, in the order of its spec ---

      const norm = (text) => (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const specScreens = ko.pureComputed(() => {
        const requirement = this.requirement();
        return requirement && requirement.spec ? requirement.spec.screens || [] : [];
      });
      /** The spec screen this design was made from (same name). */
      this.specScreen = ko.pureComputed(() => {
        const d = this.detail();
        return d ? specScreens().find((s) => norm(s.name) === norm(d.name) || (this.working() && norm(s.name) === norm(this.working().name))) || null : null;
      });
      const statusLabel = (status) => status.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
      this.journey = ko.pureComputed(() => {
        const d = this.detail();
        if (!d || !d.requirementId) {
          return [];
        }
        // Embedded: the Studio's flow order from the server (review and confirmation after their initiate screen);
        // else the order of the spec's screens
        const flowOrder = embedded && host.order ? host.order() : null;
        const order = specScreens().map((s) => norm(s.name));
        const position = (design) => {
          const i = flowOrder ? flowOrder.indexOf(design.id) : order.indexOf(norm(design.name));
          return i < 0 ? (flowOrder || order).length : i;
        };
        return rawDesigns().filter((x) => x.requirementId === d.requirementId)
          .slice().sort((a, b) => position(a) - position(b))
          .map((x, i) => ({
            number: i + 1,
            name: x.name,
            current: x.id === d.id,
            status: x.status,
            statusText: x.id === d.id && this.dirty() ? 'Unsaved changes' : statusLabel(x.status),
            stage: (x.id === d.id && this.working() ? this.working().stage : x.stage) || '',
            stageCss: 'factory-dz-stage-badge factory-dz-stage-' + ((x.id === d.id && this.working() ? this.working().stage : x.stage) || 'none'),
            css: 'factory-dz-step' + (x.id === d.id ? ' factory-dz-step-current' : '') + ' factory-dz-step-' + x.status.toLowerCase(),
            openAction: () => this.openOther(x.id)
          }));
      });
      this.journeyTitle = ko.pureComputed(() => (this.requirement() ? this.requirement().title : ''));
      this.journeyApproved = ko.pureComputed(() => this.journey().filter((s) => s.status === 'APPROVED').length);
      this.journeyDone = ko.pureComputed(() => this.journey().length > 0 && this.journeyApproved() === this.journey().length);

      // --- checks: is the screen complete against its requirement, and is it a sound screen? ---

      const PLACEHOLDERS = ['Option 1', 'Option 2', 'Column 1', 'Column 2'];
      const SPEC_TYPES = {
        dropdown: 'select', select: 'select', list: 'select', lov: 'select', radio: 'radio', checkbox: 'checkbox', date: 'date',
        amount: 'amount', currency: 'amount', number: 'number', account: 'account', textarea: 'textarea', switch: 'switch',
        boolean: 'switch', table: 'table', display: 'display', label: 'display'
      };
      const allComponents = (model) => model.sections.reduce((list, s) => list.concat(s.components), []);

      /** What the requirement says about a field, for the model to use when it fixes the field. */
      const requirementNotes = (component) => {
        const requirement = this.requirement();
        if (!requirement || !requirement.spec) {
          return '';
        }
        const notes = [];
        const field = this.specScreen() ? this.specScreen().fields.find((f) => norm(f.name) === norm(component.name)
          || norm(f.label) === norm(component.label)) : null;
        if (field) {
          notes.push([field.type, field.source, field.notes].concat(field.validations || []).filter(Boolean).join('; '));
        }
        const key = norm(component.label);
        (requirement.spec.decisions || []).filter((d) => norm(d.question + ' ' + d.answer).includes(key))
          .forEach((d) => notes.push(d.answer));
        const text = notes.filter(Boolean).join(' | ');
        return text.length > 700 ? text.slice(0, 700) + '…' : text;
      };

      const fixWithAi = (instruction) => {
        this.aiInstruction(instruction);
        this.askAi();
      };

      const addSpecField = (field) => update((m) => {
        const type = SPEC_TYPES[norm(field.type)] || 'text';
        const entry = catalog().find((t) => t.value === type);
        const component = {
          id: newId(m, 'c'), type: type, name: field.name, label: field.label || field.name, required: field.mandatory,
          validations: field.validations || [], defaultValue: field.defaultValue || null, helpText: field.notes || null,
          options: entry && entry.hasOptions ? (type === 'table' ? ['Column 1', 'Column 2'] : ['Option 1', 'Option 2']) : []
        };
        m.sections[m.sections.length - 1].components.push(component);
        setTimeout(() => this.selectedId(component.id));
      });

      this.checks = ko.pureComputed(() => {
        const model = this.working();
        if (!model) {
          return [];
        }
        const list = [];
        const add = (level, text, id, fixLabel, fix) => list.push({
          level: level, text: text, id: id || null, fixLabel: fixLabel || '',
          css: 'factory-dz-check factory-dz-check-' + level,
          icon: level === 'ok' ? '✓' : level === 'warn' ? '!' : 'i',
          fixAction: fix || (() => this.selectedId(id || null)),
          selectAction: () => { if (id) { this.selectedId(id); } }
        });
        const components = allComponents(model);
        const spec = this.specScreen();
        if (spec) {
          const missing = (spec.fields || []).filter((f) => !components.some((c) => norm(c.name) === norm(f.name)
            || (f.label && norm(c.label) === norm(f.label))));
          if (missing.length === 0 && (spec.fields || []).length > 0) {
            add('ok', 'All ' + spec.fields.length + ' fields of the requirement are on the screen');
          }
          missing.forEach((f) => add('warn', '"' + (f.label || f.name) + '" from the requirement is not on the screen', null, 'Add',
            () => addSpecField(f)));
        } else if (this.detail() && this.detail().requirementId && this.requirement()) {
          add('info', 'The requirement has no screen named "' + this.detail().name + '", so fields cannot be compared');
        }
        // Account selectors list the customer's accounts at run time, so their options stay placeholders
        components.filter((c) => c.type !== 'account' && !c.dataSource && (c.options || []).length > 0
          && c.options.every((o) => PLACEHOLDERS.includes(o))).forEach((c) => {
          const what = c.type === 'table' ? 'columns' : 'choices';
          const notes = requirementNotes(c);
          add('warn', '"' + c.label + '" still has placeholder ' + what + ' (or load them from an API)', c.id, 'Fix with AI',
            () => fixWithAi('Replace the placeholder ' + what + ' of the component "' + c.label + '" (id ' + c.id + ') with the real '
              + what + ' for an OBDX banking screen' + (notes ? '. The requirement says: ' + notes : '') + '. Change nothing else.'));
        });
        const inputs = components.filter((c) => !['display', 'table', 'component'].includes(c.type) && c.readonly !== true);
        const unset = inputs.filter((c) => c.required !== true && c.required !== false);
        if (unset.length > 0) {
          add('info', 'Mandatory is not set for ' + unset.map((c) => '"' + c.label + '"').join(', '), unset[0].id, 'Select');
        }
        components.filter((c) => c.type === 'component' && Object.keys(c.params || {}).some((k) => !c.params[k])).forEach((c) => {
          add('info', '"' + c.label + '" has parameters without values', c.id, 'Select');
        });
        model.sections.filter((s) => s.components.length === 0).forEach((s) => {
          add('warn', 'Section "' + (s.title || 'Section') + '" is empty', s.id, 'Remove',
            () => update((m) => { m.sections = m.sections.filter((x) => x.id !== s.id); }));
        });
        // Values that come from the bank at run time need their API
        components.filter((c) => c.type === 'account' && !c.dataSource).forEach((c) => {
          add('info', '"' + c.label + '" lists the customer\'s accounts: set the API they come from', c.id, 'Set the API');
        });
        components.filter((c) => c.dataSource && !c.dataSource.api).forEach((c) => {
          add('warn', '"' + c.label + '" loads its values from an API, but no API is set', c.id, 'Set the API');
        });
        // An OBDX transaction: initiate, then review, then confirm
        const stage = model.stage;
        if (stage === 'initiate' && this.journey().length > 0) {
          const stages = this.journey().map((s) => s.stage);
          if (!stages.includes('review') || !stages.includes('confirm')) {
            add('warn', 'This initiate screen has no review and confirmation screens in its journey', null,
              'Create review and confirmation', () => this.makeFlowScreens());
          }
        }
        if (components.length === 0) {
          add('warn', 'This screen has no fields', null, 'Fix with AI',
            () => fixWithAi('Add the fields this screen needs for an OBDX banking screen, as its requirement describes. Change nothing else.'));
        }
        if ((model.channels || []).length === 0) {
          // No channel named: like the preview and code generation, the design is for every channel
          add('info', 'No channel is named; the design applies to all channels');
        }
        const phoneOnly = (model.channels || []).length > 0 && (model.channels || []).every((c) => c.startsWith('mobile'));
        model.sections.filter((s) => phoneOnly && (s.columns || 2) > 1).forEach((s) => {
          add('info', 'Section "' + (s.title || 'Section') + '" has ' + s.columns + ' columns, but the screen is for phones only', s.id,
            'Use one column', () => update((m) => { m.sections.forEach((x) => { if (x.id === s.id) { x.columns = 1; } }); }));
        });
        const primaries = model.actions.filter((a) => a.kind === 'primary');
        if (model.actions.length === 0) {
          add('warn', 'The screen has no buttons', null, 'Add Submit', () => this.addAction());
        } else if (primaries.length !== 1) {
          add('warn', (primaries.length === 0 ? 'No button is' : primaries.length + ' buttons are') + ' primary; a screen has one main button',
            model.actions[0].id, 'Make "' + model.actions[0].label + '" primary',
            () => update((m) => { m.actions.forEach((a, i) => { a.kind = i === 0 ? 'primary' : (a.kind === 'primary' ? 'secondary' : a.kind); }); }));
        } else {
          add('ok', 'One main button: ' + primaries[0].label);
        }
        // Elements the workspace's version pack forbids: approval asks to confirm them
        screenElements().forEach((element) => {
          const entry = this.compatibilityOf(element);
          if (entry && entry.status === 'UNSUPPORTED') {
            add('warn', element + ' is not supported in OBDX ' + this.obdxVersion() + ': ' + entry.evidence);
          }
        });
        return list;
      });
      this.openChecks = ko.pureComputed(() => this.checks().filter((c) => c.level === 'warn').length);
      // The title row's More menu and the screen card's actions menu
      // Embedded, new screens and the list of all screens are the Studio's
      this.pageMenuItems = ko.pureComputed(() => (embedded ? [] : [{ value: 'new', label: 'New screen', icon: 'plus', disabled: !this.canDesign() }])
        .concat([
          { value: 'component', label: 'Create a component', icon: 'cube', disabled: !this.canDesign() },
          { value: 'import', label: 'Import from Figma, an image or a PDF', icon: 'upload', disabled: !this.editable() }
        ])
        .concat(embedded ? [] : [{ value: 'board', label: 'All screens', icon: 'design' }]));
      this.screenMenuItems = ko.pureComputed(() => {
        const approved = !!this.detail() && this.detail().status === 'APPROVED';
        return [
          { value: 'reopen', label: 'Reopen for changes', disabled: !(approved && this.canApprove()) },
          { value: 'flow', label: 'Create review and confirmation screens', disabled: !this.canMakeFlow() || this.busy() },
          { value: 'comment', label: 'Comment on the screen' },
          { separator: true },
          { value: 'delete', label: 'Delete screen', icon: 'trash', danger: true, disabled: !this.canDesign() }
        ];
      });
      this.pageMenu = (event) => {
        const value = event.detail.value;
        if (value === 'new') {
          this.openNew();
        } else if (value === 'component') {
          this.openNewComponent();
        } else if (value === 'import') {
          this.openImport();
        } else if (value === 'board') {
          this.backToBoard();
        }
      };
      this.screenMenu = (event) => {
        const value = event.detail.value;
        if (value === 'share') {
          this.openShare();
        } else if (value === 'approve') {
          this.approve();
        } else if (value === 'reopen') {
          this.reopen();
        } else if (value === 'flow') {
          this.makeFlowScreens();
        } else if (value === 'comment') {
          this.selectedId(null);
          this.showComments();
          setTimeout(() => { const box = find('#commentText'); if (box) { box.focus(); } }, 50);
        } else if (value === 'delete') {
          this.remove();
        }
      };
      this.saveMenu = (event) => {
        const value = event.detail.value;
        if (value === 'save') {
          this.save();
        } else if (value === 'discard') {
          this.discard();
        } else if (value === 'previous') {
          this.restorePrevious();
        } else if (value === 'history') {
          this.showHistory();
        }
      };
      // The Save Version split button's menu
      this.saveSplit = ui.menu();
      this.saveDo = (value) => () => { this.saveSplit.close(); this.saveMenu({ detail: { value: value } }); };
      this.saveTitle = ko.pureComputed(() => {
        if (!this.detail()) {
          return '';
        }
        if (this.detail().status === 'APPROVED') {
          return 'Approved screens are read-only. Reopen it to change it.';
        }
        if (!this.canDesign()) {
          return 'You cannot change screens in this workspace.';
        }
        return this.dirty() ? 'Save the changes as version ' + (this.detail().currentVersion + 1) : 'No changes to save';
      });
      this.readOnlyNote = ko.pureComputed(() => (this.detail() && this.detail().status === 'APPROVED'
        ? 'This screen is approved, so its components are locked. Reopen it to change it, or open another screen.'
        : 'You can look at this screen but not change it.'));
      this.screenHeading = ko.pureComputed(() => (this.working() ? this.working().title || this.detail().name : ''));
      /** Back to the start page with every requirement and its screens. */
      this.backToBoard = () => (this.dirty() ? ask.apply(null, DISCARD) : Promise.resolve(true)).then((ok) => {
        if (!ok) {
          return;
        }
        this.detail(null);
        this.working(null);
        this.dirty(false);
        this.designPick(null);
        this.previewMode(false);
        this.mode('design');
      });
      // The workspace's screens, for the Screens tab
      this.screenList = ko.pureComputed(() => {
        const current = this.detail() ? this.detail().id : null;
        return rawDesigns().map((d) => ({
          name: d.name,
          meta: d.components + ' components · v' + d.currentVersion,
          status: screenStatus(d.status, statusLabel(d.status)),
          css: 'factory-dz-scr' + (d.id === current ? ' factory-dz-scr-on' : ''),
          openAction: () => { if (d.id !== current) { this.open(d.id); } }
        }));
      });

      // The journey as a stepper: the requirement's screens in order, then the OBDX review and confirm steps still to make
      const STAGE_NAMES = { initiate: 'Initiate', review: 'Review', confirm: 'Confirmation', inquiry: 'Inquiry' };
      this.journeySteps = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const steps = this.journey().length ? this.journey().map((st) => ({
          name: st.name, current: st.current, openable: !st.current, openAction: st.openAction, stage: st.stage,
          statusText: st.statusText + (st.stage ? ' · ' + (STAGE_NAMES[st.stage] || st.stage) : ''),
          status: screenStatus(st.status, st.statusText + (st.stage ? ' · ' + (STAGE_NAMES[st.stage] || st.stage) : '')),
          done: st.status === 'APPROVED', ghost: false, title: st.current ? 'This screen' : 'Open ' + st.name
        })) : [{
          name: this.screenHeading() || d.name, current: true, openable: false, openAction: () => {}, done: d.status === 'APPROVED', ghost: false,
          stage: this.working() ? this.working().stage : null, title: 'This screen',
          statusText: statusLabel(d.status) + (this.working() && this.working().stage ? ' · ' + STAGE_NAMES[this.working().stage] : ''),
          status: screenStatus(d.status, statusLabel(d.status) + (this.working() && this.working().stage ? ' · ' + STAGE_NAMES[this.working().stage] : ''))
        }];
        const stages = steps.map((st) => st.stage);
        if (stages.includes('initiate')) {
          ['review', 'confirm'].filter((stage) => !stages.includes(stage)).forEach((stage) => steps.push({
            name: STAGE_NAMES[stage], current: false, openable: false, openAction: () => {}, done: false, ghost: true, stage: stage,
            statusText: 'Not made yet', status: screenStatus('NEW', 'Not made yet'), title: 'An OBDX transaction has a ' + STAGE_NAMES[stage].toLowerCase() + ' screen. Create it with Create review and confirmation screens.'
          }));
        }
        return steps.map((st, i) => Object.assign(st, {
          number: i + 1,
          mark: st.done && !st.current ? '✓' : String(i + 1),
          css: 'factory-dz-st' + (st.current ? ' factory-dz-st-current' : '') + (st.done ? ' factory-dz-st-done' : '') + (st.ghost ? ' factory-dz-st-ghost' : '')
        }));
      });

      // Business rules of the requirement for this screen, as a table
      this.ruleRows = ko.pureComputed(() => {
        const requirement = this.requirement();
        const d = this.detail();
        if (!requirement || !requirement.spec || !d) {
          return [];
        }
        const active = requirement.status === 'APPROVED';
        return (requirement.spec.businessRules || [])
          .filter((r) => !r.screens || r.screens.length === 0 || r.screens.some((x) => norm(x) === norm(d.name)))
          .map((r, i) => {
            const severity = r.severity ? String(r.severity) : '';
            const tone = /error|high|critical/i.test(severity) ? 'red' : /warn|medium/i.test(severity) ? 'amber' : 'grey';
            return {
              id: r.id || 'BR-' + (i + 1),
              number: i + 1,
              name: r.name || r.description,
              type: r.type || 'Business',
              condition: r.condition || 'Not stated',
              conditionCss: r.condition ? '' : 'factory-dz-muted',
              action: r.action || 'Not stated',
              actionCss: r.action ? '' : 'factory-dz-muted',
              severity: severity ? { text: severity, css: 'factory-ov-pill factory-ov-pill-' + tone, title: 'Severity' }
                : { text: 'Not set', css: 'factory-ov-pill factory-ov-pill-grey', title: 'The requirement does not give a severity for this rule.' },
              active: active,
              statusText: active ? 'Active' : 'Draft',
              toggleCss: 'factory-dz-toggle' + (active ? ' factory-dz-toggle-on' : ''),
              statusTitle: active ? 'Active: the rule is in the approved requirement. Change it there to turn it off.'
                : 'The requirement is not approved yet.',
              menuLabel: 'Actions for ' + (r.id || 'BR-' + (i + 1)),
              menuItems: [
                { value: 'apply', label: 'Ask AI to apply it to this screen', disabled: !this.editable() },
                { value: 'copy', label: 'Copy the rule' },
                { value: 'requirement', label: 'Open the requirement' }
              ],
              menuAction: (event) => {
                const value = event.detail.value;
                if (value === 'apply') {
                  this.aiInstruction('Apply this business rule to the screen: ' + r.description);
                  this.selectedId(null);
                  setTimeout(() => { const box = find('#aiInstruction'); if (box) { box.focus(); } }, 50);
                } else if (value === 'copy') {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText((r.id ? r.id + ': ' : '') + r.description).then(() => showInfo('Rule copied.')).catch(() => showInfo('Copying is not allowed here.'));
                  }
                } else if (value === 'requirement') {
                  window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'requirements' }));
                }
              }
            };
          });
      });
      // Add Rule: a validation on the selected field (business rules come from the requirement)
      this.canAddRule = ko.pureComputed(() => this.editable() && this.selectedKind() === 'component');
      this.addRuleTitle = ko.pureComputed(() => {
        if (!this.editable()) {
          return 'The screen is read-only. Reopen it to add rules. Business rules come from the requirement.';
        }
        return this.selectedKind() === 'component' ? 'Add a validation rule to "' + this.selectedTitle() + '"'
          : 'Select a field on the canvas to add a validation rule to it. Business rules come from the requirement.';
      });
      this.addRule = () => {
        if (!this.canAddRule()) {
          return;
        }
        openSection('validation', '#propValidations textarea');
      };

      // Data: where each field's value comes from
      this.dataRows = ko.pureComputed(() => {
        const model = this.working();
        const selected = this.selectedId();
        return model ? allComponents(model).map((c) => ({
          field: c.label || c.name,
          binding: c.dataSource ? 'API ' + (c.dataSource.api || '(not set)') + (c.dataSource.path ? ' · ' + c.dataSource.path : '')
            : (c.options || []).length ? 'Fixed list · ' + c.options.length + ' choices'
              : c.defaultValue ? 'Default: ' + c.defaultValue : c.readonly ? 'Shown, read-only' : 'Typed by the customer',
          css: c.id === selected ? 'factory-dz-mini-on' : '',
          selectAction: () => this.selectedId(c.id)
        })) : [];
      });
      // Events: the buttons and the conditions between fields
      this.eventRows = ko.pureComputed(() => {
        const model = this.working();
        if (!model) {
          return [];
        }
        const spec = this.specScreen();
        const label = (id) => { const found = locate(model, id); return found ? found.component.label || found.component.name : id; };
        const op = (cond) => (this.conditionOperators.find((o) => o.value === cond.operator) || { label: 'has a value' }).label
          + (['equals', 'notEquals'].includes(cond.operator) ? ' "' + (cond.value || '') + '"' : '');
        const rows = model.actions.map((a) => {
          const specAction = spec ? (spec.actions || []).find((x) => norm(x.name) === norm(a.label)) : null;
          return {
            kind: 'Click', element: a.label + ' button',
            does: specAction && specAction.description ? specAction.description
              : (a.kind === 'primary' ? 'The main button. ' : '') + 'The requirement does not say what it does.',
            ids: [a.id],
            selectAction: () => this.selectedId(a.id)
          };
        });
        allComponents(model).forEach((c) => {
          if (c.visibleWhen && c.visibleWhen.field) {
            rows.push({ kind: 'Change', element: label(c.visibleWhen.field), does: 'Shows "' + (c.label || c.name) + '" when it ' + op(c.visibleWhen), ids: [c.id, c.visibleWhen.field], selectAction: () => this.selectedId(c.id) });
          }
          if (c.requiredWhen && c.requiredWhen.field) {
            rows.push({ kind: 'Change', element: label(c.requiredWhen.field), does: 'Makes "' + (c.label || c.name) + '" mandatory when it ' + op(c.requiredWhen), ids: [c.id, c.requiredWhen.field], selectAction: () => this.selectedId(c.id) });
          }
        });
        return rows;
      });

      // The AI Assistant answers questions about the screen from what the page shows
      const assistantContext = () => {
        const model = this.working();
        if (!model) {
          return '';
        }
        const lines = ['Screen "' + (model.title || this.detail().name) + '" (' + this.statusText() + ', stage ' + (model.stage || 'not set') + ').'];
        model.sections.forEach((sct) => lines.push('Section ' + (sct.title || '') + ': ' + sct.components.map((c) => (c.label || c.name) + ' [' + c.type
          + (c.required === true ? ', mandatory' : '') + ((c.validations || []).length ? ', ' + c.validations.join('; ') : '')
          + (c.dataSource && c.dataSource.api ? ', from ' + c.dataSource.api : '') + ']').join(', ')));
        lines.push('Buttons: ' + (model.actions.map((a) => a.label + ' (' + a.kind + ')').join(', ') || 'none'));
        const picked = this.selectedComponent();
        if (picked) {
          lines.push('Selected element: ' + (picked.label || picked.name || '') + ' [' + picked.type + (picked.name ? ', name ' + picked.name : '')
            + (picked.required === true ? ', mandatory' : '') + ((picked.validations || []).length ? ', ' + picked.validations.join('; ') : '')
            + (picked.dataSource && picked.dataSource.api ? ', from ' + picked.dataSource.api : '') + ']');
        }
        const requirement = this.requirement();
        if (requirement && requirement.spec) {
          const spec = requirement.spec;
          lines.push('Requirement "' + requirement.title + '": ' + (spec.summary || ''));
          lines.push('Business rules: ' + ((spec.businessRules || []).map((r) => r.description).join('; ') || 'none'));
          lines.push('APIs: ' + ((spec.apis || []).map((a) => (a.method || '') + ' ' + a.name).join(', ') || 'none'));
          lines.push('Host interfaces: ' + ((spec.hostInteractions || []).map((h) => h.system + ' (' + (h.description || '') + ')').join(', ') || 'none'));
          lines.push('Roles: ' + ((spec.roles || []).map((r) => r.name + ': ' + r.access).join('; ') || 'none'));
        }
        lines.push('Other screens in the workspace: ' + (rawDesigns().filter((x) => x.id !== this.detail().id).map((x) => x.name + ' (' + x.components + ' components)').join(', ') || 'none'));
        return lines.join('\n');
      };
      // The chips above the assistant: exactly the parts assistantContext sends
      this.aiContext = ko.pureComputed(() => {
        const model = this.working();
        if (!model) {
          return [];
        }
        const chips = [{ kind: 'Screen', text: model.title || this.detail().name, title: 'This screen: its sections, fields and buttons' }];
        const picked = this.selectedComponent();
        if (picked) {
          chips.push({ kind: 'Selected element', text: picked.label || picked.name || picked.type, title: 'The selected element and its settings' });
        }
        const requirement = this.requirement();
        if (requirement && requirement.spec) {
          chips.push({ kind: 'Requirement', text: requirement.title, title: 'The requirement: its summary, business rules, APIs, host interfaces and roles' });
        }
        const others = rawDesigns().filter((x) => x.id !== this.detail().id).length;
        if (others) {
          chips.push({ kind: 'Other screens', text: '+' + others + ' screen' + (others === 1 ? '' : 's'), title: 'The names and sizes of the other screens in the workspace' });
        }
        return chips;
      });
      this.ai = assistant.create(assistantContext, ['Explain this screen', 'Suggest validations', 'Find similar screen', 'Generate API interface', 'Create test cases']);
      this.aiChatKeydown = (event) => {
        if (event.key === 'Enter') {
          this.ai.send();
          return false;
        }
        return true;
      };
      this.checksSummary = ko.pureComputed(() => (this.openChecks() === 0 ? 'Ready to approve'
        : this.openChecks() + (this.openChecks() === 1 ? ' check to fix' : ' checks to fix')));
      this.showChecks = () => {
        this.selectedId(null);
        this.rightOpen(true);
        setTimeout(() => {
          const checks = find('#checksSection');
          if (checks) {
            checks.open = true;
            checks.scrollIntoView({ block: 'nearest' });
          }
        }, 80);
      };
      /**
       * What the requirement says about this screen: the functional requirements it serves (FR-001), the acceptance
       * criteria that check them (AC-001) and the business rules.
       */
      this.screenRules = ko.pureComputed(() => {
        const requirement = this.requirement();
        const d = this.detail();
        if (!requirement || !requirement.spec || !d) {
          return [];
        }
        const spec = requirement.spec;
        const served = (spec.requirements || []).filter((r) => (r.screens || []).some((s) => norm(s) === norm(d.name)));
        const ids = served.map((r) => r.id).filter(Boolean);
        return served.map((r) => (r.id ? r.id + (r.priority ? ' (' + r.priority + ')' : '') + ': ' : '') + (r.description || r.title))
          .concat((spec.acceptanceCriteria || []).filter((c) => (c.requirements || []).some((id) => ids.indexOf(id) >= 0))
            .map((c) => (c.id ? c.id + ': ' : '') + c.description))
          .concat((spec.businessRules || [])
            .filter((r) => !r.screens || r.screens.length === 0 || r.screens.some((s) => norm(s) === norm(d.name)))
            .map((r) => (r.id ? r.id + ': ' : '') + r.description));
      });

      // --- the canvas shows the screen in an OBDX page, with the journey's steps and the checks' warnings ---

      this.previewContext = ko.pureComputed(() => {
        const warnings = {};
        this.checks().filter((c) => c.level === 'warn' && c.id).forEach((c) => { warnings[c.id] = c.text; });
        // The journey's steps show in the strip above the canvas, not again inside the page
        const focus = {};
        if (this.showFocusOrder()) {
          this.focusOrder().forEach((f) => { focus[f.id] = f.number; });
        }
        return {
          bank: bankNames[this.workspaceId()] || 'Online banking',
          breadcrumb: 'Dashboard' + (this.journeyTitle() ? ' / ' + this.journeyTitle() : ''),
          warnings: warnings,
          editing: this.editable(),
          validation: this.validationPreview(),
          focusOrder: focus,
          // In the Design Studio, Edit shows the BRD's values only, as Review does
          brdOnly: embedded
        };
      });
      ko.computed(() => preview.show(this.working(), this.selectedId(), this.previewContext()));

      // --- comments, versions, review ---

      const componentLabel = (id) => {
        const model = this.working();
        const found = model ? locate(model, id) : null;
        const action = model && !found ? model.actions.find((a) => a.id === id) : null;
        return found ? found.component.label : action ? action.label + ' button' : id;
      };

      this.comments = ko.pureComputed(() => (this.detail() ? this.detail().comments : []).map((c) => ({
        author: c.author,
        initials: (c.author || '?').split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase(),
        text: c.text,
        meta: 'v' + c.version + (c.componentId ? ' · ' + componentLabel(c.componentId) : '') + (c.fromReview ? ' · via review link' : '')
          + ' · ' + new Date(c.createdAt).toLocaleString()
      })));
      this.versions = ko.pureComputed(() => (this.detail() ? this.detail().versions : []).map((v) => ({
        version: v.version,
        current: v.version === this.detail().currentVersion,
        origin: v.origin.charAt(0) + v.origin.slice(1).toLowerCase(),
        note: v.note || '',
        when: new Date(v.createdAt).toLocaleString(),
        loadable: this.editable() && v.version !== this.detail().currentVersion,
        // Restoring saves that version again as the newest one, so no version is ever lost
        restoreAction: () => {
          if (this.dirty()) {
            showError(new Error('Save or discard your changes first.'));
            return;
          }
          api.post('designs/' + this.detail().id + '/restore', { version: v.version })
            .then((detail) => { show(detail, true); showInfo('Version ' + v.version + ' restored as version ' + detail.currentVersion + '.'); })
            .catch(showError);
        },
        previewAction: () => api.get('designs/' + this.detail().id + '/versions/' + v.version).then((model) => {
          undoStack.push(this.working());
          redoStack([]);
          this.working(model);
          this.dirty(!sameAsSaved(model));
          showInfo('Version ' + v.version + ' is on the canvas. Save to keep it, or Undo to go back.');
        }).catch(showError)
      })));
      /** Back to the version before the current one, saved as a new version. */
      this.restorePrevious = () => {
        const previous = this.versions().find((v) => v.version < this.detail().currentVersion);
        if (previous) {
          previous.restoreAction();
        }
      };
      this.canRestorePrevious = ko.pureComputed(() => this.editable() && !this.dirty() && !!this.detail() && this.detail().currentVersion > 1);

      // Compare two versions (or the unsaved changes) in plain words; a change selects its element
      this.compareFrom = ko.observable(null);
      this.compareTo = ko.observable(null);
      this.compareOptions = ko.pureComputed(() => {
        const d = this.detail();
        if (!d) {
          return [];
        }
        const options = d.versions.slice().sort((a, b) => b.version - a.version).map((v) => ({
          value: String(v.version),
          label: 'v' + v.version + (v.version === d.currentVersion ? ' (saved)' : '') + ' · ' + v.origin.charAt(0) + v.origin.slice(1).toLowerCase()
        }));
        return this.dirty() ? [{ value: 'working', label: 'Unsaved changes' }].concat(options) : options;
      });
      const modelOf = (key) => {
        if (key === 'working') {
          return Promise.resolve(this.working());
        }
        if (Number(key) === this.detail().currentVersion) {
          return Promise.resolve(this.detail().model);
        }
        return designActions.versionModel(this.detail().id, Number(key));
      };
      this.differences = ko.observableArray([]);
      this.compareNote = ko.observable('');
      const resetCompare = () => {
        const d = this.detail();
        if (!d) {
          return;
        }
        this.compareTo(this.dirty() ? 'working' : String(d.currentVersion));
        const earlier = d.versions.filter((v) => v.version < d.currentVersion).map((v) => v.version);
        this.compareFrom(this.dirty() ? String(d.currentVersion) : earlier.length ? String(Math.max.apply(null, earlier)) : String(d.currentVersion));
      };
      this.compare = () => {
        const from = this.compareFrom();
        const to = this.compareTo();
        if (!this.detail() || !from || !to) {
          return;
        }
        if (from === to) {
          this.differences([]);
          this.compareNote(this.detail().versions.length < 2 && !this.dirty() ? 'Only one version so far. Change the screen, then compare.' : 'Choose two different versions.');
          return;
        }
        Promise.all([modelOf(from), modelOf(to)]).then(([a, b]) => {
          const label = (key) => (key === 'working' ? 'the unsaved changes' : 'v' + key);
          this.compareNote('From ' + label(from) + ' to ' + label(to) + ':');
          this.differences(designDiff(a, b).map((d) => {
            const exists = !!d.id && to === (this.dirty() ? 'working' : String(this.detail().currentVersion));
            return {
              kind: d.kind,
              text: d.text,
              css: 'factory-dz-diff factory-dz-diff-' + d.kind.toLowerCase(),
              selectable: exists,
              selectAction: () => { if (exists) { this.selectedId(d.id); } }
            };
          }));
        }).catch(showError);
      };
      ko.computed(() => {
        this.compareFrom();
        this.compareTo();
        if (this.contextTab() === 'history' && this.contextOpen()) {
          ko.ignoreDependencies(this.compare);
        }
      });
      this.contextTab.subscribe((tab) => { if (tab === 'history') { resetCompare(); } });
      this.compareVersion = ko.pureComputed(() => {
        const from = this.compareFrom();
        return from && from !== 'working' && this.detail() && Number(from) !== this.detail().currentVersion ? Number(from) : null;
      });
      /** Shows the "from" version on the canvas, to look at it or save it again (Undo goes back). */
      this.showCompareVersion = () => {
        const version = this.versions().find((v) => v.version === this.compareVersion());
        if (version) {
          version.previewAction();
        }
      };
      this.restoreCompareVersion = () => {
        const version = this.versions().find((v) => v.version === this.compareVersion());
        if (version) {
          ask('Restore version ' + version.version + '?', 'It is saved again as the newest version; no version is lost.', 'Restore').then((ok) => {
            if (ok) {
              version.restoreAction();
            }
          });
        }
      };
      this.reviewUrl = ko.pureComputed(() => (this.detail() && this.detail().reviewToken
        ? window.location.origin + window.location.pathname + '?ojr=review&embed=1&token=' + this.detail().reviewToken : ''));
      this.reviewExpires = ko.pureComputed(() => (this.detail() && this.detail().reviewExpiresAt
        ? new Date(this.detail().reviewExpiresAt).toLocaleDateString() : ''));

      // --- loading and actions ---

      const loadTarget = (id) => api.get('workspaces/' + id + '/target').then((target) => {
        this.targetTitle(target.title);
        this.previewKind(target.preview);
      });

      const loadDesigns = () => {
        const id = this.workspaceId();
        if (id) {
          loadTarget(id).catch(showError);
        }
        if (!id) {
          this.designs([]);
          rawDesigns([]);
          requirements([]);
          designOptions([]);
          return Promise.resolve();
        }
        return Promise.all([api.get('workspaces/' + id + '/designs'), api.get('workspaces/' + id + '/requirements')])
          .then(([designList, requirementList]) => {
            rawDesigns(designList);
            requirements(requirementList);
            const current = this.detail() ? this.detail().id : null;
            this.designs(designList.map((d) => ({
              name: d.name, status: d.status, statusPill: screenStatus(d.status, d.status.replace('_', ' ').toLowerCase()), selected: d.id === current, openAction: () => this.open(d.id)
            })));
            designOptions(designList.map((d) => ({ value: d.id, label: d.name + ' (' + d.status.replace('_', ' ').toLowerCase() + ')' })));
          }).catch(showError);
      };

      const requirementCache = {};
      const loadRequirement = (requirementId) => {
        if (!requirementId) {
          this.requirement(null);
          return;
        }
        if (requirementCache[requirementId]) {
          this.requirement(requirementCache[requirementId]);
          return;
        }
        api.get('requirements/' + requirementId).then((requirement) => {
          requirementCache[requirementId] = requirement;
          if (this.detail() && this.detail().requirementId === requirementId) {
            this.requirement(requirement);
          }
        }).catch(() => this.requirement(null));
      };

      const show = (detail, keepSelection) => {
        if (!this.detail() || this.detail().id !== detail.id) {
          this.codeFiles([]);
          this.ai.clear();
          loadRequirement(detail.requirementId);
          undoStack([]);
          redoStack([]);
          if (!this.appTarget()) {
            this.viewport(sizeForChannels(detail.model.channels));
          }
        }
        this.detail(detail);
        this.designPick(detail.id);
        this.working(clone(detail.model));
        this.dirty(false);
        if (!keepSelection) {
          this.selectedId(null);
        }
        resetCompare();
        loadDesigns();
        // A saved change (a version, approval, reopening, new flow screens): the Studio shows it too
        if (keepSelection && host.changed) {
          host.changed(detail);
        }
      };

      /** Asks before unsaved changes are lost; resolves true when there are none or they may go. */
      this.confirmDiscard = () => (this.dirty() ? ask.apply(null, DISCARD) : Promise.resolve(true));
      /** Empties the designer when the Studio closes Edit: no screen, no unsaved changes, nothing left to check. */
      this.clear = () => {
        this.detail(null);
        this.working(null);
        this.dirty(false);
        this.selectedId(null);
        this.drawer(null);
        this.previewMode(false);
        this.mode('design');
        this.clearMessages();
      };
      /** Opens a screen without asking (the caller has asked: the Studio's guard). */
      let loading = null;
      this.load = (id) => {
        options.designId = id;
        loading = id;
        this.clearMessages();
        this.drawer(null);
        // Only the screen asked for last is shown, whichever answer comes first
        return api.get('designs/' + id).then((detail) => { if (options.designId === id) { show(detail); } })
          .catch(showError).finally(() => { if (loading === id) { loading = null; } });
      };
      this.open = (id) => this.confirmDiscard().then((ok) => {
        if (!ok) {
          this.designPick(this.detail() ? this.detail().id : null);
          return null;
        }
        return this.load(id);
      });
      // Another screen of the journey: embedded, the Studio selects it (and asks about unsaved changes)
      this.openOther = (id) => (embedded && host.select ? host.select(id) : this.open(id));
      this.designPick.subscribe((id) => {
        if (id && (!this.detail() || this.detail().id !== id)) {
          this.open(id);
        }
      });

      this.createBlank = () => api.post('workspaces/' + this.workspaceId() + '/designs', { name: this.blankName() })
        .then((detail) => { this.blankName(''); this.drawer(null); show(detail); })
        .catch(showError);

      const base = () => 'designs/' + this.detail().id;

      this.save = () => api.put(base() + '/model', { model: this.working(), note: null })
        .then((detail) => { show(detail, true); showInfo('Saved as version ' + detail.currentVersion + '.'); })
        .catch(showError);

      this.discard = () => {
        if (this.dirty()) {
          undoStack.push(this.working());
          redoStack([]);
        }
        this.working(clone(this.detail().model));
        this.dirty(false);
        this.clearMessages();
      };

      this.askAi = () => {
        if (!this.aiInstruction()) {
          return;
        }
        if (this.dirty()) {
          showError(new Error('Save or discard your changes first.'));
          return;
        }
        this.busy(true);
        const targetId = this.selectedKind() === 'screen' ? null : this.selectedId();
        showInfo(targetId ? 'Changing ' + this.selectedTitle() + '...' : 'Changing the screen...');
        api.post(base() + '/ai-change', { instruction: this.aiInstruction(), targetId: targetId })
          .then((detail) => {
            show(detail, true);
            this.aiInstruction('');
            showInfo('Changed and saved as version ' + detail.currentVersion + '. Check the result; ↺ Previous brings the earlier version back.');
          })
          .catch(showError)
          .finally(() => this.busy(false));
      };

      // --- importing a design from a design tool ---

      this.designFile = ko.observable(null);
      this.designFileName = ko.pureComputed(() => (this.designFile() ? this.designFile().name : 'No file chosen'));
      this.designFileSelected = (event) => this.designFile(event.target.files[0] || null);
      this.figmaLink = ko.observable('');
      // Kept only while the page is open, so several frames can be imported without typing it again
      this.figmaToken = ko.observable('');

      const runImport = (call, what) => {
        if (this.dirty()) {
          showError(new Error('Save or discard your changes first.'));
          return;
        }
        this.busy(true);
        showInfo('Importing ' + what + '...');
        call()
          .then((detail) => {
            show(detail, true);
            this.drawer(null);
            showInfo('Imported ' + what + ' as version ' + detail.currentVersion + '. Check the result; History has the earlier versions.');
          })
          .catch(showError)
          .finally(() => this.busy(false));
      };
      this.importFile = () => {
        const form = new FormData();
        form.append('file', this.designFile());
        runImport(() => api.upload(base() + '/import', form).then((detail) => { this.designFile(null); return detail; }),
          this.designFile().name);
      };
      this.importFigma = () => runImport(() => api.post(base() + '/import-figma', { link: this.figmaLink(), token: this.figmaToken() })
        .then((detail) => { this.figmaLink(''); return detail; }), 'the Figma frame');

      this.openReview = () => api.post(base() + '/review-link', {})
        .then((detail) => { show(detail, true); showInfo('Review link created. Copy it and send it to the customer.'); })
        .catch(showError);
      this.closeReview = () => api.del(base() + '/review-link').then((detail) => { show(detail, true); showInfo('Review link closed.'); }).catch(showError);
      this.copyReviewLink = () => {
        const input = find('#reviewUrl');
        input.select();
        (navigator.clipboard ? navigator.clipboard.writeText(this.reviewUrl()) : Promise.resolve(document.execCommand('copy')))
          .then(() => showInfo('Review link copied.'))
          .catch(() => showInfo('Select the link and copy it.'));
      };
      // Approve and reopen ask first, as in the Design Studio (services/designActions)
      this.approve = () => designActions.approveScreen(this.detail().id, this.detail().name, this.detail().currentVersion)
        .then((detail) => { if (detail) { show(detail, true); showInfo('Screen approved for development.'); } })
        .catch(showError);
      this.reopen = () => designActions.reopen(this.detail().id, this.detail().name)
        .then((detail) => { if (detail) { show(detail, true); showInfo('Screen reopened for changes.'); } })
        .catch(showError);
      this.remove = () => ask('Delete this screen?', 'The screen, all its versions and its comments are deleted. This cannot be undone.', 'Delete', true).then((ok) => {
        if (!ok) {
          return;
        }
        const id = this.detail().id;
        api.del(base()).then(() => {
          if (embedded && host.deleted) {
            this.dirty(false);
            showInfo('Screen deleted.');
            host.deleted(id);
            return;
          }
          this.detail(null);
          this.working(null);
          this.dirty(false);
          this.designPick(null);
          loadDesigns();
          showInfo('Screen deleted.');
        }).catch(showError);
      });
      this.addComment = () => api.post(base() + '/comments', {
        text: this.commentText(), componentId: this.selectedKind() === 'screen' ? null : this.selectedId()
      }).then((detail) => {
        this.commentText('');
        this.detail(detail);
        showInfo('Comment added.');
      }).catch(showError);

      // --- page lifecycle ---

      let subscription = null;
      const beforeUnload = (event) => {
        if (this.dirty()) {
          event.preventDefault();
          event.returnValue = '';
        }
      };
      // The panel under the canvas: what the screen's requirement says (rules, APIs, host interfaces, roles) and the
      // screen's own validations, comments and versions
      const specList = (key) => ko.pureComputed(() => (this.requirement() && this.requirement().spec ? this.requirement().spec[key] || [] : []));
      this.ctxRules = specList('businessRules');
      this.ctxApis = specList('apis');
      this.ctxHosts = specList('hostInteractions');
      this.ctxRoles = specList('roles');
      this.ctxValidations = ko.pureComputed(() => {
        const model = this.working ? this.working() : null;
        const rows = [];
        (model ? model.sections : []).forEach((s) => (s.components || []).forEach((c) => {
          (c.validations || []).forEach((v) => rows.push({ field: c.label || c.name, rule: v, section: s.title || '' }));
          if (c.required) {
            rows.push({ field: c.label || c.name, rule: 'Required', section: s.title || '' });
          }
        }));
        return rows;
      });
      this.ctxComments = ko.pureComputed(() => (this.detail() ? this.detail().comments.slice().reverse().map((c) => ({
        author: c.author, text: c.text, version: 'v' + c.version, when: new Date(c.createdAt).toLocaleString(), from: c.fromReview ? 'Reviewer' : 'Team'
      })) : []));
      this.ctxVersions = ko.pureComputed(() => (this.detail() ? this.detail().versions.slice().reverse().map((v) => ({
        version: 'v' + v.version, origin: v.origin.charAt(0) + v.origin.slice(1).toLowerCase(), note: v.note || '', when: new Date(v.createdAt).toLocaleString()
      })) : []));
      const ctxTab = (value, label, list, title) => ({
        value: value, id: 'ctxTab-' + value, title: title || label, text: ko.pureComputed(() => label + (list ? ' (' + list().length + ')' : '')),
        selected: ko.pureComputed(() => this.contextTab() === value),
        css: ko.pureComputed(() => 'factory-tab' + (this.contextTab() === value ? ' factory-tab-on' : '')),
        pick: () => { this.contextTab(value); this.contextOpen(true); }
      });
      this.contextTabs = [
        ctxTab('rules', 'Rules', this.ctxRules, 'Business rules from the requirement'), ctxTab('apis', 'APIs', this.ctxApis), ctxTab('hosts', 'Hosts', this.ctxHosts, 'Host interfaces from the requirement'),
        ctxTab('roles', 'Roles', this.ctxRoles), ctxTab('validations', 'Validations', this.ctxValidations), ctxTab('comments', 'Comments', this.ctxComments),
        ctxTab('history', 'History', this.ctxVersions), ctxTab('assistant', 'AI Assistant', null)
      ];
      this.contextTabKey = (event) => {
        const keys = this.contextTabs.map((t) => t.value);
        const at = keys.indexOf(this.contextTab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        this.contextTabs[next].pick();
        const tab = find('#ctxTab-' + keys[next]);
        if (tab) {
          tab.focus();
        }
        event.preventDefault();
        return false;
      };
      this.toggleContext = () => this.contextOpen(!this.contextOpen());
      this.hasRequirement = ko.pureComputed(() => !!(this.requirement() && this.requirement().spec));
      this.specTabWithoutSpec = ko.pureComputed(() => !this.hasRequirement() && ['rules', 'apis', 'hosts', 'roles'].indexOf(this.contextTab()) >= 0);

      // Embedded: the element the Studio draws the designer in (host.element(), its oj-module)
      this.connected = () => {
        root = (embedded && host.element && host.element()) || document;
        if (embedded) {
          accUtils.announce('Editing the screen.');
        } else {
          accUtils.announce('Visual Designer loaded.');
          document.title = 'Visual Designer';
        }
        preview.attach(find('iframe.factory-dz-frame'));
        window.addEventListener('beforeunload', beforeUnload);
        window.addEventListener('unhandledrejection', keptChanges);
        document.addEventListener('keydown', onKeydown);
        if (window.ResizeObserver) {
          stageObserver = new ResizeObserver((entries) => this.stageWidth(entries[0].contentRect.width));
          const stage = find('.factory-dz-stage');
          if (stage) {
            stageObserver.observe(stage);
          }
        }
        api.get('design/catalog').then((types) => catalog(types.map((t) => ({ value: t.type, label: t.label, hasOptions: t.hasOptions, jet: t.jetComponent }))))
          .catch(showError);
        const refreshPalette = () => {
          codeItems([]);
          customItems([]);
          return this.workspaceId() ? loadPalette(this.workspaceId()) : Promise.resolve();
        };
        subscription = this.workspaceId.subscribe(() => {
          this.detail(null);
          this.working(null);
          this.dirty(false);
          this.designPick(null);
          loadDesigns();
          refreshPalette().catch(showError);
        });
        workspaceSelection.load().then((list) => {
          list.forEach((workspace) => { bankNames[workspace.id] = workspace.bankName; });
          return Promise.all([loadDesigns(), refreshPalette()]);
        }).then(() => {
          // Embedded: the Studio's selected screen; else a screen asked for by another page
          const wanted = embedded ? options.designId : pageRequests.design();
          if (wanted && !embedded) {
            pageRequests.design(null);
          }
          if (wanted && wanted !== loading && !(this.detail() && this.detail().id === wanted)) {
            this.open(wanted);
          }
        }).catch(showError);
      };
      // Leaving the page for another one asks first when there are unsaved changes; the router stays when the promise
      // is rejected (ModuleRouterAdapter), so Cancel rejects
      const STAY = 'Unsaved changes kept';
      this.canExit = () => (this.dirty() ? ask.apply(null, DISCARD).then((ok) => (ok ? undefined : Promise.reject(new Error(STAY))))
        : Promise.resolve());
      // The pages that navigate do not catch the router's rejection; staying is expected, so it is not an error
      const keptChanges = (event) => {
        if (event.reason && event.reason.message === STAY) {
          event.preventDefault();
        }
      };
      this.disconnected = () => {
        preview.detach();
        window.removeEventListener('beforeunload', beforeUnload);
        window.removeEventListener('unhandledrejection', keptChanges);
        document.removeEventListener('keydown', onKeydown);
        if (stageObserver) {
          stageObserver.disconnect();
        }
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return DesignerViewModel;
  }
);
