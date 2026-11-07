#!/usr/bin/env node
/*
 * Builds bx.css, the one stylesheet the four premium packs share, from its sources in styles/: base.css (tokens and the
 * shared settings the designs drive), kinds/<kind>.css in name order (one file per component kind, the catalogue's
 * `kind`), designs.css (the nine designs) and end.css (reduced motion, touch). Writes the four identical copies.
 * `node tools/join-styles.mjs --check` writes nothing and fails when a copy is out of date (ComponentStylesTest does the same).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const components = path.resolve(here, '..');
const styles = path.join(components, 'styles');
export const COPIES = ['react/src/bx.css', 'jet-premium/bx/bx.css', 'angular/src/bx.css', '../angular/starter/src/app/components/bx.css'];

export function join() {
  const kinds = fs.readdirSync(path.join(styles, 'kinds')).filter((f) => f.endsWith('.css')).sort();
  const parts = ['base.css', ...kinds.map((k) => 'kinds/' + k), 'designs.css', 'end.css'];
  return parts.map((p) => fs.readFileSync(path.join(styles, p), 'utf8').replace(/\r\n/g, '\n')).join('');
}

const css = join();
const check = process.argv.includes('--check');
let stale = 0;
for (const copy of COPIES) {
  const file = path.join(components, copy);
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
  if (now === css) { continue; }
  if (check) { console.error(copy + ' is out of date: run node target-packs/components/tools/join-styles.mjs'); stale++; } else { fs.writeFileSync(file, css); console.log('wrote ' + copy); }
}
process.exit(stale ? 1 : 0);
