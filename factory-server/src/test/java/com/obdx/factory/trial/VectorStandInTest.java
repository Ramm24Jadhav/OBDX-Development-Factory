package com.obdx.factory.trial;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The trial database's pgvector stand-in supports the queries the factory runs. It is installed in a schema of its
 * own in the test database (which has the real pgvector), so the names resolve to the stand-in. Runs when
 * FACTORY_TEST_DB_URL is set.
 */
@EnabledIfEnvironmentVariable(named = "FACTORY_TEST_DB_URL", matches = ".+")
class VectorStandInTest {

    private final String schema = "vector_stand_in_" + UUID.randomUUID().toString().replace("-", "");
    private Connection connection;

    @BeforeEach
    void install() throws Exception {
        connection = DriverManager.getConnection(System.getenv("FACTORY_TEST_DB_URL"),
                System.getenv().getOrDefault("FACTORY_TEST_DB_USER", "factory"), System.getenv().getOrDefault("FACTORY_TEST_DB_PASSWORD", "factory"));
        String script;
        try (InputStream in = getClass().getResourceAsStream("/trial-database/vector--trial.sql")) {
            script = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        try (Statement statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA " + schema);
            statement.execute("SET search_path TO " + schema + ", pg_catalog");
            statement.execute(script);
            statement.execute("CREATE TABLE chunk (name text, embedding vector)");
        }
    }

    @AfterEach
    void remove() throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("DROP SCHEMA " + schema + " CASCADE");
        }
        connection.close();
    }

    @Test
    void ranksByCosineDistanceLikePgvector() throws SQLException {
        insert("same direction", "[2,0,0]");
        insert("diagonal", "[1,1,0]");
        insert("opposite", "[-1,0,0]");
        insert("no embedding", null);

        // The query of CodeSearchService, with the vector literal of CodeIndexRepository.toVectorLiteral
        List<String> ranked = new ArrayList<>();
        try (PreparedStatement query = connection.prepareStatement(
                "SELECT name, embedding <=> ?::vector AS distance FROM chunk "
                        + "WHERE embedding IS NOT NULL AND vector_dims(embedding) = vector_dims(?::vector) "
                        + "ORDER BY embedding <=> ?::vector LIMIT 10")) {
            for (int i = 1; i <= 3; i++) {
                query.setString(i, "[1.0,0.0,0.0]");
            }
            try (ResultSet result = query.executeQuery()) {
                while (result.next()) {
                    ranked.add(result.getString(1) + "=" + Math.round(result.getDouble(2) * 1000) / 1000.0);
                }
            }
        }
        assertThat(ranked).containsExactly("same direction=0.0", "diagonal=0.293", "opposite=2.0");
    }

    @Test
    void filtersOutOtherDimensionsAndRejectsNonVectors() throws SQLException {
        insert("two dimensions", "[1,0]");
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT count(*) FROM chunk WHERE vector_dims(embedding) = vector_dims('[1,0,0]'::vector)")) {
            result.next();
            assertThat(result.getInt(1)).isZero();
        }
        assertThatThrownBy(() -> insert("not a vector", "1,2,3")).isInstanceOf(SQLException.class);
    }

    private void insert(String name, String vector) throws SQLException {
        try (PreparedStatement insert = connection.prepareStatement("INSERT INTO chunk VALUES (?, ?::vector)")) {
            insert.setString(1, name);
            insert.setString(2, vector);
            insert.executeUpdate();
        }
    }
}
