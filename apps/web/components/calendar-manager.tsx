"use client";

import { useEffect, useReducer } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { calendarApiService } from "@/lib/calendar-api-service";
import { SUBSCRIPTIONS_QUERY_KEY } from "@workspace/calendar-core";
import { resetCalendarForm } from "./command-palette/calendar-utils";
import type { PaletteView } from "./command-palette/constants";
import {
  calendarFormReducer,
  calendarFormSetters,
  initialCalendarFormState,
} from "./calendar-manager/calendar-form-state";
import { CalendarEditorView } from "./calendar-manager/calendar-editor-view";
import { CalendarListView } from "./calendar-manager/calendar-list-view";

interface CalendarManagerProps {
  onBack: () => void;
  onGoToSubscriptions: (calendarId?: string) => void;
  currentView: PaletteView;
  onNavigateTo: (view: PaletteView) => void;
}

export function CalendarManager({
  onBack,
  onGoToSubscriptions,
  currentView,
  onNavigateTo,
}: CalendarManagerProps) {
  const queryClient = useQueryClient();
  const [form, dispatch] = useReducer(
    calendarFormReducer,
    initialCalendarFormState,
  );

  // Prefetch subscriptions so the synced-calendar edit screen opens populated without a Feed URL flash.
  useEffect(() => {
    void queryClient.prefetchQuery({
      queryKey: SUBSCRIPTIONS_QUERY_KEY,
      queryFn: () => calendarApiService.getSubscriptions(),
    });
  }, [queryClient]);

  if (currentView === "calendars") {
    return (
      <CalendarListView
        onBack={onBack}
        onCreate={() => {
          resetCalendarForm(calendarFormSetters(dispatch));
          onNavigateTo("calendar-create");
        }}
        onEdit={(calendar) => {
          dispatch({ type: "edit", calendar });
          onNavigateTo("calendar-edit");
        }}
        onGoToSubscriptions={onGoToSubscriptions}
        onGoToCategories={() => onNavigateTo("categories")}
      />
    );
  }

  if (currentView === "calendar-create" || currentView === "calendar-edit") {
    return (
      <CalendarEditorView
        mode={currentView === "calendar-create" ? "create" : "edit"}
        form={form}
        dispatch={dispatch}
        onBack={onBack}
      />
    );
  }

  return null;
}
