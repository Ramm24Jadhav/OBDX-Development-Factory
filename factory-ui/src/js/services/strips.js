/*
 * Tab strips and other single-row strips that can be wider than their box: no native scrollbar; instead the edge
 * fades while more tabs are hidden past it, and a mouse can drag the strip sideways (touch and trackpads scroll it
 * natively, and a focused tab scrolls itself into view). Applied once, here, to every strip a page renders.
 */
define([], function () {
  const STRIPS = '.fx-tabs, .factory-tabs, .factory-tabbar, .factory-subtabs, .factory-ch-filetabs, .factory-stepper';
  // Carousel tracks get the mouse drag only: their buttons and dots already show what is past the edges
  const TRACKS = '.fx-carousel-track';

  function edges(strip) {
    const max = strip.scrollWidth - strip.clientWidth;
    strip.classList.toggle('fx-strip--start', strip.scrollLeft > 2);
    strip.classList.toggle('fx-strip--end', max > 2 && strip.scrollLeft < max - 2);
  }

  // Mouse drag: starts after 5 pixels, so a plain click still selects a tab; the click that ends a drag is ignored
  function draggable(strip) {
    let startX = 0;
    let startLeft = 0;
    let dragging = false;
    let down = false;
    strip.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || strip.scrollWidth <= strip.clientWidth) { return; }
      down = true;
      dragging = false;
      startX = event.clientX;
      startLeft = strip.scrollLeft;
    });
    strip.addEventListener('pointermove', (event) => {
      if (!down) { return; }
      const dx = event.clientX - startX;
      if (!dragging && Math.abs(dx) > 5) {
        dragging = true;
        strip.classList.add('fx-strip--dragging');
        try { strip.setPointerCapture(event.pointerId); } catch (e) { /* the pointer is already gone */ }
      }
      if (dragging) { strip.scrollLeft = startLeft - dx; }
    });
    const end = () => {
      down = false;
      if (dragging) {
        strip.classList.remove('fx-strip--dragging');
        // Only the click this drag ends with (it comes at once); a later, real click is never swallowed
        const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
        strip.addEventListener('click', swallow, { capture: true, once: true });
        window.setTimeout(() => strip.removeEventListener('click', swallow, { capture: true }), 300);
        window.setTimeout(() => { dragging = false; }, 0);
      }
    };
    strip.addEventListener('pointerup', end);
    strip.addEventListener('pointercancel', end);
  }

  const resized = window.ResizeObserver ? new window.ResizeObserver((entries) => entries.forEach((e) => edges(e.target))) : null;

  function enhance(strip) {
    if (strip.fxStrip) { return; }
    strip.fxStrip = true;
    strip.classList.add('fx-strip');
    strip.addEventListener('scroll', () => edges(strip), { passive: true });
    if (resized) { resized.observe(strip); }
    draggable(strip);
    edges(strip);
  }

  let queued = false;
  function scan() {
    queued = false;
    document.querySelectorAll(STRIPS).forEach(enhance);
    document.querySelectorAll(TRACKS).forEach((track) => { if (!track.fxDrag) { track.fxDrag = true; draggable(track); } });
    document.querySelectorAll('.fx-strip').forEach(edges);
  }

  return {
    /** Starts watching the page for strips (once, from the app shell). */
    init: function () {
      scan();
      new MutationObserver(() => {
        if (!queued) { queued = true; window.requestAnimationFrame(scan); }
      }).observe(document.body, { childList: true, subtree: true });
    }
  };
});
