"use client";

import { normalizeSubscriptionFeedUrl } from "@workspace/calendar-ics";
import { getColorSwatchValue } from "@workspace/ui/components/calendar";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { CircleX, Search } from "lucide-react";
import { useState } from "react";

import { SubscriptionViewHeader } from "./subscription-presentation";
import type { SubscriptionViewProps } from "./subscription-shared";
import {
  filterHolidayCalendars,
  type HolidayCalendar,
} from "./subscription-shared";

export function HolidayCalendarsView({
  subscriptions,
  onBack: goBackToMain,
  onDelete: handleDeleteSubscription,
  loading,
  createMutation,
  queryError,
  onRetry,
}: SubscriptionViewProps) {
  const [holidaySearch, setHolidaySearch] = useState("");
  const normalizeSubscriptionUrl = normalizeSubscriptionFeedUrl;
  const subscriptionByNormalizedUrl = new Map(
    subscriptions.map((subscription) => [
      normalizeSubscriptionUrl(subscription.url),
      subscription,
    ]),
  );
  const filteredHolidayCalendars = filterHolidayCalendars(holidaySearch);
  const handleCreateHolidayCalendar = (holidayCalendar: HolidayCalendar) =>
    createMutation.mutate({
      name: holidayCalendar.label,
      url: holidayCalendar.url,
      color: holidayCalendar.defaultColor,
    });
  return (
    <>
      <SubscriptionViewHeader
        queryError={queryError}
        onRetry={onRetry}
        title="Holiday Calendars"
        onBack={goBackToMain}
      />
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
        <Search className="size-3.5 text-muted-foreground/50 shrink-0" />
        <Input
          value={holidaySearch}
          onChange={(e) => setHolidaySearch(e.target.value)}
          placeholder="Search country or language…"
          aria-label="Search holiday calendars"
          className="-ml-2 h-7 rounded-md border-0 bg-transparent px-2 text-sm placeholder:text-muted-foreground/60 focus-visible:bg-hover/40 focus-visible:ring-0"
          autoComplete="off"
        />
        {holidaySearch && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setHolidaySearch("")}
            className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
          >
            <CircleX className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {filteredHolidayCalendars.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No calendars match your search.
          </div>
        ) : (
          filteredHolidayCalendars.map((hc) => {
            const normalizedUrl = normalizeSubscriptionUrl(hc.url);
            const existingSub = subscriptionByNormalizedUrl.get(normalizedUrl);
            return (
              <div
                key={hc.id}
                className="flex items-center gap-3 px-4 py-2 hover:bg-hover/20 transition-colors"
              >
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{
                    backgroundColor: getColorSwatchValue(
                      existingSub?.calendar.color ?? hc.defaultColor,
                    ),
                  }}
                />
                <span className="text-[15px] leading-[130%] flex-1 truncate">
                  {hc.label}
                </span>
                {existingSub ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="secondary"
                      className="text-[11px] bg-accent/10 text-accent px-1.5 py-0 h-auto"
                    >
                      Added
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      disabled={loading}
                      onClick={() => handleDeleteSubscription(existingSub)}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    disabled={loading}
                    onClick={() => handleCreateHolidayCalendar(hc)}
                    className="h-7 px-2 text-xs shrink-0"
                  >
                    Add
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
