package com.obdx.factory.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Encrypts secrets stored in the database (such as SVN passwords) with AES-256-GCM.
 * The key comes from FACTORY_SECRET_KEY (32 random bytes, base64), kept outside the database.
 */
@Component
public class SecretCipher {

    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public SecretCipher(@Value("${factory.security.secret-key:}") String base64Key) {
        if (base64Key == null || base64Key.isBlank()) {
            this.key = null;
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64Key.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("FACTORY_SECRET_KEY must be base64-encoded", e);
        }
        if (bytes.length != 32) {
            throw new IllegalStateException("FACTORY_SECRET_KEY must decode to 32 bytes, got " + bytes.length);
        }
        this.key = new SecretKeySpec(bytes, "AES");
    }

    public String encrypt(String plainText) {
        requireKey();
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + encrypted.length).put(iv).put(encrypted).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not encrypt secret", e);
        }
    }

    public String decrypt(String cipherText) {
        requireKey();
        try {
            byte[] all = Base64.getDecoder().decode(cipherText);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, all, 0, IV_BYTES));
            return new String(cipher.doFinal(all, IV_BYTES, all.length - IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("Could not decrypt secret. Was FACTORY_SECRET_KEY changed?", e);
        }
    }

    private void requireKey() {
        if (key == null) {
            throw new MissingSecretKeyException();
        }
    }

    public static class MissingSecretKeyException extends RuntimeException {
        public MissingSecretKeyException() {
            super("FACTORY_SECRET_KEY is not set, so passwords cannot be stored. "
                    + "Generate one with 'openssl rand -base64 32' and set it in the server settings.");
        }
    }
}
