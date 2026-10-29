/*
 * The signed-in user and what they may do. Pages use can(workspaceId, permission) to show or hide actions;
 * the server checks the same permissions on every request.
 */
define(['knockout', './api'], function (ko, api) {
  const user = ko.observable(null);
  const config = ko.observable(null);
  const checked = ko.observable(false);
  const unreachable = ko.observable('');

  // Who is signed in. Only 401 or 403 means signed out: a network error, a timeout or a server error while the factory
  // is busy or restarting is tried again after 1, 2 and 4 seconds, and then the sign-in page says it cannot be reached.
  function whoAmI(attempt) {
    return api.get('auth/me').then((me) => { unreachable(''); user(me); }).catch((e) => {
      const signedOut = e.status === 401 || e.status === 403;
      if (signedOut || attempt >= 3) {
        user(null);
        unreachable(signedOut ? '' : 'The factory did not answer (' + e.message + '). Check that it is running, then reload the page.');
        return null;
      }
      return new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt))).then(() => whoAmI(attempt + 1));
    });
  }

  function load() {
    return Promise.all([
      api.get('auth/config').then(config).catch(() => null),
      whoAmI(0)
    ]).finally(() => checked(true));
  }

  function login(username, password) {
    return api.post('auth/login', { username: username, password: password }).then((me) => {
      user(me);
      return me;
    });
  }

  function logout() {
    return api.post('auth/logout').catch(() => null).then(() => user(null));
  }

  /** True if the signed-in user may do this in the workspace. Administrators may do everything. */
  function can(workspaceId, permission) {
    const me = user();
    if (!me) {
      return false;
    }
    if (me.admin) {
      return true;
    }
    const membership = me.memberships.find((m) => m.workspaceId === workspaceId);
    return membership ? membership.permissions.indexOf(permission) >= 0 : false;
  }

  window.addEventListener('factory-signed-out', () => user(null));

  return {
    user: user,
    config: config,
    checked: checked,
    /** Why the factory could not be asked who is signed in (empty when it answered) */
    unreachable: unreachable,
    isAdmin: ko.pureComputed(() => !!user() && user().admin),
    load: load,
    login: login,
    logout: logout,
    can: can
  };
});
