"use client";

import type { CalendarSubscription } from "@/lib/types/calendar";
import { findNationalHolidayCalendarByUrl } from "@workspace/calendar-ics";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";
import { toast } from "@workspace/ui/lib/toast";
import { AlertTriangle, Copy, Globe, RefreshCw } from "lucide-react";

import { formatLastSync } from "./subscription-shared";

export function HolidaySubscriptionInfo({
  subscription: editingSubscriptionData,
}: {
  subscription: CalendarSubscription;
}) {
  const holidayInfo = findNationalHolidayCalendarByUrl(
    editingSubscriptionData.url,
  );
  return (
    <div className="px-4 pb-4 border-t border-border/50 pt-3">
      <div className="rounded-md border border-border/50 bg-muted/20 p-3 space-y-2">
        <div className="flex items-start gap-2.5">
          <Globe className="size-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="text-sm font-medium">
              {holidayInfo?.countryName ||
                editingSubscriptionData.calendar.name}
              {holidayInfo?.language ? (
                <span className="text-muted-foreground font-normal">
                  {" \u00b7 "}
                  {holidayInfo.language}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Public holidays are read-only and refresh automatically in the
              background. Last synced{" "}
              {formatLastSync(editingSubscriptionData.lastSyncAt ?? undefined)}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
export function SubscriptionSyncInfo({
  subscription: editingSubscriptionData,
  loading,
  syncPending,
  onSync: handleSyncSubscription,
}: {
  subscription: CalendarSubscription | null;
  loading: boolean;
  syncPending: boolean;
  onSync: (subscription: CalendarSubscription) => void;
}) {
  return (
    <>
      <div className="px-4 py-2 text-[13px] font-medium text-muted-foreground border-t border-border/50 mt-1">
        Sync
      </div>
      <div className="p-1">
        <button
          type="button"
          onClick={() =>
            editingSubscriptionData &&
            handleSyncSubscription(editingSubscriptionData)
          }
          disabled={loading || !editingSubscriptionData}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-hover/30 outline-none focus-visible:bg-hover/50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <RefreshCw
            className={`size-4 text-muted-foreground shrink-0 ${
              syncPending ? "animate-spin" : ""
            }`}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] leading-[130%]">Sync now</div>
            <div className="text-[13px] leading-[130%] text-muted-foreground">
              {editingSubscriptionData
                ? `Last synced ${formatLastSync(
                    editingSubscriptionData.lastSyncAt ?? undefined,
                  )}`
                : "Loading sync info\u2026"}
            </div>
          </div>
        </button>
      </div>

      {editingSubscriptionData?.lastErrorMessage && (
        <div className="mx-4 mb-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
            <span className="break-words">
              {editingSubscriptionData.lastErrorMessage}
            </span>
          </p>
        </div>
      )}

      <div className="px-4 py-2 text-[13px] font-medium text-muted-foreground border-t border-border/50 mt-1">
        Source
      </div>
      <div className="px-4 pb-3 space-y-1.5">
        <Label
          htmlFor="subscription-feed-url"
          className="text-xs text-muted-foreground"
        >
          Feed URL
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="subscription-feed-url"
            value={editingSubscriptionData?.url ?? ""}
            placeholder={editingSubscriptionData ? undefined : "Loading\u2026"}
            readOnly
            className="h-8 text-xs font-mono"
          />
          <SimpleTooltip content="Copy URL">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (!editingSubscriptionData) return;
                try {
                  await navigator.clipboard.writeText(
                    editingSubscriptionData.url,
                  );
                  toast.success("Feed URL copied to clipboard");
                } catch {
                  toast.error(
                    "Unable to copy the feed URL. Select it and copy it manually.",
                  );
                }
              }}
              disabled={!editingSubscriptionData}
              className="h-8 px-2"
              aria-label="Copy URL"
            >
              <Copy className="size-3.5" />
            </Button>
          </SimpleTooltip>
        </div>
      </div>
    </>
  );
}
