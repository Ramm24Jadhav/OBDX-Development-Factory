/*
 * Small wrapper around fetch for calls to the factory backend (/api/...).
 * Rejects with an Error whose message comes from the backend's error body when available.
 */
define([], function () {
  function request(method, path, body) {
    const options = { method: method, headers: { 'Accept': 'application/json' } };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch('api/' + path, options).then(function (response) {
      if (response.status === 204) {
        return null;
      }
      return response.json().catch(function () { return null; }).then(function (data) {
        if (!response.ok) {
          const message = (data && (data.detail || data.title)) || ('Request failed: HTTP ' + response.status);
          throw new Error(message);
        }
        return data;
      });
    });
  }

  return {
    get: function (path) { return request('GET', path); },
    post: function (path, body) { return request('POST', path, body); },
    put: function (path, body) { return request('PUT', path, body); },
    del: function (path) { return request('DELETE', path); }
  };
});
