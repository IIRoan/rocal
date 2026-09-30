"use client";

import type { ComponentType } from "react";
import { ShieldCheck } from "lucide-react";
import { SettingToggleRow } from "../command-palette/setting-toggle-row";
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
    <SettingToggleRow
      checked={checked}
      icon={Icon}
      label={label}
      description={description}
      onToggle={() => onCheckedChange(!checked)}
    />
  );
}
