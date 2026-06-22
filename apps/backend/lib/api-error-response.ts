import type { ApiErrorResponse } from "./errors";

export function createApiErrorBody(
  statusCode: number,
  error: string,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorResponse {
  return {
    error,
    message,
    statusCode,
    details,
    timestamp: new Date().toISOString(),
  };
}

export function unauthorizedBody(message = "Unauthorized access") {
  return createApiErrorBody(401, "Unauthorized", message);
}

export function forbiddenBody(message = "Access forbidden") {
  return createApiErrorBody(403, "Forbidden", message);
}
