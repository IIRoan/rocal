"use client";

import { ShieldCheck, ShieldX, Shield } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import {
  formatAuthResultsSummary,
  getTrustedAuthResultsHeader,
  hasAuthResults,
  parseAuthResults,
  resolveAuthBadgeTone,
  type MailAuthResultsFields,
} from "@workspace/calendar-core";

export function AuthResultsBadge({
  message,
  simpleLoginForward = false,
}: {
  message: MailAuthResultsFields;
  simpleLoginForward?: boolean;
}) {
  const results = parseAuthResults(getTrustedAuthResultsHeader(message));
  if (!hasAuthResults(results)) return null;

  const tone = resolveAuthBadgeTone(results);
  const Icon = tone === "pass" ? ShieldCheck : tone === "fail" ? ShieldX : Shield;
  const color =
    tone === "pass"
      ? "text-green-600 dark:text-green-500"
      : tone === "fail"
        ? "text-destructive"
        : "text-muted-foreground";

  const tooltipText = formatAuthResultsSummary(results, { simpleLoginForward });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex shrink-0 items-center ${color}`} aria-label="Authentication results">
          <Icon className="size-3.5" strokeWidth={2.25} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="space-y-0.5">
          {tooltipText.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
