/*
 * Models & AI Providers page: provider cards (OpenAI, xAI, Groq and servers found on this computer) with connection
 * tests, the models they offer, the model server and models in use, choosing them (administrators: a server on this computer, found
 * automatically, or another one by URL, then its chat and embedding models), and a test prompt. Through /api/model.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/ui', '../services/toast', 'ojs/ojknockout'],
  function (ko, accUtils, api, session, ui, toast) {
    // Provider and model states use the shared status categories (ui.status) with this page's words
    const TESTING = ui.status('RUNNING', 'Testing');
    function ModelsViewModel() {
      this.available = ui.status('PASSED', 'Available');
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
      // Loading problems stay on the page; the result of an action is a toast
      const showError = (error) => this.errorMessage(error.message);
      const actionError = (error) => toast.error(error.message);

      // Choosing the server
      this.serverKind = ko.observable('local');
      this.searching = ko.observable(false);
      this.localServers = ko.observableArray([]);
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
      this.chatOptions = chatOptions;
      this.embeddingOptions = embeddingOptions;
      this.chatModel = ko.observable(null);
      this.embeddingModel = ko.observable(null);
      this.saving = ko.observable(false);
      // What the last save found: an embedding model that cannot embed, models the OBDX Library keeps its knowledge from
      this.saveWarnings = ko.observableArray([]);
      this.savedMessage = ko.observable('');

      // Code search: the embedding model on the same server, or on another one (for example chat from a cloud API
      // and embeddings from Ollama on this computer)
      this.embeddingSource = ko.observable('same');
      this.embeddingSourceChange = ui.value(this.embeddingSource);
      this.embeddingUrl = ko.observable('');
      this.embeddingApiKey = ko.observable('');
      this.embeddingApiKeyLabel = ko.pureComputed(() => (this.status() && this.status().embeddingApiKeySet
        ? 'API key (one is stored; leave empty to keep it)' : 'API key (if the server needs one)'));
      this.embeddingServerModels = ko.observableArray([]);
      this.embeddingCandidates = ko.pureComputed(() => (this.embeddingSource() === 'same' ? this.models() : this.embeddingServerModels()));
      this.hasEmbeddingModel = ko.pureComputed(() => this.embeddingCandidates().some((m) => m.embedding));
      // Advanced settings (separate code search server, fallback) stay folded unless one is in use or needs a fix
      this.advancedOpen = ko.pureComputed(() => this.embeddingSource() === 'other' || (this.embeddingCandidates().length > 0 && !this.hasEmbeddingModel()));
      this.advancedHint = ko.pureComputed(() => (this.embeddingSource() === 'other' ? 'Code search on another server' : 'Code search server, fallback'));

      // The model in use, also when the server lists it with ":latest" (Ollama treats both names the same)
      const find = (models, name) => models.map((m) => m.id).find((id) => name && id.replace(/:latest$/, '') === name.replace(/:latest$/, ''));

      /** Embedding models first, then the others (some servers do not mark embedding models). */
      this.embeddingCandidates.subscribe((models) => {
        const options = models.map((m) => ({ value: m.id, label: m.id }));
        embeddingOptions(options.filter((o, i) => models[i].embedding).concat(options.filter((o, i) => !models[i].embedding)));
        this.embeddingModel(find(models, (this.status() || {}).embeddingModel) || (embeddingOptions()[0] || {}).value || null);
      });

      /** Shows a server's models and preselects the ones in use, or else the likely chat model. */
      const showModels = (url, models) => {
        this.modelsUrl(url);
        const options = models.map((m) => ({ value: m.id, label: m.id }));
        const coder = (o) => /coder|code/i.test(o.value);
        // Code models first, then other chat models
        const chats = options.filter((o, i) => !models[i].embedding);
        chatOptions(chats.filter(coder).concat(chats.filter((o) => !coder(o)), options.filter((o, i) => models[i].embedding)));
        this.models(models);
        this.chatModel(find(models, (this.status() || {}).chatModel) || (chatOptions()[0] || {}).value || null);
      };
      this.showModelsFor = showModels;
      const clearModels = () => { this.models([]); this.savedMessage(''); };
      this.serverKind.subscribe(clearModels);
      this.remoteUrl.subscribe(clearModels);
      this.embeddingUrl.subscribe(() => { this.embeddingServerModels([]); this.savedMessage(''); });

      /** Another server for code search: the one in use, else a server on this computer that has an embedding model. */
      this.embeddingSource.subscribe((source) => {
        this.savedMessage('');
        if (source !== 'other' || this.embeddingUrl()) {
          return;
        }
        const inUse = this.status() && this.status().embeddingBaseUrl;
        const local = this.localServers().find((o) => o.server.models.some((m) => m.embedding));
        if (inUse) {
          this.embeddingUrl(inUse);
          this.getEmbeddingModels();
        } else if (local) {
          this.embeddingUrl(local.value);
          this.embeddingServerModels(local.server.models);
        }
      });

      this.getEmbeddingModels = () => {
        const url = this.embeddingUrl().trim();
        if (!url) {
          this.errorMessage('Enter the code search server URL');
          return;
        }
        this.searching(true);
        this.errorMessage('');
        api.post('model/servers/models', { baseUrl: url, apiKey: this.embeddingApiKey() || null })
          .then((models) => { this.embeddingServerModels(models); toast.success(models.length + ' model' + (models.length === 1 ? '' : 's') + ' on the code search server.'); })
          .catch(actionError)
          .finally(() => this.searching(false));
      };

      this.findLocal = (event) => {
        // A click on Find Local Servers reports what it found; the first look when the page opens stays quiet
        const manual = !!(event && event.type);
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
          if (manual) {
            toast.info(servers.length ? 'Found ' + servers.length + ' model server' + (servers.length === 1 ? '' : 's') + ' on this computer.' : 'No model server found on this computer. Start Ollama or LM Studio and look again.');
          }
        }).catch(manual ? actionError : showError).finally(() => this.searching(false));
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
          .then((models) => { showModels(url, models); toast.success(models.length + ' model' + (models.length === 1 ? '' : 's') + ' on this server.'); })
          .catch(actionError)
          .finally(() => this.searching(false));
      };

      this.save = () => {
        if (!this.chatModel() || !this.embeddingModel()) {
          this.errorMessage('Choose a chat model and an embedding model');
          return;
        }
        const otherEmbeddingServer = this.embeddingSource() === 'other';
        if (otherEmbeddingServer && this.embeddingServerModels().length === 0) {
          this.errorMessage('Get the models of the code search server first');
          return;
        }
        this.saving(true);
        this.errorMessage('');
        this.saveWarnings([]);
        api.put('model/settings', {
          baseUrl: this.modelsUrl(),
          apiKey: this.serverKind() === 'remote' ? (this.apiKey() || null) : '',
          chatModel: this.chatModel(),
          embeddingModel: this.embeddingModel(),
          embeddingBaseUrl: otherEmbeddingServer ? this.embeddingUrl().trim() : null,
          embeddingApiKey: otherEmbeddingServer ? (this.embeddingApiKey() || null) : null
        }).then((result) => {
          this.status(result.status);
          this.apiKey('');
          this.embeddingApiKey('');
          const s = result.status;
          toast.success('Saved: the factory now uses ' + s.chatModel + ' and ' + s.embeddingModel
            + (s.embeddingBaseUrl ? ' at ' + s.embeddingBaseUrl : '') + '.'
            + (result.embeddingsRemoved ? ' The embedding model changed, so import the code of each workspace again (Code page) to search it by meaning.' : ''),
            { timeout: result.embeddingsRemoved ? 0 : 6000 });
          const warnings = result.embeddingProblem ? [result.embeddingProblem] : [];
          // The OBDX Library says when these models are outside the bank: its knowledge is then not sent to them
          return api.get('knowledge').then((o) => {
            if (o && o.privacy) {
              warnings.push(o.privacy + ' To send it anyway, set FACTORY_KNOWLEDGE_EXTERNAL_MODELS=true in settings.properties and start the factory again.');
            }
          }).catch(() => null).then(() => this.saveWarnings(warnings));
        }).catch(actionError).finally(() => this.saving(false));
      };

      this.send = () => {
        this.busy(true);
        this.errorMessage('');
        this.reply(null);
        api.post('model/chat', { prompt: this.prompt() })
          .then((data) => this.reply(data))
          .catch(actionError)
          .finally(() => this.busy(false));
      };

      // ---- Provider cards: known cloud providers and the servers found on this computer ----
      this.tab = ko.observable('providers');
      this.tabs = ui.tabs(this.tab, [
        { value: 'providers', label: 'Providers' }, { value: 'routing', label: 'Model Routing' }, { value: 'usage', label: 'Usage & Cost' },
        { value: 'prompts', label: 'Prompts & Templates' }, { value: 'policies', label: 'Policies' }, { value: 'evaluation', label: 'Model Evaluation' }
      ]);
      const same = (a, b) => !!a && !!b && a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
      const copy = (text) => ui.copy(text).then(() => toast.success('Copied ' + text), () => toast.error('Could not copy. Select the text and copy it instead.'));
      const scrollTo = (id) => window.setTimeout(() => { const el = document.getElementById(id); if (el) { el.scrollIntoView({ behavior: 'smooth' }); } }, 100);
      const provider = (id, name, description, baseUrl, local) => {
        const p = {
          id: id, name: name, description: description, baseUrl: ko.observable(baseUrl), local: local,
          short: name.replace(/^Local Model \((.*)\)$/, 'Local ($1)').replace(/ \(Grok\)$/, ''),
          tiny: name.split(' ')[0],
          selectedModel: ko.observable(''),
          logo: 'factory-md-logo factory-md-logo-' + id,
          key: ko.observable(''), state: ko.observable(''), models: ko.observableArray([]), latency: ko.observable(null), checked: ko.observable(''),
          testing: ko.observable(false), admin: session.isAdmin
        };
        p.active = ko.pureComputed(() => !!this.status() && same(this.status().baseUrl, p.baseUrl()));
        p.pill = ko.pureComputed(() => (p.testing() ? TESTING : p.active() ? ui.status('APPROVED', 'In use') : p.state() === 'ok' ? ui.status('PASSED', 'Connected')
          : p.state() === 'failed' ? ui.status('FAILED', 'Not reachable') : ui.status('NOT_CHECKED', 'Not tested')));
        p.statusText = ko.pureComputed(() => (p.state() === 'ok' ? p.models().length + ' models available' : p.state() === 'failed' ? 'Failed: ' + p.error : (p.active() ? 'In use' : 'Not tested')));
        p.chatModels = ko.pureComputed(() => p.models().filter((m) => !m.embedding).map((m) => m.id));
        p.defaultModel = ko.pureComputed(() => p.selectedModel()
          || (p.active() ? find(p.models(), this.status().chatModel) || this.status().chatModel : (p.chatModels()[0] || '–')));
        p.modelChange = (event) => p.selectedModel(event.target.value);
        p.statusPill = ko.pureComputed(() => (p.testing() ? TESTING : p.state() === 'failed' ? ui.status('FAILED', 'Not reachable')
          : (p.state() === 'ok' || p.active()) ? ui.status('PASSED', 'Available') : ui.status('NOT_CHECKED', 'Not tested')));
        p.selectedAsDefault = ko.pureComputed(() => same(this.modelsUrl() || (this.status() || {}).baseUrl, p.baseUrl()));
        // What the listed models can do: chat models write specs and code, embedding models search code
        p.caps = ko.pureComputed(() => [
          { label: 'Chat / Completion', on: p.chatModels().length > 0 },
          { label: 'Code Generation', on: p.chatModels().length > 0 },
          { label: 'Code-tuned model', on: p.chatModels().some((m) => /coder|code/i.test(m)) },
          { label: 'Embeddings (code search)', on: p.models().some((m) => m.embedding) }
        ]);
        p.menuItems = ko.pureComputed(() => [
          { value: 'test', label: 'Test connection', disabled: !p.admin() },
          { value: 'use', label: 'Use this provider', disabled: !p.admin() },
          { value: 'models', label: 'Show its models' },
          { value: 'copy', label: 'Copy base URL' }
        ]);
        p.menuAction = (event) => {
          const action = event.detail.value;
          if (action === 'test') {
            p.test(event);
          } else if (action === 'use') {
            p.use();
          } else if (action === 'models') {
            this.providerFilter(p.short);
            scrollTo('availableModels');
          } else {
            copy(p.baseUrl());
          }
        };
        p.keyLabel = ko.pureComputed(() => (p.active() && this.status().apiKeySet ? 'Stored (leave empty to keep)' : (local ? 'Not needed' : 'API key')));
        // A click on one card's Test Connection reports the result; Test All Providers shows it on the cards only
        p.test = (event) => {
          const loud = !!(event && event.type);
          p.testing(true);
          const start = Date.now();
          const key = p.key() || null;
          api.post('model/servers/models', { baseUrl: p.baseUrl(), apiKey: key })
            .then((models) => { p.models(models); p.state('ok'); if (loud) { toast.success(p.name + ' is reachable: ' + models.length + ' model' + (models.length === 1 ? '' : 's') + '.'); } })
            .catch((error) => { p.error = error.message; p.state('failed'); if (loud) { toast.error(p.name + ' is not reachable: ' + error.message); } })
            .finally(() => { p.latency(Date.now() - start); p.checked(new Date().toLocaleTimeString()); p.testing(false); });
        };
        p.use = () => {
          this.tab('providers');
          if (p.local && this.localServers().some((o) => same(o.value, p.baseUrl()))) {
            this.serverKind('local');
            this.localServerUrl(null);
            this.localServerUrl(this.localServers().find((o) => same(o.value, p.baseUrl())).value);
          } else {
            this.serverKind('remote');
            this.remoteUrl(p.baseUrl());
            this.apiKey(p.key());
            if (p.models().length) {
              this.showModelsFor(p.baseUrl(), p.models());
            } else {
              this.getRemoteModels();
            }
          }
          if (p.selectedModel()) {
            window.setTimeout(() => this.chatModel(find(this.models(), p.selectedModel()) || this.chatModel()), 400);
          }
          scrollTo('defaultSettings');
        };
        return p;
      };
      const cloud = [
        provider('openai', 'OpenAI', 'GPT models for code, analysis and documentation', 'https://api.openai.com/v1', false),
        provider('xai', 'xAI (Grok)', 'Grok models for code generation and reasoning', 'https://api.x.ai/v1', false),
        provider('groq', 'Groq', 'High-speed inference for open models', 'https://api.groq.com/openai/v1', false)
      ];
      this.providers = ko.pureComputed(() => {
        const locals = this.localServers().map((o) => {
          const p = provider('local', 'Local Model (' + o.server.name + ')', 'Self-hosted models for sensitive code bases', o.value, true);
          p.models(o.server.models);
          p.state('ok');
          return p;
        });
        if (!locals.length) {
          locals.push(provider('local', 'Local Model (Ollama)', 'Self-hosted models for sensitive code bases. Not found on this computer.', 'http://localhost:11434/v1', true));
        }
        const list = cloud.concat(locals);
        // A provider in use that is none of these (another server by URL)
        if (this.status() && !list.some((p) => same(p.baseUrl(), this.status().baseUrl))) {
          list.push(provider('custom', 'Custom Server', 'An OpenAI-compatible server', this.status().baseUrl, false));
        }
        return list;
      });
      this.testAll = () => this.providers().forEach((p) => { if (!p.local || p.state() !== 'ok') { p.test(); } });
      // A custom provider: any OpenAI-compatible server by URL; its models go to Default Model Settings
      this.addingProvider = ko.observable(false);
      this.addProvider = () => { this.addingProvider(true); scrollTo('customProviderCard'); };
      this.cancelProvider = () => this.addingProvider(false);
      this.useCustom = () => {
        const url = this.remoteUrl().trim();
        this.serverKind('remote');
        this.remoteUrl(url);
        this.getRemoteModels();
        scrollTo('defaultSettings');
      };
      this.defaultProviderChange = (event) => {
        const p = this.providers().find((x) => x.baseUrl() === event.target.value);
        if (p) {
          p.use();
        }
      };
      this.providerFilter = ko.observable('');
      this.modelSearch = ko.observable('');
      this.providerFilterChange = ui.value(this.providerFilter);
      this.modelSearchInput = ui.value(this.modelSearch);
      this.allModels = ko.pureComputed(() => {
        const rows = [];
        this.providers().forEach((p) => p.models().forEach((m) => {
          const isDefault = !!this.status() && same(this.status().baseUrl, p.baseUrl()) && (this.status().chatModel === m.id || this.status().embeddingModel === m.id);
          rows.push({
            id: m.id, provider: p.short, logo: p.logo + ' factory-md-logo-sm', admin: session.isAdmin, providerId: p.id + p.baseUrl(), type: m.embedding ? 'Embedding' : 'Chat',
            caps: m.embedding ? 'Code search' : 'Chat, Code' + (/coder|code/i.test(m.id) ? ' (tuned)' : ''),
            menuItems: [
              { value: 'default', label: 'Set as default', disabled: isDefault || !session.isAdmin() },
              { value: 'copy', label: 'Copy model name' },
              { value: 'evaluate', label: 'Open Model Evaluation' }
            ],
            menuAction: (event) => {
              const action = event.detail.value;
              if (action === 'default') {
                p.use();
                window.setTimeout(() => { if (m.embedding) { this.embeddingModel(m.id); } else { this.chatModel(m.id); } }, 400);
              } else if (action === 'copy') {
                copy(m.id);
              } else {
                this.tab('evaluation');
              }
            },
            isDefault: isDefault,
            setDefault: () => {
              p.use();
              window.setTimeout(() => { if (m.embedding) { this.embeddingModel(m.id); } else { this.chatModel(m.id); } }, 400);
            }
          });
        }));
        const text = this.modelSearch().trim().toLowerCase();
        return rows.filter((r) => (!this.providerFilter() || r.provider === this.providerFilter()) && (!text || r.id.toLowerCase().indexOf(text) >= 0));
      });
      this.providerNames = ko.pureComputed(() => this.providers().map((p) => p.short));
      this.modelsSummary = ko.pureComputed(() => {
        const listed = this.providers().filter((p) => p.models().length);
        const untested = this.providers().filter((p) => !p.models().length).map((p) => p.short);
        return this.allModels().length + ' model(s) shown from ' + listed.length + ' provider(s).'
          + (untested.length ? ' Test ' + untested.join(', ') + ' to list their models.' : '');
      });
      // Usage and cost are not recorded: the card keeps its place with the period and the providers
      const day = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
      this.usageFrom = day(new Date(Date.now() - 29 * 86400000));
      this.usageTo = day(new Date());
      const colors = ['#4f46e5', '#f59e0b', '#ea580c', '#16a34a', '#7c3aed'];
      this.usageLegend = ko.pureComputed(() => this.providers().map((p, i) => ({ name: p.short, dot: { background: colors[i % colors.length] } })));
      // Capabilities per provider, from the models each one lists
      this.matrixProviders = this.providers;
      this.matrix = ko.pureComputed(() => {
        // A test returns true (yes), false (no) or 'limited'
        const cell = (p, on) => (!p.state() && !p.models().length ? { kind: 'unknown', text: '–', css: 'factory-md-cell factory-md-cell-unknown', title: 'Not tested' }
          : on === 'limited' ? { kind: 'limited', text: 'Limited', css: 'factory-md-cell factory-md-cell-limited', title: 'Chat models only; no code-tuned model listed' }
          : on ? { kind: 'yes', text: 'Yes', css: 'factory-md-cell factory-md-cell-yes', title: 'Yes' } : { kind: 'no', text: 'No', css: 'factory-md-cell factory-md-cell-no', title: 'Not in its model list' });
        const coder = (p) => p.chatModels().some((m) => /coder|code/i.test(m));
        const rows = [
          { label: 'Chat / Completion', test: (p) => p.chatModels().length > 0 },
          { label: 'Code Generation', test: (p) => (coder(p) ? true : p.chatModels().length > 0 ? 'limited' : false) },
          { label: 'Code-tuned model', test: (p) => p.chatModels().some((m) => /coder|code/i.test(m)) },
          { label: 'Embeddings', test: (p) => p.models().some((m) => m.embedding) }
        ];
        return rows.map((r) => ({ label: r.label, cells: this.providers().map((p) => cell(p, r.test(p))) }))
          .concat([{ label: 'Models listed', cells: this.providers().map((p) => (!p.state() && !p.models().length ? { kind: 'unknown', text: '–', css: 'factory-md-cell factory-md-cell-unknown', title: 'Not tested' }
            : { kind: 'count', text: String(p.models().length), css: 'factory-md-cell', title: p.models().map((m) => m.id).join(', ') })) }]);
      });
      this.health = ko.pureComputed(() => this.providers().filter((p) => p.state()).map((p) => ({
        name: p.short, pill: p.state() === 'ok' ? ui.status('PASSED', 'Healthy') : ui.status('FAILED', 'Unavailable'),
        latency: p.latency() !== null ? p.latency() + ' ms' : '–', checked: p.checked() || '–'
      })));
      this.routing = ko.pureComputed(() => {
        const s = this.status();
        if (!s) {
          return [];
        }
        return [
          { task: 'Drafting specifications from BRD/FSD', model: s.chatModel, server: s.baseUrl },
          { task: 'Impact analysis and change plans', model: s.chatModel, server: s.baseUrl },
          { task: 'Code generation and fixes', model: s.chatModel, server: s.baseUrl },
          { task: 'Screen design changes and imports', model: s.chatModel, server: s.baseUrl },
          { task: 'Assistant answers on every page', model: s.chatModel, server: s.baseUrl },
          { task: 'Code search by meaning (embeddings)', model: s.embeddingModel, server: s.embeddingBaseUrl || s.baseUrl }
        ];
      });
      this.openPrompts = () => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: 'prompts' }));

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
              if (data.embeddingBaseUrl) {
                this.embeddingSource('other');
              }
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
