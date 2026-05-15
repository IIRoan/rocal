import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    ok: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    skip: jest.fn(),
    step: jest.fn(),
    child: jest.fn(),
  }),
}));

import {
  DatabaseError,
  ForbiddenError,
  NotFoundError,
  NotificationError,
  UnauthorizedError,
  ValidationError,
  errorHandler,
} from "../../lib/errors";

const onErrorHook = errorHandler.event.error![0]!.fn as (ctx: any) => unknown;

function invokeOnError(code: string, error: Error) {
  const set: { status?: number } = {};
  const result = onErrorHook({ code, error, set });
  return { set, result };
}

describe("errors", () => {
  it("stores extra properties on custom error classes", () => {
    const validationError = new ValidationError("Invalid timezone", "timezone");
    const databaseError = new DatabaseError("Write failed", new Error("cause"));
    const notificationError = new NotificationError(
      "Send failed",
      new Error("smtp"),
    );

    expect(validationError.name).toBe("ValidationError");
    expect(validationError.field).toBe("timezone");
    expect(databaseError.originalError).toEqual(expect.any(Error));
    expect(notificationError.originalError).toEqual(expect.any(Error));
  });

  it("maps built-in Elysia error codes", () => {
    expect(invokeOnError("VALIDATION", new Error("Invalid body"))).toEqual({
      set: { status: 400 },
      result: expect.objectContaining({
        error: "Validation Error",
        message: "Invalid body",
        statusCode: 400,
        timestamp: expect.any(String),
      }),
    });

    expect(invokeOnError("NOT_FOUND", new Error("Missing route"))).toEqual({
      set: { status: 404 },
      result: expect.objectContaining({
        error: "Not Found",
        message: "Missing route",
        statusCode: 404,
        timestamp: expect.any(String),
      }),
    });

    expect(invokeOnError("PARSE", new Error("Bad JSON"))).toEqual({
      set: { status: 400 },
      result: expect.objectContaining({
        error: "Parse Error",
        message: "Invalid request format",
        statusCode: 400,
        timestamp: expect.any(String),
      }),
    });
  });

  it("includes structured issue details for validation errors when available", () => {
    const validationError = Object.assign(new Error("Invalid body"), {
      all: [
        {
          path: "/title",
          message: "Expected string",
          expected: "string",
          found: 42,
        },
        {
          path: "/start",
          summary: "Expected ISO string",
        },
      ],
    });

    expect(invokeOnError("VALIDATION", validationError)).toEqual({
      set: { status: 400 },
      result: expect.objectContaining({
        error: "Validation Error",
        message: "Invalid body",
        statusCode: 400,
        details: {
          issues: [
            {
              path: "/title",
              message: "Expected string",
              expected: "string",
              found: 42,
            },
            {
              path: "/start",
              message: "Expected ISO string",
              expected: undefined,
              found: undefined,
            },
          ],
        },
      }),
    });
  });

  it("omits validation details when the issue payload is malformed", () => {
    const validationError = Object.assign(new Error("Invalid body"), {
      all: "not-an-array",
    });

    expect(invokeOnError("VALIDATION", validationError)).toEqual({
      set: { status: 400 },
      result: expect.objectContaining({
        error: "Validation Error",
        message: "Invalid body",
        statusCode: 400,
        details: undefined,
      }),
    });
  });

  it("maps custom validation and authorization errors", () => {
    expect(
      invokeOnError("UNKNOWN", new ValidationError("Bad input", "name")),
    ).toEqual({
      set: { status: 400 },
      result: expect.objectContaining({
        error: "Validation Error",
        message: "Bad input",
        statusCode: 400,
        details: { field: "name" },
      }),
    });

    expect(
      invokeOnError("UNKNOWN", new NotFoundError("Missing thing")),
    ).toEqual({
      set: { status: 404 },
      result: expect.objectContaining({
        error: "Not Found",
        message: "Missing thing",
        statusCode: 404,
      }),
    });

    expect(invokeOnError("UNKNOWN", new UnauthorizedError())).toEqual({
      set: { status: 401 },
      result: expect.objectContaining({
        error: "Unauthorized",
        message: "Unauthorized access",
        statusCode: 401,
      }),
    });

    expect(invokeOnError("UNKNOWN", new ForbiddenError())).toEqual({
      set: { status: 403 },
      result: expect.objectContaining({
        error: "Forbidden",
        message: "Access forbidden",
        statusCode: 403,
      }),
    });
  });

  it("maps database and notification wrapper errors", () => {
    expect(
      invokeOnError(
        "UNKNOWN",
        new DatabaseError("Write failed", new Error("duplicate key")),
      ),
    ).toEqual({
      set: { status: 500 },
      result: expect.objectContaining({
        error: "Database Error",
        message: "Write failed",
        statusCode: 500,
        details: { originalError: "duplicate key" },
      }),
    });

    expect(
      invokeOnError(
        "UNKNOWN",
        new NotificationError("Send failed", new Error("smtp offline")),
      ),
    ).toEqual({
      set: { status: 500 },
      result: expect.objectContaining({
        error: "Notification Error",
        message: "Send failed",
        statusCode: 500,
        details: { originalError: "smtp offline" },
      }),
    });
  });

  it("maps Prisma-style conflict and record-missing errors", () => {
    expect(
      invokeOnError("UNKNOWN", new Error("Unique constraint failed")),
    ).toEqual({
      set: { status: 409 },
      result: expect.objectContaining({
        error: "Conflict",
        message: "Resource already exists",
        statusCode: 409,
      }),
    });

    expect(
      invokeOnError("UNKNOWN", new Error("Record to update not found")),
    ).toEqual({
      set: { status: 404 },
      result: expect.objectContaining({
        error: "Not Found",
        message: "Resource not found",
        statusCode: 404,
      }),
    });
  });

  it("falls back to a generic internal server error", () => {
    expect(invokeOnError("UNKNOWN", new Error("boom"))).toEqual({
      set: { status: 500 },
      result: expect.objectContaining({
        error: "Internal Server Error",
        message: "An unexpected error occurred",
        statusCode: 500,
      }),
    });
  });
});
