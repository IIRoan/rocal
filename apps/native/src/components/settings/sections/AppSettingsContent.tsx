import React from "react";
import { SettingsPage } from "../SettingsPage";
import { AppDebugSettingsSection } from "../AppDebugSettingsSection";
import { AppUpdateSettingsSection } from "../AppUpdateSettingsSection";
import { SheetScroll, SheetSection } from "../../sheet/SheetSections";

export function AppSettingsContent() {
  return (
    <SettingsPage title="App">
      <SheetScroll>
        <SheetSection title="Updates">
          <AppUpdateSettingsSection />
        </SheetSection>

        <SheetSection title="Debugging">
          <AppDebugSettingsSection />
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}
