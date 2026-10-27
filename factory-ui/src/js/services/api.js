/*
 * Small wrapper around fetch for calls to the factory backend (/api/...).
 * Rejects with an Error whose message comes from the backend's error body when available, and whose
 * status is the HTTP status code.
 */
define([], function () {
  /** The CSRF token the server keeps in the XSRF-TOKEN cookie; changes must send it back in a header. */
  function csrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function request(method, path, body) {
    const options = { method: method, headers: { 'Accept': 'application/json' }, credentials: 'same-origin' };
    if (method !== 'GET' && csrfToken()) {
      options.headers['X-XSRF-TOKEN'] = csrfToken();
    }
    if (body instanceof FormData) {
      options.body = body;
    } else if (typeof body === 'string') {
      options.headers['Content-Type'] = 'application/json';
      options.body = body;
    } else if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch('api/' + path, options).then(function (response) {
      if (response.status === 204) {
        return null;
      }
      return response.json().catch(function () { return null; }).then(function (data) {
        if (response.status === 401 && path !== 'auth/me' && path !== 'auth/login') {
          // The session ended: let the app show the sign-in page.
          window.dispatchEvent(new CustomEvent('factory-signed-out'));
        }
        if (!response.ok) {
          const message = (data && (data.detail || data.title)) || ('Request failed: HTTP ' + response.status);
          const error = new Error(message);
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  return {
    get: function (path) { return request('GET', path); },
    post: function (path, body) { return request('POST', path, body); },
    put: function (path, body) { return request('PUT', path, body); },
    /** Sends a multipart form, for file uploads. */
    upload: function (path, formData) { return request('POST', path, formData); },
    del: function (path) { return request('DELETE', path); }
  };
});
