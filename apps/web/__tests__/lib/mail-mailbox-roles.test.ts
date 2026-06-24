import { describe, expect, it } from "@jest/globals";
import {
  canEmptyMailboxRole,
  findInboxMailbox,
  findJunkMailbox,
  isJunkMailboxRole,
} from "@/lib/mail/mail-mailbox-roles";
import type { JmapMailbox } from "@/lib/mail/types";

const mailboxes: JmapMailbox[] = [
  { id: "inbox", name: "Inbox", role: "inbox" },
  { id: "junk", name: "Junk", role: "junk" },
  { id: "trash", name: "Trash", role: "trash" },
  { id: "custom", name: "Projects", role: null },
];

describe("mail-mailbox-roles", () => {
  it("detects junk and spam roles", () => {
    expect(isJunkMailboxRole("junk")).toBe(true);
    expect(isJunkMailboxRole("spam")).toBe(true);
    expect(isJunkMailboxRole("inbox")).toBe(false);
  });

  it("finds inbox and junk mailboxes", () => {
    expect(findInboxMailbox(mailboxes)?.id).toBe("inbox");
    expect(findJunkMailbox(mailboxes)?.id).toBe("junk");
  });

  it("allows empty only for trash and junk", () => {
    expect(canEmptyMailboxRole("trash")).toBe(true);
    expect(canEmptyMailboxRole("junk")).toBe(true);
    expect(canEmptyMailboxRole("inbox")).toBe(false);
  });
});
