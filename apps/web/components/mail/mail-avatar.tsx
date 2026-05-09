"use client";

import { useEffect, useState } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/ui/avatar";

const LOGO_DEV_TOKEN = "pk_OqzQzTPPQCare5_eo1QArg";

export const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
  "hotmail.co.uk", "outlook.com", "live.com", "icloud.com", "me.com",
  "mac.com", "protonmail.com", "proton.me", "aol.com",
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
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return FALLBACK_PALETTES[h % FALLBACK_PALETTES.length]!;
}

function getInitials(name?: string, email?: string): string {
  const src = name?.trim() || email?.split("@")[0] || "?";
  const parts = src.replace(/[^a-zA-Z\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export function SenderAvatar({ email, name }: { email: string; name?: string }) {
  const domain = emailDomain(email);
  const isPersonal = !domain || PERSONAL_DOMAINS.has(domain);

  const sources = isPersonal ? [] : [
    `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  ];

  const [srcIndex, setSrcIndex] = useState(0);

  useEffect(() => {
    setSrcIndex(0);
  }, [email]);

  const currentSrc = sources[srcIndex] ?? null;
  const initials = getInitials(name, email);
  const [bg, text] = paletteFor(email || name || "?");

  return (
    <Avatar className="h-8 w-8 shrink-0">
      {currentSrc && (
        <AvatarImage
          src={currentSrc}
          alt={domain}
          onError={() => setSrcIndex((i) => i + 1)}
        />
      )}
      <AvatarFallback className={`${bg} ${text} text-[11px] font-semibold select-none`}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
