import { describe, expect, it } from "@jest/globals";

import {
  applyMailListViewFilter,
  initialMailAppListChromeState,
  mailAppListChromeReducer,
} from "../../components/mail/mail-app-list-chrome-state";
import type { JmapEmailMessage } from "../../lib/mail/types";

function message(
  id: string,
  keywords?: Record<string, boolean>,
  extra?: Partial<JmapEmailMessage>,
): JmapEmailMessage {
  return { id, keywords, ...extra } as JmapEmailMessage;
}

describe("mailAppListChromeReducer", () => {
  it("resetMailboxFilters clears search, view filter, and active label", () => {
    const state = {
      ...initialMailAppListChromeState,
      mailListSearch: "test",
      debouncedMailListSearch: "test",
      advancedFilters: {
        text: "test",
        conditions: [{ from: "alice@example.com" }],
      },
      filterPanelExpanded: true,
      searchBarOpen: true,
      listViewFilter: "unread" as const,
      activeLabelId: "work",
    };

    expect(mailAppListChromeReducer(state, { type: "resetMailboxFilters" })).toEqual({
      ...initialMailAppListChromeState,
      debouncedMailListSearch: "",
      advancedFilters: { text: undefined, conditions: [] },
      filterPanelExpanded: false,
      searchBarOpen: false,
      listViewFilter: "all",
      activeLabelId: null,
    });
  });
});

describe("applyMailListViewFilter", () => {
  const unread = message("u");
  const read = message("r", { $seen: true });
  const labeled = message("l", { "label:work": true });
  const attached = message("a", { $seen: true }, { hasAttachment: true });

  it("filters unread, read, attachments, and labels", () => {
    const all = [unread, read, labeled, attached];
    expect(applyMailListViewFilter(all, "unread", null).map((entry) => entry.id)).toEqual([
      "u",
      "l",
    ]);
    expect(applyMailListViewFilter(all, "read", null).map((entry) => entry.id)).toEqual([
      "r",
      "a",
    ]);
    expect(applyMailListViewFilter(all, "attachments", null).map((entry) => entry.id)).toEqual([
      "a",
    ]);
    expect(applyMailListViewFilter(all, "all", "work").map((entry) => entry.id)).toEqual([
      "l",
    ]);
  });
});
