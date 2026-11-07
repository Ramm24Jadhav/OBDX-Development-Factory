package com.obdx.factory.workspace;

import com.obdx.factory.common.BadRequestException;
import com.obdx.factory.common.Urls;
import com.obdx.factory.importing.StorageProperties;
import com.obdx.factory.security.SecretCipher;
import com.obdx.factory.svn.SvnClient;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * A stored SVN password goes only to the server it was entered for: pointing the URL at another server drops it.
 */
class StoredSecretsTest {

    private final WorkspaceRepository repository = mock(WorkspaceRepository.class);
    private final SecretCipher cipher = new SecretCipher(Base64.getEncoder().encodeToString(new byte[32]));
    private final WorkspaceService service = new WorkspaceService(repository, cipher, mock(SvnClient.class), new StorageProperties(Path.of("data")));

    private Workspace workspaceWithPassword(UUID id) {
        Workspace workspace = new Workspace("bank-a", "Bank A", "22.x", "https://svn.bank-a.local/obdx/trunk");
        workspace.setSvnUsername("svc");
        workspace.setSvnPasswordEncrypted(cipher.encrypt("secret"));
        when(repository.findById(id)).thenReturn(Optional.of(workspace));
        return workspace;
    }

    @Test
    void thePasswordStaysOnTheSameServer() {
        UUID id = UUID.randomUUID();
        Workspace workspace = workspaceWithPassword(id);

        service.updateSvnSettings(id, new SvnSettingsRequest("https://SVN.bank-a.local:443/obdx/branches/x", "svc", null));

        assertThat(cipher.decrypt(workspace.getSvnPasswordEncrypted())).isEqualTo("secret");
    }

    @Test
    void anotherServerNeedsThePasswordAgain() {
        UUID id = UUID.randomUUID();
        Workspace workspace = workspaceWithPassword(id);

        WorkspaceResponse updated = service.updateSvnSettings(id, new SvnSettingsRequest("https://svn.attacker.example/obdx", "svc", null));

        assertThat(updated.svnPasswordSet()).isFalse();
        assertThat(workspace.getSvnPasswordEncrypted()).isNull();
        // the scheme and port count too
        Workspace again = workspaceWithPassword(id);
        service.updateSvnSettings(id, new SvnSettingsRequest("svn://svn.bank-a.local/obdx/trunk", "svc", null));
        assertThat(again.getSvnPasswordEncrypted()).isNull();
        // a password entered with the new URL is kept
        Workspace entered = workspaceWithPassword(id);
        service.updateSvnSettings(id, new SvnSettingsRequest("https://svn.other.local/obdx", "svc", "new-secret"));
        assertThat(cipher.decrypt(entered.getSvnPasswordEncrypted())).isEqualTo("new-secret");
    }

    @Test
    void aServerNameStartingWithADashIsRefused() {
        UUID id = UUID.randomUUID();
        workspaceWithPassword(id);

        assertThatThrownBy(() -> service.updateSvnSettings(id, new SvnSettingsRequest("svn+ssh://-oProxyCommand=calc/repo", null, null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("cannot start with \"-\"");
    }

    @Test
    void comparesServersBySchemeHostAndPort() {
        assertThat(Urls.sameServer("https://jenkins.bank.local", "https://jenkins.bank.local:443/job/x")).isTrue();
        assertThat(Urls.sameServer("https://jenkins.bank.local", "http://jenkins.bank.local")).isFalse();
        assertThat(Urls.sameServer("https://jenkins.bank.local", "https://jenkins.bank.local:8443")).isFalse();
        assertThat(Urls.sameServer("https://jenkins.bank.local", "https://jenkins.bank.local.attacker.example")).isFalse();
        assertThat(Urls.sameServer("https://user@jenkins.bank.local/", "https://jenkins.bank.local/")).isTrue();
        assertThat(Urls.sameServer(null, "https://jenkins.bank.local")).isFalse();
        assertThat(Urls.sameServer("not a url", "not a url")).isFalse();
    }
}
