import React from "react";
import { Key, Shield } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import { usePrivateSearchIndexControls } from "@/hooks/use-private-search-index-controls";
import { PasswordSection } from "./password-section";
import { PrivateSearchIndexToggle } from "./private-search-index-toggle";
import { EVENT_ENCRYPTION_HINT } from "@workspace/calendar-core";
import {
  PaletteIconBox,
  PaletteNavRow,
  PaletteSection,
  PaletteView,
} from "./palette-ui";

interface SecuritySettingsProps {
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: () => void;
  goForward: (view: string) => void;
  hasPasswordAccount?: boolean;
  hasOAuthAccount?: boolean;
  changingPassword?: boolean;
  settingPassword?: boolean;
  resettingEncryptionPassword?: boolean;
  handleChangePassword?: (v: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  handleSetPassword?: (v: { newPassword: string }) => Promise<void>;
  handleResetEncryptionPassword?: (v: { newPassword: string }) => Promise<void>;
}

export function SecuritySettings({
  localSettings,
  goBack,
  goForward,
  hasPasswordAccount = false,
  hasOAuthAccount = false,
  changingPassword = false,
  settingPassword = false,
  resettingEncryptionPassword = false,
  handleChangePassword,
  handleSetPassword,
  handleResetEncryptionPassword,
}: SecuritySettingsProps) {
  const privateSearchIndex = usePrivateSearchIndexControls();
  const showPasswordSection = hasPasswordAccount || hasOAuthAccount;

  return (
    <PaletteView title="Security" onBack={goBack}>
      <PaletteSection label="Event Encryption">
        <div className="flex items-start gap-3 p-2">
          <PaletteIconBox>
            <Shield className="size-4" />
          </PaletteIconBox>
          <div className="min-w-0">
            <div className="text-[15px] leading-[130%] text-foreground">
              Event Encryption
            </div>
            <div className="text-[13px] leading-[130%] text-muted-foreground">
              {EVENT_ENCRYPTION_HINT}
            </div>
          </div>
        </div>
      </PaletteSection>

      <PaletteSection label="Search">
        <PrivateSearchIndexToggle
          enabled={privateSearchIndex.enabled}
          onToggle={
            privateSearchIndex.enabled
              ? privateSearchIndex.disable
              : privateSearchIndex.enable
          }
        />
      </PaletteSection>

      <PaletteSection label="Authentication">
        <PaletteNavRow
          icon={Key}
          label="Passkeys"
          description="Manage passwordless authentication"
          onClick={() => goForward("passkeys")}
        />
      </PaletteSection>

      {showPasswordSection && handleChangePassword ? (
        <PaletteSection label="Password">
          <PasswordSection
            hasPasswordAccount={hasPasswordAccount}
            hasOAuthAccount={hasOAuthAccount}
            changingPassword={changingPassword}
            settingPassword={settingPassword}
            resettingEncryptionPassword={resettingEncryptionPassword}
            handleChangePassword={handleChangePassword}
            handleSetPassword={handleSetPassword}
            handleResetEncryptionPassword={handleResetEncryptionPassword}
          />
        </PaletteSection>
      ) : null}
    </PaletteView>
  );
}
