import Security
import XCTest
@testable import ObdxApp

private func certificate(_ base64: String) -> SecCertificate {
    SecCertificateCreateWithData(nil, Data(base64Encoded: base64)! as CFData)!
}

final class CertificatePinsTests: XCTestCase {
    // Self-signed certificates and their pins from openssl; the P-256 pair is the one the Android test checks
    private let ec = certificate("MIIBiDCCAS2gAwIBAgIUA0/6sTRDyIC31YgcKAFFP8DjBCswCgYIKoZIzj0EAwIwGTEXMBUGA1UEAwwOb2JkeC5iYW5rLnRlc3QwHhcNMjYxMTA2MjExMjM4WhcNMzYxMTAzMjExMjM4WjAZMRcwFQYDVQQDDA5vYmR4LmJhbmsudGVzdDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJM1H+5YfXW+PxN48buaEPPH1vK3jxSscfduHmc92Qe9u7GJ/df0UmX3Orip9nFg+hPUou0UiWjt1SYZ5n4OmwKjUzBRMB0GA1UdDgQWBBQ+YECGYZqkta0Q2r5pgrUnyEOMbTAfBgNVHSMEGDAWgBQ+YECGYZqkta0Q2r5pgrUnyEOMbTAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0kAMEYCIQDoI9Ur4ideZpIx0F33GzFyAe3U8dygq50R8ic1+PSawwIhAJp1UrM6usct4ajihYw92kOKFpv8xD8pGNCIOUmBoQxb")
    private let ecPin = "sha256/86vXlbEB1UGCmyDzGegDjiFS1gauaEYmpiCips/7dGE="
    private let rsa = certificate("MIIDEzCCAfugAwIBAgIUD5gbpxkG3+ovfnfbrmvPjmQIgcYwDQYJKoZIhvcNAQELBQAwGTEXMBUGA1UEAwwOb2JkeC5iYW5rLnRlc3QwHhcNMjYxMTA2MjExMjM5WhcNMzYxMTAzMjExMjM5WjAZMRcwFQYDVQQDDA5vYmR4LmJhbmsudGVzdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANYDH0PkOB7kRqrZ2m0YoMwFmfjSsIu1VcOhJjUkb8RnJBTBlwGr4FHU+CcvIOncXutkEcJ9qsnh6LdTOQI+HUg/l8VjGikRVsytl4L6fS8WaHsrHDGq85R5Ing6rmpmnMeqqgkcwUlCODKoPSecjzW0fEyWCleoQP1p978Rjj2a8gEQ9YNxRYEOpcZt2uAgX0rI+fUFfmnkak3MNXVrGZu2YGHTREOn+j3umpWlQgm2LOqB7sOowKTntYVzbHdps2LFxRV1gZhQWVty/DNLbzc3vdYStBjXdOx8NUJ6W/FSvp6lRG+I9bx+mRpDjZov36lVcIcHz56BOkgrnLohQc0CAwEAAaNTMFEwHQYDVR0OBBYEFBCpeuyy67D9R6yq1Bgj8npzTNGpMB8GA1UdIwQYMBaAFBCpeuyy67D9R6yq1Bgj8npzTNGpMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAKa+M4rfEKkJM0k7Nz8m9yf7E+OGq3F9T46w3WGTfav4dMyQUn2JldCDyOy6pOlpw8dD4vIBumF+BvGxAPTwYCeZ5EK6JlCBxtfFMPALWK2CyClTSII2VFU7QlANO+OnYi4Pfm6qruQKh1pAEQ5q7+TMPk9P8uVfk28wya0YA+hAbPf19VjYh6X0/6ImbLdG537H80oagnQRxnJOM4sYCDnxDqS1wyuqPfgi21ZHO8/vU0c0iNal7d6mEFC4LQi9qxZncOccAvLvKidjqGGrhz7z6HKJRf2rG/dBmr/p6uZPt7GtcVOydLhnKuEWk/brHedJlL76khX1/oNI8aOrEBA=")
    private let rsaPin = "sha256/zjb7w2Za8/bUK9Y3dJsx2VcxXp9h19R5Ri1A9YJ8AhI="
    private let other = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    private var saved: (Set<String>, Date?) = ([], nil)

    override func setUp() { saved = (CertificatePins.pins, CertificatePins.expires) }
    override func tearDown() { (CertificatePins.pins, CertificatePins.expires) = saved }

    func testPinsMatchOpensslForEcAndRsaKeys() {
        XCTAssertEqual(CertificatePins.pin(of: ec), ecPin)
        XCTAssertEqual(CertificatePins.pin(of: rsa), rsaPin)
    }

    func testAcceptsOnlyAChainWithAPinnedKeyUntilThePinsExpire() {
        let lastDay = CertificatePins.day("2030-01-31")!
        CertificatePins.pins = [other]
        CertificatePins.expires = lastDay
        XCTAssertFalse(CertificatePins.accepts([ec], now: lastDay.addingTimeInterval(12 * 60 * 60)))
        // After the expiry an app that was never updated still reaches the bank
        XCTAssertTrue(CertificatePins.accepts([ec], now: CertificatePins.day("2030-02-01")!))
        CertificatePins.pins = [other, ecPin]
        XCTAssertTrue(CertificatePins.accepts([rsa, ec], now: lastDay))
        CertificatePins.pins = []
        XCTAssertTrue(CertificatePins.accepts([rsa]))
    }
}
