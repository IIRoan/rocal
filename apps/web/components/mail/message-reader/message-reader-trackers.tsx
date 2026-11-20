"use client";

import { useState } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import {
  getMailTrackerNotice,
  type EmailTrackerSummary,
} from "@workspace/calendar-core";
import { DropdownPanel } from "@workspace/ui/solace";
import { cn } from "@workspace/ui/lib/utils";

export function MessageReaderTrackerLine({
  trackers,
  isMobile,
}: {
  trackers: EmailTrackerSummary;
  isMobile: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (trackers.count === 0) return null;
  const notice = getMailTrackerNotice(trackers);

  return (
    <div className="flex shrink-0 border-b border-[var(--border-tertiary)] px-4 py-1.5">
      <DropdownPanel
        open={open}
        onOpenChange={setOpen}
        align="start"
        width={320}
        trigger={
          <button
            type="button"
            className={cn(
              "-my-0.5 flex min-w-0 max-w-full cursor-pointer items-center gap-1 self-start py-0.5 text-muted-foreground transition-colors hover:text-accent",
              isMobile ? "text-[11px]" : "text-xs",
            )}
          >
            <ShieldCheck
              className="size-3 shrink-0"
              strokeWidth={2.25}
              aria-hidden
            />
            <span className="truncate">{notice.label}</span>
            <ChevronRight
              className="size-3 shrink-0"
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
        }
      >
        <p className="px-3 pt-3 pb-2 text-[15px] font-medium text-[var(--text-primary)]">
          {notice.label}
        </p>
        <div className="flex flex-col gap-px border-t border-[var(--border-tertiary)] p-1">
          <ul className="flex flex-col gap-px">
            {trackers.hosts.map((host) => (
              <li
                key={host}
                className="truncate px-2 py-1 text-sm text-[var(--text-primary)]"
              >
                {host}
              </li>
            ))}
          </ul>
          <p className="px-2 pt-1 pb-1.5 text-xs leading-snug text-[var(--text-tertiary)]">
            {notice.detail}
          </p>
        </div>
      </DropdownPanel>
    </div>
  );
}
