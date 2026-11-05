/*
 * The design system's chart parts beyond the ring: <fx-bar-chart> (stacked bars, counts by state over time),
 * <fx-timeline-chart> (planned weeks per row, with a Today line) and <fx-dep-graph> (which item needs which, laid out
 * in columns so lines go left to right). Built from the --fx-* tokens; each has a text summary and a table form, state
 * is always written in words as well as colour, and the bars and nodes move with the arrow keys.
 */
define(['knockout', 'ojs/ojcomposite', 'ojs/ojknockout'], function (ko, Composite) {
  let seq = 0;
  /** A style string (a:b;c:d) as the object JET's :style binding takes. */
  const sx = (s) => { const o = {}; String(s).split(';').forEach((p) => { const i = p.indexOf(':'); if (i > 0) { o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); } }); return o; };
  const nextId = (p) => p + '-' + (++seq);
  /** The colour of a state (done, warning, failed, delivered, in-progress, planned, not-started, info). */
  const TONE = {
    done: 'var(--fx-primary)', warning: 'var(--fx-warning)', failed: 'var(--fx-danger)', success: 'var(--fx-success)',
    delivered: 'var(--fx-success)', 'in-progress': 'var(--fx-info)', planned: 'var(--fx-primary)', 'not-started': 'var(--fx-border-strong)',
    info: 'var(--fx-info)', muted: 'var(--fx-border-strong)'
  };
  const tone = (t) => TONE[t] || t || 'var(--fx-primary)';
  /** Moves focus among the elements matching selector inside root with the arrow keys, Home and End. */
  const arrows = (root, selector) => (vm, e) => {
    const items = Array.from(root.querySelectorAll(selector));
    const i = items.indexOf(document.activeElement);
    if (i < 0) { return true; }
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { next = Math.min(items.length - 1, i + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { next = Math.max(0, i - 1); }
    if (e.key === 'Home') { next = 0; }
    if (e.key === 'End') { next = items.length - 1; }
    if (next < 0) { return true; }
    e.preventDefault();
    items[next].focus();
    return false;
  };

  /* ---------- fx-bar-chart: stacked bars, one per period, segments by state ---------- */
  class BarModel {
    constructor(c) {
      this.props = c.properties;
      this.element = c.element;
      this.id = nextId('fx-bars');
      this.asTable = ko.observable(false);
      this.toggle = () => this.asTable(!this.asTable());
      this.toggleText = ko.pureComputed(() => (this.asTable() ? 'Show as a chart' : 'Show as a table'));
      this.focused = ko.observable(-1);
      const series = () => (this.props.series || []).map((s) => ({ key: s.key, label: s.label, color: tone(s.tone || s.key) }));
      const bars = () => this.props.bars || [];
      this.legend = ko.pureComputed(() => series().map((s) => ({ label: s.label, style: sx('background:' + s.color) })));
      this.max = ko.pureComputed(() => Math.max(1, ...bars().map((b) => series().reduce((n, s) => n + (Number((b.values || {})[s.key]) || 0), 0))));
      // Whole-number ticks from 0: at most five
      this.ticks = ko.pureComputed(() => {
        const max = this.max();
        const step = Math.max(1, Math.ceil(max / 4));
        const top = step * Math.ceil(max / step);
        const out = [];
        for (let v = top; v >= 0; v -= step) { out.push({ label: String(v), style: sx('bottom:' + (v / top * 100) + '%') }); }
        return { top: top, list: out };
      });
      this.rows = ko.pureComputed(() => {
        const top = this.ticks().top;
        return bars().map((b, i) => {
          const parts = series().map((s) => ({ s: s, n: Number((b.values || {})[s.key]) || 0 }));
          const total = parts.reduce((n, p) => n + p.n, 0);
          const words = b.label + ': ' + (total === 0 ? 'none' : parts.filter((p) => p.n > 0).map((p) => p.n + ' ' + p.s.label.toLowerCase()).join(', '));
          return {
            label: b.label, words: words, total: total, index: i,
            barStyle: sx('height:' + (total / top * 100) + '%'),
            segments: parts.filter((p) => p.n > 0).map((p) => ({ style: sx('flex:' + p.n + ' 1 0;background:' + p.s.color), title: p.n + ' ' + p.s.label })),
            cells: parts.map((p) => String(p.n)),
            tip: ko.pureComputed(() => this.focused() === i),
            focus: () => { this.focused(i); return true; },
            blur: () => { if (this.focused() === i) { this.focused(-1); } return true; }
          };
        });
      });
      this.headers = ko.pureComputed(() => series().map((s) => s.label));
      this.summary = ko.pureComputed(() => this.props.summary || ((this.props.label || 'Bar chart') + ', ' + bars().length + ' bars'));
      this.onKey = arrows(this.element, '.fx-bar-col');
    }
  }
  Composite.register('fx-bar-chart', {
    view: '<figure class="fx-chart fx-bar-chart">'
      + '<oj-bind-if test="[[$properties.label]]"><figcaption class="fx-chart-title"><oj-bind-text value="[[$properties.label]]"></oj-bind-text></figcaption></oj-bind-if>'
      + '<ul class="fx-chart-legend"><oj-bind-for-each data="[[legend]]" as="l"><template><li><i :style="[[l.data.style]]" aria-hidden="true"></i><oj-bind-text value="[[l.data.label]]"></oj-bind-text></li></template></oj-bind-for-each></ul>'
      + '<oj-bind-if test="[[!asTable()]]"><div class="fx-bar-plot" role="img" :aria-label="[[summary]]">'
      + '<div class="fx-bar-axis" aria-hidden="true"><oj-bind-for-each data="[[ticks().list]]" as="t"><template><span :style="[[t.data.style]]"><oj-bind-text value="[[t.data.label]]"></oj-bind-text></span></template></oj-bind-for-each></div>'
      + '<div class="fx-bar-cols" on-keydown="[[onKey]]"><oj-bind-for-each data="[[rows]]" as="r"><template>'
      + '<div class="fx-bar-col" tabindex="0" :aria-label="[[r.data.words]]" on-focusin="[[r.data.focus]]" on-focusout="[[r.data.blur]]" on-mouseenter="[[r.data.focus]]" on-mouseleave="[[r.data.blur]]">'
      + '<div class="fx-bar-stack" :style="[[r.data.barStyle]]"><oj-bind-for-each data="[[r.data.segments]]" as="s"><template><i :style="[[s.data.style]]"></i></template></oj-bind-for-each></div>'
      + '<span class="fx-bar-label"><oj-bind-text value="[[r.data.label]]"></oj-bind-text></span>'
      + '<oj-bind-if test="[[r.data.tip()]]"><span class="fx-chart-tip" role="presentation"><oj-bind-text value="[[r.data.words]]"></oj-bind-text></span></oj-bind-if>'
      + '</div></template></oj-bind-for-each></div></div></oj-bind-if>'
      + '<oj-bind-if test="[[asTable()]]"><table class="fx-table fx-chart-table"><thead><tr><th scope="col"><oj-bind-text value="[[$properties.periodLabel || \'Period\']]"></oj-bind-text></th>'
      + '<oj-bind-for-each data="[[headers]]" as="h"><template><th scope="col"><oj-bind-text value="[[h.data]]"></oj-bind-text></th></template></oj-bind-for-each></tr></thead>'
      + '<tbody><oj-bind-for-each data="[[rows]]" as="r"><template><tr><th scope="row"><oj-bind-text value="[[r.data.label]]"></oj-bind-text></th>'
      + '<oj-bind-for-each data="[[r.data.cells]]" as="c"><template><td class="fx-num"><oj-bind-text value="[[c.data]]"></oj-bind-text></td></template></oj-bind-for-each></tr></template></oj-bind-for-each></tbody></table></oj-bind-if>'
      + '<button type="button" class="fx-btn fx-btn--link fx-btn--sm fx-chart-switch" on-click="[[toggle]]"><oj-bind-text value="[[toggleText]]"></oj-bind-text></button></figure>',
    viewModel: BarModel,
    metadata: { properties: { label: { type: 'string', value: '' }, summary: { type: 'string', value: '' }, periodLabel: { type: 'string', value: '' },
      series: { type: 'array', value: [] }, bars: { type: 'array', value: [] } } }
  });

  /* ---------- fx-timeline-chart: planned weeks per row, coloured by state, with a Today line ---------- */
  const STATE_WORDS = { delivered: 'delivered', 'in-progress': 'in progress', planned: 'planned', 'not-started': 'not started' };
  class TimelineModel {
    constructor(c) {
      this.props = c.properties;
      this.element = c.element;
      // The span shown: weeks 1..total, or grouped by four into months
      this.total = ko.pureComputed(() => Math.max(1, Number(this.props.total) || Math.max(1, ...(this.props.rows || []).map((r) => Number(r.to) || 1))));
      this.months = ko.pureComputed(() => this.props.scale === 'months');
      this.scaleCells = ko.pureComputed(() => {
        const total = this.total();
        const unit = this.months() ? 4 : 1;
        const out = [];
        for (let w = 1; w <= total; w += unit) {
          out.push({ label: this.months() ? 'Month ' + (Math.floor((w - 1) / 4) + 1) : 'W' + w, style: sx('left:' + ((w - 1) / total * 100) + '%;width:' + (Math.min(unit, total - w + 1) / total * 100) + '%') });
        }
        return out;
      });
      this.today = ko.pureComputed(() => {
        const t = Number(this.props.today);
        return t > 0 && t <= this.total() + 1 ? { style: sx('left:' + ((t - 1) / this.total() * 100) + '%'), label: 'Today, week ' + t } : null;
      });
      this.rows = ko.pureComputed(() => (this.props.rows || []).map((r) => {
        const from = Math.max(1, Number(r.from) || 1);
        const to = Math.max(from, Number(r.to) || from);
        const state = r.state || 'not-started';
        const words = r.label + ', planned week' + (from === to ? ' ' + from : 's ' + from + ' to ' + to) + ', ' + (STATE_WORDS[state] || state);
        return {
          label: r.label, words: words, stateText: STATE_WORDS[state] || state, stateCss: 'fx-tl-state is-' + state,
          barStyle: sx('left:' + ((from - 1) / this.total() * 100) + '%;width:' + ((to - from + 1) / this.total() * 100) + '%;background:' + tone(state)),
          weeks: from === to ? 'W' + from : 'W' + from + '–' + to,
          now: this.today() ? this.today().style : null
        };
      }));
    }
  }
  Composite.register('fx-timeline-chart', {
    view: '<figure class="fx-chart fx-timeline-chart">'
      + '<oj-bind-if test="[[$properties.label]]"><figcaption class="fx-chart-title"><oj-bind-text value="[[$properties.label]]"></oj-bind-text></figcaption></oj-bind-if>'
      + '<div class="fx-tl-grid"><div class="fx-tl-head" aria-hidden="true"><span></span><div class="fx-tl-scale"><oj-bind-for-each data="[[scaleCells]]" as="s"><template><span :style="[[s.data.style]]"><oj-bind-text value="[[s.data.label]]"></oj-bind-text></span></template></oj-bind-for-each><oj-bind-if test="[[today()]]"><b class="fx-tl-today-label" :style="[[today().style]]"><oj-bind-text value="[[today().label]]"></oj-bind-text></b></oj-bind-if></div><span></span></div>'
      + '<ul class="fx-tl-rows"><oj-bind-for-each data="[[rows]]" as="r"><template><li :aria-label="[[r.data.words]]"><span class="fx-tl-name"><oj-bind-text value="[[r.data.label]]"></oj-bind-text></span>'
      + '<span class="fx-tl-track" aria-hidden="true"><i :style="[[r.data.barStyle]]"><oj-bind-text value="[[r.data.weeks]]"></oj-bind-text></i><oj-bind-if test="[[r.data.now]]"><b class="fx-tl-now" :style="[[r.data.now]]"></b></oj-bind-if></span>'
      + '<span :class="[[r.data.stateCss]]"><oj-bind-text value="[[r.data.stateText]]"></oj-bind-text></span></li></template></oj-bind-for-each></ul>'
      + '</div></figure>',
    viewModel: TimelineModel,
    metadata: { properties: { label: { type: 'string', value: '' }, rows: { type: 'array', value: [] }, total: { type: 'number', value: 0 },
      today: { type: 'number', value: 0 }, scale: { type: 'string', value: 'weeks' } } }
  });

  /* ---------- fx-dep-graph: nodes in columns by what they need; lines left to right ---------- */
  const NODE_W = 140;
  const NODE_H = 36;
  const COL_GAP = 56;
  const ROW_GAP = 14;
  /** Columns: an item with no needs is in column 0, otherwise one past the furthest item it needs (cycles stop at the item count). */
  const layout = (nodes, edges) => {
    const ids = nodes.map((n) => n.id);
    const needs = {};
    ids.forEach((id) => { needs[id] = []; });
    edges.forEach((e) => { if (needs[e.from] && needs[e.to] !== undefined && e.from !== e.to) { needs[e.from].push(e.to); } });
    const depth = {};
    const visit = (id, guard) => {
      if (depth[id] !== undefined) { return depth[id]; }
      if (guard > ids.length) { return 0; }
      depth[id] = 0;
      const d = needs[id].length ? 1 + Math.max(...needs[id].map((x) => visit(x, guard + 1))) : 0;
      depth[id] = d;
      return d;
    };
    ids.forEach((id) => visit(id, 0));
    const cols = [];
    nodes.forEach((n) => { (cols[depth[n.id]] = cols[depth[n.id]] || []).push(n); });
    const pos = {};
    cols.forEach((col, x) => (col || []).forEach((n, y) => { pos[n.id] = { x: x * (NODE_W + COL_GAP), y: y * (NODE_H + ROW_GAP) }; }));
    return { pos: pos, cols: cols.length, rows: Math.max(1, ...cols.map((c) => (c || []).length)) };
  };
  class DepModel {
    constructor(c) {
      this.props = c.properties;
      this.element = c.element;
      this.layout = ko.pureComputed(() => layout(this.props.nodes || [], this.props.edges || []));
      this.size = ko.pureComputed(() => {
        const l = this.layout();
        return { w: Math.max(NODE_W, l.cols * NODE_W + (l.cols - 1) * COL_GAP), h: l.rows * NODE_H + (l.rows - 1) * ROW_GAP };
      });
      this.boxStyle = ko.pureComputed(() => sx('width:' + this.size().w + 'px;height:' + this.size().h + 'px'));
      this.viewBox = ko.pureComputed(() => '0 0 ' + this.size().w + ' ' + this.size().h);
      const name = (id) => ((this.props.nodes || []).find((n) => n.id === id) || { label: id }).label;
      this.nodes = ko.pureComputed(() => {
        const sel = this.props.selected;
        const edges = this.props.edges || [];
        return (this.props.nodes || []).map((n) => {
          const p = this.layout().pos[n.id] || { x: 0, y: 0 };
          const needs = edges.filter((e) => e.from === n.id).map((e) => name(e.to));
          const neededBy = edges.filter((e) => e.to === n.id).map((e) => name(e.from));
          const on = sel === n.id;
          const related = sel && !on && edges.some((e) => (e.from === sel && e.to === n.id) || (e.to === sel && e.from === n.id));
          return {
            label: n.label, css: 'fx-dep-node' + (on ? ' is-selected' : related ? ' is-related' : '') + (n.state ? ' is-' + n.state : ''),
            style: sx('left:' + p.x + 'px;top:' + p.y + 'px;width:' + NODE_W + 'px;height:' + NODE_H + 'px'),
            pressed: on ? 'true' : 'false',
            words: n.label + (needs.length ? ', needs ' + needs.join(', ') : ', needs nothing') + (neededBy.length ? ', needed by ' + neededBy.join(', ') : ''),
            pick: () => { this.props.selected = on ? '' : n.id; }
          };
        });
      });
      this.lines = ko.pureComputed(() => {
        const pos = this.layout().pos;
        const sel = this.props.selected;
        return (this.props.edges || []).filter((e) => pos[e.from] && pos[e.to] && e.from !== e.to).map((e) => {
          // From the needed item's right edge to the needing item's left edge
          const a = pos[e.to];
          const b = pos[e.from];
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x;
          const y2 = b.y + NODE_H / 2;
          const mid = (x1 + x2) / 2;
          const needs = sel && e.from === sel;
          const neededBy = sel && e.to === sel;
          return { d: 'M' + x1 + ' ' + y1 + ' C' + mid + ' ' + y1 + ', ' + mid + ' ' + y2 + ', ' + x2 + ' ' + y2, kind: needs ? 'needs' : neededBy ? 'neededBy' : 'other' };
        });
      });
      // One path per kind of line: SVG cannot hold a JET loop
      const join = (kind) => ko.pureComputed(() => this.lines().filter((l) => l.kind === kind).map((l) => l.d).join(' ') || 'M0 0');
      this.otherPath = join('other');
      this.needsPath = join('needs');
      this.neededByPath = join('neededBy');
      this.otherCss = ko.pureComputed(() => 'fx-dep-line' + (this.props.selected ? ' is-faint' : ''));
      this.rows = ko.pureComputed(() => this.nodes().map((n) => n.words));
      this.asTable = ko.observable(false);
      this.toggle = () => this.asTable(!this.asTable());
      this.toggleText = ko.pureComputed(() => (this.asTable() ? 'Show as a diagram' : 'Show as a list'));
      this.onKey = arrows(this.element, '.fx-dep-node');
    }
  }
  Composite.register('fx-dep-graph', {
    view: '<figure class="fx-chart fx-dep-graph">'
      + '<oj-bind-if test="[[$properties.label]]"><figcaption class="fx-chart-title"><oj-bind-text value="[[$properties.label]]"></oj-bind-text></figcaption></oj-bind-if>'
      + '<ul class="fx-chart-legend"><li><i class="fx-dep-key" aria-hidden="true"></i>needs</li><li><i class="fx-dep-key is-dashed" aria-hidden="true"></i>needed by</li></ul>'
      + '<oj-bind-if test="[[!asTable()]]"><div class="fx-dep-scroll"><div class="fx-dep-box" :style="[[boxStyle]]" on-keydown="[[onKey]]">'
      + '<svg class="fx-dep-svg" :viewBox="[[viewBox]]" aria-hidden="true" focusable="false"><path :d="[[otherPath]]" :class="[[otherCss]]"></path><path :d="[[neededByPath]]" class="fx-dep-line is-needed-by"></path><path :d="[[needsPath]]" class="fx-dep-line is-needs"></path></svg>'
      + '<oj-bind-for-each data="[[nodes]]" as="n"><template><button type="button" :class="[[n.data.css]]" :style="[[n.data.style]]" :aria-pressed="[[n.data.pressed]]" :aria-label="[[n.data.words]]" on-click="[[n.data.pick]]"><oj-bind-text value="[[n.data.label]]"></oj-bind-text></button></template></oj-bind-for-each>'
      + '</div></div></oj-bind-if>'
      + '<oj-bind-if test="[[asTable()]]"><ul class="fx-dep-list"><oj-bind-for-each data="[[rows]]" as="r"><template><li><oj-bind-text value="[[r.data]]"></oj-bind-text></li></template></oj-bind-for-each></ul></oj-bind-if>'
      + '<button type="button" class="fx-btn fx-btn--link fx-btn--sm fx-chart-switch" on-click="[[toggle]]"><oj-bind-text value="[[toggleText]]"></oj-bind-text></button></figure>',
    viewModel: DepModel,
    metadata: { properties: { label: { type: 'string', value: '' }, nodes: { type: 'array', value: [] }, edges: { type: 'array', value: [] },
      selected: { type: 'string', writeback: true, value: '' } } }
  });

  return { tone: tone };
});
