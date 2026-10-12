"use client";

import { BlobatarAvatar } from "@workspace/ui/components/ui/blobatar-avatar";

export function AccountAvatar({
  name,
  email,
  imageUrl,
  size = "md",
  onImageLoadedChange,
}: {
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  onImageLoadedChange?: (loaded: boolean) => void;
}) {
  const sizeClass =
    size === "lg" ? "size-14" : size === "sm" ? "size-8" : "size-10";

  return (
    <BlobatarAvatar
      email={email}
      name={name}
      src={imageUrl}
      className={sizeClass}
      title={name || email || undefined}
      animate="hover"
      onImageLoadedChange={onImageLoadedChange}
    />
  );
}
