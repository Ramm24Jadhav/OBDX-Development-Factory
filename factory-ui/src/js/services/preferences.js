/*
 * The signed-in person's preferences, kept in this browser: landing page, default workspace, time format, text size,
 * whether the AI assistant panels show, and which notification categories show. Applied when the app starts and
 * whenever they change.
 */
define(['knockout'], function (ko) {
  const KEY = 'factory.preferences';
  const DEFAULTS = { landing: 'overview', workspace: '', hour12: true, textSize: 'normal', assistant: true, sidebarCollapsed: false,
    notify: { build: true, agent: true, review: true, system: true } };
  const stored = (() => { try { return JSON.parse(window.localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } })();
  const values = Object.assign({}, DEFAULTS, stored, { notify: Object.assign({}, DEFAULTS.notify, stored.notify || {}) });

  const prefs = {};
  Object.keys(DEFAULTS).filter((k) => k !== 'notify').forEach((k) => { prefs[k] = ko.observable(values[k]); });
  prefs.notify = {};
  Object.keys(DEFAULTS.notify).forEach((k) => { prefs.notify[k] = ko.observable(values.notify[k]); });

  const save = () => {
    const out = {};
    Object.keys(DEFAULTS).filter((k) => k !== 'notify').forEach((k) => { out[k] = prefs[k](); });
    out.notify = {};
    Object.keys(DEFAULTS.notify).forEach((k) => { out.notify[k] = prefs.notify[k](); });
    try { window.localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* kept for this visit only */ }
  };
  const apply = () => {
    document.body.classList.toggle('factory-text-large', prefs.textSize() === 'large');
    document.body.classList.toggle('factory-no-assistant', !prefs.assistant());
  };
  Object.keys(DEFAULTS).filter((k) => k !== 'notify').forEach((k) => prefs[k].subscribe(() => { save(); apply(); }));
  Object.keys(DEFAULTS.notify).forEach((k) => prefs.notify[k].subscribe(save));
  prefs.apply = apply;
  prefs.reset = () => {
    Object.keys(DEFAULTS).filter((k) => k !== 'notify').forEach((k) => prefs[k](DEFAULTS[k]));
    Object.keys(DEFAULTS.notify).forEach((k) => prefs.notify[k](true));
  };
  return prefs;
});
