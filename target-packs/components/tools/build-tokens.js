#!/usr/bin/env node
/*
 * Builds the bank tokens (tokens/tokens.json) into what the packs read:
 *   tokens/build/tokens.css         --bank-* custom properties, light and dark, for any web UI
 *   react-native/src/tokens.ts      a typed object for the React Native pack (no CSS there)
 * Run: node tools/build-tokens.js        (node tools/build-tokens.js --check fails when an output is out of date)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'tokens/tokens.json'), 'utf8'));

/** Flattens {$value} leaves into [['color','primary'], value] pairs, skipping $-keys. */
function leaves(node, at = [], out = []) {
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) { continue; }
    if (v && typeof v === 'object' && '$value' in v) { out.push([[...at, k], v.$value]); } else if (v && typeof v === 'object') { leaves(v, [...at, k], out); }
  }
  return out;
}

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const px = (v) => (typeof v === 'string' && /^-?\d+(\.\d+)?px$/.test(v) ? Number(v.slice(0, -2)) : typeof v === 'string' && /^\d+ms$/.test(v) ? Number(v.slice(0, -2)) : v);

const light = leaves(Object.fromEntries(Object.entries(source).filter(([k]) => k !== 'dark')));
const dark = leaves(source.dark || {});

function css() {
  const line = ([p, v]) => `  --bank-${p.join('-')}: ${v};`;
  return '/* Generated from tokens/tokens.json by tools/build-tokens.js. Do not edit. */\n'
    + `:root {\n${light.map(line).join('\n')}\n}\n`
    + `.bank-dark, [data-theme="dark"] {\n${dark.map(line).join('\n')}\n}\n`;
}

function tree(pairs) {
  const out = {};
  for (const [p, v] of pairs) {
    let o = out;
    p.slice(0, -1).forEach((k) => { o = o[camel(k)] = o[camel(k)] || {}; });
    o[camel(p[p.length - 1])] = px(v);
  }
  return out;
}

function ts() {
  const l = tree(light);
  const d = tree(dark);
  return '/* Generated from tokens/tokens.json by tools/build-tokens.js. Do not edit; change the tokens and run the script. */\n'
    + `export const lightTokens = ${JSON.stringify(l, null, 2)} as const;\n\n`
    + `export const darkColors = ${JSON.stringify(d.color || {}, null, 2)} as const;\n\n`
    + 'export type Tokens = typeof lightTokens;\n';
}

const outputs = [[path.join(root, 'tokens/build/tokens.css'), css()], [path.join(root, 'react-native/src/tokens.ts'), ts()]];
const check = process.argv.includes('--check');
let stale = 0;
for (const [file, text] of outputs) {
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (now === text) { continue; }
  if (check) { console.error(`${path.relative(root, file)} is out of date: run node tools/build-tokens.js`); stale++; continue; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  console.log(`wrote ${path.relative(root, file)}`);
}
process.exit(stale ? 1 : 0);
