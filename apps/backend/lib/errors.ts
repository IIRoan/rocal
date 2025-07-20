import { Elysia } from "elysia";

// Custom error types
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = "Unauthorized access") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string = "Access forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Error response interface
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
  timestamp: string;
}

// Error handling middleware
export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  ({ code, error, set }) => {
    const timestamp = new Date().toISOString();

    // Log error for debugging (in production, use proper logging)
    console.error(`[${timestamp}] Error:`, {
      code,
      message: error instanceof Error ? error.message : String(error),
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
  }
);
