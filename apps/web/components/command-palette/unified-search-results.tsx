"use client";

import { useRef } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Mail, MapPin, Paperclip } from "lucide-react";
import type { UnifiedSearchResult } from "@workspace/calendar-core";
import { cn } from "@workspace/ui/lib/utils";
import { gsap, useGSAP } from "@workspace/ui/lib/gsap";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import type { JmapEmailMessage } from "@/lib/mail/types";

type Result = UnifiedSearchResult<JmapEmailMessage>;

type UnifiedSearchResultsProps = {
  results: Result[];
  isLoading: boolean;
  selectedIndex: number;
  baseIndex?: number;
  onSelect: (result: Result) => void;
};

function formatTimestamp(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "MMM d, yyyy");
}

function encryptionLabel(result: Result) {
  switch (result.encryptionStatus) {
    case "encrypted-indexed":
      return "Encrypted";
    case "encrypted-locked":
      return "Locked";
    case "metadata-only":
      return "Metadata";
    case "decrypt-failed":
      return "Decrypt failed";
    default:
      return null;
  }
}

// GSAP animates items from the parent — no inline animation here
function SearchResultRow({
  globalIndex,
  isSelected,
  onSelect,
  result,
}: {
  globalIndex: number;
  isSelected: boolean;
  onSelect: (result: Result) => void;
  result: Result;
}) {
  const timestamp = formatTimestamp(result.timestamp);
  const encryption = encryptionLabel(result);
  const hasAttachment =
    result.source === "mail" && (result.message.attachments?.length ?? 0) > 0;
  const hasLocation =
    result.source === "calendar" && Boolean(result.event.location);
  const subtext =
    result.source === "mail" && result.from
      ? result.from
      : (result.snippet ?? null);

  return (
    <button
      data-index={globalIndex}
      data-source-row={result.source}
      type="button"
      onClick={() => onSelect(result)}
      className={cn(
        "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors focus:outline-none",
        isSelected ? "bg-accent/50" : "hover:bg-accent/35",
      )}
    >
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center text-muted-foreground/70">
        {result.source === "mail" ? (
          <Mail className="size-3.5" />
        ) : (
          <CalendarIcon className="size-3.5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1.5">
          <span className="block truncate text-sm font-medium text-foreground">
            {result.title}
          </span>
          {timestamp ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {timestamp}
            </span>
          ) : null}
        </div>

        {subtext ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {subtext}
          </span>
        ) : null}

        {(encryption || hasAttachment || hasLocation) ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {hasAttachment ? (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
                <Paperclip className="size-2.5" />
                Attachment
              </span>
            ) : null}
            {hasLocation ? (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
                <MapPin className="size-2.5" />
                Location
              </span>
            ) : null}
            {encryption ? (
              <span className="text-[10px] text-muted-foreground/60">
                {encryption}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  );
}


const COL_DURATION = 0.22;

export function UnifiedSearchResults({
  results,
  isLoading,
  selectedIndex,
  baseIndex = 0,
  onSelect,
}: UnifiedSearchResultsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mailSectionRef = useRef<HTMLElement>(null);
  const calSectionRef = useRef<HTMLElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const mailResults = results.filter((r) => r.source === "mail");
  const calendarResults = results.filter((r) => r.source === "calendar");
  const calendarBaseIndex = baseIndex + mailResults.length;
  const hasBoth = mailResults.length > 0 && calendarResults.length > 0;
  const hasOnlyMail = mailResults.length > 0 && calendarResults.length === 0;
  const hasOnlyCalendar = calendarResults.length > 0 && mailResults.length === 0;
  const hasResults = results.length > 0;

  // Stable key: only changes when the actual set of result IDs changes
  const resultKey = results.map((r) => r.id).join(",");

  // Stagger items only when the result IDs actually change (not on selection highlight etc.)
  useGSAP(
    () => {
      const container = containerRef.current;
      if (!container || !hasResults) return;
      const items = container.querySelectorAll<HTMLElement>("[data-source-row]");
      if (!items.length) return;
      if (prefersReducedMotion) {
        gsap.set(items, { clearProps: "all" });
        return;
      }
      gsap.fromTo(
        items,
        { autoAlpha: 0, scale: 0.96, y: 3 },
        {
          autoAlpha: 1,
          scale: 1,
          y: 0,
          duration: 0.11,
          stagger: 0.015,
          ease: "power2.out",
          clearProps: "transform,opacity,visibility",
        },
      );
    },
    { dependencies: [resultKey, hasResults, prefersReducedMotion] },
  );

  // Animate column widths
  useGSAP(
    () => {
      const mailEl = mailSectionRef.current;
      const calEl = calSectionRef.current;
      const dividerEl = dividerRef.current;
      if (!mailEl || !calEl || !dividerEl) return;

      const mailW = hasBoth ? "50%" : hasOnlyMail ? "100%" : "0%";
      const calW = hasBoth ? "50%" : hasOnlyCalendar ? "100%" : "0%";
      const mailOp = hasOnlyCalendar ? 0 : 1;
      const calOp = hasOnlyMail ? 0 : 1;

      if (prefersReducedMotion) {
        gsap.set(mailEl, { width: mailW, opacity: mailOp });
        gsap.set(calEl, { width: calW, opacity: calOp });
        gsap.set(dividerEl, { width: hasBoth ? 1 : 0, opacity: hasBoth ? 1 : 0 });
        return;
      }

      gsap.to(mailEl, { width: mailW, opacity: mailOp, duration: COL_DURATION, ease: "power2.inOut" });
      gsap.to(calEl, { width: calW, opacity: calOp, duration: COL_DURATION, ease: "power2.inOut" });
      gsap.to(dividerEl, { width: hasBoth ? 1 : 0, opacity: hasBoth ? 1 : 0, duration: 0.18, ease: "power2.inOut" });
    },
    { dependencies: [hasBoth, hasOnlyMail, hasOnlyCalendar, prefersReducedMotion] },
  );

  if (isLoading && !hasResults) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2">
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Searching…</span>
      </div>
    );
  }

  if (!hasResults) return null;

  return (
    <div ref={containerRef} className="flex">
      {/* Mail column — always in DOM for smooth width animation */}
      <section
        ref={mailSectionRef}
        data-source-section="messages"
        className="min-w-0 overflow-hidden"
        style={{
          width: hasBoth ? "50%" : hasOnlyMail ? "100%" : "0%",
          opacity: hasOnlyCalendar ? 0 : 1,
        }}
      >
        {mailResults.length > 0 && (
          <>
            {mailResults.map((result, index) => {
              const globalIndex = baseIndex + index;
              return (
                <SearchResultRow
                  key={result.id}
                  globalIndex={globalIndex}
                  isSelected={globalIndex === selectedIndex}
                  onSelect={onSelect}
                  result={result}
                />
              );
            })}
          </>
        )}
      </section>

      {/* Vertical divider */}
      <div
        ref={dividerRef}
        className="shrink-0 bg-border/40"
        style={{
          width: hasBoth ? "1px" : "0px",
          opacity: hasBoth ? 1 : 0,
        }}
      />

      {/* Calendar column — always in DOM for smooth width animation */}
      <section
        ref={calSectionRef}
        data-source-section="calendar"
        className="min-w-0 overflow-hidden"
        style={{
          width: hasBoth ? "50%" : hasOnlyCalendar ? "100%" : "0%",
          opacity: hasOnlyMail ? 0 : 1,
        }}
      >
        {calendarResults.length > 0 && (
          <>
            {calendarResults.map((result, index) => {
              const globalIndex = calendarBaseIndex + index;
              return (
                <SearchResultRow
                  key={result.id}
                  globalIndex={globalIndex}
                  isSelected={globalIndex === selectedIndex}
                  onSelect={onSelect}
                  result={result}
                />
              );
            })}
          </>
        )}
      </section>
    </div>
  );
}

