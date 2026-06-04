import { Platform } from "react-native";
import { createLogger } from "@workspace/logger";

const log = createLogger("native:crypto-install");

let installAttempted = false;

function shouldInstallNativeCrypto() {
  return Platform.OS === "ios" || Platform.OS === "android";
}

export function installNativeCrypto() {
  if (installAttempted || !shouldInstallNativeCrypto()) {
    return;
  }

  installAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { install } = require("react-native-quick-crypto") as {
      install?: () => void;
    };

    install?.();

    if (globalThis.crypto?.subtle) {
      log.info("Installed react-native-quick-crypto WebCrypto polyfill.");
    } else {
      log.warn(
        "react-native-quick-crypto installed, but crypto.subtle is still unavailable.",
      );
    }
  } catch (error) {
    log.warn("Failed to install react-native-quick-crypto.", { error });
  }
}

installNativeCrypto();
