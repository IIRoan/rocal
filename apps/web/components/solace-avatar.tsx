"use client";

import { BlobatarAvatar } from "@workspace/ui/components/ui/blobatar-avatar";
import {
  isSolaceProfileAvatarUrl,
  resolveSolaceProfileAvatarUrl,
} from "@workspace/calendar-core";
import { useSolaceProfileImage } from "@/hooks/use-solace-profile-image";
import { getApiBaseUrl } from "@/lib/api-url";

export function SolaceAvatar({
  email,
  name,
  src,
  className,
  title,
  animate,
}: {
  email?: string | null;
  name?: string | null;
  src?: string | null;
  className?: string;
  title?: string;
  animate?: "hover" | "always";
}) {
  const resolvedSrc = resolveSolaceProfileAvatarUrl(src, getApiBaseUrl());
  const lookedUp = useSolaceProfileImage(email, { enabled: !resolvedSrc });
  const displaySrc = resolvedSrc || lookedUp;

  return (
    <BlobatarAvatar
      email={email}
      name={name}
      src={displaySrc}
      className={className}
      title={title}
      animate={animate}
      crossOrigin={
        isSolaceProfileAvatarUrl(displaySrc) ? "use-credentials" : undefined
      }
    />
  );
}
