"use client";

import { useState } from "react";
import {
  Avatar,
  AvatarFallback,
} from "@workspace/ui/components/ui/avatar";
import { cn } from "@workspace/ui/lib/utils";

const LOGO_DEV_TOKEN = "pk_OqzQzTPPQCare5_eo1QArg";

export const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
]);

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

const FALLBACK_PALETTES = [
  ["bg-blue-500/15", "text-blue-600 dark:text-blue-400"],
  ["bg-violet-500/15", "text-violet-600 dark:text-violet-400"],
  ["bg-emerald-500/15", "text-emerald-600 dark:text-emerald-400"],
  ["bg-orange-500/15", "text-orange-600 dark:text-orange-400"],
  ["bg-rose-500/15", "text-rose-600 dark:text-rose-400"],
  ["bg-amber-500/15", "text-amber-600 dark:text-amber-400"],
  ["bg-teal-500/15", "text-teal-600 dark:text-teal-400"],
  ["bg-indigo-500/15", "text-indigo-600 dark:text-indigo-400"],
] as const;

function paletteFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++)
    h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return FALLBACK_PALETTES[h % FALLBACK_PALETTES.length]!;
}

function getInitials(name?: string, email?: string): string {
  const src =
    name?.trim() || email?.split("@")[0]?.trim() || email?.trim() || "?";
  const parts = src
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2)
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  const initial = parts[0]?.[0] ?? src.match(/[a-zA-Z0-9]/)?.[0] ?? "?";
  return initial.toUpperCase();
}

function SenderAvatarContent({
  email,
  domain,
  sources,
  initials,
  bg,
  text,
  className,
}: {
  email: string;
  domain: string;
  sources: string[];
  initials: string;
  bg: string;
  text: string;
  className?: string;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const currentSrc = sources[sourceIndex] ?? null;

  return (
    <Avatar className={cn("h-8 w-8 shrink-0", className)}>
      <AvatarFallback
        className={`${bg} ${text} text-[11px] font-semibold select-none`}
      >
        {initials}
      </AvatarFallback>
      {currentSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={currentSrc}
          src={currentSrc}
          alt={`${domain || email} logo`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            loadedSrc === currentSrc ? "block" : "hidden",
          )}
          onLoad={() => setLoadedSrc(currentSrc)}
          onError={() => {
            setLoadedSrc(null);
            setSourceIndex((previous) => previous + 1);
          }}
        />
      )}
    </Avatar>
  );
}

export function SenderAvatar({
  email,
  name,
  className,
}: {
  email: string;
  name?: string;
  className?: string;
}) {
  const domain = emailDomain(email);
  const isPersonal = !domain || PERSONAL_DOMAINS.has(domain);
  const sources = isPersonal
    ? []
    : [
        `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      ];
  const initials = getInitials(name, email);
  const [bg, text] = paletteFor(email || name || "?");

  return (
    <SenderAvatarContent
      key={`${email}:${name ?? ""}`}
      email={email}
      domain={domain}
      sources={sources}
      initials={initials}
      bg={bg}
      text={text}
      className={className}
    />
  );
}
