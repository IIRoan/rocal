/**
 * Cache downloaded mail attachments with correct file extensions and MIME types
 * so iOS/Android share sheets and WebView previews recognise the file format.
 */
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

export async function writeAttachmentToCache(input: {
  attachment: JmapAttachment;
  cacheKey: string;
  runtime?: MailRuntime;
}): Promise<CachedAttachment> {
  const fileName = input.attachment.name?.trim() || "attachment";
  const mimeType = inferAttachmentMimeType(fileName, input.attachment.type);
  const localUri = buildAttachmentCachePath(
    input.cacheKey,
    fileName,
    mimeType,
    FileSystem.cacheDirectory ?? "",
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

