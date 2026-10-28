/*
 * Screen designer: edits a Screen Model (sections, components, actions) with a live preview, applies changes
 * described in plain words, manages versions, comments, the customer review link and approval.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/previewFrame', '../services/session',
        'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojselectsingle', 'ojs/ojinputtext', 'ojs/ojinputnumber',
        'ojs/ojswitch', 'ojs/ojbutton', 'ojs/ojtoolbar'],
  function (ko, accUtils, api, workspaceSelection, PreviewFrame, session, ArrayDataProvider) {
    const VIEWPORTS = [
      { key: 'desktop', label: 'Desktop', width: '100%' },
      { key: 'tablet', label: 'Tablet', width: '768px' },
      { key: 'phone', label: 'Phone', width: '375px' }
    ];
    const clone = (value) => JSON.parse(JSON.stringify(value));
    // Palette groups in the order of the OBDX UX Extensibility Toolkit
    const GROUPS = ['Forms', 'Controls', 'OBDX framework components', 'Business components', 'JET composite components',
      'Partials', 'JET components in this code', 'Other components used in this code'];
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

      this.detail = ko.observable(null);
      this.working = ko.observable(null);
      this.dirty = ko.observable(false);
      this.selectedId = ko.observable(null);
      this.aiInstruction = ko.observable('');
      this.commentText = ko.observable('');
      this.canDesign = ko.pureComputed(() => session.can(this.workspaceId(), 'EDIT_DESIGNS'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.editable = ko.pureComputed(() => this.detail() !== null && this.detail().status !== 'APPROVED' && this.canDesign());

      const catalog = ko.observableArray([]);
      this.typeProvider = new ArrayDataProvider(catalog, { keyAttributes: 'value' });
      this.columnsProvider = new ArrayDataProvider([1, 2, 3].map((n) => ({ value: n, label: n + (n === 1 ? ' column' : ' columns') })), { keyAttributes: 'value' });
      this.kindProvider = new ArrayDataProvider([
        { value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }, { value: 'link', label: 'Link' }
      ], { keyAttributes: 'value' });
      this.requiredProvider = new ArrayDataProvider([
        { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unknown', label: 'Not specified' }
      ], { keyAttributes: 'value' });

      const showError = (error) => { this.infoMessage(''); this.errorMessage(error.message); };
      const showInfo = (text) => { this.errorMessage(''); this.infoMessage(text); };

      // --- preview ---

      this.viewport = ko.observable('desktop');
      this.viewports = ko.pureComputed(() => VIEWPORTS.map((vp) => ({
        key: vp.key, label: vp.label, active: vp.key === this.viewport(), selectAction: () => this.viewport(vp.key)
      })));
      this.frameWidth = ko.pureComputed(() => VIEWPORTS.find((vp) => vp.key === this.viewport()).width);
      const preview = new PreviewFrame((id) => this.selectedId(id));
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
        ? 'Preview with the components of the ' + this.targetTitle() + ' app that code generation uses'
          + (this.previewKind() === 'react-native' ? ' (React Native Web in the browser; check on a device with Expo)' : '')
          + ', filled with sample data. Click a component to select it.'
        : 'Preview with this factory\'s Oracle JET version and Redwood theme, filled with sample data. Click a component to select it.'));
      ko.computed(() => preview.show(this.working(), this.selectedId()));

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
        return entry ? entry.label : component.type;
      };

      // --- palette: standard components and those found in the workspace's code ---

      const paletteItems = ko.observableArray([]);
      this.paletteNote = ko.observable('');
      this.paletteFilter = ko.observable('');
      this.paletteGroups = ko.pureComputed(() => {
        const filter = (this.paletteFilter() || '').trim().toLowerCase();
        const matches = (item) => !filter || (item.label + ' ' + (item.tag || '') + ' ' + (item.module || '')).toLowerCase().includes(filter);
        return GROUPS.map((group) => ({
          title: group,
          open: group === 'Forms' || group === 'OBDX framework components' || group === 'Business components' || !!filter,
          items: paletteItems().filter((item) => item.group === group && matches(item)).map((item) => ({
            id: item.id,
            page: self,
            label: item.label,
            detail: (item.tag ? '<' + item.tag + '>' : item.description || '') + (item.module ? ' · ' + item.module : ''),
            title: item.description || '',
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
          m.actions.push({ id: newId(m, 'a'), label: 'New button', kind: m.actions.length === 0 ? 'primary' : 'secondary' });
          return null;
        }
        const entry = catalog().find((t) => t.value === item.type);
        const params = {};
        (item.params || []).forEach((p) => { params[p] = ''; });
        return {
          id: newId(m, 'c'),
          type: item.type,
          name: camel(item.label) || 'field',
          label: item.label,
          options: entry && entry.hasOptions ? (item.type === 'table' ? ['Column 1', 'Column 2'] : ['Option 1', 'Option 2']) : [],
          validations: [],
          component: item.type === 'component' ? item.tag : null,
          params: item.type === 'component' ? params : {}
        };
      };

      /**
       * Adds a palette item before the component with targetId, or else after the selected component, or at the end
       * of the last section.
       */
      const addFromPalette = (item, targetId, sectionId) => update((m) => {
        const component = fromPalette(m, item);
        if (!component) {
          return;
        }
        const target = targetId ? locate(m, targetId) : null;
        const selected = !target && !sectionId && this.selectedId() ? locate(m, this.selectedId()) : null;
        if (target) {
          target.section.components.splice(target.index, 0, component);
        } else if (selected) {
          selected.section.components.splice(selected.index + 1, 0, component);
        } else {
          const section = (sectionId && m.sections.find((s) => s.id === sectionId)) || m.sections[m.sections.length - 1];
          section.components.push(component);
        }
        setTimeout(() => this.selectedId(component.id));
      });

      /** A two-way binding to one property of the working model. */
      const modelProperty = (read, write) => ko.pureComputed({
        read: () => (this.working() ? read(this.working()) : null),
        write: (value) => update((model) => write(model, value))
      });

      this.screenTitle = modelProperty((m) => m.title, (m, v) => { m.title = v; });
      this.screenName = modelProperty((m) => m.name, (m, v) => { m.name = v; });

      this.sections = ko.pureComputed(() => {
        const model = this.working();
        if (!model) {
          return [];
        }
        return model.sections.map((section, sectionIndex) => ({
          id: section.id,
          page: self,
          title: modelProperty((m) => m.sections[sectionIndex].title, (m, v) => { m.sections[sectionIndex].title = v; }),
          columns: modelProperty((m) => m.sections[sectionIndex].columns, (m, v) => { m.sections[sectionIndex].columns = v; }),
          addComponent: () => update((m) => {
            const id = newId(m, 'c');
            m.sections[sectionIndex].components.push({ id: id, type: 'text', name: 'newField', label: 'New field', options: [], validations: [] });
            setTimeout(() => this.selectedId(id));
          }),
          removeSection: () => update((m) => { m.sections.splice(sectionIndex, 1); }),
          components: section.components.map((c) => ({
            id: c.id,
            page: self,
            label: c.label,
            required: c.required === true,
            typeLabel: typeLabel(c),
            selected: c.id === this.selectedId(),
            selectAction: () => this.selectedId(c.id),
            moveUp: () => move(c.id, -1),
            moveDown: () => move(c.id, 1),
            removeAction: () => update((m) => {
              const found = locate(m, c.id);
              found.section.components.splice(found.index, 1);
              if (this.selectedId() === c.id) {
                this.selectedId(null);
              }
            })
          }))
        }));
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

      this.addSection = () => update((m) => {
        m.sections.push({ id: newId(m, 's'), title: 'New section', columns: 2, components: [] });
      });

      // --- drag and drop ---

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
      this.dragEnd = () => { draggedId = null; draggedItem = null; };
      this.dragOver = (event) => {
        if (draggedId || (draggedItem && this.editable())) {
          event.preventDefault();
        }
      };
      this.dropOnComponent = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const targetId = event.currentTarget.getAttribute('data-cid');
        const id = draggedId;
        const item = draggedItem;
        draggedId = null;
        draggedItem = null;
        if (item) {
          addFromPalette(item, targetId);
          return;
        }
        if (!id || id === targetId) {
          return;
        }
        update((m) => {
          const from = locate(m, id);
          const [component] = from.section.components.splice(from.index, 1);
          const to = locate(m, targetId);
          to.section.components.splice(to.index, 0, component);
        });
      };
      this.dropOnSection = (event) => {
        event.preventDefault();
        const sectionId = event.currentTarget.getAttribute('data-sid');
        const id = draggedId;
        const item = draggedItem;
        draggedId = null;
        draggedItem = null;
        if (item) {
          addFromPalette(item, null, sectionId);
          return;
        }
        if (!id) {
          return;
        }
        update((m) => {
          const from = locate(m, id);
          const [component] = from.section.components.splice(from.index, 1);
          m.sections.find((s) => s.id === sectionId).components.push(component);
        });
      };

      // --- properties of the selected component ---

      this.selectedComponent = ko.pureComputed(() => {
        const model = this.working();
        const found = model && this.selectedId() ? locate(model, this.selectedId()) : null;
        return found ? found.component : null;
      });
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
      const lines = (text) => (text || '').split('\n').map((line) => line.trim()).filter((line) => line);

      this.propLabel = componentProperty((c) => c.label, (c, v) => { c.label = v; });
      this.propName = componentProperty((c) => c.name, (c, v) => { c.name = v; });
      this.propType = componentProperty((c) => c.type, (c, v) => {
        c.type = v;
        const entry = catalog().find((t) => t.value === v);
        if (entry && entry.hasOptions && (!c.options || c.options.length === 0)) {
          c.options = ['Option 1', 'Option 2'];
        }
      });
      this.propRequired = componentProperty(
        (c) => (c.required === true ? 'yes' : c.required === false ? 'no' : 'unknown'),
        (c, v) => { c.required = v === 'yes' ? true : v === 'no' ? false : null; });
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

      // --- action buttons ---

      this.actionRows = ko.pureComputed(() => {
        const model = this.working();
        if (!model) {
          return [];
        }
        return model.actions.map((action, index) => ({
          id: action.id,
          page: self,
          label: modelProperty((m) => m.actions[index].label, (m, v) => { m.actions[index].label = v; }),
          kind: modelProperty((m) => m.actions[index].kind, (m, v) => { m.actions[index].kind = v; }),
          moveUp: () => update((m) => {
            if (index > 0) {
              m.actions.splice(index - 1, 0, m.actions.splice(index, 1)[0]);
            }
          }),
          removeAction: () => update((m) => { m.actions.splice(index, 1); })
        }));
      });
      this.addAction = () => update((m) => { m.actions.push({ id: newId(m, 'a'), label: 'New button', kind: 'secondary' }); });

      // --- comments, versions, review ---

      const componentLabel = (id) => {
        const model = this.working();
        const found = model ? locate(model, id) : null;
        const action = model && !found ? model.actions.find((a) => a.id === id) : null;
        return found ? found.component.label : action ? action.label + ' button' : id;
      };

      this.comments = ko.pureComputed(() => (this.detail() ? this.detail().comments : []).map((c) => ({
        author: c.author,
        text: c.text,
        meta: ' on v' + c.version + (c.componentId ? ', about ' + componentLabel(c.componentId) : '') + (c.fromReview ? ', via review link' : '')
          + ', ' + new Date(c.createdAt).toLocaleString()
      })));
      this.versions = ko.pureComputed(() => (this.detail() ? this.detail().versions : []).map((v) => ({
        version: v.version,
        text: v.origin.toLowerCase() + (v.note ? ': ' + v.note : '') + ' · ' + new Date(v.createdAt).toLocaleString(),
        loadable: this.editable() && v.version !== this.detail().currentVersion,
        loadAction: () => api.get('designs/' + this.detail().id + '/versions/' + v.version).then((model) => {
          this.working(model);
          this.dirty(true);
          showInfo('Version ' + v.version + ' loaded into the editor. Save to make it the current version.');
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
          requirementOptions([]);
          return Promise.resolve();
        }
        return Promise.all([api.get('workspaces/' + id + '/designs'), api.get('workspaces/' + id + '/requirements')])
          .then(([designList, requirementList]) => {
            const current = this.detail() ? this.detail().id : null;
            this.designs(designList.map((d) => ({
              name: d.name, status: d.status, selected: d.id === current, openAction: () => this.open(d.id)
            })));
            requirementOptions(requirementList.filter((r) => r.status === 'APPROVED').map((r) => ({ value: r.id, label: r.title })));
          }).catch(showError);
      };

      const show = (detail, keepSelection) => {
        if (!this.detail() || this.detail().id !== detail.id) {
          this.codeFiles([]);
        }
        this.detail(detail);
        this.working(clone(detail.model));
        this.dirty(false);
        if (!keepSelection) {
          this.selectedId(null);
        }
        loadDesigns();
      };

      this.open = (id) => {
        if (this.dirty() && !window.confirm('Discard your unsaved changes?')) {
          return Promise.resolve();
        }
        this.errorMessage('');
        this.infoMessage('');
        return api.get('designs/' + id).then((detail) => show(detail)).catch(showError);
      };

      this.createFromRequirement = () => api.post('requirements/' + this.requirementId() + '/designs')
        .then((created) => {
          this.requirementId(null);
          return (created.length > 0 ? this.open(created[0].id) : loadDesigns())
            .then(() => showInfo(created.length + ' design(s) created.'));
        }).catch(showError);

      this.createBlank = () => api.post('workspaces/' + this.workspaceId() + '/designs', { name: this.blankName() })
        .then((detail) => { this.blankName(''); show(detail); })
        .catch(showError);

      const base = () => 'designs/' + this.detail().id;

      this.save = () => api.put(base() + '/model', { model: this.working(), note: null })
        .then((detail) => { show(detail, true); showInfo('Saved as version ' + detail.currentVersion + '.'); })
        .catch(showError);

      this.discard = () => { this.working(clone(this.detail().model)); this.dirty(false); };

      this.askAi = () => {
        if (!this.aiInstruction()) {
          return;
        }
        if (this.dirty()) {
          showError(new Error('Save or discard your changes first.'));
          return;
        }
        this.busy(true);
        api.post(base() + '/ai-change', { instruction: this.aiInstruction() })
          .then((detail) => {
            show(detail, true);
            this.aiInstruction('');
            showInfo('Changed by AI and saved as version ' + detail.currentVersion + '. Review the result; load an earlier version to undo.');
          })
          .catch(showError)
          .finally(() => this.busy(false));
      };

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
        if (!window.confirm('Delete this design with all its versions and comments?')) {
          return;
        }
        api.del(base()).then(() => { this.detail(null); this.working(null); this.dirty(false); loadDesigns(); }).catch(showError);
      };
      this.addComment = () => api.post(base() + '/comments', {
        text: this.commentText(), componentId: this.selectedId()
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
          loadDesigns();
          refreshPalette().catch(showError);
        });
        workspaceSelection.load().then(() => Promise.all([loadDesigns(), refreshPalette()])).catch(showError);
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
