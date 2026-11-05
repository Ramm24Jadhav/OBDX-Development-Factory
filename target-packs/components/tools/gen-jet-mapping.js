// Writes target-packs/components/mapping/jet-premium.json: how each Oracle JET element maps to the premium JET pack.
// The premium elements keep the JET attribute and event names, so most parts are "same"; what differs is listed.
// Run from the repository root: node target-packs/components/tools/gen-jet-mapping.js .
const fs = require('fs');
const path = require('path');
const repo = process.argv[2];
const catalogue = JSON.parse(fs.readFileSync(path.join(repo, 'target-packs/components/catalogue.json'), 'utf8'));
const ids = new Set(catalogue.categories.flatMap((c) => c.components.map((e) => e.id)));

const FIELD = ['value', 'label-hint', 'label-edge', 'placeholder', 'required', 'disabled', 'readonly', 'validators', 'async-validators', 'messages-custom', 'help.instruction', 'help-hints', 'display-options'];
const FIELD_EVENTS = ['on-value-changed', 'on-raw-value-changed', 'on-valid-changed'];
const A11Y_FIELD = 'The label is tied to the field, errors and help are announced, the focus ring meets 3:1 contrast and the field is 44 px tall on touch screens.';
const STYLE_TOKENS = 'Styled from the pack tokens; oj-* classes and inline styles on the element are not carried over.';

// [source, target, extra props (same name), changes, events, slots, notes]
// changes: [from, to, conversion]; to null = not supported (needs a hand edit or is dropped)
const E = [
  ['oj-input-text', 'text-field', ['converter', 'autocomplete', 'clear-icon', 'virtual-keyboard', 'length.max'], [], [], [], {}],
  ['oj-input-password', 'password', [], [['mask-icon', 'reveal', 'shown as a show and hide button; the attribute name changes']], [], [], {}],
  ['oj-text-area', 'text-area', ['rows', 'max-rows', 'resize-behavior', 'length.max'], [], [], [], {}],
  ['oj-input-number', 'number-input', ['min', 'max', 'step', 'converter', 'virtual-keyboard'], [], [], [], {}],
  ['oj-input-date', 'date', ['min', 'max', 'converter', 'picker-attributes'], [['day-formatter', 'disabled-days', 'a function returning disabled days becomes a list or a function of dates; check each formatter'], ['date-picker', null, 'footer and week-number options are not offered; the calendar follows the pack design', 'drop']], [], [], { manual: ['A day-formatter that colours days or adds notes needs a person.'] }],
  ['oj-input-date-time', 'date', ['min', 'max', 'converter'], [['time-picker', 'time', 'the time part becomes a time field next to the date']], [], [], {}],
  ['oj-input-time', 'date', ['min', 'max', 'converter'], [['time-picker', 'time', 'shown as a time field']], [], [], {}],
  ['oj-select-one', 'select', ['options', 'options-keys', 'item-text'], [['option-renderer', 'item-template', 'a renderer function becomes an item template slot'], ['minimum-results-for-search', 'searchable', 'search is on when there are more than 10 options']], [], ['item-template'], {}],
  ['oj-select-single', 'select', ['data', 'item-text', 'value-item'], [], [], ['item-template', 'collection-template'], {}],
  ['oj-select-many', 'multi-select', ['options', 'data', 'item-text'], [['option-renderer', 'item-template', 'a renderer function becomes an item template slot']], [], ['item-template'], {}],
  ['oj-combobox-one', 'autocomplete', ['options', 'item-text', 'raw-value'], [['option-renderer', 'item-template', 'a renderer function becomes an item template slot']], [], [], {}],
  ['oj-combobox-many', 'multi-select', ['options', 'item-text'], [], [], [], {}],
  ['oj-checkboxset', 'checkbox-group', ['options', 'labelled-by'], [], [], ['oj-option children'], { noField: ['placeholder', 'help-hints'] }],
  ['oj-radioset', 'choice-group', ['options', 'labelled-by'], [], [], ['oj-option children'], { noField: ['placeholder', 'help-hints'] }],
  ['oj-switch', 'switch', ['labelled-by'], [], [], [], { noField: ['placeholder', 'validators', 'async-validators', 'help-hints'] }],
  ['oj-slider', 'savings-slider', ['min', 'max', 'step', 'type', 'orientation'], [], [['on-transient-value-changed', 'on-transient-value-changed']], [], { noField: ['placeholder', 'validators', 'async-validators'] }],
  ['oj-button', 'button', ['chroming', 'display', 'label'], [], [['on-oj-action', 'on-oj-action']], ['startIcon', 'endIcon'], { button: true }],
  ['oj-menu-button', 'action-menu', ['chroming', 'display', 'label'], [], [['on-oj-action', 'on-oj-action']], ['menu', 'startIcon', 'endIcon'], { button: true }],
  ['oj-buttonset-one', 'segmented', ['chroming', 'focus-management', 'options'], [], [], ['oj-option children'], { noField: ['placeholder', 'required', 'validators', 'async-validators', 'messages-custom', 'help.instruction', 'help-hints', 'label-edge', 'readonly', 'display-options'] }],
  ['oj-buttonset-many', 'segmented', ['chroming', 'options'], [['value', 'value', 'an array of values; the premium segmented control takes several only with multiple="true"']], [], ['oj-option children'], { noField: ['placeholder', 'required', 'validators', 'async-validators', 'messages-custom', 'help.instruction', 'help-hints', 'label-edge', 'readonly', 'display-options'] }],
  ['oj-toolbar', null, [], [], [], [], { child: true, gone: 'Kept as it is: the premium buttons go inside it.' }],
  ['oj-dialog', 'dialog', ['dialog-title', 'modality', 'cancel-behavior', 'drag-affordance', 'resize-behavior', 'position'], [], [['on-oj-close', 'on-oj-close'], ['on-oj-open', 'on-oj-open'], ['on-oj-before-close', 'on-oj-before-close']], ['header', 'body', 'footer'], { container: true, a11y: 'Focus moves into the dialog and back when it closes; Escape closes it unless cancel-behavior is none; the title labels the dialog.' }],
  ['oj-popup', 'sheet', ['auto-dismiss', 'position', 'modality', 'tail', 'initial-focus'], [], [['on-oj-close', 'on-oj-close'], ['on-oj-open', 'on-oj-open']], ['default'], { container: true }],
  ['oj-tab-bar', 'tabs', ['selection', 'data', 'display', 'edge', 'overflow', 'layout'], [], [['on-selection-changed', 'on-selection-changed']], ['item-template'], { container: true, a11y: 'Tabs move with the arrow keys, Home and End; the selected tab is announced.' }],
  ['oj-navigation-list', 'side-nav', ['selection', 'data', 'drill-mode', 'display', 'edge', 'expanded'], [['as', null, 'the old item alias is not offered; templates use item.data', 'drop']], [['on-selection-changed', 'on-selection-changed']], ['item-template'], { container: true }],
  ['oj-train', 'stepper', ['steps', 'selected-step'], [], [['on-selected-step-changed', 'on-selected-step-changed'], ['on-oj-before-select', 'on-oj-before-select']], [], { container: true, a11y: 'Each step says its number, name and whether it is done; the current step is marked for screen readers.' }],
  ['oj-table', 'data-grid', ['data', 'columns', 'selection-mode', 'selection', 'scroll-policy', 'display', 'horizontal-grid-visible', 'vertical-grid-visible', 'accessibility.row-header', 'columns-default'], [['row-renderer', null, 'a row renderer function needs a person: write it as a row template'], ['dnd', null, 'drag and drop of rows is not offered']], [['on-selected-changed', 'on-selected-changed'], ['on-oj-sort', 'on-oj-sort'], ['on-oj-before-current-row', 'on-oj-before-current-row']], ['cellTemplate', 'headerTemplate', 'rowTemplate', 'noData'], { container: true, templates: true, a11y: 'The table has a caption, header cells with scope, sortable headers that announce their order, and keyboard navigation cell by cell.' }],
  ['oj-list-view', 'transaction-list', ['data', 'selection-mode', 'selection', 'scroll-policy', 'drill-mode', 'gridlines.item', 'item.focusable'], [['item.renderer', 'item-template', 'a renderer function becomes an item template slot']], [['on-selection-changed', 'on-selection-changed'], ['on-current-item-changed', 'on-current-item-changed']], ['itemTemplate', 'noData'], { container: true, templates: true }],
  ['oj-paging-control', 'pagination', ['data', 'page-size', 'mode', 'page-options.layout'], [], [], [], { container: true }],
  ['oj-collapsible', 'accordion', ['expanded', 'disabled', 'expand-area'], [], [['on-expanded-changed', 'on-expanded-changed'], ['on-oj-before-expand', 'on-oj-before-expand']], ['header', 'default'], { container: true }],
  ['oj-accordion', 'accordion', ['expanded', 'multiple'], [], [['on-expanded-changed', 'on-expanded-changed']], ['oj-collapsible children'], { container: true }],
  ['oj-file-picker', 'document-upload', ['accept', 'selection-mode', 'disabled', 'select-on'], [], [['on-oj-select', 'on-oj-select'], ['on-oj-invalid-select', 'on-oj-invalid-select'], ['on-oj-before-select', 'on-oj-before-select']], ['trigger'], { container: true }],
  ['oj-progress', 'budget-progress', ['value', 'max', 'type'], [['type', 'type', 'circle shows as the premium ring; bar as the premium bar']], [], [], { container: true }],
  ['oj-progress-bar', 'budget-progress', ['value', 'max'], [], [], [], { container: true }],
  ['oj-progress-circle', 'budget-progress', ['value', 'max', 'size'], [], [], [], { container: true }],
  ['oj-messages', 'toast', ['messages', 'display', 'position'], [], [['on-oj-close', 'on-oj-close']], ['messageTemplate'], { container: true, a11y: 'Messages are announced politely, errors assertively; each closes with a button that has a name.' }],
  ['oj-avatar', 'avatar', ['initials', 'src', 'size', 'role'], [], [], [], { container: true }],
  ['oj-form-layout', null, [], [], [], [], { child: true, gone: 'Kept as it is: the premium fields go inside it and its label-edge still applies.' }],
  ['oj-label', null, [], [], [], [], { gone: 'Labels move into the premium fields as label-hint; a separate oj-label is not needed.' }],
  ['oj-chart', 'spending-chart', ['type', 'series', 'groups', 'data', 'orientation', 'legend', 'animation-on-display'], [['styleDefaults', null, 'chart styling options need a person'], ['x-axis', null, 'axis options need a person'], ['y-axis', null, 'axis options need a person']], [['on-selection-changed', 'on-selection-changed']], ['itemTemplate', 'seriesTemplate'], { container: true, manual: ['The premium pack has a spending chart only; other charts stay JET charts or are rebuilt by hand.'], status: 'custom-transformation' }],
  ['oj-gauge', null, [], [], [], [], { unsupported: true }],
  ['oj-status-meter-gauge', 'budget-progress', ['value', 'min', 'max', 'orientation'], [['thresholds', null, 'threshold colours need a person'], ['indicator-size', null, 'not offered', 'drop']], [], [], { container: true, status: 'custom-transformation' }],
  ['oj-rating-gauge', null, [], [], [], [], { unsupported: true }],
  ['oj-conveyor-belt', null, [], [], [], [], { unsupported: true }],
  ['oj-film-strip', null, [], [], [], [], { unsupported: true }],
  ['oj-tree-view', null, [], [], [], [], { unsupported: true }],
  ['oj-data-grid', null, [], [], [], [], { unsupported: true }],
  ['oj-color-palette', null, [], [], [], [], { unsupported: true }],
  ['oj-masonry-layout', null, [], [], [], [], { unsupported: true }],
  ['oj-menu', 'action-menu', ['open-options'], [], [['on-oj-action', 'on-oj-action']], ['oj-option children'], { container: true }],
  ['oj-option', null, [], [], [], [], { child: true }],
  ['oj-validation-group', null, [], [], [], [], { child: true, gone: 'Kept as it is: it is not a visual component and works with the premium fields.' }]
];

const entries = E.map(([source, target, extra, changes, events, slots, o]) => {
  if (target && !ids.has(target)) { throw new Error(source + ': ' + target + ' is not in the catalogue'); }
  if (o.unsupported) {
    return { source: source, target: null, status: 'unsupported', unsupported: [source], manual: ['No premium component yet; the screen keeps the JET element.'], confidence: 'high', evidence: 'Not in the premium pack catalogue.' };
  }
  if (o.child || o.gone) {
    return { source: source, target: null, status: o.child ? 'direct-replacement' : 'property-mapping', manual: o.gone ? [o.gone] : [], confidence: 'high',
      evidence: o.child ? 'Kept as it is: a child or helper element the premium parent takes unchanged.' : 'Compared with the premium fields by hand.' };
  }
  const base = o.button ? ['disabled'] : o.container ? [] : FIELD.filter((p) => !(o.noField || []).includes(p));
  const same = [...new Set(base.concat(extra))].filter((p) => !changes.some((c) => c[0] === p));
  // A change with 'drop' as its fourth part is not carried over but loses nothing a person has to rebuild
  const properties = same.map((p) => ({ from: p, to: p })).concat(changes.map((c) => ({ from: c[0], to: c[1], conversion: c[2] })));
  const optional = new Set(changes.filter((c) => c[3] === 'drop').map((c) => c[0]));
  const evs = (o.button || o.container ? [] : FIELD_EVENTS.filter((e) => !(o.noField || []).includes('validators') || e !== 'on-valid-changed')).map((e) => ({ from: e, to: e }))
    .concat(events.map((e) => ({ from: e[0], to: e[1] })));
  const renamed = properties.some((p) => p.to && p.to !== p.from) || properties.some((p) => p.conversion && p.to) || optional.size > 0;
  const dropped = properties.some((p) => p.to === null && !optional.has(p.from));
  const status = o.status || (o.templates && dropped ? 'custom-transformation' : dropped ? 'manual-intervention' : renamed ? 'property-mapping' : 'direct-replacement');
  const entry = {
    source: source, target: target, status: status, properties: properties, events: evs,
    binding: 'The Knockout bindings stay as they are: value="{{x}}" and on-*="[[handler]]" keep their names on the premium element.',
    accessibility: o.a11y || (o.button ? 'A visible focus ring, a name from the label or aria-label, 44 px touch target.' : o.container ? 'Keyboard and screen reader behaviour as the JET element, in the pack design.' : A11Y_FIELD),
    styling: STYLE_TOKENS,
    slots: slots,
    confidence: 'medium',
    evidence: 'API compared by hand with the JET 6 to 19 element; no parity test yet.'
  };
  const manual = (o.manual || []).concat(properties.filter((p) => p.to === null && !optional.has(p.from)).map((p) => p.from + ': ' + p.conversion));
  if (manual.length) { entry.manual = manual; }
  if (properties.some((p) => p.to === null)) { entry.unsupported = properties.filter((p) => p.to === null).map((p) => p.from); }
  return entry;
});
const out = { $comment: 'How each Oracle JET element in the bank\u2019s code maps to the premium JET pack (bx- elements). Generated by gen-jet-mapping.js; the premium elements keep the JET attribute and event names, so what is listed under properties with the same from and to works unchanged. Statuses stay proposals (confidence medium) until a parity test is recorded.', target: 'jet-premium', packVersion: '0.1.0', entries: entries };
fs.mkdirSync(path.join(repo, 'target-packs/components/mapping'), { recursive: true });
fs.writeFileSync(path.join(repo, 'target-packs/components/mapping/jet-premium.json'), JSON.stringify(out, null, 2) + '\n');
const by = {};
entries.forEach((e) => { by[e.status] = (by[e.status] || 0) + 1; });
console.log(entries.length, 'entries', JSON.stringify(by));
