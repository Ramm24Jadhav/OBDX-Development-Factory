package com.bank.obdx.api

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.security.cert.CertificateFactory
import java.time.LocalDate
import java.util.Base64

class CertificatePinsTest {
    // A self-signed P-256 certificate and its pin from openssl (the iOS test checks the same pair)
    private val certificate = CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(Base64.getDecoder().decode(
        "MIIBiDCCAS2gAwIBAgIUA0/6sTRDyIC31YgcKAFFP8DjBCswCgYIKoZIzj0EAwIwGTEXMBUGA1UEAwwOb2JkeC5iYW5rLnRlc3QwHhcNMjYxMTA2MjExMjM4WhcNMzYxMTAzMjExMjM4WjAZMRcwFQYDVQQDDA5vYmR4LmJhbmsudGVzdDBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJM1H+5YfXW+PxN48buaEPPH1vK3jxSscfduHmc92Qe9u7GJ/df0UmX3Orip9nFg+hPUou0UiWjt1SYZ5n4OmwKjUzBRMB0GA1UdDgQWBBQ+YECGYZqkta0Q2r5pgrUnyEOMbTAfBgNVHSMEGDAWgBQ+YECGYZqkta0Q2r5pgrUnyEOMbTAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0kAMEYCIQDoI9Ur4ideZpIx0F33GzFyAe3U8dygq50R8ic1+PSawwIhAJp1UrM6usct4ajihYw92kOKFpv8xD8pGNCIOUmBoQxb")))
    private val pin = "sha256/86vXlbEB1UGCmyDzGegDjiFS1gauaEYmpiCips/7dGE="
    private val saved = CertificatePins.pins to CertificatePins.expires

    @After
    fun restore() {
        CertificatePins.pins = saved.first
        CertificatePins.expires = saved.second
    }

    @Test
    fun acceptsOnlyAChainWithAPinnedKeyUntilThePinsExpire() {
        assertEquals(pin, CertificatePins.pinOf(certificate))
        CertificatePins.pins = setOf("sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        CertificatePins.expires = LocalDate.of(2030, 1, 31)
        assertFalse(CertificatePins.accepts(arrayOf(certificate), LocalDate.of(2030, 1, 31)))
        // After the expiry an app that was never updated still reaches the bank
        assertTrue(CertificatePins.accepts(arrayOf(certificate), LocalDate.of(2030, 2, 1)))
        CertificatePins.pins = setOf("sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", pin)
        assertTrue(CertificatePins.accepts(arrayOf(certificate), LocalDate.of(2030, 1, 31)))
        CertificatePins.pins = emptySet()
        assertTrue(CertificatePins.accepts(arrayOf(certificate)))
    }
}
