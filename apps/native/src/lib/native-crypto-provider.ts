import type { CryptoProvider } from "@workspace/e2ee";
import { createJsCryptoProvider } from "./js-crypto-provider";

let provider: CryptoProvider | null = null;

export async function installCryptoPolyfill(): Promise<void> {
  installBase64Polyfill();
}

export function createNativeCryptoProvider(): CryptoProvider | null {
  provider ??= createJsCryptoProvider();
  return provider;
}

function installBase64Polyfill() {
  const globalScope = globalThis as typeof globalThis & {
    atob?: (value: string) => string;
    btoa?: (value: string) => string;
  };

  globalScope.btoa ??= encodeBase64;
  globalScope.atob ??= decodeBase64;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64(value: string): string {
  let output = "";

  for (let index = 0; index < value.length; index += 3) {
    const first = value.charCodeAt(index) & 0xff;
    const second =
      index + 1 < value.length ? value.charCodeAt(index + 1) & 0xff : 0;
    const third =
      index + 2 < value.length ? value.charCodeAt(index + 2) & 0xff : 0;
    const combined = (first << 16) | (second << 8) | third;

    output += BASE64_ALPHABET[(combined >> 18) & 0x3f];
    output += BASE64_ALPHABET[(combined >> 12) & 0x3f];
    output +=
      index + 1 < value.length ? BASE64_ALPHABET[(combined >> 6) & 0x3f] : "=";
    output += index + 2 < value.length ? BASE64_ALPHABET[combined & 0x3f] : "=";
  }

  return output;
}

function decodeBase64(value: string): string {
  const normalized = value.replace(/\s/g, "");
  let output = "";

  for (let index = 0; index < normalized.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(normalized[index] ?? "A");
    const second = BASE64_ALPHABET.indexOf(normalized[index + 1] ?? "A");
    const third =
      normalized[index + 2] === "="
        ? 0
        : BASE64_ALPHABET.indexOf(normalized[index + 2] ?? "A");
    const fourth =
      normalized[index + 3] === "="
        ? 0
        : BASE64_ALPHABET.indexOf(normalized[index + 3] ?? "A");
    const combined = (first << 18) | (second << 12) | (third << 6) | fourth;

    output += String.fromCharCode((combined >> 16) & 0xff);
    if (normalized[index + 2] !== "=") {
      output += String.fromCharCode((combined >> 8) & 0xff);
    }
    if (normalized[index + 3] !== "=") {
      output += String.fromCharCode(combined & 0xff);
    }
  }

  return output;
}
