import type { Argon2idParams } from "@workspace/e2ee";
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

/** The 32-byte Argon2id output; the password envelope and the mail vault share it. */
export function argon2idBytes(
  password: Uint8Array | string,
  salt: Uint8Array,
  params: Argon2idParams,
): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    iterations: params.passes,
    parallelism: params.parallelism,
    memorySize: params.memoryKiB,
    hashLength: 32,
    outputType: "binary",
  });
}

export function deriveVaultKeyBytes(
  passphrase: string,
  params: MailVaultKdfParams,
): Promise<Uint8Array> {
  return argon2idBytes(passphrase, base64ToBytes(params.saltB64), {
    memoryKiB: params.memoryKiB,
    passes: params.iterations,
    parallelism: params.parallelism,
  });
}

export async function deriveVaultKeyB64(
  passphrase: string,
  params: MailVaultKdfParams,
): Promise<string> {
  return bytesToBase64(await deriveVaultKeyBytes(passphrase, params));
}
