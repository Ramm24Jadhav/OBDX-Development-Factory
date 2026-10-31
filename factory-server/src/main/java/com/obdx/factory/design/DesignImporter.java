package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.requirements.DocumentTextExtractor;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.ProxySelector;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads a screen design made outside the factory, for the model to turn into a Screen Model: a Figma frame (through
 * the Figma REST API, as an outline of its frames, texts and component instances), a PDF exported from a design tool
 * (its text, in reading order), or an image (a screenshot or mock-up, for a model that reads images).
 */
@Component
public class DesignImporter {

    /** What was imported: a text outline, or an image; source describes it for the version note. */
    public record Design(String source, String outline, byte[] image, String imageType) {
    }

    private static final Pattern FIGMA_LINK = Pattern.compile("figma\\.com/(?:file|design|proto|board)/([A-Za-z0-9]+)");
    private static final Pattern NODE_ID = Pattern.compile("[?&]node-id=([^&#]+)");
    /** Shapes that only decorate a design. */
    private static final Set<String> DECORATION = Set.of("VECTOR", "ELLIPSE", "LINE", "STAR", "REGULAR_POLYGON",
            "BOOLEAN_OPERATION", "RECTANGLE", "SLICE");
    private static final int MAX_LINES = 500;
    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    private static final String FIGMA_API = "https://api.figma.com/v1/";

    private final DocumentTextExtractor extractor;
    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().proxy(ProxySelector.getDefault())
            .connectTimeout(Duration.ofSeconds(20)).followRedirects(HttpClient.Redirect.NORMAL).build();

    public DesignImporter(DocumentTextExtractor extractor, ObjectMapper json) {
        this.extractor = extractor;
        this.json = json;
    }

    /** A design file: PNG, JPG or WebP as an image, PDF as its text. */
    public Design fromFile(String fileName, byte[] bytes) {
        String name = fileName == null ? "design" : fileName;
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".pdf")) {
            return new Design("PDF " + name, extractor.extract(name, bytes), null, null);
        }
        String type = lower.endsWith(".png") ? "image/png" : lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg"
                : lower.endsWith(".webp") ? "image/webp" : null;
        if (type == null) {
            throw new BadRequestException("Upload a PNG, JPG or WebP image, or a PDF exported from the design tool.");
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new BadRequestException("The image is larger than 10 MB. Export it smaller, or as a PDF.");
        }
        return new Design("image " + name, null, bytes, type);
    }

    /** A frame of a Figma file, from a link copied with "Copy link to selection". */
    public Design fromFigma(String link, String token) {
        FigmaFrame frame = parseLink(link);
        if (token == null || token.isBlank()) {
            throw new BadRequestException("Enter a Figma personal access token (Figma: Settings, Security, Personal access tokens).");
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(FIGMA_API + "files/" + frame.fileKey() + "/nodes?ids="
                        + java.net.URLEncoder.encode(frame.nodeId(), StandardCharsets.UTF_8)))
                .header("X-Figma-Token", token.strip()).timeout(Duration.ofSeconds(60)).GET().build();
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new BadRequestException("Could not reach Figma (" + e.getMessage() + "). Check the internet connection, or export the frame as a PDF.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BadRequestException("The Figma request was interrupted");
        }
        if (response.statusCode() == 403 || response.statusCode() == 401) {
            throw new BadRequestException("Figma did not accept the token. Use a personal access token that can read this file.");
        }
        if (response.statusCode() == 404) {
            throw new BadRequestException("Figma did not find that file. Copy the link again with \"Copy link to selection\".");
        }
        if (response.statusCode() != 200) {
            throw new BadRequestException("Figma answered with HTTP " + response.statusCode() + ". Try again, or export the frame as a PDF.");
        }
        try {
            JsonNode entry = json.readTree(response.body()).path("nodes").path(frame.nodeId());
            JsonNode document = entry.path("document");
            if (document.isMissingNode() || document.isNull()) {
                throw new BadRequestException("Figma did not find that frame in the file. Copy the link with \"Copy link to selection\" on the frame.");
            }
            return new Design("Figma frame \"" + document.path("name").asString("") + "\"", outline(document, entry.path("components")), null, null);
        } catch (JacksonException e) {
            throw new BadRequestException("Figma's answer could not be read: " + e.getOriginalMessage());
        }
    }

    record FigmaFrame(String fileKey, String nodeId) {
    }

    /** The file key and node id of a Figma link; node ids are written 12-34 in links and 12:34 in the API. */
    static FigmaFrame parseLink(String link) {
        if (link == null || link.isBlank()) {
            throw new BadRequestException("Paste the link of a Figma frame");
        }
        Matcher file = FIGMA_LINK.matcher(link);
        if (!file.find()) {
            throw new BadRequestException("That is not a Figma file link. In Figma, select the frame and use \"Copy link to selection\".");
        }
        Matcher node = NODE_ID.matcher(link);
        if (!node.find()) {
            throw new BadRequestException("The link names no frame. In Figma, select the frame and use \"Copy link to selection\".");
        }
        String nodeId = URLDecoder.decode(node.group(1), StandardCharsets.UTF_8).replace('-', ':');
        return new FigmaFrame(file.group(1), nodeId);
    }

    /**
     * An indented outline of a Figma node, in reading order (top to bottom, then left to right): frames and groups
     * with their names, texts with their characters, component instances with their component's name. Hidden layers
     * and decorative shapes are left out.
     */
    static String outline(JsonNode node, JsonNode components) {
        List<String> lines = new ArrayList<>();
        outline(node, components, 0, lines);
        if (lines.size() >= MAX_LINES) {
            lines.add("(more layers left out)");
        }
        return String.join("\n", lines);
    }

    private static void outline(JsonNode node, JsonNode components, int depth, List<String> lines) {
        if (lines.size() >= MAX_LINES || !node.path("visible").asBoolean(true)) {
            return;
        }
        String type = node.path("type").asString("");
        if (DECORATION.contains(type)) {
            return;
        }
        StringBuilder line = new StringBuilder("  ".repeat(depth)).append(type.toLowerCase(Locale.ROOT))
                .append(" \"").append(node.path("name").asString("")).append('"');
        if ("TEXT".equals(type)) {
            line.append(": ").append(node.path("characters").asString("").replace('\n', ' ').strip());
        }
        if ("INSTANCE".equals(type)) {
            String component = components.path(node.path("componentId").asString("")).path("name").asString("");
            if (!component.isEmpty()) {
                line.append(" (component ").append(component).append(')');
            }
        }
        if ("HORIZONTAL".equals(node.path("layoutMode").asString(""))) {
            line.append(" [side by side]");
        }
        lines.add(line.toString());
        List<JsonNode> children = new ArrayList<>();
        node.path("children").forEach(children::add);
        children.sort(Comparator.comparingDouble((JsonNode c) -> c.path("absoluteBoundingBox").path("y").asDouble(0))
                .thenComparingDouble(c -> c.path("absoluteBoundingBox").path("x").asDouble(0)));
        for (JsonNode child : children) {
            outline(child, components, depth + 1, lines);
        }
    }
}
