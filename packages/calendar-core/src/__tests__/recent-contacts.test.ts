import { describe, expect, it } from "bun:test";
import {
  createEmptyRecentContactsPayload,
  filterRecentContactSuggestions,
  filterContactsList,
  resolveRecipientSuggestions,
  formatRecentContactForField,
  insertRecipientSuggestion,
  MAX_RECENT_CONTACTS,
  recordRecentContactUsage,
  addManualContact,
  updateContactDetails,
  removeContact,
  getContactDisplayLabel,
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

describe("resolveRecipientSuggestions", () => {
  const payload = recordRecentContactUsage(
    recordRecentContactUsage(
      null,
      [{ email: "alice@example.com", displayName: "Alice Smith" }],
      "mail",
      { usedAt: "2026-01-01T00:00:00.000Z" },
    ),
    [{ email: "bob@example.com", displayName: "Bob" }],
    "mail",
    { usedAt: "2026-01-02T00:00:00.000Z" },
  );

  it("returns recents when the query is empty", () => {
    expect(
      resolveRecipientSuggestions(payload).map((entry) => entry.email),
    ).toEqual(["bob@example.com", "alice@example.com"]);
  });

  it("prefers prefix matches over substring matches", () => {
    expect(
      resolveRecipientSuggestions(payload, { query: "bo" }).map(
        (entry) => entry.email,
      ),
    ).toEqual(["bob@example.com"]);
  });

  it("falls back to substring matches in the display name", () => {
    expect(
      resolveRecipientSuggestions(payload, { query: "smith" }).map(
        (entry) => entry.email,
      ),
    ).toEqual(["alice@example.com"]);
  });

  it("excludes already selected emails", () => {
    expect(
      resolveRecipientSuggestions(payload, {
        excludeEmails: ["bob@example.com"],
      }).map((entry) => entry.email),
    ).toEqual(["alice@example.com"]);
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

describe("contact management", () => {
  it("adds a manual contact", () => {
    const result = addManualContact(null, {
      email: "alice@example.com",
      displayName: "Alice",
      phone: "+1 555 0100",
    });

    expect(result?.contacts).toHaveLength(1);
    expect(result?.contacts[0]).toMatchObject({
      email: "alice@example.com",
      displayName: "Alice",
      phone: "+1 555 0100",
      manual: true,
      useCount: 0,
      contexts: [],
    });
  });

  it("updates contact details without dropping usage metadata", () => {
    const base = recordRecentContactUsage(
      null,
      [{ email: "alice@example.com", displayName: "Alice" }],
      "mail",
      { usedAt: "2026-01-01T00:00:00.000Z" },
    );

    const updated = updateContactDetails(base, "alice@example.com", {
      phone: "+1 555 0100",
      notes: "Project lead",
    });

    expect(updated.contacts[0]).toMatchObject({
      email: "alice@example.com",
      displayName: "Alice",
      phone: "+1 555 0100",
      notes: "Project lead",
      manual: true,
      useCount: 1,
      contexts: ["mail"],
    });
  });

  it("removes a contact by email", () => {
    const base = recordRecentContactUsage(
      null,
      [{ email: "alice@example.com" }, { email: "bob@example.com" }],
      "mail",
      { usedAt: "2026-01-01T00:00:00.000Z" },
    );

    const next = removeContact(base, "alice@example.com");
    expect(next.contacts.map((entry) => entry.email)).toEqual([
      "bob@example.com",
    ]);
  });

  it("filters contacts by phone and notes", () => {
    const payload = addManualContact(null, {
      email: "alice@example.com",
      displayName: "Alice",
      phone: "+1 555 0100",
      notes: "Project lead",
    });

    expect(
      filterContactsList(payload, { query: "555" }).map((entry) => entry.email),
    ).toEqual(["alice@example.com"]);
    expect(
      filterContactsList(payload, { query: "project" }).map(
        (entry) => entry.email,
      ),
    ).toEqual(["alice@example.com"]);
  });

  it("prefers display name for labels", () => {
    expect(
      getContactDisplayLabel({
        email: "alice@example.com",
        displayName: "Alice",
        lastUsedAt: "2026-01-01T00:00:00.000Z",
        useCount: 1,
        contexts: ["mail"],
      }),
    ).toBe("Alice");
  });
});
