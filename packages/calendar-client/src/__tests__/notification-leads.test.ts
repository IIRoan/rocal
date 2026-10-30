import { describe, expect, it, jest } from "@jest/globals";
import { NoopE2eeProvider } from "@workspace/e2ee";

import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

class LeadSealingProvider extends NoopE2eeProvider {
  async encryptNotificationLead(eventId: string, minutesBefore: number) {
    return `sealed-lead(${eventId}):${minutesBefore}`;
  }
}

function setup(e2ee: NoopE2eeProvider) {
  const client = new HttpClient({ baseURL: "https://api.test", retries: 0 });
  const put = jest
    .spyOn(client, "put")
    .mockResolvedValue({ success: true, message: "ok" } as never);
  return { api: new CalendarApiService(client, e2ee), put };
}

const reminders = [
  { notificationType: "email" as const, minutesBefore: 15, isEnabled: true },
  { notificationType: "email" as const, minutesBefore: 60, isEnabled: true },
];

describe("updateEventNotifications", () => {
  it("seals each reminder's lead so the push never carries it readable", async () => {
    const { api, put } = setup(new LeadSealingProvider());

    await api.updateEventNotifications("evt_1", reminders);

    expect(put).toHaveBeenCalledWith("/api/notifications/event/evt_1", {
      notifications: [
        { ...reminders[0], encryptedLead: "sealed-lead(evt_1):15" },
        { ...reminders[1], encryptedLead: "sealed-lead(evt_1):60" },
      ],
    });
  });

  it("sends no lead without a session, so the stored one is kept", async () => {
    const { api, put } = setup(new NoopE2eeProvider());

    await api.updateEventNotifications("evt_1", reminders);

    expect(put).toHaveBeenCalledWith("/api/notifications/event/evt_1", {
      notifications: reminders,
    });
  });
});
