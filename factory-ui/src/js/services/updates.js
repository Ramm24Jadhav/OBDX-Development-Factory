/*
 * The factory's version and updates (/api/update): the banner at the top of the page and the About page use this.
 * While an update downloads, the status is polled; when the factory has restarted with the new version, the page
 * reloads.
 */
define(['knockout', './api'], function (ko, api) {
  const status = ko.observable(null);
  const error = ko.observable('');
  let polling = null;

  function poll() {
    if (polling) {
      return;
    }
    polling = window.setInterval(function () {
      api.get('update').then(function (result) {
        status(result);
        if (result.state !== 'DOWNLOADING' && result.state !== 'RESTARTING') {
          window.clearInterval(polling);
          polling = null;
        }
      }).catch(function () {
        // The factory is restarting: wait until it answers again, then load the new version of the page.
        window.clearInterval(polling);
        polling = null;
        waitForRestart();
      });
    }, 2000);
  }

  function waitForRestart() {
    const timer = window.setInterval(function () {
      fetch('actuator/health').then(function (response) {
        if (response.ok) {
          window.clearInterval(timer);
          window.location.reload();
        }
      }).catch(function () { return null; });
    }, 3000);
  }

  /** Reads the status; force asks GitHub now instead of using the last check (administrators). */
  function refresh(force) {
    error('');
    return api.get('update' + (force ? '?check=true' : '')).then(function (result) {
      status(result);
      if (result.state === 'DOWNLOADING' || result.state === 'RESTARTING') {
        poll();
      }
      return result;
    }).catch(function (e) { error(e.message); });
  }

  function install() {
    error('');
    return api.post('update').then(function (result) {
      status(result);
      poll();
    }).catch(function (e) { error(e.message); });
  }

  return {
    status: status,
    error: error,
    refresh: refresh,
    install: install,
    /**
     * The download's progress for the banner's bar while an update downloads or installs, else null. percent is null
     * while installing (the bar then only moves).
     */
    progress: ko.pureComputed(function () {
      const s = status();
      if (!s || !s.enabled || (s.state !== 'DOWNLOADING' && s.state !== 'RESTARTING')) {
        return null;
      }
      const percent = s.state === 'DOWNLOADING' ? Math.max(0, Math.min(100, s.progress || 0)) : null;
      return {
        percent: percent,
        label: percent === null ? 'Installing' : percent + '%',
        css: 'factory-update-bar' + (percent === null ? ' is-indeterminate' : ' is-running'),
        style: { width: (percent === null ? 100 : percent) + '%' }
      };
    }),
    /** Text for the banner, or '' when there is nothing to say. */
    banner: ko.pureComputed(function () {
      const s = status();
      if (!s || !s.enabled) {
        return '';
      }
      switch (s.state) {
        case 'AVAILABLE': return 'A new version of the factory is available (build ' + s.latestBuild + '; this is build ' + s.build + ').';
        case 'DOWNLOADING': return 'Downloading build ' + s.latestBuild + ' of the factory. It restarts by itself when the download is complete.';
        case 'RESTARTING': return 'Installing the new version; the factory restarts and this page reloads in about a minute. Then sign in again.';
        default: return '';
      }
    })
  };
});
