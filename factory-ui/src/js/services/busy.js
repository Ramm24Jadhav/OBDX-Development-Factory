/*
 * What the factory is doing right now, shown three ways and driven by the real requests (services/api.js reports each
 * one here):
 *  - the button that started a request shows a spinner and ignores further clicks until the request settles, so an
 *    operation cannot be sent twice;
 *  - a thin bar under the top bar runs while requests the user started are open (not background polling);
 *  - block(promise, message) covers the page with a message for the few operations that must finish before anything
 *    else (starting the factory, signing in, committing a change to SVN).
 * Every count is reference-counted and released in finally, so success, failure and errors all clear it. Nothing waits
 * longer than the request itself: the spinner and the bar only appear when a request takes more than a moment.
 */
define(['knockout'], function (ko) {
  const SHOW_AFTER = 150;        // ms before a spinner or the bar appears (fast requests never flicker)
  const USER_WINDOW = 1500;      // ms after a click or key press in which a request counts as the user's

  let lastInteraction = 0;
  let clickedButton = null;
  const userRequests = ko.observable(0);
  const blocks = ko.observableArray([]);

  const remember = (event) => {
    lastInteraction = Date.now();
    const button = event.target && event.target.closest ? event.target.closest('button.fx-btn, a.fx-btn, button.factory-icon-button') : null;
    if (event.type === 'click' && button) {
      // A second click on a button whose request is still open does nothing
      if (button.classList.contains('is-busy')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      clickedButton = button;
      // Handlers run during this click and the promise steps right after it; requests they start belong to the button
      window.setTimeout(() => { clickedButton = null; }, 0);
    }
  };
  document.addEventListener('click', remember, true);
  document.addEventListener('keydown', remember, true);
  window.addEventListener('factory-navigate', () => { lastInteraction = Date.now(); });

  function markButton(button) {
    const count = (Number(button.dataset.busyCount) || 0) + 1;
    button.dataset.busyCount = String(count);
    if (count === 1) {
      button.fxBusyTimer = window.setTimeout(() => {
        button.classList.add('is-busy');
        button.setAttribute('aria-busy', 'true');
      }, SHOW_AFTER);
    }
    return () => {
      const left = (Number(button.dataset.busyCount) || 1) - 1;
      button.dataset.busyCount = String(left);
      if (left === 0) {
        window.clearTimeout(button.fxBusyTimer);
        button.classList.remove('is-busy');
        button.removeAttribute('aria-busy');
      }
    };
  }

  /** Called by api.js for every request; returns the function that releases it. */
  function request() {
    const releases = [];
    if (clickedButton && document.contains(clickedButton)) {
      releases.push(markButton(clickedButton));
    }
    if (Date.now() - lastInteraction < USER_WINDOW) {
      userRequests(userRequests() + 1);
      releases.push(() => userRequests(Math.max(0, userRequests() - 1)));
    }
    let done = false;
    return () => {
      if (!done) {
        done = true;
        releases.forEach((release) => release());
      }
    };
  }

  // The bar shows only while a user request has been open for a moment
  const barVisible = ko.observable(false);
  let barTimer = null;
  userRequests.subscribe((n) => {
    if (n > 0 && !barVisible() && !barTimer) {
      barTimer = window.setTimeout(() => { barTimer = null; barVisible(userRequests() > 0); }, SHOW_AFTER);
    }
    if (n === 0) {
      window.clearTimeout(barTimer);
      barTimer = null;
      barVisible(false);
    }
  });

  /**
   * Covers the page with message until promise settles, and returns it. Use it only for operations that must finish
   * before anything else; long jobs (analysis, generation, builds) show their own progress on their page instead.
   */
  function block(promise, message) {
    const entry = { message: message || 'Working…' };
    blocks.push(entry);
    return Promise.resolve(promise).finally(() => blocks.remove(entry));
  }

  return {
    request: request,
    block: block,
    barVisible: barVisible,
    blocking: ko.pureComputed(() => blocks().length > 0),
    /** The newest blocking operation's message */
    blockMessage: ko.pureComputed(() => (blocks().length ? blocks()[blocks().length - 1].message : ''))
  };
});
