import CryptoKit
import Foundation
import Security

/// Certificate pinning: the app talks only to a server whose certificate chain holds one of the bank's public keys.
/// The pins (sha256/<base64 of the SHA-256 of the key's SubjectPublicKeyInfo>, comma separated) and the day they stop
/// being enforced are set by the bank in the app's Info.plist (ObdxPins, ObdxPinsExpire; ios/App/project.yml). Ship the
/// next certificate's pin as a second pin in an app update before the certificate changes. No pins: pinning is off.
public enum CertificatePins {
    nonisolated(unsafe) public static var pins: Set<String> = Set(
        (Bundle.main.object(forInfoDictionaryKey: "ObdxPins") as? String ?? "").split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty })
    /// After this day (yyyy-mm-dd) the pins are not enforced, so an app that was never updated still reaches the bank.
    nonisolated(unsafe) public static var expires: Date? = day(Bundle.main.object(forInfoDictionaryKey: "ObdxPinsExpire") as? String)

    public static let updateMessage =
        "The app could not confirm it is talking to your bank. Update the app from the store; if it is up to date, try another network."

    /// The start of a yyyy-mm-dd day in UTC.
    public static func day(_ text: String?) -> Date? {
        guard let text, !text.isEmpty else { return nil }
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withFullDate]
        return format.date(from: text)
    }

    /// The pin of a certificate's public key, as openssl prints it (see the README); nil for a key type not listed here.
    public static func pin(of certificate: SecCertificate) -> String? {
        guard let key = SecCertificateCopyKey(certificate),
              let raw = SecKeyCopyExternalRepresentation(key, nil) as Data?,
              let attributes = SecKeyCopyAttributes(key) as? [CFString: Any],
              let type = attributes[kSecAttrKeyType] as? String,
              let bits = attributes[kSecAttrKeySizeInBits] as? Int,
              let header = spkiHeaders["\(type)/\(bits)"] else { return nil }
        return "sha256/" + Data(SHA256.hash(data: header + raw)).base64EncodedString()
    }

    public static func accepts(_ chain: [SecCertificate], now: Date = Date()) -> Bool {
        if pins.isEmpty { return true }
        if let expires, now >= expires.addingTimeInterval(24 * 60 * 60) { return true }
        return chain.contains { pin(of: $0).map { pins.contains($0) } ?? false }
    }

    // iOS gives the bare key; its SubjectPublicKeyInfo is this ASN.1 header and the key
    private static let spkiHeaders: [String: Data] = [
        (kSecAttrKeyTypeRSA as String) + "/2048":Data([0x30, 0x82, 0x01, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x01, 0x0f, 0x00]),
        (kSecAttrKeyTypeRSA as String) + "/4096":Data([0x30, 0x82, 0x02, 0x22, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x03, 0x82, 0x02, 0x0f, 0x00]),
        (kSecAttrKeyTypeECSECPrimeRandom as String) + "/256":Data([0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00]),
        (kSecAttrKeyTypeECSECPrimeRandom as String) + "/384":Data([0x30, 0x76, 0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, 0x03, 0x62, 0x00]),
    ]
}

/// Checks the server's certificate the platform's way, then the bank's pins, before anything is sent.
final class PinningDelegate: NSObject, URLSessionDelegate, Sendable {
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge) async
        -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust else { return (.performDefaultHandling, nil) }
        guard SecTrustEvaluateWithError(trust, nil),
              CertificatePins.accepts(SecTrustCopyCertificateChain(trust) as? [SecCertificate] ?? []) else {
            return (.cancelAuthenticationChallenge, nil)
        }
        return (.useCredential, URLCredential(trust: trust))
    }
}
