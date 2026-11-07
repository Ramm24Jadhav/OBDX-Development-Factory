// Applies a web catalogue handoff (handoff/W<n>.md) to the files only the main session writes: the three galleries,
// their state, the catalogue's api and builtOn blocks, the gate spec's group list and PackFiles. Targeted edits only.
//   node tools/progress/apply-handoff.mjs W1 [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [item, flag] = process.argv.slice(2);
const dry = flag === '--dry';
const md = fs.readFileSync(path.join(root, 'handoff', item + '.md'), 'utf8').replace(/\r\n/g, '\n');
const blocks = [...md.matchAll(/```(\w+)\n([\s\S]*?)\n```/g)].map((m) => ({ lang: m[1], body: m[2], at: m.index }));
const after = (marker) => { const i = md.indexOf(marker); if (i < 0) { throw new Error(item + ': no "' + marker + '"'); } return blocks.find((b) => b.at > i); };
const line = (prefix) => { const m = md.match(new RegExp('^' + prefix.replace(/[()]/g, '\\$&') + '[^`]*`([^`]+)`', 'm')); return m && !/^\(.*\)$/.test(m[1].trim()) ? m[1] : null; }; // a note in brackets ("(literal values)") adds nothing
// The plain values the JET model gives for "(a, b and c as in the JET model)"
const fromJetModel = (text) => ((text.match(/\(([^)]*) as in the JET model\)/) || [])[1] || '').split(/,| and /).map((x) => x.trim()).filter(Boolean)
  .map((name) => { const m = jetModel && jetModel.match(new RegExp('\\b' + name + ': (\\[[\\s\\S]*?\\])(?=, \\w+:|$)')); return m ? [name, m[1]] : null; }).filter(Boolean);
// Drops a declaration whose name the gallery already has (two groups can name the same piece of state)
const fresh = (s, stmts, declared) => stmts.filter((x) => { const n = (x.match(/^const \[(\w+),|^const (\w+) =|^(\w+)(?:: [^=]+)? = /) || []).slice(1).find(Boolean); return n && !declared(s, n); });
const ids = [...md.slice(md.indexOf('## Built'), md.indexOf('## For the shared')).matchAll(/^\| ([a-z0-9-]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm)]
  .map((m) => ({ id: m[1], jet: m[2].trim(), react: m[3].trim(), angular: m[4].trim() })).filter((r) => r.id !== 'component' && !r.id.startsWith('-'));
if (!ids.length) { throw new Error(item + ': no components in the Built table'); }

const edits = [];
const edit = (rel, fn) => {
  const f = path.join(root, rel);
  const raw = fs.readFileSync(f, 'utf8');
  const crlf = raw.includes('\r\n');
  const out = fn(raw.replace(/\r\n/g, '\n'));
  edits.push(rel);
  if (!dry) { fs.writeFileSync(f, crlf ? out.replace(/\n/g, '\r\n') : out); }
};
const insertBefore = (s, marker, text, rel) => { const i = s.lastIndexOf(marker); if (i < 0) { throw new Error(rel + ': no ' + marker.trim()); } return s.slice(0, i) + text + '\n' + s.slice(i); };
const insertAfter = (s, marker, text, rel) => { const i = s.indexOf(marker); if (i < 0) { throw new Error(rel + ': no ' + marker.trim()); } return s.slice(0, i + marker.length) + '\n' + text + s.slice(i + marker.length); };

// JET gallery: sections before </main>, model additions after the first observable (handoffs say model.; the gallery's object is vm)
const jet = after('### Galleries');
const jetModel = line('Gallery model additions (JET):');
edit('target-packs/components/gates/jet-gallery.html', (s) => {
  if (s.includes(`data-component="${ids[0].id}"`)) { return s; }
  s = insertBefore(s, '  </main>', jet.body, 'jet-gallery');
  return jetModel ? insertAfter(s, `          tab: ko.observable('c'),`, '          ' + jetModel.replace(/\bmodel\./g, 'vm.') + ',', 'jet-gallery') : s;
});

// React gallery: sections before </main>, state after the host hook, names added to the import
const react = after('React (`react/gallery/gallery.tsx`');
const reactState = line('Gallery state (React):');
const reactNames = [...new Set(ids.map((r) => r.react).filter((n) => /^[A-Z]\w+$/.test(n)))];
edit('target-packs/components/react/gallery/gallery.tsx', (s) => {
  if (s.includes(`id="${ids[0].id}"`)) { return s; }
  s = insertBefore(s, '    </main>', react.body, 'gallery.tsx');
  if (reactState) {
    // "(x as in the JET model)" means the plain values of the JET model, as constants
    const stmts = reactState.replace(/\([^)]*as in the JET model\)/, '').split(/;\s*(?=const )/).map((x) => x.trim().replace(/;$/, '')).filter(Boolean)
      .concat(fromJetModel(reactState).map(([n, v]) => `const ${n} = ${v}`));
    const state = fresh(s, stmts, (t, n) => new RegExp('const (\\[' + n + ',|' + n + ' =)').test(t));
    if (state.length) { s = insertAfter(s, `  const [host, setHost] = useState<HTMLElement | null>(null);`, '  ' + state.join('; ') + ';', 'gallery.tsx'); }
  }
  const imp = s.match(/import \{([^}]*)\} from '\.\.\/src';/);
  const have = new Set(imp[1].split(',').map((x) => x.trim()).filter(Boolean));
  const all = [...new Set([...have, ...reactNames])].sort();
  return s.replace(imp[0], `import { ${all.join(', ')} } from '../src';`);
});

// Angular gallery: sections before </main>, fields after the selected signal
const ng = after('Angular (`angular/gallery/main.ts`');
const ngFields = line('Gallery fields (Angular):');
edit('target-packs/components/angular/gallery/main.ts', (s) => {
  if (s.includes(`data-component="${ids[0].id}"`)) { return s; }
  s = insertBefore(s, '    </main>', ng.body, 'main.ts');
  if (ngFields) {
    let fields = ngFields.replace(/\s*\w+ = \[\.\.\.\] \(as in the JET model\);?/, '');
    const notes = jetModel && jetModel.match(/\bnotes: (\[[\s\S]*?\])(?=, \w+:|$)/);
    if (/notes = \[\.\.\.\]/.test(ngFields) && notes) { fields += ` notes = ${notes[1]};`; }
    const stmts = fields.replace(/\([^)]*as in the JET model\);?/, '').split(/;\s*(?=\w+(?:: [^=]+)? = )/).map((x) => x.trim().replace(/;$/, '')).filter(Boolean)
      .concat(fromJetModel(fields).map(([n, v]) => `${n} = ${v}`));
    const add = fresh(s, stmts, (t, n) => new RegExp('^  ' + n + '(: [^=]+)? = ', 'm').test(t));
    if (add.length) { s = insertAfter(s, `  selected = signal<readonly string[]>(['t2']);`, '  ' + add.map((x) => x + ';').join('\n  '), 'main.ts'); }
  }
  return s;
});

// Catalogue: builtOn and api per entry, as targeted insertions
const cat = JSON.parse(after('### catalogue.json').body);
edit('target-packs/components/catalogue.json', (s) => {
  const indent = (text, pad) => text.split('\n').map((l, i) => (i === 0 ? l : pad + l)).join('\n');
  for (const [id, block] of Object.entries(cat)) {
    const at = s.indexOf(`"id": "${id}"`);
    if (at < 0) { console.warn('catalogue: no entry ' + id); continue; }
    const end = s.indexOf('\n        }', at);
    if (block.builtOn) {
      const bAt = s.indexOf('"builtOn": {', at);
      if (bAt > 0 && bAt < end) {
        const bEnd = s.indexOf('\n          }', bAt) + '\n          }'.length;
        const merged = Object.assign(JSON.parse(s.slice(bAt + 11, bEnd)), block.builtOn);
        s = s.slice(0, bAt) + '"builtOn": ' + indent(JSON.stringify(merged, null, 2), '          ') + s.slice(bEnd);
      }
    }
    if (block.api && !s.slice(at, s.indexOf('\n        }', at)).includes('"api"')) {
      const e = s.indexOf('\n        }', at);
      s = s.slice(0, e) + ',\n          "api": ' + indent(JSON.stringify(block.api, null, 2), '          ') + s.slice(e);
    }
  }
  JSON.parse(s);
  return s;
});

// Gates: the group's ids for the specs
edit('target-packs/components/gates/specs/gates.ts', (s) => {
  const name = 'G' + item.replace(/\D/g, '');
  if (s.includes(`export const ${name} =`)) { return s; }
  return insertBefore(s, 'export const VIEWPORTS =', `/** Group ${item.replace(/\D/g, '')} of the catalogue, in the galleries of the web packs. */\nexport const ${name} = ${JSON.stringify(ids.map((r) => r.id))} as const;\n`, 'gates.ts');
});

// PackFiles: every bx-*.js module the JET pack loads
edit('factory-server/src/main/java/com/obdx/factory/componentpack/PackFiles.java', (s) => {
  const files = fs.readdirSync(path.join(root, 'target-packs/components/jet-premium/bx')).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
  const order = ['bx.js', 'bx-core.js', 'bx-fields.js', 'bx-elements.js', 'bx-forms.js', 'bx-motion.js'];
  const list = [...order.filter((f) => files.includes(f)), ...files.filter((f) => !order.includes(f) && f !== 'bx.css').sort(), 'bx.css'];
  return s.replace(/List\.of\("bx\.js"[^;]*;/, 'List.of(' + list.map((f) => `"${f}"`).join(', ') + ');');
});
console.log(dry ? 'would edit' : 'edited', edits.join(', '), '·', ids.length, 'components');
