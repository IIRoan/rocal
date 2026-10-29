/** Caches downloaded attachments with the file extension and MIME type share sheets and previews expect. */
import * as FileSystem from "expo-file-system/legacy";
import { Linking, Platform } from "react-native";
import * as Sharing from "expo-sharing";
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

export async function clearAttachmentCache(): Promise<void> {
  await Promise.all([
    FileSystem.deleteAsync(ATTACHMENT_CACHE_DIRECTORY, { idempotent: true }),
    // Sign-out must finish its other wipes; a leftover file is retried at the next launch.
    clearLegacyCachedAttachments().catch(() => undefined),
  ]);
}

export async function writeAttachmentToCache(input: {
  attachment: JmapAttachment;
  cacheKey: string;
  runtime?: MailRuntime;
}): Promise<CachedAttachment> {
  const fileName = input.attachment.name?.trim() || "attachment";
  const mimeType = inferAttachmentMimeType(fileName, input.attachment.type);
  await FileSystem.makeDirectoryAsync(ATTACHMENT_CACHE_DIRECTORY, {
    intermediates: true,
  });
  const localUri = buildAttachmentCachePath(
    input.cacheKey,
    fileName,
    mimeType,
    ATTACHMENT_CACHE_DIRECTORY,
  );

  if (input.attachment.content != null) {
    const bytes = normalizeAttachmentContent(input.attachment.content);
    const base64 = bytesToBase64(bytes);
    await FileSystem.writeAsStringAsync(localUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { uri: localUri, mimeType, fileName };
  }

  if (!input.attachment.blobId || !input.runtime) {
    throw new Error("Attachment is not available.");
  }

  const bytes = await input.runtime.client.downloadBlob(
    input.runtime.session,
    input.attachment.blobId,
    fileName,
    mimeType,
  );
  const base64 = bytesToBase64(bytes);
  await FileSystem.writeAsStringAsync(localUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return { uri: localUri, mimeType, fileName };
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
  const uri = await resolveOpenableUri(cached);
  try {
    const canOpen = await Linking.canOpenURL(uri);
    if (canOpen) {
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
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("File sharing is not supported on this device.");
  }

  const uti = IOS_UTI_BY_MIME[cached.mimeType];
  await Sharing.shareAsync(cached.uri, {
    mimeType: cached.mimeType,
    dialogTitle: cached.fileName,
    ...(Platform.OS === "ios" && uti ? { UTI: uti } : null),
  });
}

