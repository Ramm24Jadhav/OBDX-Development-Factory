/*
 * Connects a page to a screen preview running in an iframe (the "preview" route with embed=1). Sends the latest
 * Screen Model once the preview has loaded, and reports clicks on components in the preview.
 */
define([], function () {
  /** Creates a connection; call attach() when the iframe is in the page and detach() when leaving it. */
  function PreviewFrame(onSelect) {
    let frame = null;
    let ready = false;
    let pending = null;

    const send = () => {
      if (frame && ready && pending && frame.contentWindow) {
        frame.contentWindow.postMessage(Object.assign({ type: 'factory-preview' }, pending), window.location.origin);
      }
    };

    const onMessage = (event) => {
      if (!frame || event.source !== frame.contentWindow || event.origin !== window.location.origin || !event.data) {
        return;
      }
      if (event.data.type === 'factory-preview-ready') {
        ready = true;
        send();
      } else if (event.data.type === 'factory-preview-select' && onSelect) {
        onSelect(event.data.id);
      }
    };

    this.src = 'index.html?ojr=preview&embed=1';

    this.attach = (iframeId) => {
      frame = document.getElementById(iframeId);
      ready = false;
      window.addEventListener('message', onMessage);
    };

    this.detach = () => {
      window.removeEventListener('message', onMessage);
      frame = null;
      ready = false;
    };

    /** Shows the model in the preview; highlight is the id of a component or action to mark. */
    this.show = (model, highlight) => {
      pending = { model: model ? JSON.parse(JSON.stringify(model)) : null, highlight: highlight || null };
      send();
    };
  }

  return PreviewFrame;
});
