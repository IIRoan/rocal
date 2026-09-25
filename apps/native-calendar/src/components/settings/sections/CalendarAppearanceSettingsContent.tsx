import React from "react";
import { AppearanceSettingsContent } from "@workspace/native-core/components/settings/sections/AppearanceSettingsContent";
import {
  SheetGroup,
  SheetItem,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useNativeUserSettings } from "@workspace/native-core/hooks/use-native-user-settings";
import { toNativeCalendarView } from "../../../lib/calendar-views";
import { VIEW_OPTIONS } from "../../../lib/calendar-view-options";

function DefaultViewSection() {
  const { settings, pendingKeys, updateSetting } = useNativeUserSettings();
  const defaultView = toNativeCalendarView(settings?.defaultView ?? "month");
  const viewPending = pendingKeys.has("defaultView");

  return (
    <SheetSection title="Default view">
      <SheetGroup>
        {VIEW_OPTIONS.map((option) => {
          const selected = defaultView === option.value;
          return (
            <SheetItem
              key={option.value}
              icon={option.icon}
              label={option.label}
              checked={selected}
              pending={selected && viewPending}
              onPress={() => updateSetting({ defaultView: option.value })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            />
          );
        })}
      </SheetGroup>
    </SheetSection>
  );
}

export function CalendarAppearanceSettingsContent() {
  return (
    <AppearanceSettingsContent>
      <DefaultViewSection />
    </AppearanceSettingsContent>
  );
}
