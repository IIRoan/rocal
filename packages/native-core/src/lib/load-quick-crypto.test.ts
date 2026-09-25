import { loadQuickCrypto } from "./load-quick-crypto";

describe("loadQuickCrypto", () => {
  it("returns the mocked native module in tests", () => {
    const loaded = loadQuickCrypto();
    expect(loaded).toEqual(expect.objectContaining({ install: expect.any(Function) }));
    expect(loaded?.argon2Sync).toBeUndefined();
  });
});
