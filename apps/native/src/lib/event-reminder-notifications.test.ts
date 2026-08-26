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

describe("persistEventReminderNotifications", () => {
  beforeEach(() => {
    updateEventNotifications.mockClear();
  });

  it("sends the plaintext title with the reminder", async () => {
    await persistEventReminderNotifications("evt-1", {
      title: "Lunch with Sam",
      reminder: 15,
    });

    expect(updateEventNotifications).toHaveBeenCalledWith(
      "evt-1",
      [
        {
          notificationType: "email",
          minutesBefore: 15,
          isEnabled: true,
        },
      ],
      { displayTitle: "Lunch with Sam" },
    );
  });

  it("clears reminders when none are set", async () => {
    await persistEventReminderNotifications("evt-1", {
      title: "Lunch with Sam",
      reminder: 0,
    });

    expect(updateEventNotifications).toHaveBeenCalledWith("evt-1", [], {
      displayTitle: "Lunch with Sam",
    });
  });
});
