"use client";

import { useCalendarData } from "@/hooks/use-calendar-data";
import {
  useCreateSubscriptionMutation,
  useDeleteSubscriptionMutation,
  useSubscriptions,
  useSyncSubscriptionMutation,
  useUpdateSubscriptionMutation,
} from "@/hooks/use-subscriptions";
import type { CalendarSubscription } from "@/lib/types/calendar";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { useState } from "react";
import type { PaletteView } from "./command-palette/constants";
import { IcsImportPanel } from "./ics-import-panel";

import type { ReactNode } from "react";
import { AddFeedView } from "./subscription-management/add-feed-view";
import { HolidayCalendarsView } from "./subscription-management/holiday-calendars-view";
import { SubscriptionDeleteDialog } from "./subscription-management/subscription-delete-dialog";
import { SubscriptionEditView } from "./subscription-management/subscription-edit-view";
import { SubscriptionListView } from "./subscription-management/subscription-list-view";
import type {
  PendingSubscriptionDeletion,
  SubscriptionViewProps,
} from "./subscription-management/subscription-shared";
interface SubscriptionManagementProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onBack?: () => void;
  currentView: PaletteView;
  onNavigateTo: (view: PaletteView) => void;
  initialEditCalendarId?: string;
}

export function SubscriptionManagement({
  open,
  onOpenChange,
  onBack,
  currentView,
  onNavigateTo,
  initialEditCalendarId,
}: SubscriptionManagementProps) {
  const { calendars, refetchCalendars } = useCalendarData();
  const {
    data: subscriptions = [],
    isLoading: isLoadingSubscriptions,
    error: queryError,
    refetch,
  } = useSubscriptions(open);
  const [internalEditCalendarId, setInternalEditCalendarId] = useState<
    string | undefined
  >(undefined);
  const [pendingDelete, setPendingDelete] =
    useState<PendingSubscriptionDeletion>(null);
  const goBackToMain = () => onBack?.();
  const editTargetCalendarId = initialEditCalendarId ?? internalEditCalendarId;
  const createMutation = useCreateSubscriptionMutation({
    refetchCalendars,
    onCreated: goBackToMain,
  });
  const deleteMutation = useDeleteSubscriptionMutation({
    refetchCalendars,
    onDeleted: () => {
      if (currentView === "subscriptions-edit") goBackToMain();
    },
  });
  const syncMutation = useSyncSubscriptionMutation({
    refetchCalendars,
    subscriptions,
  });
  const updateMutation = useUpdateSubscriptionMutation({
    refetchCalendars,
    onUpdated: goBackToMain,
  });
  const loading =
    isLoadingSubscriptions ||
    createMutation.isPending ||
    deleteMutation.isPending ||
    syncMutation.isPending ||
    updateMutation.isPending;
  const onEdit = (subscription: CalendarSubscription) => {
    setInternalEditCalendarId(subscription.calendar.id);
    onNavigateTo("subscriptions-edit");
  };
  const onDelete = (subscription: CalendarSubscription) =>
    setPendingDelete({ id: subscription.id, name: subscription.name });
  const onRetry = () => {
    void refetch().catch(() => undefined);
  };
  const common: SubscriptionViewProps = {
    calendars,
    subscriptions,
    refetchCalendars,
    onBack: goBackToMain,
    onDelete,
    loading,
    queryError,
    onRetry,
    createMutation,
    updateMutation,
    syncMutation,
  };
  let view: ReactNode = null;
  switch (currentView) {
    case "subscriptions":
      view = (
        <SubscriptionListView
          {...common}
          isLoadingSubscriptions={isLoadingSubscriptions}
          onEdit={onEdit}
          onNavigateTo={onNavigateTo}
        />
      );
      break;
    case "subscriptions-add-feed":
      view = <AddFeedView {...common} />;
      break;
    case "subscriptions-holidays":
      view = <HolidayCalendarsView {...common} />;
      break;
    case "subscriptions-import-ics":
      view = <IcsImportPanel calendars={calendars} onBack={goBackToMain} />;
      break;
    case "subscriptions-edit":
      if (editTargetCalendarId)
        view = (
          <SubscriptionEditView
            key={editTargetCalendarId}
            {...common}
            calendarId={editTargetCalendarId}
          />
        );
      break;
  }
  const content = (
    <div
      className="flex flex-col"
      style={{ minHeight: "360px", maxHeight: "calc(100dvh - 200px)" }}
    >
      {view}
    </div>
  );
  const deleteConfirmDialog = (
    <SubscriptionDeleteDialog
      pendingDelete={pendingDelete}
      setPendingDelete={setPendingDelete}
      onConfirm={deleteMutation.mutate}
    />
  );
  if (onOpenChange) {
    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent
            variant="spotlight"
            showClose={false}
            aria-describedby={undefined}
            className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[520px]"
          >
            <VisuallyHidden>
              <DialogTitle>Calendar Subscriptions</DialogTitle>
            </VisuallyHidden>
            {content}
          </DialogContent>
        </Dialog>
        {deleteConfirmDialog}
      </>
    );
  }

  return (
    <>
      {content}
      {deleteConfirmDialog}
    </>
  );
}
