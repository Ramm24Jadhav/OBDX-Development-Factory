/*
 * Notifications: events from the workspaces the user can see (what needs attention, builds, AI work finishing or
 * failing, screens in review, imports), built from the dashboard data. Which ones were read is kept in this browser.
 */
define(['knockout', './dashboard', './ui', './preferences'], function (ko, dashboard, ui, preferences) {
  const KEY = 'factory.notifications.read';
  const load = () => { try { return JSON.parse(window.localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const read = ko.observable(load());
  const save = (map) => { read(map); try { window.localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) { /* kept for this visit only */ } };
  const DAY_MS = 24 * 3600 * 1000;

  const all = ko.pureComputed(() => {
    const list = [];
    const add = (n) => list.push(n);
    dashboard.data().forEach((d) => {
      const w = d.workspace;
      d.builds.forEach((b) => {
        const ok = b.result === 'SUCCESS';
        const running = !b.result || b.result === 'RUNNING' || b.result === 'QUEUED';
        if (running) {
          return;
        }
        add({ id: 'build-' + b.id, category: 'build', title: ok ? 'Build Completed' : 'Build Failed', icon: ok ? 'check' : 'alert', tone: ok ? 'green' : 'red',
          text: w.name + ' ' + b.job + (ok ? ' built successfully.' : ' failed: ' + (b.errors[0] || b.result)), related: (b.buildNumber ? 'Build #' + b.buildNumber : b.job),
          relatedSub: b.changeTitle, at: b.finishedAt || b.startedAt, priority: ok ? 'low' : 'high', action: !ok, page: 'build', workspaceId: w.id,
          details: [{ label: 'Workspace', value: w.name }, { label: 'Job', value: b.job }, { label: 'Branch', value: b.branchUrl || 'patch' }, { label: 'Round', value: String(b.round) }],
          errors: b.errors.slice(0, 3), link: b.buildUrl || null });
      });
      d.requirements.forEach((r) => {
        if (r.status === 'FAILED') {
          add({ id: 'req-failed-' + r.id + r.updatedAt, category: 'agent', title: 'Agent Run Failed', icon: 'robot', tone: 'red', text: 'Drafting the specification of ' + r.title + ' failed.',
            related: r.title, relatedSub: w.name, at: r.updatedAt, priority: 'high', action: true, page: 'requirements', workspaceId: w.id,
            details: [{ label: 'Workspace', value: w.name }, { label: 'Message', value: r.message || '' }], errors: [] });
        } else if (r.status === 'READY') {
          add({ id: 'req-ready-' + r.id + r.updatedAt, category: 'review', title: r.openQuestions ? 'Questions to Answer' : 'Review Pending', icon: 'doc', tone: 'amber',
            text: r.title + (r.openQuestions ? ' has ' + r.openQuestions + ' open questions.' : ' is drafted and waits for approval.'), related: r.title, relatedSub: w.name,
            at: r.updatedAt, priority: 'medium', action: true, page: 'requirements', workspaceId: w.id, details: [{ label: 'Workspace', value: w.name }, { label: 'Screens', value: String(r.screens) }], errors: [] });
        } else if (r.status === 'APPROVED') {
          add({ id: 'req-ok-' + r.id, category: 'review', title: 'Requirement Approved', icon: 'check', tone: 'green', text: r.title + ' was approved.', related: r.title, relatedSub: w.name,
            at: r.updatedAt, priority: 'low', action: false, page: 'requirements', workspaceId: w.id, details: [{ label: 'Workspace', value: w.name }], errors: [] });
        }
      });
      d.designs.filter((s) => s.status === 'IN_REVIEW').forEach((s) => add({ id: 'design-review-' + s.id + s.updatedAt, category: 'review', title: 'Review Pending', icon: 'doc', tone: 'amber',
        text: 'Screen ' + s.name + ' waits for review.', related: s.name, relatedSub: w.name, at: s.updatedAt, priority: 'high', action: true, page: 'reviews', workspaceId: w.id,
        details: [{ label: 'Workspace', value: w.name }, { label: 'Version', value: 'v' + s.currentVersion }], errors: [] }));
      d.changeDetails.forEach((c) => {
        if (c.status === 'PLAN_READY') {
          add({ id: 'plan-' + c.id + c.updatedAt, category: 'review', title: 'Plan Waiting for Approval', icon: 'branch', tone: 'amber', text: 'The plan of ' + c.title + ' is ready.',
            related: c.title, relatedSub: w.name, at: c.updatedAt, priority: 'high', action: true, page: 'impact', workspaceId: w.id,
            details: [{ label: 'Workspace', value: w.name }, { label: 'Files', value: c.plan ? String(c.plan.items.length) : '0' }], errors: c.plan ? c.plan.risks.slice(0, 3) : [] });
        } else if (c.status === 'GENERATED') {
          add({ id: 'gen-' + c.id + c.updatedAt, category: 'agent', title: 'Agent Run Completed', icon: 'robot', tone: 'violet', text: 'Code generation for ' + c.title + ' completed.',
            related: c.title, relatedSub: w.name, at: c.updatedAt, priority: 'medium', action: false, page: 'changes', workspaceId: w.id,
            details: [{ label: 'Workspace', value: w.name }, { label: 'Files', value: String(c.files.length) }], errors: [] });
        } else if (c.status === 'FAILED') {
          add({ id: 'chg-failed-' + c.id + c.updatedAt, category: 'agent', title: 'Agent Run Failed', icon: 'robot', tone: 'red', text: c.title + ': ' + (c.message || 'the change failed.'),
            related: c.title, relatedSub: w.name, at: c.updatedAt, priority: 'high', action: true, page: 'changes', workspaceId: w.id, details: [{ label: 'Workspace', value: w.name }], errors: [] });
        }
      });
      d.imports.filter((j) => j.status === 'SUCCEEDED' || j.status === 'FAILED').forEach((j) => add({
        id: 'import-' + j.id, category: 'system', title: j.status === 'FAILED' ? 'Import Failed' : 'New Workspace Indexed', icon: j.status === 'FAILED' ? 'alert' : 'info', tone: j.status === 'FAILED' ? 'red' : 'blue',
        text: j.status === 'FAILED' ? 'Importing the code of ' + w.name + ' failed.' : 'Indexing completed for ' + w.name + ' at r' + j.toRevision + '.', related: w.name, relatedSub: 'Workspace',
        at: j.finishedAt || j.createdAt, priority: j.status === 'FAILED' ? 'high' : 'low', action: j.status === 'FAILED', page: 'code', workspaceId: w.id,
        details: [{ label: 'Workspace', value: w.name }, { label: 'Files', value: j.filesIndexed + ' indexed, ' + j.filesRemoved + ' removed' }], errors: j.message && j.status === 'FAILED' ? [j.message] : [] }));
    });
    const m = dashboard.model();
    if (m && !m.saved) {
      add({ id: 'model-not-chosen', category: 'system', title: 'Models Not Chosen', icon: 'chip', tone: 'amber', text: 'The factory uses the models from its settings file.', related: 'Models', relatedSub: m.chatModel,
        at: null, priority: 'medium', action: true, page: 'models', details: [{ label: 'Model', value: m.chatModel }, { label: 'Server', value: m.baseUrl }], errors: [] });
    }
    return list.filter((n) => !preferences.notify[n.category] || preferences.notify[n.category]()).sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).map((n) => Object.assign(n, {
      unread: ko.pureComputed(() => !read()[n.id]), when: n.at ? ui.when(n.at) : '', today: n.at && Date.now() - new Date(n.at).getTime() < DAY_MS
    }));
  });

  return {
    all: all,
    unreadCount: ko.pureComputed(() => all().filter((n) => n.unread()).length),
    markRead: (ids) => { const map = Object.assign({}, read()); ids.forEach((id) => { map[id] = true; }); save(map); },
    markUnread: (ids) => { const map = Object.assign({}, read()); ids.forEach((id) => { delete map[id]; }); save(map); }
  };
});
