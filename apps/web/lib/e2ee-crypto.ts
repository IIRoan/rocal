import { createE2eeModule, type CryptoProvider } from "@workspace/e2ee";

// Re-export types from the shared package
export type { EncryptedJsonPayload, EncryptedBinaryPayload, PasswordEnvelopePayload } from "@workspace/e2ee";
export { PASSWORD_KDF_ALGORITHM, PASSWORD_WRAP_ALGORITHM, DEFAULT_PASSWORD_KDF_ITERATIONS } from "@workspace/e2ee";

// Web-specific: check if Web Crypto API is available
export function isWebCryptoAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.crypto !== "undefined" &&
    typeof window.crypto.subtle !== "undefined"
  );
}

// Web CryptoProvider wrapping the global crypto object
const webCrypto: CryptoProvider = globalThis.crypto as unknown as CryptoProvider;

// Create the E2EE module instance with web crypto
const e2eeModule = createE2eeModule(webCrypto);

// Re-export all functions from the module for backward compatibility
export const generateWrappingKeyPair = e2eeModule.generateWrappingKeyPair;
export const exportWrappingPublicKey = e2eeModule.exportWrappingPublicKey;
export const generateAccountKey = e2eeModule.generateAccountKey;
export const generateBlindIndexKey = e2eeModule.generateBlindIndexKey;
export const wrapSymmetricKey = e2eeModule.wrapSymmetricKey;
export const unwrapAccountKey = e2eeModule.unwrapAccountKey;
export const unwrapBlindIndexKey = e2eeModule.unwrapBlindIndexKey;
export const encryptJsonPayload = e2eeModule.encryptJsonPayload;
export const decryptJsonPayload = e2eeModule.decryptJsonPayload;
export const createBlindIndexTokens = e2eeModule.createBlindIndexTokens;
export const derivePasswordWrappingKey = e2eeModule.derivePasswordWrappingKey;
export const createPasswordEnvelope = e2eeModule.createPasswordEnvelope;
export const unwrapPasswordEnvelope = e2eeModule.unwrapPasswordEnvelope;
export const generatePasswordSalt = e2eeModule.generatePasswordSalt;
export const generateDeviceId = e2eeModule.generateDeviceId;
