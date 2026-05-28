import { describe, it, expect } from "@jest/globals";
import {
  isRetryableError,
  isRetryableDatabaseError,
  isRetryableUpdateError,
} from "../../lib/error-classification";

describe("isRetryableError", () => {
  it("returns false for non-Error values", () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError("string error")).toBe(false);
    expect(isRetryableError(42)).toBe(false);
  });

  it("returns true for network errors", () => {
    expect(isRetryableError(new Error("Network failure"))).toBe(true);
    expect(isRetryableError(new Error("Connection refused"))).toBe(true);
    expect(isRetryableError(new Error("Request timeout"))).toBe(true);
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
  });

  it("returns true for transient HTTP errors", () => {
    expect(isRetryableError(new Error("Service unavailable"))).toBe(true);
    expect(isRetryableError(new Error("Bad gateway"))).toBe(true);
    expect(isRetryableError(new Error("Gateway timeout"))).toBe(true);
    expect(isRetryableError(new Error("Internal server error"))).toBe(true);
    expect(isRetryableError(new Error("Rate limit exceeded"))).toBe(true);
  });

  it("returns false for permanent errors", () => {
    expect(isRetryableError(new Error("Invalid email address"))).toBe(false);
    expect(isRetryableError(new Error("Authentication failed"))).toBe(false);
    expect(isRetryableError(new Error("Unauthorized"))).toBe(false);
    expect(isRetryableError(new Error("Not found"))).toBe(false);
    expect(isRetryableError(new Error("Bad request"))).toBe(false);
    expect(isRetryableError(new Error("Validation error"))).toBe(false);
  });

  it("returns true by default for unknown errors (conservative)", () => {
    expect(isRetryableError(new Error("Some unexpected condition"))).toBe(true);
  });
});

describe("isRetryableDatabaseError", () => {
  it("returns false for non-Error values", () => {
    expect(isRetryableDatabaseError(null)).toBe(false);
    expect(isRetryableDatabaseError(undefined)).toBe(false);
  });

  it("returns true for database connection errors by message", () => {
    expect(isRetryableDatabaseError(new Error("connection refused"))).toBe(
      true,
    );
    expect(isRetryableDatabaseError(new Error("deadlock detected"))).toBe(true);
    expect(isRetryableDatabaseError(new Error("too many connections"))).toBe(
      true,
    );
    expect(isRetryableDatabaseError(new Error("transaction aborted"))).toBe(
      true,
    );
  });

  it("returns true for Prisma error codes", () => {
    const dbError = Object.assign(new Error("db error"), { code: "P1001" });
    expect(isRetryableDatabaseError(dbError)).toBe(true);

    const timeoutError = Object.assign(new Error("db error"), {
      code: "P2024",
    });
    expect(isRetryableDatabaseError(timeoutError)).toBe(true);
  });

  it("returns true for PostgreSQL deadlock error code", () => {
    const deadlock = Object.assign(new Error("deadlock"), { code: "40P01" });
    expect(isRetryableDatabaseError(deadlock)).toBe(true);
  });

  it("returns false for non-database errors with no matching code", () => {
    const err = Object.assign(new Error("some random error"), {
      code: "XYZ99",
    });
    expect(isRetryableDatabaseError(err)).toBe(false);
  });
});

describe("isRetryableUpdateError", () => {
  it("returns false for non-Error values", () => {
    expect(isRetryableUpdateError(42)).toBe(false);
  });

  it("returns true for concurrent update messages", () => {
    expect(isRetryableUpdateError(new Error("deadlock detected"))).toBe(true);
    expect(
      isRetryableUpdateError(new Error("could not serialize access")),
    ).toBe(true);
    expect(isRetryableUpdateError(new Error("update conflict"))).toBe(true);
    expect(isRetryableUpdateError(new Error("version mismatch detected"))).toBe(
      true,
    );
  });

  it("returns true for Prisma unique constraint error code P2002", () => {
    const err = Object.assign(new Error("unique"), { code: "P2002" });
    expect(isRetryableUpdateError(err)).toBe(true);
  });

  it("falls back to isRetryableDatabaseError for DB-level errors", () => {
    const err = Object.assign(new Error("db error"), { code: "P2034" });
    expect(isRetryableUpdateError(err)).toBe(true);
  });

  it("returns false for non-update, non-db error", () => {
    expect(isRetryableUpdateError(new Error("file not found"))).toBe(false);
  });
});
