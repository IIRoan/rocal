import { argon2id } from "hash-wasm";
import type { MailVaultKdfParams } from "./types";

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  return Uint8Array.from(Buffer.from(value, "base64"));
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

export async function deriveVaultKeyBytes(
  passphrase: string,
  params: MailVaultKdfParams,
): Promise<Uint8Array> {
  const derived = await argon2id({
    password: passphrase,
    salt: base64ToBytes(params.saltB64),
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memoryKiB,
    hashLength: 32,
    outputType: "binary",
  });

  return derived;
}

export async function deriveVaultKeyB64(
  passphrase: string,
  params: MailVaultKdfParams,
): Promise<string> {
  return bytesToBase64(await deriveVaultKeyBytes(passphrase, params));
}
