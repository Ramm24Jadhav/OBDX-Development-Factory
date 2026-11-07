package com.obdx.factory.svn;

import com.obdx.factory.common.BadRequestException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SvnUrlsTest {

    @Test
    void aServerNameStartingWithADashNeverReachesSsh() {
        assertThat(SvnUrls.unsafeHost("svn+ssh://-oProxyCommand=calc/repo")).isTrue();
        assertThat(SvnUrls.unsafeHost("svn+ssh://user@-oProxyCommand=calc/repo")).isTrue();
        assertThat(SvnUrls.unsafeHost("svn+ssh://%2DoProxyCommand=calc/repo")).isTrue();
        assertThat(SvnUrls.unsafeHost("svn+ssh://svn.bank.local/repo-x")).isFalse();
        assertThat(SvnUrls.unsafeHost("--username")).isFalse();
        assertThatThrownBy(() -> SvnUrls.check("svn+ssh://-oProxyCommand=calc/repo", true)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> SvnUrls.requireSafe("svn+ssh://-oProxyCommand=calc/repo")).isInstanceOf(SvnException.class);
    }

    @Test
    void fileUrlsOnlyWhereAllowed() {
        assertThatThrownBy(() -> SvnUrls.check("file:///srv/svn/other-bank", false))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("only administrators");
        assertThatCode(() -> SvnUrls.check("file:///srv/svn/demo", true)).doesNotThrowAnyException();
        assertThatCode(() -> SvnUrls.check("https://svn.bank.local/obdx/trunk", false)).doesNotThrowAnyException();
        assertThatThrownBy(() -> SvnUrls.check("c:\\code", false)).isInstanceOf(BadRequestException.class);
    }
}
