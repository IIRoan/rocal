import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_JMAP_GET_MAX_RESULTS,
  DEFAULT_MAX_IDENTITIES,
  DEFAULT_MAX_MAILBOX_DEPTH,
  DEFAULT_MAX_MAILBOX_NAME_LENGTH,
  DEFAULT_MAX_MAILBOXES,
  getBuiltinDefaultFolders,
  getMissingDefaultFolderRoles,
  parseStalwartDefaultFolders,
  parseStalwartDuration,
  resolveMailServerPolicy,
  resolveMailboxMessagesPageSize,
  resolveMailboxNameDepth,
  validateIdentityLimit,
  validateJmapRequestSize,
  validateMailboxCreate,
  validateMailboxName,
  MailBlobUploadRegistry,
  chunkJmapMethodCalls,
  estimateOutgoingJmapMessageBytes,
  isBlobUploadExpired,
  jmapMethodCallsHaveDependencies,
  validateOutgoingMessageSize,
} from "../../src/mail-server-policy";

describe("parseStalwartDuration", () => {
  it("parses Stalwart duration strings", () => {
    expect(parseStalwartDuration("1h")).toBe(3_600_000);
    expect(parseStalwartDuration("30m")).toBe(1_800_000);
  });
});

describe("parseStalwartDefaultFolders", () => {
  it("parses Stalwart default folder map", () => {
    expect(
      parseStalwartDefaultFolders({
        inbox: { name: "Inbox", create: true, subscribe: true },
        sent: { name: "Sent Items", create: true, subscribe: true },
      }),
    ).toEqual([
      { role: "inbox", name: "Inbox", create: true, subscribe: true },
      { role: "sent", name: "Sent Items", create: true, subscribe: true },
    ]);
  });

  it("falls back to built-in defaults", () => {
    expect(parseStalwartDefaultFolders(null)).toEqual(getBuiltinDefaultFolders());
  });
});

describe("resolveMailServerPolicy", () => {
  it("merges Email and Jmap singleton settings with limits", () => {
    expect(
      resolveMailServerPolicy({
        emailSettings: {
          maxAttachmentSize: 100_000_000,
          maxMessageSize: 150_000_000,
          maxMailboxDepth: 8,
          maxMailboxNameLength: 120,
          maxMailboxes: 100,
          maxIdentities: 5,
        },
        jmapSettings: {
          maxUploadSize: 100_000_000,
          getMaxResults: 200,
          queryMaxResults: 1000,
          maxMethodCalls: 8,
          maxConcurrentUploads: 2,
          maxRequestSize: 5_000_000,
          uploadTtl: "30m",
        },
      }),
    ).toMatchObject({
      limits: {
        maxBlobUploadBytes: 100_000_000,
        maxAttachmentSizeBytes: 100_000_000,
        maxMessageSizeBytes: 150_000_000,
        maxOutgoingAttachmentBytes: 100_000_000,
      },
      maxMailboxDepth: 8,
      maxMailboxNameLength: 120,
      maxMailboxes: 100,
      maxIdentities: 5,
      getMaxResults: 200,
      queryMaxResults: 1000,
      maxMethodCalls: 8,
      maxConcurrentUploads: 2,
      maxRequestSizeBytes: 5_000_000,
      uploadTtlMs: 1_800_000,
    });
  });

  it("uses Stalwart defaults when settings are unavailable", () => {
    expect(resolveMailServerPolicy({})).toMatchObject({
      maxMailboxDepth: DEFAULT_MAX_MAILBOX_DEPTH,
      maxMailboxNameLength: DEFAULT_MAX_MAILBOX_NAME_LENGTH,
      maxMailboxes: DEFAULT_MAX_MAILBOXES,
      maxIdentities: DEFAULT_MAX_IDENTITIES,
      getMaxResults: DEFAULT_JMAP_GET_MAX_RESULTS,
      defaultFolders: getBuiltinDefaultFolders(),
    });
  });
});

describe("mailbox policy validation", () => {
  const policy = resolveMailServerPolicy({
    emailSettings: {
      maxMailboxDepth: 3,
      maxMailboxNameLength: 10,
      maxMailboxes: 2,
    },
  });

  it("rejects names that exceed length or depth", () => {
    expect(validateMailboxName("a".repeat(11), policy)).toMatch(/10 characters/);
    expect(validateMailboxName("a/b/c/d", policy)).toMatch(/depth/);
    expect(resolveMailboxNameDepth("one/two/three")).toBe(3);
  });

  it("rejects mailbox creation when at the server limit", () => {
    expect(
      validateMailboxCreate(
        { name: "Projects", existingMailboxCount: 2 },
        policy,
      ),
    ).toMatch(/at most 2 mailboxes/);
  });
});

describe("default folder roles", () => {
  it("detects missing required folders", () => {
    expect(
      getMissingDefaultFolderRoles(
        [{ role: "inbox" }, { role: "drafts" }],
        getBuiltinDefaultFolders(),
      ).map((folder) => folder.role),
    ).toEqual(["sent", "trash"]);
  });
});

describe("validateIdentityLimit", () => {
  it("rejects creating an identity at the server limit", () => {
    const policy = resolveMailServerPolicy({
      emailSettings: { maxIdentities: 2 },
    });

    expect(validateIdentityLimit(2, policy)).toMatch(/at most 2 identities/);
    expect(validateIdentityLimit(1, policy)).toBeNull();
  });
});

describe("resolveMailboxMessagesPageSize", () => {
  it("caps the preferred page size by getMaxResults", () => {
    expect(
      resolveMailboxMessagesPageSize(
        resolveMailServerPolicy({
          jmapSettings: { getMaxResults: 25 },
        }),
        50,
      ),
    ).toBe(25);
  });
});

describe("validateJmapRequestSize", () => {
  it("rejects oversized draft payloads", () => {
    const policy = resolveMailServerPolicy({
      jmapSettings: { maxRequestSize: 1_000_000 },
    });
    expect(validateJmapRequestSize(2_000_000, policy)).toMatch(/too large/);
    expect(validateJmapRequestSize(500_000, policy)).toBeNull();
  });
});

describe("estimateOutgoingJmapMessageBytes", () => {
  it("sums bodies, attachments, and overhead", () => {
    const estimate = estimateOutgoingJmapMessageBytes({
      subject: "Hello",
      textBody: "a".repeat(1000),
      htmlBody: "b".repeat(2000),
      attachments: [{ size: 5000 }],
    });

    expect(estimate).toBeGreaterThan(7000);
  });
});

describe("jmapMethodCallsHaveDependencies", () => {
  it("detects resultOf references", () => {
    expect(
      jmapMethodCallsHaveDependencies([
        ["Email/query", { accountId: "a1" }, "q1"],
        [
          "Email/get",
          {
            accountId: "a1",
            "#ids": { resultOf: "q1", name: "Email/query", path: "/ids" },
          },
          "g1",
        ],
      ]),
    ).toBe(true);
  });
});
