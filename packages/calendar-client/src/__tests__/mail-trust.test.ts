import { expect, it, jest } from "@jest/globals";
import {
  MailTrustBlockedError,
  type MailTrustProblem,
} from "@workspace/calendar-core";
import {
  createMailTrustAnchor,
  MailTrustApiService,
  MailTrustClient,
  resolveMailTrustRecipient,
  reviewMailTrustSender,
} from "../mail-trust";
import { HttpClient } from "../http-client";

const A = "A".repeat(40),
  B = "B".repeat(40),
  C = "C".repeat(40);
const now = "2026-11-10T00:00:00.000Z";
async function setup() {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const encrypt = async (value: unknown, aad: string) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    );
    return JSON.stringify({
      iv: Buffer.from(iv).toString("base64"),
      ciphertext: Buffer.from(bytes).toString("base64"),
    });
  };
  const decrypt = async (ciphertext: string, aad: string) => {
    try {
      const value = JSON.parse(
        ciphertext.startsWith("mt1.") ? ciphertext.slice(4) : ciphertext,
      ) as { iv: string; ciphertext: string };
      const bytes = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: Buffer.from(value.iv, "base64"),
          additionalData: new TextEncoder().encode(aad),
        },
        key,
        Buffer.from(value.ciphertext, "base64"),
      );
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      return null;
    }
  };
  let row: string | null = null;
  let current = true;
  let beforeWrite: (() => Promise<void>) | null = null;
  const writes = jest.fn(
    async (body: {
      encryptedTrust: string;
      expectedEncryptedTrust: string | null;
    }) => {
      const action = beforeWrite;
      beforeWrite = null;
      await action?.();
      if (row !== body.expectedEncryptedTrust) throw { statusCode: 409 };
      row = body.encryptedTrust;
      return { encryptedTrust: row };
    },
  );
  const reads = jest.fn(async (_fresh?: boolean) => ({ encryptedTrust: row }));
  const inspect = jest.fn(
    async (armored: string, _known?: string, _purpose?: "send" | "verify") => {
      const fingerprint = new Map([
        ["PUBLIC-A", A],
        ["PUBLIC-B", B],
        ["PUBLIC-C", C],
        ["PUBLIC-A-SUBKEY", A],
      ]).get(armored);
      if (!fingerprint) throw new Error("Synthetic invalid key");
      return { fingerprint, publicKeyArmored: armored };
    },
  );
  let anchorUnavailable = false;
  const anchors = new Map<string, string>();
  const create = (accountId = "user-a", device = Math.random().toString()) => {
    const anchor = createMailTrustAnchor({
      accountId,
      encryptJson: encrypt,
      decryptJson: decrypt,
      readCiphertext: async () => {
        if (anchorUnavailable)
          throw new Error("Synthetic local storage failure");
        return anchors.get(device) ?? null;
      },
      writeCiphertext: async (value) => {
        if (anchorUnavailable)
          throw new Error("Synthetic local storage failure");
        anchors.set(device, value);
      },
    });
    return new MailTrustClient({
      accountId,
      isCurrent: () => current,
      read: reads,
      write: writes,
      encryptJson: encrypt,
      decryptJson: decrypt,
      inspectKey: inspect,
      readAnchor: anchor.read,
      markEstablished: anchor.mark,
      now: () => now,
    });
  };
  return {
    client: create("user-a", "first-device"),
    anchors,
    setAnchorUnavailable: (value: boolean) => {
      anchorUnavailable = value;
    },
    create,
    encrypt,
    decrypt,
    reads,
    writes,
    inspect,
    get row() {
      return row;
    },
    set row(value: string | null) {
      row = value;
    },
    setCurrent: (value: boolean) => {
      current = value;
    },
    beforeWrite: (action: () => Promise<void>) => {
      beforeWrite = action;
    },
  };
}
async function problemOf(promise: Promise<unknown>): Promise<MailTrustProblem> {
  try {
    await promise;
    throw new Error("Expected a blocked operation");
  } catch (error: unknown) {
    if (!(error instanceof MailTrustBlockedError)) throw error;
    return error.problem;
  }
}

it("never creates a pin when a read encounters a new sender", async () => {
  const s = await setup();
  expect(
    await s.client.lookupVerificationKey("alice@solace.test"),
  ).toBeUndefined();
  expect(s.writes).not.toHaveBeenCalled();
  expect(s.row).toBeNull();
});
it("persists ciphertext before returning the first send key and reads only the pinned key", async () => {
  const s = await setup();
  expect(
    await s.client.ensureRecipient(" Alice@Solace.Test ", "PUBLIC-A"),
  ).toBe("PUBLIC-A");
  expect(s.writes).toHaveBeenCalledTimes(1);
  expect(s.row).not.toContain("alice");
  expect(s.row).not.toContain(A);
  expect(await s.client.lookupVerificationKey("alice@solace.test")).toBe(
    "PUBLIC-A",
  );
  expect(s.writes).toHaveBeenCalledTimes(1);
  expect(await s.decrypt(s.row ?? "", "mail-trust:v1:user-b")).toBeNull();
  expect(
    await s.decrypt(s.row ?? "", "mail-trust-anchor:v1:user-a"),
  ).toBeNull();
  expect(await s.decrypt(s.row ?? "", "mail-trust:v1:user-a")).toMatchObject({
    version: 1,
    pins: [{ email: "alice@solace.test", fingerprint: A }],
  });
});
it("retains the existing pin on changed-key detection, cancellation and failed approval", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  const saved = s.row;
  expect(
    await problemOf(s.client.ensureRecipient("alice@solace.test", "PUBLIC-B")),
  ).toMatchObject({ kind: "changed", oldFingerprint: A, newFingerprint: B });
  expect(s.row).toBe(saved);
  expect(
    await problemOf(
      s.client.ensureRecipient("alice@solace.test", "PUBLIC-C", {
        oldFingerprint: A,
        newFingerprint: B,
      }),
    ),
  ).toMatchObject({ kind: "review_changed" });
  expect(s.row).toBe(saved);
  expect(
    await s.client.ensureRecipient("alice@solace.test", "PUBLIC-B", {
      oldFingerprint: A,
      newFingerprint: B,
    }),
  ).toBe("PUBLIC-B");
  expect(await s.client.lookupVerificationKey("alice@solace.test")).toBe(
    "PUBLIC-B",
  );
});
it("refreshes same-primary signed key material without treating it as a new primary", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A-SUBKEY");
  expect(await s.client.lookupVerificationKey("alice@solace.test")).toBe(
    "PUBLIC-A-SUBKEY",
  );
});
it("serializes rapid changes to different peers on one device", async () => {
  const s = await setup();
  await Promise.all([
    s.client.ensureRecipient("alice@solace.test", "PUBLIC-A"),
    s.client.ensureRecipient("bob@solace.test", "PUBLIC-B"),
  ]);
  const state = await s.decrypt(s.row ?? "", "mail-trust:v1:user-a");
  expect(state).toMatchObject({
    pins: [{ email: "alice@solace.test" }, { email: "bob@solace.test" }],
  });
});
it("re-evaluates and merges an independent peer after a CAS conflict", async () => {
  const s = await setup();
  const other = s.create();
  s.beforeWrite(async () => {
    await other.ensureRecipient("bob@solace.test", "PUBLIC-B");
  });
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  expect(await s.client.lookupVerificationKey("bob@solace.test")).toBe(
    "PUBLIC-B",
  );
  expect(await s.client.lookupVerificationKey("alice@solace.test")).toBe(
    "PUBLIC-A",
  );
});
it("does not overwrite another device's different first key for the same peer", async () => {
  const s = await setup();
  const other = s.create();
  s.beforeWrite(async () => {
    await other.ensureRecipient("alice@solace.test", "PUBLIC-B");
  });
  expect(
    await problemOf(s.client.ensureRecipient("alice@solace.test", "PUBLIC-A")),
  ).toMatchObject({ kind: "changed", oldFingerprint: B, newFingerprint: A });
  expect(await s.client.lookupVerificationKey("alice@solace.test")).toBe(
    "PUBLIC-B",
  );
});
it("blocks missing history after establishment and resets only through the reviewed CAS", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  s.row = null;
  const problem = await problemOf(
    s.client.ensureRecipient("bob@solace.test", "PUBLIC-B"),
  );
  expect(problem).toMatchObject({
    kind: "missing",
    expectedEncryptedTrust: null,
  });
  await s.client.reset(problem);
  expect(
    await s.client.lookupVerificationKey("alice@solace.test"),
  ).toBeUndefined();
  await s.client.ensureRecipient("bob@solace.test", "PUBLIC-B");
  expect(await s.client.lookupVerificationKey("bob@solace.test")).toBe(
    "PUBLIC-B",
  );
});
it("does not reset a newer version, a changed remote blob, or unavailable routes", async () => {
  const s = await setup();
  s.row =
    "mt1." +
    (await s.encrypt({ version: 2, future: true }, "mail-trust:v1:user-a"));
  const saved = s.row;
  const newer = await problemOf(
    s.client.ensureRecipient("alice@solace.test", "PUBLIC-A"),
  );
  expect(newer.kind).toBe("update_required");
  await expect(s.client.reset(newer)).rejects.toBeInstanceOf(
    MailTrustBlockedError,
  );
  expect(s.row).toBe(saved);
  s.row = "SYNTHETIC-corrupt";
  const malformed = await problemOf(
    s.client.lookupVerificationKey("alice@solace.test"),
  );
  expect(malformed).toMatchObject({
    kind: "unavailable",
    expectedEncryptedTrust: "SYNTHETIC-corrupt",
  });
  s.row = saved;
  await expect(s.client.reset(malformed)).rejects.toBeInstanceOf(
    MailTrustBlockedError,
  );
  expect(s.row).toBe(saved);
  s.reads.mockRejectedValueOnce({ statusCode: 404 });
  const absent = await problemOf(
    s.client.ensureRecipient("alice@solace.test", "PUBLIC-A"),
  );
  expect(absent).toEqual({ kind: "unavailable" });
  await expect(s.client.reset(absent)).rejects.toBeInstanceOf(
    MailTrustBlockedError,
  );
});
it("does not use a malformed pin whose armored key disagrees with its fingerprint", async () => {
  const s = await setup();
  s.row =
    "mt1." +
    (await s.encrypt(
      {
        version: 1,
        revision: 1,
        pins: [
          {
            email: "alice@solace.test",
            fingerprint: A,
            publicKeyArmored: "PUBLIC-B",
            revision: 1,
            firstSeen: now,
          },
        ],
      },
      "mail-trust:v1:user-a",
    ));
  expect(
    (await problemOf(s.client.lookupVerificationKey("alice@solace.test"))).kind,
  ).toBe("unavailable");
  expect(
    (await problemOf(s.client.ensureRecipient("alice@solace.test", "PUBLIC-A")))
      .kind,
  ).toBe("unavailable");
  expect(s.writes).not.toHaveBeenCalled();
});
it("does not release a key on failed persistence or stale sessions", async () => {
  const s = await setup();
  s.writes.mockRejectedValueOnce({ statusCode: 503 });
  expect(
    (await problemOf(s.client.ensureRecipient("alice@solace.test", "PUBLIC-A")))
      .kind,
  ).toBe("unavailable");
  expect(s.row).toBeNull();
  s.setCurrent(false);
  await expect(
    s.client.lookupVerificationKey("alice@solace.test"),
  ).rejects.toThrow("session changed");
});
it("checks session generation again after encryption and before any upload", async () => {
  const s = await setup();
  s.reads.mockImplementationOnce(async () => {
    s.setCurrent(false);
    return { encryptedTrust: null };
  });
  await expect(
    s.client.ensureRecipient("alice@solace.test", "PUBLIC-A"),
  ).rejects.toThrow("session changed");
  expect(s.writes).not.toHaveBeenCalled();
});
it("re-fetches the reviewed key and refuses a second rotation while the dialog was open", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  let lookups = 0;
  await expect(
    resolveMailTrustRecipient({
      client: s.client,
      email: "alice@solace.test",
      isCurrent: () => true,
      lookup: async () => (++lookups === 1 ? "PUBLIC-B" : "PUBLIC-C"),
      review: async () => "approve",
    }),
  ).rejects.toMatchObject({ problem: { kind: "review_changed" } });
  expect(await s.client.lookupVerificationKey("alice@solace.test")).toBe(
    "PUBLIC-A",
  );
  expect(lookups).toBe(2);
});
it("requires a deliberate retry after reset rather than sending through it", async () => {
  const s = await setup();
  s.row = "SYNTHETIC-corrupt";
  await expect(
    resolveMailTrustRecipient({
      client: s.client,
      email: "alice@solace.test",
      isCurrent: () => true,
      lookup: async () => "PUBLIC-A",
      review: async () => "reset",
    }),
  ).rejects.toMatchObject({ problem: { kind: "reset_complete" } });
  expect(
    await s.client.lookupVerificationKey("alice@solace.test"),
  ).toBeUndefined();
});
it("strictly validates the additive API response and never retries a conditional PUT blindly", async () => {
  const http = new HttpClient({ baseURL: "https://api.example.test" });
  jest.spyOn(http, "get").mockResolvedValue({ wrong: true } as never);
  const put = jest
    .spyOn(http, "put")
    .mockResolvedValue({ encryptedTrust: "SYNTHETIC" } as never);
  const api = new MailTrustApiService(http, () => true);
  await expect(api.get()).rejects.toBeDefined();
  expect(
    await api.put({
      encryptedTrust: "SYNTHETIC",
      expectedEncryptedTrust: null,
    }),
  ).toEqual({ encryptedTrust: "SYNTHETIC" });
  expect(put).toHaveBeenCalledWith("/api/mail/trust", expect.any(Object), {
    retries: 0,
    isCurrent: expect.any(Function),
  });
});
it("keeps establishment markers opaque, purpose-bound and invalid when corrupted", async () => {
  const s = await setup();
  let stored: string | null = null;
  const anchor = createMailTrustAnchor({
    accountId: "user-a",
    encryptJson: s.encrypt,
    decryptJson: s.decrypt,
    readCiphertext: async () => stored,
    writeCiphertext: async (value) => {
      stored = value;
    },
  });
  expect(await anchor.read()).toBeNull();
  await anchor.mark(7);
  expect(stored).not.toContain("established");
  expect(await anchor.read()).toBe(7);
  const reopened = createMailTrustAnchor({
    accountId: "user-b",
    encryptJson: s.encrypt,
    decryptJson: s.decrypt,
    readCiphertext: async () => stored,
    writeCiphertext: async () => {},
  });
  await expect(reopened.read()).rejects.toThrow("Local key-history revision");
});

it("never resets an explicit future wire version even if the caller supplies an old unavailable review", async () => {
  const s = await setup();
  s.row = "mt2.SYNTHETIC-new-format";
  const problem = await problemOf(
    s.client.ensureRecipient("alice@solace.test", "PUBLIC-A"),
  );
  expect(problem.kind).toBe("update_required");
  await expect(
    s.client.reset({
      kind: "unavailable",
      expectedEncryptedTrust: s.row,
      resetAllowed: true,
    }),
  ).rejects.toMatchObject({ problem: { kind: "update_required" } });
  expect(s.row).toBe("mt2.SYNTHETIC-new-format");
  expect(s.writes).not.toHaveBeenCalled();
});

it("reconciles a committed first pin after a lost response without writing it again", async () => {
  const s = await setup();
  s.writes.mockImplementationOnce(async (body) => {
    s.row = body.encryptedTrust;
    throw { statusCode: 503 };
  });
  const problem = await problemOf(
    s.client.ensureRecipient("alice@solace.test", "PUBLIC-A"),
  );
  expect(problem.kind).toBe("unavailable");
  expect(problem.resetAllowed).toBe(false);
  expect(await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A")).toBe(
    "PUBLIC-A",
  );
  expect(s.writes).toHaveBeenCalledTimes(1);
});

it("can explicitly recover a known empty corrupt blob without treating it as absent history", async () => {
  const s = await setup();
  s.row = "";
  const problem = await problemOf(
    s.client.ensureRecipient("alice@solace.test", "PUBLIC-A"),
  );
  expect(problem).toMatchObject({
    kind: "unavailable",
    expectedEncryptedTrust: "",
    resetAllowed: true,
  });
  await s.client.reset(problem);
  expect(
    await s.client.lookupVerificationKey("alice@solace.test"),
  ).toBeUndefined();
  expect(s.row?.startsWith("mt1.")).toBe(true);
});

it("read inspection reports distinct unpinned, changed, unavailable, missing and update-required states without creating pins", async () => {
  const s = await setup();
  const directory = jest.fn(async () => "PUBLIC-B");
  expect(
    (await s.client.verifySender("alice@solace.test", directory))
      .senderKeyTrustState?.kind,
  ).toBe("unpinned");
  expect(directory).not.toHaveBeenCalled();
  expect(s.writes).not.toHaveBeenCalled();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  const changed = await s.client.verifySender("alice@solace.test", directory);
  expect(changed).toMatchObject({
    senderPublicKeyArmored: "PUBLIC-A",
    senderKeyTrustState: {
      kind: "key_changed",
      oldFingerprint: A,
      newFingerprint: B,
    },
  });
  directory.mockRejectedValueOnce(new Error("offline"));
  expect(
    await s.client.verifySender("alice@solace.test", directory),
  ).toMatchObject({
    senderPublicKeyArmored: "PUBLIC-A",
    senderKeyTrustState: { kind: "unavailable", reason: "directory" },
  });
  s.row = null;
  expect(
    (await s.client.verifySender("alice@solace.test", directory))
      .senderKeyTrustState?.kind,
  ).toBe("missing");
  s.row = "mt2.SYNTHETIC";
  expect(
    (await s.client.verifySender("alice@solace.test", directory))
      .senderKeyTrustState?.kind,
  ).toBe("update_required");
  s.row = "broken";
  expect(await s.client.verifySender("alice@solace.test", directory)).toEqual({
    senderKeyTrustState: { kind: "unavailable", reason: "history" },
  });
  expect(s.writes).toHaveBeenCalledTimes(1);
});

it("retries a failed first PUT without falsely declaring missing established history", async () => {
  const s = await setup();
  s.writes.mockRejectedValueOnce({ statusCode: 503 });
  await expect(
    s.client.ensureRecipient("alice@solace.test", "PUBLIC-A"),
  ).rejects.toBeInstanceOf(MailTrustBlockedError);
  expect(s.anchors.size).toBe(0);
  expect(s.row).toBeNull();
  await expect(
    s.client.ensureRecipient("alice@solace.test", "PUBLIC-A"),
  ).resolves.toBe("PUBLIC-A");
  expect(s.anchors.size).toBe(1);
});
it("degrades unavailable local storage without blocking healthy server history or offering reset", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  s.setAnchorUnavailable(true);
  await expect(
    s.client.ensureRecipient("bob@solace.test", "PUBLIC-B"),
  ).resolves.toBe("PUBLIC-B");
  const verification = await s.client.verifySender(
    "alice@solace.test",
    async () => "PUBLIC-A",
  );
  expect(verification).toMatchObject({
    senderPublicKeyArmored: "PUBLIC-A",
    senderKeyTrustState: { kind: "unavailable", reason: "local" },
  });
  const ciphertext = s.row;
  await expect(
    s.client.reset({
      kind: "unavailable",
      resetAllowed: true,
      expectedEncryptedTrust: ciphertext,
    }),
  ).rejects.toMatchObject({ problem: { kind: "review_changed" } });
  expect(s.row).toBe(ciphertext);
});
it("blocks replay of a valid older blob dropping later pins, including after reopening this device", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  const old = s.row;
  await s.client.ensureRecipient("bob@solace.test", "PUBLIC-B");
  const latest = s.row;
  s.row = old;
  expect(
    await problemOf(s.client.ensureRecipient("carol@solace.test", "PUBLIC-C")),
  ).toMatchObject({ kind: "rollback", resetAllowed: true });
  const reopened = s.create("user-a", "first-device");
  expect(
    await problemOf(reopened.lookupVerificationKey("bob@solace.test")),
  ).toMatchObject({ kind: "rollback" });
  const freshDevice = s.create("user-a", "fresh-device");
  await expect(
    freshDevice.lookupVerificationKey("alice@solace.test"),
  ).resolves.toBe("PUBLIC-A");
  s.row = latest;
  await expect(reopened.lookupVerificationKey("bob@solace.test")).resolves.toBe(
    "PUBLIC-B",
  );
});
it("removes only the selected capacity pin using exact ciphertext and fingerprint CAS", async () => {
  const s = await setup();
  for (let i = 0; i < 256; i += 1)
    await s.client.ensureRecipient(`synthetic-${i}@solace.test`, "PUBLIC-A");
  const problem = await problemOf(
    s.client.ensureRecipient("one-more@solace.test", "PUBLIC-B"),
  );
  expect(problem.removablePins).toHaveLength(256);
  await expect(
    s.client.removePin(problem, {
      email: "synthetic-4@solace.test",
      fingerprint: B,
    }),
  ).rejects.toMatchObject({ problem: { kind: "review_changed" } });
  await s.client.removePin(problem, {
    email: "synthetic-4@solace.test",
    fingerprint: A,
  });
  await expect(
    s.client.removePin(problem, {
      email: "synthetic-5@solace.test",
      fingerprint: A,
    }),
  ).rejects.toMatchObject({ problem: { kind: "review_changed" } });
  await s.client.ensureRecipient("one-more@solace.test", "PUBLIC-B");
  const state = (await s.decrypt(s.row ?? "", "mail-trust:v1:user-a")) as {
    revision: number;
    pins: { email: string }[];
  };
  expect(state.pins).toHaveLength(256);
  expect(state.revision).toBe(258);
  expect(
    state.pins.some((pin) => pin.email === "synthetic-4@solace.test"),
  ).toBe(false);
  expect(
    state.pins.some((pin) => pin.email === "synthetic-5@solace.test"),
  ).toBe(true);
});

it("reviews a changed sender while reading and changes a pin only after explicit approval and a fresh directory check", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  const original = s.row;
  const input = {
    client: s.client,
    email: "alice@solace.test",
    isCurrent: () => true,
    lookup: async () => "PUBLIC-B",
  };
  await reviewMailTrustSender({ ...input, review: async () => "cancel" });
  expect(s.row).toBe(original);
  await reviewMailTrustSender({ ...input, review: async () => "approve" });
  await expect(
    s.client.lookupVerificationKey("alice@solace.test"),
  ).resolves.toBe("PUBLIC-B");
  const fresh = await setup();
  await reviewMailTrustSender({
    ...input,
    client: fresh.client,
    review: async () => "approve",
  });
  expect(fresh.row).toBeNull();
});

it("does not parse the pinned sender twice during one verification", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  s.inspect.mockClear();
  await s.client.verifySender("alice@solace.test", async () => "PUBLIC-A");
  expect(s.inspect).toHaveBeenCalledTimes(2);
  expect(
    s.inspect.mock.calls.filter((call) => call[2] === "verify"),
  ).toHaveLength(1);
});

it("allows explicit recovery for an individually malformed saved key while refusing reset of healthy readable pins", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  const decoded = (await s.decrypt(s.row ?? "", "mail-trust:v1:user-a")) as {
    version: 1;
    revision: number;
    pins: { publicKeyArmored: string }[];
  };
  const pin = decoded.pins[0];
  if (!pin) throw new Error("Synthetic pin missing");
  pin.publicKeyArmored = "SYNTHETIC malformed saved key";
  s.row = "mt1." + (await s.encrypt(decoded, "mail-trust:v1:user-a"));
  const problem = await problemOf(
    s.client.ensureRecipient("alice@solace.test", "PUBLIC-A"),
  );
  expect(problem).toMatchObject({
    kind: "unavailable",
    email: "alice@solace.test",
    resetAllowed: true,
  });
  await s.client.reset(problem);
  await expect(
    s.client.lookupVerificationKey("alice@solace.test"),
  ).resolves.toBeUndefined();
});

it("does not continue a reader approval after the account changes while its review is open", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  const ciphertext = s.row;
  let current = true;
  const lookup = jest.fn(async () => "PUBLIC-B");
  await expect(
    reviewMailTrustSender({
      client: s.client,
      email: "alice@solace.test",
      lookup,
      isCurrent: () => current,
      review: async () => {
        current = false;
        return "approve";
      },
    }),
  ).rejects.toThrow("session changed");
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(s.row).toBe(ciphertext);
});

it.each(["older", "missing"])(
  "refetches a cached %s history once behind the shared highest revision",
  async (cached) => {
    const s = await setup();
    await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
    const old = s.row;
    const sibling = s.create("user-a", "first-device");
    await sibling.ensureRecipient("bob@solace.test", "PUBLIC-B");
    const writes = s.writes.mock.calls.length;
    s.reads.mockClear();
    s.reads.mockResolvedValueOnce({
      encryptedTrust: cached === "older" ? old : null,
    });
    await expect(
      s.client.lookupVerificationKey("bob@solace.test"),
    ).resolves.toBe("PUBLIC-B");
    expect(s.reads.mock.calls.map((call) => call[0])).toEqual([false, true]);
    expect(s.writes).toHaveBeenCalledTimes(writes);
  },
);
it("blocks an actual database restore by default and permits only reviewed exact-blob recovery above the saved revision", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  const checkpoint = s.row;
  await s.client.ensureRecipient("bob@solace.test", "PUBLIC-B");
  const latest = s.row;
  s.row = checkpoint;
  const writes = s.writes.mock.calls.length;
  const problem = await problemOf(
    s.client.ensureRecipient("carol@solace.test", "PUBLIC-C"),
  );
  expect(problem).toMatchObject({
    kind: "rollback",
    expectedEncryptedTrust: checkpoint,
    resetAllowed: true,
  });
  expect(s.writes).toHaveBeenCalledTimes(writes);
  s.row = latest;
  await expect(s.client.reset(problem)).rejects.toMatchObject({
    problem: { kind: "review_changed" },
  });
  expect(s.row).toBe(latest);
  s.row = checkpoint;
  await s.client.reset(problem);
  expect(await s.decrypt(s.row ?? "", "mail-trust:v1:user-a")).toMatchObject({
    revision: 3,
    pins: [],
  });
  await expect(
    s.client.lookupVerificationKey("alice@solace.test"),
  ).resolves.toBeUndefined();
  await expect(
    s.client.ensureRecipient("carol@solace.test", "PUBLIC-C"),
  ).resolves.toBe("PUBLIC-C");
});
it("recovers explicitly when a fresh device reinitialized lost server history below an older device's anchor", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  await s.client.ensureRecipient("bob@solace.test", "PUBLIC-B");
  s.row = null;
  const fresh = s.create("user-a", "SYNTHETIC-fresh-device");
  await fresh.ensureRecipient("carol@solace.test", "PUBLIC-C");
  const reinitialized = s.row;
  const problem = await problemOf(
    s.client.lookupVerificationKey("carol@solace.test"),
  );
  expect(problem).toMatchObject({
    kind: "rollback",
    expectedEncryptedTrust: reinitialized,
  });
  await s.client.reset(problem);
  expect(await s.decrypt(s.row ?? "", "mail-trust:v1:user-a")).toMatchObject({
    revision: 3,
    pins: [],
  });
  await expect(
    fresh.lookupVerificationKey("carol@solace.test"),
  ).resolves.toBeUndefined();
  await expect(
    fresh.ensureRecipient("carol@solace.test", "PUBLIC-C"),
  ).resolves.toBe("PUBLIC-C");
});
it("refuses a rollback reset when current readable history is already at the highest seen revision", async () => {
  const s = await setup();
  await s.client.ensureRecipient("alice@solace.test", "PUBLIC-A");
  const saved = s.row;
  await expect(
    s.client.reset({
      kind: "rollback",
      expectedEncryptedTrust: saved,
      resetAllowed: true,
    }),
  ).rejects.toMatchObject({ problem: { kind: "review_changed" } });
  expect(s.row).toBe(saved);
});
