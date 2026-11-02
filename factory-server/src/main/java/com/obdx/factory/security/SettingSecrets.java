package com.obdx.factory.security;

import com.obdx.factory.common.KnownSecrets;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

/**
 * Masks the secrets of the settings (LDAP manager password, OIDC client secrets, the model API key and the secret key
 * from the settings file or environment) in messages and the log, by their values: a server's error can echo them
 * ({@link KnownSecrets}). The secrets stored in the database (SVN passwords, Jenkins tokens, the Models page's keys)
 * are masked when they are read for use.
 */
@Component
class SettingSecrets {

    /**
     * Setting names whose values are secrets: factory.auth.ldap.manager-password, ...registration.sso.client-secret,
     * factory.model.api-key, FACTORY_SECRET_KEY, the first administrator's password (FACTORY_ADMIN_PASSWORD,
     * factory.auth.initial-admin-password) and their environment variable forms. Not the database password: the trial
     * database's "factory" would hide the word everywhere.
     */
    static final Pattern SECRET_SETTING = Pattern.compile(
            "(?i).*(?:manager[-_.]?password|admin[-_.]?password|client[-_.]?secret|api[-_.]?key|secret[-_.]?key|private[-_.]?key|[-_.]token)$");

    SettingSecrets(ConfigurableEnvironment environment) {
        for (PropertySource<?> source : environment.getPropertySources()) {
            if (source instanceof EnumerablePropertySource<?> enumerable) {
                for (String name : enumerable.getPropertyNames()) {
                    if (SECRET_SETTING.matcher(name).matches()) {
                        try {
                            // resolved: a value written as ${FACTORY_...} is masked as what it stands for
                            KnownSecrets.setting("setting:" + name, environment.getProperty(name));
                        } catch (RuntimeException e) {
                            // not resolvable: nothing to mask
                        }
                    }
                }
            }
        }
    }
}
