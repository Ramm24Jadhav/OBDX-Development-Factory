/*
 * Design System page: the factory's design tokens and shared components, live. Colours and type come from the tokens
 * in app.css; the components are the same ones the other pages use, with the factory's real workspaces where a
 * component shows data (carousel, select, table).
 */
define(['knockout', '../accUtils', '../services/api', '../services/ui', '../services/toast', '../services/dialog', '../services/preferences',
        'ojs/ojknockout'],
  function (ko, accUtils, api, ui, toast, dialog, preferences) {
    const ICONS = ['home', 'folder', 'code', 'profile', 'list', 'design', 'branch', 'flask', 'refresh', 'chip', 'robot', 'cog', 'share', 'plug',
      'cube', 'sparkle', 'bell', 'user', 'users', 'info', 'search', 'plus', 'edit', 'trash', 'check', 'alert', 'clock', 'doc', 'link', 'shield',
      'bank', 'chart', 'target', 'monitor', 'laptop', 'rocket', 'help', 'sun', 'moon', 'arrow', 'more', 'x'];

    function DesignViewModel() {
      this.tab = ko.observable('light');
      this.tabs = ui.tabs(this.tab, [{ value: 'light', label: 'Light Theme' }, { value: 'dark', label: 'Dark Theme' }, { value: 'semantic', label: 'Semantic Colors' }]);
      this.isDark = ko.pureComputed(() => preferences.theme() && preferences.isDark());
      this.toggleTheme = () => preferences.toggleTheme();
      this.themeButtonText = ko.pureComputed(() => (this.isDark() ? 'Use the light theme' : 'Use the dark theme'));

      // Colours: name, token, and the value the token has now (read from the page, so dark shows dark values)
      const swatch = (label, token) => ({ label: label, token: token, value: ko.observable(''), style: { background: 'var(' + token + ')' } });
      this.brand = [swatch('Primary', '--fx-primary'), swatch('Primary Hover', '--fx-primary-hover'), swatch('Secondary', '--fx-secondary'),
        swatch('Success', '--fx-success'), swatch('Warning', '--fx-warning'), swatch('Error', '--fx-danger')];
      this.neutrals = [swatch('Background', '--fx-bg'), swatch('Surface', '--fx-surface'), swatch('Border', '--fx-border'),
        swatch('Text Primary', '--fx-text'), swatch('Text Secondary', '--fx-text-muted'), swatch('Disabled', '--fx-disabled')];
      this.semantic = [swatch('Success text', '--fx-success-text'), swatch('Warning text', '--fx-warning-text'), swatch('Error text', '--fx-danger-text'),
        swatch('Info text', '--fx-info-text'), swatch('Primary soft', '--fx-primary-soft'), swatch('Violet', '--fx-violet')];
      const readTokens = () => {
        const styles = getComputedStyle(document.documentElement);
        this.brand.concat(this.neutrals, this.semantic).forEach((s) => s.value(styles.getPropertyValue(s.token).trim().toUpperCase()));
      };
      preferences.theme.subscribe(() => window.setTimeout(readTokens, 0));
      this.swatches = ko.pureComputed(() => (this.tab() === 'semantic' ? this.semantic : this.tab() === 'dark' ? this.neutrals : this.brand));
      this.swatchTitle = ko.pureComputed(() => (this.tab() === 'semantic' ? 'Text and tints' : this.tab() === 'dark' ? 'Neutrals' : 'Brand'));

      this.type = [
        { tag: 'H1', spec: '32 / SemiBold', css: 'factory-ds-h1' }, { tag: 'H2', spec: '24 / SemiBold', css: 'factory-ds-h2' },
        { tag: 'H3', spec: '20 / SemiBold', css: 'factory-ds-h3' }, { tag: 'H4', spec: '16 / SemiBold', css: 'factory-ds-h4' },
        { tag: 'H5', spec: '14 / Medium', css: 'factory-ds-h5' }, { tag: 'Body', spec: '14 / Regular', css: 'factory-ds-body' },
        { tag: 'Caption', spec: '12 / Regular', css: 'factory-ds-caption' }, { tag: 'Overline', spec: '10 / Medium', css: 'factory-ds-overline' }
      ];
      this.icons = ICONS.map((name) => ({ name: name, css: 'factory-nav-icon factory-ico-' + name }));

      // Buttons: variants x states
      this.variants = ['primary', 'secondary', 'tertiary', 'danger', 'success'].map((v) => ({ name: v.charAt(0).toUpperCase() + v.slice(1), css: 'fx-btn fx-btn--' + v }));
      this.states = [{ label: 'Default', extra: '' }, { label: 'Hover', extra: ' is-hover' }, { label: 'Active', extra: ' is-active' }];
      this.clicked = (label) => () => toast.info(label + ' button clicked.');
      this.loadingDemo = ko.observable(false);
      this.runLoading = () => {
        this.loadingDemo(true);
        window.setTimeout(() => { this.loadingDemo(false); toast.success('Done: the loading state clears when the work finishes.'); }, 1600);
      };
      this.loadingButtons = ko.pureComputed(() => this.variants.map((v) => ({ name: v.name, css: v.css + (this.loadingDemo() ? ' is-loading' : '') })));

      // Split button
      this.split = ui.menu();
      this.splitDo = (what) => () => { this.split.close(); toast.info(what + ' chosen.'); };
      this.createNew = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'requirements' }));

      // Fields
      this.email = ko.observable('');
      this.emailState = ko.pureComputed(() => (!this.email() ? '' : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.email()) ? 'success' : 'error'));
      this.emailCss = ko.pureComputed(() => 'fx-field' + (this.emailState() ? ' is-' + this.emailState() : ''));
      this.emailInput = ui.value(this.email);
      this.note = ko.observable('');
      this.noteInput = ui.value(this.note);
      this.noteCount = ko.pureComputed(() => this.note().length + ' / 200');

      // Real data: the factory's workspaces
      this.workspaces = ko.observableArray([]);
      this.wsQuery = ko.observable('');
      this.wsQueryInput = ui.value(this.wsQuery);
      this.wsPicked = ko.observable('');
      this.wsFiltered = ko.pureComputed(() => this.workspaces().filter((w) => !this.wsQuery() || (w.name + ' ' + w.bankName).toLowerCase().indexOf(this.wsQuery().toLowerCase()) >= 0)
        .map((w) => Object.assign({}, w, {
          css: 'factory-ds-option' + (this.wsPicked() === w.id ? ' is-on' : ''),
          pick: () => { this.wsPicked(w.id); toast.info(w.name + ' selected.'); }
        })));
      this.wsPages = ui.pages(this.workspaces, 5, [5, 10, 25]);
      this.selected = ko.observableArray([]);
      this.allSelected = ko.pureComputed(() => this.workspaces().length > 0 && this.selected().length === this.workspaces().length);
      this.toggleAll = () => { this.selected(this.allSelected() ? [] : this.workspaces().map((w) => w.id)); return true; };
      this.wsRows = ko.pureComputed(() => this.wsPages.rows().map((w) => {
        const on = this.selected().indexOf(w.id) >= 0;
        return Object.assign({}, w, {
          checked: on, css: on ? 'is-selected' : '', initials: ui.initials(w.bankName || w.name), avatar: ui.avatarTone(w.bankName || w.name),
          toggle: () => { if (on) { this.selected.remove(w.id); } else { this.selected.push(w.id); } return true; }
        });
      }));
      this.cards = ko.pureComputed(() => this.workspaces().map((w) => ({ name: w.name, sub: (w.bankName || '') + ' · OBDX ' + w.obdxVersion,
        open: () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'workspaces' })) })));

      // The factory's own elements (fx-select, fx-input, fx-switch, fx-menu-button)
      this.wsOptions = ko.pureComputed(() => this.workspaces().map((w) => ({ value: w.id, label: w.name, description: (w.bankName || '') + ' · OBDX ' + w.obdxVersion })));
      this.fxName = ko.observable('');
      this.fxPassword = ko.observable('');
      this.menuItems = [{ value: 'edit', label: 'Edit', icon: 'edit' }, { value: 'copy', label: 'Duplicate', icon: 'doc' }, { separator: true }, { value: 'delete', label: 'Delete…', icon: 'trash', danger: true }];
      this.menuAction = (event) => {
        if (event.detail.value === 'delete') {
          dialog.confirm({ title: 'Delete this item?', message: 'This is the Design System page, so nothing is deleted.', confirmLabel: 'Delete', danger: true }).then((ok) => toast.info(ok ? 'Confirmed.' : 'Cancelled.'));
        } else {
          toast.info(event.detail.value + ' chosen.');
        }
      };
      // Selection controls
      this.agree = ko.observable(true);
      this.agreeChange = ui.checked(this.agree);
      this.radio = ko.observable('selected');
      this.radioChange = ui.value(this.radio);
      this.switchOn = ko.observable(true);
      this.flip = () => this.switchOn(!this.switchOn());
      this.align = ko.observable('center');
      this.alignButtons = ko.pureComputed(() => [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]
        .map((b) => ({ label: b.label, pressed: this.align() === b.value ? 'true' : 'false', pick: () => this.align(b.value) })));

      // Date and time
      this.date = ko.observable(new Date().toISOString().slice(0, 10));
      this.time = ko.observable('T12:30:00');
      const monthStart = new Date();
      monthStart.setDate(1);
      this.from = ko.observable(monthStart.toISOString().slice(0, 10));
      this.to = ko.observable(new Date().toISOString().slice(0, 10));

      // Chips
      this.tags = ko.observableArray(['Retail Banking', 'Payments', 'Fund Transfer']);
      this.removeTag = (tag) => () => { this.tags.remove(tag); toast.info('Removed ' + tag + '.'); };
      this.addTag = () => { const name = 'Tag ' + (this.tags().length + 1); this.tags.push(name); };
      this.filters = ['Default', 'Primary', 'Secondary', 'Success', 'Warning', 'Error', 'Info', 'New'];
      this.badgeCss = { Default: 'fx-badge', Primary: 'fx-badge fx-badge--primary', Secondary: 'fx-badge fx-badge--violet', Success: 'fx-badge fx-badge--success',
        Warning: 'fx-badge fx-badge--warning', Error: 'fx-badge fx-badge--danger', Info: 'fx-badge fx-badge--info', New: 'fx-badge fx-badge--primary fx-badge--plain' };
      this.filterList = this.filters.map((f) => ({ label: f, css: this.badgeCss[f] }));

      // Carousel
      this.carousel = ui.carousel();

      // Feedback
      this.toastSuccess = () => toast.success('Template created successfully.');
      this.toastError = () => toast.error('Build failed due to compilation errors.', { action: { label: 'Details', run: () => toast.info('Open Build & Test to see the log.') } });
      this.openDialog = () => dialog.confirm({ title: 'Confirm action', message: 'Are you sure you want to delete this template? This action cannot be undone.', confirmLabel: 'Delete', danger: true })
        .then((ok) => (ok ? toast.success('Confirmed. (Nothing was deleted: this is the Design System page.)') : toast.info('Cancelled.')));
      this.steps = [{ label: 'Design', css: 'is-done', n: '✓' }, { label: 'Build', css: 'is-current', n: '2' }, { label: 'Test', css: '', n: '3' }, { label: 'Deploy', css: '', n: '4' }];
      this.progress = ko.observable(60);
      this.progressStyle = ko.pureComputed(() => ({ width: this.progress() + '%' }));
      this.bump = () => this.progress(this.progress() >= 100 ? 10 : this.progress() + 10);
      this.brand.concat(this.neutrals, this.semantic).forEach((s) => { s.copy = () => ui.copy('var(' + s.token + ')').then(() => toast.success('Copied var(' + s.token + ').')).catch((e) => toast.error(e.message)); });
      this.switchText = ko.pureComputed(() => (this.switchOn() ? 'true' : 'false'));

      // Workflow components
      this.moduleOptions = ['accounts', 'payments', 'cards', 'service-requests', 'loans'].map((m) => ({ value: m, label: m }));
      this.modules = ko.observableArray(['payments']);
      this.modulesText = ko.pureComputed(() => (this.modules() || []).join(', ') || 'none');
      this.deliveryOptions = [{ value: 'branch', label: 'SVN branch' }, { value: 'patch', label: 'Patch file' }];
      this.delivery = ko.observable('branch');
      this.densityOptions = [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }];
      this.density = preferences.density;
      this.rangeFrom = ko.observable('');
      this.rangeTo = ko.observable('');
      this.sheetOpen = ko.observable(false);
      this.openSheet = () => this.sheetOpen(true);
      this.statuses = ['DRAFT', 'QUEUED', 'GENERATING', 'PLAN_READY', 'APPROVED', 'CLOSED', 'FAILED'].map((x) => ui.status(x));

      this.connected = () => {
        accUtils.announce('Design System page loaded.');
        document.title = 'Design System';
        readTokens();
        api.get('workspaces').then((list) => this.workspaces(list)).catch((e) => toast.error(e.message));
        window.setTimeout(() => this.carousel.attach(document.getElementById('dsCarouselTrack')), 0);
      };
    }

    return DesignViewModel;
  }
);
