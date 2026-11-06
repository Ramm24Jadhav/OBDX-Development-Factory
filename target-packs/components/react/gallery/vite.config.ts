import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The gallery the browser gates run on (target-packs/components/gates): every foundation component in its states.
export default defineConfig({ root: import.meta.dirname, plugins: [react()], server: { host: '127.0.0.1' }, logLevel: 'warn' });
