import { AccountDangerZone } from "./account-settings-danger-zone";
import { AccountMoreLinks } from "./account-settings-more-links";
import { AccountProfileSection } from "./account-settings-profile-section";
import { AccountSecuritySection } from "./account-settings-security-section";
import { PaletteView } from "./palette-ui";

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
    <PaletteView title="Account" onBack={goBack}>
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
    </PaletteView>
  );
}
