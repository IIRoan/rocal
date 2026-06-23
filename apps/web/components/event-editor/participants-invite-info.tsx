"use client";

import { useCallback, useRef, useState } from "react";
import { PARTICIPANTS_INVITE_HELP_TEXT } from "@workspace/calendar-core";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { useIsMobile } from "@workspace/ui/hooks";
import { Info } from "lucide-react";

export function ParticipantsInviteInfo() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
  }, [clearCloseTimer]);

  const handlePointerEnter = useCallback(() => {
    if (isMobile) {
      return;
    }

    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer, isMobile]);

  const handlePointerLeave = useCallback(() => {
    if (isMobile) {
      return;
    }

    scheduleClose();
  }, [isMobile, scheduleClose]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="About participant invitations"
          aria-expanded={open}
          className="tap-target inline-flex items-center justify-center size-5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 transition-colors"
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          <Info className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="z-[100] w-72 max-w-[calc(100dvw-2rem)] px-3 py-2 text-xs leading-snug"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        {PARTICIPANTS_INVITE_HELP_TEXT}
      </PopoverContent>
    </Popover>
  );
}
