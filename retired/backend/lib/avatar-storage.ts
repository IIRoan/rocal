import {
  SOLACE_AVATAR_UPLOAD_SIZE_PX,
  SOLACE_AVATAR_VARIANT_SIZES,
  type SolaceAvatarVariantSize,
} from "@workspace/calendar-core";
import { env } from "./env";
import { UpstreamServiceError, ValidationError } from "./errors";

const WEBP_QUALITY = 80;

let client: Bun.S3Client | null = null;

/** Private Railway bucket; objects are only ever served through the authenticated API. */
function bucket(): Bun.S3Client {
  const { name, endpoint, region, accessKeyId, secretAccessKey } =
    env.avatarBucket;
  if (!name || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new UpstreamServiceError(
      "Profile picture uploads are not available right now.",
    );
  }
  // Lazy so importing this module never touches the Bun global (Jest runs on Node).
  client ??= new Bun.S3Client({
    accessKeyId,
    secretAccessKey,
    bucket: name,
    endpoint,
    region,
  });
  return client;
}

const objectKey = (avatarId: string, size: SolaceAvatarVariantSize) =>
  `avatars/${avatarId}/${size}.webp`;

async function assertSquareImage(source: Uint8Array): Promise<void> {
  try {
    const { width, height } = await new Bun.Image(source, {
      maxPixels: SOLACE_AVATAR_UPLOAD_SIZE_PX ** 2,
    }).metadata();
    if (width === height) {
      return;
    }
  } catch {
    // Unknown, corrupt, or oversized input; reported below as one validation error.
  }
  throw new ValidationError(
    `Profile picture must be a square JPEG, PNG or WebP image up to ${SOLACE_AVATAR_UPLOAD_SIZE_PX}px.`,
    "image",
  );
}

/** Re-encodes the client's crop into every variant; the uploaded bytes themselves are never stored. */
export async function storeAvatar(
  avatarId: string,
  source: Uint8Array,
): Promise<void> {
  await assertSquareImage(source);
  const s3 = bucket();
  const writes = await Promise.allSettled(
    SOLACE_AVATAR_VARIANT_SIZES.map(async (size) => {
      const bytes = await new Bun.Image(source)
        .resize(size, size, { withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .bytes();
      await s3.write(objectKey(avatarId, size), bytes, { type: "image/webp" });
    }),
  );
  const failure = writes.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

export async function readAvatar(
  avatarId: string,
  size: SolaceAvatarVariantSize,
): Promise<Uint8Array | null> {
  const file = bucket().file(objectKey(avatarId, size));
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if ((error as { code?: unknown }).code === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

export async function deleteAvatar(avatarId: string): Promise<void> {
  const s3 = bucket();
  const deletions = await Promise.allSettled(
    SOLACE_AVATAR_VARIANT_SIZES.map(async (size) => {
      try {
        await s3.unlink(objectKey(avatarId, size));
      } catch (error) {
        if ((error as { code?: unknown }).code !== "NoSuchKey") throw error;
      }
    }),
  );
  const failure = deletions.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
