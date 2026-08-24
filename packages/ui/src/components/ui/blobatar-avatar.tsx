"use client";

import { Blobatar } from "@blobatar/react";
import "blobatar/motion.css";

import { cn } from "@workspace/ui/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

/** Softer silhouettes; gaze biased right toward row content in LTR layouts. */
const EMAIL_BLOBATAR_TRAITS = {
  shape: [0.11, 0.35, 0.54, 0.933],
  "gaze.x": [0.72, 0.85, 0.95],
  "eye.lean": [0.6, 0.75, 0.9],
};

function blobatarName(
  email?: string | null,
  name?: string | null,
): string {
  return email?.trim() || name?.trim() || "unknown";
}

export function BlobatarAvatar({
  email,
  name,
  src,
  className,
  title,
  animate,
  crossOrigin,
}: {
  email?: string | null;
  name?: string | null;
  src?: string | null;
  className?: string;
  title?: string;
  /** Hover for sidebar/profile; omit in dense lists (static `<img>`). */
  animate?: "hover" | "always";
  crossOrigin?: "" | "anonymous" | "use-credentials";
}) {
  const seed = blobatarName(email, name);
  const label = title ?? name ?? email ?? undefined;

  return (
    <Avatar className={cn("size-8 shrink-0", className)}>
      {src ? (
        <AvatarImage
          src={src}
          alt={label ?? "Avatar"}
          referrerPolicy="no-referrer"
          {...(crossOrigin ? { crossOrigin } : {})}
        />
      ) : null}
      <AvatarFallback className="bg-transparent">
        <Blobatar
          name={seed}
          traits={EMAIL_BLOBATAR_TRAITS}
          animate={animate}
          title={label}
          className="size-full"
        />
      </AvatarFallback>
    </Avatar>
  );
}
