/*
 * Customer review page, opened from a review link (?ojr=review&embed=1&token=...). Shows the one shared screen with
 * sample data and lets the reviewer comment on the whole screen or one part of it, and approve it. Only the token in
 * the link is needed; the server sends nothing else of the workspace.
 */
define(['knockout', '../services/api', '../services/previewFrame', '../services/ui', '../services/toast', '../services/dialog',
        'ojs/ojknockout'],
  function (ko, api, PreviewFrame, ui, toast, dialog) {
    const WIDTHS = { desktop: '100%', tablet: '768px', phone: '375px' };

    function ReviewViewModel() {
      const token = new URLSearchParams(window.location.search).get('token') || '';
      this.review = ko.observable(null);
      this.errorMessage = ko.observable('');
      this.author = ko.observable('');
      this.text = ko.observable('');
      // The part of the screen the comment is about ('' is the whole screen); clicking a field in the preview picks it
      this.about = ko.observable('');

      this.viewport = ko.observable('desktop');
      this.viewportOptions = [{ value: 'desktop', label: 'Desktop' }, { value: 'tablet', label: 'Tablet' }, { value: 'phone', label: 'Phone' }];
      this.frameWidth = ko.pureComputed(() => WIDTHS[this.viewport()] || '100%');
      const preview = new PreviewFrame((id) => this.about(id || ''));
      this.previewKind = ko.observable('jet');
      this.previewSrc = ko.pureComputed(() => PreviewFrame.srcFor(this.previewKind()));
      this.previewKind.subscribe((kind) => {
        preview.reload();
        if (kind === 'react-native') {
          this.viewport('phone');
        }
      });
      ko.computed(() => preview.show(this.review() ? this.review().model : null, this.about() || null));

      // Fields, sections and buttons of the screen, by id
      this.parts = ko.pureComputed(() => {
        const review = this.review();
        const parts = [{ value: '', label: 'Whole screen' }];
        if (review && review.model) {
          (review.model.sections || []).forEach((s) => {
            (s.components || []).forEach((c) => parts.push({ value: c.id, label: c.label || c.name || c.id }));
            if (s.title) { parts.push({ value: s.id, label: s.title + ' section' }); }
          });
          (review.model.actions || []).forEach((a) => parts.push({ value: a.id, label: a.label + ' button' }));
        }
        return parts;
      });
      const labelOf = (id) => {
        const part = this.parts().find((p) => p.value === (id || ''));
        return part ? part.label : 'A part no longer on the screen';
      };

      this.approved = ko.pureComputed(() => !!this.review() && this.review().status === 'APPROVED');
      this.facts = ko.pureComputed(() => {
        const review = this.review();
        if (!review) {
          return '';
        }
        return 'Version ' + review.version + (review.expiresAt && !this.approved()
          ? ' · This link works until ' + new Date(review.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
      });
      const all = ko.pureComputed(() => (this.review() ? this.review().comments : []));
      this.comments = ko.pureComputed(() => all().filter((c) => c.kind !== 'APPROVAL').slice().reverse().map((c) => ({
        author: c.author,
        text: c.text,
        initials: ui.initials(c.author),
        avatar: ui.avatarTone(c.author),
        meta: new Date(c.createdAt).toLocaleString() + ' · version ' + c.version,
        about: 'On: ' + labelOf(c.componentId),
        state: c.resolved ? ui.status('APPROVED', 'Resolved by the team') : ui.status('IN_REVIEW', 'Open')
      })));
      this.approvals = ko.pureComputed(() => all().filter((c) => c.kind === 'APPROVAL').slice().reverse().map((c) => ({
        text: c.author + ' approved version ' + c.version, when: new Date(c.createdAt).toLocaleString()
      })));

      const showError = (error) => this.errorMessage(error.message);
      const base = 'review/' + encodeURIComponent(token);

      this.sending = ko.observable(false);
      this.canSend = ko.pureComputed(() => !!this.author().trim() && !!this.text().trim() && !this.sending());
      this.sendComment = () => {
        this.sending(true);
        api.post(base + '/comments', { author: this.author(), text: this.text(), componentId: this.about() || null })
          .then((review) => { this.text(''); this.about(''); this.review(review); toast.success('Comment sent. Thank you!'); })
          .catch((error) => toast.error('The comment was not sent: ' + error.message))
          .then(() => this.sending(false));
      };
      this.approve = () => dialog.confirm({
        title: 'Approve this screen design?',
        message: 'You approve version ' + this.review().version + ' of the screen as shown, as ' + this.author().trim()
          + '. Comments close once it is approved.',
        confirmLabel: 'Approve'
      }).then((ok) => {
        if (!ok) {
          return;
        }
        api.post(base + '/approve', { by: this.author() })
          .then((review) => { this.review(review); toast.success('Design approved. Thank you!'); })
          .catch((error) => toast.error('The approval was not saved: ' + error.message));
      });

      this.connected = () => {
        document.title = 'Screen review';
        preview.attach('reviewPreview');
        if (!token) {
          this.errorMessage('This review link is incomplete. Copy the whole link from the message you received.');
          return;
        }
        api.get(base).then((review) => {
          this.previewKind(review.preview || 'jet');
          this.review(review);
          document.title = 'Review: ' + review.name;
        }).catch(showError);
      };
      this.disconnected = () => preview.detach();
    }

    return ReviewViewModel;
  }
);
