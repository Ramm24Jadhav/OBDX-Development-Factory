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

  /** A status pill (design system fx-badge, with a dot so status is not colour alone): tone is green, amber, red, blue, grey or violet. */
  const BADGE = { green: 'success', amber: 'warning', red: 'danger', blue: 'primary', violet: 'violet', grey: '' };
  function pill(text, tone) {
    const variant = BADGE[tone || 'grey'];
    return { text: text, css: 'fx-badge' + (variant ? ' fx-badge--' + variant : '') + ' factory-ov-pill-' + (tone || 'grey') };
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

  /**
   * A pager with a page size the person picks and numbered page buttons (design system .fx-pager):
   * {rows, page, pages, size, sizes, text, prev, next, numbers: [{label, css, go, current}], sizeChange}.
   */
  function pages(list, initialSize, sizes) {
    const size = ko.observable(initialSize || 10);
    const page = ko.observable(1);
    const count = ko.pureComputed(() => Math.max(1, Math.ceil(ko.unwrap(list).length / size())));
    const rows = ko.pureComputed(() => {
      if (page() > count()) {
        page(count());
      }
      return ko.unwrap(list).slice((page() - 1) * size(), page() * size());
    });
    const text = ko.pureComputed(() => {
      const total = ko.unwrap(list).length;
      return total === 0 ? 'Nothing to show' : 'Showing ' + ((page() - 1) * size() + 1) + ' to ' + Math.min(total, page() * size()) + ' of ' + total;
    });
    // At most seven buttons: first, last, the current page and its neighbours, with gaps as "…"
    const numbers = ko.pureComputed(() => {
      const n = count();
      const p = page();
      const wanted = [1, n, p - 1, p, p + 1].filter((x) => x >= 1 && x <= n);
      const list2 = Array.from(new Set(wanted)).sort((a, b) => a - b);
      const out = [];
      list2.forEach((x, i) => {
        if (i > 0 && x - list2[i - 1] > 1) {
          out.push({ label: '…', css: 'fx-pager-gap', go: () => null, current: false, gap: true });
        }
        out.push({ label: String(x), css: 'fx-pager-num' + (x === p ? ' is-current' : ''), go: () => page(x), current: x === p, gap: false });
      });
      return out;
    });
    return {
      rows: rows, page: page, pages: count, size: size, sizes: sizes || [10, 25, 50], text: text, numbers: numbers,
      canPrev: ko.pureComputed(() => page() > 1),
      canNext: ko.pureComputed(() => page() < count()),
      prev: () => page(Math.max(1, page() - 1)),
      next: () => page(Math.min(count(), page() + 1)),
      sizeChange: (event) => { size(Number(event.target.value) || 10); page(1); }
    };
  }

  /**
   * The dropdown half of a split button or a menu button (design system .fx-split / .fx-menu): open state, toggle,
   * close on Escape or an outside click, arrow keys between items. Bind the menu's keydown to `key`.
   */
  function menu() {
    const open = ko.observable(false);
    // JET event bindings pass (event, context); Knockout-style callers may pass (data, event)
    const eventOf = (a, b) => (a && typeof a.preventDefault === 'function' ? a : b);
    let root = null;
    const outside = (event) => { if (root && !root.contains(event.target)) { open(false); } };
    open.subscribe((value) => {
      if (value) {
        document.addEventListener('mousedown', outside, true);
      } else {
        document.removeEventListener('mousedown', outside, true);
      }
    });
    return {
      open: open,
      toggle: (a, b) => {
        const e = eventOf(a, b);
        const target = e ? (e.currentTarget || e.target) : null;
        root = target && target.closest ? target.closest('.fx-split, .fx-menu-wrap') : null;
        open(!open());
        if (open() && root) {
          window.setTimeout(() => { const first = root.querySelector('.fx-menu [role="menuitem"]:not([disabled])'); if (first) { first.focus(); } }, 0);
        }
      },
      close: () => open(false),
      key: (a, b) => {
        const e = eventOf(a, b);
        if (!e) {
          return true;
        }
        const items = root ? Array.from(root.querySelectorAll('.fx-menu [role="menuitem"]:not([disabled])')) : [];
        const at = items.indexOf(document.activeElement);
        if (e.key === 'Escape') {
          open(false);
          const toggleButton = root && root.querySelector('.fx-split-toggle, .fx-menu-toggle');
          if (toggleButton) { toggleButton.focus(); }
        } else if (e.key === 'ArrowDown' && items.length) {
          e.preventDefault();
          items[(at + 1) % items.length].focus();
        } else if (e.key === 'ArrowUp' && items.length) {
          e.preventDefault();
          items[(at - 1 + items.length) % items.length].focus();
        } else {
          return true;
        }
        return false;
      }
    };
  }

  /**
   * A horizontal carousel over a scrolling track (design system .fx-carousel). Call attach(element) once the view is
   * connected; prev/next scroll by one card, dots show the position. Arrow keys move when the track has focus.
   */
  function carousel() {
    const canPrev = ko.observable(false);
    const canNext = ko.observable(false);
    const position = ko.observable(0);
    const count = ko.observable(0);
    let track = null;
    let attached = false;
    const update = () => {
      if (!track) {
        return;
      }
      const max = track.scrollWidth - track.clientWidth;
      canPrev(track.scrollLeft > 2);
      canNext(track.scrollLeft < max - 2);
      // One dot per scroll stop: the cards that fit show together, so there are cards - visible + 1 stops
      const cards = track.children.length;
      const card = track.firstElementChild;
      const step = card ? card.getBoundingClientRect().width + 12 : track.clientWidth;
      const visible = Math.max(1, Math.floor((track.clientWidth + 12) / Math.max(1, step)));
      const stops = cards > 0 ? Math.max(1, cards - visible + 1) : 0;
      count(stops > 1 ? stops : 0);
      position(Math.min(Math.max(0, stops - 1), Math.round(track.scrollLeft / Math.max(1, step))));
    };
    const scroll = (dir) => {
      if (!track) {
        return;
      }
      const card = track.firstElementChild;
      const step = card ? card.getBoundingClientRect().width + 12 : track.clientWidth * 0.8;
      const smooth = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollBy({ left: dir * step, behavior: smooth ? 'smooth' : 'auto' });
    };
    const goTo = (index) => {
      if (!track) {
        return;
      }
      const card = track.firstElementChild;
      const step = card ? card.getBoundingClientRect().width + 12 : track.clientWidth;
      const smooth = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      track.scrollTo({ left: index * step, behavior: smooth ? 'smooth' : 'auto' });
    };
    return {
      canPrev: canPrev, canNext: canNext, position: position, count: count,
      // Dots are buttons: each one shows its stop
      dots: ko.pureComputed(() => Array.from({ length: count() }, (x, i) => ({
        css: 'fx-carousel-dot' + (i === position() ? ' is-current' : ''),
        label: 'Show from card ' + (i + 1),
        current: i === position() ? 'true' : null,
        go: () => goTo(i)
      }))),
      prev: () => scroll(-1),
      next: () => scroll(1),
      // element: the track, or its id. An id is looked up until the page has drawn it (up to 2 seconds), so a page
      // that renders late still gets a working carousel.
      attach: function attachTrack(element, tries) {
        track = typeof element === 'string' ? document.getElementById(element) : element;
        if (!track) {
          if (typeof element === 'string' && (tries || 0) < 40) { window.setTimeout(() => attachTrack(element, (tries || 0) + 1), 50); }
          return;
        }
        if (track.fxCarousel) {
          update();
          return;
        }
        track.fxCarousel = true;
        track.addEventListener('scroll', update, { passive: true });
        track.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); scroll(1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); scroll(-1); }
          if (e.key === 'Home') { e.preventDefault(); goTo(0); }
          if (e.key === 'End') { e.preventDefault(); goTo(track.children.length); }
        });
        if (!attached) {
          // The track also changes width when the menu collapses or a panel opens, not only with the window
          if (window.ResizeObserver) {
            new window.ResizeObserver(update).observe(track);
          } else {
            window.addEventListener('resize', update);
          }
          attached = true;
        }
        new MutationObserver(update).observe(track, { childList: true });
        window.setTimeout(update, 0);
      },
      refresh: update
    };
  }

  /*
   * One set of status categories for every page (draft, queued, in progress, needs review, warning, done, closed, failed) (requirements, designs, changes, jobs, runs, builds, checks), so the
   * same state always looks the same: the category gives the colour and the icon, the page keeps its own words.
   */
  const CATEGORY = {
    draft: { label: 'Draft', tone: '', icon: 'edit' },
    queued: { label: 'Queued', tone: '', icon: 'clock' },
    progress: { label: 'In progress', tone: 'primary', icon: 'refresh' },
    review: { label: 'Needs review', tone: 'warning', icon: 'eye' },
    warning: { label: 'Warning', tone: 'warning', icon: 'alert' },
    done: { label: 'Done', tone: 'success', icon: 'check' },
    closed: { label: 'Closed', tone: '', icon: 'x' },
    failed: { label: 'Failed', tone: 'danger', icon: 'alert' }
  };
  const STATUS_CATEGORY = {
    DRAFT: 'draft', PENDING: 'draft', NOT_CHECKED: 'draft', NEW: 'draft',
    QUEUED: 'queued',
    ANALYZING: 'progress', GENERATING: 'progress', BUILDING: 'progress', CHECKING: 'progress', PROCESSING: 'progress', RUNNING: 'progress', IMPORTING: 'progress', INDEXING: 'progress',
    PLAN_READY: 'review', READY: 'review', IN_REVIEW: 'review', GENERATED: 'review', WARNING: 'warning', UNSTABLE: 'warning',
    APPROVED: 'done', SUCCEEDED: 'done', SUCCESS: 'done', PASSED: 'done', DELIVERED: 'done', MERGED: 'done',
    CLOSED: 'closed', UNCHANGED: 'closed', ABANDONED: 'closed', CANCELLED: 'closed',
    FAILED: 'failed', FAILURE: 'failed', ERROR: 'failed', ABORTED: 'closed'
  };
  /** {text, css, icon, iconCss, category, categoryLabel} for a server status; text defaults to the status in words. */
  function status(raw, text) {
    const key = String(raw || '').toUpperCase();
    const cat = STATUS_CATEGORY[key] || 'draft';
    const c = CATEGORY[cat];
    const words = text || (key ? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ') : '–');
    return {
      text: words, category: cat, categoryLabel: c.label, icon: c.icon,
      css: 'fx-badge fx-badge--plain fx-status' + (c.tone ? ' fx-badge--' + c.tone : ''),
      iconCss: 'factory-nav-icon factory-ico-' + c.icon + (cat === 'progress' ? ' fx-status-spin' : '')
    };
  }

  /*
   * Keyboard for list tables (Linear-style): ↑/↓ or J/K move a cursor row, Enter opens it, X selects it.
   * rows: observable list; options: {open(row), toggle(row)}. Bind the table's keydown to `key`; mark the cursor row
   * with `cursor()` (its index) and give rows tabindex so focus can land on them.
   */
  function tableKeys(rows, options) {
    const cursor = ko.observable(-1);
    const move = (d, table) => {
      const n = ko.unwrap(rows).length;
      if (!n) { return; }
      cursor(Math.max(0, Math.min(n - 1, (cursor() < 0 ? (d > 0 ? -1 : n) : cursor()) + d)));
      window.setTimeout(() => { const tr = table && table.querySelectorAll('tbody tr')[cursor()]; if (tr && tr.focus) { tr.focus(); } }, 0);
    };
    return {
      cursor: cursor,
      key: (a, b) => {
        const e = a && typeof a.preventDefault === 'function' ? a : b;
        if (!e || (e.target && /^(input|textarea|select|button)$/i.test(e.target.tagName) && e.key !== 'Escape')) { return true; }
        const table = e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest('table') || e.currentTarget : null;
        const row = ko.unwrap(rows)[cursor()];
        if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); move(1, table); }
        else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); move(-1, table); }
        else if (e.key === 'Enter' && row && options && options.open) { e.preventDefault(); options.open(row); }
        else if ((e.key === 'x' || e.key === ' ') && row && options && options.toggle) { e.preventDefault(); options.toggle(row); }
        return true;
      }
    };
  }

  /** A stable avatar colour class for a name (fx-avatar--1 … --8). */
  function avatarTone(name) {
    let hash = 0;
    String(name || '').split('').forEach((c) => { hash = (hash * 31 + c.charCodeAt(0)) >>> 0; });
    return 'fx-avatar fx-avatar--' + (hash % 8 + 1);
  }

  /** Copies text and resolves when done (falls back to a hidden text area). */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('Copy is not allowed here')); } catch (e) { reject(e); }
      area.remove();
    });
  }

  /** Short date and time, for tables. */
  function when(value) {
    return value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: preferences.hour12() }) : '';
  }

  return {
    tabs: tabs, pill: pill, initials: initials, value: value, checked: checked, pager: pager, when: when,
    badge: pill, status: status, tableKeys: tableKeys, pages: pages, menu: menu, carousel: carousel, avatarTone: avatarTone, copy: copy
  };
});
