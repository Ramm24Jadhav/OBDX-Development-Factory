/*
 * Small helpers the redesigned pages share: tab bars, status pills, initials and input handlers for plain HTML
 * controls. Nothing here talks to the server.
 */
define(['knockout', './preferences'], function (ko, preferences) {
  /** Tab bar items for an observable holding the selected value. Each tab: {value, label, icon?, count?}. */
  function tabs(selected, list) {
    return list.map((t) => Object.assign({}, t, {
      css: ko.pureComputed(() => 'factory-tab' + (selected() === t.value ? ' factory-tab-on' : '')),
      selected: ko.pureComputed(() => selected() === t.value),
      iconClass: t.icon ? 'factory-nav-icon factory-ico-' + t.icon : '',
      text: ko.pureComputed(() => t.label + (t.count ? ' (' + ko.unwrap(t.count) + ')' : '')),
      pick: () => selected(t.value)
    }));
  }

  /** A status pill: tone is green, amber, red, blue, grey or violet. */
  function pill(text, tone) {
    return { text: text, css: 'factory-ov-pill factory-ov-pill-' + (tone || 'grey') };
  }

  function initials(name) {
    return (name || '?').split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';
  }

  /** Handlers that copy a plain input's value or a checkbox's state into an observable. */
  const value = (observable) => (event) => observable(event.target.value);
  const checked = (observable) => (event) => observable(event.target.checked);

  /** Pages of a list: {rows, page, pages, text, prev, next} for page size n. */
  function pager(list, size) {
    const page = ko.observable(1);
    const pages = ko.pureComputed(() => Math.max(1, Math.ceil(ko.unwrap(list).length / size)));
    const rows = ko.pureComputed(() => {
      if (page() > pages()) {
        page(pages());
      }
      return ko.unwrap(list).slice((page() - 1) * size, page() * size);
    });
    const text = ko.pureComputed(() => {
      const total = ko.unwrap(list).length;
      return total === 0 ? 'Nothing to show' : 'Showing ' + ((page() - 1) * size + 1) + ' to ' + Math.min(total, page() * size) + ' of ' + total;
    });
    return {
      rows: rows, page: page, pages: pages, text: text,
      prev: () => page(Math.max(1, page() - 1)),
      next: () => page(Math.min(pages(), page() + 1))
    };
  }

  /** Short date and time, for tables. */
  function when(value) {
    return value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: preferences.hour12() }) : '';
  }

  return { tabs: tabs, pill: pill, initials: initials, value: value, checked: checked, pager: pager, when: when };
});
