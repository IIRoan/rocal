"use client";

import { ShieldCheck, ShieldAlert, ShieldX, Shield } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import {
  normalizeJmapHeaderValues,
  parseAuthResults,
  type MailAuthResult,
} from "@/lib/mail/types";

export function AuthResultsBadge({
  authResultsHeaders,
}: {
  authResultsHeaders?: unknown;
}) {
  const headers = normalizeJmapHeaderValues(authResultsHeaders);
  if (headers.length === 0) return null;

  const results = parseAuthResults(headers);

  // If all are "none", don't show anything
  if (results.spf === "none" && results.dkim === "none" && results.dmarc === "none") {
    return null;
  }

  const allPass = results.spf === "pass" && results.dkim === "pass";
  const anyFail = results.spf === "fail" || results.dkim === "fail" || results.dmarc === "fail";

  const Icon = allPass ? ShieldCheck : anyFail ? ShieldX : Shield;
  const color = allPass
    ? "text-green-600 dark:text-green-500"
    : anyFail
      ? "text-destructive"
      : "text-muted-foreground";

  const tooltipText = buildTooltipText(results);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex shrink-0 items-center ${color}`} aria-label="Authentication results">
          <Icon className="size-3.5" strokeWidth={2.25} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <div className="space-y-0.5">
          {tooltipText.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function buildTooltipText(results: MailAuthResult): string[] {
  const lines: string[] = [];
  if (results.spf !== "none") {
    lines.push(`SPF: ${results.spf}`);
  }
  if (results.dkim !== "none") {
    lines.push(`DKIM: ${results.dkim}`);
  }
  if (results.dmarc !== "none") {
    lines.push(`DMARC: ${results.dmarc}`);
  }
  return lines.length > 0 ? lines : ["No authentication data"];
}
