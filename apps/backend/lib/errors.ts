import { Elysia } from "elysia";
import { createLogger } from "@workspace/logger";
import { resolveRequestId } from "./request-context";
import {
  errorLogDetails,
  sanitizeRequestUrl,
} from "./log-sanitization";

const logger = createLogger("backend:errors");

export { errorMessage, errorString } from "./error-utils";

// Custom error types
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string = "Resource not found") {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = "Unauthorized access") {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = "Access forbidden") {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  constructor(message: string = "Resource already exists") {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "ConflictError";
  }
}

export class UpstreamServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 503,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "UpstreamServiceError";
  }
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "DatabaseError";
  }
}

export class NotificationError extends Error {
  constructor(
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "NotificationError";
  }
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfterSeconds: number,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "RateLimitError";
  }
}

// Error response interface
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  /** Correlates client-facing errors with server logs. */
  requestId?: string;
  timestamp: string;
}

function getValidationDetails(error: unknown) {
  if (!error || typeof error !== "object" || !("all" in error)) {
    return undefined;
  }

  const rawIssues = (error as { all?: unknown }).all;
  if (!Array.isArray(rawIssues) || rawIssues.length === 0) {
    return undefined;
  }

  const issues = rawIssues
    .filter(
      (issue): issue is Record<string, unknown> =>
        !!issue && typeof issue === "object",
    )
    .map((issue) => ({
      path: typeof issue.path === "string" ? issue.path : undefined,
      message:
        typeof issue.message === "string"
          ? issue.message
          : typeof issue.summary === "string"
            ? issue.summary
            : "Invalid value",
      expected: typeof issue.expected === "string" ? issue.expected : undefined,
      found: "found" in issue ? issue.found : undefined,
    }));

  return issues.length > 0 ? { issues } : undefined;
}

function buildErrorResponse(
  statusCode: number,
  error: string,
  message: string,
  timestamp: string,
  requestId: string,
  details?: Record<string, unknown>,
): ApiErrorResponse {
  return {
    error,
    message,
    statusCode,
    details,
    requestId,
    timestamp,
  };
}

function logRequestFailure(
  statusCode: number,
  context: Record<string, unknown>,
) {
  if (statusCode >= 500 || statusCode === 429) {
    logger.error("Request failed", context);
    return;
  }

  logger.warn("Request failed", context);
}

function finishErrorResponse(
  statusCode: number,
  response: ApiErrorResponse,
  context: Record<string, unknown>,
): ApiErrorResponse {
  logRequestFailure(statusCode, context);
  return response;
}

// Error handling middleware — must be registered with `.onError(handleApiError)` on the
// root app *before* route definitions so thrown errors are formatted consistently.
export function handleApiError({
  code,
  error,
  set,
  request,
}: {
  code: string | number;
  error: unknown;
  set: {
    status?: number | string;
    headers: Record<string, string | number | undefined>;
  };
  request: Request;
}) {
    const timestamp = new Date().toISOString();
    const requestId = resolveRequestId(request);
    set.headers["x-request-id"] = requestId;

    const requestMeta = request
      ? {
          method: request.method,
          url: sanitizeRequestUrl(request.url),
        }
      : undefined;

    const errorDetails = errorLogDetails(error);
    const logContext = {
      requestId,
      code,
      ...requestMeta,
      ...errorDetails,
    };

    // Handle different error types
    switch (code) {
      case "VALIDATION":
        set.status = 400;
        return finishErrorResponse(
          400,
          buildErrorResponse(
            400,
            "Validation Error",
            error instanceof Error ? error.message : String(error),
            timestamp,
            requestId,
            getValidationDetails(error),
          ),
          logContext,
        );

      case "NOT_FOUND":
        set.status = 404;
        return finishErrorResponse(
          404,
          buildErrorResponse(
            404,
            "Not Found",
            error instanceof Error ? error.message : "Resource not found",
            timestamp,
            requestId,
          ),
          logContext,
        );

      case "PARSE":
        set.status = 400;
        return finishErrorResponse(
          400,
          buildErrorResponse(
            400,
            "Parse Error",
            "Invalid request format",
            timestamp,
            requestId,
          ),
          logContext,
        );

      default:
        // Handle custom errors
        if (error instanceof ValidationError) {
          set.status = 400;
          return finishErrorResponse(
            400,
            buildErrorResponse(
              400,
              "Validation Error",
              error.message,
              timestamp,
              requestId,
              error.field ? { field: error.field } : undefined,
            ),
            logContext,
          );
        }

        if (error instanceof NotFoundError) {
          set.status = 404;
          return finishErrorResponse(
            404,
            buildErrorResponse(
              404,
              "Not Found",
              error.message,
              timestamp,
              requestId,
            ),
            logContext,
          );
        }

        if (error instanceof UnauthorizedError) {
          set.status = 401;
          return finishErrorResponse(
            401,
            buildErrorResponse(
              401,
              "Unauthorized",
              error.message,
              timestamp,
              requestId,
            ),
            logContext,
          );
        }

        if (error instanceof ForbiddenError) {
          set.status = 403;
          return finishErrorResponse(
            403,
            buildErrorResponse(
              403,
              "Forbidden",
              error.message,
              timestamp,
              requestId,
            ),
            logContext,
          );
        }

        if (error instanceof ConflictError) {
          set.status = 409;
          return finishErrorResponse(
            409,
            buildErrorResponse(
              409,
              "Conflict",
              error.message,
              timestamp,
              requestId,
            ),
            logContext,
          );
        }

        if (error instanceof RateLimitError) {
          set.status = 429;
          set.headers["Retry-After"] = String(error.retryAfterSeconds);
          return finishErrorResponse(
            429,
            buildErrorResponse(
              429,
              "Too Many Requests",
              error.message,
              timestamp,
              requestId,
            ),
            logContext,
          );
        }

        if (error instanceof UpstreamServiceError) {
          set.status = error.statusCode;
          return finishErrorResponse(
            error.statusCode,
            buildErrorResponse(
              error.statusCode,
              "Upstream Service Error",
              error.message,
              timestamp,
              requestId,
            ),
            logContext,
          );
        }

        if (error instanceof DatabaseError) {
          set.status = 500;
          return finishErrorResponse(
            500,
            buildErrorResponse(
              500,
              "Database Error",
              error.message,
              timestamp,
              requestId,
            ),
            logContext,
          );
        }

        if (error instanceof NotificationError) {
          set.status = 500;
          return finishErrorResponse(
            500,
            buildErrorResponse(
              500,
              "Notification Error",
              error.message,
              timestamp,
              requestId,
            ),
            logContext,
          );
        }

        // Handle Prisma errors
        if (
          error instanceof Error &&
          error.message.includes("Unique constraint")
        ) {
          set.status = 409;
          return finishErrorResponse(
            409,
            buildErrorResponse(
              409,
              "Conflict",
              "Resource already exists",
              timestamp,
              requestId,
            ),
            logContext,
          );
        }

        if (
          error instanceof Error &&
          error.message.includes("Record to update not found")
        ) {
          set.status = 404;
          return finishErrorResponse(
            404,
            buildErrorResponse(
              404,
              "Not Found",
              "Resource not found",
              timestamp,
              requestId,
            ),
            logContext,
          );
        }

        // Generic server error — include requestId so users can report issues.
        set.status = 500;
        return finishErrorResponse(
          500,
          buildErrorResponse(
            500,
            "Internal Server Error",
            "An unexpected error occurred. If this keeps happening, contact support and include the request id.",
            timestamp,
            requestId,
          ),
          logContext,
        );
    }
}

/** @deprecated Prefer `.onError(handleApiError)` on the root app instance. */
export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  handleApiError,
);
