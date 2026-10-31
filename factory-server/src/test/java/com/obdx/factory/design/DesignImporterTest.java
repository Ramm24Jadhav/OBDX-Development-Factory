package com.obdx.factory.design;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.requirements.DocumentTextExtractor;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DesignImporterTest {

    private final JsonMapper json = JsonMapper.builder().build();
    private final DesignImporter importer = new DesignImporter(new DocumentTextExtractor(), json);

    @Test
    void readsFileKeyAndFrameFromFigmaLinks() {
        assertThat(DesignImporter.parseLink("https://www.figma.com/design/AbC123xyz/Payments?node-id=12-345&t=x"))
                .isEqualTo(new DesignImporter.FigmaFrame("AbC123xyz", "12:345"));
        assertThat(DesignImporter.parseLink("https://www.figma.com/file/KEY9/Old-link?type=design&node-id=1%3A2"))
                .isEqualTo(new DesignImporter.FigmaFrame("KEY9", "1:2"));
        assertThatThrownBy(() -> DesignImporter.parseLink("https://www.figma.com/design/KEY9/Payments"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("Copy link to selection");
        assertThatThrownBy(() -> DesignImporter.parseLink("https://example.com/x"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("not a Figma file link");
    }

    @Test
    void outlinesAFrameInReadingOrderWithoutDecoration() {
        JsonNode frame = json.readTree("""
                {"type": "FRAME", "name": "Transfer", "children": [
                  {"type": "INSTANCE", "name": "Button", "componentId": "9:1", "absoluteBoundingBox": {"x": 0, "y": 500}},
                  {"type": "TEXT", "name": "Title", "characters": "Transfer money", "absoluteBoundingBox": {"x": 0, "y": 0}},
                  {"type": "FRAME", "name": "Row", "layoutMode": "HORIZONTAL", "absoluteBoundingBox": {"x": 0, "y": 100}, "children": [
                    {"type": "TEXT", "name": "Amount", "characters": "Amount", "absoluteBoundingBox": {"x": 300, "y": 100}},
                    {"type": "TEXT", "name": "From", "characters": "From\\naccount", "absoluteBoundingBox": {"x": 0, "y": 100}}]},
                  {"type": "VECTOR", "name": "Logo"},
                  {"type": "TEXT", "name": "Hidden", "characters": "x", "visible": false}]}
                """);
        JsonNode components = json.readTree("{\"9:1\": {\"name\": \"Button/Primary\"}}");

        assertThat(DesignImporter.outline(frame, components)).isEqualTo("""
                frame "Transfer"
                  text "Title": Transfer money
                  frame "Row" [side by side]
                    text "From": From account
                    text "Amount": Amount
                  instance "Button" (component Button/Primary)""");
    }

    @Test
    void acceptsImagesAndPdfsOnly() {
        assertThat(importer.fromFile("mock.PNG", new byte[]{1}).imageType()).isEqualTo("image/png");
        assertThat(importer.fromFile("mock.jpeg", new byte[]{1}).source()).isEqualTo("image mock.jpeg");
        assertThatThrownBy(() -> importer.fromFile("design.fig", new byte[]{1}))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("PNG, JPG or WebP");
    }

    @Test
    void figmaNeedsAToken() {
        assertThatThrownBy(() -> importer.fromFigma("https://www.figma.com/design/K/x?node-id=1-2", " "))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("personal access token");
    }
}
