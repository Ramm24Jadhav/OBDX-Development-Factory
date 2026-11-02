/*
 * Simple client-side syntax colouring for every code viewer (Code, Changes, Knowledge Explorer): keywords, types,
 * strings, annotations, numbers, comments, tags and attributes. No library; it colours by pattern, line by line,
 * carrying block comments across lines. tokenize() returns [{text, css}] with css 'fx-syn-<kind>'; html() returns the
 * same line as escaped HTML. The colours are theme tokens in app.css (a page with a dark code pane sets its own).
 */
define([], function () {
  const KEYWORDS = {
    java: 'abstract assert boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new package private protected public return short static super switch synchronized this throw throws transient try void volatile while var record true false null',
    javascript: 'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return super switch this throw try typeof var void while yield true false null undefined define require',
    sql: 'select from where insert into update delete create replace table view index alter drop and or not null primary key foreign references values set join left right inner outer on group by order having as begin end procedure function trigger grant varchar varchar2 number integer date commit constraint default unique sequence'
  };
  const KW = {};
  Object.keys(KEYWORDS).forEach((k) => { KW[k] = {}; KEYWORDS[k].split(' ').forEach((w) => { KW[k][w] = true; }); });
  const C_RULES = [[/^\/\/.*/, 'com'], [/^"(?:\\.|[^"\\])*"?/, 'str'], [/^'(?:\\.|[^'\\])*'?/, 'str'], [/^`[^`]*`?/, 'str'],
    [/^@[A-Za-z_]\w*/, 'ann'], [/^\d[\d._]*[lLfFdD]?\b/, 'num'], [/^[A-Za-z_$][\w$]*/, 'word']];
  const RULES = {
    java: C_RULES,
    javascript: C_RULES,
    css: [[/^"[^"]*"?/, 'str'], [/^'[^']*'?/, 'str'], [/^#[\w-]+|^\.[\w-]+/, 'ann'], [/^\d[\d.]*\w*/, 'num']],
    html: [[/^\[\[[^\]]*\]\]/, 'ann'], [/^\{\{[^}]*\}\}/, 'ann'], [/^<\/?[\w:.-]+/, 'tag'], [/^\/?>/, 'tag'], [/^[\w:.-]+(?==)/, 'attr'], [/^"[^"]*"?/, 'str'], [/^'[^']*'?/, 'str']],
    sql: [[/^--.*/, 'com'], [/^'(?:''|[^'])*'?/, 'str'], [/^\d+(\.\d+)?/, 'num'], [/^[A-Za-z_][\w$#]*/, 'word']],
    properties: [[/^\s*[#!].*/, 'com'], [/^[^=:\s][^=:]*(?=[=:])/, 'attr']],
    plain: []
  };
  const BLOCK = { java: ['/*', '*/'], javascript: ['/*', '*/'], css: ['/*', '*/'], sql: ['/*', '*/'], html: ['<!--', '-->'] };

  /** The colouring rules to use for a file, from its extension or the index's language */
  function langOf(path, language) {
    const ext = ((path || '').split('.').pop() || '').toLowerCase();
    if (ext === 'java' || language === 'java') {
      return 'java';
    }
    if (/^(js|jsx|ts|tsx|json|mjs)$/.test(ext) || language === 'javascript' || language === 'typescript' || language === 'json') {
      return 'javascript';
    }
    if (/^(html|htm|xml|xhtml|jsp|vue|xsd|wsdl)$/.test(ext) || language === 'html' || language === 'xml' || language === 'jsp') {
      return 'html';
    }
    if (ext === 'sql' || language === 'sql') {
      return 'sql';
    }
    if (/^(css|scss|less)$/.test(ext) || language === 'css') {
      return 'css';
    }
    if (ext === 'properties' || language === 'properties') {
      return 'properties';
    }
    return 'plain';
  }

  /** One line as coloured tokens; state ({inBlock}) carries an open block comment to the next line. */
  function tokenize(text, lang, state) {
    const out = [];
    const push = (t, kind) => {
      if (!t) {
        return;
      }
      const last = out[out.length - 1];
      if (last && last.kind === kind) {
        last.text += t;
      } else {
        out.push({ text: t, kind: kind });
      }
    };
    const block = BLOCK[lang];
    const rules = RULES[lang] || [];
    let i = 0;
    while (i < text.length) {
      if (state.inBlock) {
        const end = text.indexOf(block[1], i);
        if (end < 0) {
          push(text.slice(i), 'com');
          break;
        }
        push(text.slice(i, end + block[1].length), 'com');
        i = end + block[1].length;
        state.inBlock = false;
        continue;
      }
      const rest = text.slice(i);
      if (block && rest.indexOf(block[0]) === 0) {
        state.inBlock = true;
        push(block[0], 'com');
        i += block[0].length;
        continue;
      }
      let matched = false;
      for (let r = 0; r < rules.length; r++) {
        const m = rules[r][0].exec(rest);
        if (m && m[0]) {
          let kind = rules[r][1];
          if (kind === 'word') {
            const words = KW[lang] || {};
            kind = words[lang === 'sql' ? m[0].toLowerCase() : m[0]] ? 'kw' : (lang === 'java' && /^[A-Z]/.test(m[0]) ? 'type' : '');
          }
          push(m[0], kind);
          i += m[0].length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        push(text.charAt(i), '');
        i += 1;
      }
    }
    return out.map((t) => ({ text: t.text, css: t.kind ? 'fx-syn-' + t.kind : '' }));
  }

  const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /** A fresh state for a file; pass the same one to every line of it in order. */
  const start = () => ({ inBlock: false });

  /** One line as escaped HTML with <span class="fx-syn-..."> around the coloured parts. */
  function html(text, lang, state) {
    return tokenize(text, lang, state).map((t) => (t.css ? '<span class="' + t.css + '">' + escape(t.text) + '</span>' : escape(t.text))).join('');
  }

  return { langOf: langOf, tokenize: tokenize, start: start, html: html, escape: escape };
});
