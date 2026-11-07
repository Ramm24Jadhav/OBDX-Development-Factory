package com.obdx.factory.issue;

import com.obdx.factory.model.ModelGateway;
import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScreenshotBlurTest {

    /** A gateway that answers the screenshot question with the given reply. */
    static ModelGateway model(boolean local, String reply) {
        return new ModelGateway() {
            @Override
            public ChatResult chat(String systemPrompt, String userPrompt) {
                return new ChatResult(reply, "test", 0);
            }

            @Override
            public ChatResult chatJson(String systemPrompt, String userPrompt) {
                return chat(systemPrompt, userPrompt);
            }

            @Override
            public ChatResult chatJsonWithImage(String systemPrompt, String userPrompt, byte[] image, String mimeType) {
                return chat(systemPrompt, userPrompt);
            }

            @Override
            public float[] embed(String text) {
                return new float[]{1};
            }

            @Override
            public List<float[]> embedAll(List<String> texts) {
                return texts.stream().map(this::embed).toList();
            }

            @Override
            public boolean local() {
                return local;
            }
        };
    }

    private static byte[] whitePng(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, width, height);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    @Test
    void readsAndClampsTheModelsBoxes() {
        List<ScreenshotBlur.Box> boxes = ScreenshotBlur.boxes("""
                Here: {"boxes": [{"x": 0.5, "y": 0.5, "w": 0.2, "h": 0.1, "what": "name"},
                                 {"x": 0.9, "y": 0.95, "w": 0.5, "h": 0.5},
                                 {"x": -1, "y": 0.2, "w": 0.1, "h": 0.1},
                                 {"x": 0.1, "y": 0.1, "w": 0, "h": 0.1}]}
                """);
        assertThat(boxes).hasSize(2);
        assertThat(boxes.getFirst().x()).isLessThan(0.5);
        assertThat(boxes.get(1).x() + boxes.get(1).w()).isLessThanOrEqualTo(1.0);
        assertThat(boxes.get(1).y() + boxes.get(1).h()).isLessThanOrEqualTo(1.0);
        assertThat(ScreenshotBlur.boxes("{\"boxes\": []}")).isEmpty();
        assertThatThrownBy(() -> ScreenshotBlur.boxes("I see a name")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ScreenshotBlur.boxes("{\"names\": []}")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void blacksOutTheBoxesOnly() throws IOException {
        byte[] png = whitePng(200, 100);
        ScreenshotBlur blur = new ScreenshotBlur(model(true, "{\"boxes\": [{\"x\": 0.5, \"y\": 0.5, \"w\": 0.25, \"h\": 0.2}]}"));
        ScreenshotBlur.Result result = blur.blur(png, "image/png");
        assertThat(result.hidden()).isEqualTo(1);
        BufferedImage out = ImageIO.read(new ByteArrayInputStream(result.image()));
        assertThat(out.getRGB(110, 55) & 0xFFFFFF).isZero();
        assertThat(out.getRGB(10, 10) & 0xFFFFFF).isEqualTo(0xFFFFFF);
        assertThat(out.getRGB(190, 95) & 0xFFFFFF).isEqualTo(0xFFFFFF);
    }

    @Test
    void doesNothingWithACloudModelOrAnUnusableAnswer() throws IOException {
        byte[] png = whitePng(20, 20);
        ScreenshotBlur.Result cloud = new ScreenshotBlur(model(false, "{\"boxes\": [{\"x\": 0, \"y\": 0, \"w\": 1, \"h\": 1}]}")).blur(png, "image/png");
        assertThat(cloud.hidden()).isNull();
        assertThat(cloud.image()).isSameAs(png);
        ScreenshotBlur.Result bad = new ScreenshotBlur(model(true, "no idea")).blur(png, "image/png");
        assertThat(bad.hidden()).isNull();
        assertThat(bad.note()).contains("nothing was hidden");
        assertThat(new ScreenshotBlur(model(true, "{\"boxes\": []}")).blur(png, "image/png").hidden()).isZero();
    }
}
