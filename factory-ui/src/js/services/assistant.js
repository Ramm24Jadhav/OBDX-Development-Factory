/*
 * The AI Assistant panel on the redesigned pages: sends the question with the page's context (what the user is looking
 * at, as text) to /api/knowledge/ask/stream, which adds what the OBDX knowledge base says (the manuals for the
 * workspace's OBDX version, and the approved and suggested notes) and answers with numbered citations, listed under the
 * answer. The answer appears as the model writes it. The page context is built from data the page already shows.
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
    // Busy, and the model has not written anything yet
    const waiting = ko.observable(false);

    const send = (text) => {
      const question = (typeof text === 'string' ? text : input()).trim();
      if (!question || busy()) {
        return;
      }
      input('');
      messages.push({ mine: true, text: question, css: 'factory-ai-msg factory-ai-mine' });
      busy(true);
      waiting(true);
      const page = (context() || '').slice(0, MAX_PROMPT);
      // The reply joins the conversation with the first piece the model writes and grows as more arrive
      const reply = { mine: false, text: ko.observable(''), meta: ko.observable(''), css: ko.observable('factory-ai-msg is-writing') };
      const write = (value) => {
        if (waiting()) {
          waiting(false);
          messages.push(reply);
        }
        reply.text(value);
      };
      let written = '';
      let failed = null;
      api.stream('knowledge/ask/stream', { question: question, workspaceId: workspaceSelection.selectedId() || null, context: page }, (event) => {
        if (event.type === 'text') {
          written += event.text;
          write(written);
        } else if (event.type === 'done') {
          const result = event.answer;
          // The sources the answer cites, listed under it: [n] the manual, its section and page (or the note)
          const cited = (result.sources || []).map((s) => '[' + s.n + '] ' + (s.kind === 'NOTE'
            ? (s.status === 'TRUSTED' ? 'Approved note: ' : 'Suggested note: ') + s.title
            : s.title + ' ' + s.obdxVersion + (s.heading ? ', ' + s.heading : '') + (s.pageFrom ? ', p. ' + s.pageFrom : '')));
          write(result.answer + (cited.length ? '\n\nSources:\n' + cited.join('\n') : ''));
          reply.meta(result.model + ' · ' + Math.round(result.latencyMs / 100) / 10 + 's' + (cited.length ? ' · ' + cited.length + ' sources' : ' · not from the manuals'));
          reply.css('factory-ai-msg');
        } else if (event.type === 'error') {
          failed = event.message;
        }
      })
        .then(() => {
          if (failed) {
            throw new Error(failed);
          }
        })
        .catch((error) => {
          if (waiting()) {
            messages.push({ mine: false, text: error.message, meta: 'Not answered', css: 'factory-ai-msg factory-ai-error' });
          } else {
            // Part of the answer was written: keep it, and say why it stopped
            reply.meta('Not finished: ' + error.message);
            reply.css('factory-ai-msg factory-ai-error');
          }
        })
        .finally(() => {
          waiting(false);
          busy(false);
        });
    };

    return {
      messages: messages,
      input: input,
      busy: busy,
      waiting: waiting,
      send: () => send(),
      ask: (text) => send(text),
      clear: () => messages([]),
      suggestions: (suggestions || []).map((s) => ({ text: s, ask: () => send(s) }))
    };
  }

  return { create: create };
});
