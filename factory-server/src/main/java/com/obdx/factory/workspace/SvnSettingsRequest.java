package com.obdx.factory.workspace;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * SVN settings of a workspace. A null password keeps the stored one; an empty password removes it.
 */
public record SvnSettingsRequest(
        @NotBlank @Size(max = 1000) @Pattern(regexp = WorkspaceRequest.SVN_URL_PATTERN, message = WorkspaceRequest.SVN_URL_MESSAGE) String svnUrl,
        @Size(max = 200) String svnUsername,
        @Size(max = 500) String svnPassword) {
}
