"use client";

import { Search } from "lucide-react";
import { SettingToggleRow } from "./setting-toggle-row";

export function PrivateSearchIndexToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <SettingToggleRow
      icon={Search}
      label="On-device search index"
      description="Keep encrypted titles of your mail and events, and the start of each message, on this device so older items stay searchable."
      checked={enabled}
      onToggle={onToggle}
    />
  );
}
