/*
 * Light syntax highlighting for the code a change writes: Java, JavaScript and TypeScript, HTML and XML, SQL, CSS,
 * JSON and properties files. Lines are coloured one after another so a comment or string that spans lines keeps its
 * colour. The result is escaped HTML with <span class="factory-hl-..."> around keywords, strings, comments, numbers
 * and tags; anything not recognised stays plain text.
 */
define([], function () {
  const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const span = (kind, text) => '<span class="factory-hl-' + kind + '">' + escape(text) + '</span>';
  const words = (list) => new Set(list.split(' '));
  const KEYWORDS = {
    java: words('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float '
      + 'for if implements import instanceof int interface long native new package private protected public return short static strictfp super '
      + 'switch synchronized this throw throws transient try void volatile while var record true false null'),
    js: words('async await break case catch class const continue debugger default delete do else export extends finally for function if import '
      + 'in instanceof let new return super switch this throw try typeof var void while with yield true false null undefined define require'),
    sql: words('select from where insert into values update set delete create table alter add drop index view and or not null is in exists '
      + 'join left right inner outer on group by order having union all distinct as primary key foreign references default constraint '
      + 'varchar varchar2 number integer char date timestamp commit begin end grant')
  };
  KEYWORDS.ts = KEYWORDS.js;

  /** The language of a path, from its extension: java, js, ts, html, sql, css, json, properties or text. */
  const languageOf = (path) => {
    const ext = (/\.([a-z0-9]+)$/i.exec(path || '') || [])[1];
    const map = { java: 'java', js: 'js', mjs: 'js', jsx: 'js', ts: 'ts', tsx: 'ts', html: 'html', htm: 'html', xml: 'html', xhtml: 'html',
      sql: 'sql', css: 'css', json: 'json', properties: 'properties' };
    return map[(ext || '').toLowerCase()] || 'text';
  };

  /** One line of C-like code (Java, JavaScript, TypeScript, CSS, JSON, SQL); state.comment carries an open block comment. */
  const codeLine = (line, lang, state) => {
    const keywords = KEYWORDS[lang] || null;
    const lineComment = lang === 'sql' ? '--' : lang === 'css' ? null : '//';
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (state.comment) {
        const end = line.indexOf('*/', i);
        const stop = end < 0 ? line.length : end + 2;
        out += span('comment', line.slice(i, stop));
        state.comment = end < 0;
        i = stop;
        continue;
      }
      const rest = line.slice(i);
      if (rest.startsWith('/*')) {
        state.comment = true;
        continue;
      }
      if (lineComment && rest.startsWith(lineComment)) {
        out += span('comment', rest);
        break;
      }
      const quote = rest.charAt(0);
      if (quote === '"' || quote === '\'' || (quote === '`' && lang !== 'sql')) {
        let j = 1;
        while (j < rest.length && rest.charAt(j) !== quote) {
          j += rest.charAt(j) === '\\' ? 2 : 1;
        }
        out += span('string', rest.slice(0, j + 1));
        i += j + 1;
        continue;
      }
      const number = /^\d[\d_.]*[a-zA-Z]?/.exec(rest);
      if (number && !/[\w$]/.test(line.charAt(i - 1) || '')) {
        out += span('number', number[0]);
        i += number[0].length;
        continue;
      }
      const word = /^[A-Za-z_$][\w$]*/.exec(rest);
      if (word) {
        const w = word[0];
        const known = keywords && keywords.has(lang === 'sql' ? w.toLowerCase() : w);
        out += known ? span('keyword', w) : rest.charAt(0) === '@' ? span('keyword', w) : escape(w);
        i += w.length;
        continue;
      }
      if (rest.charAt(0) === '@' && /^@[A-Za-z]/.test(rest)) {
        const annotation = /^@[\w.]+/.exec(rest)[0];
        out += span('keyword', annotation);
        i += annotation.length;
        continue;
      }
      out += escape(rest.charAt(0));
      i++;
    }
    return out;
  };

  /** One line of HTML or XML; state.comment carries an open <!-- comment. */
  const markupLine = (line, state) => {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (state.comment) {
        const end = line.indexOf('-->', i);
        const stop = end < 0 ? line.length : end + 3;
        out += span('comment', line.slice(i, stop));
        state.comment = end < 0;
        i = stop;
        continue;
      }
      const rest = line.slice(i);
      if (rest.startsWith('<!--')) {
        state.comment = true;
        continue;
      }
      const tag = /^<\/?[A-Za-z][\w:-]*/.exec(rest);
      if (tag) {
        out += span('tag', tag[0]);
        i += tag[0].length;
        // attributes up to the end of the tag (or the line)
        while (i < line.length && line.charAt(i) !== '>') {
          const attr = /^\s+[^\s=>/]+/.exec(line.slice(i));
          const value = /^=\s*("[^"]*"?|'[^']*'?)/.exec(line.slice(i));
          if (attr) {
            out += escape(attr[0].replace(/\S+$/, '')) + span('attr', attr[0].trim());
            i += attr[0].length;
          } else if (value) {
            out += '=' + span('string', value[1]);
            i += value[0].length;
          } else {
            out += escape(line.charAt(i));
            i++;
          }
        }
        continue;
      }
      out += escape(rest.charAt(0));
      i++;
    }
    return out;
  };

  /** A fresh state for a file; pass the same one to every line of it in order. */
  const start = () => ({ comment: false });

  /** One line as highlighted HTML (escaped). */
  const line = (text, lang, state) => {
    if (lang === 'html') {
      return markupLine(text, state);
    }
    if (lang === 'properties') {
      return /^\s*[#!]/.test(text) ? span('comment', text) : text.replace(/^([^=:]*)([=:]?)(.*)$/, (m, key, sep, value) => span('attr', key) + escape(sep) + escape(value));
    }
    if (lang === 'text') {
      return escape(text);
    }
    return codeLine(text, lang, state);
  };

  return { languageOf: languageOf, start: start, line: line, escape: escape };
});
