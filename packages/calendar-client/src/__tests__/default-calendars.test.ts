import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  DEFAULT_CALENDARS,
  MAIL_INVITATION_STAGING_CALENDAR_NAME,
  type CreateCalendarRequest,
  type UpdateCalendarRequest,
} from "@workspace/calendar-core";
import { NoopE2eeProvider } from "@workspace/e2ee";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

class EncryptingProvider extends NoopE2eeProvider {
  async hasActiveSession() {
    return true;
  }
  async attachCalendarEncryptionShadow<
    T extends CreateCalendarRequest | UpdateCalendarRequest,
  >(request: T) {
    const { name, ...rest } = request;
    return { ...rest, encryptedName: `enc(${name})`, blindIndexTokens: ["t"], encryptionKeyVersion: 1 };
  }
}

const stagingCalendar = {
  id: "staging",
  name: MAIL_INVITATION_STAGING_CALENDAR_NAME,
  kind: "owned",
  isVisible: false,
  isSyncOnly: false,
};

function setup(calendars: unknown[], e2ee = new EncryptingProvider()) {
  globalThis.fetch = jest.fn(
    async () =>
      new Response(JSON.stringify({ calendars }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  ) as typeof fetch;
  const client = new HttpClient({ baseURL: "https://api.test", retries: 0 });
  const post = jest.spyOn(client, "post");
  return { post, service: new CalendarApiService(client, e2ee) };
}

describe("ensureDefaultCalendars", () => {
  it("seeds encrypted defaults when only the invitation staging calendar exists", async () => {
    const { post, service } = setup([
      stagingCalendar,
      { id: "feed", name: "Holidays", kind: "subscribed", isVisible: true, isSyncOnly: true },
    ]);

    await expect(service.ensureDefaultCalendars()).resolves.toBe(true);

    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0] ?? [];
    expect(path).toBe("/api/calendars/defaults");
    expect(body).toEqual({
      calendars: DEFAULT_CALENDARS.map(({ name, ...rest }) => ({
        ...rest,
        encryptedName: `enc(${name})`,
        blindIndexTokens: ["t"],
        encryptionKeyVersion: 1,
      })),
    });
    expect(JSON.stringify(body)).not.toMatch(/"name"/);
  });

  it("dedupes concurrent calls into one seed", async () => {
    const { post, service } = setup([]);

    const results = await Promise.all([
      service.ensureDefaultCalendars(),
      service.ensureDefaultCalendars(),
    ]);

    expect(results).toEqual([true, true]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("skips accounts that already own a calendar", async () => {
    const { post, service } = setup([
      stagingCalendar,
      { id: "c1", name: "", encryptedName: "x", kind: "owned", isVisible: true, isSyncOnly: false },
    ]);

    await expect(service.ensureDefaultCalendars()).resolves.toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("does nothing without an E2EE session", async () => {
    const { post, service } = setup([], new NoopE2eeProvider());

    await expect(service.ensureDefaultCalendars()).resolves.toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses to upload a plaintext name", async () => {
    class LeakyProvider extends EncryptingProvider {
      async attachCalendarEncryptionShadow<
        T extends CreateCalendarRequest | UpdateCalendarRequest,
      >(request: T) {
        return { ...request, encryptedName: "enc" };
      }
    }
    const { post, service } = setup([], new LeakyProvider());

    await expect(service.ensureDefaultCalendars()).rejects.toThrow(
      "Default calendar names were not encrypted",
    );
    expect(post).not.toHaveBeenCalled();
  });
});
