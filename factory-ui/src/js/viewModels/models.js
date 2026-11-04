/*
 * Models & AI page (route models). Overview: the two models in use (Writing, the chat model; Search, the embedding
 * model), read from GET /api/model/status, the settings the server itself uses, so the page has one answer to what is
 * in use; the providers (OpenAI, xAI, Groq, the servers found on this computer and any other server in use or added),
 * each opening a side panel with its address, API key and the models it lists, where Use for writing / Use for search
 * save the choice (PUT /api/model/settings). Health comes from the connection tests the server remembers
 * (GET /api/model/checks, shared with Integrations through services/modelServers). Routing & limits: which model does
 * each job, what happens when the server fails, the limits learned from it. Privacy: where the bank's content may go
 * (GET /api/knowledge/policy). Try a prompt: a test prompt. Keys are never sent back to the browser.
 */
define(['knockout', '../accUtils', '../services/api', '../services/session', '../services/ui', '../services/toast', '../services/modelServers',
        'ojs/ojknockout'],
  function (ko, accUtils, api, session, ui, toast, servers) {
    const TESTING = ui.status('RUNNING', 'Testing');
    const NOT_SET_UP = ui.status('DRAFT', 'Not set up');
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    const navigate = (page) => window.dispatchEvent(new CustomEvent('factory-navigate', { detail: page }));
    // What a listed model can do: chat models write specifications and code, embedding models search
    const capsOf = (m) => (m.embedding ? ['Embeddings'] : ['Chat', 'Code'].concat(/coder|code/i.test(m.id) ? ['Code-tuned'] : []));
    // The model in use, also when the server lists it with ":latest" (Ollama treats both names the same)
    const sameModel = (a, b) => !!a && !!b && a.replace(/:latest$/, '') === b.replace(/:latest$/, '');

    function ModelsViewModel() {
      this.isAdmin = session.isAdmin;
      this.status = ko.observable(null);
      this.policy = ko.observable(null);
      this.errorMessage = ko.observable('');
      const showError = (error) => this.errorMessage(ui.errorText(error));
      const actionError = (error) => toast.error(ui.errorText(error));
      const same = servers.same;
      const norm = servers.norm;

      // ---- Tabs ----
      this.tab = ko.observable('overview');
      this.tabs = ui.tabs(this.tab, [
        { value: 'overview', label: 'Overview' }, { value: 'routing', label: 'Routing & limits' },
        { value: 'policies', label: 'Privacy' }, { value: 'evaluation', label: 'Try a prompt' }
      ]);
      // Arrow keys, Home and End move between the tabs (WAI-ARIA tabs pattern)
      this.tabKey = (event) => {
        const keys = this.tabs.map((t) => t.value);
        const at = keys.indexOf(this.tab());
        const next = event.key === 'ArrowRight' ? (at + 1) % keys.length : event.key === 'ArrowLeft' ? (at + keys.length - 1) % keys.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
        if (next < 0) {
          return true;
        }
        event.preventDefault();
        this.tab(keys[next]);
        const button = document.getElementById('ma-' + keys[next]);
        if (button) {
          button.focus();
        }
        return false;
      };
      this.openPrivacy = () => { this.tab('policies'); return false; };
      this.openPrompts = () => { navigate('prompts'); return false; };

      // ---- Learned limits and the privacy policy ----
      this.limits = ko.observableArray([]);
      const loadLimits = () => api.get('model/limits').then((list) => this.limits((list || []).map((l) => {
        const n = (v) => (v > 0 ? v.toLocaleString() : 'Not learned');
        const s = this.status();
        const role = !s ? '' : same(s.baseUrl, l.baseUrl) && sameModel(s.chatModel, l.model) ? 'Writing'
          : same(s.embeddingBaseUrl || s.baseUrl, l.baseUrl) && sameModel(s.embeddingModel, l.model) ? 'Search' : '';
        return {
          model: l.model, server: l.baseUrl, role: role, inUse: !!role, rawInput: l.limits.input,
          input: n(l.limits.input), total: n(l.limits.total), outputPerMinute: n(l.limits.outputPerMinute), answerMax: n(l.limits.answerMax),
          charsPerToken: l.limits.charsPerToken > 0 ? l.limits.charsPerToken.toFixed(1) : 'Not learned',
          learned: ui.when(l.updatedAt), expires: ui.when(new Date(new Date(l.updatedAt).getTime() + 7 * 86400000))
        };
      }))).catch(() => null);
      const loadPolicy = () => api.get('knowledge/policy').then(this.policy).catch(() => null);
      this.forgetLimits = () => {
        api.post('model/limits/forget')
          .then(() => { loadLimits(); toast.success('The learned limits are forgotten. They are learned again from the model server\'s answers.'); })
          .catch(actionError);
      };

      // ---- Providers: the known cloud providers, the servers found on this computer, any other server in use or added ----
      this.searching = ko.observable(false);
      this.localServers = ko.observableArray([]);
      this.localsLooked = ko.observable(false);
      const added = ko.observableArray([]);
      const LOGO = { openai: 'AI', xai: 'X', groq: 'G', local: 'O', custom: '·' };
      const provider = (id, name, baseUrl, local) => {
        const p = {
          id: id, name: name, mark: LOGO[id] || name.charAt(0), logo: 'factory-ma-logo factory-ma-logo-' + id, local: local,
          baseUrl: ko.observable(baseUrl), key: ko.observable(''), models: ko.observableArray([]), testing: ko.observable(false), found: false
        };
        // What this provider does now, from the settings the server uses
        p.roles = ko.pureComputed(() => {
          const s = this.status();
          if (!s) {
            return [];
          }
          return [same(s.baseUrl, p.baseUrl()) ? 'Writing' : null, same(s.embeddingBaseUrl || s.baseUrl, p.baseUrl()) ? 'Search' : null].filter(Boolean);
        });
        p.inUse = ko.pureComputed(() => p.roles().join(' and '));
        p.health = ko.pureComputed(() => servers.healthOf(p.baseUrl()));
        p.setUp = ko.pureComputed(() => p.roles().length > 0 || p.found || !!p.health().check || p.models().length > 0 || !!p.key());
        p.pill = ko.pureComputed(() => (p.testing() ? TESTING : p.setUp() ? p.health().pill : NOT_SET_UP));
        p.when = ko.pureComputed(() => (p.setUp() || p.health().check ? p.health().when
          : local ? 'Not found on this computer' : 'Add a key to use it'));
        p.error = ko.pureComputed(() => p.health().error);
        p.place = ko.pureComputed(() => servers.placeOf(p.baseUrl(), this.policy()));
        p.where = ko.pureComputed(() => p.place().text + ' · ' + p.place().detail);
        p.modelsText = ko.pureComputed(() => (p.models().length ? plural(p.models().length, 'model') + ' listed'
          : p.roles().length ? p.roles().length + ' in use · test to list' : '–'));
        p.action = ko.pureComputed(() => (p.setUp() ? 'Settings' : 'Set up'));
        p.actionLabel = ko.pureComputed(() => p.action() + ' for ' + p.name);
        p.testLabel = 'Test ' + name;
        // A click on Test reports the result; Test all shows it in the rows only
        p.test = (event, apiKey, url) => {
          const loud = !!(event && event.type);
          const address = url || p.baseUrl();
          p.testing(true);
          return servers.test(address, apiKey !== undefined ? apiKey : p.key())
            .then((models) => {
              if (same(address, p.baseUrl())) {
                p.models(models);
              }
              if (loud) {
                toast.success(p.name + ' is reachable: ' + plural(models.length, 'model') + '.');
              }
              return models;
            })
            .catch((error) => {
              if (loud) {
                toast.error(p.name + ' is not reachable: ' + ui.errorText(error));
              }
              return null;
            })
            .finally(() => p.testing(false));
        };
        p.testClick = (event) => p.test(event);
        p.open = () => this.openPanel(p);
        return p;
      };
      const cloud = [
        provider('openai', 'OpenAI', 'https://api.openai.com/v1', false),
        provider('xai', 'xAI (Grok)', 'https://api.x.ai/v1', false),
        provider('groq', 'Groq', 'https://api.groq.com/openai/v1', false)
      ];
      // Providers made once per address, so a row keeps its state (models listed, key typed) while the page is open
      const madeLocal = {};
      this.providers = ko.pureComputed(() => {
        const locals = this.localServers().map((s) => {
          const k = norm(s.baseUrl).toLowerCase();
          if (!madeLocal[k]) {
            madeLocal[k] = provider('local', 'Local (' + s.name + ')', s.baseUrl, true);
          }
          madeLocal[k].found = true;
          madeLocal[k].models(s.models);
          return madeLocal[k];
        });
        if (!locals.length) {
          const k = 'http://localhost:11434/v1';
          madeLocal[k] = madeLocal[k] || provider('local', 'Local (Ollama)', k, true);
          locals.push(madeLocal[k]);
        }
        const list = cloud.concat(locals, added());
        // A server in use that is none of these (another server by address)
        const s = this.status();
        [s && s.baseUrl, s && s.embeddingBaseUrl].filter(Boolean).forEach((url) => {
          if (!list.some((p) => same(p.baseUrl(), url))) {
            const k = norm(url).toLowerCase();
            madeLocal[k] = madeLocal[k] || provider('custom', servers.nameOf(url), url, false);
            list.push(madeLocal[k]);
          }
        });
        return list;
      });
      const byUrl = (url) => this.providers().find((p) => same(p.baseUrl(), url)) || null;
      this.providerSummary = ko.pureComputed(() => {
        const setUp = this.providers().filter((p) => p.setUp()).length;
        const not = this.providers().length - setUp;
        return setUp + ' set up' + (not ? ' · ' + not + ' not set up' : '');
      });
      this.testAll = () => {
        const list = this.providers().filter((p) => p.setUp());
        Promise.all(list.map((p) => p.test())).then((r) => {
          const ok = r.filter(Boolean).length;
          (ok === list.length ? toast.success : toast.warning)(ok + ' of ' + plural(list.length, 'provider') + ' reachable.'
            + (ok === list.length ? '' : ' Open a provider\'s settings to see why.'));
        });
      };

      this.findLocal = (event) => {
        // A click on Find local servers reports what it found; the first look when the page opens stays quiet
        const manual = !!(event && event.type);
        this.searching(true);
        return api.get('model/servers/local').then((found) => {
          this.localServers(found);
          this.localsLooked(true);
          // Finding them was a test of each: the server remembers it
          servers.loadChecks();
          if (manual) {
            toast.info(found.length ? 'Found ' + plural(found.length, 'model server') + ' on this computer.' : 'No model server found on this computer. Start Ollama or LM Studio and look again.');
          }
        }).catch(manual ? actionError : () => null).finally(() => this.searching(false));
      };

      // ---- In use now: the two slots, from the status the server uses ----
      const slot = (role) => ko.pureComputed(() => {
        const s = this.status();
        if (!s) {
          return null;
        }
        const writing = role === 'writing';
        const url = writing ? s.baseUrl : (s.embeddingBaseUrl || s.baseUrl);
        const model = writing ? s.chatModel : s.embeddingModel;
        const p = byUrl(url);
        const policy = this.policy();
        const place = policy ? servers.placeOf(url, policy) : servers.placeOf(url, null);
        const h = servers.healthOf(url);
        const limit = this.limits().find((l) => l.role === (writing ? 'Writing' : 'Search') && l.rawInput > 0);
        return {
          id: role, title: writing ? 'Writing' : 'Search',
          what: writing ? 'Specifications, plans, code, screens, answers' : 'Code and library search by meaning',
          icon: writing ? 'factory-nav-icon factory-ico-edit' : 'factory-nav-icon factory-ico-search',
          logo: 'factory-ma-slotlogo factory-ma-slotlogo-' + role,
          model: model, provider: p ? p.name : servers.nameOf(url), url: url, place: place,
          pill: p && p.testing() ? TESTING : h.pill,
          last: h.key === 'ok' ? h.when + '.' : h.key === 'failed' ? h.when + ': ' + h.error
            : this.isAdmin() ? 'Not tested since the factory started. Test it before relying on it.' : 'Administrators test the model servers.',
          lastCss: h.key === 'ok' ? 'factory-ma-last' : 'factory-ma-last is-warn',
          limit: limit ? 'Learned limit: ' + limit.input + ' tokens a request' : '',
          test: (event) => (p ? p.test(event) : servers.test(url).then(() => toast.success(model + ' answers.'), actionError)),
          change: () => (p ? this.openPanel(p) : null),
          testLabel: 'Test the ' + (writing ? 'writing' : 'search') + ' model',
          changeLabel: 'Change the ' + (writing ? 'writing' : 'search') + ' model'
        };
      });
      this.writing = slot('writing');
      this.search = slot('search');
      this.slots = ko.pureComputed(() => [this.writing(), this.search()].filter(Boolean));
      this.statusSource = ko.pureComputed(() => {
        const s = this.status();
        return !s ? '' : s.saved
          ? 'Chosen on this page' + (s.updatedBy ? ' by ' + s.updatedBy : '') + (s.updatedAt ? ' on ' + ui.when(s.updatedAt) : '') + '.'
          : 'From the factory settings (FACTORY_MODEL_*). Choose a model with Use for writing or Use for search to change them.';
      });
      // The privacy line under the slots
      this.privacyLine = ko.pureComputed(() => {
        const p = this.policy();
        const w = this.writing();
        if (!p || !w) {
          return '';
        }
        const library = p.externalAllowed ? 'OBDX Library content may go outside the bank: FACTORY_KNOWLEDGE_EXTERNAL_MODELS is on.'
          : p.chatAllowed && p.embeddingAllowed ? 'OBDX Library content stays inside the bank, and so do the models it goes to.'
            : 'OBDX Library content stays inside the bank, so it is not sent to ' + (p.chatAllowed ? 'the search model' : w.provider) + '.';
        return library + ' Bank code goes to the writing model, ' + (p.chatInside ? 'inside' : 'outside') + ' the bank.';
      });

      // ---- The provider's side panel ----
      this.panelOpen = ko.observable(false);
      this.panel = ko.observable(null);
      this.draftUrl = ko.observable('');
      this.draftKey = ko.observable('');
      this.saving = ko.observable(false);
      this.saveWarnings = ko.observableArray([]);
      this.openPanel = (p) => {
        this.panel(p);
        this.draftUrl(p.baseUrl());
        this.draftKey(p.key());
        this.panelOpen(true);
      };
      this.closePanel = () => this.panelOpen(false);
      this.panelOpen.subscribe((open) => {
        if (!open) {
          this.panel(null);
        }
      });
      this.panelHeading = ko.pureComputed(() => (this.panel() ? this.panel().name : ''));
      this.panelSubtitle = ko.pureComputed(() => {
        const p = this.panel();
        return p ? servers.placeOf(this.draftUrl() || p.baseUrl(), this.policy()).text + ' · ' + servers.placeOf(this.draftUrl() || p.baseUrl(), this.policy()).detail
          + (p.inUse() ? ' · in use for ' + p.inUse().toLowerCase() : '') : '';
      });
      this.panelHealth = ko.pureComputed(() => {
        const p = this.panel();
        if (!p) {
          return null;
        }
        const h = servers.healthOf(this.draftUrl() || p.baseUrl());
        return { pill: p.testing() ? TESTING : h.check || p.setUp() ? h.pill : NOT_SET_UP, when: h.check ? h.when : p.when(), error: h.error };
      });
      this.keyHint = ko.pureComputed(() => {
        const p = this.panel();
        const s = this.status();
        if (!p || !s) {
          return '';
        }
        const stored = (same(s.baseUrl, this.draftUrl()) && s.apiKeySet) || (same(s.embeddingBaseUrl, this.draftUrl()) && s.embeddingApiKeySet);
        return stored ? 'Stored · leave empty to keep it' : p.local ? 'No key needed' : 'Paste an API key';
      });
      this.panelTest = (event) => {
        const p = this.panel();
        const url = norm(this.draftUrl());
        if (!/^https?:\/\/.+/.test(url)) {
          toast.error('Enter the server address, starting with http:// or https:// (it usually ends with /v1).');
          return null;
        }
        // A server added on this page takes the address it is tested at
        if (p.id === 'custom' && !p.baseUrl()) {
          p.baseUrl(url);
        }
        return p.test(event, this.draftKey(), url).then((models) => {
          if (models && !same(url, p.baseUrl())) {
            this.otherModels(models);
          }
          if (models && p.id === 'custom' && added.indexOf(p) < 0 && !this.providers().some((x) => x === p)) {
            added.push(p);
          }
        });
      };
      // Models listed for an address typed in the panel that is not the provider's yet
      this.otherModels = ko.observable(null);
      this.draftUrl.subscribe(() => this.otherModels(null));
      this.panelModels = ko.pureComputed(() => {
        const p = this.panel();
        const s = this.status();
        if (!p) {
          return [];
        }
        const sameAddress = same(this.draftUrl(), p.baseUrl());
        let list = (!sameAddress ? this.otherModels() : null) || (sameAddress ? p.models() : []);
        // The models in use stay listed even before a test lists the server's models
        if (sameAddress && s && !list.length) {
          list = [];
          if (p.roles().indexOf('Writing') >= 0) { list.push({ id: s.chatModel, embedding: false }); }
          if (p.roles().indexOf('Search') >= 0 && !list.some((m) => m.id === s.embeddingModel)) { list.push({ id: s.embeddingModel, embedding: true }); }
        }
        const writingHere = s && same(s.baseUrl, this.draftUrl());
        const searchHere = s && same(s.embeddingBaseUrl || s.baseUrl, this.draftUrl());
        return list.slice().sort((a, b) => (a.embedding - b.embedding) || a.id.localeCompare(b.id)).map((m) => {
          const used = [writingHere && sameModel(s.chatModel, m.id) ? 'Writing' : null, searchHere && sameModel(s.embeddingModel, m.id) ? 'Search' : null].filter(Boolean);
          const role = m.embedding ? 'search' : 'writing';
          const offer = this.isAdmin() && used.indexOf(m.embedding ? 'Search' : 'Writing') < 0;
          return {
            id: m.id, caps: capsOf(m), used: used.join(' and '), offer: offer ? (m.embedding ? 'Use for search' : 'Use for writing') : '',
            offerLabel: (m.embedding ? 'Use ' + m.id + ' for search' : 'Use ' + m.id + ' for writing'),
            use: () => this.useModel(role, m.id)
          };
        });
      });
      this.noEmbedder = ko.pureComputed(() => {
        const list = this.panelModels();
        return list.length > 0 && list.every((m) => m.caps.indexOf('Embeddings') < 0) && !!(this.otherModels() || (this.panel() && this.panel().models().length));
      });
      this.panelNoModels = ko.pureComputed(() => this.panelModels().length === 0);

      /** Saves the choice: PUT /api/model/settings with the rest as it is now (null keys keep the stored ones). */
      const saveSettings = (update, what) => {
        this.saving(true);
        this.saveWarnings([]);
        return api.put('model/settings', update).then((result) => {
          this.status(result.status);
          const p = this.panel();
          if (p) {
            p.key('');
            this.draftKey('');
            // The provider moved to the address typed in the panel
            if (!same(p.baseUrl(), this.draftUrl()) && (same(this.draftUrl(), result.status.baseUrl) || same(this.draftUrl(), result.status.embeddingBaseUrl))) {
              p.baseUrl(norm(this.draftUrl()));
            }
            if (this.otherModels()) {
              p.models(this.otherModels());
              this.otherModels(null);
            }
            if (p.id === 'custom' && added.indexOf(p) < 0 && !this.providers().some((x) => x === p)) {
              added.push(p);
            }
          }
          const s = result.status;
          loadPolicy();
          loadLimits();
          servers.loadChecks();
          toast.success(what + ' The factory now writes with ' + s.chatModel + ' and searches with ' + s.embeddingModel + '.'
            + (result.embeddingsRemoved ? ' The search model changed, so import the code of each workspace again (Code page) to search it by meaning.' : ''),
          { timeout: result.embeddingsRemoved ? 0 : 6000 });
          const warnings = result.embeddingProblem ? [result.embeddingProblem] : [];
          // The OBDX Library says when these models are outside the bank: its knowledge is then not sent to them
          return api.get('knowledge').then((o) => {
            if (o && o.privacy) {
              warnings.push(o.privacy + ' To send it anyway, set FACTORY_KNOWLEDGE_EXTERNAL_MODELS=true in settings.properties and start the factory again.');
            }
          }).catch(() => null).then(() => { this.saveWarnings(warnings); return true; });
        }).catch((error) => { actionError(error); return false; }).finally(() => this.saving(false));
      };
      const checkUrl = (url) => {
        if (!/^https?:\/\/.+/.test(url)) {
          toast.error('Enter the server address, starting with http:// or https:// (it usually ends with /v1).');
          return false;
        }
        return true;
      };

      /** Use for writing / Use for search on a model in the panel: that role moves to this server, the other stays. */
      this.useModel = (role, model) => {
        const s = this.status();
        const url = norm(this.draftUrl());
        if (!s || !checkUrl(url)) {
          return null;
        }
        const key = this.draftKey() || null;
        if (role === 'writing') {
          // Search stays where it is: on its own server, or on the old writing server when it shared it
          const searchUrl = s.embeddingBaseUrl || (same(s.baseUrl, url) ? null : s.baseUrl);
          return saveSettings({ baseUrl: url, apiKey: key, chatModel: model, embeddingModel: s.embeddingModel, embeddingBaseUrl: searchUrl, embeddingApiKey: null },
            'Writing now uses ' + model + '.');
        }
        return saveSettings({ baseUrl: s.baseUrl, apiKey: null, chatModel: s.chatModel, embeddingModel: model,
          embeddingBaseUrl: same(s.baseUrl, url) ? null : url, embeddingApiKey: same(s.baseUrl, url) ? null : key }, 'Search now uses ' + model + '.');
      };

      /** Save in the panel: a new address or key for the roles this provider has; for others, kept for this visit. */
      this.savePanel = () => {
        const p = this.panel();
        const s = this.status();
        const url = norm(this.draftUrl());
        if (!p || !s || !checkUrl(url)) {
          return null;
        }
        const key = this.draftKey() || null;
        const moved = !same(url, p.baseUrl());
        if (!p.roles().length) {
          p.key(this.draftKey());
          if (moved) {
            p.baseUrl(url);
            if (this.otherModels()) { p.models(this.otherModels()); }
          }
          if (p.id === 'custom' && added.indexOf(p) < 0) {
            added.push(p);
          }
          this.panelOpen(false);
          toast.info(p.name + ' is kept for this visit. The factory uses it once you choose one of its models with Use for writing or Use for search.');
          return null;
        }
        if (!moved && !key) {
          this.panelOpen(false);
          toast.info('Nothing changed.');
          return null;
        }
        const writing = p.roles().indexOf('Writing') >= 0;
        const searching = p.roles().indexOf('Search') >= 0;
        if (moved && !key && !p.local && ((writing && s.apiKeySet) || (searching && (s.embeddingBaseUrl ? s.embeddingApiKeySet : s.apiKeySet)))) {
          toast.error('The stored key belongs to the old address. Enter the API key for the new address, then save again.');
          return null;
        }
        const update = writing
          ? { baseUrl: url, apiKey: key, chatModel: s.chatModel, embeddingModel: s.embeddingModel,
            embeddingBaseUrl: searching ? null : s.embeddingBaseUrl, embeddingApiKey: null }
          : { baseUrl: s.baseUrl, apiKey: null, chatModel: s.chatModel, embeddingModel: s.embeddingModel, embeddingBaseUrl: url, embeddingApiKey: key };
        return saveSettings(update, 'Saved ' + p.name + '.').then((ok) => { if (ok) { this.panelOpen(false); } });
      };

      // Add provider: any OpenAI-compatible server by address, set up in the same panel
      this.addProvider = () => {
        const p = provider('custom', 'Custom server', '', false);
        this.openPanel(p);
      };
      this.isCustomDraft = ko.pureComputed(() => !!this.panel() && this.panel().id === 'custom' && !this.panel().baseUrl());

      // ---- Routing & limits ----
      this.routing = ko.pureComputed(() => {
        const s = this.status();
        const p = this.policy();
        if (!s) {
          return [];
        }
        const w = this.writing();
        const sr = this.search();
        const chip = (role) => (role === 'writing' ? { text: 'Writing', css: 'fx-badge fx-badge--primary' } : role === 'search'
          ? { text: 'Search', css: 'fx-badge fx-badge--success' } : { text: 'No model', css: 'fx-badge' });
        const row = (job, role, runs, runsCss) => ({
          job: job, chip: chip(role), model: role === 'writing' ? s.chatModel : role === 'search' ? s.embeddingModel : '',
          runs: runs || (role === 'writing' ? w.place.text : role === 'search' ? sr.place.text : ''), runsCss: runsCss || ''
        });
        return [
          row('Specification drafts from BRDs and FSDs', 'writing'),
          row('Improve my question', 'writing'),
          row('Screen changes and custom components', 'writing'),
          row('Impact analysis and change plans', 'writing'),
          row('Code generation and build fixes', 'writing'),
          row('OBDX Library answers, Ask about the code', 'writing', p && !p.chatAllowed ? 'Library content not sent' : '', p && !p.chatAllowed ? 'fx-badge fx-badge--warning' : ''),
          row('Search by meaning (code and library)', 'search'),
          row('Code review', '', 'Quick checks, Jenkins and people')
        ];
      });

      // ---- Privacy: where each kind of content goes, from the settings and the knowledge policy ----
      this.classification = ko.pureComputed(() => {
        const p = this.policy();
        const s = this.status();
        if (!p || !s) {
          return [];
        }
        const where = (host, inside) => host + (inside ? ' (inside the bank\'s network)' : ' (outside the bank\'s network)');
        return [
          { kind: 'Restricted: the OBDX Library (bank documents, notes, manual excerpts) and its questions',
            rule: p.externalAllowed ? 'Allowed outside the bank: FACTORY_KNOWLEDGE_EXTERNAL_MODELS is on' : 'Inside the bank only (enforced)',
            now: (p.chatAllowed ? 'Sent to the chat model at ' : 'Not sent: the chat model is at ') + where(p.chatHost, p.chatInside)
              + '; ' + (p.embeddingAllowed ? 'embedded at ' : 'not embedded: the embedding model is at ') + where(p.embeddingHost, p.embeddingInside),
            pill: p.externalAllowed ? ui.status('WARNING', 'Not enforced') : ui.status('SUCCEEDED', 'Enforced') },
          { kind: 'Bank code, specifications and screen designs (analysis, generation, the Design Studio, assistant panels)',
            rule: 'Sent to the configured chat model wherever it is; the factory does not block an outside server for code',
            now: 'Chat model at ' + where(p.chatHost, p.chatInside) + '; code search embeddings at ' + where(p.embeddingHost, p.embeddingInside),
            pill: p.chatInside && p.embeddingInside ? ui.status('SUCCEEDED', 'Inside the bank') : ui.status('WARNING', 'Goes outside') }
        ];
      });

      // ---- Try a prompt ----
      this.prompt = ko.observable('In one sentence, what is Oracle Banking Digital Experience?');
      this.reply = ko.observable(null);
      this.busy = ko.observable(false);
      this.send = () => {
        this.busy(true);
        this.reply(null);
        api.post('model/chat', { prompt: this.prompt() })
          .then((data) => this.reply(data))
          .catch(actionError)
          .finally(() => this.busy(false));
      };

      this.connected = () => {
        accUtils.announce('Models and AI page loaded.');
        document.title = 'Models & AI';
        api.get('model/status')
          .then((data) => {
            this.status(data);
            loadLimits();
            loadPolicy();
            servers.loadChecks();
            return session.isAdmin() ? this.findLocal() : null;
          })
          .catch(showError);
      };
    }

    return ModelsViewModel;
  }
);
