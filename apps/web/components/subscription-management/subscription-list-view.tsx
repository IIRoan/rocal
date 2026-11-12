"use client";

import type { CalendarSubscription } from "@/lib/types/calendar";
import {
  getColorSwatchValue,
  useCalendarContext,
} from "@workspace/ui/components/calendar";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";
import {
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { PaletteView } from "../command-palette/constants";

import {
  SubscriptionStatusBadge,
  SubscriptionViewHeader,
} from "./subscription-presentation";
import type { SubscriptionViewProps } from "./subscription-shared";

export function SubscriptionListView({
  subscriptions,
  onBack: goBackToMain,
  onEdit: handleOpenEdit,
  onNavigateTo: goToSubView,
  isLoadingSubscriptions,
  syncMutation,
  queryError,
  onRetry,
}: SubscriptionViewProps & {
  onEdit: (subscription: CalendarSubscription) => void;
  onNavigateTo: (view: PaletteView) => void;
  isLoadingSubscriptions: boolean;
}) {
  const { toggleCalendarVisibility, isCalendarVisible } = useCalendarContext();
  const publicHolidaySubscriptions = subscriptions.filter(
    (subscription) => subscription.calendar.kind === "public_holiday",
  );
  const readOnlyCalendars = subscriptions
    .map((subscription) => ({ subscription }))
    .sort((left, right) => {
      if (left.subscription.calendar.kind !== right.subscription.calendar.kind)
        return left.subscription.calendar.kind === "public_holiday" ? -1 : 1;
      return left.subscription.calendar.name.localeCompare(
        right.subscription.calendar.name,
      );
    });
  const handleSyncSubscription = (subscription: CalendarSubscription) =>
    syncMutation.mutate(subscription.id);
  return (
    <>
      <SubscriptionViewHeader
        queryError={queryError}
        onRetry={onRetry}
        title="Subscriptions"
        onBack={goBackToMain}
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-2 text-[13px] font-medium text-muted-foreground">
          Actions
        </div>
        <div className="p-1">
          <button
            type="button"
            onClick={() => goToSubView("subscriptions-add-feed")}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-hover/30 outline-none focus-visible:bg-hover/50 focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <Plus className="size-4 text-muted-foreground shrink-0" />
            <span className="text-[15px] leading-[130%]">
              Add External Feed
            </span>
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground/40 shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => goToSubView("subscriptions-holidays")}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-hover/30 outline-none focus-visible:bg-hover/50 focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <Globe className="size-4 text-muted-foreground shrink-0" />
            <span className="text-[15px] leading-[130%] flex-1">
              Browse Holiday Calendars
            </span>
            {publicHolidaySubscriptions.length > 0 && (
              <span className="text-xs text-muted-foreground shrink-0">
                {publicHolidaySubscriptions.length} added
              </span>
            )}
            <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
          </button>
          <button
            type="button"
            onClick={() => goToSubView("subscriptions-import-ics")}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-hover/30 outline-none focus-visible:bg-hover/50 focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-pointer"
          >
            <FileText className="size-4 text-muted-foreground shrink-0" />
            <span className="text-[15px] leading-[130%]">Import .ics File</span>
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground/40 shrink-0" />
          </button>
        </div>

        <div className="px-4 py-2 text-[13px] font-medium text-muted-foreground border-t border-border/50 mt-1">
          Synced Calendars
          {readOnlyCalendars.length > 0 && (
            <span className="ml-1">· {readOnlyCalendars.length}</span>
          )}
        </div>

        {isLoadingSubscriptions ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : readOnlyCalendars.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No synced calendars yet.
          </div>
        ) : (
          <div className="p-1">
            {readOnlyCalendars.map(({ subscription }) => {
              const isHoliday = subscription.calendar.kind === "public_holiday";
              return (
                <div
                  key={subscription.id}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-md hover:bg-hover/20 group"
                >
                  <div
                    className="size-3.5 rounded-sm shrink-0"
                    style={{
                      backgroundColor: getColorSwatchValue(
                        subscription.calendar.color,
                      ),
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(subscription)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="text-[15px] leading-[130%] truncate">
                      {subscription.calendar.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {isHoliday ? (
                        <Globe className="size-3 text-muted-foreground/50 shrink-0" />
                      ) : (
                        <Link2 className="size-3 text-muted-foreground/50 shrink-0" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {isHoliday ? "Holiday" : "External feed"}
                      </span>
                      {!isHoliday && (
                        <SubscriptionStatusBadge
                          status={subscription.lastSyncStatus}
                          lastErrorMessage={subscription.lastErrorMessage}
                        />
                      )}
                      {!isCalendarVisible(subscription.calendar.id) && (
                        <span className="text-xs text-muted-foreground">
                          · Hidden
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <SimpleTooltip
                      content={
                        isCalendarVisible(subscription.calendar.id)
                          ? "Hide calendar"
                          : "Show calendar"
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          toggleCalendarVisibility(subscription.calendar.id)
                        }
                        aria-label={
                          isCalendarVisible(subscription.calendar.id)
                            ? "Hide calendar"
                            : "Show calendar"
                        }
                        className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground"
                      >
                        {isCalendarVisible(subscription.calendar.id) ? (
                          <Eye className="size-3.5" />
                        ) : (
                          <EyeOff className="size-3.5" />
                        )}
                      </button>
                    </SimpleTooltip>
                    {!isHoliday && (
                      <SimpleTooltip content="Sync now">
                        <button
                          type="button"
                          onClick={() => handleSyncSubscription(subscription)}
                          disabled={syncMutation.isPending}
                          aria-label="Sync now"
                          className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground"
                        >
                          <RefreshCw
                            className={`size-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`}
                          />
                        </button>
                      </SimpleTooltip>
                    )}
                    <SimpleTooltip content="Edit">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(subscription)}
                        aria-label="Edit"
                        className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground"
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                    </SimpleTooltip>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
