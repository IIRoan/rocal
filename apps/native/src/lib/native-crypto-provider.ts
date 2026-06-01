/**
 * Mobile CryptoProvider implementation for native iOS/Android builds.
 *
 * React Native (Hermes) does not ship a WebCrypto `subtle` implementation, so
 * E2EE runs on the pure-JavaScript provider backed by `node-forge`. If the
 * runtime *does* expose a real `crypto.subtle` (for example via the installed
 * `react-native-quick-crypto` polyfill), we transparently use it instead.
 *
 * `expo-crypto` always provides a hardware-backed CSPRNG (`getRandomValues`,
 * `randomUUID`), so those primitives are used regardless of the subtle backend.
 */
import type { CryptoProvider } from "@workspace/e2ee";
import * as ExpoCrypto from "expo-crypto";
import { Platform } from "react-native";
import { createLogger } from "@workspace/logger";
import {
  detectRuntime,
  getRuntimeDisplayName,
  supportsSubtleCrypto,
} from "@workspace/runtime";
import { createJsCryptoProvider } from "./js-crypto-provider";

const log = createLogger("native:crypto");
const runtime = detectRuntime({ platformOs: Platform.OS });

let backendLogged = false;

function logBackendOnce(level: "info" | "warn", message: string) {
  if (backendLogged) return;
  backendLogged = true;
  log[level](message);
}

function buildFallbackMessage() {
  const runtimeName = getRuntimeDisplayName(runtime);

  if (runtime.isExpoGo) {
    return (
      `Using the JavaScript crypto fallback for calendar E2EE on ${runtimeName} because Expo Go does not expose crypto.subtle. ` +
      "Mail OpenPGP still uses the native mail vault path, but first-time calendar key setup is slower. " +
      "Use a rebuilt development client with native WebCrypto support to remove this warning."
    );
  }

  return (
    `Using the JavaScript crypto fallback for calendar E2EE on ${runtimeName} because this runtime does not expose a usable crypto.subtle implementation. ` +
    "Mail OpenPGP still uses the native mail vault path, but first-time calendar key setup is slower until native WebCrypto is available. " +
    "If you just enabled react-native-quick-crypto, rebuild the native app so the new module is linked."
  );
}

/**
 * Resolve the native `crypto.subtle` implementation, or `null` when the runtime
 * does not provide a usable one (the common case on Hermes).
 */
function resolveSubtleCrypto(): SubtleCrypto | null {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef?.subtle) {
    return null;
  }

  if (!supportsSubtleCrypto({ runtime, cryptoRef })) {
    return null;
  }

  return cryptoRef.subtle;
}

function createSubtleCryptoProvider(subtle: SubtleCrypto): CryptoProvider {
  return {
    randomUUID: () => ExpoCrypto.randomUUID(),
    getRandomValues: (buffer: Uint8Array): Uint8Array =>
      ExpoCrypto.getRandomValues(buffer),
    subtle: {
      generateKey: (
        algorithm: any,
        extractable: boolean,
        keyUsages: string[],
      ) =>
        subtle.generateKey(
          algorithm,
          extractable,
          keyUsages as KeyUsage[],
        ) as unknown as Promise<CryptoKey>,
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

/**
 * Build a {@link CryptoProvider} for the current native runtime.
 *
 * Prefers a real native `crypto.subtle` when one is available; otherwise falls
 * back to the pure-JavaScript provider so E2EE keeps working on Hermes.
 */
export function createNativeCryptoProvider(): CryptoProvider {
  const subtle = resolveSubtleCrypto();

  if (subtle) {
    logBackendOnce(
      "info",
      `Using native SubtleCrypto for E2EE on ${getRuntimeDisplayName(runtime)}.`,
    );
    return createSubtleCryptoProvider(subtle);
  }

  logBackendOnce("warn", buildFallbackMessage());
  return createJsCryptoProvider();
}
