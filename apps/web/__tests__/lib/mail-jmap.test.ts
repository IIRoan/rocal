import { describe, expect, it } from "@jest/globals";

import {
  buildBasicAuthHeader,
  buildSendMessageMethodCalls,
  getPrimaryMailAccountId,
  normalizeJmapSession,
} from "../../lib/mail/jmap-client";

describe("mail JMAP helpers", () => {
  it("builds a basic auth header from mailbox credentials", () => {
    expect(buildBasicAuthHeader("alice@solace.onl", "mailbox-password")).toBe(
      `Basic ${Buffer.from("alice@solace.onl:mailbox-password").toString("base64")}`,
    );
  });

  it("normalizes advertised session URLs back to the configured discovery base", () => {
    const session = normalizeJmapSession(
      {
        apiUrl: "https://solacemailmail.solace.onl/jmap/",
        downloadUrl:
          "https://solacemailmail.solace.onl/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
        uploadUrl:
          "https://solacemailmail.solace.onl/jmap/upload/{accountId}/",
        eventSourceUrl:
          "https://solacemailmail.solace.onl/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
        accounts: {},
        primaryAccounts: {
          "urn:ietf:params:jmap:mail": "b",
        },
      },
      "http://192.168.2.213:8080",
    );

    expect(session).toEqual(
      expect.objectContaining({
        apiUrl: "http://192.168.2.213:8080/jmap/",
        downloadUrl:
          "http://192.168.2.213:8080/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
        uploadUrl: "http://192.168.2.213:8080/jmap/upload/{accountId}/",
        eventSourceUrl:
          "http://192.168.2.213:8080/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
      }),
    );
  });

  it("preserves proxy base paths when normalizing advertised session URLs", () => {
    const session = normalizeJmapSession(
      {
        apiUrl: "https://solacemailmail.solace.onl/jmap/",
        downloadUrl:
          "https://solacemailmail.solace.onl/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
        uploadUrl:
          "https://solacemailmail.solace.onl/jmap/upload/{accountId}/",
        eventSourceUrl:
          "https://solacemailmail.solace.onl/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
        accounts: {},
        primaryAccounts: {
          "urn:ietf:params:jmap:mail": "b",
        },
      },
      "http://localhost:4001/api/mail/jmap",
    );

    expect(session).toEqual(
      expect.objectContaining({
        apiUrl: "http://localhost:4001/api/mail/jmap/jmap/",
        downloadUrl:
          "http://localhost:4001/api/mail/jmap/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
        uploadUrl: "http://localhost:4001/api/mail/jmap/jmap/upload/{accountId}/",
        eventSourceUrl:
          "http://localhost:4001/api/mail/jmap/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}",
      }),
    );
  });

  it("returns the primary mail account id from the session", () => {
    expect(
      getPrimaryMailAccountId({
        accounts: {
          b: { name: "alice@solace.onl" },
        },
        primaryAccounts: {
          "urn:ietf:params:jmap:mail": "b",
        },
      }),
    ).toBe("b");
  });

  it("builds plain-text send method calls for Email/set and EmailSubmission/set", () => {
    expect(
      buildSendMessageMethodCalls({
        draftsMailboxId: "drafts-1",
        fromEmail: "alice@solace.onl",
        to: ["bob@example.com", "cara@example.com"],
        subject: "Hello",
        textBody: "Hello from Solace Mail",
        identityId: "identity-1",
      }),
    ).toEqual([
      [
        "Email/set",
        {
          create: {
            draft1: {
              mailboxIds: { "drafts-1": true },
              from: [{ email: "alice@solace.onl" }],
              to: [{ email: "bob@example.com" }, { email: "cara@example.com" }],
              subject: "Hello",
              bodyStructure: {
                type: "text/plain",
                partId: "text",
              },
              bodyValues: {
                text: {
                  value: "Hello from Solace Mail",
                },
              },
            },
          },
        },
        "c1",
      ],
      [
        "EmailSubmission/set",
        {
          create: {
            s1: {
              emailId: "#draft1",
              identityId: "identity-1",
            },
          },
        },
        "c2",
      ],
    ]);
  });
});