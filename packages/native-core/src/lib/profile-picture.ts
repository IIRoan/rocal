import { SOLACE_AVATAR_UPLOAD_SIZE_PX } from "@workspace/calendar-core";

/** Returns a square base64 JPEG, or null when the user cancels; re-encoding drops EXIF such as location. */
export async function pickProfilePicture(): Promise<string | null> {
  // Lazy so a JS update on an older binary without these native modules fails here, not at launch.
  const [ImagePicker, { ImageManipulator, SaveFormat }, FileSystem] =
    await Promise.all([
      import("expo-image-picker"),
      import("expo-image-manipulator"),
      import("expo-file-system/legacy"),
    ]).catch(() => {
      throw new Error("Update Solace from the App Store to upload a photo.");
    });

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) {
    return null;
  }

  const temporaryUris = new Set([asset.uri]);
  try {
    const side = Math.min(asset.width, asset.height);
    const size = Math.min(side, SOLACE_AVATAR_UPLOAD_SIZE_PX);
    const image = await ImageManipulator.manipulate(asset.uri)
      .crop({
        originX: (asset.width - side) / 2,
        originY: (asset.height - side) / 2,
        width: side,
        height: side,
      })
      .resize({ width: size, height: size })
      .renderAsync();
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.92,
      base64: true,
    });
    temporaryUris.add(saved.uri);
    return saved.base64 ?? null;
  } finally {
    const cleanup = await Promise.allSettled(
      [...temporaryUris]
        .filter(
          (uri) =>
            FileSystem.cacheDirectory &&
            uri.startsWith(FileSystem.cacheDirectory),
        )
        .map((uri) => FileSystem.deleteAsync(uri, { idempotent: true })),
    );
    const failure = cleanup.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}
