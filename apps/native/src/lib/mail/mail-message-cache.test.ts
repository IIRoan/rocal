import {
  flattenMailboxMessagesCache,
  patchMailboxMessagesCache,
  patchSingleMailboxMessageCache,
  removeMessagesFromMailboxCache,
} from "./mail-message-cache";
import type { JmapEmailMessage } from "./types";

function message(id: string): JmapEmailMessage {
  return {
    id,
    keywords: {},
    mailboxIds: {},
  };
}

describe("mail-message-cache", () => {
  it("flattens infinite-query mailbox pages", () => {
    const flattened = flattenMailboxMessagesCache({
      pages: [
        { messages: [message("1"), message("2")], total: 3, position: 0 },
        { messages: [message("3")], total: 3, position: 2 },
      ],
      pageParams: [0, 2],
    });

    expect(flattened.map((entry) => entry.id)).toEqual(["1", "2", "3"]);
  });

  it("patches messages across infinite-query pages", () => {
    const data = {
      pages: [
        { messages: [message("1"), message("2")], total: 2, position: 0 },
      ],
      pageParams: [0],
    };

    const updated = patchSingleMailboxMessageCache(data, "2", () => ({
      subject: "Updated",
    }));

    expect(updated).not.toBeNull();
    if (!updated || !("pages" in updated)) {
      throw new Error("expected infinite-query cache data");
    }
    expect(updated.pages[0]?.messages[1]?.subject).toBe("Updated");
  });

  it("preserves unchanged page references when patching one page", () => {
    const unchangedPage = {
      messages: [message("1"), message("2")],
      total: 3,
      position: 0,
    };
    const changedPage = {
      messages: [message("3")],
      total: 3,
      position: 2,
    };
    const data = {
      pages: [unchangedPage, changedPage],
      pageParams: [0, 2],
    };

    const updated = patchSingleMailboxMessageCache(data, "3", () => ({
      subject: "Updated",
    }));

    expect(updated).not.toBeNull();
    if (!updated || !("pages" in updated)) {
      throw new Error("expected infinite-query cache data");
    }
    expect(updated.pages[0]).toBe(unchangedPage);
    expect(updated.pages[1]).not.toBe(changedPage);
    expect(updated.pages[1]?.messages[0]?.subject).toBe("Updated");
  });

  it("patches legacy single-page cache data", () => {
    const data = {
      messages: [message("1"), message("2")],
      total: 2,
    };

    const updated = patchMailboxMessagesCache(
      data,
      new Set(["1"]),
      () => ({ subject: "Legacy" }),
    );

    expect(updated).not.toBeNull();
    if (!updated || !("messages" in updated)) {
      throw new Error("expected legacy cache data");
    }
    expect(updated.messages[0]?.subject).toBe("Legacy");
  });

  it("removes messages from infinite-query and legacy caches", () => {
    const infinite = {
      pages: [
        { messages: [message("1"), message("2")], total: 2, position: 0 },
      ],
      pageParams: [0],
    };
    const legacy = {
      messages: [message("1"), message("2")],
      total: 2,
    };

    const removedInfinite = removeMessagesFromMailboxCache(
      infinite,
      new Set(["2"]),
    );
    const removedLegacy = removeMessagesFromMailboxCache(legacy, new Set(["1"]));

    expect(removedInfinite).not.toBeNull();
    expect(removedLegacy).not.toBeNull();
    if (!removedInfinite || !("pages" in removedInfinite)) {
      throw new Error("expected infinite-query cache data");
    }
    if (!removedLegacy || !("messages" in removedLegacy)) {
      throw new Error("expected legacy cache data");
    }

    expect(removedInfinite.pages[0]?.messages.map((entry) => entry.id)).toEqual(
      ["1"],
    );
    expect(removedLegacy.messages.map((entry) => entry.id)).toEqual(["2"]);
  });
});
