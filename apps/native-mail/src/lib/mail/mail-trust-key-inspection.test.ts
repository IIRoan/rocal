import { expect, it } from "@jest/globals";
import * as openpgp from "openpgp";
import { inspectMailPublicKey } from "@workspace/calendar-core";
import { loadStalwart110MailFixtures } from "../../../../../packages/calendar-core/test-fixtures/stalwart-1.1.0-mail/fixture-loader";

const fixtures = loadStalwart110MailFixtures();
it("uses the actual native OpenPGP parser for primary fingerprints and rejects private directory keys", async () => {
  const key = fixtures.keyFor("sender");
  const result = await inspectMailPublicKey(
    { armoredKey: key.publicKeyArmored, forEncryption: true },
    openpgp,
  );
  expect(result.fingerprint).toBe(key.fingerprint.toUpperCase());
  await expect(
    inspectMailPublicKey(
      { armoredKey: key.privateKeyArmored, forEncryption: true },
      openpgp,
    ),
  ).rejects.toThrow("Invalid public mail key");
});
it("retains known signed subkeys across same-primary native key refreshes", async () => {
  const key = fixtures.keyFor("sender");
  const original = await openpgp.readPrivateKey({
    armoredKey: key.privateKeyArmored,
  });
  const updated = await original.addSubkey({
    type: "ecc",
    curve: "curve25519Legacy",
    sign: false,
  });
  const result = await inspectMailPublicKey(
    {
      armoredKey: updated.toPublic().armor(),
      knownArmoredKey: key.publicKeyArmored,
      forEncryption: true,
    },
    openpgp,
  );
  expect(result.fingerprint).toBe(key.fingerprint.toUpperCase());
  const retained = await inspectMailPublicKey(
    {
      armoredKey: key.publicKeyArmored,
      knownArmoredKey: result.publicKeyArmored,
      forEncryption: true,
    },
    openpgp,
  );
  expect(
    (
      await openpgp.readKey({ armoredKey: retained.publicKeyArmored })
    ).getSubkeys(),
  ).toHaveLength(updated.getSubkeys().length);
});
it("a different primary is observed as a replacement rather than merged into the old key", async () => {
  const old = fixtures.keyFor("sender");
  const next = fixtures.keyFor("unrelated");
  const result = await inspectMailPublicKey(
    {
      armoredKey: next.publicKeyArmored,
      knownArmoredKey: old.publicKeyArmored,
      forEncryption: true,
    },
    openpgp,
  );
  expect(result.fingerprint).toBe(next.fingerprint.toUpperCase());
  expect(result.fingerprint).not.toBe(old.fingerprint.toUpperCase());
});

it("cannot erase a known native primary revocation with stripped directory key material", async () => {
  const key = fixtures.keyFor("sender");
  const revoked = await (
    await openpgp.readPrivateKey({ armoredKey: key.privateKeyArmored })
  ).revoke();
  await expect(
    inspectMailPublicKey(
      {
        armoredKey: key.publicKeyArmored,
        knownArmoredKey: revoked.toPublic().armor(),
        forEncryption: true,
      },
      openpgp,
    ),
  ).rejects.toThrow();
});
