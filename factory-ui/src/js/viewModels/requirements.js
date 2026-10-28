/*
 * Requirements page: upload or describe a requirement, then review the drafted spec: answer open questions,
 * update the spec with the answers, edit it as JSON, and approve it.
 */
define(['knockout', '../accUtils', '../services/api', '../services/workspaceSelection', '../services/session', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojselectsingle', 'ojs/ojinputtext', 'ojs/ojbutton', 'ojs/ojtoolbar',
        'ojs/ojtable', 'ojs/ojfilepicker'],
  function (ko, accUtils, api, workspaceSelection, session, ArrayDataProvider) {
    const POLL_MS = 2000;

    function RequirementsViewModel() {
      this.workspaceProvider = new ArrayDataProvider(workspaceSelection.options, { keyAttributes: 'value' });
      this.workspaceId = workspaceSelection.selectedId;
      this.errorMessage = ko.observable('');
      this.canEdit = ko.pureComputed(() => session.can(this.workspaceId(), 'EDIT_REQUIREMENTS'));
      this.canApprove = ko.pureComputed(() => session.can(this.workspaceId(), 'APPROVE'));
      this.busy = ko.observable(false);

      this.newTitle = ko.observable('');
      this.newText = ko.observable('');
      this.chosenFile = ko.observable(null);
      this.chosenFileName = ko.pureComputed(() => this.chosenFile() ? this.chosenFile().name : 'No file chosen');

      const items = ko.observableArray([]);
      this.listProvider = new ArrayDataProvider(items, { keyAttributes: 'id' });

      this.detail = ko.observable(null);
      this.spec = ko.pureComputed(() => this.detail() ? this.detail().spec : null);
      this.questions = ko.observableArray([]);
      this.editingJson = ko.observable(false);
      this.specJson = ko.observable('');

      /** Screens with display text prepared, since templates cannot run JavaScript functions. */
      this.screens = ko.pureComputed(() => {
        const spec = this.spec();
        if (!spec) {
          return [];
        }
        return spec.screens.map((screen) => ({
          name: screen.name,
          changeType: screen.changeType,
          description: screen.description,
          fields: screen.fields.map((field) => ({
            name: field.name,
            label: field.label || '',
            type: field.type || '?',
            mandatory: field.mandatory === true ? 'Yes' : field.mandatory === false ? 'No' : '?',
            validations: field.validations.join('; '),
            notes: [field.defaultValue ? 'default: ' + field.defaultValue : '', field.source, field.notes].filter(Boolean).join('; ')
          })),
          actions: screen.actions.map((a) => a.name + (a.description ? ' (' + a.description + ')' : '')).join('; '),
          relatedCode: screen.relatedCode.join(', ')
        }));
      });

      /** Business rules, roles, APIs, host interactions, messages and decisions as simple lists. */
      this.lists = ko.pureComputed(() => {
        const spec = this.spec();
        if (!spec) {
          return [];
        }
        const join = (...parts) => parts.filter(Boolean).join(' ');
        return [
          { title: 'Business rules', items: spec.businessRules.map((r) => join(r.id + ':', r.description, r.reference ? '(' + r.reference + ')' : '')) },
          { title: 'Roles and access', items: spec.roles.map((r) => join(r.name, r.access ? '— ' + r.access : '')) },
          { title: 'APIs', items: spec.apis.map((a) => join(a.method, a.name, a.description ? '— ' + a.description : '')) },
          { title: 'Host interactions', items: spec.hostInteractions.map((h) => join(h.system ? h.system + ':' : '', h.description)) },
          { title: 'Messages', items: spec.messages.map((m) => join(m.code ? m.code + ':' : '', m.text, '(' + m.type + ')')) },
          { title: 'Decisions', items: spec.decisions.map((d) => d.question + ' → ' + d.answer) }
        ].filter((list) => list.items.length > 0);
      });

      const showError = (error) => this.errorMessage(error.message);
      let pollTimer = null;

      const loadList = () => {
        const id = this.workspaceId();
        if (!id) {
          items([]);
          return Promise.resolve();
        }
        return api.get('workspaces/' + id + '/requirements').then((list) => {
          items(list.map((r) => Object.assign({}, r, {
            updated: new Date(r.updatedAt).toLocaleString(),
            openAction: () => this.open(r.id)
          })));
        }).catch(showError);
      };

      /**
       * An open question with its options as buttons. Picking an option replaces an empty answer or another option,
       * and is added to an answer the analyst typed, so several options can be combined.
       */
      const question = (q, editable) => {
        const answerValue = ko.observable(q.answer || '');
        const options = (q.options || []).slice();
        if (q.suggestedAnswer && !options.includes(q.suggestedAnswer)) {
          options.unshift(q.suggestedAnswer);
        }
        const parts = () => answerValue().split(';').map((part) => part.trim()).filter(Boolean);
        return {
          question: q.question,
          context: (q.reason || '') + (q.reference ? ' (' + q.reference + ')' : ''),
          editable: editable,
          suggestedAnswer: q.suggestedAnswer || '',
          answerValue: answerValue,
          options: options.map((option) => ({
            label: option === q.suggestedAnswer ? option + ' (usual)' : option,
            selected: ko.pureComputed(() => parts().includes(option)),
            pick: () => {
              const current = answerValue().trim();
              if (!current || options.includes(current)) {
                answerValue(option);
              } else if (!parts().includes(option)) {
                answerValue(current + '; ' + option);
              }
            }
          }))
        };
      };

      this.hasSuggestions = ko.pureComputed(() => this.questions().some((q) => q.editable && q.suggestedAnswer && !q.answerValue().trim()));
      this.useSuggestions = () => this.questions().forEach((q) => {
        if (q.suggestedAnswer && !q.answerValue().trim()) {
          q.answerValue(q.suggestedAnswer);
        }
      });

      const show = (detail) => {
        this.detail(detail);
        this.errorMessage('');
        this.questions(detail.spec ? detail.spec.openQuestions.map((q) => question(q, detail.status === 'READY' && this.canEdit())) : []);
        if (this.editingJson()) {
          this.specJson(detail.spec ? JSON.stringify(detail.spec, null, 2) : '');
        }
        clearTimeout(pollTimer);
        if (detail.status === 'PROCESSING') {
          pollTimer = setTimeout(() => this.open(detail.id), POLL_MS);
        }
        loadList();
      };

      this.open = (id) => api.get('requirements/' + id).then(show).catch(showError);

      this.fileSelected = (event) => this.chosenFile(event.detail.files[0] || null);

      this.upload = () => {
        const form = new FormData();
        form.append('file', this.chosenFile());
        if (this.newTitle()) {
          form.append('title', this.newTitle());
        }
        this.busy(true);
        api.upload('workspaces/' + this.workspaceId() + '/requirements', form)
          .then((detail) => { this.chosenFile(null); this.newTitle(''); show(detail); })
          .catch(showError)
          .finally(() => this.busy(false));
      };

      this.submitText = () => {
        this.busy(true);
        api.post('workspaces/' + this.workspaceId() + '/requirements/text', { title: this.newTitle() || null, text: this.newText() })
          .then((detail) => { this.newText(''); this.newTitle(''); show(detail); })
          .catch(showError)
          .finally(() => this.busy(false));
      };

      const answers = () => this.questions().map((q, index) => ({ index: index, answer: q.answerValue() }));
      const base = () => 'requirements/' + this.detail().id;

      this.saveAnswers = () => api.put(base() + '/answers', { answers: answers() }).then(show).catch(showError);
      this.refine = () => api.put(base() + '/answers', { answers: answers() })
        .then(() => api.post(base() + '/refine'))
        .then(show)
        .catch(showError);
      this.approve = () => api.post(base() + '/approve').then(show).catch(showError);
      this.retry = () => api.post(base() + '/retry').then(show).catch(showError);
      this.remove = () => {
        if (!window.confirm('Delete this requirement and all its spec versions?')) {
          return;
        }
        api.del(base()).then(() => { this.detail(null); loadList(); }).catch(showError);
      };
      this.toggleJson = () => {
        this.editingJson(!this.editingJson());
        this.specJson(this.editingJson() && this.spec() ? JSON.stringify(this.spec(), null, 2) : '');
      };
      this.saveJson = () => api.put(base() + '/spec', this.specJson())
        .then((detail) => { this.editingJson(false); show(detail); })
        .catch(showError);

      let subscription = null;
      this.connected = () => {
        accUtils.announce('Requirements page loaded.');
        document.title = 'Requirements';
        subscription = this.workspaceId.subscribe(() => { this.detail(null); loadList(); });
        workspaceSelection.load().then(loadList).catch(showError);
      };
      this.disconnected = () => {
        clearTimeout(pollTimer);
        if (subscription) {
          subscription.dispose();
        }
      };
    }

    return RequirementsViewModel;
  }
);
