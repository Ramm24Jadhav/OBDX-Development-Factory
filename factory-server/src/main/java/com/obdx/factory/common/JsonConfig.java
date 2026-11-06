package com.obdx.factory.common;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonParser;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.JacksonModule;
import tools.jackson.databind.deser.jdk.StringDeserializer;
import tools.jackson.databind.module.SimpleModule;

/**
 * Request bodies may not carry a NUL character in a text: PostgreSQL refuses it with an error that would be a 500, so
 * it is refused when the JSON is read, with a 400 that says what to do.
 */
@Configuration
public class JsonConfig {

    /** What the 400 says. */
    public static final String NUL_MESSAGE = "A text in the request has a NUL character, which cannot be stored. Remove it and try again.";

    /** Spring Boot adds every JacksonModule bean to the JSON mapper that reads request bodies. */
    @Bean
    public JacksonModule nulRejectingStrings() {
        return new SimpleModule("nul-rejecting-strings").addDeserializer(String.class, new NulRejectingStringDeserializer());
    }

    /** The standard String deserializer, refusing a value with a NUL character. */
    static final class NulRejectingStringDeserializer extends StringDeserializer {

        @Override
        public String deserialize(JsonParser p, DeserializationContext ctxt) throws JacksonException {
            String value = super.deserialize(p, ctxt);
            if (value != null && value.indexOf('\0') >= 0) {
                throw new NulInTextException(p);
            }
            return value;
        }
    }

    /** Thrown when a JSON text has a NUL character; ApiExceptionHandler answers it with 400. */
    public static final class NulInTextException extends tools.jackson.core.exc.StreamReadException {

        NulInTextException(JsonParser p) {
            super(p, NUL_MESSAGE);
        }
    }
}
