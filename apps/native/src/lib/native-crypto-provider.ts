/**
 * Native CryptoProvider implementation.
 *
 * Wraps `expo-crypto` (SDK 55 added AES-GCM support) and
 * `react-native-quick-crypto` to satisfy the platform-agnostic
 * CryptoProvider interface from `@workspace/e2ee`.
 *
 * `expo-crypto` provides `getRandomValues` and `randomUUID`.
 * The SubtleCrypto operations are delegated to the global `crypto.subtle`
 * which is polyfilled by `react-native-quick-crypto` (or available natively
 * on Hermes with the New Architecture in SDK 55).
 *
 * `react-native-quick-crypto` depends on native modules (NitroModules) that
 * are only available in a custom dev client / prebuild. When running in
 * Expo Go the import will fail — we catch that and fall back to whatever
 * `globalThis.crypto.subtle` provides (which may be `undefined`).
 */
import type { CryptoProvider } from "@workspace/e2ee";
import * as ExpoCrypto from "expo-crypto";
import Constants from "expo-constants";
import { createLogger } from "@workspace/logger";

const log = createLogger("native:crypto");

let polyfillAttempted = false;
let expoGoWarningLogged = false;

function isExpoManagedRuntime(): boolean {
  const appOwnership = Constants.appOwnership;

  return (
    Constants.executionEnvironment === "storeClient" ||
    appOwnership === "expo" ||
    appOwnership === "guest"
  );
}

function logExpoManagedDisabledMessage() {
  if (expoGoWarningLogged) return;
  expoGoWarningLogged = true;
  log.warn(
    "Expo-managed runtime detected. Native crypto is disabled there, so E2EE " +
      "is unavailable for this session. Use a preview/production build to " +
      "enable encryption on mobile.",
  );
}

/**
 * Attempt to install the `react-native-quick-crypto` polyfill.
 * This must be called (and awaited) before `createNativeCryptoProvider`.
 *
 * Safe to call multiple times — the import is only attempted once.
 */
export async function installCryptoPolyfill(): Promise<void> {
  if (polyfillAttempted) return;
  polyfillAttempted = true;

  if (isExpoManagedRuntime()) {
    logExpoManagedDisabledMessage();
    return;
  }

  // If subtle is already available (e.g. Hermes New Architecture), skip.
  if (globalThis.crypto?.subtle) {
    log.info("crypto.subtle already available, skipping polyfill");
    return;
  }

  try {
    // Dynamic import so the native-module resolution error is catchable.
    await import("react-native-quick-crypto");
    log.info("react-native-quick-crypto polyfill installed");
  } catch (error) {
    log.warn(
      "react-native-quick-crypto could not be loaded. This is expected when " +
        "running in Expo Go, which does not include the required native modules " +
        "(NitroModules). E2EE is disabled for this session. To enable E2EE, " +
        "use a development build (`npx expo run:android` or EAS Build).",
    );
  }
}

/**
 * Build a CryptoProvider backed by native crypto primitives.
 *
 * Call `installCryptoPolyfill()` before calling this function.
 *
 * The `subtle` property delegates to the global `crypto.subtle` which is
 * expected to be available via Hermes (New Architecture) or a polyfill
 * from `react-native-quick-crypto`.
 *
 * Returns `null` if SubtleCrypto is not available (e.g. running in Expo Go
 * without native modules).
 */
export function createNativeCryptoProvider(): CryptoProvider | null {
  if (isExpoManagedRuntime()) {
    logExpoManagedDisabledMessage();
    return null;
  }

  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    log.warn(
      "SubtleCrypto is not available — E2EE is disabled. This is expected " +
        "when running in Expo Go. Use a development build to enable encryption.",
    );
    return null;
  }

  return {
    randomUUID: () => ExpoCrypto.randomUUID(),
    getRandomValues: (buffer: Uint8Array): Uint8Array => {
      return ExpoCrypto.getRandomValues(buffer);
    },
    subtle: {
      generateKey: (algorithm: any, extractable: boolean, keyUsages: string[]) =>
        subtle.generateKey(algorithm, extractable, keyUsages as KeyUsage[]) as unknown as Promise<CryptoKey>,
      importKey: (
        format: string,
        keyData: any,
        algorithm: any,
        extractable: boolean,
        keyUsages: string[],
      ) =>
        subtle.importKey(
          format as any,
          keyData,
          algorithm,
          extractable,
          keyUsages as KeyUsage[],
        ),
      exportKey: (format: string, key: CryptoKey) =>
        subtle.exportKey(format as any, key) as unknown as Promise<ArrayBuffer>,
      encrypt: (algorithm: any, key: CryptoKey, data: BufferSource) =>
        subtle.encrypt(algorithm, key, data),
      decrypt: (algorithm: any, key: CryptoKey, data: BufferSource) =>
        subtle.decrypt(algorithm, key, data),
      wrapKey: (
        format: string,
        key: CryptoKey,
        wrappingKey: CryptoKey,
        algorithm: any,
      ) => subtle.wrapKey(format as any, key, wrappingKey, algorithm),
      unwrapKey: (
        format: string,
        wrappedKey: BufferSource,
        unwrappingKey: CryptoKey,
        unwrapAlgo: any,
        unwrappedKeyAlgo: any,
        extractable: boolean,
        keyUsages: string[],
      ) =>
        subtle.unwrapKey(
          format as any,
          wrappedKey,
          unwrappingKey,
          unwrapAlgo,
          unwrappedKeyAlgo,
          extractable,
          keyUsages as KeyUsage[],
        ),
      sign: (algorithm: any, key: CryptoKey, data: BufferSource) =>
        subtle.sign(algorithm, key, data),
      deriveKey: (
        algorithm: any,
        baseKey: CryptoKey,
        derivedKeyType: any,
        extractable: boolean,
        keyUsages: string[],
      ) =>
        subtle.deriveKey(
          algorithm,
          baseKey,
          derivedKeyType,
          extractable,
          keyUsages as KeyUsage[],
        ),
    },
  };
}
