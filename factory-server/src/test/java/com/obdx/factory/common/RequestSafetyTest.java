package com.obdx.factory.common;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.file.InvalidPathException;

import static org.assertj.core.api.Assertions.assertThat;

/** A NUL character in a path is a 400 with a message, not a 500. */
class RequestSafetyTest {

    @Test
    void refusesANulInTheQuery() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/workspaces/1/files/content");
        request.setQueryString("path=a%00b.java");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        new NulCharacterFilter().doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(400);
        assertThat(response.getContentAsString()).contains("not allowed");
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void letsOtherRequestsThrough() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/workspaces/1/files/content");
        request.setQueryString("path=src%2Fa%20b.java");
        MockFilterChain chain = new MockFilterChain();

        new NulCharacterFilter().doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(NulCharacterFilter.hasNul(null)).isFalse();
    }

    @Test
    void anInvalidPathIsABadRequest() {
        var problem = new ApiExceptionHandler().invalidPath(new InvalidPathException("a\0b", "Nul character not allowed"));

        assertThat(problem.getStatus()).isEqualTo(400);
        assertThat(problem.getDetail()).contains("not valid").doesNotContain("Nul character");
    }
}
