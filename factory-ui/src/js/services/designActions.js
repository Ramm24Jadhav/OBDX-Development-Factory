/*
 * What both the Design Studio and its editor do to screens, with the same confirmations everywhere: approve one screen,
 * a requirement's screens or all of a BRD's screens, reopen an approved screen, and read a screen's versions.
 *   - Every approve and every reopen asks first.
 *   - Screens with elements the workspace's version pack forbids are refused (409 "Unsupported components: ..."):
 *     approving them anyway is asked again and sent with ?unsupported=true.
 * Each action resolves with the server's answer, or null when it was cancelled; errors are passed on.
 */
define(['./api', './dialog'], function (api, dialog) {
  const UNSUPPORTED = 'Unsupported components: ';
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  /** Sends post(false); on the unsupported-components refusal asks, then sends post(true). */
  const allowingUnsupported = (post) => post(false).catch((error) => {
    if (error.status === 409 && String(error.message).indexOf(UNSUPPORTED) === 0) {
      return dialog.confirm({
        title: 'Approve unsupported components?',
        message: error.message.substring(UNSUPPORTED.length).replace(/^./, (c) => c.toUpperCase()),
        confirmLabel: 'Approve Anyway', danger: true
      }).then((ok) => (ok ? post(true) : null));
    }
    throw error;
  });

  /** The question asked before approving: one screen (by name), a group (by its title) or every remaining screen. */
  const approveQuestion = (o) => {
    if (o.every) {
      return { title: 'Approve every screen?', message: 'All ' + o.count + ' remaining screens of this BRD are locked for development.'
        + (o.open ? ' ' + (o.open === o.count && o.count > 1 ? 'All of them have' : o.open + (o.open === 1 ? ' of them has' : ' of them have')) + ' open checks (values to confirm or decisions).' : ' None of them has open checks.')
        + ' You can reopen a screen later.', confirmLabel: 'Approve all' };
    }
    if (o.count === 1) {
      return {
        title: 'Approve this screen?',
        message: (o.name ? '"' + o.name + '"' : 'The screen') + (o.version ? ', version ' + o.version + ',' : '')
          + ' is approved for development and its components are locked. You can reopen it later.',
        confirmLabel: 'Approve'
      };
    }
    return { title: 'Approve ' + plural(o.count, 'screen', 'screens') + '?', message: 'The ' + o.count + ' screens of ' + (o.group || 'this requirement')
      + ' that are not approved yet are locked for development. You can reopen a screen later.', confirmLabel: 'Approve ' + o.count };
  };

  return {
    /**
     * Approves screens of a BRD in one transaction: ids (null for every screen not approved yet). o: { count, name,
     * version, group, every }. Resolves with the BRD's design flow, or null when cancelled.
     */
    approveScreens: (requirementId, ids, o) => dialog.confirm(approveQuestion(o)).then((ok) => (ok
      ? allowingUnsupported((confirmed) => api.post('requirements/' + encodeURIComponent(requirementId) + '/designs/approve' + (confirmed ? '?unsupported=true' : ''), { designIds: ids }))
      : null)),

    /** Approves one screen (also one without a BRD). Resolves with the screen's details, or null when cancelled. */
    approveScreen: (designId, name, version) => dialog.confirm(approveQuestion({ count: 1, name: name, version: version })).then((ok) => (ok
      ? allowingUnsupported((confirmed) => api.post('designs/' + encodeURIComponent(designId) + '/approve' + (confirmed ? '?unsupported=true' : '')))
      : null)),

    /** Reopens an approved screen. Resolves with the screen's details, or null when cancelled. */
    reopen: (designId, name) => dialog.confirm({
      title: 'Reopen this screen?',
      message: (name ? '"' + name + '"' : 'It') + ' can be changed again, and has to be approved again before code is generated.',
      confirmLabel: 'Reopen'
    }).then((ok) => (ok ? api.post('designs/' + encodeURIComponent(designId) + '/reopen') : null)),

    /** A screen's details with its versions. */
    detail: (designId) => api.get('designs/' + encodeURIComponent(designId)),

    /** One saved version's Screen Model; asked once per screen and version while the page is open. */
    versionModel: (() => {
      const models = {};
      return (designId, version) => {
        const key = designId + '@' + version;
        if (!models[key]) {
          models[key] = api.get('designs/' + encodeURIComponent(designId) + '/versions/' + encodeURIComponent(version)).catch((error) => { delete models[key]; throw error; });
        }
        return models[key];
      };
    })()
  };
});
