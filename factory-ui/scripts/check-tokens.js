// Fails the UI build when the stylesheet, views or view models use a CSS custom property (design token) that is
// never defined, which usually means a typo. JET's own --oj-* variables, and uses with a fallback such as
// var(--x, 12px), are allowed. Run: node scripts/check-tokens.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'src');
const files = [path.join(root, 'css', 'app.css')];
for (const dir of ['js/views', 'js/viewModels', 'js/components', 'js/services']) {
  const full = path.join(root, dir);
  fs.readdirSync(full).filter((f) => /\.(html|js)$/.test(f)).forEach((f) => files.push(path.join(full, f)));
}
// Properties set from script at run time (resizable panes, form columns)
const runtime = new Set(['--fx-pane', '--fx-form-columns']);

const defined = new Set(runtime);
const uses = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) { defined.add(m[1]); }
  for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*([,)])/g)) {
    if (m[2] === ',' || m[1].startsWith('--oj-')) { continue; }
    const line = text.slice(0, m.index).split('\n').length;
    uses.push({ name: m[1], where: path.relative(path.join(__dirname, '..'), file) + ':' + line });
  }
}
const missing = uses.filter((u) => !defined.has(u.name));
if (missing.length) {
  console.error('Undefined design tokens (define them in app.css or fix the name):');
  missing.forEach((u) => console.error('  ' + u.name + '  at ' + u.where));
  process.exit(1);
}
console.log('Design tokens: ' + uses.length + ' uses, all defined.');
