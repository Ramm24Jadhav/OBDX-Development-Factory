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

  // The JET gallery's examples (the gates' jet-gallery.html, with its sample data): every component as the gates check it.
  // examples() resolves to view(id), a fresh copy of that component's example (null when the gallery has none), and data.
  let examples_ = null;
  function examples() {
    if (examples_) { return examples_; }
    window.requirejs.config({ paths: { 'bx-samples': '../packs/samples/jet-samples' } });
    const samples = new Promise((resolve, reject) => { window.requirejs(['bx-samples'], resolve, reject); });
    const page = fetch('packs/samples/jet-gallery.html').then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status))));
    examples_ = Promise.all([load(), page, samples]).then(([, html, make]) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const bodies = {};
      doc.querySelectorAll('section[data-component]').forEach((sec) => { bodies[sec.getAttribute('data-component')] = sec.querySelector('.gate-body'); });
      return { data: make(ko), view: (id) => { const b = bodies[id]; if (!b) { return null; } const first = b.firstElementChild && b.firstElementChild.classList.contains('gate-row') ? b.firstElementChild.firstElementChild : b.firstElementChild; return first ? [document.importNode(first, true)] : null; } };
    }).catch(() => { examples_ = null; return { data: {}, view: () => null }; });
    return examples_;
  }

  // Which packs' own galleries the jar has (target-packs/components/previews/build.sh), to frame one component each
  const PREVIEW_PAGES = { react: 'packs/previews/react/index.html', angular: 'packs/previews/angular/gallery/index.html', 'react-native': 'packs/previews/react-native/index.html' };
  const framed = ko.observable({});
  let checked = false;
  function previews() {
    if (!checked) {
      checked = true;
      Object.keys(PREVIEW_PAGES).forEach((id) => fetch(PREVIEW_PAGES[id], { method: 'HEAD' })
        .then((r) => { if (r.ok) { framed(Object.assign({}, framed(), { [id]: PREVIEW_PAGES[id] })); } }).catch(() => undefined));
    }
    return framed;
  }

  return { load: load, ready: ready, styleClasses: styleClasses, examples: examples, previews: previews };
});
