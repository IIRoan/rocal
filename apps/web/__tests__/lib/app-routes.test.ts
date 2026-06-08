import { describe, expect, it } from "@jest/globals";

import {
  CALENDAR_HOME_PATH,
  MAIL_HOME_PATH,
  buildCalendarPath,
  buildMailPath,
  buildPathWithSearch,
} from "../../lib/app-routes";
import { encodeMailMessageToken } from "../../lib/mail/mail-url";

describe("app route helpers", () => {
  it("defines the separated calendar and mail routes", () => {
    expect(CALENDAR_HOME_PATH).toBe("/calendar");
    expect(MAIL_HOME_PATH).toBe("/mail");
  });

  it("builds the calendar path while preserving supported search params", () => {
    expect(
      buildCalendarPath({
        date: "2026-05-07",
        view: "week",
        eventId: ["evt-1", "evt-2"],
        palette: undefined,
      }),
    ).toBe("/calendar?date=2026-05-07&view=week&eventId=evt-1&eventId=evt-2");
  });

  it("re-exports mail url builders", () => {
    const token = encodeMailMessageToken("message-1");

    expect(
      buildMailPath({
        mailbox: { id: "mb-inbox", name: "Inbox", role: "inbox" },
        messageId: "message-1",
      }),
    ).toBe(`/mail?mbox=inbox&msg=${token}`);
  });

  it("supports cloning URLSearchParams inputs", () => {
    expect(
      buildPathWithSearch(
        CALENDAR_HOME_PATH,
        new URLSearchParams("palette=settings"),
      ),
    ).toBe("/calendar?palette=settings");
  });
});
