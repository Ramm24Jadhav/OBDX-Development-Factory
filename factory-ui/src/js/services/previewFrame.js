/*
 * Connects a page to a screen preview running in an iframe: the JET "preview" route (embed=1), or the React Native or
 * React preview page for workspaces with such a UI target. Sends the latest Screen Model once the preview has loaded,
 * and reports clicks on components in the preview.
 */
define([], function () {
  const PAGES = {
    jet: 'index.html?ojr=preview&embed=1',
    'react-native': 'preview-react-native.html',
    react: 'preview-react.html'
  };

  /**
   * Creates a connection; call attach() when the iframe is in the page and detach() when leaving it.
   *
   * @param onSelect called with the id of a component, action or section clicked in the preview
   * @param onDrop   called when something is dropped on the preview: the component it was dropped on (to insert
   *                 before) and the section, either may be null
   */
  function PreviewFrame(onSelect, onDrop) {
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
      } else if (event.data.type === 'factory-preview-drop' && onDrop) {
        onDrop(event.data.targetId || null, event.data.sectionId || null);
      }
    };

    this.src = PAGES.jet;

    /** Call when the iframe loads another preview page; the model is sent again once that page is ready. */
    this.reload = () => {
      ready = false;
    };

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

    /**
     * Shows the model in the preview; highlight is the id of a component or action to mark. context (optional) frames
     * it as an OBDX page: bank, breadcrumb, steps and step of the journey, warnings by id, editing.
     */
    this.show = (model, highlight, context) => {
      pending = {
        model: model ? JSON.parse(JSON.stringify(model)) : null,
        highlight: highlight || null,
        context: context ? JSON.parse(JSON.stringify(context)) : null
      };
      send();
    };
  }

  /** The preview page for a renderer: jet, react-native or react. */
  PreviewFrame.srcFor = (kind) => PAGES[kind] || PAGES.jet;

  return PreviewFrame;
});
