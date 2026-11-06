/*
 * Scroll reveal: sections and cards that start below the window rise into place the first time they scroll into
 * view, a few at a time; the bars, rings and charts inside them grow when they appear (app.css, "Scroll reveal").
 * What is already on screen when a page opens is left to the page's own entrance. Nothing happens with reduced
 * motion. It moves elements with top, never a transform, so menus inside a rising card open in the right place.
 */
define([], function () {
  const TARGETS = '.factory-page section, .factory-page .fx-card, .factory-page [class*="-card"]:not(td):not(tr)';
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let seen = null;
  const shown = (entries) => {
    let i = 0;
    entries.forEach((e) => {
      if (!e.isIntersecting) { return; }
      const el = e.target;
      seen.unobserve(el);
      // Cards entering together follow one another
      el.style.transitionDelay = Math.min(i++ * 60, 240) + 'ms';
      el.classList.add('is-in');
      window.setTimeout(() => { el.classList.remove('fx-reveal', 'is-in'); el.style.transitionDelay = ''; }, 1100);
    });
  };

  // Only the outermost targets: a card inside a revealing section moves with it. Pages fill in as their data
  // arrives, so an element is looked at again on every change until it is first found below the window (hiding it
  // then cannot be seen); an element once revealed is never hidden again.
  function scan(root) {
    const below = window.innerHeight;
    root.querySelectorAll(TARGETS).forEach((el) => {
      if (el.fxRevealSeen) { return; }
      const outer = el.parentElement && el.parentElement.closest(TARGETS);
      if (outer && outer.closest('.factory-page')) { return; }
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.top < below + 4) { return; }
      el.fxRevealSeen = true;
      el.classList.add('fx-reveal');
      seen.observe(el);
    });
  }

  return {
    init: function () {
      if (reduced() || !window.IntersectionObserver) { return; }
      seen = new window.IntersectionObserver(shown, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      let queued = false;
      new MutationObserver(() => {
        if (queued) { return; }
        queued = true;
        // After the page has laid out, so positions are final
        window.setTimeout(() => { queued = false; scan(document); }, 120);
      }).observe(document.body, { childList: true, subtree: true });
      scan(document);
    }
  };
});
