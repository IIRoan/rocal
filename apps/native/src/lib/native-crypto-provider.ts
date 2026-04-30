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
 */
import type { CryptoProvider } from "@workspace/e2ee";
import * as ExpoCrypto from "expo-crypto";

/**
 * Build a CryptoProvider backed by native crypto primitives.
 *
 * The `subtle` property delegates to the global `crypto.subtle` which is
 * expected to be available via Hermes (New Architecture) or a polyfill
 * from `react-native-quick-crypto`.
 */
export function createNativeCryptoProvider(): CryptoProvider {
  // Hermes (New Architecture, SDK 55) exposes globalThis.crypto.subtle.
  // react-native-quick-crypto also polyfills it.
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    throw new Error(
      "SubtleCrypto is not available. Ensure react-native-quick-crypto " +
        "is installed or that you are running on Hermes with New Architecture.",
    );
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
