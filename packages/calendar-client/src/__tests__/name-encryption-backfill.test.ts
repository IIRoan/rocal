import { describe, expect, it, jest } from "@jest/globals";
import {
  MAIL_INVITATION_STAGING_CALENDAR_NAME,
  type Calendar,
  type EventCategory,
} from "@workspace/calendar-core";
import { NoopE2eeProvider, type E2eeProvider } from "@workspace/e2ee";

import { backfillEncryptedNames } from "../name-encryption-backfill";

type Row = { id: string; name: string; encryptedName: string | null };

function calendar(overrides: Partial<Calendar>): Calendar {
  return {
    id: "cal",
    name: "",
    encryptedName: null,
    color: "blue",
    kind: "owned",
    isPublic: false,
    isVisible: true,
    isDefault: false,
    isSyncOnly: false,
    userId: "user-1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function category(overrides: Partial<EventCategory>): EventCategory {
  return {
    id: "cat",
    name: "",
    encryptedName: null,
    color: "blue",
    isActive: true,
    userId: "user-1",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

/** In-memory server that blanks plaintext once ciphertext is stored. */
function createFakeServer(calendars: Calendar[], categories: EventCategory[]) {
  const store = { calendars, categories };
  const put = jest.fn(async (url: string, body: unknown) => {
    const payload = body as { name?: string; encryptedName?: string };
    if (payload.name !== undefined) {
      throw new Error("plaintext name uploaded");
    }
    const [, , collection, id] = url.split("/");
    const rows: Row[] =
      collection === "calendars" ? store.calendars : store.categories;
    const row = rows.find((entry) => entry.id === decodeURIComponent(id ?? ""));
    if (!row) throw new Error("not found");
    row.name = "";
    row.encryptedName = payload.encryptedName ?? null;
    return row;
  });
  const get = jest.fn(async (url: string) =>
    url === "/api/calendars"
      ? { calendars: store.calendars }
      : { categories: store.categories },
  );

  return {
    store,
    client: { get, put },
    put,
  };
}

function createEncryptingProvider(): E2eeProvider {
  const noop = new NoopE2eeProvider();
  return Object.assign(noop, {
    hasActiveSession: async () => true,
    attachCalendarEncryptionShadow: async ({ name }: { name?: string }) => ({
      encryptedName: `enc(${name})`,
      blindIndexTokens: ["idx"],
      encryptionKeyVersion: 1,
    }),
    attachCategoryEncryptionShadow: async ({ name }: { name?: string }) => ({
      encryptedName: `enc(${name})`,
      blindIndexTokens: ["idx"],
      encryptionKeyVersion: 1,
    }),
  }) as E2eeProvider;
}

describe("backfillEncryptedNames", () => {
  it("encrypts legacy names once and is a no-op on the next run", async () => {
    const server = createFakeServer(
      [
        calendar({ id: "personal", name: "Personal" }),
        calendar({ id: "legacy-shadow", name: "Work", encryptedName: "old" }),
        calendar({ id: "done", name: "", encryptedName: "enc(Family)" }),
        calendar({
          id: "subscription",
          name: "Holidays",
          kind: "subscribed",
          isSyncOnly: true,
        }),
        calendar({
          id: "staging",
          name: MAIL_INVITATION_STAGING_CALENDAR_NAME,
          isVisible: false,
        }),
      ],
      [
        category({ id: "focus", name: "Focus" }),
        category({ id: "archived", name: "Old", isActive: false }),
      ],
    );
    const e2ee = createEncryptingProvider();

    const first = await backfillEncryptedNames({
      client: server.client as never,
      e2ee,
      batchSize: 2,
    });

    expect(first).toEqual({ calendars: 2, categories: 1, failed: 0 });
    expect(server.put.mock.calls.map(([url]) => url).sort()).toEqual([
      "/api/calendars/legacy-shadow",
      "/api/calendars/personal",
      "/api/categories/focus",
    ]);
    expect(server.store.calendars.find((c) => c.id === "subscription")?.name).toBe(
      "Holidays",
    );

    server.put.mockClear();
    const second = await backfillEncryptedNames({ client: server.client as never, e2ee });

    expect(second).toEqual({ calendars: 0, categories: 0, failed: 0 });
    expect(server.put).not.toHaveBeenCalled();
  });

  it("does nothing without an active session", async () => {
    const server = createFakeServer(
      [calendar({ id: "personal", name: "Personal" })],
      [],
    );

    await expect(
      backfillEncryptedNames({
        client: server.client as never,
        e2ee: new NoopE2eeProvider(),
      }),
    ).resolves.toEqual({ calendars: 0, categories: 0, failed: 0 });
    expect(server.client.get).not.toHaveBeenCalled();
  });

  it("never uploads plaintext and stays silent when encryption or upload fails", async () => {
    const server = createFakeServer(
      [
        calendar({ id: "a", name: "A" }),
        calendar({ id: "b", name: "B" }),
      ],
      [],
    );
    server.put.mockRejectedValueOnce(new Error("offline"));
    const e2ee = Object.assign(createEncryptingProvider(), {
      attachCalendarEncryptionShadow: async (request: { name?: string }) =>
        request.name === "B" ? request : { encryptedName: "enc(A)" },
    }) as E2eeProvider;

    await expect(
      backfillEncryptedNames({ client: server.client as never, e2ee }),
    ).resolves.toEqual({ calendars: 0, categories: 0, failed: 2 });
    expect(server.put).toHaveBeenCalledTimes(1);
    expect(server.put.mock.calls[0]?.[1]).toEqual({ encryptedName: "enc(A)" });
  });
});
