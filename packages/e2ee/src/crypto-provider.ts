/**
 * Platform-agnostic abstraction over the Web Crypto API.
 *
 * On web, pass `window.crypto` directly.
 * On React Native, wrap `expo-crypto` / `react-native-quick-crypto`
 * to satisfy this interface.
 */
export interface CryptoProvider {
  randomUUID(): string;
  getRandomValues(buffer: Uint8Array): Uint8Array;
  subtle: {
    generateKey(
      algorithm: any,
      extractable: boolean,
      keyUsages: string[],
    ): Promise<CryptoKey>;
    importKey(
      format: string,
      keyData: any,
      algorithm: any,
      extractable: boolean,
      keyUsages: string[],
    ): Promise<CryptoKey>;
    exportKey(format: string, key: CryptoKey): Promise<ArrayBuffer>;
    encrypt(
      algorithm: any,
      key: CryptoKey,
      data: BufferSource,
    ): Promise<ArrayBuffer>;
    decrypt(
      algorithm: any,
      key: CryptoKey,
      data: BufferSource,
    ): Promise<ArrayBuffer>;
    wrapKey(
      format: string,
      key: CryptoKey,
      wrappingKey: CryptoKey,
      algorithm: any,
    ): Promise<ArrayBuffer>;
    unwrapKey(
      format: string,
      wrappedKey: BufferSource,
      unwrappingKey: CryptoKey,
      unwrapAlgo: any,
      unwrappedKeyAlgo: any,
      extractable: boolean,
      keyUsages: string[],
    ): Promise<CryptoKey>;
    sign(
      algorithm: any,
      key: CryptoKey,
      data: BufferSource,
    ): Promise<ArrayBuffer>;
    deriveKey(
      algorithm: any,
      baseKey: CryptoKey,
      derivedKeyType: any,
      extractable: boolean,
      keyUsages: string[],
    ): Promise<CryptoKey>;
  };
}
