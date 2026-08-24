import {
  canHideMailbox,
  canRenameOrDeleteMailbox,
  filterVisibleMailboxes,
  mailboxSortUpdates,
  moveMailboxIndex,
} from "./mailbox-management";

describe("mailbox management helpers", () => {
  it("protects system roles from rename and delete", () => {
    expect(canRenameOrDeleteMailbox({ role: "inbox" })).toBe(false);
    expect(canRenameOrDeleteMailbox({ role: "sent" })).toBe(false);
    expect(canRenameOrDeleteMailbox({ role: "drafts" })).toBe(false);
    expect(canRenameOrDeleteMailbox({ role: null })).toBe(true);
  });

  it("never allows hiding Inbox and allows hiding other folders", () => {
    expect(canHideMailbox({ role: "inbox" })).toBe(false);
    expect(canHideMailbox({ role: "INBOX" })).toBe(false);
    expect(canHideMailbox({ role: "sent" })).toBe(true);
    expect(canHideMailbox({ role: null })).toBe(true);
  });

  it("filters hidden mailboxes from the sidebar list", () => {
    expect(
      filterVisibleMailboxes(
        [{ id: "inbox" }, { id: "projects" }, { id: "later" }],
        ["later"],
      ).map((mailbox) => mailbox.id),
    ).toEqual(["inbox", "projects"]);
  });

  it("reorders a mailbox up or down and is a no-op at the edges", () => {
    const mailboxes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(moveMailboxIndex(mailboxes, 1, "up").map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(moveMailboxIndex(mailboxes, 1, "down").map((item) => item.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(moveMailboxIndex(mailboxes, 0, "up")).toBe(mailboxes);
    expect(moveMailboxIndex(mailboxes, 2, "down")).toBe(mailboxes);
  });

  it("assigns contiguous sortOrder values after a reorder", () => {
    expect(mailboxSortUpdates([{ id: "b" }, { id: "a" }])).toEqual([
      { id: "b", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
    ]);
  });
});
