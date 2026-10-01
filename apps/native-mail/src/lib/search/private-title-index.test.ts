import type { TitleIndexDocument } from "@workspace/calendar-core";
import { searchTitleIndex } from "@workspace/calendar-core";
import type { MailRuntime } from "../mail/mail-runtime";
import type { JmapEmailMessage } from "../mail/types";
import { rebuildNativeTitleIndex } from "./private-title-index";

const mockSave = jest.fn(async (_input: unknown) => undefined);
let mockPrevious: TitleIndexDocument[] = [];

jest.mock("@workspace/native-core/lib/search/title-index-store", () => ({
  loadNativeTitleIndex: async () => mockPrevious,
  saveNativeTitleIndex: (input: unknown) => mockSave(input),
}));

const mockDecrypt = jest.fn();
jest.mock("../mail/mail-crypto", () => ({
  decryptMailMessage: (...args: unknown[]) => mockDecrypt(...args),
  decryptPgpMimeMessage: (...args: unknown[]) => mockDecrypt(...args),
}));

const ARMOR = "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----";

function message(
  id: string,
  text: string,
  receivedAt: string,
): JmapEmailMessage {
  return {
    id,
    subject: `Subject ${id}`,
    receivedAt,
    mailboxIds: { inbox: true },
    textBody: [{ partId: "t" }],
    bodyValues: { t: { value: text } },
  } as JmapEmailMessage;
}

function runtimeFor(messages: JmapEmailMessage[]): MailRuntime {
  return {
    session: {},
    mailboxes: [{ id: "inbox" }],
    client: {
      getMailboxMessagesForIndex: async () => ({
        messages: messages.map((m) => ({ ...m, bodyValues: undefined })),
        total: messages.length,
      }),
      getMessagesByIds: async (_session: unknown, ids: string[]) =>
        messages.filter((m) => ids.includes(m.id)),
      getBlobAsText: async () => ARMOR,
    },
  } as unknown as MailRuntime;
}

describe("rebuildNativeTitleIndex body excerpts", () => {
  beforeEach(() => {
    mockPrevious = [];
    mockSave.mockClear();
    mockDecrypt.mockReset();
  });

  it("indexes plain and decrypted bodies so a body word is found", async () => {
    mockDecrypt.mockResolvedValue({
      plaintext: "Secret zeppelin plans",
      html: null,
    });
    const runtime = runtimeFor([
      message(
        "plain",
        "Hello from the quarterly newsletter",
        "2026-03-01T00:00:00Z",
      ),
      message("enc", ARMOR, "2026-02-01T00:00:00Z"),
    ]);

    const { documents, pendingBodies } = await rebuildNativeTitleIndex({
      accountId: "u1",
      runtime,
    });

    expect(pendingBodies).toBe(0);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(
      searchTitleIndex(documents, "newsletter", 5).map((h) => h.document.id),
    ).toEqual(["mail:plain"]);
    expect(
      searchTitleIndex(documents, "zeppelin", 5).map((h) => h.document.id),
    ).toEqual(["mail:enc"]);
  });

  it("indexes visible words from encrypted HTML-only MIME", async () => {
    mockDecrypt.mockResolvedValue({
      plaintext:
        "Content-Type: text/html\r\nContent-Transfer-Encoding: base64\r\n\r\nPHA+WmVwcGVsaW4gcGxhbnM8L3A+",
      html: "<p>Zeppelin plans</p>",
    });
    const encrypted = {
      ...message("html", ARMOR, "2026-03-01T00:00:00Z"),
      bodyStructure: {
        type: "multipart/encrypted",
        subParts: [{ type: "application/pgp-encrypted" }],
      },
    };
    const { documents } = await rebuildNativeTitleIndex({
      accountId: "u1",
      runtime: runtimeFor([encrypted]),
    });
    expect(documents[0]?.body).toBe("Zeppelin plans");
    expect(searchTitleIndex(documents, "zeppelin", 5)).toHaveLength(1);
  });

  it("retries failed encrypted reads after a mixed batch", async () => {
    mockDecrypt.mockRejectedValue(new Error("Vault locked"));
    const runtime = runtimeFor([
      message("plain", "Readable", "2026-03-01T00:00:00Z"),
      message("enc", ARMOR, "2026-02-01T00:00:00Z"),
    ]);
    const first = await rebuildNativeTitleIndex({ accountId: "u1", runtime });
    expect(first.pendingBodies).toBe(1);
    expect(first.documents[1]?.body).toBeUndefined();
    mockPrevious = first.documents;
    mockDecrypt.mockResolvedValue({ plaintext: "Zeppelin plans", html: null });
    const second = await rebuildNativeTitleIndex({ accountId: "u1", runtime });
    expect(second.pendingBodies).toBe(0);
    expect(searchTitleIndex(second.documents, "zeppelin", 5)).toHaveLength(1);
  });
});
