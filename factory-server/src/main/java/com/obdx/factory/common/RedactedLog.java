package com.obdx.factory.common;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.Appender;
import ch.qos.logback.core.OutputStreamAppender;
import ch.qos.logback.core.encoder.Encoder;
import ch.qos.logback.core.encoder.EncoderBase;
import ch.qos.logback.core.encoder.LayoutWrappingEncoder;
import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.boot.context.logging.LoggingApplicationListener;
import org.springframework.context.ApplicationListener;
import org.springframework.core.Ordered;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

/**
 * Keeps secrets out of the log: every line the factory writes (console and file), stack traces included, goes through
 * {@link Messages#redacted}. A model server's error body can quote the API key and an SVN server's error the password,
 * and libraries put those bodies into their exception messages ("Caused by: ...InternalServerException: {...}"), which
 * no single logger call can clean. Installed right after Spring Boot sets up logging (META-INF/spring.factories).
 */
public final class RedactedLog {

    /**
     * Marks the one line that must show a secret as it is: the first administrator's random password, written once to
     * the log so that someone can sign in. Nothing else uses it.
     */
    public static final org.slf4j.Marker SHOWN_ONCE = org.slf4j.MarkerFactory.getDetachedMarker("SHOWN_ONCE");

    private RedactedLog() {
    }

    /** Wraps the encoder of every appender that writes text (Spring Boot's CONSOLE and FILE); once. */
    public static void install() {
        if (!(org.slf4j.LoggerFactory.getILoggerFactory() instanceof LoggerContext context)) {
            return;
        }
        for (Logger logger : context.getLoggerList()) {
            for (Iterator<Appender<ILoggingEvent>> it = logger.iteratorForAppenders(); it.hasNext(); ) {
                if (it.next() instanceof OutputStreamAppender<ILoggingEvent> appender
                        && !(appender.getEncoder() instanceof RedactingEncoder) && appender.getEncoder() != null) {
                    RedactingEncoder encoder = new RedactingEncoder(appender.getEncoder(), appender instanceof ch.qos.logback.core.ConsoleAppender);
                    encoder.start();
                    appender.setEncoder(encoder);
                }
            }
        }
    }

    /** The lines of another encoder, redacted. */
    static final class RedactingEncoder extends EncoderBase<ILoggingEvent> {

        private final Encoder<ILoggingEvent> inner;
        /** Whether it writes to the console, where the line marked SHOWN_ONCE stays readable (a log file never has it). */
        private final boolean console;
        private final Charset charset;

        RedactingEncoder(Encoder<ILoggingEvent> inner, boolean console) {
            this.console = console;
            this.inner = inner;
            Charset set = inner instanceof LayoutWrappingEncoder<ILoggingEvent> layout ? layout.getCharset() : null;
            this.charset = set == null ? StandardCharsets.UTF_8 : set;
            setContext(inner.getContext());
        }

        @Override
        public byte[] headerBytes() {
            return inner.headerBytes();
        }

        @Override
        public byte[] encode(ILoggingEvent event) {
            byte[] bytes = inner.encode(event);
            if (bytes == null || bytes.length == 0 || console && shownOnce(event)) {
                return bytes;
            }
            String text = new String(bytes, charset);
            String redacted = Messages.redacted(text);
            return redacted.equals(text) ? bytes : redacted.getBytes(charset);
        }

        /** Marked with this class's own SHOWN_ONCE instance (a marker of the same name made elsewhere does not count). */
        private static boolean shownOnce(ILoggingEvent event) {
            if (event.getMarkerList() == null) {
                return false;
            }
            for (org.slf4j.Marker marker : event.getMarkerList()) {
                if (marker == SHOWN_ONCE) {
                    return true;
                }
            }
            return false;
        }

        @Override
        public byte[] footerBytes() {
            return inner.footerBytes();
        }

        @Override
        public void start() {
            if (!inner.isStarted()) {
                inner.start();
            }
            super.start();
        }

        @Override
        public void stop() {
            inner.stop();
            super.stop();
        }
    }

    /** Installs the redaction once Spring Boot has configured logging for the application. */
    public static final class Installer implements ApplicationListener<ApplicationEnvironmentPreparedEvent>, Ordered {

        @Override
        public void onApplicationEvent(ApplicationEnvironmentPreparedEvent event) {
            install();
        }

        @Override
        public int getOrder() {
            return LoggingApplicationListener.DEFAULT_ORDER + 1;
        }
    }
}
