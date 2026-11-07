import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/*
 * The React Native pack in a browser: react-native resolves to react-native-web, so the pack's own source (../src)
 * renders as it is. Only for the gates (screenshots, themes, accessibility); devices remain the reference.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // From this folder, so the pack's source (../src) finds it in a build too, with one copy of React
    // thinking-orbs too: the pack's orb spinner (../src/variants.tsx) draws its engine's frames
    alias: { 'react-native': resolve(import.meta.dirname, 'node_modules/react-native-web'),
      'thinking-orbs/engine': resolve(import.meta.dirname, 'node_modules/thinking-orbs/dist/engine.es.js') },
    dedupe: ['react', 'react-dom'],
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js', '.json'],
  },
  define: { __DEV__: 'false', global: 'globalThis' },
  server: { fs: { allow: ['..'] } },
  optimizeDeps: { include: ['react-native-web'] },
});
