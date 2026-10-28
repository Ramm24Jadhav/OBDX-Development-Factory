package com.obdx.factory.update;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Updates replace only the jar, so the download's helper scripts (open-factory.bat and the like) come with it and are
 * written next to it when the factory starts, if they changed. Never start.bat, start.sh (Windows reads a running
 * batch file as it goes) or settings.properties. Only when the factory runs from the download's folder with updates on.
 */
@Component
@ConditionalOnBooleanProperty("factory.update.enabled")
public class BundleFiles {

    static final List<String> FILES = List.of("open-factory.bat", "install-autostart.bat", "remove-autostart.bat",
            "create-demo-svn.bat", "create-demo-svn.sh", "README.txt");
    private static final Logger log = LoggerFactory.getLogger(BundleFiles.class);

    private final Path folder;

    public BundleFiles() {
        this(Path.of("").toAbsolutePath());
    }

    BundleFiles(Path folder) {
        this.folder = folder;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void refresh() {
        if (!Files.isRegularFile(folder.resolve("settings.properties"))
                || !(Files.isRegularFile(folder.resolve("start.bat")) || Files.isRegularFile(folder.resolve("start.sh")))) {
            return;
        }
        for (String name : FILES) {
            ClassPathResource resource = new ClassPathResource("bundle/" + name);
            if (!resource.exists()) {
                continue;
            }
            try (InputStream in = resource.getInputStream()) {
                String content = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                // Windows files with Windows line endings, as in the zip
                content = name.endsWith(".sh") ? content.replace("\r\n", "\n") : content.replaceAll("\r?\n", "\r\n");
                Path target = folder.resolve(name);
                if (Files.isRegularFile(target) && Files.readString(target, StandardCharsets.UTF_8).equals(content)) {
                    continue;
                }
                Files.writeString(target, content, StandardCharsets.UTF_8);
                if (name.endsWith(".sh")) {
                    target.toFile().setExecutable(true);
                }
                log.info("Updated {}", target);
            } catch (IOException e) {
                log.warn("Could not update {}: {}", name, e.getMessage());
            }
        }
    }
}
