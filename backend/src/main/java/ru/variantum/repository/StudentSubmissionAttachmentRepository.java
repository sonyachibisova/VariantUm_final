package ru.variantum.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import ru.variantum.domain.StudentSubmissionAttachment;
import ru.variantum.dto.response.AttachmentInfoResponse;

import java.util.List;
import java.util.UUID;

@Repository
public interface StudentSubmissionAttachmentRepository extends JpaRepository<StudentSubmissionAttachment, UUID> {

    List<StudentSubmissionAttachment> findBySubmissionId(UUID submissionId);

    long countBySubmissionId(UUID submissionId);

    /** Только метаданные, без байтов — для списков */
    @Query("SELECT new ru.variantum.dto.response.AttachmentInfoResponse(a.id, a.fileName, a.mimeType, a.fileSize) " +
           "FROM StudentSubmissionAttachment a WHERE a.submissionId = :submissionId ORDER BY a.uploadedAt ASC")
    List<AttachmentInfoResponse> findMetadataBySubmissionId(UUID submissionId);
}
