import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { getErrorMessage, getOutgoingAttachmentSizeError } from "@workspace/calendar-core";
import { bytesToBase64, decodeBase64ToBytes } from "./binary-utils";
import {
  createPendingComposeAttachment,
  INLINE_IMAGE_TYPE,
  type PendingComposeAttachment,
} from "./compose-attachments";
import {
  stripPickedImageMetadata,
  type StrippedImageFile,
} from "./strip-image-metadata";

type PickedFile = { uri: string; name: string; type: string | undefined; size: number };

/** Reads one picked file; its cache copy is plaintext, so it is deleted once read or refused; photos are re-encoded unless `reportStripNotice` is null. */
async function readPickedFile(
  picked: PickedFile,
  maxBytes: number | undefined,
  reportStripNotice: ((notice: string) => void) | null,
): Promise<StrippedImageFile> {
  const readAsset = async () => {
    const sizeError = getOutgoingAttachmentSizeError(picked.name, picked.size, maxBytes);
    if (sizeError) throw new Error(sizeError);
    const base64 = await FileSystem.readAsStringAsync(picked.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const file: StrippedImageFile = {
      name: picked.name,
      type: picked.type,
      bytes: decodeBase64ToBytes(base64),
    };
    return reportStripNotice ? stripPickedImageMetadata(picked.uri, file) : file;
  };
  const { notice, ...file } = await readAsset().finally(() =>
    FileSystem.deleteAsync(picked.uri, { idempotent: true }).catch(() => undefined),
  );
  if (notice) reportStripNotice?.(notice);
  // Re-encoding can grow a photo, so the limit is checked again on what is sent.
  const sizeError = getOutgoingAttachmentSizeError(file.name, file.bytes.length, maxBytes);
  if (sizeError) throw new Error(sizeError);
  return file;
}

/** Picks files to attach; each is checked on its own, so one refused file never drops the others. */
export async function pickComposeAttachments(
  maxBytes: number | undefined,
  reportStripNotice: ((notice: string) => void) | null,
  onAttach: (attachment: PendingComposeAttachment) => void,
  onError: (message: string) => void,
): Promise<void> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled) return;
  for (const asset of result.assets) {
    if (!asset.uri) continue;
    const picked = { uri: asset.uri, name: asset.name ?? "attachment", type: asset.mimeType, size: asset.size ?? 0 };
    // oxlint-disable-next-line react-doctor/async-await-in-loop -- one picked file in memory at a time, attached in the order picked.
    await readPickedFile(picked, maxBytes, reportStripNotice).then(
      (file) => onAttach(createPendingComposeAttachment(file)),
      (err: unknown) => onError(getErrorMessage(err, "Failed to attach file.")),
    );
  }
}

/** Picks a photo from the library for the body, as a data URL; metadata is removed unless `reportStripNotice` is null. */
export async function pickComposePhoto(
  maxBytes: number | undefined,
  reportStripNotice: ((notice: string) => void) | null,
): Promise<{ src: string; alt: string } | null> {
  // Lazy so a JS update on an older binary without this native module fails here, not at launch.
  const ImagePicker = await import("expo-image-picker").catch(() => {
    throw new Error("Update Solace from the App Store to insert a photo.");
  });
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;
  const file = await readPickedFile(
    {
      uri: asset.uri,
      name: asset.fileName ?? "photo.jpg",
      type: asset.mimeType,
      size: asset.fileSize ?? 0,
    },
    maxBytes,
    reportStripNotice,
  );
  const type = file.type ?? "";
  if (!INLINE_IMAGE_TYPE.test(type)) {
    throw new Error("This photo's format can't be shown in a message. Attach it instead.");
  }
  return { src: `data:${type.toLowerCase()};base64,${bytesToBase64(file.bytes)}`, alt: file.name };
}
