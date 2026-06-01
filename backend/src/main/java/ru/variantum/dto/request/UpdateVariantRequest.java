package ru.variantum.dto.request;

import java.util.List;

/** Ручное обновление варианта после правки в редакторе. */
public record UpdateVariantRequest(
        Integer difficulty,
        List<TaskPatch> tasks
) {
    public record TaskPatch(
            String taskId,
            String text,
            String answer,
            Integer steps,
            Integer estimatedMinutes,
            Integer difficulty,
            /** URL или base64 data-URL прикреплённого фото (null = не менять, "" = убрать фото). */
            String photoUrl
    ) {}
}
