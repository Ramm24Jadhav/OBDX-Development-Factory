import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    // During development, calls to the OBDX services go to the server set in .env (VITE_OBDX_URL).
    server: { proxy: { '/digx': env.VITE_OBDX_URL || 'https://obdx.bank.local' } },
    test: { environment: 'jsdom' },
  };
});
