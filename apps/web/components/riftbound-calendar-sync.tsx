"use client";

import { useSettings } from "@/hooks/use-settings";
import { useWebRiftboundAutoSync } from "@/hooks/use-riftbound";

export function RiftboundCalendarSync() {
  const { settings } = useSettings();
  useWebRiftboundAutoSync(settings?.riftbound);
  return null;
}
