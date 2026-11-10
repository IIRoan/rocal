import { expect, it, jest } from "@jest/globals";
import {
  MAIL_TRUST_MAX_RECORDS,
  MailTrustBlockedError,
  normalizeMailTrustAddress,
  observeMailTrustKey,
  parseMailTrustState,
  type MailTrustState,
} from "../mail-key-continuity";

const first = {
  fingerprint: "A".repeat(40),
  publicKeyArmored: "SYNTHETIC first public key",
};
const second = {
  fingerprint: "B".repeat(40),
  publicKeyArmored: "SYNTHETIC second public key",
};
const now = "2026-11-10T00:00:00.000Z";
const empty: MailTrustState = { version: 1, revision: 0, pins: [] };

it("stores distinct normalized addresses only inside the sealed-state model", () => {
  let state = empty;
  for (const email of [
    " Alice+A@Solace.Test ",
    "alice.a@solace.test",
    "alicea@solace.test",
    "ünicode@solace.test",
  ]) {
    state = observeMailTrustKey(state, email, first, now);
  }
  expect(state.pins.map((pin) => pin.email)).toEqual([
    "alice+a@solace.test",
    "alice.a@solace.test",
    "alicea@solace.test",
    "ünicode@solace.test",
  ]);
  expect(normalizeMailTrustAddress("Alice <ALICE+A@SOLACE.TEST>")).toBe(
    "alice+a@solace.test",
  );
});
it("keeps first observation and returns unchanged same-key state", () => {
  const state = observeMailTrustKey(empty, "alice@solace.test", first, now);
  expect(state.pins[0]).toMatchObject({ revision: 1, firstSeen: now });
  expect(observeMailTrustKey(state, "ALICE@SOLACE.TEST", first, now)).toBe(
    state,
  );
});
it("blocks replacement until the exact old fingerprint is approved", () => {
  const state = observeMailTrustKey(empty, "alice@solace.test", first, now);
  expect(() =>
    observeMailTrustKey(state, "alice@solace.test", second, now),
  ).toThrow(MailTrustBlockedError);
  const next = observeMailTrustKey(
    state,
    "alice@solace.test",
    second,
    "2026-11-11T00:00:00.000Z",
    first.fingerprint,
  );
  expect(next.pins[0]).toMatchObject({
    ...second,
    revision: 2,
    firstSeen: now,
  });
  expect(state.pins[0]?.fingerprint).toBe(first.fingerprint);
  expect(() =>
    observeMailTrustKey(
      next,
      "alice@solace.test",
      first,
      now,
      first.fingerprint,
    ),
  ).toThrow(MailTrustBlockedError);
});
it("retains the primary pin when same-primary key material is refreshed", () => {
  const state = observeMailTrustKey(empty, "alice@solace.test", first, now);
  const next = observeMailTrustKey(
    state,
    "alice@solace.test",
    { ...first, publicKeyArmored: "SYNTHETIC signed new subkey" },
    now,
  );
  expect(next.pins[0]).toMatchObject({
    fingerprint: first.fingerprint,
    revision: 2,
  });
});
it("reports newer schema versions as update-required without parsing them as empty", () => {
  expect(() => parseMailTrustState({ version: 2, future: "opaque" })).toThrow(
    expect.objectContaining({ problem: { kind: "update_required" } }),
  );
});
it.each([
  null,
  {},
  { version: 1, pins: [], extra: true },
  { version: 1, pins: [{ email: "alice@solace.test" }] },
])("rejects malformed trust state", (value) => {
  expect(() => parseMailTrustState(value)).toThrow(MailTrustBlockedError);
});
it("rejects duplicate addresses and invalid fingerprints", () => {
  const state = observeMailTrustKey(empty, "alice@solace.test", first, now);
  expect(() =>
    parseMailTrustState({ ...state, pins: [...state.pins, ...state.pins] }),
  ).toThrow();
  expect(() =>
    observeMailTrustKey(
      empty,
      "alice@solace.test",
      { ...first, fingerprint: "directory-said-so" },
      now,
    ),
  ).toThrow();
});
it("keeps every established pin when record capacity is exhausted", () => {
  let state = empty;
  for (let index = 0; index < MAIL_TRUST_MAX_RECORDS; index += 1)
    state = observeMailTrustKey(
      state,
      `synthetic-${index}@solace.test`,
      first,
      now,
    );
  expect(() =>
    observeMailTrustKey(state, "one-more@solace.test", first, now),
  ).toThrow(
    expect.objectContaining({
      problem: expect.objectContaining({ kind: "capacity" }),
    }),
  );
  expect(state.pins).toHaveLength(MAIL_TRUST_MAX_RECORDS);
});
it("bounds actual UTF-8 plaintext size even below record capacity", () => {
  const huge = { ...first, publicKeyArmored: "x".repeat(16_000) };
  let state = empty;
  for (let index = 0; index < 64; index += 1)
    state = observeMailTrustKey(
      state,
      `synthetic-${index}@solace.test`,
      huge,
      now,
    );
  expect(() =>
    observeMailTrustKey(state, "one-more@solace.test", huge, now),
  ).toThrow(
    expect.objectContaining({
      problem: expect.objectContaining({ kind: "capacity" }),
    }),
  );
});

it("keeps sender continuity notices separate from historical cryptographic signature facts", () => {
  const { getMailSecurityNotice } = jest.requireActual<
    typeof import("../encryption-notices")
  >("../encryption-notices");
  for (const state of [
    { kind: "unpinned" },
    { kind: "missing" },
    { kind: "rollback" },
    { kind: "update_required" },
    { kind: "unavailable", reason: "history" },
  ] as const) {
    expect(
      getMailSecurityNotice({
        messageState: "inline_pgp",
        accountEncryptedAtRest: true,
        decryptionFailed: false,
        signatureVerificationState: "verified",
        senderKeyTrustState: state,
      }).tone,
    ).toBe("warning");
  }
  const notice = getMailSecurityNotice({
    messageState: "inline_pgp",
    accountEncryptedAtRest: true,
    decryptionFailed: false,
    signatureVerificationState: "verified",
    senderKeyTrustState: {
      kind: "key_changed",
      oldFingerprint: "A".repeat(40),
      newFingerprint: "B".repeat(40),
    },
  });
  expect(notice.label).toContain("sender key changed");
  expect(notice.description).toContain("Signature matches previous saved key");
  expect(notice.tone).toBe("warning");
  expect(notice.label).not.toContain("verified");
});

it("describes a failed signature against the retained key honestly when the directory key changed", () => {
  const { getMailSignatureVerificationLabel } = jest.requireActual<
    typeof import("../mail-key-continuity")
  >("../mail-key-continuity");
  expect(
    getMailSignatureVerificationLabel("failed", {
      kind: "key_changed",
      oldFingerprint: "A".repeat(40),
      newFingerprint: "B".repeat(40),
    }),
  ).toBe("Signature does not match saved key");
});
