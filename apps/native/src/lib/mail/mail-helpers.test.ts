import type { JmapEmailMessage, JmapMailbox, MailAddress } from "./types";
import {
  formatAddress,
  formatAddressFull,
  formatMessageDate,
  getInitials,
  getMailboxDisplayName,
  getMailboxIcon,
  getPrimaryMailboxId,
  isLikelyEmail,
  isMessageFlagged,
  isMessageRead,
  parseEmailList,
  formatReplyAllRecipientFields,
  formatRecipientSummary,
  sortMailboxes,
  sortMessagesByDate,
  validateComposeInput,
} from "./mail-helpers";

function mailbox(partial: Partial<JmapMailbox> & { id: string }): JmapMailbox {
  return { name: partial.id, ...partial };
}

function message(
  partial: Partial<JmapEmailMessage> & { id: string },
): JmapEmailMessage {
  return { ...partial };
}

describe("formatAddress", () => {
  it("returns the name when present, falling back to the email", () => {
    expect(formatAddress([{ email: "a@b.com", name: "Alice" }])).toBe("Alice");
    expect(formatAddress([{ email: "a@b.com" }])).toBe("a@b.com");
  });

  it("returns Unknown for empty/undefined input", () => {
    expect(formatAddress(undefined)).toBe("Unknown");
    expect(formatAddress([])).toBe("Unknown");
  });

  it("ignores whitespace-only names", () => {
    expect(formatAddress([{ email: "a@b.com", name: "   " }])).toBe("a@b.com");
  });
});

describe("formatAddressFull", () => {
  const addresses: MailAddress[] = [
    { email: "a@b.com", name: "Alice" },
    { email: "c@d.com" },
    { email: "e@f.com", name: "Eve" },
    { email: "g@h.com" },
  ];

  it("formats up to maxCount addresses and summarizes the rest", () => {
    expect(formatAddressFull(addresses, 2)).toBe(
      "Alice <a@b.com>, c@d.com, +2 more",
    );
  });

  it("does not add a summary when within maxCount", () => {
    expect(formatAddressFull(addresses.slice(0, 2), 3)).toBe(
      "Alice <a@b.com>, c@d.com",
    );
  });

  it("returns Unknown when there are no addresses", () => {
    expect(formatAddressFull([])).toBe("Unknown");
    expect(formatAddressFull(undefined)).toBe("Unknown");
  });
});

describe("formatMessageDate", () => {
  it("returns an empty string for missing or invalid dates", () => {
    expect(formatMessageDate(undefined)).toBe("");
    expect(formatMessageDate("not-a-date")).toBe("");
  });

  it("returns a non-empty label for a valid date", () => {
    expect(formatMessageDate(new Date().toISOString()).length).toBeGreaterThan(
      0,
    );
    expect(
      formatMessageDate("2000-01-02T03:04:05.000Z").length,
    ).toBeGreaterThan(0);
  });

  it("returns a fuller timestamp for style=full", () => {
    const compact = formatMessageDate("2000-01-02T03:04:05.000Z");
    const full = formatMessageDate("2000-01-02T03:04:05.000Z", {
      style: "full",
    });
    expect(full.length).toBeGreaterThan(compact.length);
  });
});

describe("formatRecipientSummary", () => {
  it("returns an empty string when there are no recipients", () => {
    expect(formatRecipientSummary(undefined)).toBe("");
    expect(formatRecipientSummary([])).toBe("");
  });

  it("labels the current user as me", () => {
    expect(
      formatRecipientSummary(
        [{ email: "me@solace.onl", name: "Roan" }],
        "me@solace.onl",
      ),
    ).toBe("to me");
  });

  it("joins two recipients and summarizes longer lists", () => {
    expect(
      formatRecipientSummary(
        [
          { email: "me@solace.onl" },
          { email: "a@b.com", name: "Alice" },
        ],
        "me@solace.onl",
      ),
    ).toBe("to me and Alice");
    expect(
      formatRecipientSummary(
        [
          { email: "a@b.com", name: "Alice" },
          { email: "c@d.com", name: "Cara" },
          { email: "e@f.com" },
        ],
        "me@solace.onl",
      ),
    ).toBe("to Alice, Cara +1");
  });
});

describe("read/flag helpers", () => {
  it("detects the $seen keyword", () => {
    expect(isMessageRead(message({ id: "1", keywords: { $seen: true } }))).toBe(
      true,
    );
    expect(isMessageRead(message({ id: "1" }))).toBe(false);
    expect(
      isMessageRead(message({ id: "1", keywords: { $flagged: true } })),
    ).toBe(false);
  });

  it("detects the $flagged keyword", () => {
    expect(
      isMessageFlagged(message({ id: "1", keywords: { $flagged: true } })),
    ).toBe(true);
    expect(isMessageFlagged(message({ id: "1" }))).toBe(false);
  });
});

describe("sortMessagesByDate", () => {
  it("sorts newest first without mutating the input", () => {
    const input = [
      message({ id: "old", receivedAt: "2020-01-01T00:00:00.000Z" }),
      message({ id: "new", receivedAt: "2024-01-01T00:00:00.000Z" }),
      message({ id: "none" }),
    ];
    const sorted = sortMessagesByDate(input);
    expect(sorted.map((m) => m.id)).toEqual(["new", "old", "none"]);
    expect(input.map((m) => m.id)).toEqual(["old", "new", "none"]);
  });
});

describe("getPrimaryMailboxId", () => {
  it("finds a mailbox by role", () => {
    const mailboxes = [
      mailbox({ id: "mb1", role: "inbox" }),
      mailbox({ id: "mb2", role: "sent" }),
    ];
    expect(getPrimaryMailboxId(mailboxes, "sent")).toBe("mb2");
    expect(getPrimaryMailboxId(mailboxes, "trash")).toBeNull();
  });
});

describe("sortMailboxes", () => {
  it("orders well-known roles first then alphabetically", () => {
    const mailboxes = [
      mailbox({ id: "z", name: "Zeta", role: null }),
      mailbox({ id: "trash", name: "Trash", role: "trash" }),
      mailbox({ id: "inbox", name: "Inbox", role: "inbox" }),
      mailbox({ id: "a", name: "Alpha", role: null }),
      mailbox({ id: "sent", name: "Sent", role: "sent" }),
    ];
    expect(sortMailboxes(mailboxes).map((m) => m.id)).toEqual([
      "inbox",
      "sent",
      "trash",
      "a",
      "z",
    ]);
  });

  it("does not mutate the input array", () => {
    const mailboxes = [
      mailbox({ id: "sent", role: "sent" }),
      mailbox({ id: "inbox", role: "inbox" }),
    ];
    sortMailboxes(mailboxes);
    expect(mailboxes.map((m) => m.id)).toEqual(["sent", "inbox"]);
  });

  it("prefers JMAP sortOrder when any mailbox has one", () => {
    const mailboxes = [
      mailbox({ id: "inbox", name: "Inbox", role: "inbox", sortOrder: 2 }),
      mailbox({ id: "custom", name: "Projects", role: null, sortOrder: 0 }),
      mailbox({ id: "sent", name: "Sent", role: "sent", sortOrder: 1 }),
    ];
    expect(sortMailboxes(mailboxes).map((entry) => entry.id)).toEqual([
      "custom",
      "sent",
      "inbox",
    ]);
  });
});

describe("getMailboxDisplayName", () => {
  it("shows Spam for junk/spam role mailboxes", () => {
    expect(getMailboxDisplayName(mailbox({ id: "x", name: "Junk Mail", role: "junk" }))).toBe(
      "Spam",
    );
    expect(getMailboxDisplayName(mailbox({ id: "x", name: "Spam", role: "spam" }))).toBe(
      "Spam",
    );
    expect(getMailboxDisplayName(mailbox({ id: "x", name: "Inbox", role: "inbox" }))).toBe(
      "Inbox",
    );
  });
});

describe("getMailboxIcon", () => {
  it.each([
    ["inbox", "inbox"],
    ["sent", "send"],
    ["drafts", "edit-3"],
    ["archive", "archive"],
    ["junk", "alert-octagon"],
    ["spam", "alert-octagon"],
    ["trash", "trash-2"],
  ])("maps role %s to icon %s", (role, icon) => {
    expect(getMailboxIcon(mailbox({ id: "x", role }))).toBe(icon);
  });

  it("falls back to folder for unknown/absent roles", () => {
    expect(getMailboxIcon(mailbox({ id: "x", role: "custom" }))).toBe("folder");
    expect(getMailboxIcon(mailbox({ id: "x" }))).toBe("folder");
  });
});

describe("getInitials", () => {
  it("uses the first letters of the first two name parts", () => {
    expect(getInitials([{ email: "x@y.com", name: "Alice Wonder" }])).toBe(
      "AW",
    );
  });

  it("derives initials from the email when no name is present", () => {
    expect(getInitials([{ email: "john.doe@x.com" }])).toBe("JD");
    expect(getInitials([{ email: "solo@x.com" }])).toBe("SX");
    expect(getInitials([{ email: "solo" }])).toBe("S");
  });

  it("returns a question mark when nothing usable is provided", () => {
    expect(getInitials(undefined)).toBe("?");
    expect(getInitials([])).toBe("?");
  });
});

describe("isLikelyEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isLikelyEmail("user@example.com")).toBe(true);
    expect(isLikelyEmail("  user.name+tag@sub.example.co  ")).toBe(true);
  });

  it("accepts display-name addresses", () => {
    expect(isLikelyEmail("User Two <user2@solace.onl>")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isLikelyEmail("user")).toBe(false);
    expect(isLikelyEmail("user@host")).toBe(false);
    expect(isLikelyEmail("user @example.com")).toBe(false);
    expect(isLikelyEmail("")).toBe(false);
  });
});

describe("parseEmailList", () => {
  it("splits on commas and semicolons", () => {
    expect(parseEmailList("a@x.com, b@x.com; c@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });

  it("parses display-name recipients", () => {
    expect(parseEmailList("User Two <user2@solace.onl>")).toEqual([
      "user2@solace.onl",
    ]);
  });

  it("trims and de-duplicates case-insensitively", () => {
    expect(parseEmailList("  A@x.com , a@X.com ,b@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseEmailList("")).toEqual([]);
    expect(parseEmailList("   ")).toEqual([]);
  });
});

describe("validateComposeInput", () => {
  it("parses recipient fields and reports no errors when valid", () => {
    const result = validateComposeInput({
      to: "a@x.com, b@x.com",
      cc: "c@x.com",
      bcc: "",
      subject: "Hello",
    });
    expect(result.to).toEqual(["a@x.com", "b@x.com"]);
    expect(result.cc).toEqual(["c@x.com"]);
    expect(result.bcc).toEqual([]);
    expect(result.errors).toEqual({});
  });

  it("requires at least one recipient", () => {
    const result = validateComposeInput({ to: "", subject: "Hi" });
    expect(result.errors.to).toBeDefined();
  });

  it("flags invalid email addresses", () => {
    const result = validateComposeInput({
      to: "a@x.com, not-an-email",
      subject: "Hi",
    });
    expect(result.errors.recipients).toContain("not-an-email");
  });
});

describe("formatReplyAllRecipientFields", () => {
  it("puts the sender on To and other recipients on Cc, excluding the current user", () => {
    expect(
      formatReplyAllRecipientFields(
        message({
          id: "m-1",
          from: [{ email: "sender@example.com", name: "Sender" }],
          to: [
            { email: "me@example.com" },
            { email: "alex@example.com" },
          ],
          cc: [{ email: "blair@example.com" }],
        }),
        "me@example.com",
      ),
    ).toEqual({
      to: "sender@example.com",
      cc: "alex@example.com, blair@example.com",
    });
  });

  it("uses the original To/Cc when the current user sent the message", () => {
    expect(
      formatReplyAllRecipientFields(
        message({
          id: "m-2",
          from: [{ email: "me@example.com" }],
          to: [{ email: "alex@example.com" }],
          cc: [{ email: "blair@example.com" }],
        }),
        "me@example.com",
      ),
    ).toEqual({
      to: "alex@example.com",
      cc: "blair@example.com",
    });
  });
});
