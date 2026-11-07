/**
 * Where the bank's OBDX REST services are. Empty means the same server as the app (behind the bank's web server or
 * the development proxy of ojet serve).
 */
export const apiConfig = {
  baseUrl: '',
  /** Requests slower than this are cancelled. */
  timeoutMs: 30000,
  /**
   * OBDX asks for a fresh nonce on every call that changes something: the client fetches one from this service and
   * sends it in this header. Match both to the bank's OBDX release; an empty url turns it off (for a mock server).
   */
  nonce: { url: '/digx/v1/session/nonce', header: 'X-Nonce' },
};
