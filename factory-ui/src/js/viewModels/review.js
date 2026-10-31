/*
 * Customer review page, opened from a review link (?ojr=review&embed=1&token=...). Shows the screen preview and
 * lets the reviewer comment and approve. Only the token in the link is needed.
 */
define(['knockout', '../services/api', '../services/previewFrame', '../services/ui', '../services/toast', '../services/dialog',
        'ojs/ojknockout'],
  function (ko, api, PreviewFrame, ui, toast, dialog) {
    const VIEWPORTS = [
      { key: 'desktop', label: 'Desktop', width: '100%' },
      { key: 'tablet', label: 'Tablet', width: '768px' },
      { key: 'phone', label: 'Phone', width: '375px' }
    ];

    function ReviewViewModel() {
      const token = new URLSearchParams(window.location.search).get('token') || '';
      this.review = ko.observable(null);
      this.errorMessage = ko.observable('');
      this.author = ko.observable('');
      this.text = ko.observable('');
      this.selectedId = ko.observable(null);

      this.viewport = ko.observable('desktop');
      this.viewports = ko.pureComputed(() => VIEWPORTS.map((vp) => ({
        key: vp.key, label: vp.label, active: vp.key === this.viewport(), selectAction: () => this.viewport(vp.key)
      })));
      this.frameWidth = ko.pureComputed(() => VIEWPORTS.find((vp) => vp.key === this.viewport()).width);
      const preview = new PreviewFrame((id) => this.selectedId(id));
      this.previewKind = ko.observable('jet');
      this.previewSrc = ko.pureComputed(() => PreviewFrame.srcFor(this.previewKind()));
      this.previewKind.subscribe((kind) => {
        preview.reload();
        if (kind === 'react-native') {
          this.viewport('phone');
        }
      });
      ko.computed(() => preview.show(this.review() ? this.review().model : null, this.selectedId()));

      this.selectedLabel = ko.pureComputed(() => {
        const review = this.review();
        if (!review || !this.selectedId()) {
          return null;
        }
        for (const section of review.model.sections) {
          const found = section.components.find((c) => c.id === this.selectedId());
          if (found) {
            return found.label;
          }
        }
        const action = review.model.actions.find((a) => a.id === this.selectedId());
        return action ? action.label + ' button' : null;
      });
      this.expires = ko.pureComputed(() => (this.review() && this.review().expiresAt ? new Date(this.review().expiresAt).toLocaleDateString() : ''));
      this.comments = ko.pureComputed(() => (this.review() ? this.review().comments : []).map((c) => ({
        author: c.author,
        text: c.text,
        initials: ui.initials(c.author),
        avatar: ui.avatarTone(c.author),
        meta: ' ' + new Date(c.createdAt).toLocaleString() + (c.componentId ? ' · about ' + labelOf(c.componentId) : '')
      })));
      const labelOf = (id) => {
        for (const section of this.review().model.sections) {
          const found = section.components.find((c) => c.id === id);
          if (found) {
            return found.label;
          }
        }
        return id;
      };

      const showError = (error) => this.errorMessage(error.message);
      const base = 'review/' + encodeURIComponent(token);

      this.sending = ko.observable(false);
      this.sendComment = () => {
        this.sending(true);
        api.post(base + '/comments', { author: this.author(), text: this.text(), componentId: this.selectedId() })
          .then((review) => { this.text(''); this.review(review); toast.success('Comment sent. Thank you!'); })
          .catch((error) => toast.error('The comment was not sent: ' + error.message))
          .then(() => this.sending(false));
      };
      this.approve = () => dialog.confirm({
        title: 'Approve this screen design?',
        message: 'You approve the screen as shown, as ' + this.author() + '. Comments close once it is approved.',
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
          this.errorMessage('This review link is incomplete.');
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
