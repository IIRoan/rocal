import { ArrowLeft } from "lucide-react";

import { AccountDangerZone } from "./account-settings-danger-zone";
import { AccountMoreLinks } from "./account-settings-more-links";
import { AccountProfileSection } from "./account-settings-profile-section";
import { AccountSecuritySection } from "./account-settings-security-section";

interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
}

interface PasswordOnlyValues {
  newPassword: string;
}

interface UpdateProfileValues {
  name?: string;
  imageUrl?: string;
}

interface AccountSettingsProps {
  goBack: () => void;
  saving: boolean;
  handleReset: () => void;
  deletingAccount: boolean;
  handleDeleteAccount: () => void;
  accountName?: string | null;
  accountEmail?: string | null;
  accountImage?: string | null;
  sessionLoading?: boolean;
  hasPasswordAccount?: boolean;
  hasOAuthAccount?: boolean;
  changingPassword: boolean;
  settingPassword?: boolean;
  resettingEncryptionPassword?: boolean;
  handleChangePassword: (values: ChangePasswordValues) => Promise<void>;
  handleSetPassword?: (values: PasswordOnlyValues) => Promise<void>;
  handleResetEncryptionPassword?: (values: PasswordOnlyValues) => Promise<void>;
  updatingProfile?: boolean;
  handleUpdateProfile?: (values: UpdateProfileValues) => Promise<void>;
  onOpenInvites?: () => void;
  onOpenSecurity?: () => void;
}

export function AccountSettings({
  goBack,
  saving,
  handleReset,
  deletingAccount,
  handleDeleteAccount,
  accountName,
  accountEmail,
  accountImage,
  sessionLoading = false,
  hasPasswordAccount = true,
  hasOAuthAccount = false,
  changingPassword,
  settingPassword = false,
  resettingEncryptionPassword = false,
  handleChangePassword,
  handleSetPassword,
  handleResetEncryptionPassword,
  updatingProfile = false,
  handleUpdateProfile,
  onOpenInvites,
  onOpenSecurity,
}: AccountSettingsProps) {
  const isBusy =
    saving ||
    deletingAccount ||
    changingPassword ||
    settingPassword ||
    resettingEncryptionPassword ||
    updatingProfile;

  const displayName = accountName?.trim() || null;
  const displayEmail = accountEmail?.trim() || null;

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "320px", maxHeight: "calc(100dvh - 200px)" }}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/50 px-4">
        <button
          type="button"
          onClick={goBack}
          className="rounded p-1 transition-colors hover:bg-muted/50"
          aria-label="Back"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">Account</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AccountProfileSection
          displayName={displayName}
          displayEmail={displayEmail}
          accountImage={accountImage}
          sessionLoading={sessionLoading}
          updatingProfile={updatingProfile}
          handleUpdateProfile={handleUpdateProfile}
        />

        {!onOpenSecurity ? (
          <AccountSecuritySection
            isBusy={isBusy}
            hasPasswordAccount={hasPasswordAccount}
            hasOAuthAccount={hasOAuthAccount}
            changingPassword={changingPassword}
            settingPassword={settingPassword}
            resettingEncryptionPassword={resettingEncryptionPassword}
            handleChangePassword={handleChangePassword}
            handleSetPassword={handleSetPassword}
            handleResetEncryptionPassword={handleResetEncryptionPassword}
          />
        ) : null}

        <AccountMoreLinks
          isBusy={isBusy}
          onOpenSecurity={onOpenSecurity}
          onOpenInvites={onOpenInvites}
        />

        <AccountDangerZone
          isBusy={isBusy}
          deletingAccount={deletingAccount}
          handleReset={handleReset}
          handleDeleteAccount={handleDeleteAccount}
        />
      </div>
    </div>
  );
}
