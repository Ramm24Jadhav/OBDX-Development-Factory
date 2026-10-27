/** Where the bank's OBDX REST services are. Set per environment (for example with Expo's app config or EAS secrets). */
export const apiConfig = {
  baseUrl: 'https://obdx.bank.local',
  /** Requests slower than this are cancelled. */
  timeoutMs: 30000,
};
