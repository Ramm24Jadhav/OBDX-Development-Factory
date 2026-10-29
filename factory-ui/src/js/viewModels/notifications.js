/*
 * Notification Center page: every notification with its category, priority and read state, filters, the selected
 * one's details, error summary, actions and related items, and marking as read. Notifications come from the
 * notifications service.
 */
define(['knockout', '../accUtils', '../services/dashboard', '../services/notifications', '../services/workspaceSelection', '../services/ui',
        '../services/toast', 'ojs/ojknockout'],
  function (ko, accUtils, dashboard, notifications, workspaceSelection, ui, toast) {
    const CATEGORY = { action: 'Action Required', build: 'Build & Test', agent: 'Agent Runs', review: 'Reviews & Approvals', system: 'System' };
    const PRIORITY = { high: { text: 'High', css: 'fx-badge fx-badge--danger' }, medium: { text: 'Medium', css: 'fx-badge fx-badge--warning' }, low: { text: 'Low', css: 'fx-badge fx-badge--success' } };
    const UNREAD = { text: 'Unread', css: 'fx-badge fx-badge--primary' };
    const READ = { text: 'Read', css: 'fx-badge' };
    // The page each notification opens, as the user knows it
    const PAGE = {
      build: ['Build & Test', 'flask'], requirements: ['Requirement', 'list'], reviews: ['Screen review', 'design'], impact: ['Change plan', 'branch'],
      changes: ['Change', 'branch'], code: ['Code', 'code'], models: ['Models', 'chip']
    };

    function NotificationsViewModel() {
      const all = notifications.all;
      const c = (test) => ko.pureComputed(() => all().filter(test).length);
      const count = (test) => all().filter(test).length;
      this.kpis = ko.pureComputed(() => [
        { label: 'Total Notifications', value: all().length, sub: '↑ ' + count((n) => n.today) + ' today', css: 'factory-kpi-sub fx-trend fx-trend--up', tone: 'amber', icon: 'bell' },
        { label: 'Action Required', value: count((n) => n.action), sub: 'Needs your attention', css: 'factory-kpi-sub', tone: 'red', icon: 'alert' },
        { label: 'Build & Test', value: count((n) => n.category === 'build'), sub: count((n) => n.category === 'build' && n.tone === 'red') + ' failed, ' + count((n) => n.category === 'build' && n.tone === 'green') + ' completed', css: 'factory-kpi-sub', tone: 'violet', icon: 'cog' },
        { label: 'Agent Runs', value: count((n) => n.category === 'agent'), sub: count((n) => n.category === 'agent' && n.tone !== 'red') + ' completed, ' + count((n) => n.category === 'agent' && n.tone === 'red') + ' failed', css: 'factory-kpi-sub', tone: 'blue', icon: 'robot' },
        { label: 'Reviews & Approvals', value: count((n) => n.category === 'review'), sub: count((n) => n.category === 'review' && n.action) + ' pending approval', css: 'factory-kpi-sub', tone: 'violet', icon: 'doc' },
        { label: 'System', value: count((n) => n.category === 'system'), sub: 'General updates', css: 'factory-kpi-sub', tone: 'blue', icon: 'info' }
      ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-no-tone-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon })));

      this.tab = ko.observable('all');
      this.tabs = ui.tabs(this.tab, [
        { value: 'all', label: 'All', icon: 'bell', count: c(() => true) },
        { value: 'action', label: 'Action Required', icon: 'alert', count: c((n) => n.action) },
        { value: 'build', label: 'Build & Test', icon: 'cog', count: c((n) => n.category === 'build') },
        { value: 'agent', label: 'Agent Runs', icon: 'robot', count: c((n) => n.category === 'agent') },
        { value: 'review', label: 'Reviews', icon: 'doc', count: c((n) => n.category === 'review') },
        { value: 'system', label: 'System', icon: 'info', count: c((n) => n.category === 'system') }
      ]);
      this.search = ko.observable('');
      this.typeFilter = ko.observable('');
      this.statusFilter = ko.observable('');
      this.priorityFilter = ko.observable('');
      this.timeFilter = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.typeChange = ui.value(this.typeFilter);
      this.statusChange = ui.value(this.statusFilter);
      this.priorityChange = ui.value(this.priorityFilter);
      this.timeChange = ui.value(this.timeFilter);
      this.types = ko.pureComputed(() => all().map((n) => n.title).filter((t, i, list) => list.indexOf(t) === i).sort());
      this.filtersOn = ko.pureComputed(() => !!(this.search() || this.typeFilter() || this.statusFilter() || this.priorityFilter() || this.timeFilter()));
      this.clearFilters = () => { this.search(''); this.typeFilter(''); this.statusFilter(''); this.priorityFilter(''); this.timeFilter(''); };
      this.visible = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        const days = this.timeFilter() ? Number(this.timeFilter()) : 0;
        return all().filter((n) => (this.tab() === 'all' || (this.tab() === 'action' ? n.action : n.category === this.tab()))
          && (!this.typeFilter() || n.title === this.typeFilter())
          && (!this.statusFilter() || (this.statusFilter() === 'unread') === n.unread())
          && (!this.priorityFilter() || n.priority === this.priorityFilter())
          && (!days || (n.at && Date.now() - new Date(n.at).getTime() < days * 24 * 3600 * 1000))
          && (!text || (n.title + ' ' + n.text + ' ' + n.related).toLowerCase().indexOf(text) >= 0));
      });
      this.pager = ui.pages(this.visible, 10, [10, 25, 50]);
      // Date over time in the Time column, so the time never breaks apart
      const whenParts = (text) => { const i = text.lastIndexOf(', '); return i > 0 ? [text.slice(0, i), text.slice(i + 2)] : [text, '']; };
      this.selectedId = ko.observable(null);
      this.checked = ko.observable({});
      this.selected = ko.pureComputed(() => all().find((n) => n.id === this.selectedId()) || (this.selectedId() === 'none' ? null : this.visible()[0]) || null);

      // The row ⋮ menu (design system .fx-menu), fixed next to its button so the table does not clip it; one menu
      // state for every row, with the keyboard handling of ui.menu()
      this.rowMenu = ui.menu();
      this.menuId = ko.observable(null);
      this.menuStyle = ko.observable({});
      this.menuRow = ko.pureComputed(() => (this.rowMenu.open() && all().find((n) => n.id === this.menuId())) || null);
      this.closeMenu = () => this.rowMenu.close();
      this.menuKey = (event) => this.rowMenu.key(event);
      this.stop = (event) => { event.stopPropagation(); return true; };

      this.rows = ko.pureComputed(() => this.pager.rows().map((n) => Object.assign({}, n, {
        whenDate: whenParts(n.when)[0], whenTime: whenParts(n.when)[1],
        iconCss: 'factory-kpi-icon factory-no-icon factory-no-tone-' + n.tone, iconClass: 'factory-nav-icon factory-ico-' + n.icon,
        categoryText: CATEGORY[n.category],
        priorityBadge: PRIORITY[n.priority], statusBadge: n.unread() ? UNREAD : READ,
        css: 'factory-clickable' + (this.selected() && this.selected().id === n.id ? ' is-selected' : '') + (n.unread() ? ' factory-no-unread' : ''),
        menuOpen: ko.pureComputed(() => this.rowMenu.open() && this.menuId() === n.id),
        // The open row shows checked, as in the design
        isChecked: ko.pureComputed(() => !!this.checked()[n.id] || (!!this.selected() && this.selected().id === n.id)),
        check: (event) => { event.stopPropagation(); const m = Object.assign({}, this.checked()); m[n.id] = event.target.checked; this.checked(m); return true; },
        pick: () => { this.selectedId(n.id); notifications.markRead([n.id]); },
        menu: (event) => {
          event.stopPropagation();
          if (this.rowMenu.open() && this.menuId() === n.id) {
            this.closeMenu();
            return;
          }
          this.closeMenu();
          const r = event.currentTarget.getBoundingClientRect();
          // Below the button, or above it when the button is near the bottom of the window
          const left = Math.max(8, r.right - 200) + 'px';
          this.menuStyle(r.bottom + 160 < window.innerHeight ? { top: (r.bottom + 4) + 'px', bottom: 'auto', left: left }
            : { top: 'auto', bottom: (window.innerHeight - r.top + 4) + 'px', left: left });
          this.menuId(n.id);
          this.rowMenu.toggle(event);
        }
      })));
      this.allChecked = ko.pureComputed(() => this.pager.rows().length > 0 && this.pager.rows().every((n) => this.checked()[n.id]));
      this.checkAll = (event) => {
        const m = Object.assign({}, this.checked());
        this.pager.rows().forEach((n) => { m[n.id] = event.target.checked; });
        this.checked(m);
        return true;
      };

      const go = (n, page) => {
        if (n.workspaceId) {
          workspaceSelection.selectedId(n.workspaceId);
        }
        window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
      };
      const toggleRead = (n) => (n.unread() ? notifications.markRead([n.id]) : notifications.markUnread([n.id]));
      const external = (url) => () => window.open(url, '_blank', 'noopener');
      this.selectedView = ko.pureComputed(() => {
        const n = this.selected();
        if (!n) {
          return null;
        }
        const page = PAGE[n.page] || [n.page, 'arrow'];
        const readAction = { label: n.unread() ? 'Mark as Read' : 'Mark as Unread', run: () => toggleRead(n) };
        let primary = { label: 'Open ' + page[0], run: () => go(n, n.page) };
        let secondary = readAction;
        if (n.category === 'build') {
          primary = n.link ? { label: 'View Build Logs', run: external(n.link.replace(/\/?$/, '/') + 'console'), external: true } : { label: 'Open Build & Test', run: () => go(n, 'build') };
          secondary = n.link ? { label: 'View in Jenkins', run: external(n.link), external: true } : readAction;
        }
        const ws = (n.details.find((d) => d.label === 'Workspace') || {}).value;
        const related = [{ label: page[0], value: n.related, icon: page[1], run: () => go(n, n.page) }];
        if (n.category === 'build' || n.category === 'agent' || n.page === 'code') {
          related.push({ label: 'Open in Code Explorer', value: '', icon: 'code', run: () => go(n, 'code') });
        }
        if (n.category === 'agent' || n.category === 'build') {
          related.push({ label: 'Agent runs', value: '', icon: 'robot', run: () => go(n, 'agents') });
        }
        if (ws) {
          related.push({ label: 'Workspace', value: ws, icon: 'folder', run: () => go(n, 'workspaces') });
        }
        if (n.link) {
          related.push({ label: 'Jenkins build', value: n.related, icon: 'share', run: external(n.link) });
        }
        return Object.assign({}, n, {
          iconCss: 'factory-kpi-icon factory-no-bigicon factory-no-tone-' + n.tone, iconClass: 'factory-nav-icon factory-ico-' + n.icon,
          priorityBadge: PRIORITY[n.priority], category: CATEGORY[n.category], primary: primary, secondary: secondary,
          errorsCss: 'fx-alert ' + (n.tone === 'red' ? 'fx-alert--danger' : 'fx-alert--warning') + ' factory-no-errors',
          relatedItems: related.map((r) => Object.assign(r, { iconClass: 'factory-nav-icon factory-ico-' + r.icon }))
        });
      });
      this.closeDetails = () => this.selectedId('none');
      this.menuToggleRead = () => { toggleRead(this.menuRow()); this.closeMenu(); };
      this.menuOpen = () => { const n = this.menuRow(); this.closeMenu(); notifications.markRead([n.id]); go(n, n.page); };
      this.menuDetails = () => { const n = this.menuRow(); this.closeMenu(); this.selectedId(n.id); notifications.markRead([n.id]); };
      const checkedIds = () => Object.keys(this.checked()).filter((id) => this.checked()[id]);
      const plural = (count) => count + (count === 1 ? ' notification' : ' notifications');
      this.unreadVisible = ko.pureComputed(() => this.visible().some((n) => n.unread()));
      this.markAllRead = () => {
        const ids = this.visible().filter((n) => n.unread()).map((n) => n.id);
        notifications.markRead(ids);
        toast.success(plural(ids.length) + ' marked as read.', { action: { label: 'Undo', run: () => notifications.markUnread(ids) } });
      };
      this.markSelectedRead = () => { const ids = checkedIds(); notifications.markRead(ids); toast.success(plural(ids.length) + ' marked as read.'); };
      this.markSelectedUnread = () => { const ids = checkedIds(); notifications.markUnread(ids); toast.success(plural(ids.length) + ' marked as unread.'); };
      this.settings = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'account' }));
      this.checkedCount = ko.pureComputed(() => checkedIds().length);
      this.hasChecked = ko.pureComputed(() => this.checkedCount() > 0);

      // The menu is fixed in place, so it closes when the page scrolls under it
      const scrolled = (event) => { if (!(event.target.closest && event.target.closest('.fx-menu'))) { this.closeMenu(); } };
      this.connected = () => {
        accUtils.announce('Notification Center loaded.');
        document.title = 'Notifications';
        dashboard.load();
        window.addEventListener('scroll', scrolled, true);
      };
      this.disconnected = () => {
        this.closeMenu();
        window.removeEventListener('scroll', scrolled, true);
      };
    }

    return NotificationsViewModel;
  }
);
