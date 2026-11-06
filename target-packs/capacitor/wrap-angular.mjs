// Wraps an Angular app of the Angular target pack (target-packs/angular/starter, or the bank's app made from it) in
// the Capacitor shell, with the same files the React starter uses: capacitor.config.ts, src/native/device.ts and the
// Capacitor versions of starter/package.json. Run once in a copy of the app:  node wrap-angular.mjs <app folder>
// Running it again changes nothing.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const starter = join(dirname(fileURLToPath(import.meta.url)), 'starter');
const app = process.argv[2];
if (!app || !existsSync(join(app, 'angular.json'))) {
  console.error('Give the folder of the Angular app (the one with angular.json): node wrap-angular.mjs <app folder>');
  process.exit(1);
}
const read = (file) => readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));

// The Angular application builder writes the screens to dist/<project>/browser unless angular.json says otherwise
const [project, settings] = Object.entries(json(join(app, 'angular.json')).projects)[0];
const output = settings.architect.build.options.outputPath;
const webDir = typeof output === 'string' ? `${output}/browser` : output ? `${output.base}/${output.browser ?? 'browser'}` : `dist/${project}/browser`;
const config = read(join(starter, 'capacitor.config.ts'));
if (!config.includes("webDir: 'dist'")) {
  throw new Error("starter/capacitor.config.ts no longer says webDir: 'dist'; update wrap-angular.mjs to match");
}
writeFileSync(join(app, 'capacitor.config.ts'), config.replace("webDir: 'dist'", `webDir: '${webDir.replace(/\/$/, '')}'`));

mkdirSync(join(app, 'src/app/native'), { recursive: true });
copyFileSync(join(starter, 'src/native/device.ts'), join(app, 'src/app/native/device.ts'));

// main.ts wires the device once, as main.tsx does in the React app
const main = join(app, 'src/main.ts');
const code = read(main);
if (!code.includes('startNative()')) {
  const lines = code.split('\n');
  const afterImports = lines.findLastIndex((line) => line.startsWith('import ')) + 1;
  lines.splice(afterImports, 0, "import { startNative } from './app/native/device';", '', 'startNative();');
  writeFileSync(main, lines.join('\n'));
}

// The Capacitor packages at the versions the React starter uses, and the same cap scripts on the Angular build
const capacitor = json(join(starter, 'package.json'));
const pkg = json(join(app, 'package.json'));
const pick = (deps) => Object.fromEntries(Object.entries(deps).filter(([name]) => name.startsWith('@capacitor/')));
pkg.dependencies = { ...pkg.dependencies, ...pick(capacitor.dependencies) };
pkg.devDependencies = { ...pkg.devDependencies, ...pick(capacitor.devDependencies) };
pkg.scripts = { ...pkg.scripts, 'cap:sync': 'ng build && cap sync', android: capacitor.scripts.android, ios: capacitor.scripts.ios };
writeFileSync(join(app, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

console.log(`Wrapped ${app} in Capacitor: the screens come from ${webDir}. Next: npm install, npx cap add android, npx cap add ios.`);
