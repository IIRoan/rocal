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
      description="Off until you enable it. Keep an encrypted index on this device. Mail search covers only indexed messages and excerpts."
      checked={enabled}
      onToggle={onToggle}
    />
  );
}
