import { describe, expect, it } from "@jest/globals";
import {
  isSolaceReminderMessageId,
  parseStalwartMailIngestEvents,
  STALWART_MAIL_INGEST_EVENT,
} from "../../lib/stalwart-webhook";

describe("isSolaceReminderMessageId", () => {
  it("matches reminder Message-IDs with or without angle brackets", () => {
    expect(isSolaceReminderMessageId("<solace-reminder.abc@solace.onl>")).toBe(true);
    expect(isSolaceReminderMessageId("solace-reminder.abc@solace.onl")).toBe(true);
    expect(isSolaceReminderMessageId(" <SOLACE-REMINDER.abc@solace.onl> ")).toBe(true);
  });

  it("does not match other Message-IDs", () => {
    expect(isSolaceReminderMessageId("<abc@example.com>")).toBe(false);
    expect(isSolaceReminderMessageId("<x.solace-reminder.abc@solace.onl>")).toBe(false);
    expect(isSolaceReminderMessageId(null)).toBe(false);
    expect(isSolaceReminderMessageId(undefined)).toBe(false);
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
