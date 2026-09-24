"use client";

import { Mail, Tag } from "lucide-react";
import {
  DEFAULT_SUB_ADDRESS_DELIMITER,
  resolveMailIdentityBadge,
  shouldShowIdentityNameBadge,
  type MailIdentityRef,
} from "@workspace/calendar-core";
import { cn } from "@workspace/ui/lib/utils";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

type MailIdentityBadgeProps = {
  message: JmapEmailMessage;
  identities: MailIdentityRef[];
  compact?: boolean;
  subAddressDelimiter?: string;
  className?: string;
};

export function MailIdentityBadge({
  message,
  identities,
  compact = false,
  subAddressDelimiter = DEFAULT_SUB_ADDRESS_DELIMITER,
  className,
}: MailIdentityBadgeProps) {
  const info = resolveMailIdentityBadge(message, identities, {
    subAddressDelimiter,
  });
  if (!info) return null;

  const { displayTag, matchingIdentity } = info;
  const showIdentityName = shouldShowIdentityNameBadge(info);

  if (compact) {
    if (displayTag) {
      return (
        <SimpleTooltip content={`Sub-address tag: ${displayTag}`}>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary",
              className,
            )}
          >
            <Tag className="size-3" strokeWidth={2.25} />
            <span className="font-mono">
              {subAddressDelimiter}
              {displayTag}
            </span>
          </span>
        </SimpleTooltip>
      );
    }

    if (showIdentityName && matchingIdentity?.name) {
      return (
        <SimpleTooltip content={matchingIdentity.name}>
          <span
            className={cn(
              "inline-flex max-w-[100px] items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground",
              className,
            )}
          >
            <Mail className="size-3 shrink-0" strokeWidth={2.25} />
            <span className="truncate">{matchingIdentity.name}</span>
          </span>
        </SimpleTooltip>
      );
    }

    return null;
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {displayTag ? (
        <SimpleTooltip content={`Sub-address tag: ${displayTag}`}>
          <span
            className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
          >
            <Tag className="size-3" strokeWidth={2.25} />
            <span className="font-mono">
              {subAddressDelimiter}
              {displayTag}
            </span>
          </span>
        </SimpleTooltip>
      ) : null}
      {showIdentityName && matchingIdentity?.name ? (
        <SimpleTooltip content={matchingIdentity.name}>
          <span
            className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            <Mail className="size-3" strokeWidth={2.25} />
            <span>via {matchingIdentity.name}</span>
          </span>
        </SimpleTooltip>
      ) : null}
    </span>
  );
}
