import React, { useRef, useState } from "react";
import Image from "next/image";
import {
  RotateCcw,
  Check,
  X,
  ArrowLeft,
  AlertTriangle,
  Trash2,
  Lock,
  Loader2,
  ImageIcon,
  Pencil,
  Users,
  Shield,
  ChevronRight,
} from "lucide-react";
import { gsap, useGSAP } from "@workspace/ui/lib/gsap";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";

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

type SectionMessage =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string }
  | null;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  )
    return (error as { message: string }).message.trim() || "Something went wrong.";
  return "Something went wrong.";
}

function AnimatedCollapse({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: React.ReactNode;
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (isOpen && !shouldRender) {
        setShouldRender(true);
        return;
      }

      const el = containerRef.current;
      if (!el) return;

      tweenRef.current?.kill();

      if (prefersReducedMotion) {
        if (isOpen) {
          gsap.set(el, { autoAlpha: 1, height: "auto", overflow: "visible" });
        } else {
          gsap.set(el, { autoAlpha: 0, height: 0, overflow: "hidden" });
          setShouldRender(false);
        }
        return;
      }

      if (isOpen) {
        const targetHeight = el.scrollHeight;
        tweenRef.current = gsap.fromTo(
          el,
          { height: 0, autoAlpha: 0, y: -8, overflow: "hidden" },
          {
            height: targetHeight,
            autoAlpha: 1,
            y: 0,
            duration: 0.22,
            ease: "power2.out",
            overwrite: true,
            onComplete: () =>
              gsap.set(el, { height: "auto", overflow: "visible", clearProps: "y" }),
          },
        );
      } else {
        tweenRef.current = gsap.to(el, {
          height: 0,
          autoAlpha: 0,
          y: -6,
          overflow: "hidden",
          duration: 0.16,
          ease: "power2.in",
          overwrite: true,
          onComplete: () => setShouldRender(false),
        });
      }
    },
    { dependencies: [isOpen, shouldRender] },
  );

  if (!isOpen && !shouldRender) return null;

  return (
    <div ref={containerRef} style={{ height: 0, overflow: "hidden", opacity: 0 }}>
      {children}
    </div>
  );
}

function Avatar({
  name,
  email,
  imageUrl,
  size = "md",
}: {
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const [imgError, setImgError] = useState(false);
  const initial = (name?.trim() || email?.trim() || "S").charAt(0).toUpperCase();
  const sizeClass =
    size === "lg" ? "h-14 w-14 text-base" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  const sizePx = size === "lg" ? 56 : size === "sm" ? 32 : 40;

  if (imageUrl && !imgError) {
    return (
      <Image
        src={imageUrl}
        alt={name ?? "Profile picture"}
        width={sizePx}
        height={sizePx}
        unoptimized
        onError={() => setImgError(true)}
        className={`${sizeClass} shrink-0 rounded-full object-cover ring-1 ring-border/40`}
      />
    );
  }
  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary`}>
      {initial}
    </div>
  );
}

function FieldInput({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
  autoFocus,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="flex h-9 w-full rounded-md bg-input px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}

function InlineMessage({ msg }: { msg: SectionMessage }) {
  if (!msg) return null;
  return (
    <div
      className={`rounded-md px-3 py-2 text-xs ${
        msg.kind === "success" ? "bg-secondary/10 text-secondary-foreground" : "bg-destructive/10 text-destructive"
      }`}
      role={msg.kind === "error" ? "alert" : "status"}
    >
      {msg.text}
    </div>
  );
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
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeSecurityForm, setActiveSecurityForm] = useState<
    "change-password" | "set-password" | "reset-encryption" | null
  >(null);
  const [showAvatarForm, setShowAvatarForm] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(accountImage ?? "");

  const [passwordMessage, setPasswordMessage] = useState<SectionMessage>(null);
  const [profileMessage, setProfileMessage] = useState<SectionMessage>(null);

  const isBusy =
    saving || deletingAccount || changingPassword || settingPassword || resettingEncryptionPassword || updatingProfile;
  const hasOAuthOnlyAccess = hasOAuthAccount && !hasPasswordAccount;
  const isChangePasswordForm = activeSecurityForm === "change-password";
  const isSetPasswordForm = activeSecurityForm === "set-password";
  const isResetEncryptionForm = activeSecurityForm === "reset-encryption";
  const isAnySecurityFormOpen = activeSecurityForm !== null;
  const securityFormBusy = changingPassword || settingPassword || resettingEncryptionPassword;

  const displayName = accountName?.trim() || null;
  const displayEmail = accountEmail?.trim() || null;

  const resetSecurityForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage(null);

    if (!newPassword.trim()) {
      setPasswordMessage({
        kind: "error",
        text: isChangePasswordForm ? "Enter your current password and a new password." : "Enter a new password and confirm it.",
      });
      return;
    }
    if (isChangePasswordForm && !currentPassword.trim()) {
      setPasswordMessage({ kind: "error", text: "Enter your current password and a new password." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ kind: "error", text: "New password and confirmation must match." });
      return;
    }
    try {
      if (isChangePasswordForm) {
        await handleChangePassword({ currentPassword, newPassword });
        setPasswordMessage({
          kind: "success",
          text: "Your email sign-in password has been updated. After email sign-in, Solace will also use it to protect your encryption keys.",
        });
      } else if (isSetPasswordForm) {
        if (!handleSetPassword) throw new Error("Password setup is unavailable.");
        await handleSetPassword({ newPassword });
        setPasswordMessage({
          kind: "success",
          text: "An email sign-in password has been added to your account. OAuth and passkey sign-in still use your separate encryption password unless you reset it below.",
        });
      } else {
        if (!handleResetEncryptionPassword) throw new Error("Encryption password reset is unavailable.");
        await handleResetEncryptionPassword({ newPassword });
        setPasswordMessage({
          kind: "success",
          text: "Your encryption password has been reset for OAuth and passkey sign-in. This keeps your encrypted data intact and only replaces the password used to unlock your encryption keys on new devices.",
        });
      }
      resetSecurityForm();
      setActiveSecurityForm(null);
    } catch (error) {
      setPasswordMessage({ kind: "error", text: getErrorMessage(error) });
    }
  };

  const handleAvatarSave = async () => {
    if (!handleUpdateProfile) return;
    setProfileMessage(null);
    try {
      await handleUpdateProfile({ imageUrl: avatarUrl.trim() });
      setShowAvatarForm(false);
      setProfileMessage({ kind: "success", text: "Profile picture updated." });
    } catch (error) {
      setProfileMessage({ kind: "error", text: getErrorMessage(error) });
    }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "320px", maxHeight: "calc(100dvh - 200px)" }}>
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/50 px-4">
        <button onClick={goBack} className="rounded p-1 transition-colors hover:bg-muted/50">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">Account</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-3 py-1">
            <div className="relative shrink-0">
              <Avatar name={displayName} email={displayEmail} imageUrl={accountImage} size="lg" />
              {handleUpdateProfile ? (
                <button
                  type="button"
                  onClick={() => { setAvatarUrl(accountImage ?? ""); setShowAvatarForm((v) => !v); setProfileMessage(null); }}
                  className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-accent"
                  aria-label="Change profile picture"
                >
                  <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                </button>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              {sessionLoading ? (
                <div className="space-y-1.5">
                  <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                </div>
              ) : (
                <>
                  <p className="truncate text-sm font-medium text-foreground">
                    {displayName ?? displayEmail ?? "Solace account"}
                  </p>
                  {displayEmail ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{displayEmail}</p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {profileMessage && !showAvatarForm ? (
            <div className="mt-2"><InlineMessage msg={profileMessage} /></div>
          ) : null}

          <AnimatedCollapse isOpen={showAvatarForm && !!handleUpdateProfile}>
            <div className="mt-2 mb-1 rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Paste the URL of any publicly accessible image.
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <ImageIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                    disabled={updatingProfile}
                    autoFocus
                    className="flex h-9 w-full rounded-md bg-input pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAvatarSave}
                  disabled={updatingProfile}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {updatingProfile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAvatarForm(false); setProfileMessage(null); }}
                  disabled={updatingProfile}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent/50 disabled:opacity-60"
                  aria-label="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {profileMessage?.kind === "error" ? (
                <p className="mt-2 text-xs text-destructive" role="alert">{profileMessage.text}</p>
              ) : null}
            </div>
          </AnimatedCollapse>
        </div>

        {!onOpenSecurity ? (
          <>
            <div className="px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">Security</div>
            {passwordMessage && !isAnySecurityFormOpen ? (
              <div className="mx-3 mb-1"><InlineMessage msg={passwordMessage} /></div>
            ) : null}
            <div className="px-2 pb-1">
              {hasOAuthAccount ? (
                <div className="mx-1 mb-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                  OAuth and passkey sign-in use a separate encryption password.
                  {hasOAuthOnlyAccess
                    ? " Setting an email password adds email sign-in to this account."
                    : " Your email sign-in password stays separate from that encryption password."}{" "}
                  Resetting the encryption password only replaces the password wrapper around your existing encryption keys; it does not change your OAuth sign-in method.
                </div>
              ) : null}

              {hasPasswordAccount ? (
                <button
                  type="button"
                  onClick={() => { setActiveSecurityForm("change-password"); setPasswordMessage(null); }}
                  disabled={isBusy || isAnySecurityFormOpen}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ display: isAnySecurityFormOpen ? "none" : undefined }}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">Change Password</div>
                    <div className="text-xs text-muted-foreground">Update your email sign-in password. Solace also uses it for encryption after email sign-in.</div>
                  </div>
                </button>
              ) : null}

              {hasOAuthOnlyAccess ? (
                <button
                  type="button"
                  onClick={() => { setActiveSecurityForm("set-password"); setPasswordMessage(null); }}
                  disabled={isBusy || isAnySecurityFormOpen}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ display: isAnySecurityFormOpen ? "none" : undefined }}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">Set Email Password</div>
                    <div className="text-xs text-muted-foreground">Add an email sign-in password to this account. This does not change the separate encryption password used by OAuth or passkey sign-in.</div>
                  </div>
                </button>
              ) : null}

              {hasOAuthAccount ? (
                <button
                  type="button"
                  onClick={() => { setActiveSecurityForm("reset-encryption"); setPasswordMessage(null); }}
                  disabled={isBusy || isAnySecurityFormOpen}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ display: isAnySecurityFormOpen ? "none" : undefined }}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <RotateCcw className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">Reset Encryption Password</div>
                    <div className="text-xs text-muted-foreground">Choose a new encryption password for OAuth or passkey sign-in. This keeps your encrypted data intact and only replaces the password used to unlock your keys on new devices.</div>
                  </div>
                </button>
              ) : null}

              <AnimatedCollapse isOpen={isAnySecurityFormOpen}>
                <form
                  className="mx-1 my-1 rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3"
                  onSubmit={handlePasswordSubmit}
                >
                  <InlineMessage msg={passwordMessage} />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {isChangePasswordForm
                      ? "Update your email sign-in password. After email sign-in, Solace also uses it to protect your encryption keys."
                      : isSetPasswordForm
                        ? "Add an email sign-in password to this account. This gives you an email/password sign-in option without changing the separate encryption password used by OAuth or passkey sign-in."
                        : "Choose a new encryption password for OAuth or passkey sign-in. This only replaces the password wrapper around your existing encryption keys and does not change your OAuth sign-in method."}
                  </p>
                  {isChangePasswordForm ? (
                    <FieldInput label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" disabled={securityFormBusy} autoFocus />
                  ) : null}
                  <FieldInput
                    label={isResetEncryptionForm ? "New encryption password" : "New password"}
                    type="password"
                    value={newPassword}
                    onChange={setNewPassword}
                    autoComplete="new-password"
                    disabled={securityFormBusy}
                    autoFocus={!isChangePasswordForm}
                  />
                  <FieldInput
                    label={isResetEncryptionForm ? "Confirm new encryption password" : "Confirm new password"}
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                    disabled={securityFormBusy}
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={securityFormBusy}
                      className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {securityFormBusy ? (
                        <><Loader2 className="h-3 w-3 animate-spin" />Saving…</>
                      ) : isChangePasswordForm ? "Update Password" : isSetPasswordForm ? "Set Password" : "Reset Encryption Password"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActiveSecurityForm(null); resetSecurityForm(); setPasswordMessage(null); }}
                      disabled={securityFormBusy}
                      className="inline-flex h-8 items-center rounded-md border border-border bg-background px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent/40 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </AnimatedCollapse>
            </div>
          </>
        ) : null}

        {(onOpenInvites || onOpenSecurity) ? (
          <>
            <div className="mt-1 border-t border-border/50 px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">More</div>
            <div className="px-2 pb-1">
              {onOpenSecurity ? (
                <button
                  type="button"
                  onClick={onOpenSecurity}
                  disabled={isBusy}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">Security</div>
                    <div className="text-xs text-muted-foreground">Passkeys &amp; authentication</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </button>
              ) : null}
              {onOpenInvites ? (
                <button
                  type="button"
                  onClick={onOpenInvites}
                  disabled={isBusy}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">Invites</div>
                    <div className="text-xs text-muted-foreground">Invite friends to join Solace</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="mt-1 border-t border-border/50 px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">
          Danger Zone
        </div>
        <div className="px-2 pb-4">
          <div style={{ display: showResetConfirm || showDeleteConfirm ? "none" : undefined }}>
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              disabled={isBusy}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-destructive transition-colors hover:bg-destructive/8 focus:bg-destructive/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                <RotateCcw className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm">Reset to Defaults</div>
                <div className="text-xs text-destructive/70">Restore preferences to their original values.</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isBusy}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-destructive transition-colors hover:bg-destructive/8 focus:bg-destructive/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                <Trash2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm">Delete Account</div>
                <div className="text-xs text-destructive/70">Permanently remove your account and all data.</div>
              </div>
            </button>
          </div>

          <AnimatedCollapse isOpen={showDeleteConfirm}>
            <div className="mx-1 my-1 rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-3">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <span>
                  This permanently deletes your account, calendars, events, categories, subscriptions, passkeys, and settings. This cannot be undone.
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { handleDeleteAccount(); setShowDeleteConfirm(false); }}
                  disabled={isBusy}
                  className="inline-flex h-8 items-center gap-2 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {deletingAccount ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete my account
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          </AnimatedCollapse>

          <AnimatedCollapse isOpen={showResetConfirm}>
            <div className="mx-1 my-1 rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-3">
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <span>This will reset all settings to their default values. This cannot be undone.</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { handleReset(); setShowResetConfirm(false); }}
                  disabled={isBusy}
                  className="inline-flex h-8 items-center gap-2 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <Check className="h-3 w-3" />
                  Yes, reset everything
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          </AnimatedCollapse>
        </div>
      </div>
    </div>
  );
}
