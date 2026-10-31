/*
 * Confirmation dialog (design system), in place of window.confirm: a modal with a title, a message and two buttons,
 * focus kept inside, Escape to cancel, and focus returned to where it was. Resolves true when confirmed.
 *   dialog.confirm({ title: 'Delete this change?', message: '...', confirmLabel: 'Delete', danger: true }).then((ok) => ...)
 */
define([], function () {
  function confirm(options) {
    const opts = Object.assign({ title: 'Are you sure?', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', danger: false }, options || {});
    return new Promise((resolve) => {
      const opener = document.activeElement;
      const backdrop = document.createElement('div');
      backdrop.className = 'fx-dialog-backdrop';
      const box = document.createElement('div');
      box.className = 'fx-dialog';
      box.setAttribute('role', opts.danger ? 'alertdialog' : 'dialog');
      box.setAttribute('aria-modal', 'true');
      const titleId = 'fx-dialog-title-' + Date.now();
      box.setAttribute('aria-labelledby', titleId);

      const head = document.createElement('div');
      head.className = 'fx-dialog-head';
      const icon = document.createElement('span');
      icon.className = 'fx-dialog-icon' + (opts.danger ? ' fx-dialog-icon--danger' : '');
      icon.innerHTML = '<span class="factory-nav-icon factory-ico-' + (opts.danger ? 'alert' : 'info') + '" aria-hidden="true"></span>';
      const title = document.createElement('h2');
      title.id = titleId;
      title.className = 'fx-dialog-title';
      title.textContent = opts.title;
      head.appendChild(icon);
      head.appendChild(title);
      const body = document.createElement('p');
      body.className = 'fx-dialog-body';
      body.textContent = opts.message;
      const actions = document.createElement('div');
      actions.className = 'fx-dialog-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'fx-btn fx-btn--secondary';
      cancel.textContent = opts.cancelLabel;
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'fx-btn ' + (opts.danger ? 'fx-btn--danger' : 'fx-btn--primary');
      ok.textContent = opts.confirmLabel;
      actions.appendChild(cancel);
      actions.appendChild(ok);
      box.appendChild(head);
      if (opts.message) {
        box.appendChild(body);
      }
      box.appendChild(actions);
      backdrop.appendChild(box);
      document.body.appendChild(backdrop);

      function finish(result) {
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        if (opener && typeof opener.focus === 'function') {
          opener.focus();
        }
        resolve(result);
      }
      function onKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        } else if (event.key === 'Tab') {
          // Keep focus on the two buttons
          const items = [cancel, ok];
          const at = items.indexOf(document.activeElement);
          event.preventDefault();
          items[(at + (event.shiftKey ? items.length - 1 : 1)) % items.length].focus();
        }
      }
      cancel.addEventListener('click', () => finish(false));
      ok.addEventListener('click', () => finish(true));
      backdrop.addEventListener('mousedown', (event) => { if (event.target === backdrop) { finish(false); } });
      document.addEventListener('keydown', onKey, true);
      (opts.danger ? cancel : ok).focus();
    });
  }

  return { confirm: confirm };
});
