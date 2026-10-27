/*
 * Customer review page, opened from a review link (?ojr=review&embed=1&token=...). Shows the screen preview and
 * lets the reviewer comment and approve. Only the token in the link is needed.
 */
define(['knockout', '../services/api', '../services/previewFrame',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojbutton', 'ojs/ojtoolbar'],
  function (ko, api, PreviewFrame) {
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
      this.previewSrc = preview.src;
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

      this.sendComment = () => api.post(base + '/comments', { author: this.author(), text: this.text(), componentId: this.selectedId() })
        .then((review) => { this.text(''); this.review(review); })
        .catch(showError);
      this.approve = () => {
        if (!window.confirm('Approve this screen design as shown?')) {
          return;
        }
        api.post(base + '/approve', { by: this.author() }).then((review) => this.review(review)).catch(showError);
      };

      this.connected = () => {
        document.title = 'Screen review';
        preview.attach('reviewPreview');
        if (!token) {
          this.errorMessage('This review link is incomplete.');
          return;
        }
        api.get(base).then((review) => {
          this.review(review);
          document.title = 'Review: ' + review.name;
        }).catch(showError);
      };
      this.disconnected = () => preview.detach();
    }

    return ReviewViewModel;
  }
);
