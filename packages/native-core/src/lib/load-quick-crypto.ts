export type QuickCryptoModule = {
  install?: () => void;
  subtle?: SubtleCrypto;
  argon2Sync?: (
    algorithm: string,
    params: {
      message: Uint8Array;
      nonce: Uint8Array;
      parallelism: number;
      tagLength: number;
      memory: number;
      passes: number;
    },
  ) => Uint8Array | ArrayBuffer;
};

export function loadQuickCrypto(): QuickCryptoModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-quick-crypto") as QuickCryptoModule;
  } catch {
    return null;
  }
}
