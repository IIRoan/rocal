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

type BaChunkGroup = { count: number; slot: 0 | 1 | null };
type BaChunkMarker = BaChunkGroup & { fallbackCount: number | null };

function parseBaChunkCount(value: string | undefined, limit: number) {
  if (value === undefined) return null;
  const count = Number(value);
  return Number.isInteger(count) && count > 0 && count <= limit ? count : null;
}

function parseBaChunkMarker(
  raw: string | null | undefined,
): BaChunkMarker | null {
  if (!raw?.startsWith(BA_CHUNK_MARKER)) return null;
  const parts = raw.slice(BA_CHUNK_MARKER.length).split(":");
  if (parts.length > 3) return null;
  const [countValue, slotValue, fallbackCountValue] = parts;
  // Older non-auth values use the same marker without Expo's current chunk cap.
  const count = parseBaChunkCount(
    countValue,
    slotValue === undefined ? Infinity : 100,
  );
  if (count === null) return null;
  if (slotValue === undefined)
    return { count, slot: null, fallbackCount: null };
  if (slotValue !== "0" && slotValue !== "1") return null;
  const fallbackCount = parseBaChunkCount(fallbackCountValue, 100);
  if (fallbackCountValue !== undefined && fallbackCount === null) return null;
  return { count, slot: slotValue === "0" ? 0 : 1, fallbackCount };
}

function baChunkGroups(marker: BaChunkMarker): BaChunkGroup[] {
  if (marker.slot === null || marker.fallbackCount === null) return [marker];
  return [
    marker,
    { count: marker.fallbackCount, slot: marker.slot === 0 ? 1 : 0 },
  ];
}

function baChunkKey(
  baseKey: string,
  slot: BaChunkGroup["slot"],
  index: number,
) {
  return slot === null ? `${baseKey}.${index}` : `${baseKey}.${slot}.${index}`;
}

function readBetterAuthChunksSync(baseKey: string, marker: BaChunkMarker) {
  for (const group of baChunkGroups(marker)) {
    const chunks: string[] = [];
    for (let i = 0; i < group.count; i += 1) {
      const chunk = SecureStore.getItem(baChunkKey(baseKey, group.slot, i));
      if (!chunk) break;
      chunks.push(chunk);
    }
    if (chunks.length === group.count) return chunks.join("");
  }
  return null;
}

async function readBetterAuthChunksAsync(
  baseKey: string,
  marker: BaChunkMarker,
) {
  for (const group of baChunkGroups(marker)) {
    const chunks = await Promise.all(
      Array.from({ length: group.count }, (_, i) =>
        SecureStore.getItemAsync(baChunkKey(baseKey, group.slot, i)),
      ),
    );
    if (chunks.every((chunk) => !!chunk)) return chunks.join("");
  }
  return null;
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

async function deleteBaChunks(baseKey: string, marker: BaChunkMarker) {
  await Promise.all(
    baChunkGroups(marker).flatMap((group) =>
      Array.from({ length: group.count }, (_, i) =>
        SecureStore.deleteItemAsync(baChunkKey(baseKey, group.slot, i)),
      ),
    ),
  );
}

/** Read Better Auth/legacy chunked values; bare digit meta must never surface raw or Better Auth sets properties on 1 and crashes. */
export function getChunkedSecureValueSync(baseKey: string) {
  try {
    const raw = SecureStore.getItem(baseKey);
    if (raw == null) return null;

    if (raw.startsWith(BA_CHUNK_MARKER)) {
      const marker = parseBaChunkMarker(raw);
      return marker ? readBetterAuthChunksSync(baseKey, marker) : null;
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
  const previousBaMarker = parseBaChunkMarker(previousRaw);

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

  if (
    previousBaMarker &&
    (previousBaMarker.slot !== null || value.length <= LEGACY_CHUNK_SIZE)
  ) {
    // Slotted keys differ from the legacy-format keys just written above.
    void deleteBaChunks(baseKey, previousBaMarker).catch(() => undefined);
  }
}

export async function readRawSecureValue(baseKey: string) {
  return SecureStore.getItemAsync(baseKey);
}

export async function readChunkedSecureValue(baseKey: string) {
  const raw = await SecureStore.getItemAsync(baseKey);
  if (raw == null) return null;

  if (raw.startsWith(BA_CHUNK_MARKER)) {
    const marker = parseBaChunkMarker(raw);
    return marker ? readBetterAuthChunksAsync(baseKey, marker) : null;
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
  const previousBaMarker = parseBaChunkMarker(previousRaw);

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

  if (
    previousBaMarker &&
    (previousBaMarker.slot !== null || value.length <= LEGACY_CHUNK_SIZE)
  ) {
    await deleteBaChunks(baseKey, previousBaMarker);
  }
}

export async function deleteChunkedSecureValue(baseKey: string) {
  const raw = await SecureStore.getItemAsync(baseKey);
  const legacyCount = parseLegacyChunkCount(raw);
  const baMarker = parseBaChunkMarker(raw);

  await SecureStore.deleteItemAsync(baseKey);

  if (legacyCount) {
    await deleteLegacyChunks(baseKey, legacyCount);
  }

  if (baMarker) {
    await deleteBaChunks(baseKey, baMarker);
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
      if (raw.startsWith(BA_CHUNK_MARKER)) {
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
  getItemAsync: async (key: string): Promise<string | null> => {
    try {
      const raw = await SecureStore.getItemAsync(key);
      if (raw == null || raw.startsWith(BA_CHUNK_MARKER)) return raw;

      const legacyCount = parseLegacyChunkCount(raw);
      if (legacyCount) {
        return (await readLegacyChunksAsync(key, legacyCount)) ?? "{}";
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
  setItemAsync: async (key: string, value: string): Promise<void> => {
    const previousRaw = await SecureStore.getItemAsync(key);
    const previousLegacyCount = parseLegacyChunkCount(previousRaw);
    const previousJoined = await readChunkedSecureValue(key);
    const next = restoreSessionTokenIntoJar(value, previousJoined);
    await SecureStore.setItemAsync(key, next);
    if (previousLegacyCount) {
      await deleteLegacyChunks(key, previousLegacyCount);
    }
  },
};

/** Used for mail vault and other non-Better-Auth oversized secrets. */
export const chunkedSecureStore = {
  getItem: getChunkedSecureValueSync,
  setItem: setChunkedSecureValueSync,
};
