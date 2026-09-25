import type { JmapEmailMessage } from "./types";
import {
  extractLinkedCalendarEventId,
  getCalendarEventLinkSource,
  isSolaceEventReminderEmail,
} from "./calendar-event-link";

const reminderMessage = {
  id: "msg-1",
  subject: "Encrypted event in 15 minutes",
  bodyValues: {
    "1": {
      value: [
        "Encrypted event",
        "",
        "15 minutes",
        "Event ID: event-1",
        "Open event: https://solace.onl/calendar?eventId=event-1",
      ].join("\n"),
    },
  },
} satisfies JmapEmailMessage;

describe("native calendar-event-link", () => {
  it("detects Solace reminder emails and extracts the linked event id", () => {
    const plaintext = [
      "Encrypted event",
      "15 minutes",
      "Event ID: event-1",
    ].join("\n");

    const source = getCalendarEventLinkSource(reminderMessage, plaintext);
    expect(isSolaceEventReminderEmail(source)).toBe(true);
    expect(extractLinkedCalendarEventId(reminderMessage, plaintext)).toBe(
      "event-1",
    );
  });
});
