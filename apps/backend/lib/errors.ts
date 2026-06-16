import { Elysia } from "elysia";
import { createLogger } from "@workspace/logger";

const logger = createLogger("backend:errors");

/**
 * Extract a human-readable message from an unknown error value.
 * Returns `fallback` (default "Unknown error") when the value is not an Error.
 */
export function errorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return fallback;
}

/**
 * Like {@link errorMessage} but uses `String(error)` as the fallback so any
 * non-Error value is still serialized. Use for diagnostic/log payloads where
 * preserving the original value matters.
 */
export function errorString(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

// Error response interface
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
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

// Error handling middleware
export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  ({ code, error, set, request }) => {
    const timestamp = new Date().toISOString();
    const requestMeta = request
      ? {
          method: request.method,
          url: request.url,
        }
      : undefined;

    // Log error for debugging (in production, use proper logging)
    logger.error(`[${timestamp}] Error:`, {
      code,
      ...requestMeta,
      message: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Handle different error types
    switch (code) {
      case "VALIDATION":
        set.status = 400;
        return {
          error: "Validation Error",
          message: error.message,
          statusCode: 400,
          details: getValidationDetails(error),
          timestamp,
        } as ApiErrorResponse;

      case "NOT_FOUND":
        set.status = 404;
        return {
          error: "Not Found",
          message: error.message || "Resource not found",
          statusCode: 404,
          timestamp,
        } as ApiErrorResponse;

      case "PARSE":
        set.status = 400;
        return {
          error: "Parse Error",
          message: "Invalid request format",
          statusCode: 400,
          timestamp,
        } as ApiErrorResponse;

      default:
        // Handle custom errors
        if (error instanceof ValidationError) {
          set.status = 400;
          return {
            error: "Validation Error",
            message: error.message,
            statusCode: 400,
            details: error.field ? { field: error.field } : undefined,
            timestamp,
          } as ApiErrorResponse;
        }

        if (error instanceof NotFoundError) {
          set.status = 404;
          return {
            error: "Not Found",
            message: error.message,
            statusCode: 404,
            timestamp,
          } as ApiErrorResponse;
        }

        if (error instanceof UnauthorizedError) {
          set.status = 401;
          return {
            error: "Unauthorized",
            message: error.message,
            statusCode: 401,
            timestamp,
          } as ApiErrorResponse;
        }

        if (error instanceof ForbiddenError) {
          set.status = 403;
          return {
            error: "Forbidden",
            message: error.message,
            statusCode: 403,
            timestamp,
          } as ApiErrorResponse;
        }

        if (error instanceof ConflictError) {
          set.status = 409;
          return {
            error: "Conflict",
            message: error.message,
            statusCode: 409,
            timestamp,
          } as ApiErrorResponse;
        }

        if (error instanceof UpstreamServiceError) {
          set.status = error.statusCode;
          return {
            error: "Upstream Service Error",
            message: error.message,
            statusCode: error.statusCode,
            timestamp,
          } as ApiErrorResponse;
        }

        if (error instanceof DatabaseError) {
          set.status = 500;
          return {
            error: "Database Error",
            message: error.message,
            statusCode: 500,
            details: error.originalError
              ? { originalError: error.originalError.message }
              : undefined,
            timestamp,
          } as ApiErrorResponse;
        }

        if (error instanceof NotificationError) {
          set.status = 500;
          return {
            error: "Notification Error",
            message: error.message,
            statusCode: 500,
            details: error.originalError
              ? { originalError: error.originalError.message }
              : undefined,
            timestamp,
          } as ApiErrorResponse;
        }

        // Handle Prisma errors
        if (
          error instanceof Error &&
          error.message.includes("Unique constraint")
        ) {
          set.status = 409;
          return {
            error: "Conflict",
            message: "Resource already exists",
            statusCode: 409,
            timestamp,
          } as ApiErrorResponse;
        }

        if (
          error instanceof Error &&
          error.message.includes("Record to update not found")
        ) {
          set.status = 404;
          return {
            error: "Not Found",
            message: "Resource not found",
            statusCode: 404,
            timestamp,
          } as ApiErrorResponse;
        }

        // Generic server error
        set.status = 500;
        return {
          error: "Internal Server Error",
          message: "An unexpected error occurred",
          statusCode: 500,
          timestamp,
        } as ApiErrorResponse;
    }
  },
);
