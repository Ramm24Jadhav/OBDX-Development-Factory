/*
 * Design System page: the factory's design tokens and shared components, live. Colours and type come from the tokens
 * in app.css; the components are the same ones the other pages use, with the factory's real workspaces where a
 * component shows data (carousel, select, table, ring chart).
 * The token reference reads every --fx-* token from the stylesheet itself (its light and dark values), so it can never
 * drift from app.css; the contrast table measures the token pairs in the theme in use.
 */
define(['knockout', '../accUtils', '../services/api', '../services/ui', '../services/toast', '../services/dialog', '../services/preferences',
        'ojs/ojknockout'],
  function (ko, accUtils, api, ui, toast, dialog, preferences) {
    const ICONS = ['home', 'folder', 'code', 'profile', 'list', 'design', 'branch', 'flask', 'refresh', 'chip', 'robot', 'cog', 'share', 'plug',
      'cube', 'sparkle', 'bell', 'user', 'users', 'info', 'search', 'plus', 'edit', 'trash', 'check', 'alert', 'clock', 'doc', 'link', 'shield',
      'bank', 'chart', 'target', 'monitor', 'laptop', 'rocket', 'help', 'sun', 'moon', 'arrow', 'more', 'x'];

    // Token groups by name, in the order the reference lists them
    const GROUPS = [['Colour', /^--fx-(primary|secondary|violet|success|warning|danger|info|bg|surface|border(?!-width)|text(?!-(display|h\d|lg|md|base|sm|caption|2xs|overline))|disabled|nav|on-|gradient|focus-color|status)/],
      ['Typography', /^--fx-(font|text-(display|h\d|lg|md|base|sm|caption|2xs|overline)|weight)/], ['Spacing and grid', /^--fx-(space|gutter|gap|card-pad|control|touch|topbar)/],
      ['Radius, borders and elevation', /^--fx-(radius|border-width|shadow|elevation|focus$)/], ['Motion', /^--fx-(dur|ease|stagger|duration)/]];
    const groupOf = (name) => (GROUPS.find((g) => g[1].test(name)) || ['Other'])[0];
    // Every --fx-* token the stylesheet defines on :root, with its light and dark values
    const collectTokens = () => {
      const light = {};
      const dark = {};
      Array.from(document.styleSheets).forEach((sheet) => {
        let rules = [];
        try { rules = Array.from(sheet.cssRules || []); } catch (e) { rules = []; }
        rules.forEach((r) => {
          if (!r.style || !r.selectorText) { return; }
          const target = r.selectorText.trim() === ':root' ? light : r.selectorText.trim() === ':root[data-theme="dark"]' ? dark : null;
          if (!target) { return; }
          for (let i = 0; i < r.style.length; i++) {
            const name = r.style[i];
            if (name.indexOf('--fx-') === 0) { target[name] = r.style.getPropertyValue(name).trim(); }
          }
        });
      });
      return Object.keys(light).sort().map((name) => ({ name: name, light: light[name], dark: dark[name] || '', group: groupOf(name) }));
    };
    // Relative luminance and contrast ratio (WCAG 2.x) of two computed colours
    const rgb = (css) => (css.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    // A translucent colour (the dark theme's soft tints) as seen over an opaque one
    const over = (css, base) => {
      const n = (css.match(/[\d.]+/g) || []).map(Number);
      if (n.length < 4 || n[3] >= 1) { return css; }
      const b = rgb(base);
      return 'rgb(' + [0, 1, 2].map((i) => Math.round(n[i] * n[3] + b[i] * (1 - n[3]))).join(', ') + ')';
    };
    const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const l1 = lum(rgb(a)); const l2 = lum(rgb(b)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const PAIRS = [['--fx-text', '--fx-surface', 'Text on a card'], ['--fx-text-body', '--fx-surface', 'Body text'], ['--fx-text-muted', '--fx-surface', 'Muted text'],
      ['--fx-text-muted', '--fx-surface-2', 'Muted text on a tint'], ['--fx-text-faint', '--fx-surface', 'Faint text (decorative only)'], ['--fx-primary-text', '--fx-surface', 'Links'],
      ['--fx-on-primary', '--fx-primary', 'Primary button'], ['--fx-success-text', '--fx-success-soft', 'Success badge'], ['--fx-warning-text', '--fx-warning-soft', 'Warning badge'],
      ['--fx-danger-text', '--fx-danger-soft', 'Error badge'], ['--fx-info-text', '--fx-info-soft', 'Info badge'], ['--fx-violet-text', '--fx-violet-soft', 'Violet badge'],
      ['--fx-nav-text', '--fx-nav-bg', 'Sidebar text'], ['--fx-text', '--fx-bg', 'Text on the page']];
    // Breakpoints, as in app.css media queries (CSS variables cannot be used in media queries)
    const BREAKPOINTS = [{ name: 'Phone', range: 'up to 767px', max: 767, layout: 'Menu as a drawer; grids one column; controls wrap; tab strips scroll' },
      { name: 'Tablet', range: '768 to 1099px', max: 1099, layout: 'Menu as icons; breadcrumb and user name hidden' },
      { name: 'Laptop', range: '1100 to 1439px', max: 1439, layout: 'Full menu; list and detail panels stack' },
      { name: 'Desktop', range: '1440px and up', max: Infinity, layout: 'Layouts as designed' }];

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
      preferences.theme.subscribe(() => window.setTimeout(() => { readTokens(); measure(); }, 0));
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

      // Token reference: every token, its light and dark values, copy its var() or value
      this.tokens = ko.observableArray([]);
      this.tokenQuery = ko.observable('');
      this.tokenQueryInput = ui.value(this.tokenQuery);
      this.tokenGroup = ko.observable('');
      this.tokenGroupChange = ui.value(this.tokenGroup);
      this.tokenGroups = GROUPS.map((g) => g[0]).concat(['Other']);
      this.tokenRows = ko.pureComputed(() => {
        const q = this.tokenQuery().trim().toLowerCase();
        return this.tokens().filter((t) => (!this.tokenGroup() || t.group === this.tokenGroup()) && (!q || (t.name + ' ' + t.light + ' ' + t.dark).toLowerCase().indexOf(q) >= 0))
          .map((t) => Object.assign({}, t, {
            isColour: t.group === 'Colour' && !/gradient/.test(t.name), sample: { background: 'var(' + t.name + ')' },
            copyVar: () => ui.copy('var(' + t.name + ')').then(() => toast.success('Copied var(' + t.name + ').')).catch((e) => toast.error(e.message)),
            copyValue: () => ui.copy(t.light).then(() => toast.success('Copied ' + t.light + '.')).catch((e) => toast.error(e.message))
          }));
      });
      this.tokenCount = ko.pureComputed(() => this.tokenRows().length + ' of ' + this.tokens().length + ' tokens');
      // Spacing, radius, borders, elevation and motion, as live samples of the tokens
      this.spaceScale = [1, 2, 3, 4, 5, 6].map((n) => ({ name: '--fx-space-' + n, bar: { width: 'var(--fx-space-' + n + ')' } }));
      this.radii = ['--fx-radius-sm', '--fx-radius', '--fx-radius-lg', '--fx-radius-xl', '--fx-radius-pill'].map((n) => ({ name: n, style: { borderRadius: 'var(' + n + ')' } }));
      this.elevations = [['--fx-elevation-1', 'Cards at rest'], ['--fx-elevation-2', 'Cards on hover, popovers'], ['--fx-elevation-3', 'Menus, dialogs, sheets']]
        .map((e) => ({ name: e[0], use: e[1], style: { boxShadow: 'var(' + e[0] + ')' } }));
      this.borders = [['--fx-border-width', 'Card, field and table lines'], ['--fx-border-width-strong', 'Focus outlines, the active tab, status edges']]
        .map((b) => ({ name: b[0], use: b[1], style: { borderWidth: 'var(' + b[0] + ')' } }));
      this.motions = [['--fx-dur-press', 'A button press'], ['--fx-dur-hover', 'Hover and focus'], ['--fx-dur-pop', 'Menus and popups'], ['--fx-dur-panel', 'Panels, the menu'],
        ['--fx-dur-modal', 'Dialogs, the palette'], ['--fx-dur-page', 'A page opening']].map((m) => ({ name: m[0], use: m[1], value: ko.observable('') }));
      this.motionOn = ko.observable(false);
      this.playMotion = () => { this.motionOn(false); window.setTimeout(() => this.motionOn(true), 30); };
      this.motionCss = ko.pureComputed(() => 'factory-ds-motion' + (this.motionOn() ? ' is-on' : ''));
      this.reducedMotion = ko.observable(!!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
      this.layout = [['--fx-gutter', 'Page side padding'], ['--fx-gap', 'Between cards and sections'], ['--fx-card-pad', 'Inside cards'], ['--fx-touch', 'Smallest touch target']]
        .map((l) => ({ name: l[0], use: l[1], value: ko.observable('') }));
      // Contrast of the token pairs in the theme in use
      this.contrast = ko.observableArray([]);
      const measure = () => {
        const probe = document.createElement('span');
        document.body.appendChild(probe);
        const colour = (token) => { probe.style.color = 'var(' + token + ')'; return getComputedStyle(probe).color; };
        this.contrast(PAIRS.map((p) => {
          const bg = over(colour(p[1]), colour('--fx-surface'));
          const fg = over(colour(p[0]), bg);
          const r = ratio(fg, bg);
          const decorative = /decorative/.test(p[2]);
          return { use: p[2], pair: p[0] + ' on ' + p[1], ratio: r.toFixed(2) + ':1', sample: { color: fg, background: bg },
            pill: r >= 4.5 ? ui.status('SUCCEEDED', 'AA') : r >= 3 ? ui.status('WARNING', decorative ? 'Large text only (decorative)' : 'Large text only') : ui.status('FAILED', decorative ? 'Below 3:1 (decorative only)' : 'Below 3:1') };
        }));
        probe.remove();
        const styles = getComputedStyle(document.documentElement);
        this.motions.concat(this.layout).forEach((m) => m.value(styles.getPropertyValue(m.name).trim()));
      };
      this.contrastFails = ko.pureComputed(() => this.contrast().filter((c) => c.pill.text !== 'AA' && !/decorative/.test(c.use)).length);
      // Responsive: the breakpoint the window is in now
      this.width = ko.observable(window.innerWidth);
      this.breakpoints = ko.pureComputed(() => {
        const current = BREAKPOINTS.find((b) => this.width() <= b.max);
        return BREAKPOINTS.map((b) => Object.assign({}, b, { css: b === current ? 'is-current' : '', now: b === current ? 'Now (' + this.width() + 'px)' : '' }));
      });
      const onResize = () => this.width(window.innerWidth);
      // Ring chart (factory-ring, as on Modernization) with real data: the workspaces by OBDX version
      this.ring = ko.pureComputed(() => {
        const all = this.workspaces();
        const v22 = all.filter((w) => w.obdxVersion === '22.x').length;
        const p = all.length ? Math.round(100 * v22 / all.length) : 0;
        return { style: { '--p': p, '--c': 'var(--fx-primary)' }, label: all.length ? p + '%' : '–', text: v22 + ' of ' + all.length + ' workspaces on OBDX 22.x' };
      });
      // Tabs: the tablist pattern (arrow keys, Home, End) every page uses
      this.demoTab = ko.observable('overview');
      this.demoTabs = ui.tabs(this.demoTab, [{ value: 'overview', label: 'Overview' }, { value: 'files', label: 'Files', count: 12 }, { value: 'history', label: 'History' }]);
      this.demoTabKey = (event) => {
        const keys = this.demoTabs.map((t) => t.value);
        const at = keys.indexOf(this.demoTab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.demoTab(keys[next]);
        const b = document.getElementById('dsTab-' + keys[next]);
        if (b) {
          b.focus();
        }
        return false;
      };

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
        this.tokens(collectTokens());
        measure();
        window.addEventListener('resize', onResize);
        api.get('workspaces').then((list) => this.workspaces(list)).catch((e) => toast.error(e.message));
        this.carousel.attach('dsCarouselTrack');
      };
      this.disconnected = () => window.removeEventListener('resize', onResize);
    }

    return DesignViewModel;
  }
);
