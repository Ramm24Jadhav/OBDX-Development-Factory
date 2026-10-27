package com.obdx.factory.trial;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

import javax.sql.DataSource;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;

/**
 * The trial database (FACTORY_TRIAL_DATABASE=true): a PostgreSQL server the factory starts itself, with its data in the
 * factory's data folder, so a laptop or test server needs no database installation. It listens on localhost only and
 * stops with the factory. For shared use, use a PostgreSQL server with pgvector (FACTORY_DB_URL).
 * <p>
 * The bundled PostgreSQL has no pgvector, which has no Windows build. The trial database gets a pure-SQL stand-in
 * under the same name, installed as the "vector" extension, which covers what the factory uses (the vector type,
 * vector_dims and the {@code <=>} cosine distance), without a vector index.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnBooleanProperty("factory.trial-database.enabled")
public class TrialDatabaseConfig {

    private static final Logger log = LoggerFactory.getLogger(TrialDatabaseConfig.class);

    @Bean(destroyMethod = "close")
    public EmbeddedPostgres trialPostgres(@Value("${factory.trial-database.directory}") Path directory) throws IOException {
        Path data = directory.toAbsolutePath();
        Files.createDirectories(data);
        log.info("Starting the trial database in {} (first start takes a minute)", data);
        EmbeddedPostgres postgres = EmbeddedPostgres.builder()
                .setDataDirectory(data)
                .setCleanDataDirectory(false)
                .setLocaleConfig("locale", "C")
                .setPGStartupWait(Duration.ofMinutes(2))
                .start();
        installVectorStandIn(postgres);
        log.info("Trial database ready on localhost:{}. For shared use, use a PostgreSQL server (FACTORY_DB_URL)", postgres.getPort());
        return postgres;
    }

    @Bean
    public DataSource dataSource(EmbeddedPostgres trialPostgres) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(trialPostgres.getJdbcUrl("postgres", "postgres"));
        config.setPoolName("trial-database");
        config.setMaximumPoolSize(10);
        return new HikariDataSource(config);
    }

    /** Puts the stand-in "vector" extension into the server's extension folder, where CREATE EXTENSION finds it. */
    private static void installVectorStandIn(EmbeddedPostgres postgres) throws IOException {
        Path extensions;
        try (Connection connection = postgres.getPostgresDatabase().getConnection();
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT setting FROM pg_config WHERE name = 'SHAREDIR'")) {
            result.next();
            extensions = Path.of(result.getString(1), "extension");
        } catch (SQLException e) {
            throw new IllegalStateException("Could not read the trial database's extension folder", e);
        }
        for (String file : new String[]{"vector.control", "vector--trial.sql"}) {
            try (InputStream in = new ClassPathResource("trial-database/" + file).getInputStream()) {
                Files.copy(in, extensions.resolve(file), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException e) {
                throw new UncheckedIOException("Could not install " + file + " in " + extensions, e);
            }
        }
    }
}
