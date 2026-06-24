"use client";

import type { ComponentType } from "react";
import { ShieldCheck } from "lucide-react";
import { ToggleIndicator } from "../command-palette/setting-toggle-row";
import { TRUSTED_SENDER_DESCRIPTION } from "@/lib/mail/mail-display-settings";

export function TrustedSenderSwitchRow({
  checked,
  onCheckedChange,
  label = "Trusted sender",
  description = TRUSTED_SENDER_DESCRIPTION,
  icon: Icon = ShieldCheck,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${label}: ${checked ? "on" : "off"}`}
        onClick={() => onCheckedChange(!checked)}
        className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ToggleIndicator checked={checked} />
      </button>
    </div>
  );
}
