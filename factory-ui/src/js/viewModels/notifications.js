/*
 * Notification Center page: every notification with its category, priority and read state, filters, the selected
 * one's details and related items, and marking as read. Notifications come from the notifications service.
 */
define(['knockout', '../accUtils', '../services/dashboard', '../services/notifications', '../services/workspaceSelection', '../services/ui',
        'ojs/ojknockout', 'ojs/ojbutton'],
  function (ko, accUtils, dashboard, notifications, workspaceSelection, ui) {
    const CATEGORY = { action: 'Action Required', build: 'Build & Test', agent: 'Agent Runs', review: 'Reviews & Approvals', system: 'System' };
    const PRIORITY = { high: ui.pill('High', 'red'), medium: ui.pill('Medium', 'amber'), low: ui.pill('Low', 'green') };

    function NotificationsViewModel() {
      const all = notifications.all;
      const c = (test) => ko.pureComputed(() => all().filter(test).length);
      this.kpis = ko.pureComputed(() => [
        { label: 'Total Notifications', value: all().length, sub: '↑ ' + all().filter((n) => n.today).length + ' today', css: 'factory-kpi-sub factory-up', tone: 'amber', icon: 'bell' },
        { label: 'Action Required', value: all().filter((n) => n.action).length, sub: 'Needs your attention', css: 'factory-kpi-sub', tone: 'red', icon: 'alert' },
        { label: 'Build & Test', value: all().filter((n) => n.category === 'build').length, sub: all().filter((n) => n.category === 'build' && n.tone === 'red').length + ' failed', css: 'factory-kpi-sub', tone: 'violet', icon: 'cog' },
        { label: 'Agent Runs', value: all().filter((n) => n.category === 'agent').length, sub: all().filter((n) => n.category === 'agent' && n.tone === 'red').length + ' failed', css: 'factory-kpi-sub', tone: 'blue', icon: 'robot' },
        { label: 'Reviews & Approvals', value: all().filter((n) => n.category === 'review').length, sub: all().filter((n) => n.category === 'review' && n.action).length + ' pending', css: 'factory-kpi-sub', tone: 'violet', icon: 'doc' },
        { label: 'System', value: all().filter((n) => n.category === 'system').length, sub: 'General updates', css: 'factory-kpi-sub', tone: 'blue', icon: 'info' }
      ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon })));

      this.tab = ko.observable('all');
      this.tabs = ui.tabs(this.tab, [
        { value: 'all', label: 'All', icon: 'bell', count: c(() => true) },
        { value: 'action', label: 'Action Required', icon: 'alert', count: c((n) => n.action) },
        { value: 'build', label: 'Build & Test', icon: 'cog', count: c((n) => n.category === 'build') },
        { value: 'agent', label: 'Agent Runs', icon: 'robot', count: c((n) => n.category === 'agent') },
        { value: 'review', label: 'Reviews', icon: 'doc', count: c((n) => n.category === 'review') },
        { value: 'system', label: 'System', icon: 'cog', count: c((n) => n.category === 'system') }
      ]);
      this.search = ko.observable('');
      this.statusFilter = ko.observable('');
      this.priorityFilter = ko.observable('');
      this.timeFilter = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.statusChange = ui.value(this.statusFilter);
      this.priorityChange = ui.value(this.priorityFilter);
      this.timeChange = ui.value(this.timeFilter);
      this.visible = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        const days = this.timeFilter() ? Number(this.timeFilter()) : 0;
        return all().filter((n) => (this.tab() === 'all' || (this.tab() === 'action' ? n.action : n.category === this.tab()))
          && (!this.statusFilter() || (this.statusFilter() === 'unread') === n.unread())
          && (!this.priorityFilter() || n.priority === this.priorityFilter())
          && (!days || (n.at && Date.now() - new Date(n.at).getTime() < days * 24 * 3600 * 1000))
          && (!text || (n.title + ' ' + n.text + ' ' + n.related).toLowerCase().indexOf(text) >= 0));
      });
      this.pager = ui.pager(this.visible, 10);
      this.selectedId = ko.observable(null);
      this.checked = ko.observable({});
      this.rows = ko.pureComputed(() => this.pager.rows().map((n) => Object.assign({}, n, {
        iconCss: 'factory-kpi-icon factory-no-icon factory-ov2-icon-' + n.tone, iconClass: 'factory-nav-icon factory-ico-' + n.icon,
        priorityPill: PRIORITY[n.priority], statusPill: n.unread() ? ui.pill('Unread', 'blue') : ui.pill('Read', 'grey'),
        css: this.selected() && this.selected().id === n.id ? 'factory-clickable factory-row-sel' : (n.unread() ? 'factory-clickable factory-no-unread' : 'factory-clickable'),
        isChecked: ko.pureComputed(() => !!this.checked()[n.id]),
        check: (event) => { event.stopPropagation(); const m = Object.assign({}, this.checked()); m[n.id] = !m[n.id]; this.checked(m); return true; },
        pick: () => { this.selectedId(n.id); notifications.markRead([n.id]); }
      })));
      this.selected = ko.pureComputed(() => all().find((n) => n.id === this.selectedId()) || this.visible()[0] || null);
      this.selectedView = ko.pureComputed(() => {
        const n = this.selected();
        return n ? Object.assign({}, n, {
          iconCss: 'factory-kpi-icon factory-no-bigicon factory-ov2-icon-' + n.tone, iconClass: 'factory-nav-icon factory-ico-' + n.icon,
          priorityPill: PRIORITY[n.priority], category: CATEGORY[n.category]
        }) : null;
      });
      this.closeDetails = () => this.selectedId('none');
      this.open = () => {
        const n = this.selected();
        if (n) {
          if (n.workspaceId) {
            workspaceSelection.selectedId(n.workspaceId);
          }
          window.dispatchEvent(new CustomEvent('factory-navigate', { detail: n.page }));
        }
      };
      this.markAllRead = () => notifications.markRead(this.visible().map((n) => n.id));
      this.markSelectedRead = () => notifications.markRead(Object.keys(this.checked()).filter((id) => this.checked()[id]));
      this.markSelectedUnread = () => { notifications.markUnread(Object.keys(this.checked()).filter((id) => this.checked()[id])); };
      this.settings = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'account' }));
      this.hasChecked = ko.pureComputed(() => Object.keys(this.checked()).some((id) => this.checked()[id]));

      this.connected = () => {
        accUtils.announce('Notification Center loaded.');
        document.title = 'Notifications';
        dashboard.load();
      };
    }

    return NotificationsViewModel;
  }
);
