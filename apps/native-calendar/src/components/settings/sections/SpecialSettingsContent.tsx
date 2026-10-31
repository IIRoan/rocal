import React from "react";
import { settingsSectionPath } from "@workspace/calendar-core";
import {
  SettingsPage,
  useSettingsNavigator,
} from "@workspace/native-core/components/settings/SettingsPage";
import {
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";

export function SpecialSettingsContent() {
  const navigate = useSettingsNavigator();
  return (
    <SettingsPage title="Special">
      <SheetScroll>
        <SheetSection>
          <SheetGroup>
            <SheetItem
              icon="award"
              label="Riftbound"
              detail="Import events from your frequent stores"
              chevron
              onPress={() => navigate(settingsSectionPath("riftbound"))}
            />
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}
