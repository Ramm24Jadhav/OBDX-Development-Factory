/*
 * Builds the React Native and React screen previews into web/ after the JET build. Each preview bundles a target
 * pack's starter components (../target-packs) with React (and React Native Web), so the designer shows screens with
 * the components the generated app uses. Everything is bundled: the previews work without internet access.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'web', 'previews');

const page = (title, script, css) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  ${css ? `<link rel="stylesheet" href="previews/${css}">` : ''}
  <style>html, body, #root { height: 100%; margin: 0; } #root { display: flex; flex-direction: column; }</style>
</head>
<body>
  <div id="root"></div>
  <script src="previews/${script}"></script>
</body>
</html>
`;

esbuild.build({
  entryPoints: { 'react-native-preview': path.join(root, 'previews', 'rn-preview.tsx'),
                 'react-preview': path.join(root, 'previews', 'react-preview.tsx') },
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  outdir: out,
  // The target packs live outside this module; their imports resolve to this module's node_modules.
  nodePaths: [path.join(root, 'node_modules')],
  alias: { 'react-native': 'react-native-web' },
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'],
  define: { 'process.env.NODE_ENV': '"production"', __DEV__: 'false' },
  // The starter projects' own tsconfig files extend packages that are not installed here.
  tsconfigRaw: { compilerOptions: { jsx: 'react-jsx' } },
  logLevel: 'warning',
}).then(() => {
  fs.writeFileSync(path.join(root, 'web', 'preview-react-native.html'), page('React Native preview', 'react-native-preview.js'));
  fs.writeFileSync(path.join(root, 'web', 'preview-react.html'), page('React preview', 'react-preview.js', 'react-preview.css'));
  console.log('Previews built in web/previews');
}).catch(() => process.exit(1));
