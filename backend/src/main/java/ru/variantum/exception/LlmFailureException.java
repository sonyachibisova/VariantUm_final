package ru.variantum.exception;

import lombok.Getter;

@Getter
public class LlmFailureException extends RuntimeException {
    private final boolean retryable;

    public LlmFailureException(String message, boolean retryable) {
        super(message);
        this.retryable = retryable;
    }

    public LlmFailureException(String message, Throwable cause, boolean retryable) {
        super(message, cause);
        this.retryable = retryable;
    }
}
