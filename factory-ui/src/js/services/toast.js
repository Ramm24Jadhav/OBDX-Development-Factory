/*
 * Toast messages (design system): short feedback after an action, shown at the bottom right and read out by screen
 * readers. Any view model can call toast.success('Saved.'), toast.error(error.message) and so on.
 */
define([], function () {
  let region = null;
  const ICONS = { success: 'check', info: 'info', warning: 'alert', error: 'alert' };

  function container() {
    if (!region || !document.body.contains(region)) {
      region = document.createElement('div');
      region.className = 'fx-toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    return region;
  }

  /** Shows a toast. tone: success, info, warning or error. options: {timeout (ms, 0 keeps it), action: {label, run}}. */
  function show(message, tone, options) {
    const opts = Object.assign({ timeout: tone === 'error' ? 9000 : 5000 }, options || {});
    const item = document.createElement('div');
    item.className = 'fx-toast fx-toast--' + (tone || 'info');
    if (tone === 'error') {
      item.setAttribute('role', 'alert');
    }
    const icon = document.createElement('span');
    icon.className = 'fx-toast-icon factory-nav-icon factory-ico-' + (ICONS[tone] || 'info');
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'fx-toast-text';
    text.textContent = message;
    item.appendChild(icon);
    item.appendChild(text);
    if (opts.action) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'fx-toast-action';
      action.textContent = opts.action.label;
      action.addEventListener('click', () => { close(); opts.action.run(); });
      item.appendChild(action);
    }
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'fx-toast-close';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.innerHTML = '<span class="factory-nav-icon factory-ico-x" aria-hidden="true"></span>';
    item.appendChild(dismiss);
    let timer = null;
    function close() {
      window.clearTimeout(timer);
      item.classList.add('fx-toast--leaving');
      window.setTimeout(() => item.remove(), 160);
    }
    dismiss.addEventListener('click', close);
    container().appendChild(item);
    if (opts.timeout) {
      timer = window.setTimeout(close, opts.timeout);
      item.addEventListener('mouseenter', () => window.clearTimeout(timer));
      item.addEventListener('mouseleave', () => { timer = window.setTimeout(close, 2500); });
    }
    return close;
  }

  return {
    show: show,
    success: (message, options) => show(message, 'success', options),
    info: (message, options) => show(message, 'info', options),
    warning: (message, options) => show(message, 'warning', options),
    error: (message, options) => show(message, 'error', options)
  };
});
