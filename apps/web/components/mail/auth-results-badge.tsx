"use client";

import { ShieldCheck, ShieldX, Shield } from "lucide-react";
import { DropdownPanel } from "@workspace/ui/solace";
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
      ? "text-success"
      : tone === "fail"
        ? "text-destructive"
        : "text-muted-foreground";

  const summary = formatAuthResultsSummary(results, { simpleLoginForward });

  return (
    <DropdownPanel
      align="start"
      trigger={
        <button
          type="button"
          className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-sm after:absolute after:-inset-[5px] ${color}`}
          aria-label={`Authentication results: ${summary.join(", ")}`}
        >
          <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
        </button>
      }
    >
      <div className="flex flex-col gap-1 p-3">
        <p className="text-sm font-medium leading-tight text-[var(--text-primary)]">
          Authentication results
        </p>
        {summary.map((line) => (
          <p key={line} className="text-xs leading-snug text-[var(--text-secondary)]">
            {line}
          </p>
        ))}
      </div>
    </DropdownPanel>
  );
}
