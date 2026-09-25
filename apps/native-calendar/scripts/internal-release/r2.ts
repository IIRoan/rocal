import { S3Client } from "bun";
import {
  PROFILES,
  RELEASE_PREFIX,
  objectUrl,
} from "./install-artifacts";

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

export function createClient(): S3Client {
  return new S3Client({
    accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    bucket: requiredEnv("S3_BUCKET"),
    endpoint: requiredEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION?.trim() || "auto",
  });
}

/** Public base gives stable URLs across CI jobs; presigned 7-day URLs are the fallback. */
export function resolveUrl(client: S3Client, key: string): string {
  const base = process.env.S3_PUBLIC_BASE_URL?.trim();
  return base
    ? objectUrl(base, key)
    : client.presign(key, { expiresIn: 60 * 60 * 24 * 7, method: "GET" });
}

/** Keeps at most one artifact per profile under the release prefix for an extension. */
export async function pruneReleaseArtifacts(
  client: S3Client,
  extension: string,
  allowedKeys: Set<string>,
): Promise<string[]> {
  const listed = await client.list({ prefix: RELEASE_PREFIX });
  for (const entry of listed.contents ?? []) {
    const key = entry.key;
    if (!key?.endsWith(extension) || allowedKeys.has(key)) continue;
    await client.delete(key);
    console.log(`Deleted extra artifact ${key}`);
  }

  const remaining =
    (await client.list({ prefix: RELEASE_PREFIX })).contents
      ?.map((entry) => entry.key)
      .filter((key): key is string => Boolean(key?.endsWith(extension)))
      .sort() ?? [];

  if (remaining.length > PROFILES.length) {
    throw new Error(
      `Expected at most ${PROFILES.length} ${extension} artifacts under ${RELEASE_PREFIX}, found ${remaining.join(", ")}`,
    );
  }

  return remaining;
}
