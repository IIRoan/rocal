import type { CryptoProvider } from "@workspace/e2ee";
import { base64UrlToArrayBuffer, bytesToBase64Url } from "@workspace/e2ee";
import * as ExpoCrypto from "expo-crypto";
import forge from "node-forge";

type SecretKeyKind = "aes-gcm" | "hmac" | "pbkdf2";

interface BaseForgeKey {
  algorithm: { name: string; [key: string]: unknown };
  extractable: boolean;
  usages: string[];
}

interface ForgeSecretKey extends BaseForgeKey {
  kind: SecretKeyKind;
  type: "secret";
  bytes: string;
}

interface ForgeRsaPublicKey extends BaseForgeKey {
  kind: "rsa-public";
  type: "public";
  key: forge.pki.rsa.PublicKey;
}

interface ForgeRsaPrivateKey extends BaseForgeKey {
  kind: "rsa-private";
  type: "private";
  key: forge.pki.rsa.PrivateKey;
}

type ForgeCryptoKey = ForgeSecretKey | ForgeRsaPublicKey | ForgeRsaPrivateKey;

interface ForgeCryptoKeyPair {
  publicKey: ForgeRsaPublicKey;
  privateKey: ForgeRsaPrivateKey;
}

interface JsonWebKeyShape {
  kty: "RSA";
  alg: "RSA-OAEP-256";
  ext: boolean;
  key_ops: string[];
  n: string;
  e: string;
  d?: string;
  p?: string;
  q?: string;
  dp?: string;
  dq?: string;
  qi?: string;
}

export function createJsCryptoProvider(): CryptoProvider {
  return {
    randomUUID: () => ExpoCrypto.randomUUID(),
    getRandomValues: (buffer: Uint8Array): Uint8Array =>
      ExpoCrypto.getRandomValues(buffer),
    subtle: {
      generateKey: async (
        algorithm: any,
        extractable: boolean,
        keyUsages: string[],
      ) => {
        if (algorithm?.name === "RSA-OAEP") {
          const keyPair = await generateRsaKeyPair(
            algorithm.modulusLength ?? 4096,
            extractable,
            keyUsages,
          );

          return keyPair as unknown as CryptoKey;
        }

        if (algorithm?.name === "AES-GCM") {
          return createSecretKey(
            "aes-gcm",
            createRandomBytes((algorithm.length ?? 256) / 8),
            algorithm,
            extractable,
            keyUsages,
          ) as unknown as CryptoKey;
        }

        if (algorithm?.name === "HMAC") {
          return createSecretKey(
            "hmac",
            createRandomBytes((algorithm.length ?? 256) / 8),
            algorithm,
            extractable,
            keyUsages,
          ) as unknown as CryptoKey;
        }

        throw new Error(
          `Unsupported generateKey algorithm: ${algorithm?.name}`,
        );
      },
      importKey: async (
        format: string,
        keyData: any,
        algorithm: any,
        extractable: boolean,
        keyUsages: string[],
      ) => {
        if (format === "raw") {
          const bytes = toBinaryString(keyData);

          if (algorithm?.name === "AES-GCM") {
            return createSecretKey(
              "aes-gcm",
              bytes,
              algorithm,
              extractable,
              keyUsages,
            ) as unknown as CryptoKey;
          }

          if (algorithm?.name === "HMAC") {
            return createSecretKey(
              "hmac",
              bytes,
              algorithm,
              extractable,
              keyUsages,
            ) as unknown as CryptoKey;
          }

          if (algorithm?.name === "PBKDF2") {
            return createSecretKey(
              "pbkdf2",
              bytes,
              algorithm,
              extractable,
              keyUsages,
            ) as unknown as CryptoKey;
          }
        }

        if (format === "jwk" && keyData?.kty === "RSA") {
          return importRsaJwk(
            keyData as JsonWebKeyShape,
            extractable,
            keyUsages,
          ) as unknown as CryptoKey;
        }

        throw new Error(`Unsupported importKey format: ${format}`);
      },
      exportKey: async (format: string, key: CryptoKey) => {
        const forgeKey = key as unknown as ForgeCryptoKey;

        if (format === "raw" && forgeKey.type === "secret") {
          return toArrayBuffer(forgeKey.bytes);
        }

        if (format === "spki" && forgeKey.kind === "rsa-public") {
          const asn1 = forge.pki.publicKeyToAsn1(forgeKey.key);
          return toArrayBuffer(forge.asn1.toDer(asn1).getBytes());
        }

        if (format === "jwk" && forgeKey.kind === "rsa-private") {
          return exportRsaPrivateJwk(forgeKey) as unknown as ArrayBuffer;
        }

        throw new Error(`Unsupported exportKey format: ${format}`);
      },
      encrypt: async (algorithm: any, key: CryptoKey, data: BufferSource) => {
        const secretKey = expectSecretKey(key, "aes-gcm");
        const cipher = forge.cipher.createCipher("AES-GCM", secretKey.bytes);
        const iv = toBinaryString(algorithm.iv);
        const additionalData = algorithm.additionalData
          ? toBinaryString(algorithm.additionalData)
          : undefined;

        cipher.start({
          iv,
          additionalData,
          tagLength: 128,
        });
        cipher.update(forge.util.createBuffer(toBinaryString(data)));

        if (!cipher.finish()) {
          throw new Error("AES-GCM encryption failed.");
        }

        const output = cipher.output.getBytes() + cipher.mode.tag.getBytes();
        return toArrayBuffer(output);
      },
      decrypt: async (algorithm: any, key: CryptoKey, data: BufferSource) => {
        const secretKey = expectSecretKey(key, "aes-gcm");
        const encryptedBytes = toBinaryString(data);
        const tagLengthBytes = Math.max((algorithm.tagLength ?? 128) / 8, 16);
        const ciphertext = encryptedBytes.slice(0, -tagLengthBytes);
        const tag = encryptedBytes.slice(-tagLengthBytes);
        const decipher = forge.cipher.createDecipher(
          "AES-GCM",
          secretKey.bytes,
        );
        const iv = toBinaryString(algorithm.iv);
        const additionalData = algorithm.additionalData
          ? toBinaryString(algorithm.additionalData)
          : undefined;

        decipher.start({
          iv,
          additionalData,
          tagLength: tagLengthBytes * 8,
          tag: forge.util.createBuffer(tag),
        });
        decipher.update(forge.util.createBuffer(ciphertext));

        if (!decipher.finish()) {
          throw new Error("AES-GCM decryption failed.");
        }

        return toArrayBuffer(decipher.output.getBytes());
      },
      wrapKey: async (
        format: string,
        key: CryptoKey,
        wrappingKey: CryptoKey,
        algorithm: any,
      ) => {
        if (format !== "raw" || algorithm?.name !== "RSA-OAEP") {
          throw new Error("Only raw RSA-OAEP key wrapping is supported.");
        }

        const publicKey = expectRsaPublicKey(wrappingKey);
        const exportedKey = toBinaryString(
          await createJsCryptoProvider().subtle.exportKey("raw", key),
        );
        const wrapped = publicKey.key.encrypt(exportedKey, "RSA-OAEP", {
          md: forge.md.sha256.create(),
          mgf1: {
            md: forge.md.sha256.create(),
          },
        });

        return toArrayBuffer(wrapped);
      },
      unwrapKey: async (
        format: string,
        wrappedKey: BufferSource,
        unwrappingKey: CryptoKey,
        unwrapAlgo: any,
        unwrappedKeyAlgo: any,
        extractable: boolean,
        keyUsages: string[],
      ) => {
        if (format !== "raw" || unwrapAlgo?.name !== "RSA-OAEP") {
          throw new Error("Only raw RSA-OAEP key unwrapping is supported.");
        }

        const privateKey = expectRsaPrivateKey(unwrappingKey);
        const unwrapped = privateKey.key.decrypt(
          toBinaryString(wrappedKey),
          "RSA-OAEP",
          {
            md: forge.md.sha256.create(),
            mgf1: {
              md: forge.md.sha256.create(),
            },
          },
        );

        return createJsCryptoProvider().subtle.importKey(
          "raw",
          toArrayBuffer(unwrapped),
          unwrappedKeyAlgo,
          extractable,
          keyUsages,
        );
      },
      sign: async (algorithm: any, key: CryptoKey, data: BufferSource) => {
        const secretKey = expectSecretKey(key, "hmac");

        if (algorithm !== "HMAC" && algorithm?.name !== "HMAC") {
          throw new Error("Only HMAC signing is supported.");
        }

        const hmac = forge.hmac.create();
        hmac.start("sha256", secretKey.bytes);
        hmac.update(toBinaryString(data));
        return toArrayBuffer(hmac.digest().getBytes());
      },
      deriveKey: async (
        algorithm: any,
        baseKey: CryptoKey,
        derivedKeyType: any,
        extractable: boolean,
        keyUsages: string[],
      ) => {
        const passwordKey = expectSecretKey(baseKey, "pbkdf2");

        if (
          algorithm?.name !== "PBKDF2" ||
          derivedKeyType?.name !== "AES-GCM" ||
          algorithm.hash !== "SHA-256"
        ) {
          throw new Error(
            "Only PBKDF2-SHA256 to AES-GCM derivation is supported.",
          );
        }

        const derivedBytes = forge.pkcs5.pbkdf2(
          passwordKey.bytes,
          toBinaryString(algorithm.salt),
          algorithm.iterations,
          (derivedKeyType.length ?? 256) / 8,
          forge.md.sha256.create(),
        );

        return createSecretKey(
          "aes-gcm",
          derivedBytes,
          derivedKeyType,
          extractable,
          keyUsages,
        ) as unknown as CryptoKey;
      },
    },
  };
}

async function generateRsaKeyPair(
  modulusLength: number,
  extractable: boolean,
  keyUsages: string[],
): Promise<ForgeCryptoKeyPair> {
  const keyPair = forge.pki.rsa.generateKeyPair({
    bits: modulusLength,
    e: 0x10001,
  });

  return {
    publicKey: {
      kind: "rsa-public",
      type: "public",
      algorithm: {
        name: "RSA-OAEP",
        modulusLength,
        hash: "SHA-256",
      },
      extractable: true,
      usages: keyUsages.filter((usage) => usage === "wrapKey"),
      key: keyPair.publicKey,
    },
    privateKey: {
      kind: "rsa-private",
      type: "private",
      algorithm: {
        name: "RSA-OAEP",
        modulusLength,
        hash: "SHA-256",
      },
      extractable,
      usages: keyUsages.filter((usage) => usage === "unwrapKey"),
      key: keyPair.privateKey,
    },
  };
}

function importRsaJwk(
  keyData: JsonWebKeyShape,
  extractable: boolean,
  keyUsages: string[],
): ForgeCryptoKey {
  const n = base64UrlToBigInteger(keyData.n);
  const e = base64UrlToBigInteger(keyData.e);

  if (keyData.d) {
    return {
      kind: "rsa-private",
      type: "private",
      algorithm: {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      extractable,
      usages: keyUsages,
      key: forge.pki.setRsaPrivateKey(
        n,
        e,
        base64UrlToBigInteger(keyData.d),
        base64UrlToBigInteger(keyData.p!),
        base64UrlToBigInteger(keyData.q!),
        base64UrlToBigInteger(keyData.dp!),
        base64UrlToBigInteger(keyData.dq!),
        base64UrlToBigInteger(keyData.qi!),
      ),
    };
  }

  return {
    kind: "rsa-public",
    type: "public",
    algorithm: {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    extractable,
    usages: keyUsages,
    key: forge.pki.setRsaPublicKey(n, e),
  };
}

function exportRsaPrivateJwk(key: ForgeRsaPrivateKey): JsonWebKeyShape {
  return {
    kty: "RSA",
    alg: "RSA-OAEP-256",
    ext: key.extractable,
    key_ops: key.usages,
    n: bigIntegerToBase64Url(key.key.n),
    e: bigIntegerToBase64Url(key.key.e),
    d: bigIntegerToBase64Url(key.key.d),
    p: bigIntegerToBase64Url(key.key.p),
    q: bigIntegerToBase64Url(key.key.q),
    dp: bigIntegerToBase64Url(key.key.dP),
    dq: bigIntegerToBase64Url(key.key.dQ),
    qi: bigIntegerToBase64Url(key.key.qInv),
  };
}

function createSecretKey(
  kind: SecretKeyKind,
  bytes: string,
  algorithm: { name: string; [key: string]: unknown },
  extractable: boolean,
  usages: string[],
): ForgeSecretKey {
  return {
    kind,
    type: "secret",
    bytes,
    algorithm,
    extractable,
    usages,
  };
}

function expectSecretKey(
  key: CryptoKey,
  expectedKind: SecretKeyKind,
): ForgeSecretKey {
  const forgeKey = key as unknown as ForgeSecretKey;

  if (forgeKey.type !== "secret" || forgeKey.kind !== expectedKind) {
    throw new Error(`Expected a ${expectedKind} secret key.`);
  }

  return forgeKey;
}

function expectRsaPublicKey(key: CryptoKey): ForgeRsaPublicKey {
  const forgeKey = key as unknown as ForgeRsaPublicKey;

  if (forgeKey.kind !== "rsa-public") {
    throw new Error("Expected an RSA public key.");
  }

  return forgeKey;
}

function expectRsaPrivateKey(key: CryptoKey): ForgeRsaPrivateKey {
  const forgeKey = key as unknown as ForgeRsaPrivateKey;

  if (forgeKey.kind !== "rsa-private") {
    throw new Error("Expected an RSA private key.");
  }

  return forgeKey;
}

function createRandomBytes(byteLength: number): string {
  return toBinaryString(ExpoCrypto.getRandomValues(new Uint8Array(byteLength)));
}

function toBinaryString(
  value: BufferSource | ArrayBufferView | ArrayBuffer,
): string {
  if (typeof value === "string") {
    return value;
  }

  const array =
    value instanceof Uint8Array
      ? value
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

  return Array.from(array, (byte) => String.fromCharCode(byte)).join("");
}

function toArrayBuffer(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(value, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

function bigIntegerToBase64Url(value: forge.jsbn.BigInteger): string {
  let hex = value.toString(16);

  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }

  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = parseInt(hex.slice(index, index + 2), 16);
  }

  return bytesToBase64Url(bytes);
}

function base64UrlToBigInteger(value: string): forge.jsbn.BigInteger {
  const bytes = new Uint8Array(base64UrlToArrayBuffer(value));
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return new forge.jsbn.BigInteger(hex || "0", 16);
}
