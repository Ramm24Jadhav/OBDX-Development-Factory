package com.obdx.factory.pack;

import com.obdx.factory.change.FileChecks;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** The checks of generated Java that a bank's review would reject: the sample Fund Transfer change's mistakes. */
class JavaChecksTest {

    private final LocalChecks checks = new LocalChecks(VersionPacks.builtIn());
    private final CheckScope v22 = new CheckScope("22.x", Map.of(), Set.of());
    private static final String PATH = "backend/src/com/bank/payments/FundTransferResource.java";

    /** As a model wrote it for the sample BRD. */
    private static final String RESOURCE = """
            package com.bank.payments;

            import java.util.logging.Level;
            import java.util.logging.Logger;
            import javax.ws.rs.*;
            import javax.ws.rs.core.MediaType;
            import javax.ws.rs.core.Response;
            import javax.ws.rs.core.SecurityContext;

            @Path("/transfers")
            public class FundTransferResource {

                private static final Logger logger = Logger.getLogger(FundTransferResource.class.getName());

                @GET
                @Path("/{id}")
                @Produces({MediaType.APPLICATION_JSON})
                public Response read(@QueryParam("expand") String expand) {
                    logger.info("Reading transfer " + expand);
                    return Response.ok().build();
                }

                @POST
                @Consumes(MediaType.APPLICATION_JSON)
                public Response create(@Context SecurityContext security, TransferRequest request) {
                    try {
                        service.transfer(request.getCustomerId(), request.getAmount());
                        return Response.ok().build();
                    } catch (Exception e) {
                        return Response.status(500).entity(e.getMessage()).build();
                    }
                }
            }
            """;

    private static List<String> lines(FileChecks.Result result) {
        return result.message() == null ? List.of() : result.message().lines().toList();
    }

    @Test
    void findsTheSampleChangesMistakes() {
        FileChecks.Result result = checks.check(v22, PATH, null, RESOURCE);

        assertThat(result.status()).isEqualTo(FileChecks.Status.FAILED);
        assertThat(lines(result)).anySatisfy(l -> assertThat(l).startsWith("Line 16 (java-path-param, error)")
                .contains("read: @Path has {id} but no parameter has @PathParam(\"id\")"));
        assertThat(lines(result)).anySatisfy(l -> assertThat(l).contains("(java-jaxrs-import, error)")
                .contains("@Context").contains("import javax.ws.rs.core.Context;"));
        assertThat(lines(result)).anySatisfy(l -> assertThat(l).startsWith("Line 19 (java-log-concat, warning)"));
        assertThat(lines(result)).anySatisfy(l -> assertThat(l).startsWith("Line 27 (java-user-from-request, warning)"));
        assertThat(lines(result)).anySatisfy(l -> assertThat(l).startsWith("Line 30 (java-exception-text, warning)"));
        // the wildcard covers @GET, @Path and the others of javax.ws.rs
        assertThat(lines(result)).filteredOn(l -> l.contains("java-jaxrs-import")).hasSize(1);
    }

    @Test
    void aCorrectResourcePasses() {
        String fixed = RESOURCE
                .replace("import javax.ws.rs.core.MediaType;", "import javax.ws.rs.core.Context;\nimport javax.ws.rs.core.MediaType;")
                .replace("public Response read(@QueryParam(\"expand\") String expand)", "public Response read(@PathParam(\"id\") String id)")
                .replace("logger.info(\"Reading transfer \" + expand);", "logger.log(Level.FINE, \"Reading transfer {0}\", id);")
                .replace("request.getCustomerId()", "security.getUserPrincipal().getName()")
                .replace(".entity(e.getMessage())", ".entity(\"DIGX_TRF_001\")");

        FileChecks.Result result = checks.check(v22, PATH, null, fixed);

        assertThat(lines(result)).noneMatch(l -> l.contains("java-"));
    }

    @Test
    void aMissingImportWithoutAWildcardAndExplicitImportsAndJakarta() {
        String explicit = """
                package com.bank.payments;

                import jakarta.ws.rs.GET;

                public class Limits {
                    @GET
                    @Path("/limits/{type}")
                    public String read(@jakarta.ws.rs.PathParam("type") String type) {
                        return type;
                    }
                }
                """;

        List<String> found = lines(checks.check(v22, "backend/src/com/bank/payments/Limits.java", null, explicit));

        assertThat(found).filteredOn(l -> l.contains("java-jaxrs-import")).singleElement().asString()
                .contains("@Path").contains("import jakarta.ws.rs.Path;");
        assertThat(found).noneMatch(l -> l.contains("java-path-param"));
    }

    @Test
    void inAModifiedFileOnlyTheAddedLinesCount() {
        String original = """
                package com.bank.payments;

                class Audit {
                    void log(String id) {
                        logger.info("Audit " + id);
                    }
                }
                """;
        String changed = original.replace("        logger.info(\"Audit \" + id);\n",
                "        logger.info(\"Audit \" + id);\n        logger.warning(\"Changed \" + id);\n");

        List<String> found = lines(checks.check(v22, "backend/src/com/bank/payments/Audit.java", original, changed));

        assertThat(found).filteredOn(l -> l.contains("java-log-concat")).singleElement().asString().startsWith("Line 6");
    }
}
