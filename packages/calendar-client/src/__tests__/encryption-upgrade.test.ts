import { describe, expect, it, jest } from "@jest/globals";
import type { CalendarEvent } from "@workspace/calendar-core";
import { NoopE2eeProvider, withDecryptedEventContent } from "@workspace/e2ee";

import { CalendarApiService } from "../calendar-api-service";
import { upgradeStoredEncryption } from "../encryption-upgrade";
import { HttpClient } from "../http-client";

class SealingProvider extends NoopE2eeProvider {
  async hasActiveSession() {
    return true;
  }
  async hydrateEncryptedEvent(event: CalendarEvent) {
    const content = String(event.encryptedContent ?? "");
    if (!content.startsWith("sealed:")) {
      if (event.encryptionState === "encrypted") throw new Error("cannot open");
      return event;
    }
    return withDecryptedEventContent(event, JSON.parse(content.slice("sealed:".length)));
  }
  async attachEventEncryptionShadow<T>(request: T) {
    return { encryptedContent: `sealed:${JSON.stringify(request)}` } as never;
  }
  async encryptNotificationLead(eventId: string, minutesBefore: number) {
    return `lead:${eventId}:${minutesBefore}`;
  }
  async encryptNotificationTitle(eventId: string, title: string) {
    return `title:${eventId}:${title}`;
  }
}

const event = (id: string, encryptedContent: string, color: string | null = null) => ({
  id,
  title: "",
  encryptedContent,
  encryptionState: "encrypted",
  color,
  calendarId: "cal-1",
  userId: "user-1",
  start: "2099-03-02T09:00:00.000Z",
  end: "2099-03-02T10:00:00.000Z",
});

function setup(events: Record<string, ReturnType<typeof event>>, reminders: { minutesBefore: number; isSent: boolean }[] = []) {
  const client = new HttpClient({ baseURL: "https://api.test", retries: 0 });
  jest.spyOn(client, "get").mockImplementation(async (path: string) => {
    const id = decodeURIComponent(path.split("/").pop() ?? "");
    if (path.startsWith("/api/notifications/event/")) {
      return { success: true, data: { eventId: id, count: reminders.length, notifications: reminders } } as never;
    }
    return events[id] as never;
  });
  const post = jest.spyOn(client, "post").mockResolvedValue({} as never);
  const put = jest.spyOn(client, "put").mockResolvedValue({ updated: 1 } as never);
  return { post, put, service: new CalendarApiService(client, new SealingProvider()) };
}

describe("resealEventAttributes", () => {
  it("moves the readable colour into new ciphertext, over the ciphertext it read", async () => {
    const stored = `sealed:${JSON.stringify({ title: "Gym", description: "Legs" })}`;
    const { post, service } = setup({ a: event("a", stored, "green") });

    await expect(service.resealEventAttributes("a")).resolves.toBe(true);

    expect(post).toHaveBeenCalledWith("/api/events/a/seal-encryption", {
      encryptedContent: `sealed:${JSON.stringify({ title: "Gym", description: "Legs", location: "", color: "green", categoryId: "" })}`,
      expectedEncryptedContent: stored,
    });
  });

  it("leaves an event it cannot open alone", async () => {
    const { post, service } = setup({ a: event("a", "unreadable", "green") });

    await expect(service.resealEventAttributes("a")).resolves.toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});

describe("sealPendingReminders", () => {
  it("seals the title and the leads of unsent reminders only", async () => {
    const { put, service } = setup(
      { a: event("a", `sealed:${JSON.stringify({ title: "Gym" })}`) },
      [
        { minutesBefore: 15, isSent: false },
        { minutesBefore: 60, isSent: true },
        { minutesBefore: 15, isSent: false },
      ],
    );

    await expect(service.sealPendingReminders("a")).resolves.toBe(true);

    expect(put).toHaveBeenCalledWith("/api/notifications/event/a/sealed", {
      leads: [{ minutesBefore: 15, encryptedLead: "lead:a:15" }],
      encryptedDisplayTitle: "title:a:Gym",
    });
  });
});

describe("upgradeStoredEncryption", () => {
  function fakeApi(report: {
    eventsWithReadableAttributes?: string[];
    eventsWithUnsealedReminders?: string[];
    readableInvitations?: number;
    unsealedSettings?: boolean;
  }) {
    return {
      getEncryptionUpgrades: jest.fn(async () => ({
        eventsWithReadableAttributes: [],
        eventsWithUnsealedReminders: [],
        readableInvitations: 0,
        unsealedSettings: false,
        ...report,
      })),
      ensureSealedUserSettings: jest.fn(async () => true),
      getEventSearchCorpus: jest.fn(async () => ({ events: [], total: 0, nextOffset: null })),
      sealImportedInvitationIfNeeded: jest.fn(async (e: CalendarEvent) => e),
      resealEventAttributes: jest.fn(async (id: string) => {
        if (id === "broken") throw new Error("offline");
        return true;
      }),
      sealPendingReminders: jest.fn(async () => true),
    };
  }

  it("does nothing beyond asking when the account is up to date", async () => {
    const api = fakeApi({});

    await expect(upgradeStoredEncryption(api)).resolves.toBe(false);

    expect(api.ensureSealedUserSettings).not.toHaveBeenCalled();
    expect(api.getEventSearchCorpus).not.toHaveBeenCalled();
    expect(api.resealEventAttributes).not.toHaveBeenCalled();
    expect(api.sealPendingReminders).not.toHaveBeenCalled();
  });

  it("runs each reported fix, and one failure does not stop the rest", async () => {
    const api = fakeApi({
      eventsWithReadableAttributes: ["a", "broken", "c", "d", "e"],
      eventsWithUnsealedReminders: ["r"],
      readableInvitations: 2,
      unsealedSettings: true,
    });

    await expect(upgradeStoredEncryption(api)).resolves.toBe(true);

    expect(api.resealEventAttributes.mock.calls.map(([id]) => id)).toEqual(["a", "broken", "c", "d", "e"]);
    expect(api.sealPendingReminders).toHaveBeenCalledWith("r");
    expect(api.getEventSearchCorpus).toHaveBeenCalledWith(
      expect.objectContaining({ readableInvitations: true }),
      undefined,
    );
  });
});
