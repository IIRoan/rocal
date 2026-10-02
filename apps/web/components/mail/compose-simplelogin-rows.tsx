"use client";

import { AlertCircle, Shuffle } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import type { SimpleLoginComposeNotice } from "@workspace/calendar-core";

export function ComposeSimpleLoginRequiredFromRow({
  requiredFrom,
  isMobile,
  disabled,
  onSwitch,
}: {
  requiredFrom: NonNullable<SimpleLoginComposeNotice["requiredFrom"]>;
  isMobile: boolean;
  disabled: boolean;
  onSwitch: (identityId: string) => void;
}) {
  return (
    <div
      className={`flex shrink-0 items-center border-b border-border/50 py-1.5 text-xs text-destructive ${
        isMobile ? "gap-2 px-3" : "gap-3 px-4"
      }`}
    >
      <AlertCircle className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{requiredFrom.detail}</span>
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={disabled}
        onClick={() => onSwitch(requiredFrom.identityId)}
      >
        Switch From
      </Button>
    </div>
  );
}

export function ComposeSimpleLoginViaRow({
  via,
  isMobile,
}: {
  via: NonNullable<SimpleLoginComposeNotice["via"]>;
  isMobile: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 items-center border-b border-border/50 py-2 ${
        isMobile ? "gap-2 px-3" : "gap-3 px-4"
      }`}
    >
      <span
        className={`shrink-0 text-xs font-medium text-muted-foreground/60 ${
          isMobile ? "w-10" : "w-14"
        }`}
      >
        Via
      </span>
      <Shuffle
        className="size-3.5 shrink-0 text-muted-foreground"
        strokeWidth={2.25}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-foreground/80">{via.alias}</span>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {via.detail}
        </span>
      </div>
    </div>
  );
}
