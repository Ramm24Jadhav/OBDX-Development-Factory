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

  // The selection line of a tab strip: one line that glides from the old tab to the new one. It takes the selected
  // tab's own underline (colour and thickness), which is then hidden, so the strip looks as designed when still.
  // Strips that mark the selection another way (a filled pill) keep it.
  function selectedTab(strip) {
    return [...strip.children].find((t) => t.getAttribute('aria-selected') === 'true' || t.classList.contains('factory-tab-on'));
  }
  function placeInk(strip, animate) {
    const tab = selectedTab(strip);
    let ink = strip.fxInk;
    if (!tab) { if (ink) { ink.style.opacity = '0'; } return; }
    // The underline is read once, before it is hidden
    if (!strip.fxInkLook) {
      const cs = getComputedStyle(tab);
      const w = parseFloat(cs.borderBottomWidth);
      const visible = w >= 2 && cs.borderBottomStyle !== 'none' && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(cs.borderBottomColor);
      strip.fxInkLook = visible ? { width: w, color: cs.borderBottomColor } : { none: true };
    }
    if (strip.fxInkLook.none) { return; }
    const width = strip.fxInkLook.width;
    const cs = { borderBottomColor: strip.fxInkLook.color };
    if (!ink) {
      ink = document.createElement('span');
      ink.className = 'fx-tab-ink';
      ink.setAttribute('aria-hidden', 'true');
      strip.appendChild(ink);
      strip.fxInk = ink;
    }
    ink.classList.toggle('is-moving', !!animate && ink.style.opacity === '1');
    ink.style.background = cs.borderBottomColor;
    ink.style.height = width + 'px';
    ink.style.left = tab.offsetLeft + 'px';
    ink.style.width = tab.offsetWidth + 'px';
    ink.style.top = (tab.offsetTop + tab.offsetHeight - width) + 'px';
    ink.style.opacity = '1';
    strip.classList.add('fx-strip--ink');
  }

  const resized = window.ResizeObserver ? new window.ResizeObserver((entries) => entries.forEach((e) => { edges(e.target); placeInk(e.target, false); })) : null;

  function enhance(strip) {
    if (strip.fxStrip) { return; }
    strip.fxStrip = true;
    strip.classList.add('fx-strip');
    strip.addEventListener('scroll', () => edges(strip), { passive: true });
    if (resized) { resized.observe(strip); }
    draggable(strip);
    edges(strip);
    if (strip.matches('[role="tablist"], .fx-tabs, .factory-tabs, .factory-tabbar, .factory-subtabs, .factory-ch-filetabs')) {
      placeInk(strip, false);
      // A new selection (the attribute or class changes) glides the line over
      // (its own class changes and the line's do not count)
      new MutationObserver((list) => {
        if (list.some((m) => m.target !== strip && m.target !== strip.fxInk)) { placeInk(strip, true); }
      }).observe(strip, { attributes: true, subtree: true, attributeFilter: ['aria-selected', 'class'] });
    }
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
