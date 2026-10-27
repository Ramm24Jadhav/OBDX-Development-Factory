package com.obdx.factory.workspace;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record WorkspaceRequest(
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Size(max = 200) String bankName,
        @NotBlank @Pattern(regexp = "22\\.x|25\\.x", message = "must be 22.x or 25.x") String obdxVersion,
        @Size(max = 1000) @Pattern(regexp = SVN_URL_PATTERN, message = SVN_URL_MESSAGE) String svnUrl) {

    static final String SVN_URL_PATTERN = "(svn|svn\\+ssh|https?|file)://.+";
    static final String SVN_URL_MESSAGE = "must be an svn://, svn+ssh://, http://, https:// or file:// URL";
}
