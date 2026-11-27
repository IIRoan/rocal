import { describe, expect, it } from "@jest/globals";
import { initialFields } from "./use-event-form-state";

const timezone = "Europe/Amsterdam";

describe("initialFields reminders", () => {
  it("starts a new event with 15 minutes until the account picks another default", () => {
    expect(initialFields({ timezone }).reminders).toEqual([15]);
    expect(
      initialFields({ timezone, defaultReminderMinutes: 60 }).reminders,
    ).toEqual([60]);
    expect(
      initialFields({ timezone, defaultReminderMinutes: 0 }).reminders,
    ).toEqual([]);
  });

  it("keeps an event's own reminders over the account default", () => {
    expect(
      initialFields({
        timezone,
        initialValues: { reminder: undefined },
        defaultReminderMinutes: 60,
      }).reminders,
    ).toEqual([]);
    expect(
      initialFields({
        timezone,
        initialReminders: [30],
        defaultReminderMinutes: 60,
      }).reminders,
    ).toEqual([30]);
  });

  it("sizes an unseeded new event to the default duration", () => {
    const fields = initialFields({ timezone, defaultDurationMinutes: 30 });
    const minutes = (Date.parse(fields.end) - Date.parse(fields.start)) / 60_000;
    expect(minutes).toBe(30);
  });
});
