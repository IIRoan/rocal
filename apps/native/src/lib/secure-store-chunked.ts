import * as SecureStore from "expo-secure-store";

const SECURE_STORE_CHUNK_SIZE = 1800;

function getChunkKey(baseKey: string, index: number) {
  return `${baseKey}_${index}`;
}

function parseChunkCount(raw: string | null | undefined) {
  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }

  const count = Number.parseInt(raw, 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

function joinChunks(
  baseKey: string,
  chunkCount: number,
  read: (key: string) => string | null,
) {
  const chunks: string[] = [];

  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = read(getChunkKey(baseKey, index));
    if (chunk == null) {
      throw new Error(`Secure store value for ${baseKey} is incomplete.`);
    }

    chunks.push(chunk);
  }

  return chunks.join("");
}

export function getChunkedSecureValueSync(baseKey: string) {
  const raw = SecureStore.getItem(baseKey);
  const chunkCount = parseChunkCount(raw);

  if (!chunkCount) {
    return raw;
  }

  return joinChunks(baseKey, chunkCount, (key) => SecureStore.getItem(key));
}

export function setChunkedSecureValueSync(baseKey: string, value: string) {
  const chunkCount = Math.max(1, Math.ceil(value.length / SECURE_STORE_CHUNK_SIZE));
  SecureStore.setItem(baseKey, String(chunkCount));

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * SECURE_STORE_CHUNK_SIZE;
    const end = start + SECURE_STORE_CHUNK_SIZE;
    SecureStore.setItem(getChunkKey(baseKey, index), value.slice(start, end));
  }
}

export async function readChunkedSecureValue(baseKey: string) {
  const raw = await SecureStore.getItemAsync(baseKey);
  const chunkCount = parseChunkCount(raw);

  if (!chunkCount) {
    return raw;
  }

  const chunks = await Promise.all(
    Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.getItemAsync(getChunkKey(baseKey, index)),
    ),
  );

  if (chunks.some((chunk) => chunk == null)) {
    throw new Error(`Secure store value for ${baseKey} is incomplete.`);
  }

  return chunks.join("");
}

export async function writeChunkedSecureValue(baseKey: string, value: string) {
  const previousChunkCount = parseChunkCount(await SecureStore.getItemAsync(baseKey));
  const chunkCount = Math.max(1, Math.ceil(value.length / SECURE_STORE_CHUNK_SIZE));

  await SecureStore.setItemAsync(baseKey, String(chunkCount));

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * SECURE_STORE_CHUNK_SIZE;
    const end = start + SECURE_STORE_CHUNK_SIZE;
    await SecureStore.setItemAsync(
      getChunkKey(baseKey, index),
      value.slice(start, end),
    );
  }

  if (previousChunkCount && previousChunkCount > chunkCount) {
    await Promise.all(
      Array.from({ length: previousChunkCount - chunkCount }, (_, offset) =>
        SecureStore.deleteItemAsync(getChunkKey(baseKey, chunkCount + offset)),
      ),
    );
  }
}

export async function deleteChunkedSecureValue(baseKey: string) {
  const chunkCount = parseChunkCount(await SecureStore.getItemAsync(baseKey));

  await SecureStore.deleteItemAsync(baseKey);

  if (!chunkCount) {
    return;
  }

  await Promise.all(
    Array.from({ length: chunkCount }, (_, index) =>
      SecureStore.deleteItemAsync(getChunkKey(baseKey, index)),
    ),
  );
}

export const chunkedSecureStore = {
  getItem: getChunkedSecureValueSync,
  setItem: setChunkedSecureValueSync,
};
