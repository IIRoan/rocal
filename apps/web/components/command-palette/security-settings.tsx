import React from "react";
import { Key, ChevronRight, ArrowLeft, Shield } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import { PasswordSection } from "./password-section";

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
  const showPasswordSection = hasPasswordAccount || hasOAuthAccount;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          onClick={() => goBack()}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">Security</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
          Event Encryption
        </div>
        <div className="p-1">
          <div className="flex items-start gap-3 rounded-md px-3 py-2">
            <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-sm">Event Encryption</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Event title, description, and location stay ciphertext-only.
                Reminder emails remain available but only include timing
                details.
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
          Authentication
        </div>
        <div className="p-1">
          <button
            type="button"
            onClick={() => goForward("passkeys")}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
          >
            <Key className="size-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm">Passkeys</div>
              <div className="text-xs text-muted-foreground">
                Manage passwordless authentication
              </div>
            </div>
            <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
          </button>
        </div>

        {showPasswordSection && handleChangePassword ? (
          <>
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
              Password
            </div>
            <div className="px-1 pb-2">
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
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
