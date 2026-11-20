import { useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  formatQuickAddSummary,
  parseQuickAdd,
  resolveTimeFormat,
  resolveTimezone,
  type QuickAddResult,
} from "@workspace/calendar-core";
import { Button } from "@workspace/ui/components/ui/button";

import type { UserSettings } from "@/lib/types/calendar";

/** Offers the date and time typed into a new event's title; nothing changes until it is pressed. */
export function QuickAddSuggestion({
  localSettings,
  onApply,
  title,
}: {
  localSettings: UserSettings | null | undefined;
  onApply: (result: QuickAddResult) => void;
  title: string;
}) {
  const [now] = useState(() => new Date());
  const timezone = resolveTimezone(localSettings?.timezone);
  const result = parseQuickAdd(title, {
    now,
    timezone,
    defaultDurationMinutes: localSettings?.defaultEventDuration ?? 60,
  });

  return (
    <div aria-live="polite">
      {result ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onApply(result)}
          className="-mx-2 h-8 max-w-[calc(100%+1rem)] justify-start text-accent"
        >
          <CalendarClock aria-hidden="true" />
          <span className="truncate">
            Use{" "}
            {formatQuickAddSummary(
              result,
              timezone,
              resolveTimeFormat(localSettings?.timeFormat),
            )}
          </span>
        </Button>
      ) : null}
    </div>
  );
}
