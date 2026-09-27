import React from "react";
import { BottomSheet } from "@workspace/native-core/components/BottomSheet";
import {
  SheetPageStack,
  type SheetPageStackState,
} from "@workspace/native-core/components/sheet/SheetPageStack";
import { CalendarsSheetContent } from "../calendars/CalendarsSheet";

/** Calendars drawer opened from the palette; the caller owns the page stack so it can open straight onto a sub-page. */
export function PaletteCalendarsSheet({
  visible,
  pageStack,
  onDismiss,
}: {
  visible: boolean;
  pageStack: SheetPageStackState;
  onDismiss: () => void;
}) {
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
