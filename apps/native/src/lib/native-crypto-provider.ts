/**
 * Mobile CryptoProvider implementation.
 *
 * Wraps Expo/runtime crypto when available and otherwise falls back to a
 * pure JavaScript provider so Expo Go never depends on native-only crypto
 * modules.
 *
 * `expo-crypto` provides `getRandomValues` and `randomUUID`. If the runtime
 * also exposes `crypto.subtle`, we use it. Otherwise we fall back to the JS
 * provider from `node-forge`.
 */
import type { CryptoProvider } from "@workspace/e2ee";
import * as ExpoCrypto from "expo-crypto";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { createLogger } from "@workspace/logger";
import {
  detectRuntime,
  getRuntimeDisplayName,
  supportsSubtleCrypto,
} from "@workspace/runtime";
import { createJsCryptoProvider } from "./js-crypto-provider";

const log = createLogger("native:crypto");
const runtime = detectRuntime({
  platformOs: Platform.OS,
  expoExecutionEnvironment: Constants.executionEnvironment,
  expoAppOwnership: Constants.appOwnership,
});

let jsFallbackLogged = false;

function isExpoGoRuntime(): boolean {
  return runtime.isExpoGo;
}

function logJsFallbackMessage(message: string) {
  if (jsFallbackLogged) return;
  jsFallbackLogged = true;
  log.warn(
    `${message} Crypto operations stay available, but first-time key setup can be slower.`,
  );
}

export async function installCryptoPolyfill(): Promise<void> {
  if (isExpoGoRuntime() || !globalThis.crypto?.subtle) {
    logJsFallbackMessage(
      `${getRuntimeDisplayName(runtime)} is using the JavaScript crypto fallback for E2EE.`,
    );
  }
}

/**
 * Build a CryptoProvider backed by native crypto primitives.
 *
 * Call `installCryptoPolyfill()` before calling this function if you want the
 * runtime/fallback log to happen during bootstrap.
 *
 * Falls back to a pure JavaScript provider when native SubtleCrypto is not
 * available.
 */
export function createNativeCryptoProvider(): CryptoProvider {
  if (isExpoGoRuntime()) {
    logJsFallbackMessage(
      `${getRuntimeDisplayName(runtime)} detected. Using the JavaScript crypto fallback for E2EE.`,
    );
    return createJsCryptoProvider();
  }

  const subtle = globalThis.crypto?.subtle;

  if (!supportsSubtleCrypto({ runtime, cryptoRef: globalThis.crypto })) {
    logJsFallbackMessage(
      `SubtleCrypto is not available in ${getRuntimeDisplayName(runtime)}. Using the JavaScript crypto fallback for E2EE.`,
    );
    return createJsCryptoProvider();
  }

  return {
    randomUUID: () => ExpoCrypto.randomUUID(),
    getRandomValues: (buffer: Uint8Array): Uint8Array => {
      return ExpoCrypto.getRandomValues(buffer);
    },
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
