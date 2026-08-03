import {
  InvalidNotificationDataError,
  InvalidNotificationStateError,
  InvalidTemplateError,
  MissingTemplateVariableError,
  UnsupportedChannelError,
} from "../errors/notification-errors.js";

export interface RetryPolicyOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
}

export const DEFAULT_RETRY_OPTIONS: Required<RetryPolicyOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  factor: 2,
};

export function isRecoverableError(error: unknown): boolean {
  if (!error) return false;

  // Unrecoverable domain validation & client input errors
  if (
    error instanceof InvalidNotificationDataError ||
    error instanceof InvalidNotificationStateError ||
    error instanceof InvalidTemplateError ||
    error instanceof MissingTemplateVariableError ||
    error instanceof UnsupportedChannelError
  ) {
    return false;
  }

  return true;
}

export function calculateExponentialBackoff(
  retryCount: number,
  baseDelayMs = DEFAULT_RETRY_OPTIONS.baseDelayMs,
  maxDelayMs = DEFAULT_RETRY_OPTIONS.maxDelayMs,
  factor = DEFAULT_RETRY_OPTIONS.factor
): number {
  if (retryCount <= 0) return 0;
  const delay = baseDelayMs * Math.pow(factor, retryCount - 1);
  return Math.min(delay, maxDelayMs);
}
