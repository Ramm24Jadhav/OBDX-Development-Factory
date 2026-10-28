package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.NotFoundException;
import com.obdx.factory.model.ModelGateway;
import com.obdx.factory.model.ModelGatewayException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Components a team makes in the designer and reuses on its screens: the model writes plain HTML, CSS and script from
 * a description, an image of the component, or a design (a Figma frame or a PDF). They appear in the workspace's
 * palette; placing one copies its code into the screen element, which the canvas draws in a sandboxed frame.
 */
@Service
public class CustomComponents {

    public record CustomComponent(UUID id, String name, String tag, String description, String html, String css,
                                  String script, String source, OffsetDateTime createdAt, String createdBy) {
    }

    static final String SYSTEM = """
            You build one reusable screen component for Oracle Banking Digital Experience (OBDX) web screens, as plain
            HTML, CSS and JavaScript. Answer with one JSON object and nothing else:
            {"name": "short name", "description": "one sentence: what it shows or does", "html": "...", "css": "...", "script": "..."}

            Rules:
            - html is a fragment: no <html>, <head>, <body>, <style> or <script> tags. Use semantic elements and labels.
            - css styles only this component: begin every rule with "&", which stands for the component, for example
              "& .title { font-weight: 600; }". Follow the OBDX Redwood look: 12-16px text, #1f2937 text, #2b6cb0
              accent, 6-8px corners, white cards with a #e3e6eb border.
            - script is plain JavaScript for this component's own markup, without libraries; "" when it needs no
              behaviour. It must not call servers.
            - Use realistic banking sample content (rupee amounts, masked account numbers such as xxxx1234).
            - No external URLs, fonts or images; draw icons with CSS or Unicode characters.
            - The component must work at phone width (360px) and wide screens: use flexible widths, wrap where needed.
            """;

    private static final int MAX_CODE = 20_000;

    private final JdbcTemplate jdbc;
    private final ModelGateway modelGateway;
    private final ObjectMapper json;

    public CustomComponents(JdbcTemplate jdbc, ModelGateway modelGateway, ObjectMapper json) {
        this.jdbc = jdbc;
        this.modelGateway = modelGateway;
        this.json = json;
    }

    public List<CustomComponent> list(UUID workspaceId) {
        return jdbc.query("""
                        SELECT id, name, tag, description, html, css, script, source, created_at, created_by
                        FROM custom_component WHERE workspace_id = ? ORDER BY name""",
                (rs, i) -> new CustomComponent(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4),
                        rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8), rs.getObject(9, OffsetDateTime.class),
                        rs.getString(10)), workspaceId);
    }

    /**
     * Has the model write a component and stores it.
     *
     * @param prompt what the component should be (may be empty when a design is given)
     * @param design an image, Figma frame or PDF to build it from, or null
     */
    public CustomComponent create(UUID workspaceId, String name, String prompt, DesignImporter.Design design, String createdBy) {
        String wanted = prompt == null ? "" : prompt.strip();
        if (wanted.isEmpty() && design == null) {
            throw new BadRequestException("Describe the component, or give an image or a Figma link to build it from");
        }
        StringBuilder user = new StringBuilder();
        if (name != null && !name.isBlank()) {
            user.append("Component name: ").append(name.strip()).append('\n');
        }
        if (!wanted.isEmpty()) {
            user.append("What it should be: ").append(wanted).append('\n');
        }
        if (design != null) {
            user.append("Build it to look like this design (").append(design.source()).append("):\n")
                    .append(design.outline() != null ? design.outline() : "the attached image").append('\n');
        }
        JsonNode answer = ask(user.toString(), design);
        String finalName = name != null && !name.isBlank() ? name.strip() : answer.path("name").asString("Custom component").strip();
        String html = code(answer.path("html").asString(""), "HTML");
        if (html == null) {
            throw new BadRequestException("The model did not write the component's HTML. Try describing it differently.");
        }
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        String tag = uniqueTag(workspaceId, finalName);
        String description = blankToNull(answer.path("description").asString(""));
        String source = design != null ? design.source() : "Description";
        CustomComponent component = new CustomComponent(id, finalName, tag, description, html, code(answer.path("css").asString(""), "CSS"),
                code(answer.path("script").asString(""), "script"), source, now, createdBy);
        jdbc.update("""
                        INSERT INTO custom_component (id, workspace_id, name, tag, description, html, css, script, source, created_at, created_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                component.id(), workspaceId, component.name(), component.tag(), component.description(), component.html(),
                component.css(), component.script(), component.source(), component.createdAt(), component.createdBy());
        return component;
    }

    public void delete(UUID workspaceId, UUID id) {
        if (jdbc.update("DELETE FROM custom_component WHERE workspace_id = ? AND id = ?", workspaceId, id) == 0) {
            throw new NotFoundException("No such custom component");
        }
    }

    private JsonNode ask(String user, DesignImporter.Design design) {
        String prompt = user;
        String problem = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            String reply;
            try {
                reply = design != null && design.image() != null
                        ? modelGateway.chatJsonWithImage(SYSTEM, prompt, design.image(), design.imageType()).reply()
                        : modelGateway.chatJson(SYSTEM, prompt).reply();
            } catch (ModelGatewayException e) {
                if (design == null || design.image() == null) {
                    throw e;
                }
                throw new BadRequestException("The chat model could not read the image (" + e.getMessage() + "). Choose a model that"
                        + " reads images on the Models page, or describe the component or give a Figma link instead.");
            }
            int start = reply.indexOf('{');
            int end = reply.lastIndexOf('}');
            if (start >= 0 && end > start) {
                try {
                    JsonNode node = json.readTree(reply.substring(start, end + 1));
                    if (node.isObject() && !node.path("html").asString("").isBlank()) {
                        return node;
                    }
                    problem = "it had no html";
                } catch (JacksonException e) {
                    problem = "it was not valid JSON";
                }
            } else {
                problem = "it contained no JSON object";
            }
            prompt = user + "\n\nYour previous answer could not be used (" + problem + "). Answer with only the JSON object.";
        }
        throw new BadRequestException("The model did not return a usable component (" + problem + "). Try again or describe it differently.");
    }

    /** A tag for the component, from its name, unique in the workspace: "Rate ticker" gives "rate-ticker". */
    private String uniqueTag(UUID workspaceId, String name) {
        String base = name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (base.isEmpty()) {
            base = "custom-component";
        }
        String tag = base;
        for (int i = 2; Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT count(*) > 0 FROM custom_component WHERE workspace_id = ? AND tag = ?", Boolean.class, workspaceId, tag)); i++) {
            tag = base + "-" + i;
        }
        return tag;
    }

    private static String code(String value, String what) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (value.length() > MAX_CODE) {
            throw new BadRequestException("The model wrote more than " + MAX_CODE + " characters of " + what + ". Describe a smaller component.");
        }
        return value.strip();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
