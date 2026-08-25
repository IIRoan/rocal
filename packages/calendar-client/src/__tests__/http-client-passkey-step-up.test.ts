import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { PASSKEY_STEP_UP_REQUIRED_MESSAGE } from "@workspace/calendar-core";
import { HttpClient } from "../http-client";

describe("HttpClient passkey step-up", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("notifies when a protected request requires passkey verification", async () => {
    const onPasskeyStepUpRequired = jest.fn();
    globalThis.fetch = jest.fn(async () => {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          message: PASSKEY_STEP_UP_REQUIRED_MESSAGE,
          statusCode: 403,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const client = new HttpClient({
      baseURL: "http://api.test",
      retries: 0,
      onPasskeyStepUpRequired,
    });

    await expect(client.get("/api/calendars")).rejects.toMatchObject({
      message: PASSKEY_STEP_UP_REQUIRED_MESSAGE,
      statusCode: 403,
    });
    expect(onPasskeyStepUpRequired).toHaveBeenCalledTimes(1);
  });

  it("does not treat other 403 responses as passkey step-up", async () => {
    const onPasskeyStepUpRequired = jest.fn();
    globalThis.fetch = jest.fn(async () => {
      return new Response(
        JSON.stringify({
          error: "Forbidden",
          message: "Not an attendee",
          statusCode: 403,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const client = new HttpClient({
      baseURL: "http://api.test",
      retries: 0,
      onPasskeyStepUpRequired,
    });

    await expect(client.get("/api/events/evt-1")).rejects.toMatchObject({
      message: "Not an attendee",
      statusCode: 403,
    });
    expect(onPasskeyStepUpRequired).not.toHaveBeenCalled();
  });
});
