import { describe, expect, it } from "@jest/globals";
import { parseMailRealtimeEvent } from "@/lib/mail/types";

describe("parseMailRealtimeEvent", () => {
  it("accepts JMAP null for optional cc, bcc, and body structure fields", () => {
    const event = parseMailRealtimeEvent({
      type: "mail.changed",
      accountId: "acc-1",
      changedTypes: ["Email"],
      receivedAt: "2026-06-08T15:26:45.000Z",
      sync: {
        accountId: "acc-1",
        initialized: false,
        changedTypes: ["Email"],
        email: {
          oldState: null,
          newState: "state-1",
          created: [],
          updated: ["msg-1"],
          destroyed: [],
          records: [
            {
              id: "msg-1",
              cc: null,
              bcc: null,
              bodyStructure: {
                type: "multipart/alternative",
                blobId: null,
                name: null,
                subParts: [{ type: "text/plain", name: null }],
              },
            },
          ],
        },
        mailbox: {
          oldState: null,
          newState: "mb-state",
          created: [],
          updated: [],
          destroyed: [],
          records: [],
        },
        thread: {
          oldState: null,
          newState: "th-state",
          created: [],
          updated: [],
          destroyed: [],
          records: [],
        },
      },
    });

    const record = event.sync?.email.records[0];
    expect(record?.cc).toBeUndefined();
    expect(record?.bcc).toBeUndefined();
    expect(record?.bodyStructure?.blobId).toBeUndefined();
    expect(record?.bodyStructure?.name).toBeUndefined();
    expect(record?.bodyStructure?.subParts?.[0]?.name).toBeUndefined();
  });

  it("accepts JMAP null for optional to and from address lists", () => {
    const event = parseMailRealtimeEvent({
      type: "mail.changed",
      accountId: "acc-1",
      changedTypes: ["Email"],
      receivedAt: "2026-06-08T15:26:45.000Z",
      sync: {
        accountId: "acc-1",
        initialized: false,
        changedTypes: ["Email"],
        email: {
          oldState: null,
          newState: "state-1",
          created: [],
          updated: ["msg-1"],
          destroyed: [],
          records: [
            {
              id: "msg-1",
              to: null,
              from: null,
            },
          ],
        },
        mailbox: {
          oldState: null,
          newState: "mb-state",
          created: [],
          updated: [],
          destroyed: [],
          records: [],
        },
        thread: {
          oldState: null,
          newState: "th-state",
          created: [],
          updated: [],
          destroyed: [],
          records: [],
        },
      },
    });

    const record = event.sync?.email.records[0];
    expect(record?.to).toBeUndefined();
    expect(record?.from).toBeUndefined();
  });

  it("reads empty and null header lists as absent", () => {
    const event = parseMailRealtimeEvent({
      type: "mail.changed",
      accountId: "acc-1",
      changedTypes: ["Email"],
      receivedAt: "2026-06-08T15:26:45.000Z",
      sync: {
        accountId: "acc-1",
        initialized: false,
        changedTypes: ["Email"],
        email: {
          oldState: null,
          newState: "state-1",
          created: [],
          updated: ["msg-1"],
          destroyed: [],
          records: [
            {
              id: "msg-1",
              "header:Received": [],
              "header:DKIM-Signature": null,
              "header:Authentication-Results:asText:all": ["mx; dkim=pass"],
            },
          ],
        },
        mailbox: { oldState: null, newState: "mb", created: [], updated: [], destroyed: [], records: [] },
        thread: { oldState: null, newState: "th", created: [], updated: [], destroyed: [], records: [] },
      },
    });

    const record = event.sync?.email.records[0];
    expect(record?.["header:Received"]).toBeUndefined();
    expect(record?.["header:DKIM-Signature"]).toBeUndefined();
    expect(record?.["header:Authentication-Results:asText:all"]).toEqual(["mx; dkim=pass"]);
  });
});
