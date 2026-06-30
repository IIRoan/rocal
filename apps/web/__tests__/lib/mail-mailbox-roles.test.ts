import {
  canEmptyMailboxRole,
  findInboxMailbox,
  findSpamMailbox,
  findTrashMailbox,
  getMailboxDisplayName,
  isSpamMailboxRole,
} from "@/lib/mail/mail-mailbox-roles";

const mailboxes = [
  { id: "inbox", name: "Inbox", role: "inbox" },
  { id: "junk", name: "Junk Mail", role: "junk" },
  { id: "trash", name: "Trash", role: "trash" },
] as const;

describe("mail-mailbox-roles", () => {
  it("detects spam mailbox roles", () => {
    expect(isSpamMailboxRole("junk")).toBe(true);
    expect(isSpamMailboxRole("spam")).toBe(true);
    expect(isSpamMailboxRole("inbox")).toBe(false);
  });

  it("finds inbox and spam mailboxes", () => {
    expect(findInboxMailbox([...mailboxes])?.id).toBe("inbox");
    expect(findSpamMailbox([...mailboxes])?.id).toBe("junk");
  });

  it("allows empty only for trash and spam", () => {
    expect(canEmptyMailboxRole("trash")).toBe(true);
    expect(canEmptyMailboxRole("junk")).toBe(true);
    expect(canEmptyMailboxRole("spam")).toBe(true);
    expect(canEmptyMailboxRole("inbox")).toBe(false);
  });

  it("finds trash mailbox", () => {
    expect(findTrashMailbox([...mailboxes])?.id).toBe("trash");
  });

  it("shows Spam for junk/spam role mailboxes", () => {
    expect(getMailboxDisplayName({ name: "Junk Mail", role: "junk" })).toBe(
      "Spam",
    );
    expect(getMailboxDisplayName({ name: "Spam", role: "spam" })).toBe("Spam");
    expect(getMailboxDisplayName({ name: "Inbox", role: "inbox" })).toBe(
      "Inbox",
    );
  });
});
