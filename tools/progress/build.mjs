// Works out the Modernization progress from the repository itself, so no figure on the dashboard is typed by hand:
// components from target-packs/components/packs.json, target packs from target-packs/<id>/target.yml, gates from the
// recorded checks, and the screen and set-up steps from docs/progress/steps.json (ticked as each is checked).
//   node tools/progress/build.mjs [out.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const packs = read('target-packs/components/packs.json').packs;
const catalogue = read('target-packs/components/catalogue.json');
const steps = read('docs/progress/steps.json');
const groups = read('tools/progress/groups.json');
const entries = new Map(catalogue.categories.flatMap((c) => c.components).map((e) => [e.id, e]));
const pack = (id) => packs.find((p) => p.id === id);
const built = (packId, comp) => pack(packId).built.some((b) => b.component === comp && b.source.startsWith('target-packs/components/'));
const status = (done, total) => (done >= total ? 'Done' : done > 0 ? 'In progress' : 'Not started');
const rows = [];
const add = (id, track, task, session, done, total, unit, note = '') => rows.push({ id, track, task, session, done, total, unit, status: status(done, total), note });

for (const s of steps.rows) { add(s.id, s.track, s.task, s.session, s.items.filter((i) => i.done).length, s.items.length, s.unit, s.note || ''); }

// Components: a web group's component is done when every web pack that names it has built it; a phone group's when React Native has
const web = ['jet-premium', 'react', 'angular'];
// A planned component not yet in the catalogue (the motion group) counts as to do in every pack
const doneWeb = (c) => { const e = entries.get(c); if (!e) { return false; } return web.filter((p) => e.names?.[p]).every((p) => built(p, c)); };
const doneRn = (c) => (entries.get(c) && !entries.get(c).names?.['react-native']) || built('react-native', c);
const first = new Set(groups.done);
add('C0', 'Components', 'Foundation set and forms wave (all four packs)', 'Earlier', groups.done.filter((c) => doneWeb(c) && doneRn(c)).length, first.size, 'components');
// The motion layer: a built component counts when target-packs/components/motion.json says every pack that has it moves
const motionFile = path.join(root, 'target-packs', 'components', 'motion.json');
const motion = fs.existsSync(motionFile) ? JSON.parse(fs.readFileSync(motionFile, 'utf8')).components || {} : {};
const moves = (c) => { const m = motion[c]?.packs || {}; return ['jet-premium', 'react', 'angular', 'react-native'].filter((p) => built(p, c)).every((p) => m[p] === true); };
add('M1', 'Components', groups.motion.task, 'Catalogue (web)', groups.done.filter((c) => motion[c] && moves(c)).length, first.size, 'components');
for (const g of groups.web) { add(g.id, 'Components', g.task, 'Catalogue (web)', g.ids.filter(doneWeb).length, g.ids.length, 'components'); }
for (const g of groups.phone) {
  const ids = g.groups.flatMap((n) => groups.web.find((w) => w.id === n).ids).filter((c) => !entries.get(c) || entries.get(c).names?.['react-native']);
  add(g.id, 'Components', g.task, 'Phone and packs', ids.filter(doneRn).length, ids.length, 'components');
}

// Target packs: a pack exists when its target.yml does
const has = (id) => fs.existsSync(path.join(root, 'target-packs', id, 'target.yml'));
const earlier = ['jet', 'react', 'react-native', 'angular', 'flutter', 'jet-core-pack'];
add('TP0', 'Target packs', 'JET, React, React Native, Angular, Flutter, JET Core Pack', 'Earlier', earlier.filter(has).length, earlier.length, 'packs');
add('T1', 'Target packs', 'T1 Vue 3 and Capacitor', 'Phone and packs', ['vue', 'capacitor'].filter(has).length, 2, 'packs');
add('T2', 'Target packs', 'T2 Native Swift and Kotlin', 'Phone and packs', ['native'].filter(has).length, 1, 'packs');

// Gates: parity recorded as passed on every built component of a pack, and React Native screenshots and themes
// Parity applies only to a component that replaces a JET element, as in ComponentPackService
const applies = (comp, gate) => gate !== 'parity' || entries.get(comp)?.workspace?.kind === 'element';
const allPassed = (packId, gate) => {
  const p = pack(packId);
  const list = p.built.filter((b) => b.source.startsWith('target-packs/components/') && applies(b.component, gate));
  return list.length > 0 && list.every((b) => p.checks[b.component]?.[gate]?.status === 'passed');
};
add('G0', 'Gates', 'Premium JET parity on JET 6.2 and the current JET', 'Earlier', allPassed('jet-premium', 'parity') ? 1 : 0, 1, 'gates');
add('Q1', 'Gates', 'Q1 React and Angular parity; React Native screenshots and themes', 'Phone and packs',
  [allPassed('react', 'parity'), allPassed('angular', 'parity'), allPassed('react-native', 'visual') && allPassed('react-native', 'themes')].filter(Boolean).length, 3, 'gates');

const order = ['P0', 'SCR', 'S0', 'S1', 'S2', 'S3', 'S4', 'C0', 'M1', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'N1', 'N2', 'N3', 'TP0', 'T1', 'T2', 'G0', 'Q1', 'SHIP'];
rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
const asOf = new Date().toISOString();
for (const r of rows) { r.asOf = asOf; }
const out = JSON.stringify({ generated: asOf, rows }, null, 1) + '\n';
// A self-check: every planned task is there once, and no figure is past its total
if (rows.length !== order.length || new Set(rows.map((r) => r.id)).size !== rows.length || rows.some((r) => r.done > r.total || r.total < 1)) {
  throw new Error('The progress rows are not complete: ' + rows.map((r) => r.id).join(','));
}
fs.writeFileSync(process.argv[2] || path.join(root, 'docs', 'progress', 'modernization-tasks.json'), out);
console.log(rows.map((r) => `${r.id} ${r.done}/${r.total}`).join('  '));
