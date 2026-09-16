import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { calendarApiService } from "./api";
import { persistEventReminderNotifications } from "./event-reminder-notifications";

jest.mock("./api", () => ({
  calendarApiService: {
    updateEventNotifications: jest.fn(async () => ({
      success: true,
      message: "ok",
    })),
  },
}));

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

const updateEventNotifications =
  calendarApiService.updateEventNotifications as jest.Mock;
const encryptTitle = jest.fn(
  async (eventId: string, title: string): Promise<string | null> =>
    `enc:${eventId}:${title}`,
);

describe("persistEventReminderNotifications", () => {
  beforeEach(() => {
    updateEventNotifications.mockClear();
    encryptTitle.mockClear();
  });

  it("sends only the encrypted title with the reminder", async () => {
    await persistEventReminderNotifications(
      "evt-1",
      { title: " Lunch with Sam ", reminder: 15 },
      encryptTitle,
    );

    expect(encryptTitle).toHaveBeenCalledWith("evt-1", "Lunch with Sam");
    expect(updateEventNotifications).toHaveBeenCalledWith(
      "evt-1",
      [
        {
          notificationType: "email",
          minutesBefore: 15,
          isEnabled: true,
        },
      ],
      { encryptedDisplayTitle: "enc:evt-1:Lunch with Sam" },
    );
  });

  it("clears reminders without encrypting when none are set", async () => {
    await persistEventReminderNotifications(
      "evt-1",
      { title: "Lunch with Sam", reminder: 0 },
      encryptTitle,
    );

    expect(encryptTitle).not.toHaveBeenCalled();
    expect(updateEventNotifications).toHaveBeenCalledWith("evt-1", [], {
      encryptedDisplayTitle: null,
    });
  });

  it("keeps the stored title when encryption fails", async () => {
    encryptTitle.mockRejectedValueOnce(new Error("no key"));

    await persistEventReminderNotifications(
      "evt-1",
      { title: "Lunch with Sam", reminder: 15 },
      encryptTitle,
    );

    // undefined, not null: a locked session must not wipe a title another
    // device saved. The reminder itself still saves.
    expect(updateEventNotifications).toHaveBeenCalledWith(
      "evt-1",
      expect.any(Array),
      { encryptedDisplayTitle: undefined },
    );
  });
});
