import {
  assertMailEncryptionUpdate,
  disabledAppendEncryption,
  isMailAccountEncryptedAtRest,
  parseMailAccountEncryption,
} from "../mail-account-encryption";

const enabled = {
  "@type": "Enabled",
  publicKey: "synthetic-key",
  headerProtection: "none",
  encryptOnAppend: false,
  allowSpamTraining: false,
};

describe("target mail encryption policy", () => {
  it("requires the explicit target key, header policy and flags", () => {
    expect(isMailAccountEncryptedAtRest({ encryptionAtRest: enabled })).toBe(true);
    expect(isMailAccountEncryptedAtRest({ encryptionAtRest: { "@type": "Disabled" } })).toBe(false);
    expect(isMailAccountEncryptedAtRest({ encryptionAtRest: { ...enabled, encryptOnAppend: true } })).toBe(true);
  });

  it.each([
    undefined, {}, { encryptionAtRest: "Enabled" },
    { encryptionAtRest: { ...enabled, "@type": "Aes256" } },
    { encryptionAtRest: { ...enabled, publicKey: "" } },
    { encryptionAtRest: { ...enabled, headerProtection: "noConfidentiality" } },
    { encryptionAtRest: { ...enabled, allowSpamTraining: true } },
    { encryptionAtRest: { ...enabled, unrecognized: true } },
    { encryptionAtRest: { "@type": "Enabled" } },
  ])("rejects malformed, unknown and retired settings without translation", (settings) => {
    expect(() => parseMailAccountEncryption(settings)).toThrow("require an update");
  });

  it("preserves the exact key and header policy when disabling append encryption", () => {
    expect(disabledAppendEncryption({ encryptionAtRest: { ...enabled, encryptOnAppend: true } }))
      .toEqual(enabled);
    expect(disabledAppendEncryption({ encryptionAtRest: enabled })).toBeNull();
    expect(disabledAppendEncryption({ encryptionAtRest: { "@type": "Disabled" } })).toBeNull();
  });

  it.each([
    null, {}, { updated: {} }, { updated: { other: null } },
    { notUpdated: { singleton: { type: "forbidden" } } },
    { updated: { singleton: null }, notUpdated: { singleton: { type: "forbidden" } } },
  ])("requires an unambiguous singleton update acknowledgement", (result) => {
    expect(() => assertMailEncryptionUpdate(result)).toThrow("did not confirm");
  });

  it("accepts an explicitly acknowledged update", () => {
    expect(() => assertMailEncryptionUpdate({ updated: { singleton: null } })).not.toThrow();
  });
});
