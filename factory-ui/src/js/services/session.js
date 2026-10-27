/*
 * The signed-in user and what they may do. Pages use can(workspaceId, permission) to show or hide actions;
 * the server checks the same permissions on every request.
 */
define(['knockout', './api'], function (ko, api) {
  const user = ko.observable(null);
  const config = ko.observable(null);
  const checked = ko.observable(false);

  function load() {
    return Promise.all([
      api.get('auth/config').then(config),
      api.get('auth/me').then(user).catch(() => user(null))
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
    isAdmin: ko.pureComputed(() => !!user() && user().admin),
    load: load,
    login: login,
    logout: logout,
    can: can
  };
});
