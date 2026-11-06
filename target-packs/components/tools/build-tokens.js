#!/usr/bin/env node
/*
 * Builds the bank tokens (tokens/tokens.json) into what the packs read:
 *   tokens/build/tokens.css         --bank-* custom properties, light and dark, for any web UI
 *   react-native/src/tokens.ts      a typed object for the React Native pack (no CSS there)
 *   ../flutter/starter/lib/components/tokens.dart   colours, sizes and fonts for the Flutter target pack
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

/** A Dart colour from #rrggbb or rgba(r, g, b, a): 0xAARRGGBB. */
function dartColor(v) {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) { return 'Color(0xFF' + hex[1].toUpperCase() + ')'; }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/.exec(v);
  if (!rgba) { throw new Error('Not a colour Dart can take: ' + v); }
  const h = (n) => Number(n).toString(16).padStart(2, '0').toUpperCase();
  return 'Color(0x' + h(Math.round(Number(rgba[4]) * 255)) + h(rgba[1]) + h(rgba[2]) + h(rgba[3]) + ')';
}

function dart() {
  const name = (p) => camel(p.join('-'));
  const colors = (pairs, cls) => `class ${cls} {\n  const ${cls}._();\n${pairs.filter(([p]) => p[0] === 'color').map(([p, v]) => `  static const ${name(p.slice(1))} = ${dartColor(v)};`).join('\n')}\n}\n`;
  const sizes = light.filter(([p, v]) => ['space', 'radius', 'control'].includes(p[0]) || (p[0] === 'font' && /^size/.test(p[1])))
    .map(([p, v]) => `  static const double ${name(p)} = ${Number(px(v))};`);
  const family = (light.find(([p]) => p.join('-') === 'font-family') || [null, 'Inter'])[1].split(',')[0].replace(/['"]/g, '').trim();
  return '/* Generated from target-packs/components/tokens/tokens.json by tools/build-tokens.js. Do not edit; change the tokens and run the script. */\n'
    + "import 'package:flutter/painting.dart';\n\n"
    + '/// The bank\'s colours in the light theme.\n' + colors(light, 'BxColors') + '\n'
    + '/// The bank\'s colours in the dark theme.\n' + colors(dark, 'BxDarkColors') + '\n'
    + `/// Spacing, corner radii, control heights and font sizes, in logical pixels.\nclass BxSizes {\n  const BxSizes._();\n${sizes.join('\n')}\n  static const String fontFamily = '${family}';\n}\n`;
}

const outputs = [[path.join(root, 'tokens/build/tokens.css'), css()], [path.join(root, 'react-native/src/tokens.ts'), ts()],
  [path.join(root, '../flutter/starter/lib/components/tokens.dart'), dart()]];
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
