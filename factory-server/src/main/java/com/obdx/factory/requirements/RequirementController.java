package com.obdx.factory.requirements;

import com.obdx.factory.common.BadRequestException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@RestController
public class RequirementController {

    private final RequirementService service;

    public RequirementController(RequirementService service) {
        this.service = service;
    }

    @GetMapping("/api/workspaces/{workspaceId}/requirements")
    public List<RequirementService.RequirementSummary> list(@PathVariable UUID workspaceId) {
        return service.list(workspaceId);
    }

    @PostMapping(path = "/api/workspaces/{workspaceId}/requirements", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public RequirementService.RequirementDetail upload(@PathVariable UUID workspaceId,
                                                       @RequestParam("file") MultipartFile file,
                                                       @RequestParam(value = "title", required = false) String title) throws IOException {
        if (file.isEmpty() || file.getOriginalFilename() == null) {
            throw new BadRequestException("Choose a file to upload");
        }
        return service.upload(workspaceId, title, file.getOriginalFilename(), file.getBytes());
    }

    @PostMapping(path = "/api/workspaces/{workspaceId}/requirements/text", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public RequirementService.RequirementDetail fromText(@PathVariable UUID workspaceId, @RequestBody TextRequest request) {
        return service.fromText(workspaceId, request.title(), request.text());
    }

    @GetMapping("/api/requirements/{id}")
    public RequirementService.RequirementDetail get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PutMapping("/api/requirements/{id}/answers")
    public RequirementService.RequirementDetail saveAnswers(@PathVariable UUID id, @RequestBody AnswersRequest request) {
        return service.saveAnswers(id, request.answers() == null ? List.of() : request.answers());
    }

    @PostMapping("/api/requirements/{id}/refine")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public RequirementService.RequirementDetail refine(@PathVariable UUID id) {
        return service.refine(id);
    }

    /** The body is the edited spec as JSON. */
    @PutMapping(path = "/api/requirements/{id}/spec", consumes = MediaType.APPLICATION_JSON_VALUE)
    public RequirementService.RequirementDetail updateSpec(@PathVariable UUID id, @RequestBody String specJson) {
        return service.updateSpec(id, specJson);
    }

    @PostMapping("/api/requirements/{id}/approve")
    public RequirementService.RequirementDetail approve(@PathVariable UUID id) {
        return service.approve(id);
    }

    @PostMapping("/api/requirements/{id}/retry")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public RequirementService.RequirementDetail retry(@PathVariable UUID id) {
        return service.retry(id);
    }

    @DeleteMapping("/api/requirements/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }

    public record TextRequest(String title, String text) {
    }

    public record AnswersRequest(List<RequirementService.Answer> answers) {
    }
}
