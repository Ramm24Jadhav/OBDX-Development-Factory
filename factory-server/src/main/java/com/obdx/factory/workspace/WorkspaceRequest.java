package com.obdx.factory.workspace;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record WorkspaceRequest(
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Size(max = 200) String bankName,
        @NotBlank @Pattern(regexp = "22\\.x|25\\.x", message = "must be 22.x or 25.x") String obdxVersion,
        @Size(max = 1000) @Pattern(regexp = "(svn|svn\\+ssh|https?)://.+", message = "must be an svn://, svn+ssh://, http:// or https:// URL") String svnUrl) {
}
