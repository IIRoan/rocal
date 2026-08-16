import { Platform } from "react-native";
import { createLogger } from "@workspace/logger";
import { loadQuickCrypto } from "./load-quick-crypto";

const log = createLogger("native:crypto-install");

let installAttempted = false;
let nativeCryptoReady = false;

function shouldInstallNativeCrypto() {
  return Platform.OS === "ios" || Platform.OS === "android";
}

/**
 * OpenPGP.js 6 calls this exact check while evaluating the module, so WebCrypto
 * must be installed before any `import "openpgp"`.
 */
export function hasUsableWebCrypto(
  cryptoRef: { subtle?: unknown } | null | undefined = globalThis.crypto,
): boolean {
  return Boolean(cryptoRef?.subtle);
}

export function isNativeCryptoReady(): boolean {
  return nativeCryptoReady && hasUsableWebCrypto();
}

function assignGlobalCrypto(cryptoImpl: object): boolean {
  const targets: object[] = [globalThis];
  if (typeof global !== "undefined" && global !== globalThis) {
    targets.push(global);
  }

  for (const target of targets) {
    try {
      Object.assign(target, { crypto: cryptoImpl });
    } catch {
      try {
        Object.defineProperty(target, "crypto", {
          value: cryptoImpl,
          configurable: true,
          writable: true,
        });
      } catch {
        // Some runtimes expose a non-configurable `crypto` binding.
      }
    }
  }

  return hasUsableWebCrypto();
}

export function installNativeCrypto(): boolean {
  if (installAttempted) {
    return isNativeCryptoReady();
  }

  installAttempted = true;

  if (!shouldInstallNativeCrypto()) {
    nativeCryptoReady = hasUsableWebCrypto();
    return nativeCryptoReady;
  }

  const quickCrypto = loadQuickCrypto();
  if (!quickCrypto) {
    log.warn("react-native-quick-crypto is not available in this binary.");
    return false;
  }

  try {
    quickCrypto.install?.();
  } catch (error) {
    log.warn("react-native-quick-crypto install() threw.", { error });
  }

  if (!hasUsableWebCrypto() && quickCrypto.subtle) {
    assignGlobalCrypto(quickCrypto);
  }

  nativeCryptoReady = hasUsableWebCrypto();

  if (nativeCryptoReady) {
    log.info("Installed react-native-quick-crypto WebCrypto polyfill.");
  } else {
    log.warn(
      "react-native-quick-crypto installed, but crypto.subtle is still unavailable.",
    );
  }

  return nativeCryptoReady;
}

installNativeCrypto();
