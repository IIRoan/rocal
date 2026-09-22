"use client";

import type { ComponentType } from "react";
import { ShieldCheck } from "lucide-react";
import { ToggleIndicator } from "../command-palette/setting-toggle-row";
import { PaletteIconBox } from "../command-palette/palette-ui";
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
    <div className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 sm:min-h-9">
      <PaletteIconBox>
        <Icon className="size-4" />
      </PaletteIconBox>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-[130%] text-foreground">{label}</div>
        <div className="text-[13px] leading-[130%] text-muted-foreground">
          {description}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${label}: ${checked ? "on" : "off"}`}
        onClick={() => onCheckedChange(!checked)}
        className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ToggleIndicator checked={checked} />
      </button>
    </div>
  );
}
