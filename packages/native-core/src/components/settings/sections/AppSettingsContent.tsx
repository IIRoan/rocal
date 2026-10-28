import React from "react";
import { SettingsPage } from "../SettingsPage";
import { AppDebugSettingsSection } from "../AppDebugSettingsSection";
import { AppUpdateSettingsSection } from "../AppUpdateSettingsSection";
import { AppInformationSettingsSection } from "../AppInformationSettingsSection";
import { SheetScroll, SheetSection } from "../../sheet/SheetSections";
import { SHOW_DEBUG_TOOLS } from "../../../lib/constants";

export function AppSettingsContent() {
  return (
    <SettingsPage title="App">
      <SheetScroll>
        <AppInformationSettingsSection />
        <SheetSection title="Updates">
          <AppUpdateSettingsSection />
        </SheetSection>

        {SHOW_DEBUG_TOOLS ? (
          <SheetSection title="Debugging">
            <AppDebugSettingsSection />
          </SheetSection>
        ) : null}
      </SheetScroll>
    </SettingsPage>
  );
}
