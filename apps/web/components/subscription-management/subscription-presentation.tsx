"use client";

import { getErrorMessage } from "@/lib/calendar-ui-helpers";
import { Badge } from "@workspace/ui/components/ui/badge";
import { Button } from "@workspace/ui/components/ui/button";
import { PaletteViewHeader } from "../command-palette/palette-ui";

import { Alert, AlertDescription } from "@workspace/ui/components/ui/alert";
import type { ComponentProps } from "react";
import type { SubscriptionViewProps } from "./subscription-shared";

export function SubscriptionStatusBadge({
  status,
  lastErrorMessage,
}: {
  status: string;
  lastErrorMessage?: string | null;
}) {
  switch (status) {
    case "success":
      return (
        <Badge
          variant="secondary"
          className="bg-success/15 text-success text-[11px] px-1.5 py-0"
        >
          Synced
        </Badge>
      );
    case "error":
      return (
        <Badge
          variant="destructive"
          title={lastErrorMessage ?? undefined}
          className="text-[11px] px-1.5 py-0"
        >
          Error
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="outline" className="text-[11px] px-1.5 py-0">
          Pending
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[11px] px-1.5 py-0">
          Unknown
        </Badge>
      );
  }
}

export function SubscriptionViewHeader({
  queryError,
  onRetry,
  ...header
}: ComponentProps<typeof PaletteViewHeader> &
  Pick<SubscriptionViewProps, "queryError" | "onRetry">) {
  return (
    <>
      <PaletteViewHeader {...header} />
      {queryError ? (
        <Alert variant="destructive" className="mx-4 my-2 w-auto">
          <AlertDescription>
            {getErrorMessage(queryError, "Failed to load subscriptions")}
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
