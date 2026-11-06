package com.obdx.factory.common;

import com.obdx.factory.model.ModelGatewayException;
import com.obdx.factory.security.SecretCipher;
import com.obdx.factory.svn.SvnException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Turns exceptions into RFC 9457 problem details, which the UI shows to the user.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    /** A problem whose detail never carries a secret the factory holds (a server's error can echo one). */
    static ProblemDetail problem(HttpStatus status, String detail) {
        return ProblemDetail.forStatusAndDetail(status, KnownSecrets.masked(detail));
    }

    @ExceptionHandler(NotFoundException.class)
    public ProblemDetail notFound(NotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(BadRequestException.class)
    public ProblemDetail badRequest(BadRequestException e) {
        return problem(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(ConflictException.class)
    public ProblemDetail conflict(ConflictException e) {
        return problem(HttpStatus.CONFLICT, e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail invalid(MethodArgumentNotValidException e) {
        String detail = e.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .sorted()
                .collect(Collectors.joining("; "));
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
    }

    @ExceptionHandler(ModelGatewayException.class)
    public ProblemDetail modelUnavailable(ModelGatewayException e) {
        return problem(HttpStatus.BAD_GATEWAY, e.getMessage());
    }

    @ExceptionHandler(com.obdx.factory.jenkins.JenkinsException.class)
    public ProblemDetail jenkinsFailed(com.obdx.factory.jenkins.JenkinsException e) {
        return problem(HttpStatus.BAD_GATEWAY, e.getMessage());
    }

    @ExceptionHandler(SvnException.class)
    public ProblemDetail svnFailed(SvnException e) {
        return problem(HttpStatus.BAD_GATEWAY, e.getMessage());
    }

    @ExceptionHandler(SecretCipher.MissingSecretKeyException.class)
    public ProblemDetail missingSecretKey(SecretCipher.MissingSecretKeyException e) {
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ProblemDetail tooLarge(MaxUploadSizeExceededException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "The file is too large (limit 150 MB; requirement documents 25 MB)");
    }

    /** A request body that cannot be read: a text with a NUL character (JsonConfig), or JSON that is not valid. */
    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    public ProblemDetail unreadable(org.springframework.http.converter.HttpMessageNotReadableException e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof JsonConfig.NulInTextException) {
                return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, JsonConfig.NUL_MESSAGE);
            }
        }
        // The parser's own message names its classes and features: it goes to the log, the answer says where in plain words
        log.info("Unreadable request body: {}", Messages.reason(e.getMostSpecificCause()));
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, unreadableMessage(e));
    }

    /** "The request could not be read (field "name", line 1, column 9). Check the data sent." */
    static String unreadableMessage(Throwable e) {
        String field = null;
        tools.jackson.core.TokenStreamLocation location = null;
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof tools.jackson.core.JacksonException j) {
                for (tools.jackson.core.JacksonException.Reference r : j.getPath()) {
                    if (r.getPropertyName() != null && r.getPropertyName().matches("[\\w.-]{1,60}")) {
                        field = r.getPropertyName();
                    }
                }
                if (location == null && j.getLocation() != null && j.getLocation().getLineNr() > 0) {
                    location = j.getLocation();
                }
            }
        }
        List<String> where = new java.util.ArrayList<>();
        if (field != null) {
            where.add("field \"" + field + "\"");
        }
        if (location != null) {
            where.add("line " + location.getLineNr() + ", column " + location.getColumnNr());
        }
        return "The request could not be read" + (where.isEmpty() ? "" : " (" + String.join(", ", where) + ")") + ". Check the data sent.";
    }

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ApiExceptionHandler.class);

    /** A path with a character no file name can have (NUL, or ':' and '*' on Windows). */
    @ExceptionHandler(java.nio.file.InvalidPathException.class)
    public ProblemDetail invalidPath(java.nio.file.InvalidPathException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "The path is not valid: it has a character that file names "
                + "cannot have. Check the path and try again.");
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ProblemDetail forbidden(AccessDeniedException e) {
        return problem(HttpStatus.FORBIDDEN, e.getMessage());
    }

    @ExceptionHandler(AuthenticationCredentialsNotFoundException.class)
    public ProblemDetail unauthorized(AuthenticationCredentialsNotFoundException e) {
        return problem(HttpStatus.UNAUTHORIZED, e.getMessage());
    }
}
