/**
 * Where the bank's OBDX REST services are: the bank's Oracle HTTP Server (VITE_OBDX_BASE_URL, https). In the app the
 * screens are served from the device, so this is never empty there; empty only works in the browser during development.
 */
export const apiConfig = {
  baseUrl: import.meta.env.VITE_OBDX_BASE_URL ?? '',
  /** Requests slower than this are cancelled. */
  timeoutMs: 30000,
  /**
   * OBDX asks for a fresh nonce on every call that changes something: the client fetches one from this service and
   * sends it in this header. Match both to the bank's OBDX release; an empty url turns it off (for a mock server).
   */
  nonce: { url: '/digx/v1/session/nonce', header: 'X-Nonce' },
};
