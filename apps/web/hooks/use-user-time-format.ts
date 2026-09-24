import { resolveTimeFormat, type TimeFormat } from "@workspace/calendar-core";
import { useSettings } from "./use-settings";

export function useUserTimeFormat(): TimeFormat {
  return resolveTimeFormat(useSettings().settings?.timeFormat);
}
