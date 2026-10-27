/*
 * Models page: shows the model gateway configuration and sends a test prompt through /api/model.
 */
define(['knockout', '../accUtils', '../services/api',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojbutton'],
  function (ko, accUtils, api) {
    function ModelsViewModel() {
      this.status = ko.observable(null);
      this.prompt = ko.observable('In one sentence, what is Oracle Banking Digital Experience?');
      this.reply = ko.observable(null);
      this.errorMessage = ko.observable('');
      this.busy = ko.observable(false);

      this.send = () => {
        this.busy(true);
        this.errorMessage('');
        this.reply(null);
        api.post('model/chat', { prompt: this.prompt() })
          .then((data) => this.reply(data))
          .catch((error) => this.errorMessage(error.message))
          .finally(() => this.busy(false));
      };

      this.connected = () => {
        accUtils.announce('Models page loaded.');
        document.title = 'Models';
        api.get('model/status')
          .then((data) => this.status(data))
          .catch((error) => this.errorMessage(error.message));
      };
    }

    return ModelsViewModel;
  }
);
