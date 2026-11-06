/*
 * The health of a workspace's SVN repository and Jenkins, from results the factory recorded: connection tests (the
 * workspace's integration activity, GET /workspaces/{id}/integrations/activity), imports from SVN and Jenkins builds
 * (the dashboard data). Settings changed after the newest result make it need a test again; saved settings alone never
 * show as working. The Integrations page and the Workspaces page both read it, so they show the same health.
 */
define(['./ui'], function (ui) {
  // Health words; the status category gives the colour (only a real result is green). Filter: which chip counts it.
  const HEALTH = {
    ok: { pill: ui.status('PASSED', 'Working'), filter: 'working' },
    warning: { pill: ui.status('WARNING', 'Warnings'), filter: 'test' },
    failed: { pill: ui.status('FAILED', 'Failed'), filter: 'test' },
    partial: { pill: ui.status('WARNING', 'Partly tested'), filter: 'test' },
    untested: { pill: ui.status('WARNING', 'Needs a test'), filter: 'test' },
    notset: { pill: ui.status('DRAFT', 'Not set up'), filter: 'notset' },
    none: { pill: ui.status('NOT_CHECKED', 'Not recorded'), filter: '' },
    inuse: { pill: ui.status('NOT_CHECKED', 'In use'), filter: '' },
    off: { pill: ui.status('CLOSED', 'Off'), filter: '' }
  };
  const BUILD_REACHED = ['SUCCESS', 'FAILURE', 'UNSTABLE', 'ABORTED'];
  const time = (value) => (value ? new Date(value).getTime() : 0);
  const newest = (list) => list.filter(Boolean).sort((a, b) => time(b.at) - time(a.at))[0] || null;
  // A one-line version of a server message; the whole message stays in the tooltip
  const first = (text) => { const t = String(text || '').trim().replace(/\s+/g, ' '); return t.length > 140 ? t.slice(0, 139) + '…' : t; };

  /** A connection's health from its newest result; settings changed after it make it need a test again. */
  function healthOf(results, changedAt) {
    const last = newest(results);
    if (!last) {
      return { key: 'untested', note: 'No connection test recorded yet.' };
    }
    if (changedAt && time(changedAt) > time(last.at)) {
      return { key: 'untested', note: 'The settings changed after the last result. Test the connection again.' };
    }
    return { key: last.kind, note: '' };
  }

  /** SVN results of one workspace (entry: its dashboard data; events: its integration activity). */
  function svnResults(entry, events) {
    const list = events || [];
    const tests = list.filter((e) => /^SVN_TEST_/.test(e.action)).map((e) => ({
      at: e.at, kind: e.action === 'SVN_TEST_PASSED' ? 'ok' : 'failed', source: 'Connection test',
      text: (e.action === 'SVN_TEST_PASSED' ? 'Connected, ' + (e.detail || 'repository read') : first(e.detail) || 'Connection failed'), full: e.detail, by: e.username
    }));
    const imports = entry.imports.filter((j) => j.status === 'SUCCEEDED' || j.status === 'FAILED').map((j) => ({
      at: j.finishedAt || j.createdAt, kind: j.status === 'SUCCEEDED' ? 'ok' : 'failed', source: 'Import',
      text: j.status === 'SUCCEEDED' ? 'Imported' + (j.toRevision ? ' revision ' + j.toRevision : '') : 'Import failed: ' + (first(j.message) || 'no reason given'), full: j.message
    }));
    const changed = newest(list.filter((e) => e.action === 'SVN_SETTINGS_CHANGED'));
    return { tests: tests, results: tests.concat(imports), changedAt: changed ? changed.at : null };
  }

  /** Jenkins results of one workspace (entry: its dashboard data; events: its integration activity). */
  function jenkinsResults(entry, events) {
    const list = events || [];
    const tests = list.filter((e) => /^JENKINS_TEST_/.test(e.action)).map((e) => ({
      at: e.at, kind: e.action === 'JENKINS_TEST_PASSED' ? 'ok' : e.action === 'JENKINS_TEST_WARNING' ? 'warning' : 'failed', source: 'Connection test',
      text: e.action === 'JENKINS_TEST_FAILED' ? first(e.detail) || 'Connection failed' : 'Connected, ' + first(e.detail), full: e.detail, by: e.username
    }));
    const builds = entry.builds.filter((b) => BUILD_REACHED.indexOf(b.result) >= 0 || b.result === 'NOT_BUILT').map((b) => ({
      at: b.finishedAt || b.startedAt, kind: b.result === 'NOT_BUILT' ? 'failed' : 'ok', source: 'Build',
      text: (b.buildNumber ? 'Build #' + b.buildNumber + ' ' : 'Build ') + (b.result === 'NOT_BUILT' ? 'not run: ' + first((b.errors || [])[0] || 'Jenkins was not reached') : 'ran (' + b.result.toLowerCase() + ')'),
      full: b.result === 'NOT_BUILT' ? (b.errors || []).join(' ') : b.changeTitle
    }));
    const changed = newest(list.filter((e) => e.action === 'JENKINS_SETTINGS_CHANGED'));
    return { tests: tests, results: tests.concat(builds), changedAt: changed ? changed.at : null };
  }

  /**
   * One workspace's SVN and Jenkins health in short: key, pill, note and the newest result (last).
   * jenkins: the workspace's Jenkins settings (null: not set up; undefined: not loaded); events: its activity
   * (undefined: not loaded, so only imports and builds count).
   */
  function summary(entry, jenkins, events) {
    const svn = entry.workspace.svnUrl ? svnResults(entry, events) : null;
    const jk = jenkins ? jenkinsResults(entry, events) : null;
    const of = (r) => {
      const h = healthOf(r.results, r.changedAt);
      return Object.assign(h, { pill: HEALTH[h.key].pill, last: newest(r.results) });
    };
    return {
      svn: svn ? of(svn) : Object.assign({ key: 'notset', note: 'No SVN URL set.', last: null }, { pill: HEALTH.notset.pill }),
      jenkins: jk ? of(jk) : (jenkins === null ? { key: 'notset', note: 'Jenkins is not set up for this workspace.', last: null, pill: HEALTH.notset.pill } : null)
    };
  }

  return { HEALTH: HEALTH, BUILD_REACHED: BUILD_REACHED, healthOf: healthOf, svnResults: svnResults, jenkinsResults: jenkinsResults, summary: summary, newest: newest, first: first };
});
