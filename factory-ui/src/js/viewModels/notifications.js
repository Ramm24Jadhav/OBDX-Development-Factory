/*
 * Notification Center page: one header with Mark all read, chips with counts by kind (unread, needs you, failures,
 * questions, builds, AI work, reviews, system), a search and more filters (type, priority, time), compact rows grouped
 * by day with the unread state, and the chosen notification beside the list with its error summary, actions and
 * related items. Notifications come from the notifications service; read state is kept in this browser.
 */
define(['knockout', '../accUtils', '../services/dashboard', '../services/notifications', '../services/workspaceSelection', '../services/ui',
        '../services/toast', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, dashboard, notifications, workspaceSelection, ui, toast, pageRequests) {
    const CATEGORY = { action: 'Action Required', build: 'Build & Test', agent: 'AI work', review: 'Reviews & Approvals', system: 'System' };
    const PRIORITY = { high: { text: 'High', css: 'fx-badge fx-badge--danger' }, medium: { text: 'Medium', css: 'fx-badge fx-badge--warning' }, low: { text: 'Low', css: 'fx-badge fx-badge--success' } };
    // The state of the thing a notification is about, from how the notifications service builds its id
    const SUBJECT = [
      ['build-', (n) => (n.tone === 'green' ? ui.status('SUCCEEDED', 'Build passed') : ui.status('FAILED', 'Build failed'))],
      ['req-failed-', () => ui.status('FAILED')], ['req-ready-', () => ui.status('READY', 'Ready for review')], ['req-ok-', () => ui.status('APPROVED')],
      ['design-review-', () => ui.status('IN_REVIEW', 'In review')], ['plan-', () => ui.status('PLAN_READY', 'Plan ready')],
      ['gen-', () => ui.status('GENERATED')], ['chg-failed-', () => ui.status('FAILED')],
      ['import-', (n) => (n.tone === 'red' ? ui.status('FAILED', 'Import failed') : ui.status('SUCCEEDED', 'Indexed'))]
    ];
    // The service gives each notification its subject's status; the id prefixes are only a fallback for older items
    const subjectStatus = (n) => {
      if (n.subjectStatus) { return ui.status(n.subjectStatus, n.subjectWords); }
      const m = SUBJECT.find((s) => String(n.id).indexOf(s[0]) === 0);
      return m ? m[1](n) : null;
    };
    // The page each notification opens, as the user knows it
    const PAGE = {
      build: ['Build & Test', 'flask'], requirements: ['Requirement', 'list'], reviews: ['Screen review', 'design'], impact: ['Change plan', 'branch'],
      changes: ['Change', 'branch'], code: ['Code', 'code'], models: ['Models', 'chip']
    };
    // The kinds (chips): All and Unread always show, the others when they have notifications
    const KINDS = [
      { value: 'all', label: 'All', test: () => true },
      { value: 'unread', label: 'Unread', dot: 'is-primary', test: (n) => n.unread() },
      { value: 'action', label: 'Needs you', dot: 'is-warning', test: (n) => n.action },
      { value: 'failed', label: 'Failures', dot: 'is-danger', test: (n) => n.tone === 'red' },
      { value: 'questions', label: 'Questions', test: (n) => n.title === 'Questions to Answer' },
      { value: 'build', label: 'Builds', test: (n) => n.category === 'build' },
      { value: 'agent', label: 'AI work', test: (n) => n.category === 'agent' },
      { value: 'review', label: 'Reviews & approvals', test: (n) => n.category === 'review' },
      { value: 'system', label: 'System', test: (n) => n.category === 'system' }
    ];
    const DAY_MS = 24 * 3600 * 1000;
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayLabel = (at) => {
      if (!at) { return 'Not dated'; }
      const d = new Date(at);
      const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
      return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: diff < 7 ? 'long' : undefined, day: 'numeric', month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    };
    const timeOf = (n) => (n.at ? new Date(n.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');

    function NotificationsViewModel() {
      const all = notifications.all;

      this.kind = ko.observable('all');
      this.search = ko.observable('');
      this.typeFilter = ko.observable('');
      this.priorityFilter = ko.observable('');
      this.timeFilter = ko.observable('');
      this.moreFilters = ko.observable(false);
      this.toggleFilters = () => this.moreFilters(!this.moreFilters());
      this.typeOptions = ko.pureComputed(() => [{ value: '', label: 'All types' }].concat(all().map((n) => n.title).filter((t, i, list) => list.indexOf(t) === i).sort().map((t) => ({ value: t, label: t }))));
      this.priorityOptions = [{ value: '', label: 'Any priority' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }];
      this.timeOptions = [{ value: '', label: 'Any time' }, { value: '1', label: 'Today' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }];
      this.extraCount = ko.pureComputed(() => [this.typeFilter(), this.priorityFilter(), this.timeFilter()].filter(Boolean).length);
      this.filtersOn = ko.pureComputed(() => !!(this.search() || this.extraCount() || this.kind() !== 'all'));
      this.clearFilters = () => { this.search(''); this.typeFilter(''); this.priorityFilter(''); this.timeFilter(''); this.kind('all'); };
      const matches = (n) => {
        const text = this.search().trim().toLowerCase();
        const days = this.timeFilter() ? Number(this.timeFilter()) : 0;
        return (!this.typeFilter() || n.title === this.typeFilter())
          && (!this.priorityFilter() || n.priority === this.priorityFilter())
          && (!days || (n.at && Date.now() - new Date(n.at).getTime() < days * DAY_MS))
          && (!text || (n.title + ' ' + n.text + ' ' + n.related).toLowerCase().indexOf(text) >= 0);
      };
      this.kindChips = ko.pureComputed(() => {
        const base = all().filter(matches);
        return KINDS.map((k) => {
          const n = base.filter(k.test).length;
          return { value: k.value, n: n, text: k.label + ' ' + n, dot: k.dot ? 'factory-rq-fdot ' + k.dot : '',
            pressed: this.kind() === k.value ? 'true' : 'false', pick: () => this.kind(k.value) };
        }).filter((c) => c.value === 'all' || c.value === 'unread' || c.n > 0 || this.kind() === c.value);
      });
      this.visible = ko.pureComputed(() => {
        const k = KINDS.find((x) => x.value === this.kind()) || KINDS[0];
        return all().filter((n) => k.test(n) && matches(n))
          .slice().sort((a, b) => (b.at ? new Date(b.at).getTime() : 0) - (a.at ? new Date(a.at).getTime() : 0));
      });
      this.pager = ui.pages(this.visible, 25, [25, 50, 100]);
      this.long = ko.pureComputed(() => this.visible().length > this.pager.size());
      this.unreadCount = notifications.unreadCount;
      this.lead = ko.pureComputed(() => {
        const total = all().length;
        if (!total) { return 'Builds, AI work, reviews and system events of your workspaces.'; }
        const unread = this.unreadCount();
        const needs = all().filter((n) => n.action).length;
        return (unread ? unread + ' unread' : 'All read') + ' · ' + needs + ' need you · ' + total + ' in all';
      });
      this.shown = ko.pureComputed(() => (this.visible().length === all().length ? all().length + ' shown' : this.visible().length + ' of ' + all().length));

      this.selectedId = ko.observable(null);
      this.selected = ko.pureComputed(() => all().find((n) => n.id === this.selectedId()) || (this.selectedId() === 'none' ? null : this.visible()[0]) || null);

      const go = (n, page, codeTab) => {
        if (n.workspaceId) {
          workspaceSelection.selectedId(n.workspaceId);
        }
        if (page === 'code') {
          // An import's notification opens Code › Index; the code itself opens on Code › Explore
          pageRequests.codeTab(codeTab || (n.page === 'code' ? 'index' : 'explore'));
        }
        window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
      };
      const toggleRead = (n) => (n.unread() ? notifications.markRead([n.id]) : notifications.markUnread([n.id]));
      const external = (url) => () => window.open(url, '_blank', 'noopener');

      // Rows, with a day heading before the first row of each day
      this.rows = ko.pureComputed(() => {
        let lastDay = null;
        return this.pager.rows().map((n) => {
          const day = dayLabel(n.at);
          const head = day !== lastDay ? day : '';
          lastDay = day;
          const isOn = ko.pureComputed(() => !!this.selected() && this.selected().id === n.id);
          return Object.assign({}, n, {
            dayHead: head,
            iconCss: 'factory-nt-icon is-' + n.tone, iconClass: 'factory-nav-icon factory-ico-' + n.icon,
            categoryText: CATEGORY[n.category], subject: subjectStatus(n),
            priorityBadge: n.priority === 'high' ? PRIORITY.high : null,
            time: timeOf(n) || n.when,
            sub: [n.related, n.relatedSub].filter(Boolean).join(' · '),
            css: ko.pureComputed(() => 'factory-nt-item' + (n.unread() ? ' is-unread' : '') + (isOn() ? ' is-on' : '')),
            current: ko.pureComputed(() => (isOn() ? 'true' : null)),
            label: ko.pureComputed(() => (n.unread() ? 'Unread: ' : '') + n.title + '. ' + n.text),
            pick: () => {
              this.selectedId(n.id);
              notifications.markRead([n.id]);
              // At 1024 px and below the notification is under the list: bring it into view
              if (window.innerWidth <= 1024) {
                window.setTimeout(() => { const d = document.getElementById('ntDetail'); if (d) { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 0);
              }
            },
            menuItems: ko.pureComputed(() => [
              { value: 'read', label: n.unread() ? 'Mark as read' : 'Mark as unread', icon: 'check' },
              { value: 'open', label: 'Open ' + (PAGE[n.page] || [n.page])[0], icon: 'arrow' },
              { value: 'details', label: 'Show details', icon: 'info' }
            ]),
            menu: (event) => {
              const v = event.detail.value;
              if (v === 'read') { toggleRead(n); } else if (v === 'open') { notifications.markRead([n.id]); go(n, n.page); } else { this.selectedId(n.id); notifications.markRead([n.id]); }
            }
          });
        });
      });

      this.selectedView = ko.pureComputed(() => {
        const n = this.selected();
        if (!n) {
          return null;
        }
        const page = PAGE[n.page] || [n.page, 'arrow'];
        const readAction = { label: n.unread() ? 'Mark as read' : 'Mark as unread', run: () => toggleRead(n) };
        let primary = { label: 'Open ' + page[0], run: () => go(n, n.page) };
        let secondary = readAction;
        if (n.category === 'build') {
          primary = n.link ? { label: 'View build logs', run: external(n.link.replace(/\/?$/, '/') + 'console'), external: true } : { label: 'Open Build & Test', run: () => go(n, 'build') };
          secondary = n.link ? { label: 'View in Jenkins', run: external(n.link), external: true } : readAction;
        }
        const ws = (n.details.find((d) => d.label === 'Workspace') || {}).value;
        const related = [{ label: page[0], value: n.related, icon: page[1], run: () => go(n, n.page) }];
        if (n.category === 'build' || n.category === 'agent' || n.page === 'code') {
          related.push({ label: 'The code', value: 'Code › Explore', icon: 'code', run: () => go(n, 'code', 'explore') });
        }
        if (ws) {
          related.push({ label: 'Workspace', value: ws, icon: 'folder', run: () => go(n, 'workspaces') });
        }
        if (n.link) {
          related.push({ label: 'Jenkins build', value: n.related, icon: 'share', run: external(n.link) });
        }
        return Object.assign({}, n, {
          iconCss: 'factory-nt-icon factory-nt-bigicon is-' + n.tone, iconClass: 'factory-nav-icon factory-ico-' + n.icon,
          priorityBadge: PRIORITY[n.priority], category: CATEGORY[n.category], subject: subjectStatus(n), primary: primary, secondary: secondary,
          // Mark as read stays one click away even when the second button opens Jenkins
          readLabel: readAction.label, showRead: secondary !== readAction,
          errorsCss: 'fx-alert ' + (n.tone === 'red' ? 'fx-alert--danger' : 'fx-alert--warning') + ' factory-nt-errors',
          relatedItems: related.map((r) => Object.assign(r, { iconClass: 'factory-nav-icon factory-ico-' + r.icon }))
        });
      });
      this.selectedRead = () => { const n = this.selected(); if (n) { toggleRead(n); } };
      this.closeDetails = () => this.selectedId('none');

      const plural = (count) => count + (count === 1 ? ' notification' : ' notifications');
      this.unreadVisible = ko.pureComputed(() => this.visible().some((n) => n.unread()));
      this.markAllRead = () => {
        const ids = this.visible().filter((n) => n.unread()).map((n) => n.id);
        notifications.markRead(ids);
        toast.success(plural(ids.length) + ' marked as read.', { action: { label: 'Undo', run: () => notifications.markUnread(ids) } });
      };
      // The former selection bar: the same on every notification shown
      this.markShownUnread = () => {
        const ids = this.visible().filter((n) => !n.unread()).map((n) => n.id);
        notifications.markUnread(ids);
        toast.success(plural(ids.length) + ' marked as unread.', { action: { label: 'Undo', run: () => notifications.markRead(ids) } });
      };
      this.settings = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'account' }));
      this.moreItems = ko.pureComputed(() => [
        { value: 'unread', label: 'Mark the shown as unread', icon: 'bell', disabled: !this.visible().some((n) => !n.unread()) },
        { value: 'settings', label: 'Notification settings', icon: 'cog', description: 'Which kinds show, on the Account page' }
      ]);
      this.moreAction = (event) => { if (event.detail.value === 'unread') { this.markShownUnread(); } else { this.settings(); } };
      this.emptyText = ko.pureComputed(() => (all().length === 0 ? 'No notifications yet. Builds, AI work, reviews and system events show here.'
        : this.kind() === 'unread' && !this.search() && !this.extraCount() ? 'Everything is read.' : 'No notifications match.'));

      this.connected = () => {
        accUtils.announce('Notification Center loaded.');
        document.title = 'Notifications';
        dashboard.load();
      };
    }

    return NotificationsViewModel;
  }
);
