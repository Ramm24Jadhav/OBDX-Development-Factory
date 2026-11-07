package com.bank.obdx.api

import com.bank.obdx.BuildConfig
import java.security.MessageDigest
import java.security.cert.Certificate
import java.time.LocalDate
import java.util.Base64

/**
 * Certificate pinning: the app talks only to a server whose certificate chain holds one of the bank's public keys.
 * The pins (sha256/<base64 of the SHA-256 of the key's SubjectPublicKeyInfo>, comma separated) and the date they stop
 * being enforced are set by the bank in gradle.properties (obdx.pins, obdx.pinsExpire). Ship the next certificate's
 * pin as a second pin in an app update before the certificate changes. No pins: pinning is off (development only).
 */
object CertificatePins {
    var pins: Set<String> = BuildConfig.OBDX_PINS.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
    /** After this day the pins are not enforced, so an app that was never updated still reaches the bank. */
    var expires: LocalDate? = BuildConfig.OBDX_PINS_EXPIRE.trim().ifEmpty { null }?.let(LocalDate::parse)

    const val UPDATE_MESSAGE =
        "The app could not confirm it is talking to your bank. Update the app from the store; if it is up to date, try another network."

    /** The pin of a certificate's public key, as openssl prints it (see the README). */
    fun pinOf(certificate: Certificate): String =
        "sha256/" + Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(certificate.publicKey.encoded))

    fun accepts(chain: Array<out Certificate>, today: LocalDate = LocalDate.now()): Boolean =
        pins.isEmpty() || expires?.let { today.isAfter(it) } == true || chain.any { pinOf(it) in pins }
}
