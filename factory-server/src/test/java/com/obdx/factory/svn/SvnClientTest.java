package com.obdx.factory.svn;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class SvnClientTest {

    private final SvnClient client = new SvnClient(new SvnProperties("svn", Duration.ofSeconds(30), Duration.ofSeconds(60), false));

    @TempDir
    Path temp;

    @BeforeAll
    static void requireSvn() {
        assumeTrue(TestSvnRepository.toolsAvailable(), "svn and svnadmin are not installed");
    }

    @Test
    void readsInfoChecksOutAndUpdates() throws Exception {
        TestSvnRepository repo = TestSvnRepository.create(temp.resolve("server"), Map.of("src/A.java", "class A {}"));

        SvnClient.SvnInfo info = client.info(repo.trunkUrl(), SvnCredentials.NONE);
        assertThat(info.revision()).isEqualTo(1);
        assertThat(info.url()).isEqualTo(repo.trunkUrl());

        Path workingCopy = temp.resolve("checkout");
        assertThat(client.checkout(repo.trunkUrl(), workingCopy, SvnCredentials.NONE)).isEqualTo(1);
        assertThat(workingCopy.resolve("src/A.java")).hasContent("class A {}");

        repo.commit(Map.of("src/B.java", "class B {}"), List.of("src/A.java"));
        assertThat(client.update(workingCopy, SvnCredentials.NONE)).isEqualTo(2);
        assertThat(workingCopy.resolve("src/B.java")).exists();
        assertThat(Files.exists(workingCopy.resolve("src/A.java"))).isFalse();
    }

    @Test
    void createsBranchWithChangedFilesInOneCommit() throws Exception {
        TestSvnRepository repo = TestSvnRepository.create(temp.resolve("server"), Map.of("src/A.java", "class A {}"));
        String root = repo.trunkUrl().substring(0, repo.trunkUrl().length() - "/trunk".length());
        Path changed = temp.resolve("A.java");
        Files.writeString(changed, "class A { int x; }");
        Path added = temp.resolve("B.java");
        Files.writeString(added, "class B {}");

        assertThat(client.exists(root + "/branches", SvnCredentials.NONE)).isFalse();
        long revision = client.multiCommit(root, "Change", List.of(
                "mkdir", "branches", "cp", "1", "trunk", "branches/cr-1",
                "put", changed.toString(), "branches/cr-1/src/A.java",
                "mkdir", "branches/cr-1/src/new",
                "put", added.toString(), "branches/cr-1/src/new/B.java"), SvnCredentials.NONE);

        assertThat(revision).isEqualTo(2);
        Path branch = temp.resolve("branch");
        client.checkout(root + "/branches/cr-1", branch, SvnCredentials.NONE);
        assertThat(branch.resolve("src/A.java")).hasContent("class A { int x; }");
        assertThat(branch.resolve("src/new/B.java")).hasContent("class B {}");
        Path trunk = temp.resolve("trunk");
        client.checkout(repo.trunkUrl(), trunk, SvnCredentials.NONE);
        assertThat(trunk.resolve("src/A.java")).as("trunk is untouched").hasContent("class A {}");
    }

    @Test
    void reportsSvnErrors() {
        String missing = temp.resolve("no-such-repo").toUri() + "trunk";

        assertThatThrownBy(() -> client.info(missing, SvnCredentials.NONE))
                .isInstanceOf(SvnException.class)
                .hasMessageStartingWith("svn info failed: svn: E");
    }

    @Test
    void reportsMissingSvnClient() {
        SvnClient broken = new SvnClient(new SvnProperties("no-such-svn-binary", Duration.ofSeconds(5), Duration.ofSeconds(5), false));

        assertThatThrownBy(() -> broken.info("file:///x", SvnCredentials.NONE))
                .isInstanceOf(SvnException.class)
                .hasMessageContaining("Is the Subversion command-line client installed");
    }
}
