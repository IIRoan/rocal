import { beforeAll, describe, expect, it, jest } from "@jest/globals";
import { webcrypto } from "node:crypto";
import {
  CLIENT_ENTITY_ID_PATTERN,
  EVENT_CONTENT_UNAVAILABLE_MESSAGE,
  type CalendarEvent,
  type CreateEventRequest,
  type UpdateEventRequest,
} from "@workspace/calendar-core";
import {
  NoopE2eeProvider,
  createE2eeModule,
  encryptEventContentRequest,
  openEncryptedEvent,
  type CryptoProvider,
  type E2eeSessionKeys,
} from "@workspace/e2ee";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

// Node's webcrypto implements the subset of SubtleCrypto the module uses.
const e2ee = createE2eeModule(webcrypto as unknown as CryptoProvider);
let keys: E2eeSessionKeys;

beforeAll(async () => {
  keys = {
    accountKey: await e2ee.generateAccountKey(),
    blindIndexKey: await e2ee.generateBlindIndexKey(),
  };
});

/** Real AES-GCM sealing, with the bound marker in memory. */
class SessionProvider extends NoopE2eeProvider {
  bound = false;
  async hasActiveSession() {
    return true;
  }
  async attachEventEncryptionShadow<T extends CreateEventRequest | UpdateEventRequest>(
    request: T,
    eventId: string,
  ) {
    return encryptEventContentRequest(e2ee, keys, request, eventId);
  }
  async markEventContentBound() {
    this.bound = true;
  }
  async hydrateEncryptedEvent(event: CalendarEvent) {
    return openEncryptedEvent(e2ee, keys, event, this.bound);
  }
}

function stored(overrides: Partial<CalendarEvent> & { id: string }) {
  return {
    title: "",
    encryptionState: "encrypted",
    calendarId: "cal-1",
    userId: "user-1",
    start: "2099-03-02T09:00:00.000Z",
    end: "2099-03-02T10:00:00.000Z",
    ...overrides,
  };
}

function setup(rows: Record<string, unknown> = {}) {
  const client = new HttpClient({ baseURL: "https://api.test", retries: 0 });
  const get = jest.spyOn(client, "get").mockImplementation(async (path: string) => {
    const id = decodeURIComponent(path.split("/").pop() ?? "");
    return rows[id] as never;
  });
  const post = jest.spyOn(client, "post").mockImplementation(async (_path: string, body: unknown) => {
    const { id, encryptedContent, encryptionKeyVersion } = body as Record<string, unknown>;
    return stored({ id: String(id), encryptedContent: String(encryptedContent), encryptionKeyVersion: Number(encryptionKeyVersion) }) as never;
  });
  const put = jest.spyOn(client, "put").mockImplementation(async (path: string) => {
    return rows[decodeURIComponent(path.split("/").pop() ?? "")] as never;
  });
  const provider = new SessionProvider();
  return { get, post, put, provider, service: new CalendarApiService(client, provider) };
}

async function sealed(id: string, title = "Therapy") {
  const wire = await encryptEventContentRequest(e2ee, keys, { title }, id);
  return { encryptedContent: wire.encryptedContent, encryptionKeyVersion: wire.encryptionKeyVersion };
}

describe("event content binding", () => {
  it("creates an event under a proposed id its content is bound to", async () => {
    const { post, service } = setup();

    const created = await service.createEvent({
      title: "Therapy",
      start: "2099-03-02T09:00:00.000Z",
      end: "2099-03-02T10:00:00.000Z",
      calendarId: "cal-1",
    });

    const body = post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.id).toMatch(CLIENT_ENTITY_ID_PATTERN);
    expect(body.encryptionKeyVersion).toBe(2);
    expect(created).toMatchObject({ id: body.id, title: "Therapy" });
  });

  it("refuses the same ciphertext presented under another id", async () => {
    const { service } = setup({ moved: stored({ id: "moved", ...(await sealed("original")) }) });

    await expect(service.getEvent("moved")).resolves.toMatchObject({
      title: "Encrypted event",
      contentUnavailable: true,
    });
  });

  it("binds a time-only single-occurrence edit to a new child id with the series content", async () => {
    const { put, service } = setup({ series: stored({ id: "series", ...(await sealed("series")) }) });
    put.mockResolvedValue(stored({ id: "child" }) as never);

    await service.editRecurringEvent("series", {
      editScope: "this_only",
      occurrenceDate: "2099-03-09T09:00:00.000Z",
      updates: { start: "2099-03-09T14:00:00.000Z", end: "2099-03-09T15:00:00.000Z" },
    });

    const body = put.mock.calls[0]?.[1] as { newEventId: string; updates: CalendarEvent };
    expect(body.newEventId).toMatch(CLIENT_ENTITY_ID_PATTERN);
    const child = await openEncryptedEvent(e2ee, keys, stored({ ...body.updates, id: body.newEventId }), true);
    expect(child).toMatchObject({ title: "Therapy", start: "2099-03-09T14:00:00.000Z" });
  });

  it("binds an update of a generated occurrence to its series row", async () => {
    const occurrence = "series_2099-03-09T09:00:00.000Z";
    const { put, service } = setup({ [occurrence]: stored({ id: occurrence, ...(await sealed("series")) }) });
    put.mockResolvedValue(stored({ id: "series" }) as never);

    await service.updateEvent(occurrence, { title: "Physio" });

    const body = put.mock.calls[0]?.[1] as CalendarEvent;
    await expect(
      openEncryptedEvent(e2ee, keys, stored({ ...body, id: "series" }), true),
    ).resolves.toMatchObject({ title: "Physio" });
  });

  it("never seals the placeholder of an event that did not open over its content", async () => {
    const { put, service } = setup({ e1: stored({ id: "e1", ...(await sealed("elsewhere")) }) });

    await expect(service.updateEvent("e1", { color: "rose" })).rejects.toMatchObject({
      message: EVENT_CONTENT_UNAVAILABLE_MESSAGE,
    });
    expect(put).not.toHaveBeenCalled();
  });

  it("re-seals unbound content bound to its id, and never re-seals a placeholder", async () => {
    const legacy = JSON.stringify(await e2ee.encryptJsonPayload(keys.accountKey, { title: "Gym" }, "event-content:v1"));
    const { post, service } = setup({
      e1: stored({ id: "e1", encryptedContent: legacy, encryptionKeyVersion: 1 }),
      e2: stored({ id: "e2", ...(await sealed("elsewhere")) }),
    });

    await expect(service.resealEventAttributes("e1")).resolves.toBe(true);
    const body = post.mock.calls[0]?.[1] as { encryptedContent: string; encryptionKeyVersion: number; expectedEncryptedContent: string };
    expect(body).toMatchObject({ encryptionKeyVersion: 2, expectedEncryptedContent: legacy });
    await expect(
      openEncryptedEvent(e2ee, keys, stored({ id: "e1", ...body }), true),
    ).resolves.toMatchObject({ title: "Gym" });

    await expect(service.resealEventAttributes("e2")).resolves.toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("opens a trashed and restored bound event, which keeps its id and ciphertext", async () => {
    const content = await sealed("e1");
    const { get, post, service } = setup();
    get.mockResolvedValue({
      events: [{ id: "trash-1", eventId: "e1", calendarId: "cal-1", calendarMissing: false, title: "", ...content,
        encryptionState: "encrypted", start: "2099-03-02T09:00:00.000Z", end: "2099-03-02T10:00:00.000Z",
        allDay: false, timezone: "UTC", recurrence: null, trashedAt: "2099-01-01T00:00:00.000Z", purgeAt: "2099-01-31T00:00:00.000Z" }],
    } as never);
    post.mockResolvedValue(stored({ id: "e1", ...content, calendarId: "default" }) as never);

    await expect(service.listTrashedEvents()).resolves.toMatchObject([{ eventId: "e1", title: "Therapy" }]);
    await expect(service.restoreTrashedEvent("trash-1")).resolves.toMatchObject({ id: "e1", title: "Therapy" });
  });

  it("opens unbound content until the account is marked bound, then shows it as unavailable", async () => {
    const legacy = stored({
      id: "e1",
      encryptedContent: JSON.stringify(await e2ee.encryptJsonPayload(keys.accountKey, { title: "Gym" }, "event-content:v1")),
      encryptionKeyVersion: 1,
    });
    const { provider, service } = setup({ e1: legacy });

    await expect(service.getEvent("e1")).resolves.toMatchObject({ title: "Gym" });
    provider.bound = true;
    await expect(service.getEvent("e1")).resolves.toMatchObject({ contentUnavailable: true });
  });

  it("binds a mailed invitation to its existing copy, or to a new id for a new copy", async () => {
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "METHOD:REQUEST", "BEGIN:VEVENT", "UID:uid-1",
      "DTSTART:20990302T090000Z", "DTEND:20990302T100000Z", "SUMMARY:Planning",
      "ORGANIZER:mailto:organizer@example.com", "ATTENDEE:mailto:me@example.com",
      "END:VEVENT", "END:VCALENDAR", "",
    ].join("\r\n");
    const { get, post, service } = setup();
    post.mockResolvedValue({ errors: [] } as never);
    const sent = () => (post.mock.calls.at(-1)?.[1] as { encryption: Array<{ eventId: string; encryptedContent: string }> }).encryption[0];

    get.mockResolvedValue({ event: stored({ id: "staged", title: "Planning", encryptionState: "plaintext" }) } as never);
    await service.importInvitationIcs(ics);
    expect(sent()?.eventId).toBe("staged");

    get.mockResolvedValue({ event: null } as never);
    await service.importInvitationIcs(ics);
    const entry = sent();
    expect(entry?.eventId).toMatch(CLIENT_ENTITY_ID_PATTERN);
    await expect(
      openEncryptedEvent(e2ee, keys, stored({ id: entry?.eventId ?? "", encryptedContent: entry?.encryptedContent, encryptionKeyVersion: 2 }), true),
    ).resolves.toMatchObject({ title: "Planning" });
  });

  it("learns from the sealed preference that another device bound every event", async () => {
    const { get, provider, service } = setup();
    jest.spyOn(provider, "decryptJson").mockResolvedValue({ eventContentBound: true });
    get.mockResolvedValue({ timezone: "UTC", encryptedPreferences: "sealed" } as never);

    await expect(service.getUserSettings()).resolves.toMatchObject({ eventContentBound: true });
    expect(provider.bound).toBe(true);
  });
});
