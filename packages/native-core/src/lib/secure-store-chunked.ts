import * as SecureStore from "expo-secure-store";
import { getFallbackSessionToken } from "./session-token-fallback";

/** Matches `@better-auth/expo` storageAdapter chunking (issue #9151). */
const BA_CHUNK_MARKER = "\u0001ba-chunks:";
const LEGACY_CHUNK_SIZE = 1800;

function legacyChunkKey(baseKey: string, index: number) {
  return `${baseKey}_${index}`;
}

function parseLegacyChunkCount(raw: string | null | undefined) {
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }
  const count = Number.parseInt(raw, 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function parseBaChunkCount(raw: string | null | undefined) {
  if (!raw?.startsWith(BA_CHUNK_MARKER)) return null;
  const count = Number(raw.slice(BA_CHUNK_MARKER.length));
  return Number.isInteger(count) && count > 0 ? count : null;
}

function readBetterAuthChunksSync(baseKey: string, count: number) {
  let value = "";
  for (let i = 0; i < count; i += 1) {
    const chunk = SecureStore.getItem(`${baseKey}.${i}`);
    if (chunk == null) return null;
    value += chunk;
  }
  return value;
}

async function readBetterAuthChunksAsync(baseKey: string, count: number) {
  const chunks = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      SecureStore.getItemAsync(`${baseKey}.${i}`),
    ),
  );
  if (chunks.some((chunk) => chunk == null)) return null;
  return chunks.join("");
}

function readLegacyChunksSync(baseKey: string, count: number) {
  const chunks: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const chunk = SecureStore.getItem(legacyChunkKey(baseKey, i));
    if (chunk == null) {
      return null;
    }
    chunks.push(chunk);
  }
  return chunks.join("");
}

async function readLegacyChunksAsync(baseKey: string, count: number) {
  const chunks = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.getItemAsync(legacyChunkKey(baseKey, index)),
    ),
  );
  if (chunks.some((chunk) => chunk == null)) {
    return null;
  }
  return chunks.join("");
}

async function deleteLegacyChunks(baseKey: string, count: number) {
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.deleteItemAsync(legacyChunkKey(baseKey, index)),
    ),
  );
}

async function deleteBaChunks(baseKey: string, count: number) {
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      SecureStore.deleteItemAsync(`${baseKey}.${i}`),
    ),
  );
}

/** Read Better Auth/legacy chunked values; bare digit meta must never surface raw or Better Auth sets properties on 1 and crashes. */
export function getChunkedSecureValueSync(baseKey: string) {
  try {
    const raw = SecureStore.getItem(baseKey);
    if (raw == null) return null;

    const baCount = parseBaChunkCount(raw);
    if (baCount) {
      return readBetterAuthChunksSync(baseKey, baCount);
    }

    const legacyCount = parseLegacyChunkCount(raw);
    if (legacyCount) {
      return readLegacyChunksSync(baseKey, legacyCount);
    }

    return raw;
  } catch {
    return null;
  }
}

/** Prefer Better Auth's chunk protocol so the expo client can read the same keys. */
export function setChunkedSecureValueSync(baseKey: string, value: string) {
  const previousRaw = SecureStore.getItem(baseKey);
  const previousLegacyCount = parseLegacyChunkCount(previousRaw);
  const previousBaCount = parseBaChunkCount(previousRaw);

  if (value.length <= LEGACY_CHUNK_SIZE) {
    SecureStore.setItem(baseKey, value);
  } else {
    SecureStore.setItem(baseKey, "");
    const count = Math.ceil(value.length / LEGACY_CHUNK_SIZE);
    for (let i = 0; i < count; i += 1) {
      const start = i * LEGACY_CHUNK_SIZE;
      SecureStore.setItem(
        `${baseKey}.${i}`,
        value.slice(start, start + LEGACY_CHUNK_SIZE),
      );
    }
    SecureStore.setItem(baseKey, `${BA_CHUNK_MARKER}${count}`);
  }

  if (previousLegacyCount) {
    for (let index = 0; index < previousLegacyCount; index += 1) {
      // Best-effort cleanup; a failed delete only leaves a stale chunk nobody reads.
      void SecureStore.deleteItemAsync(legacyChunkKey(baseKey, index)).catch(
        () => undefined,
      );
    }
  }

  if (previousBaCount && value.length <= LEGACY_CHUNK_SIZE) {
    for (let i = 0; i < previousBaCount; i += 1) {
      // Best-effort cleanup; a failed delete only leaves a stale chunk nobody reads.
      void SecureStore.deleteItemAsync(`${baseKey}.${i}`).catch(
        () => undefined,
      );
    }
  }
}

export async function readRawSecureValue(baseKey: string) {
  return SecureStore.getItemAsync(baseKey);
}

export async function readChunkedSecureValue(baseKey: string) {
  const raw = await SecureStore.getItemAsync(baseKey);
  if (raw == null) return null;

  const baCount = parseBaChunkCount(raw);
  if (baCount) {
    return readBetterAuthChunksAsync(baseKey, baCount);
  }

  const legacyCount = parseLegacyChunkCount(raw);
  if (legacyCount) {
    return readLegacyChunksAsync(baseKey, legacyCount);
  }

  return raw;
}

export async function writeChunkedSecureValue(baseKey: string, value: string) {
  const previousRaw = await SecureStore.getItemAsync(baseKey);
  const previousLegacyCount = parseLegacyChunkCount(previousRaw);
  const previousBaCount = parseBaChunkCount(previousRaw);

  if (value.length <= LEGACY_CHUNK_SIZE) {
    await SecureStore.setItemAsync(baseKey, value);
  } else {
    await SecureStore.setItemAsync(baseKey, "");
    const count = Math.ceil(value.length / LEGACY_CHUNK_SIZE);
    for (let i = 0; i < count; i += 1) {
      const start = i * LEGACY_CHUNK_SIZE;
      await SecureStore.setItemAsync(
        `${baseKey}.${i}`,
        value.slice(start, start + LEGACY_CHUNK_SIZE),
      );
    }
    await SecureStore.setItemAsync(baseKey, `${BA_CHUNK_MARKER}${count}`);
  }

  if (previousLegacyCount) {
    await deleteLegacyChunks(baseKey, previousLegacyCount);
  }

  if (previousBaCount && value.length <= LEGACY_CHUNK_SIZE) {
    await deleteBaChunks(baseKey, previousBaCount);
  }
}

export async function deleteChunkedSecureValue(baseKey: string) {
  const raw = await SecureStore.getItemAsync(baseKey);
  const legacyCount = parseLegacyChunkCount(raw);
  const baCount = parseBaChunkCount(raw);

  await SecureStore.deleteItemAsync(baseKey);

  if (legacyCount) {
    await deleteLegacyChunks(baseKey, legacyCount);
  }

  if (baCount) {
    await deleteBaChunks(baseKey, baCount);
  }
}

function cookieJarHasSessionToken(raw: string | null) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    return Object.keys(parsed).some((name) => name.includes("session_token"));
  } catch {
    return false;
  }
}

/** A Better Auth cookie jar maps cookie names to { value, expires } entries. */
type CookieJar = Record<string, { value: string; expires: string | null }>;

function isCookieJar(value: unknown): value is CookieJar {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).value === "string",
  );
}

function restoreSessionTokenIntoJar(value: string, previousJoined: string | null) {
  if (
    !value ||
    value === "{}" ||
    value === "" ||
    value.startsWith(BA_CHUNK_MARKER) ||
    cookieJarHasSessionToken(value)
  ) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return value;
    }
    const jar = parsed as Record<string, { value: string; expires: string | null }>;

    let restored: { name: string; entry: { value: string; expires: string | null } } | null =
      null;
    if (previousJoined) {
      try {
        const previous: unknown = JSON.parse(previousJoined);
        if (isCookieJar(previous)) {
          const name = Object.keys(previous).find((key) =>
            key.includes("session_token"),
          );
          if (name) {
            restored = { name, entry: previous[name] };
          }
        }
      } catch {
        // Previous value was not a jar.
      }
    }

    if (!restored) {
      const fallback = getFallbackSessionToken();
      if (fallback) {
        restored = {
          name: "__Secure-better-auth.session_token",
          entry: { value: fallback, expires: null },
        };
      }
    }

    if (!restored) {
      return value;
    }

    jar[restored.name] = restored.entry;
    return JSON.stringify(jar);
  } catch {
    return value;
  }
}

/** Better Auth storage: reassemble legacy chunks, leave BA markers to its adapter, scrub legacy leftovers, keep session_token across Max-Age=0 races. */
export const authSecureStore = {
  getItem: (key: string) => {
    try {
      const raw = SecureStore.getItem(key);
      if (raw == null) return null;

      // Let Better Auth's storageAdapter join its own chunks.
      if (parseBaChunkCount(raw)) {
        return raw;
      }

      const legacyCount = parseLegacyChunkCount(raw);
      if (legacyCount) {
        return readLegacyChunksSync(key, legacyCount) ?? "{}";
      }

      return raw;
    } catch {
      return "{}";
    }
  },
  setItem: (key: string, value: string) => {
    try {
      const previousRaw = SecureStore.getItem(key);
      const previousLegacyCount = parseLegacyChunkCount(previousRaw);
      const previousJoined = getChunkedSecureValueSync(key);
      const next = restoreSessionTokenIntoJar(value, previousJoined);
      SecureStore.setItem(key, next);
      if (previousLegacyCount) {
        for (let index = 0; index < previousLegacyCount; index += 1) {
          // Best-effort cleanup; a failed delete only leaves a stale chunk nobody reads.
          void SecureStore.deleteItemAsync(legacyChunkKey(key, index)).catch(
            () => undefined,
          );
        }
      }
    } catch {
      // Ignore write failures — auth will surface as signed-out.
    }
  },
};

/** Used for mail vault and other non-Better-Auth oversized secrets. */
export const chunkedSecureStore = {
  getItem: getChunkedSecureValueSync,
  setItem: setChunkedSecureValueSync,
};
