import { describe, expect, it } from "bun:test";
import {
  createEmptyRecentContactsPayload,
  filterRecentContactSuggestions,
  formatRecentContactForField,
  insertRecipientSuggestion,
  MAX_RECENT_CONTACTS,
  recordRecentContactUsage,
} from "../recent-contacts";

describe("recordRecentContactUsage", () => {
  it("creates entries for new emails", () => {
    const result = recordRecentContactUsage(null, [{ email: "a@example.com" }], "mail", {
      usedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toEqual({
      email: "a@example.com",
      lastUsedAt: "2026-01-01T00:00:00.000Z",
      useCount: 1,
      contexts: ["mail"],
    });
  });

  it("bumps use count and merges contexts", () => {
    const existing = recordRecentContactUsage(
      null,
      [{ email: "a@example.com", displayName: "Alice" }],
      "mail",
      { usedAt: "2026-01-01T00:00:00.000Z" },
    );

    const result = recordRecentContactUsage(
      existing,
      [{ email: "A@example.com" }],
      "calendar",
      { usedAt: "2026-01-02T00:00:00.000Z" },
    );

    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0]).toEqual({
      email: "a@example.com",
      displayName: "Alice",
      lastUsedAt: "2026-01-02T00:00:00.000Z",
      useCount: 2,
      contexts: ["mail", "calendar"],
    });
  });

  it("caps the list at MAX_RECENT_CONTACTS", () => {
    let payload = createEmptyRecentContactsPayload();

    for (let index = 0; index < MAX_RECENT_CONTACTS + 5; index += 1) {
      payload = recordRecentContactUsage(
        payload,
        [{ email: `user${index}@example.com` }],
        "mail",
        {
          usedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        },
      );
    }

    expect(payload.contacts).toHaveLength(MAX_RECENT_CONTACTS);
    expect(payload.contacts[0]?.email).toBe(
      `user${MAX_RECENT_CONTACTS + 4}@example.com`,
    );
  });
});

describe("filterRecentContactSuggestions", () => {
  const payload = recordRecentContactUsage(
    null,
    [
      { email: "alice@example.com", displayName: "Alice" },
      { email: "bob@example.com", displayName: "Bob" },
    ],
    "mail",
    { usedAt: "2026-01-02T00:00:00.000Z" },
  );

  it("returns recent contacts when query is empty", () => {
    expect(filterRecentContactSuggestions(payload)).toHaveLength(2);
  });

  it("filters by email prefix", () => {
    expect(
      filterRecentContactSuggestions(payload, { query: "ali" }).map(
        (entry) => entry.email,
      ),
    ).toEqual(["alice@example.com"]);
  });

  it("filters by display name prefix", () => {
    expect(
      filterRecentContactSuggestions(payload, { query: "bo" }).map(
        (entry) => entry.email,
      ),
    ).toEqual(["bob@example.com"]);
  });

  it("excludes already selected emails", () => {
    expect(
      filterRecentContactSuggestions(payload, {
        excludeEmails: ["alice@example.com"],
      }).map((entry) => entry.email),
    ).toEqual(["bob@example.com"]);
  });
});

describe("formatRecentContactForField", () => {
  it("formats display name with angle brackets", () => {
    expect(
      formatRecentContactForField({
        email: "alice@example.com",
        displayName: "Alice",
        lastUsedAt: "2026-01-01T00:00:00.000Z",
        useCount: 1,
        contexts: ["mail"],
      }),
    ).toBe("Alice <alice@example.com>");
  });

  it("returns bare email when no display name", () => {
    expect(
      formatRecentContactForField({
        email: "alice@example.com",
        lastUsedAt: "2026-01-01T00:00:00.000Z",
        useCount: 1,
        contexts: ["mail"],
      }),
    ).toBe("alice@example.com");
  });
});

describe("insertRecipientSuggestion", () => {
  it("replaces the active token in a multi-recipient field", () => {
    expect(
      insertRecipientSuggestion("alice@example.com, bo", "bob@example.com", {
        appendSeparator: true,
      }),
    ).toBe("alice@example.com, bob@example.com, ");
  });

  it("sets a single recipient in calendar mode", () => {
    expect(
      insertRecipientSuggestion("", "alice@example.com"),
    ).toBe("alice@example.com");
  });
});
