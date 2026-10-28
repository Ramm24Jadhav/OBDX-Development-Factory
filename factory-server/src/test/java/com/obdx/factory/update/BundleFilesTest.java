package com.obdx.factory.update;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class BundleFilesTest {

    @TempDir
    Path folder;

    @Test
    void writesTheHelperScriptsButNeverTheStartScriptOrSettings() throws Exception {
        Files.writeString(folder.resolve("settings.properties"), "FACTORY_PORT=9000\n");
        Files.writeString(folder.resolve("start.bat"), "old start\r\n");

        new BundleFiles(folder).refresh();

        String open = Files.readString(folder.resolve("open-factory.bat"));
        assertThat(open).contains("start.bat").contains("\r\n").doesNotContain("\r\r");
        assertThat(Files.readString(folder.resolve("create-demo-svn.sh"))).doesNotContain("\r");
        assertThat(Files.readString(folder.resolve("start.bat"))).isEqualTo("old start\r\n");
        assertThat(Files.readString(folder.resolve("settings.properties"))).isEqualTo("FACTORY_PORT=9000\n");
    }

    @Test
    void leavesOtherFoldersAlone() {
        new BundleFiles(folder).refresh();
        assertThat(folder.resolve("open-factory.bat")).doesNotExist();
    }
}
