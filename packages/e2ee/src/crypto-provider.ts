/** Web Crypto algorithm descriptor, opaque because DOM and React Native declare different shapes for it. */
type CryptoAlgorithm = object | string;

/** Key material accepted by `importKey`; the platform decides between raw bytes and a JWK. */
type CryptoKeyData = BufferSource | JsonWebKey;

/** Platform-agnostic abstraction over the Web Crypto API: pass `window.crypto` on web, or wrap expo-crypto / react-native-quick-crypto on React Native. */
export interface CryptoProvider {
  randomUUID(): string;
  getRandomValues(buffer: Uint8Array): Uint8Array;
  subtle: {
    generateKey(
      algorithm: CryptoAlgorithm,
      extractable: boolean,
      keyUsages: string[],
    ): Promise<CryptoKey>;
    importKey(
      format: string,
      keyData: CryptoKeyData,
      algorithm: CryptoAlgorithm,
      extractable: boolean,
      keyUsages: string[],
    ): Promise<CryptoKey>;
    exportKey(format: string, key: CryptoKey): Promise<ArrayBuffer>;
    encrypt(
      algorithm: CryptoAlgorithm,
      key: CryptoKey,
      data: BufferSource,
    ): Promise<ArrayBuffer>;
    decrypt(
      algorithm: CryptoAlgorithm,
      key: CryptoKey,
      data: BufferSource,
    ): Promise<ArrayBuffer>;
    wrapKey(
      format: string,
      key: CryptoKey,
      wrappingKey: CryptoKey,
      algorithm: CryptoAlgorithm,
    ): Promise<ArrayBuffer>;
    unwrapKey(
      format: string,
      wrappedKey: BufferSource,
      unwrappingKey: CryptoKey,
      unwrapAlgo: CryptoAlgorithm,
      unwrappedKeyAlgo: CryptoAlgorithm,
      extractable: boolean,
      keyUsages: string[],
    ): Promise<CryptoKey>;
    sign(
      algorithm: CryptoAlgorithm,
      key: CryptoKey,
      data: BufferSource,
    ): Promise<ArrayBuffer>;
    deriveKey(
      algorithm: CryptoAlgorithm,
      baseKey: CryptoKey,
      derivedKeyType: CryptoAlgorithm,
      extractable: boolean,
      keyUsages: string[],
    ): Promise<CryptoKey>;
  };
}
