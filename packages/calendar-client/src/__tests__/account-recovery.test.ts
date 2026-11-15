import { describe, expect, it, jest } from "@jest/globals";
import { createHash, webcrypto } from "node:crypto";
import { createE2eeModule, type CryptoProvider } from "@workspace/e2ee";
import {
  RECOVERY_KEY_TYPO_MESSAGE,
  createRecoveryKit,
  recoverAccount,
  recoveryPost,
} from "../account-recovery";
import { createAuthKeyFetch } from "../auth-key-fetch";

// Node's WebCrypto matches the provider at runtime; only the DOM-shaped declarations differ.
const e2ee = createE2eeModule(webcrypto as unknown as CryptoProvider, {
  argon2id: async (password, salt) =>
    new Uint8Array(createHash("sha256").update(password).update(salt).digest()),
});

const EMAIL = "a@solace.test";
const PASSWORD = "current-secret-pw";
const NEW_PASSWORD = "new-secret-pw";

async function sessionKeys() {
  return {
    accountKey: await e2ee.generateAccountKey(),
    blindIndexKey: await e2ee.generateBlindIndexKey(),
  };
}

/** A fake API: stores the kit, then answers the reset through the shared auth-key fetch, recording every body on the wire. */
function fakeServer() {
  const wire: string[] = [];
  let kit: Record<string, unknown> | null = null;
  const api = {
    putRecoveryKit: jest.fn(async (request: Record<string, unknown>) => {
      wire.push(JSON.stringify(request));
      kit = request;
      return { exists: true };
    }),
  };
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const body = String(init?.body);
    wire.push(body);
    const parsed = JSON.parse(body) as { recoveryAuthKey?: string };
    if (!kit || parsed.recoveryAuthKey !== kit.recoveryAuthKey) {
      return new Response(JSON.stringify({ code: "INVALID_RECOVERY_KIT", message: "Email or recovery key is incorrect." }), { status: 401 });
    }
    const reply = String(input).endsWith("/recovery/start")
      ? { wrappedAccountKey: kit.wrappedAccountKey, wrappedSearchKey: kit.wrappedSearchKey, keyVersion: 1 }
      : { status: true };
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  const authFetch = createAuthKeyFetch(e2ee.deriveAuthKey, fetchImpl);
  const post = recoveryPost(async (path, options) => {
    const response = await authFetch(`https://api.solace.test/api/auth${path}`, {
      method: options.method,
      body: JSON.stringify(options.body),
    });
    const data: unknown = await response.json();
    return response.ok
      ? { data, error: null }
      : { data: null, error: data as { message?: string } };
  });
  return { api, post, wire };
}

describe("account recovery", () => {
  it("restores the same account key under the new password, sending only derived keys and envelopes", async () => {
    const server = fakeServer();
    const keys = await sessionKeys();
    const recoveryKey = await createRecoveryKit({
      api: server.api,
      e2ee,
      keys,
      email: EMAIL,
      currentPassword: PASSWORD,
    });

    await recoverAccount({
      post: server.post,
      e2ee,
      email: EMAIL,
      recoveryKey,
      newPassword: NEW_PASSWORD,
      removePasskeys: true,
    });

    const complete = JSON.parse(server.wire.at(-1) ?? "{}") as {
      newPassword: string;
      recoveryAuthKey: string;
      removePasskeys: boolean;
      passwordEnvelope: Parameters<typeof e2ee.unwrapPasswordEnvelope>[1];
    };
    expect(complete.newPassword).toBe(await e2ee.deriveAuthKey(NEW_PASSWORD, EMAIL));
    expect(complete.recoveryAuthKey).toMatch(/^rk1:/);
    expect(complete.removePasskeys).toBe(true);
    const reopened = await e2ee.unwrapPasswordEnvelope(NEW_PASSWORD, complete.passwordEnvelope);
    const sealed = await e2ee.encryptJsonPayload(keys.accountKey, "kept");
    await expect(e2ee.decryptJsonPayload(reopened.accountKey, sealed)).resolves.toBe("kept");

    for (const body of server.wire) {
      expect(body).not.toContain(PASSWORD);
      expect(body).not.toContain(NEW_PASSWORD);
      expect(body).not.toContain(recoveryKey);
      expect(body).not.toContain(recoveryKey.replace(/-/g, ""));
    }
    expect(JSON.parse(server.wire[0] ?? "{}")).toMatchObject({
      currentPassword: await e2ee.deriveAuthKey(PASSWORD, EMAIL),
    });
  });

  it("refuses a typo before anything is sent", async () => {
    const post = jest.fn(async () => ({}));
    const recoveryKey = (await e2ee.generateRecoveryKey()).recoveryKey;
    const typo = `${recoveryKey.charAt(0) === "A" ? "B" : "A"}${recoveryKey.slice(1)}`;

    await expect(
      recoverAccount({ post, e2ee, email: EMAIL, recoveryKey: typo, newPassword: NEW_PASSWORD, removePasskeys: false }),
    ).rejects.toThrow(RECOVERY_KEY_TYPO_MESSAGE);
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the server's answer for a key it does not know", async () => {
    const server = fakeServer();
    const recoveryKey = (await e2ee.generateRecoveryKey()).recoveryKey;

    await expect(
      recoverAccount({ post: server.post, e2ee, email: EMAIL, recoveryKey, newPassword: NEW_PASSWORD, removePasskeys: false }),
    ).rejects.toThrow("Email or recovery key is incorrect.");
    expect(server.wire).toHaveLength(1);
  });
});
