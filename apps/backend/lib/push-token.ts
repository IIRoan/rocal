import { createHash } from "node:crypto";

export function hashPushToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}
