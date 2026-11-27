import { silenceOpenPgpDebugLogs } from "./openpgp-debug-filter";

describe("silenceOpenPgpDebugLogs", () => {
  it("drops OpenPGP.js debug lines and forwards everything else", () => {
    const log = jest.fn();
    const error = jest.fn();
    const target = { log, error };

    silenceOpenPgpDebugLogs(target);
    target.error("[OpenPGP.js debug]", new Error("Cipher update failed"));
    target.log("[OpenPGP.js debug]", "Improperly formatted armor header");
    target.error("Mail decryption failed", { code: "x" });
    target.log("ready");

    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("Mail decryption failed", { code: "x" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("ready");
  });
});
