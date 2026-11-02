package com.obdx.factory.svn;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Regression audit A6 and A7: svn's errors in plain words, with what to do next. */
class SvnMessagesTest {

    @Test
    void aServerThatCannotBeReachedSaysToCheckTheUrlAndServer() {
        assertThat(SvnClient.plain("svn: E170013: Unable to connect to a repository at URL 'svn://127.0.0.1:1/none' svn: E730061: Can't "
                + "connect to host '127.0.0.1': No connection could be made because the target machine actively refused it."))
                .startsWith("Could not connect to the SVN server.").contains("then try again");
        assertThat(SvnClient.plain("svn: E170013: Unable to connect to a repository at URL 'svn://bank' svn: E000111: Connection refused"))
                .startsWith("Could not connect");
    }

    @Test
    void aRefusedLoginAndAMissingPathSayWhatToCheck() {
        assertThat(SvnClient.plain("svn: E170013: Unable to connect to a repository at URL 'svn://h/x' svn: E170001: Authentication error "
                + "from server: Password incorrect")).startsWith("The SVN server refused the user name or password");
        assertThat(SvnClient.plain("svn: E170013: Unable to connect to a repository at URL 'file:///C:/x/trunk' svn: E180001: Unable to open "
                + "repository 'file:///C:/x/trunk'")).startsWith("The SVN path was not found");
    }

    @Test
    void aDamagedWorkingCopyPointsToCheckOutAgain() {
        String plain = SvnClient.plain("svn: E155016: The working copy database at 'C:\\data\\wc' is corrupt.");
        assertThat(plain).startsWith(SvnClient.WORKING_COPY_DAMAGED).contains("Check out again").contains("are kept");
        assertThat(SvnClient.plain("svn: E155004: Run 'svn cleanup' to remove locks")).startsWith(SvnClient.WORKING_COPY_DAMAGED);
        // a working copy whose .svn folder is only partly there
        assertThat(SvnClient.plain("svn: E155007: 'C:\\data\\checkout' is not a working copy")).startsWith(SvnClient.WORKING_COPY_DAMAGED);
    }

    @Test
    void otherErrorsKeepSvnsOwnLines() {
        assertThat(SvnClient.plain("svn: E195012: Unable to find repository location")).isNull();
        // a code that only looks like one inside a longer number is not matched
        assertThat(SvnClient.plain("svn: E1550160: something else")).isNull();
    }

    @Test
    void anEchoedPasswordNeverReachesTheMessage() {
        new SvnCredentials("svcx", "Echoed-Pass-91");
        SvnException e = new SvnException("svn info failed: svn: E175002: Repository broken for login svcx:Echoed-Pass-91");
        assertThat(e.getMessage()).doesNotContain("Echoed-Pass-91").contains("login svcx:[hidden]");
    }
}
