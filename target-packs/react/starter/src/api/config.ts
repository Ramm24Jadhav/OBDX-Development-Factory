/**
 * Where the bank's OBDX REST services are. Empty means the same server as the app (behind the bank's web server or
 * the development proxy in vite.config.ts).
 */
export const apiConfig = {
  baseUrl: import.meta.env.VITE_OBDX_BASE_URL ?? '',
  /** Requests slower than this are cancelled. */
  timeoutMs: 30000,
};
