import React from "react";
import { SecuritySettingsContent } from "@workspace/native-core/components/settings/sections/SecuritySettingsContent";
import {
  SheetGroup,
  SheetSection,
  SheetSwitchItem,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useMailComposeSettings } from "../../../hooks/use-mail-settings";

export function MailSecuritySettingsContent() {
  const { settings, isLoaded, updateSettings } = useMailComposeSettings();
  return (
    <SecuritySettingsContent>
      <SheetSection title="Signing">
        <SheetGroup>
          <SheetSwitchItem
            icon="pen-tool"
            label="Sign messages with my key"
            detail="Recipients can confirm a message came from you and was not changed. Messages to people outside Solace include your public key, so they can see its fingerprint."
            value={settings.signOutgoingMail}
            disabled={!isLoaded}
            onValueChange={(value) => updateSettings({ signOutgoingMail: value })}
          />
        </SheetGroup>
      </SheetSection>
    </SecuritySettingsContent>
  );
}
