package com.obdx.factory.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Locale;

/**
 * Refuses a request whose query has a NUL character (?path=a%00b) with 400 Bad Request. No file path or name has one,
 * and Java's file paths and PostgreSQL both fail on it with an error that would otherwise be a 500.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class NulCharacterFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (hasNul(request.getQueryString())) {
            response.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.getWriter().write("{\"status\": 400, \"title\": \"Bad Request\", \"detail\": \"The request has a character "
                    + "that is not allowed (NUL). Check the path or name and try again.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    static boolean hasNul(String query) {
        return query != null && (query.indexOf('\0') >= 0 || query.toLowerCase(Locale.ROOT).contains("%00"));
    }
}
