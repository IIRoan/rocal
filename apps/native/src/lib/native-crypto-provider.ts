/** Native CryptoProvider over react-native-quick-crypto's SubtleCrypto; expo-crypto supplies the CSPRNG. */
import type { CryptoProvider } from "@workspace/e2ee";
import * as ExpoCrypto from "expo-crypto";
import { Platform } from "react-native";
import { createLogger } from "@workspace/logger";
import {
  detectRuntime,
  getRuntimeDisplayName,
  supportsSubtleCrypto,
} from "@workspace/runtime";

const log = createLogger("native:crypto");
const runtime = detectRuntime({ platformOs: Platform.OS });

let backendLogged = false;

function logBackendOnce(level: "info" | "warn", message: string) {
  if (backendLogged) return;
  backendLogged = true;
  log[level](message);
}

function missingSubtleMessage() {
  const runtimeName = getRuntimeDisplayName(runtime);
  return runtime.isExpoGo
    ? `crypto.subtle is unavailable on ${runtimeName}: Expo Go is not supported, use a development client built with react-native-quick-crypto.`
    : `crypto.subtle is unavailable on ${runtimeName}: rebuild the development client so react-native-quick-crypto is linked at app entry.`;
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
    getRandomValues: (buffer: Uint8Array): Uint8Array => {
      ExpoCrypto.getRandomValues(buffer as Uint8Array<ArrayBuffer>);
      return buffer;
    },
    subtle: {
      generateKey: (
        algorithm: any,
        _extractable: boolean,
        keyUsages: string[],
      ) =>
        // Always generate extractable keys on native. The e2ee module creates
        // RSA wrapping keys with extractable:false, but we must persist them to
        // SecureStore (the secure enclave IS the key store here). The native
        // WebCrypto runtime enforces the flag strictly, so without this override
        // exportKey("jwk", privateKey) throws InvalidAccessError.
        subtle.generateKey(
          algorithm,
          true,
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

/** Build the CryptoProvider for this runtime; throws when no native crypto.subtle is linked. */
export function createNativeCryptoProvider(): CryptoProvider {
  const subtle = resolveSubtleCrypto();

  if (subtle) {
    logBackendOnce(
      "info",
      `Using native SubtleCrypto for E2EE on ${getRuntimeDisplayName(runtime)}.`,
    );
    return createSubtleCryptoProvider(subtle);
  }

  throw new Error(missingSubtleMessage());
}
