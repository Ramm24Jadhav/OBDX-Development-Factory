package com.obdx.factory.profile;

import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.obdx.factory.profile.ProfileFact.Confidence.HIGH;
import static com.obdx.factory.profile.ProfileFact.Confidence.MEDIUM;
import static com.obdx.factory.profile.ProfileFact.Section.DATA;

/**
 * Database type, table naming and where database scripts live.
 */
@Component
@Order(4)
public class DataDetector implements ProfileDetector {

    private static final Pattern JDBC_URL = Pattern.compile("jdbc:(oracle|postgresql|mysql|sqlserver|db2|h2)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ORACLE_SQL = Pattern.compile(
            "\\b(VARCHAR2|NVARCHAR2|NUMBER\\s*\\(|SYSDATE|SYSTIMESTAMP|NVL\\s*\\(|FROM\\s+DUAL|CREATE\\s+OR\\s+REPLACE\\s+(PACKAGE|PROCEDURE|TRIGGER)|PLS_INTEGER|ROWNUM)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern POSTGRES_SQL = Pattern.compile("\\b(BIGSERIAL|SERIAL|JSONB|BYTEA|TIMESTAMPTZ|ILIKE)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern MYSQL_SQL = Pattern.compile("\\b(AUTO_INCREMENT|ENGINE\\s*=)", Pattern.CASE_INSENSITIVE);
    private static final Pattern TABLE_NAME = Pattern.compile(
            "\\b(?:CREATE\\s+TABLE|INSERT\\s+INTO|UPDATE|ALTER\\s+TABLE|DELETE\\s+FROM)\\s+(?:\"?\\w+\"?\\.)?\"?(\\w+)\"?",
            Pattern.CASE_INSENSITIVE);

    @Override
    public List<ProfileFact> detect(SourceTree tree) {
        List<String> sqlFiles = tree.withExtension("sql");
        return List.of(databaseType(tree, sqlFiles), tableNaming(tree, sqlFiles), scriptFolders(sqlFiles));
    }

    private ProfileFact databaseType(SourceTree tree, List<String> sqlFiles) {
        Tally declared = new Tally();
        for (String path : tree.withExtension("properties", "xml", "yml", "yaml", "json")) {
            Matcher matcher = JDBC_URL.matcher(tree.read(path));
            while (matcher.find()) {
                declared.add(databaseName(matcher.group(1)), path);
            }
        }
        if (!declared.isEmpty()) {
            return ProfileFact.of("data.databaseType", DATA, "Database", declared.top(1).getFirst() + " (from JDBC URLs)", HIGH, declared.evidence(3));
        }
        Tally dialects = new Tally();
        for (String path : sqlFiles) {
            String content = tree.read(path);
            if (ORACLE_SQL.matcher(content).find()) {
                dialects.add("Oracle Database", path);
            } else if (POSTGRES_SQL.matcher(content).find()) {
                dialects.add("PostgreSQL", path);
            } else if (MYSQL_SQL.matcher(content).find()) {
                dialects.add("MySQL", path);
            }
        }
        if (dialects.isEmpty()) {
            return ProfileFact.notFound("data.databaseType", DATA, "Database");
        }
        return ProfileFact.of("data.databaseType", DATA, "Database",
                dialects.top(1).getFirst() + " (SQL dialect in " + dialects.describe(3, "script") + ")",
                dialects.confidenceByCount(3), dialects.evidence(3));
    }

    private ProfileFact tableNaming(SourceTree tree, List<String> sqlFiles) {
        Tally prefixes = new Tally();
        for (String path : sqlFiles) {
            Matcher matcher = TABLE_NAME.matcher(tree.read(path));
            while (matcher.find()) {
                String table = matcher.group(1).toUpperCase(Locale.ROOT);
                int underscore = table.indexOf('_');
                prefixes.add(underscore > 0 ? table.substring(0, underscore + 1) + "*" : "(no prefix)", path);
            }
        }
        return ProfileFact.of("data.tableNaming", DATA, "Table name prefixes", prefixes.describe(5, "statement"),
                prefixes.confidenceByCount(10), prefixes.evidence(3));
    }

    private ProfileFact scriptFolders(List<String> sqlFiles) {
        Tally folders = new Tally();
        sqlFiles.forEach(path -> folders.add(path.contains("/") ? path.substring(0, path.lastIndexOf('/')) + "/" : "(root)", path));
        return ProfileFact.of("data.scriptFolders", DATA, "Database script folders", folders.describe(5, "script"),
                MEDIUM, folders.evidence(3));
    }

    private static String databaseName(String jdbcType) {
        return switch (jdbcType.toLowerCase(Locale.ROOT)) {
            case "oracle" -> "Oracle Database";
            case "postgresql" -> "PostgreSQL";
            case "mysql" -> "MySQL";
            case "sqlserver" -> "SQL Server";
            case "db2" -> "IBM Db2";
            default -> "H2";
        };
    }
}
