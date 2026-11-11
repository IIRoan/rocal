/** Caches downloaded attachments with the file extension and MIME type share sheets and previews expect. */
import * as FileSystem from "expo-file-system/legacy";
import { Linking, Platform } from "react-native";
import * as Sharing from "expo-sharing";
import { randomUUID } from "expo-crypto";
import { createLogger } from "@workspace/logger";
import {
  createSessionDataStore,
  isSessionDataScopeCurrent,
  type SessionDataScope,
} from "@workspace/native-core/lib/session-data-lifecycle";
import { bytesToBase64, normalizeAttachmentContent } from "./binary-utils";
import {
  buildAttachmentCachePath,
  inferAttachmentMimeType,
} from "./attachment-path";
import type { JmapAttachment } from "./types";
import type { MailRuntime } from "./mail-runtime";
import { MAIL_OFFLINE_SNAPSHOT_FILE } from "./mail-offline-store";

export { buildAttachmentCachePath, inferAttachmentMimeType } from "./attachment-path";

const IOS_UTI_BY_MIME: Record<string, string> = {
  "image/png": "public.png",
  "image/jpeg": "public.jpeg",
  "image/gif": "com.compuserve.gif",
  "image/webp": "org.webmproject.webp",
  "application/pdf": "com.adobe.pdf",
  "text/plain": "public.plain-text",
  "application/json": "public.json",
};

export type CachedAttachment = {
  uri: string;
  mimeType: string;
  fileName: string;
};

/** Viewers and share sheets need decrypted files, so they live only here and the folder is wiped at launch and on sign-out. */
const ATTACHMENT_CACHE_DIRECTORY = `${FileSystem.cacheDirectory ?? ""}mail-attachments/`;

/** Earlier builds wrote decrypted attachments straight into the cache root, where the mailbox snapshot is the only other file this app keeps. */
async function clearLegacyCachedAttachments(): Promise<void> {
  const root = FileSystem.cacheDirectory;
  if (!root) return;
  const names = await FileSystem.readDirectoryAsync(root);
  await Promise.all(
    names
      .filter((name) => name !== MAIL_OFFLINE_SNAPSHOT_FILE)
      .map(async (name) => {
        const info = await FileSystem.getInfoAsync(`${root}${name}`);
        if (info.exists && !info.isDirectory) {
          await FileSystem.deleteAsync(info.uri, { idempotent: true });
        }
      }),
  );
}

const log = createLogger("mail-attachments");
const pendingDeletes = new Set<string>();
const MAX_ATTACHMENT_AGE_MS = 60 * 60 * 1000;
const pending = new Map<string, Promise<CachedAttachment>>();
const cachedByIdentity = new Map<string, CachedAttachment>();
const activeFiles = new Set<string>();
const handoffs = new Set<string>();
const releaseAfterHandoff = new Set<string>();
const externalUntil = new Map<string, number>();
const owners = new WeakMap<CachedAttachment, () => boolean>();

const store = createSessionDataStore(async () => {
  pending.clear();
  cachedByIdentity.clear();
  activeFiles.clear();
  pendingDeletes.clear();
  externalUntil.clear();
  const results = await Promise.allSettled([
    FileSystem.deleteAsync(ATTACHMENT_CACHE_DIRECTORY, { idempotent: true }),
    clearLegacyCachedAttachments(),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Attachment cleanup could not finish. Please retry.");
  }
});

export function clearAttachmentCache(): Promise<void> {
  return store.clear();
}

/** Pruning runs on resume/acquisition; suspension cannot guarantee deletion at an exact wall-clock time. */
export async function pruneAttachmentCache(): Promise<void> {
  const request = store.capture();
  await store.run(request.isCurrent, async () => {
    await Promise.allSettled([...pendingDeletes].map(async (uri) => {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      pendingDeletes.delete(uri);
    }));
    const root = await FileSystem.getInfoAsync(ATTACHMENT_CACHE_DIRECTORY);
    if (!root.exists) return;
    const names = await FileSystem.readDirectoryAsync(
      ATTACHMENT_CACHE_DIRECTORY,
    );
    await Promise.all(
      names.map(async (name) => {
        const uri = `${ATTACHMENT_CACHE_DIRECTORY}${name}`;
        if (activeFiles.has(uri) || (externalUntil.get(uri) ?? 0) > Date.now())
          return;
        const info = await FileSystem.getInfoAsync(uri);
        if (
          info.exists &&
          !info.isDirectory &&
          typeof info.modificationTime === "number" &&
          info.modificationTime * 1000 < Date.now() - MAX_ATTACHMENT_AGE_MS
        ) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      }),
    );
  });
}

export async function writeAttachmentToCache(input: {
  attachment: JmapAttachment;
  cacheKey: string;
  runtime?: Pick<MailRuntime, "session" | "accountId"> & { client: Pick<MailRuntime["client"], "downloadBlob"> };
  scope?: SessionDataScope | null;
}): Promise<CachedAttachment> {
  const request = store.capture();
  const isCurrent = () =>
    request.isCurrent() &&
    (input.scope === undefined || isSessionDataScopeCurrent(input.scope));
  if (!isCurrent()) throw new Error("The mail session ended.");
  const identity = JSON.stringify([
    request.scope?.generation,
    input.runtime?.accountId,
    input.attachment.blobId ?? input.cacheKey,
  ]);
  const existing = pending.get(identity);
  if (existing) return existing;
  const acquire = async (): Promise<CachedAttachment> => {
    await pruneAttachmentCache();
    const previous = cachedByIdentity.get(identity);
    if (previous) {
      const info = await FileSystem.getInfoAsync(previous.uri);
      if (info.exists && isCurrent()) {
        activeFiles.add(previous.uri);
        return previous;
      }
    }
    const fileName = input.attachment.name?.trim() || "attachment";
    const mimeType = inferAttachmentMimeType(fileName, input.attachment.type);
    let bytes: Uint8Array;
    if (input.attachment.content != null) {
      bytes = normalizeAttachmentContent(input.attachment.content);
    } else {
      if (!input.attachment.blobId || !input.runtime)
        throw new Error("Attachment is not available.");
      bytes = await input.runtime.client.downloadBlob(
        input.runtime.session,
        input.attachment.blobId,
        fileName,
        mimeType,
      );
    }
    const localUri = buildAttachmentCachePath(
      randomUUID(),
      fileName,
      mimeType,
      ATTACHMENT_CACHE_DIRECTORY,
    );
    const result = await store.run(isCurrent, async () => {
      await FileSystem.makeDirectoryAsync(ATTACHMENT_CACHE_DIRECTORY, {
        intermediates: true,
      });
      if (!isCurrent()) return undefined;
      await FileSystem.writeAsStringAsync(localUri, bytesToBase64(bytes), {
        encoding: FileSystem.EncodingType.Base64,
      }).catch(async () => {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        throw new Error("Attachment could not be saved.");
      });
      const cached = { uri: localUri, mimeType, fileName };
      owners.set(cached, isCurrent);
      cachedByIdentity.set(identity, cached);
      activeFiles.add(localUri);
      return cached;
    });
    if (!result) throw new Error("The mail session ended.");
    return result;
  };
  const operation = acquire().finally(() => {
    if (pending.get(identity) === operation) pending.delete(identity);
  });
  pending.set(identity, operation);
  return operation;
}

export async function releaseCachedAttachment(
  cached: CachedAttachment,
): Promise<void> {
  activeFiles.delete(cached.uri);
  if (handoffs.has(cached.uri)) {
    releaseAfterHandoff.add(cached.uri);
    return;
  }
  if ((externalUntil.get(cached.uri) ?? 0) > Date.now()) return;
  await store.serialize(async () => {
    await FileSystem.deleteAsync(cached.uri, { idempotent: true }).catch(() => {
      pendingDeletes.add(cached.uri);
      log.warn("Attachment removal will retry on resume");
      throw new Error("Attachment cleanup needs a retry.");
    });
    pendingDeletes.delete(cached.uri);
    for (const [identity, value] of cachedByIdentity)
      if (value.uri === cached.uri) cachedByIdentity.delete(identity);
  });
}

function assertCurrentAttachment(cached: CachedAttachment) {
  if (!owners.get(cached)?.()) throw new Error("The mail session ended.");
}

async function resolveOpenableUri(cached: CachedAttachment): Promise<string> {
  if (Platform.OS === "android") {
    return FileSystem.getContentUriAsync(cached.uri);
  }
  return cached.uri;
}

/** Opens the cached file in the device's default viewer (Photos, PDF reader, etc.). */
export async function openCachedAttachment(
  cached: CachedAttachment,
): Promise<void> {
  assertCurrentAttachment(cached);
  const uri = await resolveOpenableUri(cached);
  try {
    const canOpen = await Linking.canOpenURL(uri);
    if (canOpen) {
      assertCurrentAttachment(cached);
      externalUntil.set(cached.uri, Date.now() + MAX_ATTACHMENT_AGE_MS);
      await Linking.openURL(uri);
      return;
    }
  } catch {
    // Fall back to the share sheet when no default handler is registered.
  }
  await shareCachedAttachment(cached);
}

export async function shareCachedAttachment(
  cached: CachedAttachment,
): Promise<void> {
  assertCurrentAttachment(cached);
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("File sharing is not supported on this device.");
  }

  const uti = IOS_UTI_BY_MIME[cached.mimeType];
  assertCurrentAttachment(cached);
  handoffs.add(cached.uri);
  await Sharing.shareAsync(cached.uri, {
    mimeType: cached.mimeType,
    dialogTitle: cached.fileName,
    ...(Platform.OS === "ios" && uti ? { UTI: uti } : null),
  }).finally(async () => {
    handoffs.delete(cached.uri);
    if (releaseAfterHandoff.delete(cached.uri))
      await releaseCachedAttachment(cached);
  });
}
