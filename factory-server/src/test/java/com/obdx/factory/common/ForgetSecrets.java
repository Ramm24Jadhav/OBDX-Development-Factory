package com.obdx.factory.common;

import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.BeforeEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

/**
 * Forgets the secret values used at run time (KnownSecrets lives for the whole JVM), before and after each test, so
 * that no test's result depends on which tests ran before it. The settings' secrets stay: a cached Spring context
 * registers them once, when it starts.
 */
public class ForgetSecrets implements BeforeEachCallback, AfterEachCallback {

    @Override
    public void beforeEach(ExtensionContext context) {
        KnownSecrets.clearUsed();
    }

    @Override
    public void afterEach(ExtensionContext context) {
        KnownSecrets.clearUsed();
    }
}
