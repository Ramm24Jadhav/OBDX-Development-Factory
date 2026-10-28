/*
 * Screen designer: a workspace with a top bar (screen, status, viewport, import, share, save), a left panel
 * (component palette and layers), the live preview as the canvas (click to select, drop components on it) with
 * "Ask AI" below it, and an inspector on the right (properties of the selection, comments, history).
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/previewFrame', '../services/session',
        'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojselectsingle', 'ojs/ojinputtext', 'ojs/ojinputnumber',
        'ojs/ojswitch', 'ojs/ojbutton', 'ojs/ojtoolbar', 'ojs/ojfilepicker'],
  function (ko, accUtils, api, workspaceSelection, PreviewFrame, session, ArrayDataProvider) {
    const VIEWPORTS = [
      { key: 'desktop', label: 'Desktop', icon: '▭', width: '100%' },
      { key: 'tablet', label: 'Tablet', icon: '▯', width: '768px' },
      { key: 'phone', label: 'Phone', icon: '▮', width: '375px' }
    ];
    const clone = (value) => JSON.parse(JSON.stringify(value));
    // Palette groups in the order of the OBDX UX Extensibility Toolkit
    const GROUPS = ['Forms', 'Controls', 'OBDX framework components', 'Business components', 'JET composite components',
      'Partials', 'JET components in this code', 'Other components used in this code'];
    // Groups shown as icon tiles; the others are lists, because their names are long
    const TILE_GROUPS = ['Forms', 'Controls'];
    const ICONS = {
      text: 'Aa', textarea: '¶', number: '123', amount: '₹', date: '▦', select: '▾', account: '◧', radio: '◉',
      checkbox: '☑', switch: '◐', display: '≡', table: '▤', action: '▭', component: '⧉'
    };
    const SHORT_LABELS = { 'Table (options are its columns)': 'Table', 'Switch (on/off)': 'Switch', 'Multi-line text': 'Text area' };
    const camel = (label) => (label || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/)
      .map((word, i) => (i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())).join('');

    function DesignerViewModel() {
      const self = this;
      this.workspaceProvider = new ArrayDataProvider(workspaceSelection.options, { keyAttributes: 'value' });
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
      this.infoMessage = ko.observable('');
      this.busy = ko.observable(false);

      const requirementOptions = ko.observableArray([]);
      this.requirementProvider = new ArrayDataProvider(requirementOptions, { keyAttributes: 'value' });
      this.requirementId = ko.observable(null);
      this.blankName = ko.observable('');
      this.designs = ko.observableArray([]);
      // The workspace's screens and requirements as the server lists them, the bank of each workspace, and the
      // approved requirement of the open screen (its spec drives the journey and the checks)
      const rawDesigns = ko.observableArray([]);
      const requirements = ko.observableArray([]);
      const bankNames = {};
      this.requirement = ko.observable(null);
      const designOptions = ko.observableArray([]);
      this.designProvider = new ArrayDataProvider(designOptions, { keyAttributes: 'value' });
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

      // Panels: the left one shows components or layers; the right one the selection, comments or history; the top bar
      // opens one drawer at a time (a new screen, an import, the review link)
      this.leftTab = ko.observable('components');
      this.rightTab = ko.observable('properties');
      this.drawer = ko.observable(null);
      this.toggleDrawer = (name) => () => this.drawer(this.drawer() === name ? null : name);
      this.openNew = this.toggleDrawer('new');
      this.openImport = this.toggleDrawer('import');
      this.openShare = this.toggleDrawer('share');
      this.closeDrawer = () => this.drawer(null);
      this.showComponents = () => this.leftTab('components');
      this.showLayers = () => this.leftTab('layers');
      this.showProperties = () => this.rightTab('properties');
      this.showComments = () => this.rightTab('comments');
      this.showHistory = () => this.rightTab('history');
      this.showCodeTab = () => this.rightTab('code');

      const catalog = ko.observableArray([]);
      this.typeProvider = new ArrayDataProvider(catalog, { keyAttributes: 'value' });
      this.columnsProvider = new ArrayDataProvider([1, 2, 3].map((n) => ({ value: n, label: n + (n === 1 ? ' column' : ' columns') })), { keyAttributes: 'value' });
      this.kindProvider = new ArrayDataProvider([
        { value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }, { value: 'link', label: 'Link' }
      ], { keyAttributes: 'value' });

      const showError = (error) => { this.infoMessage(''); this.errorMessage(error.message); };
      const showInfo = (text) => { this.errorMessage(''); this.infoMessage(text); };
      this.clearMessages = () => { this.errorMessage(''); this.infoMessage(''); };
      // Plain inputs of the canvas and panels
      this.paletteInput = (event) => this.paletteFilter(event.target.value);
      this.aiInput = (event) => this.aiInstruction(event.target.value);
      this.aiKeydown = (event) => {
        if (event.key === 'Enter') {
          this.askAi();
        }
      };
      this.commentInput = (event) => this.commentText(event.target.value);

      // --- canvas (the preview) ---

      this.viewport = ko.observable('desktop');
      this.viewports = ko.pureComputed(() => VIEWPORTS.map((vp) => ({
        key: vp.key, label: vp.label, icon: vp.icon, active: vp.key === this.viewport(), selectAction: () => this.viewport(vp.key)
      })));
      this.frameWidth = ko.pureComputed(() => VIEWPORTS.find((vp) => vp.key === this.viewport()).width);
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
        : 'Oracle JET with the Redwood theme, in an OBDX page, with sample data'));

      // Code the design becomes in a React Native or React app (current saved version)
      this.codeModule = ko.observable('app');
      this.codeFiles = ko.observableArray([]);
      this.showCode = () => api.get('designs/' + this.detail().id + '/code?module=' + encodeURIComponent(this.codeModule() || 'app'))
        .then((files) => this.codeFiles(files)).catch(showError);

      // --- editing the working model ---

      /** Applies a change to a copy of the working model, so every change re-renders editor and preview. */
      const update = (change) => {
        if (!this.editable()) {
          return;
        }
        const model = clone(this.working());
        change(model);
        this.working(model);
        this.dirty(true);
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
            selected: c.id === selected,
            selectAction: () => this.selectedId(c.id)
          }))
        }));
      });
      this.actionLayers = ko.pureComputed(() => {
        const model = this.working();
        const selected = this.selectedId();
        return model ? model.actions.map((a) => ({
          id: a.id, label: a.label, kind: a.kind, selected: a.id === selected, selectAction: () => this.selectedId(a.id)
        })) : [];
      });
      this.componentCount = ko.pureComputed(() => (this.working()
        ? this.working().sections.reduce((n, s) => n + s.components.length, 0) : 0));

      // --- palette: standard components and those found in the workspace's code ---

      const paletteItems = ko.observableArray([]);
      this.paletteNote = ko.observable('');
      this.paletteFilter = ko.observable('');
      this.paletteGroups = ko.pureComputed(() => {
        const filter = (this.paletteFilter() || '').trim().toLowerCase();
        const matches = (item) => !filter || (item.label + ' ' + (item.tag || '') + ' ' + (item.module || '')).toLowerCase().includes(filter);
        return GROUPS.map((group) => ({
          title: group,
          tiles: TILE_GROUPS.includes(group),
          open: group !== 'Other components used in this code' || !!filter,
          items: paletteItems().filter((item) => item.group === group && matches(item)).map((item) => ({
            id: item.id,
            page: self,
            tile: TILE_GROUPS.includes(group),
            label: SHORT_LABELS[item.label] || item.label,
            icon: ICONS[item.type] || '⧉',
            detail: [item.tag ? '<' + item.tag + '>' : '', item.module || '', item.uses ? 'used ' + item.uses + '×' : '']
              .filter(Boolean).join(' · '),
            title: item.description || item.label,
            addAction: () => addFromPalette(item, null)
          }))
        })).filter((group) => group.items.length > 0);
      });
      const loadPalette = (id) => api.get('workspaces/' + id + '/design-palette').then((palette) => {
        paletteItems(palette.items);
        this.paletteNote(palette.note || '');
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
          params: item.type === 'component' ? params : {}
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
      // A drop on the canvas arrives as a message after dragend, so the dragged thing is forgotten a moment later.
      this.dragEnd = () => setTimeout(() => { draggedId = null; draggedItem = null; }, 300);
      this.dragOver = (event) => {
        if (draggedId || (draggedItem && this.editable())) {
          event.preventDefault();
        }
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
        drop(event.currentTarget.getAttribute('data-cid'), null);
      };
      this.dropOnSection = (event) => {
        event.preventDefault();
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
      this.propSectionTitle = sectionProperty((s) => s.title || '', (s, v) => { s.title = v || null; });
      this.propSectionColumns = sectionProperty((s) => s.columns || 2, (s, v) => { s.columns = v; });
      this.propActionLabel = actionProperty((a) => a.label, (a, v) => { a.label = v; });
      this.propActionKind = actionProperty((a) => a.kind, (a, v) => { a.kind = v; });

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
        const order = specScreens().map((s) => norm(s.name));
        const position = (design) => {
          const i = order.indexOf(norm(design.name));
          return i < 0 ? order.length : i;
        };
        return rawDesigns().filter((x) => x.requirementId === d.requirementId)
          .slice().sort((a, b) => position(a) - position(b))
          .map((x, i) => ({
            number: i + 1,
            name: x.name,
            current: x.id === d.id,
            status: x.status,
            statusText: x.id === d.id && this.dirty() ? 'Unsaved changes' : statusLabel(x.status),
            css: 'factory-dz-step' + (x.id === d.id ? ' factory-dz-step-current' : '') + ' factory-dz-step-' + x.status.toLowerCase(),
            openAction: () => this.open(x.id)
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
          if (missing.length === 0) {
            add('ok', 'All ' + spec.fields.length + ' fields of the requirement are on the screen');
          }
          missing.forEach((f) => add('warn', '"' + (f.label || f.name) + '" from the requirement is not on the screen', null, 'Add',
            () => addSpecField(f)));
        } else if (this.detail() && this.detail().requirementId && this.requirement()) {
          add('info', 'The requirement has no screen named "' + this.detail().name + '", so fields cannot be compared');
        }
        // Account selectors list the customer's accounts at run time, so their options stay placeholders
        components.filter((c) => c.type !== 'account' && (c.options || []).length > 0 && c.options.every((o) => PLACEHOLDERS.includes(o))).forEach((c) => {
          const what = c.type === 'table' ? 'columns' : 'choices';
          const notes = requirementNotes(c);
          add('warn', '"' + c.label + '" still has placeholder ' + what, c.id, 'Fix with AI',
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
        return list;
      });
      this.openChecks = ko.pureComputed(() => this.checks().filter((c) => c.level === 'warn').length);
      this.checksSummary = ko.pureComputed(() => (this.openChecks() === 0 ? 'Ready to approve'
        : this.openChecks() + (this.openChecks() === 1 ? ' check to fix' : ' checks to fix')));
      this.showChecks = () => { this.selectedId(null); this.rightTab('properties'); };
      /** What the requirement's rules say about this screen. */
      this.screenRules = ko.pureComputed(() => {
        const requirement = this.requirement();
        const d = this.detail();
        if (!requirement || !requirement.spec || !d) {
          return [];
        }
        return (requirement.spec.businessRules || [])
          .filter((r) => !r.screens || r.screens.length === 0 || r.screens.some((s) => norm(s) === norm(d.name)))
          .map((r) => (r.id ? r.id + ': ' : '') + r.description);
      });

      // --- the canvas shows the screen in an OBDX page, with the journey's steps and the checks' warnings ---

      this.previewContext = ko.pureComputed(() => {
        const warnings = {};
        this.checks().filter((c) => c.level === 'warn' && c.id).forEach((c) => { warnings[c.id] = c.text; });
        // The journey's steps show in the strip above the canvas, not again inside the page
        return {
          bank: bankNames[this.workspaceId()] || 'Online banking',
          breadcrumb: 'Dashboard' + (this.journeyTitle() ? ' / ' + this.journeyTitle() : ''),
          warnings: warnings,
          editing: this.editable()
        };
      });
      ko.computed(() => preview.show(this.working(), this.selectedId(), this.previewContext()));

      // --- the start page: each requirement with its screens and how far they are ---

      this.board = ko.pureComputed(() => {
        const designs = rawDesigns();
        const groups = requirements()
          .filter((r) => r.status === 'APPROVED' || designs.some((d) => d.requirementId === r.id))
          .map((r) => ({ id: r.id, title: r.title, designs: designs.filter((d) => d.requirementId === r.id) }));
        const loose = designs.filter((d) => !d.requirementId || !requirements().some((r) => r.id === d.requirementId));
        if (loose.length > 0) {
          groups.push({ id: null, title: 'Other screens', designs: loose });
        }
        return groups.map((g) => {
          const approved = g.designs.filter((d) => d.status === 'APPROVED').length;
          return {
            title: g.title,
            empty: g.designs.length === 0,
            progressText: g.designs.length === 0 ? 'No screens yet' : approved + ' of ' + g.designs.length + ' approved',
            progressWidth: g.designs.length === 0 ? '0%' : Math.round(approved * 100 / g.designs.length) + '%',
            done: g.designs.length > 0 && approved === g.designs.length,
            createAction: () => { this.requirementId(g.id); this.createFromRequirement(); },
            canCreate: !!g.id && g.designs.length === 0 && this.canDesign(),
            screens: g.designs.map((d) => ({
              name: d.name,
              meta: d.components + ' components · v' + d.currentVersion,
              statusText: statusLabel(d.status),
              statusClass: 'factory-dz-badge factory-dz-badge-' + d.status.toLowerCase(),
              openAction: () => this.open(d.id)
            }))
          };
        });
      });

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
        loadAction: () => api.get('designs/' + this.detail().id + '/versions/' + v.version).then((model) => {
          this.working(model);
          this.dirty(true);
          showInfo('Version ' + v.version + ' loaded. Save to make it the current version.');
        }).catch(showError)
      })));
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
          requirementOptions([]);
          return Promise.resolve();
        }
        return Promise.all([api.get('workspaces/' + id + '/designs'), api.get('workspaces/' + id + '/requirements')])
          .then(([designList, requirementList]) => {
            rawDesigns(designList);
            requirements(requirementList);
            const current = this.detail() ? this.detail().id : null;
            this.designs(designList.map((d) => ({
              name: d.name, status: d.status, statusClass: 'factory-dz-badge factory-dz-badge-' + d.status.toLowerCase(),
              statusText: d.status.replace('_', ' ').toLowerCase(), selected: d.id === current, openAction: () => this.open(d.id)
            })));
            designOptions(designList.map((d) => ({ value: d.id, label: d.name + ' (' + d.status.replace('_', ' ').toLowerCase() + ')' })));
            requirementOptions(requirementList.filter((r) => r.status === 'APPROVED').map((r) => ({ value: r.id, label: r.title })));
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
          loadRequirement(detail.requirementId);
        }
        this.detail(detail);
        this.designPick(detail.id);
        this.working(clone(detail.model));
        this.dirty(false);
        if (!keepSelection) {
          this.selectedId(null);
        }
        loadDesigns();
      };

      this.open = (id) => {
        if (this.dirty() && !window.confirm('Discard your unsaved changes?')) {
          this.designPick(this.detail() ? this.detail().id : null);
          return Promise.resolve();
        }
        this.clearMessages();
        this.drawer(null);
        return api.get('designs/' + id).then((detail) => show(detail)).catch(showError);
      };
      this.designPick.subscribe((id) => {
        if (id && (!this.detail() || this.detail().id !== id)) {
          this.open(id);
        }
      });

      this.createFromRequirement = () => api.post('requirements/' + this.requirementId() + '/designs')
        .then((created) => {
          this.requirementId(null);
          this.drawer(null);
          return (created.length > 0 ? this.open(created[0].id) : loadDesigns())
            .then(() => showInfo(created.length + ' screen(s) created.'));
        }).catch(showError);

      this.createBlank = () => api.post('workspaces/' + this.workspaceId() + '/designs', { name: this.blankName() })
        .then((detail) => { this.blankName(''); this.drawer(null); show(detail); })
        .catch(showError);

      const base = () => 'designs/' + this.detail().id;

      this.save = () => api.put(base() + '/model', { model: this.working(), note: null })
        .then((detail) => { show(detail, true); showInfo('Saved as version ' + detail.currentVersion + '.'); })
        .catch(showError);

      this.discard = () => { this.working(clone(this.detail().model)); this.dirty(false); this.clearMessages(); };

      this.askAi = () => {
        if (!this.aiInstruction()) {
          return;
        }
        if (this.dirty()) {
          showError(new Error('Save or discard your changes first.'));
          return;
        }
        this.busy(true);
        showInfo('Changing the screen...');
        api.post(base() + '/ai-change', { instruction: this.aiInstruction() })
          .then((detail) => {
            show(detail, true);
            this.aiInstruction('');
            showInfo('Changed and saved as version ' + detail.currentVersion + '. Check the result; History has the earlier versions.');
          })
          .catch(showError)
          .finally(() => this.busy(false));
      };

      // --- importing a design from a design tool ---

      this.designFile = ko.observable(null);
      this.designFileName = ko.pureComputed(() => (this.designFile() ? this.designFile().name : 'No file chosen'));
      this.designFileSelected = (event) => this.designFile(event.detail.files[0] || null);
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
      this.closeReview = () => api.del(base() + '/review-link').then((detail) => show(detail, true)).catch(showError);
      this.copyReviewLink = () => {
        const input = document.getElementById('reviewUrl');
        input.select();
        (navigator.clipboard ? navigator.clipboard.writeText(this.reviewUrl()) : Promise.resolve(document.execCommand('copy')))
          .then(() => showInfo('Review link copied.'))
          .catch(() => showInfo('Select the link and copy it.'));
      };
      this.approve = () => {
        if (!window.confirm('Approve version ' + this.detail().currentVersion + ' for development?')) {
          return;
        }
        api.post(base() + '/approve').then((detail) => show(detail, true)).catch(showError);
      };
      this.reopen = () => api.post(base() + '/reopen').then((detail) => show(detail, true)).catch(showError);
      this.remove = () => {
        if (!window.confirm('Delete this screen with all its versions and comments?')) {
          return;
        }
        api.del(base()).then(() => {
          this.detail(null);
          this.working(null);
          this.dirty(false);
          this.designPick(null);
          loadDesigns();
        }).catch(showError);
      };
      this.addComment = () => api.post(base() + '/comments', {
        text: this.commentText(), componentId: this.selectedKind() === 'screen' ? null : this.selectedId()
      }).then((detail) => {
        this.commentText('');
        this.detail(detail);
      }).catch(showError);

      // --- page lifecycle ---

      let subscription = null;
      const beforeUnload = (event) => {
        if (this.dirty()) {
          event.preventDefault();
          event.returnValue = '';
        }
      };
      this.connected = () => {
        accUtils.announce('Screen designer loaded.');
        document.title = 'Screen designer';
        preview.attach('designerPreview');
        window.addEventListener('beforeunload', beforeUnload);
        api.get('design/catalog').then((types) => catalog(types.map((t) => ({ value: t.type, label: t.label, hasOptions: t.hasOptions }))))
          .catch(showError);
        const refreshPalette = () => {
          paletteItems([]);
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
        }).catch(showError);
      };
      this.disconnected = () => {
        preview.detach();
        window.removeEventListener('beforeunload', beforeUnload);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return DesignerViewModel;
  }
);
