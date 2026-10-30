/*
 * Small wrapper around fetch for calls to the factory backend (/api/...).
 * Rejects with an Error whose message comes from the backend's error body when available, and whose
 * status is the HTTP status code. Every request is reported to services/busy (the clicked button's spinner, the
 * progress bar) and released however it ends.
 */
define(['./busy'], function (busy) {
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
    const release = busy.request();
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
    }).finally(release);
  }

  /**
   * POSTs a JSON body and reads the reply as it arrives, one JSON object per line (application/x-ndjson), handing each
   * to onEvent. Resolves when the reply ends; an error reply rejects like request().
   */
  function stream(path, body, onEvent) {
    const headers = { 'Accept': 'application/x-ndjson, application/json', 'Content-Type': 'application/json' };
    if (csrfToken()) {
      headers['X-XSRF-TOKEN'] = csrfToken();
    }
    const release = busy.request();
    return fetch('api/' + path, { method: 'POST', headers: headers, credentials: 'same-origin', body: JSON.stringify(body) }).then(function (response) {
      if (!response.ok || !response.body) {
        return response.json().catch(function () { return null; }).then(function (data) {
          if (response.status === 401) {
            window.dispatchEvent(new CustomEvent('factory-signed-out'));
          }
          const error = new Error((data && (data.detail || data.title)) || ('Request failed: HTTP ' + response.status));
          error.status = response.status;
          throw error;
        });
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      const lines = function (text) {
        pending += text;
        let end;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end).trim();
          pending = pending.slice(end + 1);
          if (line) {
            onEvent(JSON.parse(line));
          }
        }
      };
      const next = function () {
        return reader.read().then(function (part) {
          if (part.done) {
            lines(decoder.decode() + '\n');
            return null;
          }
          lines(decoder.decode(part.value, { stream: true }));
          return next();
        });
      };
      return next();
    }).finally(release);
  }

  return {
    get: function (path) { return request('GET', path); },
    /** Reads a streamed reply line by line (see stream). */
    stream: stream,
    post: function (path, body) { return request('POST', path, body); },
    put: function (path, body) { return request('PUT', path, body); },
    /** Sends a multipart form, for file uploads. */
    upload: function (path, formData) { return request('POST', path, formData); },
    del: function (path) { return request('DELETE', path); }
  };
});
