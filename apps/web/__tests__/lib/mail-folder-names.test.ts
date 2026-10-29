import { describe, expect, it, jest } from "@jest/globals";
import {
  createMailboxNameCipher,
  isSealedMailboxName,
} from "@workspace/calendar-core";
import { StalwartJmapClient } from "../../lib/mail/jmap-client";
import type { JmapSession } from "../../lib/mail/types";

const session: JmapSession = {
  apiUrl: "http://localhost:4001/api/mail/jmap/",
  accounts: { acc1: { name: "alice@solace.onl" } },
  primaryAccounts: { "urn:ietf:params:jmap:mail": "acc1" },
};

/** Reversible stand-in for AES-GCM, so the tests can assert no plaintext name leaves the browser. */
const cipher = createMailboxNameCipher(
  {
    encryptJsonPayload: async (_key: string, payload: unknown) => ({
      version: 1,
      algorithm: "AES-GCM" as const,
      iv: "iv",
      ciphertext: Buffer.from(JSON.stringify(payload)).toString("base64url"),
    }),
    decryptJsonPayload: async <T,>(_key: string, payload: { ciphertext: string }) =>
      JSON.parse(Buffer.from(payload.ciphertext, "base64url").toString()) as T,
  },
  "account-key",
);

type Call = { method: string; args: Record<string, any>; body: string };

function createClient(
  respond: (method: string) => unknown,
  options: { withCipher?: boolean } = {},
) {
  const calls: Call[] = [];
  const fetcher = jest.fn(async (_url: string, init?: RequestInit) => {
    const body = String(init?.body);
    const request = JSON.parse(body) as {
      methodCalls: [string, Record<string, any>, string][];
    };
    for (const [method, args] of request.methodCalls) {
      calls.push({ method, args, body });
    }
    const methodResponses = request.methodCalls.map(([method, , id]) => [
      method,
      respond(method),
      id,
    ]);
    return new Response(JSON.stringify({ methodResponses }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new StalwartJmapClient({
    baseUrl: "http://localhost:4001/api/mail/jmap",
    accessToken: "mail-access-token",
    fetcher,
    getMailboxNameCipher: async () => (options.withCipher === false ? null : cipher),
  });
  return { client, calls, fetcher };
}

describe("encrypted folder names", () => {
  it("never sends a plaintext custom folder name when creating or renaming", async () => {
    const { client, calls } = createClient((method) =>
      method === "Mailbox/set" ? { created: { new: { id: "mbx-9", role: null } } } : {},
    );

    const created = await client.createMailbox(session, "Tax returns");
    await client.renameMailbox(session, "mbx-9", "Old taxes");

    expect(created.name).toBe("Tax returns");
    const [create, rename] = calls;
    expect(isSealedMailboxName(create?.args.create.new.name)).toBe(true);
    expect(isSealedMailboxName(rename?.args.update["mbx-9"].name)).toBe(true);
    for (const call of calls) {
      expect(call.body).not.toContain("Tax returns");
      expect(call.body).not.toContain("Old taxes");
    }
    await expect(cipher.open(rename?.args.update["mbx-9"].name)).resolves.toBe("Old taxes");
  });

  it("keeps a role folder created with its role readable to the server", async () => {
    const { client, calls } = createClient(() => ({
      created: { new: { id: "arc", role: "archive" } },
    }));

    await client.createMailbox(session, "Archive", "archive");

    expect(calls[0]?.args.create.new).toEqual({ name: "Archive", role: "archive" });
  });

  it("refuses to name a folder without an unlocked session", async () => {
    const { client, fetcher } = createClient(() => ({}), { withCipher: false });

    await expect(client.createMailbox(session, "Tax returns")).rejects.toThrow(
      "Unlock your encrypted data",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("opens sealed names at bootstrap and seals the custom folders still in plaintext", async () => {
    const sealedWork = await cipher.seal("Work");
    const { client, calls } = createClient((method) => {
      if (method === "Mailbox/get") {
        return {
          list: [
            { id: "in", name: "Inbox", role: "inbox" },
            { id: "w", name: sealedWork, role: null },
            { id: "r", name: "Receipts", role: null },
          ],
        };
      }
      if (method === "x:AccountSettings/get") return { list: [{}] };
      return { list: [] };
    });

    const state = await client.bootstrapMailboxState(session);

    expect(state.mailboxes.map((mailbox) => mailbox.name)).toEqual([
      "Inbox",
      "Work",
      "Receipts",
    ]);
    const migration = calls.find((call) => call.method === "Mailbox/set");
    expect(Object.keys(migration?.args.update ?? {})).toEqual(["r"]);
    expect(migration?.body).not.toContain("Receipts");
    await expect(cipher.open(migration?.args.update.r.name)).resolves.toBe("Receipts");
  });
});
