package com.obdx.factory.requirements;

import com.obdx.factory.auth.AccessGuard;
import com.obdx.factory.auth.AuditLog;
import com.obdx.factory.common.BadRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** A requirement document over 25 MB is refused before it is read into memory. */
class UploadLimitTest {

    @Test
    void refusesALargeDocumentBeforeReadingIt() throws Exception {
        RequirementService service = mock(RequirementService.class);
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("brd.docx");
        when(file.getSize()).thenReturn(RequirementController.MAX_DOCUMENT_BYTES + 1);
        RequirementController controller = new RequirementController(service, mock(AccessGuard.class), mock(AuditLog.class));

        assertThatThrownBy(() -> controller.upload(UUID.randomUUID(), file, null))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("larger than 25 MB");
        verify(file, never()).getBytes();
    }
}
