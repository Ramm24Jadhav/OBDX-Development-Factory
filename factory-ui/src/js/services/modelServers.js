/*
 * What Models & AI and Integrations both say about a model server: its name, whether it is inside the bank's network
 * and the health from the connection tests the server remembers (GET /api/model/checks, administrators), so the two
 * pages always show the same result for the same server. Nothing here sends anything to a model server.
 */
define(['knockout', './api', './session', './ui'], function (ko, api, session, ui) {
  const norm = (url) => String(url || '').trim().replace(/\/+$/, '');
  const same = (a, b) => !!a && !!b && norm(a).toLowerCase() === norm(b).toLowerCase();
  const hostOf = (url) => { const m = /^[a-z]+:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^:/]+)/i.exec(norm(url)); return m ? m[1].toLowerCase().replace(/^\[|\]$/g, '') : ''; };

  /** A short name for a server address: the known cloud providers, the usual local servers, else its host. */
  function nameOf(url) {
    const host = hostOf(url);
    const port = (/:(\d+)(\/|$)/.exec(norm(url).replace(/^[a-z]+:\/\//i, '')) || [])[1];
    if (/(^|\.)openai\.com$/.test(host)) { return 'OpenAI'; }
    if (/(^|\.)x\.ai$/.test(host)) { return 'xAI (Grok)'; }
    if (/(^|\.)groq\.com$/.test(host)) { return 'Groq'; }
    if (thisComputer(host)) {
      return port === '11434' ? 'Local (Ollama)' : port === '1234' ? 'Local (LM Studio)' : 'Local server';
    }
    return host || 'Model server';
  }

  const thisComputer = (host) => host === 'localhost' || /^127\./.test(host) || host === '::1';
  const privateHost = (host) => /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^169\.254\./.test(host) || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host);

  /**
   * Inside or outside the bank's network. The server decides it for the two servers in use (GET /api/knowledge/policy:
   * this computer, private addresses, factory.knowledge.internal-hosts); another address is judged by its host here.
   */
  function placeOf(url, policy) {
    const host = hostOf(url);
    if (policy && host && host === String(policy.chatHost || '').toLowerCase()) {
      return place(policy.chatInside, host);
    }
    if (policy && host && host === String(policy.embeddingHost || '').toLowerCase()) {
      return place(policy.embeddingInside, host);
    }
    return place(thisComputer(host) || privateHost(host), host);
  }
  function place(inside, host) {
    return {
      inside: !!inside,
      text: inside ? 'Inside the bank' : 'Outside the bank',
      detail: inside ? (thisComputer(host) ? 'this computer' : 'the bank\'s network') : 'hosted',
      css: inside ? 'fx-badge fx-badge--success' : 'fx-badge fx-badge--warning'
    };
  }

  // The tests the server remembers since it started, by address (administrators only; others see none)
  const checks = ko.observable({});
  const loadChecks = () => (session.isAdmin() ? api.get('model/checks').then((list) => {
    const map = {};
    (list || []).forEach((c) => { map[norm(c.baseUrl).toLowerCase()] = c; });
    checks(map);
    return map;
  }).catch(() => checks()) : Promise.resolve({}));
  const checkOf = (url) => checks()[norm(url).toLowerCase()] || null;

  /**
   * The health of a server from its last remembered test: {key: ok|failed|untested, pill, when, error, latency}.
   * The words are the same on both pages.
   */
  function healthOf(url) {
    const c = checkOf(url);
    if (!c) {
      return { key: 'untested', pill: ui.status('WARNING', 'Not tested'), when: 'Not tested since the factory started', error: '', check: null };
    }
    if (c.ok) {
      return { key: 'ok', pill: ui.status('PASSED', 'Connected'), when: 'Tested ' + ui.when(c.lastAt) + ' · ' + c.latencyMs + ' ms', error: '', check: c };
    }
    const error = c.lastError ? ui.errorText(c.lastError) : 'No reason given';
    return { key: 'failed', pill: ui.status('FAILED', 'Not reachable'), when: 'Failed ' + ui.when(c.lastAt) + (c.lastOk ? ' · last worked ' + ui.when(c.lastOk) : ''), error: error, check: c };
  }

  /** Tests a server by listing its models (nothing is sent to the model); the server remembers the result. */
  const test = (url, apiKey) => api.post('model/servers/models', { baseUrl: norm(url), apiKey: apiKey || null })
    .finally(() => loadChecks());

  return { norm: norm, same: same, hostOf: hostOf, nameOf: nameOf, placeOf: placeOf, checks: checks, loadChecks: loadChecks, checkOf: checkOf, healthOf: healthOf, test: test };
});
