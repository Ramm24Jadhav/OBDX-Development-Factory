/*
 * The AI Assistant panel on the redesigned pages: sends the question with the page's context (what the user is looking
 * at, as text) to /api/knowledge/ask, which adds what the OBDX knowledge base says (the manuals for the workspace's
 * OBDX version, and the approved and suggested notes) and answers with numbered citations, listed under the answer.
 * The page context is built from data the page already shows.
 */
define(['knockout', './api', './workspaceSelection'], function (ko, api, workspaceSelection) {
  const MAX_PROMPT = 19000;

  /**
   * context: a function returning the text the model should know (page data), or '' when there is nothing yet.
   * suggestions: example questions shown as buttons.
   */
  function create(context, suggestions) {
    const messages = ko.observableArray([]);
    const input = ko.observable('');
    const busy = ko.observable(false);

    const send = (text) => {
      const question = (typeof text === 'string' ? text : input()).trim();
      if (!question || busy()) {
        return;
      }
      input('');
      messages.push({ mine: true, text: question, css: 'factory-ai-msg factory-ai-mine' });
      busy(true);
      const page = (context() || '').slice(0, MAX_PROMPT);
      api.post('knowledge/ask', { question: question, workspaceId: workspaceSelection.selectedId() || null, context: page })
        .then((result) => {
          // The sources the answer cites, listed under it: [n] the manual, its section and page (or the note)
          const cited = (result.sources || []).map((s) => '[' + s.n + '] ' + (s.kind === 'NOTE'
            ? (s.status === 'TRUSTED' ? 'Approved note: ' : 'Suggested note: ') + s.title
            : s.title + ' ' + s.obdxVersion + (s.heading ? ', ' + s.heading : '') + ', p. ' + s.pageFrom));
          messages.push({
            mine: false, text: result.answer + (cited.length ? '\n\nSources:\n' + cited.join('\n') : ''),
            meta: result.model + ' · ' + Math.round(result.latencyMs / 100) / 10 + 's' + (cited.length ? ' · ' + cited.length + ' sources' : ' · not from the manuals'),
            css: 'factory-ai-msg'
          });
        })
        .catch((error) => messages.push({ mine: false, text: error.message, meta: 'Not answered', css: 'factory-ai-msg factory-ai-error' }))
        .finally(() => busy(false));
    };

    return {
      messages: messages,
      input: input,
      busy: busy,
      send: () => send(),
      ask: (text) => send(text),
      clear: () => messages([]),
      suggestions: (suggestions || []).map((s) => ({ text: s, ask: () => send(s) }))
    };
  }

  return { create: create };
});
