import { describe, expect, it } from "@jest/globals";
import {
  isSolaceReminderMail,
  parseStalwartMailIngestEvents,
  STALWART_MAIL_INGEST_EVENT,
} from "../../lib/stalwart-webhook";

describe("isSolaceReminderMail", () => {
  const noreply = "noreply@solace.onl";
  const reminder = (fromEmail: string | null, messageId: string | null) =>
    isSolaceReminderMail({ fromEmail, messageIds: [messageId] }, noreply);

  it("matches noreply mail with a reminder Message-ID with or without angle brackets", () => {
    expect(reminder(noreply, "<solace-reminder.abc@solace.onl>")).toBe(true);
    expect(reminder(noreply, "solace-reminder.abc@solace.onl")).toBe(true);
    expect(reminder("NOREPLY@solace.onl", " <SOLACE-REMINDER.abc@solace.onl> ")).toBe(true);
  });

  it("rejects reminder Message-IDs that a third party can forge", () => {
    expect(reminder("mallory@evil.example", "<solace-reminder.abc@solace.onl>")).toBe(false);
    expect(reminder(null, "<solace-reminder.abc@solace.onl>")).toBe(false);
    expect(reminder(noreply, "<solace-reminder.abc@evil.example>")).toBe(false);
    expect(reminder(noreply, "<solace-reminder.abc@evil.example@solace.onl>")).toBe(false);
  });

  it("does not match other Message-IDs", () => {
    expect(reminder(noreply, "<abc@example.com>")).toBe(false);
    expect(reminder(noreply, "<x.solace-reminder.abc@solace.onl>")).toBe(false);
    expect(reminder(noreply, null)).toBe(false);
  });
});

describe("parseStalwartMailIngestEvents", () => {
  it("parses message-ingest.ham events with telemetry ids and recipients", () => {
    expect(
      parseStalwartMailIngestEvents({
        events: [
          {
            type: STALWART_MAIL_INGEST_EVENT,
            data: {
              accountId: 13,
              documentId: 1553,
              from: "Sam <sam@example.com>",
              to: ["testingproduction15@solace.onl"],
              subject: "Hello",
              messageId: "<abc@example.com>",
            },
          },
        ],
      }),
    ).toEqual([
      {
        accountId: "13",
        documentId: "1553",
        recipientEmails: ["testingproduction15@solace.onl"],
        messageId: "<abc@example.com>",
        subject: "Hello",
        fromEmail: "sam@example.com",
      },
    ]);
  });

  it("ignores spam and jmap-append events", () => {
    expect(
      parseStalwartMailIngestEvents({
        events: [
          {
            type: "message-ingest.spam",
            data: { accountId: "3", documentId: "16" },
          },
          {
            type: "message-ingest.jmap-append",
            data: { accountId: "3", documentId: "17" },
          },
        ],
      }),
    ).toEqual([]);
  });

  it("skips events without a document id", () => {
    expect(
      parseStalwartMailIngestEvents({
        events: [
          {
            type: STALWART_MAIL_INGEST_EVENT,
            data: { accountId: "3" },
          },
        ],
      }),
    ).toEqual([]);
  });

  it("parses structured from/to fields and message-id aliases", () => {
    expect(
      parseStalwartMailIngestEvents({
        events: [
          {
            type: STALWART_MAIL_INGEST_EVENT,
            data: {
              accountId: 13,
              documentId: 1558,
              from: [{ email: "sam@example.com", name: "Sam" }],
              to: [{ email: "owner@solace.onl" }],
              "message-id": "<abc@example.com>",
            },
          },
        ],
      }),
    ).toEqual([
      {
        accountId: "13",
        documentId: "1558",
        recipientEmails: ["owner@solace.onl"],
        messageId: "<abc@example.com>",
        subject: null,
        fromEmail: "sam@example.com",
      },
    ]);
  });
});
