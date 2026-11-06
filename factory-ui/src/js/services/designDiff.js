/*
 * What changed from one saved version of a screen to another, in plain words, for the Design Studio's Compare versions and its editor's History.
 * Fields and buttons are matched by their ids, so a renamed field shows as changed rather than removed and added.
 */
define([], function () {
  const words = (list) => (list && list.length ? list.join(', ') : 'none');
  const name = (c) => '"' + (c.label || c.name || c.id) + '"';
  const condition = (cond) => (cond && cond.field ? cond.field + ' ' + (cond.operator || 'filled') + (cond.value ? ' ' + cond.value : '') : 'none');
  const source = (c) => (c.dataSource && c.dataSource.api ? c.dataSource.api + (c.dataSource.path ? ' · ' + c.dataSource.path : '') : 'none');
  const fields = (model) => model.sections.reduce((all, s) => all.concat(s.components.map((c) => ({ c: c, section: s }))), []);

  /** @return [{kind: Added|Removed|Changed|Same, text, id}] where id is the element to select, when it still exists */
  return function differences(from, to) {
    const out = [];
    const add = (kind, text, id) => out.push({ kind: kind, text: text, id: id || null });
    const same = (a, b) => (a === undefined || a === null ? '' : String(a)) === (b === undefined || b === null ? '' : String(b));
    if (!same(from.title, to.title)) {
      add('Changed', 'Title: "' + (from.title || '') + '" to "' + (to.title || '') + '"');
    }
    if (!same(from.name, to.name)) {
      add('Changed', 'Name: "' + (from.name || '') + '" to "' + (to.name || '') + '"');
    }
    if (!same(from.stage, to.stage)) {
      add('Changed', 'Stage: ' + (from.stage || 'not set') + ' to ' + (to.stage || 'not set'));
    }
    if (words(from.channels) !== words(to.channels)) {
      add('Changed', 'Channels: ' + (words(from.channels) === 'none' ? 'all' : words(from.channels)) + ' to '
        + (words(to.channels) === 'none' ? 'all' : words(to.channels)));
    }
    const sectionsFrom = {};
    from.sections.forEach((s) => { sectionsFrom[s.id] = s; });
    const sectionsTo = {};
    to.sections.forEach((s) => { sectionsTo[s.id] = s; });
    to.sections.filter((s) => !sectionsFrom[s.id]).forEach((s) => add('Added', 'Section "' + (s.title || 'Section') + '"', s.id));
    from.sections.filter((s) => !sectionsTo[s.id]).forEach((s) => add('Removed', 'Section "' + (s.title || 'Section') + '"'));
    to.sections.filter((s) => sectionsFrom[s.id]).forEach((s) => {
      const before = sectionsFrom[s.id];
      if (!same(before.title, s.title)) {
        add('Changed', 'Section "' + (before.title || 'Section') + '" renamed to "' + (s.title || 'Section') + '"', s.id);
      }
      if ((before.columns || 2) !== (s.columns || 2)) {
        add('Changed', 'Section "' + (s.title || 'Section') + '" columns: ' + (before.columns || 2) + ' to ' + (s.columns || 2), s.id);
      }
    });
    const before = {};
    fields(from).forEach((f) => { before[f.c.id] = f; });
    const after = {};
    fields(to).forEach((f) => { after[f.c.id] = f; });
    const order = fields(to).map((f) => f.c.id);
    Object.keys(after).filter((k) => !before[k]).forEach((k) => add('Added', 'Field ' + name(after[k].c) + ' (' + after[k].c.type + ')', k));
    Object.keys(before).filter((k) => !after[k]).forEach((k) => add('Removed', 'Field ' + name(before[k].c)));
    Object.keys(after).filter((k) => before[k]).forEach((k) => {
      const a = before[k].c;
      const b = after[k].c;
      const change = (text) => add('Changed', name(b) + ' ' + text, k);
      if (!same(a.label, b.label)) { add('Changed', 'Label: "' + (a.label || '') + '" to "' + (b.label || '') + '"', k); }
      if (!same(a.name, b.name)) { change('ID: ' + (a.name || '') + ' to ' + (b.name || '')); }
      if (a.type !== b.type) { change('type: ' + a.type + ' to ' + b.type); }
      if (!same(a.required, b.required)) {
        change(b.required === true ? 'is now mandatory' : b.required === false ? 'is now optional' : 'mandatory: not specified');
      }
      if ((a.readonly === true) !== (b.readonly === true)) { change(b.readonly === true ? 'is now read-only' : 'can now be entered'); }
      if (words(a.options) !== words(b.options)) { change('values: ' + words(a.options) + ' to ' + words(b.options)); }
      if (source(a) !== source(b)) { change('values from: ' + source(a) + ' to ' + source(b)); }
      if (!same(a.defaultValue, b.defaultValue)) { change('default: ' + (a.defaultValue || 'none') + ' to ' + (b.defaultValue || 'none')); }
      if (!same(a.placeholder, b.placeholder)) { change('placeholder: ' + (a.placeholder || 'none') + ' to ' + (b.placeholder || 'none')); }
      if (!same(a.helpText, b.helpText)) { change('help text: ' + (a.helpText || 'none') + ' to ' + (b.helpText || 'none')); }
      if (!same(a.maxLength, b.maxLength)) { change('maximum length: ' + (a.maxLength || 'none') + ' to ' + (b.maxLength || 'none')); }
      if (words(a.validations) !== words(b.validations)) { change('validations: ' + words(a.validations) + ' to ' + words(b.validations)); }
      if (condition(a.visibleWhen) !== condition(b.visibleWhen)) { change('shown when: ' + condition(a.visibleWhen) + ' to ' + condition(b.visibleWhen)); }
      if (condition(a.requiredWhen) !== condition(b.requiredWhen)) { change('mandatory when: ' + condition(a.requiredWhen) + ' to ' + condition(b.requiredWhen)); }
      if (!same(a.html, b.html) || !same(a.css, b.css) || !same(a.script, b.script)) { change('own HTML, CSS or JS changed'); }
      if (before[k].section.id !== after[k].section.id) {
        change('moved to section "' + (after[k].section.title || 'Section') + '"');
      }
    });
    // Order within the fields both versions have
    const kept = fields(from).map((f) => f.c.id).filter((k) => after[k]);
    if (kept.join('|') !== order.filter((k) => before[k]).join('|')) {
      add('Changed', 'The order of the fields changed');
    }
    const actionsFrom = {};
    from.actions.forEach((a) => { actionsFrom[a.id] = a; });
    const actionsTo = {};
    to.actions.forEach((a) => { actionsTo[a.id] = a; });
    to.actions.filter((a) => !actionsFrom[a.id]).forEach((a) => add('Added', 'Button "' + a.label + '"', a.id));
    from.actions.filter((a) => !actionsTo[a.id]).forEach((a) => add('Removed', 'Button "' + a.label + '"'));
    to.actions.filter((a) => actionsFrom[a.id]).forEach((a) => {
      const b = actionsFrom[a.id];
      if (b.label !== a.label) { add('Changed', 'Button "' + b.label + '" renamed to "' + a.label + '"', a.id); }
      if (b.kind !== a.kind) { add('Changed', 'Button "' + a.label + '" style: ' + b.kind + ' to ' + a.kind, a.id); }
    });
    if (out.length === 0) {
      add('Same', 'No differences in the screen, its sections, fields or buttons.');
    }
    return out;
  };
});
