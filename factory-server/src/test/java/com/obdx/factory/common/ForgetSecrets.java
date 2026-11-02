package com.obdx.factory.common;

import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

/**
 * Forgets the secret values a test registered (KnownSecrets lives for the whole JVM), before and after each test, so
 * that no test's result depends on which tests ran before it.
 */
public class ForgetSecrets implements BeforeEachCallback, AfterEachCallback {

    @Override
    public void beforeEach(ExtensionContext context) {
        KnownSecrets.clear();
    }

    @Override
    public void afterEach(ExtensionContext context) {
        KnownSecrets.clear();
    }
}
