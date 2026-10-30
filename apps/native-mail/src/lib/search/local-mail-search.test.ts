import { DEFAULT_MAIL_LIST_FILTERS, mailToTitleIndexDocument } from "@workspace/calendar-core";
import type { MailRuntime } from "../mail/mail-runtime";
import { searchMailboxLocally } from "./local-mail-search";

const mockIndexEnabled = jest.fn<Promise<boolean>, []>();
const mockReadIndex = jest.fn();

jest.mock("@workspace/native-core/lib/e2ee-session", () => ({
  getActiveE2eeSession: () => ({ userId: "user-1" }),
}));
jest.mock("@workspace/native-core/lib/search/title-index-store", () => ({
  isNativeTitleIndexEnabled: () => mockIndexEnabled(),
}));
jest.mock("./private-title-index", () => ({
  readNativeTitleIndex: (accountId: string) => mockReadIndex(accountId),
}));

const documents = [
  mailToTitleIndexDocument({
    id: "m1",
    subject: "Quarterly invoice",
    to: [{ email: "finance@example.com" }],
    receivedAt: "2026-03-02T09:00:00Z",
    mailboxIds: { inbox: true },
  }),
  mailToTitleIndexDocument({
    id: "m2",
    subject: "Lunch",
    receivedAt: "2026-03-04T09:00:00Z",
    mailboxIds: { inbox: true },
  }),
];

function createRuntime() {
  const client = {
    searchMailboxMessagesWithFilter: jest.fn(),
    getMessagesByIds: jest.fn(async (_session: unknown, ids: string[]) =>
      ids.map((id) => ({
        id,
        keywords: id === "m1" ? { $flagged: true } : {},
        mailboxIds: { inbox: true } as Record<string, boolean>,
      })),
    ),
  };
  return { client, runtime: { client, session: {} } as unknown as MailRuntime };
}

describe("searchMailboxLocally", () => {
  it("matches the fields on the device and fetches the hits by id", async () => {
    mockIndexEnabled.mockResolvedValue(true);
    mockReadIndex.mockResolvedValue(documents);
    const { client, runtime } = createRuntime();

    const messages = await searchMailboxLocally({
      runtime,
      mailboxId: "inbox",
      fields: { to: "finance" },
      listFilters: { ...DEFAULT_MAIL_LIST_FILTERS, starred: true },
    });

    expect(messages?.map((message) => message.id)).toEqual(["m1"]);
    expect(client.searchMailboxMessagesWithFilter).not.toHaveBeenCalled();
    expect(JSON.stringify(client.getMessagesByIds.mock.calls)).not.toContain("finance");
  });

  it("keeps the words on the device while the index is still empty or unreadable", async () => {
    mockIndexEnabled.mockResolvedValue(true);
    mockReadIndex.mockRejectedValue(new Error("unreadable"));
    const { client, runtime } = createRuntime();

    await expect(
      searchMailboxLocally({
        runtime,
        mailboxId: "inbox",
        fields: { subject: "invoice" },
        listFilters: DEFAULT_MAIL_LIST_FILTERS,
      }),
    ).resolves.toEqual([]);
    expect(client.searchMailboxMessagesWithFilter).not.toHaveBeenCalled();
  });

  it("drops a match that has since left the mailbox, such as one moved to Trash", async () => {
    mockIndexEnabled.mockResolvedValue(true);
    mockReadIndex.mockResolvedValue(documents);
    const { client, runtime } = createRuntime();
    client.getMessagesByIds.mockResolvedValue([
      { id: "m1", keywords: {}, mailboxIds: { trash: true } },
    ]);

    await expect(
      searchMailboxLocally({
        runtime,
        mailboxId: "inbox",
        fields: { to: "finance" },
        listFilters: DEFAULT_MAIL_LIST_FILTERS,
      }),
    ).resolves.toEqual([]);
  });

  it("leaves the search to the server when the index is off", async () => {
    mockIndexEnabled.mockResolvedValue(false);
    const { client, runtime } = createRuntime();

    await expect(
      searchMailboxLocally({
        runtime,
        mailboxId: "inbox",
        fields: { subject: "invoice" },
        listFilters: DEFAULT_MAIL_LIST_FILTERS,
      }),
    ).resolves.toBeNull();
    expect(client.getMessagesByIds).not.toHaveBeenCalled();
  });
});
