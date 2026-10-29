/*
 * External Review & Approval page: review links of the workspace's screen designs (one link per design, with an expiry
 * date), the reviewer's view of the selected screen as a phone, tablet or desktop (the real review page in a frame),
 * comments from reviewers and the team, and the approval history. Links are created, copied and revoked here; approving
 * a screen does not approve any code.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/previewFrame', 'ojs/ojknockout', 'ojs/ojbutton', 'ojs/ojinputtext', 'ojs/ojmenu'],
  function (ko, accUtils, api, workspaceSelection, session, ui, PreviewFrame) {
    const SOON_MS = 3 * 24 * 3600 * 1000;
    const DAY_MS = 24 * 3600 * 1000;
    const isoDate = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));

    function ReviewsViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.canEdit = ko.pureComputed(() => session.can(this.workspaceId(), 'EDIT_DESIGNS'));
      this.canComment = ko.pureComputed(() => session.can(this.workspaceId(), 'COMMENT'));
      this.errorMessage = ko.observable('');
      this.infoMessage = ko.observable('');
      const showError = (error) => { this.infoMessage(''); this.errorMessage(error.message); };
      const designs = ko.observableArray([]);
      this.loading = ko.observable(false);

      const linkState = (d) => {
        if (d.status === 'APPROVED') {
          return { key: 'approved', pill: ui.pill('Approved', 'green') };
        }
        if (d.reviewToken && d.reviewExpiresAt && new Date(d.reviewExpiresAt) < new Date()) {
          return { key: 'expired', pill: ui.pill('Expired', 'grey') };
        }
        if (d.reviewToken) {
          return { key: 'active', pill: ui.pill('Active', 'green') };
        }
        return d.status === 'IN_REVIEW' ? { key: 'review', pill: ui.pill('In Review', 'blue') } : { key: 'none', pill: ui.pill('No link', 'grey') };
      };
      this.links = ko.pureComputed(() => designs().map((d) => {
        const state = linkState(d);
        const reviewers = Array.from(new Set(d.comments.filter((c) => c.fromReview).map((c) => c.author)));
        const live = !!d.reviewToken && state.key !== 'expired';
        return {
          id: d.id, name: d.name, version: 'v' + d.currentVersion, state: state.key, pill: state.pill,
          hasLink: live, canRevoke: !!d.reviewToken && this.canEdit(), canCreate: this.canEdit() && d.status !== 'APPROVED',
          stop: (event) => event.stopPropagation(),
          action: (event) => {
            const value = event.detail.selectedValue;
            this.selectedId(d.id);
            if (value === 'copy') {
              this.copyLink();
            } else if (value === 'open') {
              window.open(this.reviewUrl(), '_blank', 'noopener');
            } else if (value === 'designer') {
              this.openDesigner();
            } else if (value === 'create') {
              this.createLink();
            } else if (value === 'revoke') {
              this.revokeLink();
            }
          },
          expires: d.reviewExpiresAt ? 'Expires ' + new Date(d.reviewExpiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'No link',
          reviewers: reviewers.length + ' reviewer' + (reviewers.length === 1 ? '' : 's'), comments: d.comments.length + (d.comments.length === 1 ? ' comment' : ' comments'),
          css: ko.pureComputed(() => 'factory-rv-link' + (this.selectedId() === d.id ? ' factory-rv-link-on' : '')),
          pick: () => this.selectedId(d.id)
        };
      }));
      this.linkSearch = ko.observable('');
      this.linkSearchInput = ui.value(this.linkSearch);
      this.visibleLinks = ko.pureComputed(() => {
        const text = this.linkSearch().trim().toLowerCase();
        const list = this.links().filter((l) => !text || (l.name + ' ' + l.version).toLowerCase().indexOf(text) >= 0);
        return this.tab() === 'links' ? list.filter((l) => l.state !== 'none') : list;
      });

      this.kpis = ko.pureComputed(() => {
        const list = designs();
        const active = list.filter((d) => linkState(d).key === 'active');
        const soon = active.filter((d) => new Date(d.reviewExpiresAt) - new Date() < SOON_MS).length;
        const comments = [].concat.apply([], list.map((d) => d.comments));
        const reviewers = new Set(comments.filter((c) => c.fromReview).map((c) => c.author));
        return [
          { label: 'Active Review Links', value: active.length, sub: soon + ' expiring soon', css: 'factory-kpi-sub factory-warn', tone: 'blue', icon: 'link' },
          { label: 'Total Reviewers', value: reviewers.size, sub: 'have commented', css: 'factory-kpi-sub', tone: 'blue', icon: 'user' },
          { label: 'Comments', value: comments.length, sub: comments.filter((c) => c.fromReview).length + ' from reviewers', css: 'factory-kpi-sub', tone: 'violet', icon: 'doc' },
          { label: 'Approved Screens', value: list.filter((d) => d.status === 'APPROVED').length, sub: 'Out of ' + list.length, css: 'factory-kpi-sub', tone: 'green', icon: 'check' },
          { label: 'Pending Approval', value: list.filter((d) => d.status === 'IN_REVIEW').length, sub: 'View details →', css: 'factory-kpi-sub factory-link', tone: 'amber', icon: 'clock' }
        ].map((k) => Object.assign(k, { iconCss: 'factory-kpi-icon factory-ov2-icon-' + k.tone, iconClass: 'factory-nav-icon factory-ico-' + k.icon }));
      });
      this.tab = ko.observable('links');
      this.tabs = ui.tabs(this.tab, [
        { value: 'links', label: 'Review Links', icon: 'link' }, { value: 'screens', label: 'Screens & Changes', icon: 'monitor' },
        { value: 'comments', label: 'Comments', icon: 'doc' }, { value: 'history', label: 'Approval History', icon: 'user' }
      ]);

      // The selected design and its preview
      this.selectedId = ko.observable(null);
      this.selected = ko.pureComputed(() => designs().find((d) => d.id === this.selectedId()) || null);
      this.device = ko.observable('mobile');
      this.devices = ui.tabs(this.device, [{ value: 'mobile', label: 'Mobile', icon: 'laptop' }, { value: 'tablet', label: 'Tablet', icon: 'laptop' }, { value: 'desktop', label: 'Desktop', icon: 'monitor' }]);
      const live = (d) => !!d && !!d.reviewToken && !(d.reviewExpiresAt && new Date(d.reviewExpiresAt) < new Date());
      this.reviewUrl = ko.pureComputed(() => (live(this.selected())
        ? window.location.origin + window.location.pathname + '?ojr=review&embed=1&token=' + this.selected().reviewToken : ''));
      this.expiryText = ko.pureComputed(() => (this.selected() && this.selected().reviewExpiresAt ? ui.when(this.selected().reviewExpiresAt) : 'No link'));
      this.frameCss = ko.pureComputed(() => 'factory-rv-device factory-rv-' + this.device());

      // The preview shows the screen alone (the preview page the designer uses), not the review page around it
      const preview = new PreviewFrame(() => null);
      this.previewKind = ko.observable('jet');
      this.previewSrc = ko.pureComputed(() => PreviewFrame.srcFor(this.previewKind()));
      this.previewKind.subscribe(() => preview.reload());
      ko.computed(() => preview.show(this.selected() ? this.selected().model : null, null));

      // Link settings: the expiry date sets the days of a new link (1 to 90)
      this.minExpiry = isoDate(new Date(Date.now() + DAY_MS));
      this.maxExpiry = isoDate(new Date(Date.now() + 90 * DAY_MS));
      this.pickedExpiry = ko.observable('');
      this.selectedId.subscribe(() => this.pickedExpiry(''));
      this.expiryValue = ko.pureComputed(() => this.pickedExpiry()
        || (live(this.selected()) ? isoDate(new Date(this.selected().reviewExpiresAt)) : isoDate(new Date(Date.now() + 14 * DAY_MS))));
      this.expiryChange = ui.value(this.pickedExpiry);
      this.expiryChanged = ko.pureComputed(() => !!this.pickedExpiry() && this.canEdit());
      const daysFor = () => {
        const date = this.pickedExpiry() || this.expiryValue();
        return Math.max(1, Math.min(90, Math.ceil((new Date(date + 'T23:59:59') - Date.now()) / DAY_MS) || 14));
      };
      const off = (label, why) => ({ label: label, on: false, why: why, css: 'factory-rv-switch' });
      const on = (label, why) => ({ label: label, on: true, why: why, css: 'factory-rv-switch factory-rv-switch-on' });
      this.toggles = [
        off('Require login to view', 'Not available: review links open without signing in, so business reviewers need no factory account.'),
        on('Allow comments', 'Reviewers can always comment through the link.'),
        off('Allow download of design assets', 'Not available: the review page shows the screen only; it offers no downloads.'),
        off('Notify on new comments', 'Not available yet: the factory does not send notifications for review comments. Check this page or the designer.')
      ];
      const reload = (detail) => { designs(designs().map((d) => (d.id === detail.id ? detail : d))); };
      this.createLink = () => {
        const d = this.selected();
        if (!d) {
          return;
        }
        if (live(d) && !window.confirm('Create a new review link for ' + d.name + '? The current link stops working.')) {
          return;
        }
        api.post('designs/' + d.id + '/review-link', { days: daysFor() })
          .then((detail) => { reload(detail); this.pickedExpiry(''); this.infoMessage('Review link created. Copy it and send it to the reviewers.'); })
          .catch(showError);
      };
      this.linkAction = (event) => {
        const value = event.detail.selectedValue;
        if (value === 'open') {
          window.open(this.reviewUrl(), '_blank', 'noopener');
        } else if (value === 'create') {
          this.createLink();
        } else if (value === 'revoke') {
          this.revokeLink();
        }
      };
      this.revokeLink = () => {
        const d = this.selected();
        if (!d || !window.confirm('Revoke the review link of ' + d.name + '? People who have it can no longer open it.')) {
          return;
        }
        api.del('designs/' + d.id + '/review-link').then(reload).catch(showError);
      };
      this.copyLink = () => {
        const url = this.reviewUrl();
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject(new Error('no clipboard')))
          .then(() => this.infoMessage('Link copied.'))
          .catch(() => { window.prompt('Copy the review link:', url); });
      };
      this.newLinkFor = (event) => {
        if (event.detail.selectedValue !== 'none') {
          this.selectedId(event.detail.selectedValue);
          this.createLink();
        }
      };
      this.withoutLink = ko.pureComputed(() => this.links().filter((l) => (l.state === 'none' || l.state === 'expired' || l.state === 'review') && !l.hasLink));
      this.openNewLinkMenu = (event) => document.getElementById('createReviewLinkMenu').open(event, {
        launcher: event.currentTarget, position: { my: { horizontal: 'end', vertical: 'top' }, at: { horizontal: 'end', vertical: 'bottom' } }
      });

      // Comments of the selected design (newest first) and adding one
      this.commentFilter = ko.observable('all');
      this.commentFilterChange = ui.value(this.commentFilter);
      this.comments = ko.pureComputed(() => {
        const d = this.selected();
        return d ? d.comments.slice().reverse().filter((c) => this.commentFilter() === 'all' || (this.commentFilter() === 'review') === c.fromReview).map((c) => ({
          author: c.author, initials: ui.initials(c.author), role: c.fromReview ? 'Reviewer (review link)' : 'Team', text: c.text,
          when: ui.when(c.createdAt), version: 'v' + c.version, component: c.componentId || '',
          pill: c.fromReview ? ui.pill('Reviewer', 'amber') : ui.pill('Team', 'blue'),
          reply: () => focusComment('@' + c.author + ' ')
        })) : [];
      });
      this.commentCount = ko.pureComputed(() => (this.selected() ? this.selected().comments.length : 0));
      this.sideTab = ko.observable('comments');
      this.sideTabs = ui.tabs(this.sideTab, [{ value: 'comments', label: 'Comments', count: this.commentCount }, { value: 'details', label: 'Details' }]);
      this.myInitials = ko.pureComputed(() => ui.initials(session.user() ? (session.user().displayName || session.user().username) : ''));
      this.newComment = ko.observable('');
      this.commentInput = ui.value(this.newComment);
      this.commentKey = (event) => { if (event.key === 'Enter') { this.postComment(); } };
      const focusComment = (text) => {
        this.newComment(text);
        const el = document.getElementById('newComment');
        if (el) {
          el.value = text;
          el.focus();
        }
      };
      this.mention = () => focusComment((this.newComment() ? this.newComment().replace(/\s*$/, ' ') : '') + '@');
      this.details = ko.pureComputed(() => {
        const d = this.selected();
        if (!d) {
          return null;
        }
        const reviewers = new Set(d.comments.filter((c) => c.fromReview).map((c) => c.author));
        const sections = d.model && d.model.sections ? d.model.sections : [];
        return {
          pill: linkState(d).pill,
          requirement: d.requirementId ? 'Linked to a requirement' : 'Not linked to a requirement',
          sections: sections.length + (sections.length === 1 ? ' section' : ' sections') + ', ' + sections.reduce((n, s) => n + (s.components ? s.components.length : 0), 0) + ' fields',
          reviewers: reviewers.size ? Array.from(reviewers).join(', ') : 'No reviewer has commented yet',
          comments: d.comments.length + ' (' + d.comments.filter((c) => c.fromReview).length + ' from reviewers)',
          approved: d.approvedAt ? 'v' + d.approvedVersion + ' by ' + d.approvedBy + ', ' + ui.when(d.approvedAt) : 'Not yet'
        };
      });
      this.postComment = () => {
        const d = this.selected();
        if (!d || !this.newComment().trim()) {
          return;
        }
        api.post('designs/' + d.id + '/comments', { text: this.newComment().trim() }).then((detail) => { focusComment(''); reload(detail); }).catch(showError);
      };
      this.allComments = ko.pureComputed(() => [].concat.apply([], designs().map((d) => d.comments.map((c) => ({
        screen: d.name, author: c.author, text: c.text, when: ui.when(c.createdAt), at: c.createdAt,
        pill: c.fromReview ? ui.pill('Reviewer', 'amber') : ui.pill('Team', 'blue')
      })))).sort((a, b) => new Date(b.at) - new Date(a.at)));
      this.history = ko.pureComputed(() => designs().filter((d) => d.approvedAt).map((d) => ({
        screen: d.name, version: 'v' + d.approvedVersion, by: d.approvedBy, when: ui.when(d.approvedAt), at: d.approvedAt,
        how: (d.approvedBy || '').indexOf('review link') >= 0 ? 'By a reviewer through the link' : 'In the designer'
      })).sort((a, b) => new Date(b.at) - new Date(a.at)));
      this.openDesigner = () => navigate('designer');

      const load = () => {
        const id = this.workspaceId();
        designs([]);
        if (!id) {
          return;
        }
        this.loading(true);
        api.get('workspaces/' + id + '/target').then((target) => { if (id === this.workspaceId() && target.preview) { this.previewKind(target.preview); } }).catch(() => null);
        api.get('workspaces/' + id + '/designs')
          .then((list) => Promise.all(list.map((s) => api.get('designs/' + s.id).catch(() => null))))
          .then((details) => {
            if (id !== this.workspaceId()) {
              return;
            }
            designs(details.filter(Boolean));
            const withLink = designs().find((d) => d.reviewToken) || designs()[0];
            this.selectedId(withLink ? withLink.id : null);
          })
          .catch(showError)
          .finally(() => this.loading(false));
      };

      // The preview page keeps scrolling but shows no scrollbar, like a phone
      const hideScrollbar = () => {
        const frame = document.getElementById('reviewFrame');
        const doc = frame && frame.contentDocument;
        if (doc && doc.head && !doc.getElementById('factoryNoScrollbar')) {
          const style = doc.createElement('style');
          style.id = 'factoryNoScrollbar';
          style.textContent = 'html, body { scrollbar-width: none; } html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }';
          doc.head.appendChild(style);
        }
      };
      let subscription = null;
      this.connected = () => {
        accUtils.announce('External Review page loaded.');
        document.title = 'External Review';
        const frame = document.getElementById('reviewFrame');
        if (frame) {
          frame.addEventListener('load', hideScrollbar);
          hideScrollbar();
        }
        preview.attach('reviewFrame');
        subscription = this.workspaceId.subscribe(load);
        workspaceSelection.load().then(load).catch(showError);
      };
      this.disconnected = () => {
        preview.detach();
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return ReviewsViewModel;
  }
);
