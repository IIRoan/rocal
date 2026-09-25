import type { JmapAttachmentInput } from "./jmap-client";

export type PendingComposeAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
};

export function createPendingComposeAttachment(input: {
  name: string;
  type?: string | null;
  bytes: Uint8Array;
}): PendingComposeAttachment {
  return {
    id: `${input.name}:${input.bytes.byteLength}:${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim() || "attachment",
    type: input.type?.trim() || "application/octet-stream",
    size: input.bytes.byteLength,
    bytes: input.bytes,
  };
}

export function toJmapAttachmentInput(
  pending: PendingComposeAttachment,
  blobId: string,
): JmapAttachmentInput {
  return {
    blobId,
    name: pending.name,
    type: pending.type,
    size: pending.size,
  };
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}
