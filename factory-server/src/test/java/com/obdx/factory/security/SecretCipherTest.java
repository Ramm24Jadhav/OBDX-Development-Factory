package com.obdx.factory.security;

import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SecretCipherTest {

    private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);

    @Test
    void encryptsAndDecrypts() {
        SecretCipher cipher = new SecretCipher(KEY);

        String encrypted = cipher.encrypt("s3cret-Passw0rd");

        assertThat(encrypted).doesNotContain("s3cret");
        assertThat(cipher.encrypt("s3cret-Passw0rd")).isNotEqualTo(encrypted);
        assertThat(cipher.decrypt(encrypted)).isEqualTo("s3cret-Passw0rd");
    }

    @Test
    void refusesToStoreSecretsWithoutKey() {
        assertThatThrownBy(() -> new SecretCipher("").encrypt("x"))
                .isInstanceOf(SecretCipher.MissingSecretKeyException.class)
                .hasMessageContaining("FACTORY_SECRET_KEY");
    }

    @Test
    void rejectsKeyOfWrongLength() {
        assertThatThrownBy(() -> new SecretCipher(Base64.getEncoder().encodeToString(new byte[16])))
                .hasMessageContaining("32 bytes");
    }

    @Test
    void failsClearlyWhenKeyChanged() {
        String encrypted = new SecretCipher(KEY).encrypt("x");
        byte[] other = new byte[32];
        other[0] = 1;

        assertThatThrownBy(() -> new SecretCipher(Base64.getEncoder().encodeToString(other)).decrypt(encrypted))
                .hasMessageContaining("Was FACTORY_SECRET_KEY changed?");
    }
}
