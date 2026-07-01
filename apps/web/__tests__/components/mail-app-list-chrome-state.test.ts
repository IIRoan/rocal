import { describe, expect, it } from "@jest/globals";

import {
  initialMailAppListChromeState,
  mailAppListChromeReducer,
} from "../../components/mail/mail-app-list-chrome-state";

describe("mailAppListChromeReducer", () => {
  it("resetMailboxFilters clears inline and debounced search text", () => {
    const state = {
      ...initialMailAppListChromeState,
      mailListSearch: "test",
      debouncedMailListSearch: "test",
      advancedFilters: {
        text: "test",
        conditions: [{ from: "alice@example.com" }],
      },
      filterPanelExpanded: true,
    };

    expect(mailAppListChromeReducer(state, { type: "resetMailboxFilters" })).toEqual({
      ...initialMailAppListChromeState,
      debouncedMailListSearch: "",
      advancedFilters: { text: undefined, conditions: [] },
      filterPanelExpanded: false,
    });
  });
});
