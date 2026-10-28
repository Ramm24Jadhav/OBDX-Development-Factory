/*
 * The AI Assistant panel on the redesigned pages: sends the question with the page's context (what the user is looking
 * at, as text) to the configured chat model through /api/model/chat, and keeps the conversation for the panel.
 * The context is built from data the page already shows, so nothing new is sent beyond what the user can see.
 */
define(['knockout', './api'], function (ko, api) {
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
      let prompt = 'You are the assistant of OBDX Development Factory, a tool for changing a bank\'s Oracle Banking '
        + 'Digital Experience code. Answer briefly and only from the information below; say so when it does not '
        + 'contain the answer.\n\n' + (context() || '(no data on this page yet)') + '\n\nQuestion: ' + question;
      if (prompt.length > MAX_PROMPT) {
        prompt = prompt.slice(0, MAX_PROMPT - question.length - 20) + '\n\nQuestion: ' + question;
      }
      api.post('model/chat', { prompt: prompt })
        .then((result) => messages.push({ mine: false, text: result.reply, meta: result.model + ' · ' + Math.round(result.latencyMs / 100) / 10 + 's', css: 'factory-ai-msg' }))
        .catch((error) => messages.push({ mine: false, text: error.message, meta: 'Not answered', css: 'factory-ai-msg factory-ai-error' }))
        .finally(() => busy(false));
    };

    return {
      messages: messages,
      input: input,
      busy: busy,
      send: () => send(),
      clear: () => messages([]),
      suggestions: (suggestions || []).map((s) => ({ text: s, ask: () => send(s) }))
    };
  }

  return { create: create };
});
