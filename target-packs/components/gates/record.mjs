// Writes the browser gates' results (results/gates.json, from npm run gates) into ../packs.json: per pack and component
// the accessibility, themes, responsive and visual gates, and for the premium JET pack the parity gate. A gate is passed
// only when every run of it passed (the JET pack: on JET 6 and on the current release). The React Native pack's parity
// comes from its own gates' report (../react-native/gates/results/gates.json), when it has been run. Run: node record.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const here = import.meta.dirname;
const read = (file) => JSON.parse(readFileSync(resolve(here, file), 'utf8'));
const NATIVE = '../react-native/gates/results/gates.json';
const reports = [...(existsSync(resolve(here, 'results/gates.json')) ? [read('results/gates.json')] : []), ...(existsSync(resolve(here, NATIVE)) ? [read(NATIVE)] : [])];
const PACK = { react: 'react', angular: 'angular', jet6: 'jet-premium', jet21: 'jet-premium' };
const EVIDENCE = {
  accessibility: 'target-packs/components/gates: axe in Chromium with every rule, colour contrast included',
  themes: 'target-packs/components/gates: the dark theme changes the component and axe (contrast included) passes in it',
  responsive: 'target-packs/components/gates: phone, tablet and laptop widths, nothing past the edge, controls at least 24 by 24',
  visual: 'target-packs/components/gates/snapshots: light and dark screenshots compared with the accepted ones',
  parity: 'target-packs/components/gates/specs/parity.spec.ts: the JET element and the bx- element driven the same way give the screen the same values, events and methods',
};
const WEB_PARITY = 'target-packs/components/gates/specs/parity-web.ts: the same values and messages as the JET element, on JET 6.2 and JET 21';
const NATIVE_PARITY = 'target-packs/components/react-native/gates/specs/parity.spec.ts: in react-native-web, the same values, messages, names and events as the JET element, on JET 6.2 and JET 21';
const where = { 'jet-premium': ' (JET 6.2 and JET 21)' };

/** Every spec in the report with its describe path and whether all its runs passed. */
function specs(suite, path = []) {
  const out = [];
  const p = suite.title && !suite.title.endsWith('.ts') ? [...path, suite.title] : path;
  for (const s of suite.specs || []) {
    out.push({ path: p, title: s.title, ok: s.ok && s.tests.every((t) => t.results.every((r) => r.status === 'passed')),
      skipped: s.tests.every((t) => t.results.every((r) => r.status === 'skipped')) });
  }
  for (const c of suite.suites || []) { out.push(...specs(c, p)); }
  return out;
}

const results = {};
const put = (pack, component, gate, ok) => {
  const key = `${pack}|${component}|${gate}`;
  results[key] = (results[key] ?? true) && ok;
};
for (const s of reports.flatMap((r) => r.suites).flatMap((x) => specs(x))) {
  const [component, gate] = s.title.split(' · ');
  if (s.path[0] && s.path[0].startsWith('parity on JET')) { put('jet-premium', component, 'parity', s.ok); continue; }
  // parity-web.ts and React Native's parity.spec.ts: '<pack> parity with JET <release>'; a skipped test records nothing
  const web = /^(react|angular|react-native) parity with JET/.exec(s.path[0] || '');
  if (web) { if (!s.skipped) { put(web[1], component, 'parity', s.ok); } continue; }
  const pack = PACK[s.path[0]];
  if (pack && gate) { put(pack, component, gate, s.ok); }
}

const file = resolve(here, '../packs.json');
const raw = readFileSync(file, 'utf8');
const data = JSON.parse(raw);
let n = 0;
for (const [key, ok] of Object.entries(results)) {
  const [packId, component, gate] = key.split('|');
  const pack = data.packs.find((p) => p.id === packId);
  if (!pack || !pack.built.some((b) => b.component === component)) { continue; }
  pack.checks[component] = pack.checks[component] || {};
  pack.checks[component][gate] = { status: ok ? 'passed' : 'failed', evidence: gate === 'parity' && packId !== 'jet-premium' ? (packId === 'react-native' ? NATIVE_PARITY : WEB_PARITY) : EVIDENCE[gate] + (where[packId] || '') };
  n++;
}
const out = JSON.stringify(data, null, 2) + '\n';
writeFileSync(file, raw.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out);
console.log(`recorded ${n} gate results in packs.json`);
