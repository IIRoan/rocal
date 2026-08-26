import { describe, expect, it } from "@jest/globals";
import {
  parseStalwartMailIngestEvents,
  STALWART_MAIL_INGEST_EVENT,
} from "../../lib/stalwart-webhook";

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
        fromName: "Sam",
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
        fromName: "Sam",
        fromEmail: "sam@example.com",
      },
    ]);
  });
});
