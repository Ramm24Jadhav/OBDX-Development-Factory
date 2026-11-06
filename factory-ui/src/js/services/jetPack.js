/*
 * Loads the premium JET pack (target-packs/components/jet-premium, served by the factory at /packs/jet-premium/) into
 * the factory's own pages: its stylesheet once and its bx- elements, so Component mapping and the Component factory show
 * the real elements. load() resolves to the pack (its version and elements); the classes for a component style come from
 * styleClasses().
 */
define(['knockout'], function (ko) {
  let loading = null;
  const ready = ko.observable(false);

  function load() {
    if (loading) { return loading; }
    if (!document.getElementById('bxPackCss')) {
      const link = document.createElement('link');
      link.id = 'bxPackCss';
      link.rel = 'stylesheet';
      link.href = 'packs/jet-premium/bx.css';
      document.head.appendChild(link);
    }
    // Paths are relative to the application's js folder
    window.requirejs.config({ paths: { bx: '../packs/jet-premium' } });
    loading = new Promise((resolve, reject) => {
      window.requirejs(['bx/bx'], (pack) => { ready(true); resolve(pack); }, (err) => { loading = null; reject(err); });
    });
    return loading;
  }

  /** The bx- classes for a component style choice: {look, motion: {hover, click, scroll}, mode}. */
  function styleClasses(choice) {
    const c = choice || {};
    const m = c.motion || {};
    return ['bx-theme', 'bx-look-' + (c.look || 'elevated'), m.hover ? 'bx-motion-hover-' + m.hover : '', m.click ? 'bx-motion-click-' + m.click : '',
      m.scroll ? 'bx-motion-scroll-' + m.scroll : '', c.mode === 'dark' ? 'bx-dark' : ''].filter(Boolean).join(' ');
  }

  return { load: load, ready: ready, styleClasses: styleClasses };
});
