import angular from '@analogjs/vite-plugin-angular';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The gallery the browser gates run on (target-packs/components/gates): every foundation component in its states,
// at /gallery/. The pack folder is the root so the Angular compiler sees the gallery and the pack as one program.
const pack = resolve(import.meta.dirname, '..');
export default defineConfig({
  root: pack,
  plugins: [angular({ tsconfig: resolve(pack, 'tsconfig.gallery.json'), workspaceRoot: pack, jit: true })],
  server: { host: '127.0.0.1' },
  logLevel: 'warn',
});
