import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

// The components are compiled by the Angular compiler (signal inputs and outputs need it), as in a bank's build.
export default defineConfig({
  plugins: [angular({ tsconfig: 'tsconfig.spec.json' })],
  test: { environment: 'jsdom', globals: true, include: ['test/**/*.test.ts'], setupFiles: ['test/setup.ts'] },
});
