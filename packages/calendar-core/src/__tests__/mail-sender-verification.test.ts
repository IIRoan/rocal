import { expect, it } from "@jest/globals";
import {
  collectOwnMailAddresses,
  resolveMailSenderKeySource,
} from "../mail-sender-verification";

it("matches exact normalized own primary/custom-domain aliases before directory policy", () => {
  const ownAddresses = collectOwnMailAddresses([
    " Alice@Solace.Test ",
    "alias@custom.test",
    "alice@solace.test",
    undefined,
    "",
  ]);
  expect(ownAddresses).toEqual(["alice@solace.test", "alias@custom.test"]);
  for (const senderEmail of ["alice@solace.test", " Alias@Custom.Test "]) {
    expect(
      resolveMailSenderKeySource({
        senderEmail,
        ownAddresses,
        internalDomain: "solace.test",
      }),
    ).toBe("self");
  }
});

it.each([
  ["foreign@solace.test", "directory"],
  ["alice+unlisted@solace.test", "directory"],
  ["alice@solace.test.attacker.test", "none"],
  ["friend@external.test", "none"],
  ["alice", "none"],
  [undefined, "none"],
])("never turns a non-owned sender into self: %s", (senderEmail, expected) => {
  expect(
    resolveMailSenderKeySource({
      senderEmail,
      ownAddresses: ["alice@solace.test"],
      internalDomain: "solace.test",
    }),
  ).toBe(expected);
});
