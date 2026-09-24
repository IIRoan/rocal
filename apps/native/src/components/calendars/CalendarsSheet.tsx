import React from "react";
import { BottomSheet } from "../BottomSheet";
import { SheetPageStack, SheetSubPage, useSheetPageStack } from "../sheet/SheetPageStack";
import { CALENDARS_ROOT_PAGE, parseCalendarsSheetPage } from "../../lib/calendars-sheet-pages";
import { CalendarsListPage } from "./CalendarsListPage";
import { CalendarCreatePage } from "./CalendarCreatePage";
import { CalendarEditPage } from "./CalendarEditPage";
import { SubscriptionCreatePage } from "./SubscriptionCreatePage";
import { SubscriptionEditPage } from "./SubscriptionEditPage";

interface CalendarsSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

/** Calendars drawer: owned and read-only calendars, with create/edit pages in-sheet. */
export function CalendarsSheet({ visible, onDismiss }: CalendarsSheetProps) {
  const pageStack = useSheetPageStack(CALENDARS_ROOT_PAGE, visible);

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onCloseComplete={pageStack.reset}
      snapPoints={[0.92]}
    >
      <SheetPageStack
        state={pageStack}
        renderPage={(pageId) => <CalendarsSheetContent pageId={pageId} />}
      />
    </BottomSheet>
  );
}

/** One calendars page with its chrome; `rootBackLabel` adds a back button when the list is nested in another drawer. */
export function CalendarsSheetContent({
  pageId,
  rootBackLabel,
}: {
  pageId: string;
  rootBackLabel?: string;
}) {
  const page = parseCalendarsSheetPage(pageId);
  switch (page.kind) {
    case "root":
      return (
        <SheetSubPage title="Calendars" backLabel={rootBackLabel}>
          <CalendarsListPage />
        </SheetSubPage>
      );
    case "calendar-create":
      return (
        <SheetSubPage title="New calendar" backLabel="Back to calendars">
          <CalendarCreatePage />
        </SheetSubPage>
      );
    case "calendar-edit":
      return (
        <SheetSubPage title="Edit calendar" backLabel="Back to calendars">
          <CalendarEditPage id={page.id} />
        </SheetSubPage>
      );
    case "subscription-create":
      return (
        <SheetSubPage title="Add read-only calendar" backLabel="Back to calendars">
          <SubscriptionCreatePage />
        </SheetSubPage>
      );
    case "subscription-edit":
      return (
        <SheetSubPage title="Read-only calendar" backLabel="Back to calendars">
          <SubscriptionEditPage id={page.id} />
        </SheetSubPage>
      );
  }
}
