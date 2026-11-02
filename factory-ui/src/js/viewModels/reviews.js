/*
 * External Review page: the workspace's screens shared with business reviewers through review links (one link per
 * screen, valid until its expiry date, ended at once by revoking it), what each link shows, the comments reviewers and the
 * team made (open or resolved, about the whole screen or one part of it), the decisions taken on each screen and the
 * history of links and approvals. Approving a screen does not approve or apply any code.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', '../services/ui',
        '../services/previewFrame', '../services/toast', '../services/dialog', '../services/pageRequests', 'ojs/ojknockout'],
  function (ko, accUtils, api, workspaceSelection, session, ui, PreviewFrame, toast, dialog, pageRequests) {
    const SOON_MS = 3 * 24 * 3600 * 1000;
    const DAY_MS = 24 * 3600 * 1000;
    const isoDate = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    const day = (value) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    const DEVICE_WIDTH = { phone: '375px', tablet: '768px', desktop: '100%' };
    const HISTORY_WORDS = {
      REVIEW_LINK_CREATED: 'Review link created', REVIEW_LINK_CLOSED: 'Review link revoked', DESIGN_APPROVED: 'Approved in the designer',
      DESIGN_APPROVED_BY_REVIEWER: 'Approved by a reviewer through the link', DESIGN_REOPENED: 'Reopened for changes',
      REVIEW_COMMENT_RESOLVED: 'Comment marked resolved', REVIEW_COMMENT_REOPENED: 'Comment opened again'
    };

    function ReviewsViewModel() {
      this.workspaceId = workspaceSelection.selectedId;
      this.canEdit = ko.pureComputed(() => session.can(this.workspaceId(), 'EDIT_DESIGNS'));
      this.canComment = ko.pureComputed(() => session.can(this.workspaceId(), 'COMMENT'));
      // Loading failures stay on the page; the result of an action is a toast
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(error.message);
      const actionError = (error) => toast.error(error.message);
      const designs = ko.observableArray([]);
      const requirements = ko.observable({});
      const history = ko.observableArray([]);
      this.loading = ko.observable(false);

      // --- per screen: link state, the parts of the screen, comments ---
      const expired = (d) => !!d.reviewToken && !!d.reviewExpiresAt && new Date(d.reviewExpiresAt) < new Date();
      const live = (d) => !!d && !!d.reviewToken && !expired(d);
      const linkState = (d) => {
        if (d.status === 'APPROVED') {
          return { key: 'approved', pill: ui.status('APPROVED', 'Approved') };
        }
        if (expired(d)) {
          return { key: 'expired', pill: ui.status('CLOSED', 'Link expired') };
        }
        return d.reviewToken ? { key: 'active', pill: ui.status('IN_REVIEW', 'Link active') } : { key: 'none', pill: ui.status('DRAFT', 'Not shared') };
      };
      // Labels of the screen's fields, sections and buttons, by id (comments can be about one of them)
      const partsOf = (d) => {
        const parts = [];
        const model = d.model || { sections: [], actions: [] };
        (model.sections || []).forEach((s) => {
          (s.components || []).forEach((c) => parts.push({ value: c.id, label: c.label || c.name || c.id }));
          if (s.title) { parts.push({ value: s.id, label: s.title + ' section' }); }
        });
        (model.actions || []).forEach((a) => parts.push({ value: a.id, label: a.label + ' button' }));
        return parts;
      };
      const labelOf = (d, id) => {
        const part = id ? partsOf(d).find((p) => p.value === id) : null;
        return id ? (part ? part.label : 'a part no longer on the screen') : 'Whole screen';
      };
      const feedback = (d) => d.comments.filter((c) => c.kind !== 'APPROVAL');
      const openRequests = (d) => feedback(d).filter((c) => c.fromReview && !c.resolvedAt);
      const reviewersOf = (d) => Array.from(new Set(d.comments.filter((c) => c.fromReview).map((c) => c.author)));

      // --- the list of screens ---
      this.listFilter = ko.observable('shared');
      this.listFilterOptions = [{ value: 'shared', label: 'Shared or with comments' }, { value: 'all', label: 'All screens' }];
      this.search = ko.observable('');
      this.searchInput = ui.value(this.search);
      this.selectedId = ko.observable(null);
      this.rows = ko.pureComputed(() => {
        const text = this.search().trim().toLowerCase();
        return designs()
          .filter((d) => this.listFilter() === 'all' || !!d.reviewToken || d.comments.length > 0)
          .filter((d) => !text || d.name.toLowerCase().indexOf(text) >= 0)
          .map((d) => {
            const state = linkState(d);
            const open = openRequests(d).length;
            return {
              id: d.id, name: d.name, pill: state.pill,
              sub: 'v' + d.currentVersion + ' · ' + (state.key === 'active' || state.key === 'expired' ? (state.key === 'expired' ? 'Expired ' : 'Until ') + day(d.reviewExpiresAt)
                : state.key === 'approved' ? 'v' + d.approvedVersion + ' approved' : 'No review link'),
              open: open ? plural(open, 'open comment') : '',
              css: ko.pureComputed(() => 'factory-xr-entry' + (this.selectedId() === d.id ? ' is-selected' : '')),
              current: ko.pureComputed(() => (this.selectedId() === d.id ? 'true' : null)),
              pick: () => this.selectedId(d.id)
            };
          });
      });
      this.emptyText = ko.pureComputed(() => (this.loading() ? 'Loading…'
        : !this.workspaceId() ? 'Choose a workspace to see its review links.'
          : designs().length === 0 ? 'This workspace has no screen designs yet. Design screens in the UI Design Studio, then share them here.'
            : this.listFilter() === 'shared' ? 'No screen is shared yet. Use New review link, or show all screens.' : 'No screen matches the search.'));

      // --- summary line (real counts only) ---
      this.summary = ko.pureComputed(() => {
        const list = designs();
        const active = list.filter((d) => live(d));
        const soon = active.filter((d) => new Date(d.reviewExpiresAt) - new Date() < SOON_MS).length;
        const open = list.reduce((n, d) => n + openRequests(d).length, 0);
        const waiting = list.filter((d) => d.status === 'IN_REVIEW').length;
        return [plural(active.length, 'active link') + (soon ? ' (' + soon + ' ending within 3 days)' : ''),
          plural(open, 'open reviewer comment'), plural(waiting, 'screen') + ' waiting for approval'].join(' · ');
      });

      // --- one level of tabs ---
      this.tab = ko.observable('links');
      this.openCount = ko.pureComputed(() => designs().reduce((n, d) => n + openRequests(d).length, 0));
      this.tabs = ui.tabs(this.tab, [
        { value: 'links', label: 'Review links', icon: 'link' }, { value: 'comments', label: 'Comments', icon: 'doc', count: this.openCount },
        { value: 'history', label: 'History', icon: 'clock' }
      ]);

      // --- the selected screen ---
      this.selected = ko.pureComputed(() => designs().find((d) => d.id === this.selectedId()) || null);
      this.reviewUrl = ko.pureComputed(() => (live(this.selected())
        ? window.location.origin + window.location.pathname + '?ojr=review&embed=1&token=' + this.selected().reviewToken : ''));
      this.view = ko.pureComputed(() => {
        const d = this.selected();
        if (!d) {
          return null;
        }
        const state = linkState(d);
        const reviewers = reviewersOf(d);
        const req = d.requirementId ? requirements()[d.requirementId] : null;
        const left = d.reviewExpiresAt ? Math.ceil((new Date(d.reviewExpiresAt) - new Date()) / DAY_MS) : 0;
        const approvals = d.comments.filter((c) => c.kind === 'APPROVAL');
        const byLink = d.approvedAt && approvals.some((c) => c.author === d.approvedBy && c.version === d.approvedVersion);
        const decisions = approvals.map((c) => ({ text: c.author + ' approved v' + c.version + ' through the review link', when: ui.when(c.createdAt), at: c.createdAt }));
        if (d.approvedAt && !byLink) {
          decisions.push({ text: d.approvedBy + ' approved v' + d.approvedVersion + ' in the designer', when: ui.when(d.approvedAt), at: d.approvedAt });
        }
        decisions.sort((a, b) => new Date(b.at) - new Date(a.at));
        return {
          name: d.name, pill: state.pill, state: state.key, live: live(d),
          sub: 'Version ' + d.currentVersion + ' · ' + plural(d.versions.length, 'saved version'),
          link: state.key === 'active' ? 'Active. Anyone with the link can open it without signing in.'
            : state.key === 'expired' ? 'Expired on ' + day(d.reviewExpiresAt) + '. Reviewers can no longer open it.'
              : state.key === 'approved' ? 'Closed: the screen is approved.' : 'Not shared. Create a link to send to reviewers.',
          expires: state.key === 'active' ? day(d.reviewExpiresAt) + (left <= 1 ? ' (ends within a day)' : ' (' + left + ' days left)') : '—',
          scope: 'This screen only, version ' + d.currentVersion + ', with sample data. Reviewers do not see code, other screens, '
            + 'where values are loaded from, or the team\'s comments.',
          reviewers: reviewers.length ? reviewers.join(', ') : 'No reviewer has commented yet',
          requirement: req ? req.title : (d.requirementId ? 'A requirement of this workspace' : 'Not linked to a requirement'),
          hasRequirement: !!d.requirementId,
          decisions: decisions
        };
      });

      // Requested changes: open comments from reviewers; then the whole conversation, newest first
      const commentRow = (d, c) => ({
        id: c.id, author: c.author, text: c.text, when: ui.when(c.createdAt), version: 'v' + c.version,
        initials: ui.initials(c.author), avatarCss: ui.avatarTone(c.author) + ' factory-xr-avatar',
        who: c.fromReview ? 'Reviewer' : 'Team (internal)', about: labelOf(d, c.componentId),
        resolved: !!c.resolvedAt, resolvedText: c.resolvedAt ? 'Resolved by ' + c.resolvedBy + ', ' + ui.when(c.resolvedAt) : '',
        css: 'factory-xr-comment' + (c.resolvedAt ? ' is-resolved' : ''),
        toggleLabel: c.resolvedAt ? 'Open again' : 'Mark resolved',
        toggleAria: (c.resolvedAt ? 'Open again: comment by ' : 'Mark resolved: comment by ') + c.author,
        canComment: this.canComment(),
        toggle: () => this.setResolved(d, c, !c.resolvedAt)
      });
      this.requests = ko.pureComputed(() => (this.selected() ? openRequests(this.selected()).slice().reverse().map((c) => commentRow(this.selected(), c)) : []));
      this.conversation = ko.pureComputed(() => {
        const d = this.selected();
        return d ? feedback(d).filter((c) => !(c.fromReview && !c.resolvedAt)).slice().reverse().map((c) => commentRow(d, c)) : [];
      });
      this.setResolved = (d, c, resolved) => {
        api.put('designs/' + d.id + '/comments/' + c.id + '/resolved', { resolved: resolved })
          .then((detail) => { reload(detail); toast.success(resolved ? 'Comment marked resolved.' : 'Comment open again.'); })
          .catch(actionError);
      };

      // A team comment, about the whole screen or one part of it; it stays internal
      this.parts = ko.pureComputed(() => [{ value: '', label: 'Whole screen' }].concat(this.selected() ? partsOf(this.selected()) : []));
      this.commentAbout = ko.observable('');
      this.newComment = ko.observable('');
      this.postComment = () => {
        const d = this.selected();
        const text = (this.newComment() || '').trim();
        if (!d || !text) {
          return;
        }
        api.post('designs/' + d.id + '/comments', { text: text, componentId: this.commentAbout() || null })
          .then((detail) => { this.newComment(''); reload(detail); toast.success('Comment added for the team.'); })
          .catch(actionError);
      };

      // --- link actions ---
      this.minExpiry = isoDate(new Date(Date.now() + DAY_MS));
      this.maxExpiry = isoDate(new Date(Date.now() + 90 * DAY_MS));
      this.expiry = ko.observable(isoDate(new Date(Date.now() + 14 * DAY_MS)));
      this.changingExpiry = ko.observable(false);
      this.selectedId.subscribe(() => { this.changingExpiry(false); this.commentAbout(''); this.newComment(''); });
      const daysFor = () => Math.max(1, Math.min(90, Math.ceil((new Date(this.expiry() + 'T23:59:59') - Date.now()) / DAY_MS) || 14));
      const reload = (detail) => { designs(designs().map((d) => (d.id === detail.id ? detail : d))); loadHistory(); };
      this.createLink = () => {
        const d = this.selected();
        if (!d) {
          return;
        }
        const ask = live(d)
          ? dialog.confirm({ title: 'Create a new review link?', message: 'The current link of ' + d.name + ' stops working now. Send the new link to the reviewers.', confirmLabel: 'Create new link', danger: true })
          : Promise.resolve(true);
        ask.then((ok) => ok && api.post('designs/' + d.id + '/review-link', { days: daysFor() })
          .then((detail) => {
            reload(detail);
            this.changingExpiry(false);
            toast.success('Review link created. Copy it and send it to the reviewers.', { action: { label: 'Copy link', run: () => this.copyLink() } });
          })
          .catch(actionError));
      };
      this.revokeLink = () => {
        const d = this.selected();
        if (!d) {
          return;
        }
        dialog.confirm({ title: 'Revoke the review link?', message: 'The link of ' + d.name + ' stops working now, for everyone who has it. Comments made so far stay.', confirmLabel: 'Revoke link', danger: true })
          .then((ok) => ok && api.del('designs/' + d.id + '/review-link').then((detail) => { reload(detail); toast.success('Review link revoked. It no longer opens.'); }).catch(actionError));
      };
      this.copyLink = () => {
        const url = this.reviewUrl();
        ui.copy(url)
          .then(() => toast.success('Link copied.'))
          .catch(() => toast.warning('The browser did not allow copying. Open the link and copy it from the address bar.', { action: { label: 'Open link', run: () => window.open(url, '_blank', 'noopener') } }));
      };
      this.openDesigner = () => {
        if (this.selected()) {
          pageRequests.design(this.selected().id);
        }
        navigate('designer');
      };
      this.openRequirement = () => {
        if (this.selected() && this.selected().requirementId) {
          pageRequests.requirement(this.selected().requirementId);
        }
        navigate('requirements');
      };
      this.moreItems = ko.pureComputed(() => {
        const d = this.selected();
        const l = live(d);
        return [
          { value: 'open', label: 'Open as a reviewer', icon: 'user', disabled: !l },
          { value: 'designer', label: 'Open in the designer', icon: 'design' },
          { separator: true },
          { value: 'expiry', label: l ? 'Change expiry (new link)' : 'Create review link', icon: 'plus', disabled: !this.canEdit() || !d || d.status === 'APPROVED' },
          { value: 'revoke', label: 'Revoke link', icon: 'x', danger: true, disabled: !this.canEdit() || !d || !d.reviewToken,
            title: d && d.reviewToken ? null : 'This screen has no review link' }
        ];
      });
      this.moreAction = (event) => {
        const what = event.detail.value;
        if (what === 'open') { window.open(this.reviewUrl(), '_blank', 'noopener'); }
        if (what === 'designer') { this.openDesigner(); }
        if (what === 'expiry') { this.changingExpiry(true); window.setTimeout(() => { const f = document.querySelector('#linkExpiry input, #linkExpiry button'); if (f) { f.focus(); } }, 0); }
        if (what === 'revoke') { this.revokeLink(); }
      };
      this.showShare = ko.pureComputed(() => {
        const d = this.selected();
        return !!d && this.canEdit() && d.status !== 'APPROVED' && (!live(d) || this.changingExpiry());
      });
      this.shareLabel = ko.pureComputed(() => (live(this.selected()) ? 'Create new link' : 'Create review link'));
      this.shareHelp = ko.pureComputed(() => (live(this.selected())
        ? 'A new date makes a new link address; the current one stops working.' : 'Valid for 1 to 90 days. Anyone with the link can view, comment and approve.'));

      // New review link: the screens without an active link
      this.newItems = ko.pureComputed(() => {
        const list = designs().filter((d) => d.status !== 'APPROVED' && !live(d)).map((d) => ({ value: d.id, label: d.name + ' (v' + d.currentVersion + ')', icon: 'monitor' }));
        return list.length ? list : [{ value: '', label: 'Every screen is shared or approved', disabled: true }];
      });
      this.newTip = ko.pureComputed(() => (!this.canEdit() ? 'You need the Edit designs permission in this workspace' : null));
      this.newAction = (event) => {
        if (!event.detail.value) {
          return;
        }
        this.tab('links');
        this.selectedId(event.detail.value);
        this.changingExpiry(true);
        window.setTimeout(() => { const f = document.getElementById('shareButton'); if (f) { f.focus(); } }, 0);
      };

      // --- preview, on demand ---
      this.device = ko.observable('phone');
      this.deviceOptions = [{ value: 'phone', label: 'Phone' }, { value: 'tablet', label: 'Tablet' }, { value: 'desktop', label: 'Desktop' }];
      this.frameWidth = ko.pureComputed(() => DEVICE_WIDTH[this.device()] || '100%');
      const preview = new PreviewFrame(() => null);
      this.previewKind = ko.observable('jet');
      this.previewSrc = ko.pureComputed(() => PreviewFrame.srcFor(this.previewKind()));
      this.previewKind.subscribe(() => preview.reload());
      ko.computed(() => preview.show(this.selected() ? this.selected().model : null, null));

      // --- Comments tab: every comment of the workspace ---
      this.commentFilter = ko.observable('open');
      this.commentFilterOptions = [{ value: 'open', label: 'Open reviewer comments' }, { value: 'resolved', label: 'Resolved' }, { value: 'team', label: 'Team comments' }, { value: 'all', label: 'All comments' }];
      this.allComments = ko.pureComputed(() => [].concat.apply([], designs().map((d) => feedback(d).map((c) => ({ d: d, c: c }))))
        .filter((x) => (this.commentFilter() === 'open' ? x.c.fromReview && !x.c.resolvedAt
          : this.commentFilter() === 'resolved' ? !!x.c.resolvedAt
            : this.commentFilter() === 'team' ? !x.c.fromReview : true))
        .sort((a, b) => new Date(b.c.createdAt) - new Date(a.c.createdAt))
        .map((x) => ({
          screen: x.d.name, about: labelOf(x.d, x.c.componentId), author: x.c.author, text: x.c.text, when: ui.when(x.c.createdAt),
          from: x.c.fromReview ? ui.pill('Reviewer', 'amber') : ui.pill('Team', 'blue'),
          state: x.c.resolvedAt ? ui.status('APPROVED', 'Resolved') : ui.status('IN_REVIEW', 'Open'),
          open: () => { this.selectedId(x.d.id); this.tab('links'); }
        })));
      this.commentsEmpty = ko.pureComputed(() => (this.commentFilter() === 'open' ? 'No open reviewer comments.' : 'No comments to show.'));

      // --- History tab: links and approvals the factory recorded ---
      this.historyRows = ko.pureComputed(() => history().map((e) => {
        const reviewer = /^review link: /.test(e.username || '');
        let detail = '';
        if (e.action === 'REVIEW_LINK_CREATED' && /^expires /.test(e.detail || '')) {
          const at = new Date(e.detail.slice(8));
          detail = isNaN(at.getTime()) ? '' : 'Valid until ' + day(at);
        } else if (e.action === 'DESIGN_APPROVED' || e.action === 'DESIGN_APPROVED_BY_REVIEWER') {
          detail = (e.detail || '').replace(/^version /, 'Version ');
        }
        return {
          what: HISTORY_WORDS[e.action] || e.action, screen: e.target || '', detail: detail, when: ui.when(e.at),
          who: reviewer ? e.username.slice(13) + ' (reviewer)' : (e.username || 'The factory'),
          decision: /APPROVED|REOPENED/.test(e.action)
        };
      }));
      this.historyFilter = ko.observable('all');
      this.historyFilterOptions = [{ value: 'all', label: 'Everything' }, { value: 'decisions', label: 'Approvals only' }, { value: 'links', label: 'Links and comments' }];
      this.visibleHistory = ko.pureComputed(() => this.historyRows().filter((h) => this.historyFilter() === 'all' || (this.historyFilter() === 'decisions') === h.decision));

      // --- loading ---
      const loadHistory = () => {
        const id = this.workspaceId();
        if (!id) {
          return;
        }
        api.get('workspaces/' + id + '/review-history').then((list) => { if (id === this.workspaceId()) { history(list); } }).catch(() => history([]));
      };
      const load = () => {
        const id = this.workspaceId();
        designs([]);
        history([]);
        requirements({});
        this.errorMessage('');
        if (!id) {
          return;
        }
        this.loading(true);
        api.get('workspaces/' + id + '/target').then((target) => { if (id === this.workspaceId() && target.preview) { this.previewKind(target.preview); } }).catch(() => null);
        api.get('workspaces/' + id + '/requirements').then((list) => {
          if (id === this.workspaceId()) {
            const byId = {};
            list.forEach((r) => { byId[r.id] = r; });
            requirements(byId);
          }
        }).catch(() => null);
        loadHistory();
        api.get('workspaces/' + id + '/designs')
          .then((list) => Promise.all(list.map((s) => api.get('designs/' + s.id).catch(() => null))))
          .then((details) => {
            if (id !== this.workspaceId()) {
              return;
            }
            designs(details.filter(Boolean));
            // The screen with open reviewer comments or an active link first
            const first = designs().find((d) => openRequests(d).length) || designs().find((d) => live(d)) || designs().find((d) => !!d.reviewToken || d.comments.length > 0);
            this.listFilter(first ? 'shared' : 'all');
            this.selectedId(first ? first.id : (designs()[0] ? designs()[0].id : null));
          })
          .catch(showError)
          .finally(() => this.loading(false));
      };

      let subscription = null;
      this.connected = () => {
        accUtils.announce('External Review page loaded.');
        document.title = 'External Review';
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
