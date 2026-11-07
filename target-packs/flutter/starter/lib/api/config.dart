/// Where the bank's OBDX REST services are, and how the app talks to them.
class ApiConfig {
  const ApiConfig._();

  /// The bank's server, for example https://digital.bank.example (the app has no server of its own).
  static const String baseUrl = String.fromEnvironment('OBDX_BASE_URL', defaultValue: 'http://localhost:8080');

  /// Requests slower than this are cancelled.
  static const Duration timeout = Duration(seconds: 30);

  /// OBDX asks for a fresh nonce on every call that changes something: the client fetches one from this service and
  /// sends it in this header. Match both to the bank's OBDX release; an empty url turns it off (for a mock server).
  static const String nonceUrl = '/digx/v1/session/nonce';
  static const String nonceHeader = 'X-Nonce';

  /// The bank's server certificate (PEM, in assets) to pin, as the OBDX mobile apps do; empty pins nothing.
  static const String pinnedCertificate = '';
}
