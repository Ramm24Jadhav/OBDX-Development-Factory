/*
 * Models page: the model server and models in use, choosing them (administrators: a server on this computer, found
 * automatically, or another one by URL, then its chat and embedding models), and a test prompt. Through /api/model.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', 'ojs/ojarraydataprovider',
        'ojs/ojknockout', 'ojs/ojformlayout', 'ojs/ojinputtext', 'ojs/ojbutton', 'ojs/ojradioset', 'ojs/ojselectsingle'],
  function (ko, accUtils, api, session, ArrayDataProvider) {
    function ModelsViewModel() {
      this.isAdmin = session.isAdmin;
      this.status = ko.observable(null);
      this.statusSource = ko.pureComputed(() => {
        const s = this.status();
        if (!s) {
          return '';
        }
        return s.saved
          ? 'Chosen on this page' + (s.updatedBy ? ' by ' + s.updatedBy : '') + (s.updatedAt ? ' on ' + new Date(s.updatedAt).toLocaleString() : '')
          : 'From the factory settings (FACTORY_MODEL_*); choose below to change them';
      });
      this.prompt = ko.observable('In one sentence, what is Oracle Banking Digital Experience?');
      this.reply = ko.observable(null);
      this.errorMessage = ko.observable('');
      this.busy = ko.observable(false);
      const showError = (error) => this.errorMessage(error.message);

      // Choosing the server
      this.serverKindProvider = new ArrayDataProvider([
        { value: 'local', label: 'On this computer' },
        { value: 'remote', label: 'Another server' }
      ], { keyAttributes: 'value' });
      this.serverKind = ko.observable('local');
      this.searching = ko.observable(false);
      this.localServers = ko.observableArray([]);
      this.localServerProvider = new ArrayDataProvider(this.localServers, { keyAttributes: 'value' });
      this.localServerUrl = ko.observable(null);
      this.remoteUrl = ko.observable('');
      this.apiKey = ko.observable('');
      this.apiKeyLabel = ko.pureComputed(() => (this.status() && this.status().apiKeySet
        ? 'API key (one is stored; leave empty to keep it)' : 'API key (if the server needs one)'));

      // Its models
      this.modelsUrl = ko.observable('');
      this.models = ko.observableArray([]);
      const chatOptions = ko.observableArray([]);
      const embeddingOptions = ko.observableArray([]);
      this.chatProvider = new ArrayDataProvider(chatOptions, { keyAttributes: 'value' });
      this.embeddingProvider = new ArrayDataProvider(embeddingOptions, { keyAttributes: 'value' });
      this.chatModel = ko.observable(null);
      this.embeddingModel = ko.observable(null);
      this.hasEmbeddingModel = ko.pureComputed(() => this.models().some((m) => m.embedding));
      this.saving = ko.observable(false);
      this.savedMessage = ko.observable('');

      /** Shows a server's models and preselects the ones in use, or else the likely chat and embedding models. */
      const showModels = (url, models) => {
        this.modelsUrl(url);
        const options = models.map((m) => ({ value: m.id, label: m.id }));
        const coder = (o) => /coder|code/i.test(o.value);
        // Embedding models first in the embedding list; in the chat list, code models first, then other chat models
        const chats = options.filter((o, i) => !models[i].embedding);
        chatOptions(chats.filter(coder).concat(chats.filter((o) => !coder(o)), options.filter((o, i) => models[i].embedding)));
        embeddingOptions(options.filter((o, i) => models[i].embedding).concat(chats));
        this.models(models);
        const current = this.status() || {};
        // The model in use, also when the server lists it with ":latest" (Ollama treats both names the same)
        const find = (name) => models.map((m) => m.id).find((id) => name && id.replace(/:latest$/, '') === name.replace(/:latest$/, ''));
        this.chatModel(find(current.chatModel) || (chatOptions()[0] || {}).value || null);
        this.embeddingModel(find(current.embeddingModel) || (embeddingOptions()[0] || {}).value || null);
      };
      const clearModels = () => { this.models([]); this.savedMessage(''); };
      this.serverKind.subscribe(clearModels);
      this.remoteUrl.subscribe(clearModels);

      this.findLocal = () => {
        this.searching(true);
        this.errorMessage('');
        return api.get('model/servers/local').then((servers) => {
          this.localServers(servers.map((s) => ({
            value: s.baseUrl,
            label: s.name + ' (' + s.baseUrl + '), ' + s.models.length + ' model' + (s.models.length === 1 ? '' : 's'),
            server: s
          })));
          const current = this.status() && this.status().baseUrl;
          const preferred = servers.find((s) => s.baseUrl === current) || servers[0];
          this.localServerUrl(null);
          this.localServerUrl(preferred ? preferred.baseUrl : null);
        }).catch(showError).finally(() => this.searching(false));
      };
      this.localServerUrl.subscribe((url) => {
        const option = this.localServers().find((o) => o.value === url);
        if (option) {
          this.savedMessage('');
          showModels(url, option.server.models);
        }
      });

      this.getRemoteModels = () => {
        const url = this.remoteUrl().trim();
        if (!url) {
          this.errorMessage('Enter the model server URL');
          return;
        }
        this.searching(true);
        this.errorMessage('');
        api.post('model/servers/models', { baseUrl: url, apiKey: this.apiKey() || null })
          .then((models) => showModels(url, models))
          .catch(showError)
          .finally(() => this.searching(false));
      };

      this.save = () => {
        if (!this.chatModel() || !this.embeddingModel()) {
          this.errorMessage('Choose a chat model and an embedding model');
          return;
        }
        this.saving(true);
        this.errorMessage('');
        api.put('model/settings', {
          baseUrl: this.modelsUrl(),
          apiKey: this.serverKind() === 'remote' ? (this.apiKey() || null) : '',
          chatModel: this.chatModel(),
          embeddingModel: this.embeddingModel()
        }).then((result) => {
          this.status(result.status);
          this.apiKey('');
          this.savedMessage('Saved: the factory now uses ' + result.status.chatModel + ' and ' + result.status.embeddingModel + '.'
            + (result.embeddingsRemoved ? ' The embedding model changed, so import the code of each workspace again (Code page) to search it by meaning.' : ''));
        }).catch(showError).finally(() => this.saving(false));
      };

      this.send = () => {
        this.busy(true);
        this.errorMessage('');
        this.reply(null);
        api.post('model/chat', { prompt: this.prompt() })
          .then((data) => this.reply(data))
          .catch(showError)
          .finally(() => this.busy(false));
      };

      this.connected = () => {
        accUtils.announce('Models page loaded.');
        document.title = 'Models';
        api.get('model/status')
          .then((data) => {
            this.status(data);
            if (!session.isAdmin()) {
              return null;
            }
            // Open on the kind of server in use: one found on this computer, or else another server, filled in.
            return this.findLocal().then(() => {
              if (!data.saved || this.localServers().some((o) => o.value.replace(/\/+$/, '') === data.baseUrl.replace(/\/+$/, ''))) {
                return;
              }
              this.serverKind('remote');
              this.remoteUrl(data.baseUrl);
            });
          })
          .catch(showError);
      };
    }

    return ModelsViewModel;
  }
);
