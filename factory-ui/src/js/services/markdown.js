/*
 * Markdown to DOM for answers: headings, paragraphs, lists, tables, quotes, code blocks (with a copy button), inline
 * code, bold, italics, links and citations ([2] links to source 2). The text is never parsed as HTML: every node is
 * built with createElement and textContent, so nothing a model writes can run or style the page. Unfinished Markdown
 * (an answer still being written) renders as far as it goes.
 */
define([], function () {
  const FENCE = /^\s*```\s*([\w+#.-]*)\s*$/;
  const LIST = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
  const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
  const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.textContent = text; }
    return e;
  }

  // Inline: `code`, **bold**, *italic* or _italic_, [text](https://...), [n] citations
  // (A new expression for each call: inline() calls itself for bold and italics, and a shared one would lose its place)
  const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)|(\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\))|(\[(\d{1,2})\])/;
  function inline(parent, text, opts) {
    const re = new RegExp(INLINE.source, 'g');
    let at = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > at) { parent.appendChild(document.createTextNode(text.slice(at, m.index))); }
      if (m[1]) {
        parent.appendChild(el('code', 'fx-md-inline', m[1].slice(1, -1)));
      } else if (m[2]) {
        const b = el('strong');
        inline(b, m[2].slice(2, -2), opts);
        parent.appendChild(b);
      } else if (m[3]) {
        const i = el('em');
        inline(i, m[3].slice(1, -1), opts);
        parent.appendChild(i);
      } else if (m[4]) {
        const a = el('a', null, m[4].slice(1, m[4].indexOf('](')));
        a.href = m[5];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        parent.appendChild(a);
      } else if (m[6]) {
        const n = Number(m[7]);
        if (opts.sources && n >= 1 && n <= opts.sources) {
          const a = el('a', 'fx-md-cite', String(n));
          a.href = '#' + opts.citePrefix + n;
          a.setAttribute('aria-label', 'Source ' + n);
          a.addEventListener('click', (e) => {
            const target = document.getElementById(opts.citePrefix + n);
            if (target) {
              e.preventDefault();
              target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              target.classList.add('is-flash');
              setTimeout(() => target.classList.remove('is-flash'), 1200);
            }
          });
          parent.appendChild(a);
        } else {
          parent.appendChild(document.createTextNode(m[6]));
        }
      }
      at = m.index + m[0].length;
    }
    if (at < text.length) { parent.appendChild(document.createTextNode(text.slice(at))); }
  }

  function copyButton(getText) {
    const b = el('button', 'fx-btn fx-btn--ghost fx-btn--sm fx-md-copy');
    b.type = 'button';
    b.appendChild(el('span', 'factory-nav-icon factory-ico-copy')).setAttribute('aria-hidden', 'true');
    b.appendChild(document.createTextNode('Copy'));
    b.addEventListener('click', () => {
      const done = () => { b.lastChild.textContent = 'Copied'; setTimeout(() => { b.lastChild.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard) { navigator.clipboard.writeText(getText()).then(done, () => {}); }
    });
    return b;
  }

  function cells(line) {
    let s = line.trim();
    if (s.startsWith('|')) { s = s.slice(1); }
    if (s.endsWith('|')) { s = s.slice(0, -1); }
    return s.split('|').map((c) => c.trim());
  }

  function table(rows, opts) {
    const wrap = el('div', 'fx-md-tablewrap');
    const t = el('table', 'fx-md-table');
    const head = el('thead');
    const tr = el('tr');
    cells(rows[0]).forEach((c) => { const th = el('th'); inline(th, c, opts); tr.appendChild(th); });
    head.appendChild(tr);
    t.appendChild(head);
    const body = el('tbody');
    rows.slice(2).forEach((r) => {
      const row = el('tr');
      cells(r).forEach((c) => { const td = el('td'); inline(td, c, opts); row.appendChild(td); });
      body.appendChild(row);
    });
    t.appendChild(body);
    wrap.appendChild(t);
    return wrap;
  }

  function list(lines, start, opts) {
    // One level of nesting: items indented more than the first belong to the item before them
    const first = LIST.exec(lines[start]);
    const indent = first[1].length;
    const ordered = /\d/.test(first[2]);
    const root = el(ordered ? 'ol' : 'ul', 'fx-md-list');
    if (ordered && parseInt(first[2], 10) > 1) { root.start = parseInt(first[2], 10); }
    let i = start;
    let item = null;
    while (i < lines.length) {
      const m = LIST.exec(lines[i]);
      if (m && m[1].length <= indent) {
        if (/\d/.test(m[2]) !== ordered) { break; }
        item = el('li');
        inline(item, m[3], opts);
        root.appendChild(item);
        i++;
      } else if (m && item) {
        const nested = list(lines, i, opts);
        item.appendChild(nested.node);
        i = nested.next;
      } else if (item && lines[i].trim() && /^\s{2,}/.test(lines[i])) {
        item.appendChild(document.createTextNode(' '));
        inline(item, lines[i].trim(), opts);
        i++;
      } else {
        break;
      }
    }
    return { node: root, next: i };
  }

  /**
   * Renders Markdown into container (its children are replaced).
   * @param opts.sources     how many sources there are: [n] up to it link to an element with id citePrefix + n
   * @param opts.citePrefix  the prefix of the sources' element ids
   */
  function render(container, markdown, opts) {
    const o = Object.assign({ sources: 0, citePrefix: 'src-' }, opts || {});
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const out = document.createDocumentFragment();
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const fence = FENCE.exec(line);
      if (fence) {
        const code = [];
        i++;
        while (i < lines.length && !FENCE.test(lines[i])) { code.push(lines[i]); i++; }
        i++;
        const text = code.join('\n');
        const box = el('div', 'fx-md-code');
        const head = el('div', 'fx-md-codehead');
        head.appendChild(el('span', 'fx-md-lang', fence[1] || 'text'));
        head.appendChild(copyButton(() => text));
        box.appendChild(head);
        const pre = el('pre');
        pre.appendChild(el('code', null, text));
        box.appendChild(pre);
        out.appendChild(box);
        continue;
      }
      if (!line.trim()) { i++; continue; }
      const h = HEADING.exec(line);
      if (h) {
        // Inside an answer card: ## is a section (h3), deeper ones h4
        const node = el(h[1].length <= 2 ? 'h3' : 'h4', 'fx-md-h');
        inline(node, h[2], o);
        out.appendChild(node);
        i++;
        continue;
      }
      if (line.trim().startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i]); i++; }
        out.appendChild(table(rows, o));
        continue;
      }
      if (LIST.test(line)) {
        const l = list(lines, i, o);
        out.appendChild(l.node);
        i = l.next;
        continue;
      }
      if (line.trim().startsWith('>')) {
        const q = el('blockquote', 'fx-md-quote');
        const text = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) { text.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
        inline(q, text.join(' '), o);
        out.appendChild(q);
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !HEADING.test(lines[i]) && !LIST.test(lines[i])
        && !lines[i].trim().startsWith('>') && !(lines[i].trim().startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]))) {
        para.push(lines[i].trim());
        i++;
      }
      const p = el('p');
      inline(p, para.join(' '), o);
      out.appendChild(p);
    }
    container.replaceChildren(out);
  }

  /** The answer as plain text, for copying: Markdown marks taken off, code kept. */
  function plain(markdown) {
    return String(markdown || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:])/g, '$1$2');
  }

  return { render: render, plain: plain, copyButton: copyButton };
});
