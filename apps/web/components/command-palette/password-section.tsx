"use client";

import { useState } from "react";
import { Lock, RotateCcw, Loader2 } from "lucide-react";

interface PasswordSectionProps {
  hasPasswordAccount: boolean;
  hasOAuthAccount: boolean;
  changingPassword: boolean;
  settingPassword: boolean;
  resettingEncryptionPassword: boolean;
  handleChangePassword: (v: { currentPassword: string; newPassword: string }) => Promise<void>;
  handleSetPassword?: (v: { newPassword: string }) => Promise<void>;
  handleResetEncryptionPassword?: (v: { newPassword: string }) => Promise<void>;
}

export function PasswordSection({
  hasPasswordAccount,
  hasOAuthAccount,
  changingPassword,
  settingPassword,
  resettingEncryptionPassword,
  handleChangePassword,
  handleSetPassword,
  handleResetEncryptionPassword,
}: PasswordSectionProps) {
  const [activeForm, setActiveForm] = useState<"change" | "set" | "reset" | null>(null);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const hasOAuthOnlyAccess = hasOAuthAccount && !hasPasswordAccount;
  const isBusy = changingPassword || settingPassword || resettingEncryptionPassword;
  const isFormOpen = activeForm !== null;

  const reset = () => { setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); setMsg(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!newPwd.trim()) { setMsg({ kind: "error", text: "Enter a new password." }); return; }
    if (activeForm === "change" && !currentPwd.trim()) { setMsg({ kind: "error", text: "Enter your current password." }); return; }
    if (newPwd !== confirmPwd) { setMsg({ kind: "error", text: "Passwords do not match." }); return; }
    try {
      if (activeForm === "change") await handleChangePassword({ currentPassword: currentPwd, newPassword: newPwd });
      else if (activeForm === "set") await handleSetPassword?.({ newPassword: newPwd });
      else await handleResetEncryptionPassword?.({ newPassword: newPwd });
      setMsg({ kind: "success", text: "Password updated." });
      reset();
      setActiveForm(null);
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    }
  };

  if (!hasPasswordAccount && !hasOAuthOnlyAccess && !hasOAuthAccount) return null;

  return (
    <div>
      {msg && !isFormOpen ? (
        <div className={`mx-2 mb-1 rounded-md px-3 py-2 text-xs ${msg.kind === "success" ? "bg-secondary/10 text-secondary-foreground" : "bg-destructive/10 text-destructive"}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</div>
      ) : null}
      {!isFormOpen ? (
        <>
          {hasPasswordAccount ? (
            <button type="button" onClick={() => { setActiveForm("change"); setMsg(null); }} disabled={isBusy} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors disabled:opacity-60">
              <div className="flex items-center justify-center w-6 h-6 shrink-0"><Lock className="h-4 w-4 text-muted-foreground" /></div>
              <div className="flex-1 min-w-0"><div className="text-sm">Change Password</div><div className="text-xs text-muted-foreground">Update your email sign-in password</div></div>
            </button>
          ) : null}
          {hasOAuthOnlyAccess ? (
            <button type="button" onClick={() => { setActiveForm("set"); setMsg(null); }} disabled={isBusy} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors disabled:opacity-60">
              <div className="flex items-center justify-center w-6 h-6 shrink-0"><Lock className="h-4 w-4 text-muted-foreground" /></div>
              <div className="flex-1 min-w-0"><div className="text-sm">Set Email Password</div><div className="text-xs text-muted-foreground">Add an email sign-in password</div></div>
            </button>
          ) : null}
          {hasOAuthAccount ? (
            <button type="button" onClick={() => { setActiveForm("reset"); setMsg(null); }} disabled={isBusy} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors disabled:opacity-60">
              <div className="flex items-center justify-center w-6 h-6 shrink-0"><RotateCcw className="h-4 w-4 text-muted-foreground" /></div>
              <div className="flex-1 min-w-0"><div className="text-sm">Reset Encryption Password</div><div className="text-xs text-muted-foreground">Replace the password for OAuth / passkey sign-in keys</div></div>
            </button>
          ) : null}
        </>
      ) : (
        <form className="mx-1 my-1 rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2.5" onSubmit={(e) => void handleSubmit(e)}>
          {msg ? <div className={`rounded-md px-3 py-2 text-xs ${msg.kind === "success" ? "bg-secondary/10 text-secondary-foreground" : "bg-destructive/10 text-destructive"}`}>{msg.text}</div> : null}
          {activeForm === "change" ? (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Current password</span>
              <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" disabled={isBusy} autoFocus className="flex h-9 w-full rounded-md bg-input px-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 disabled:opacity-50" />
            </label>
          ) : null}
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{activeForm === "reset" ? "New encryption password" : "New password"}</span>
            <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" disabled={isBusy} autoFocus={activeForm !== "change"} className="flex h-9 w-full rounded-md bg-input px-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 disabled:opacity-50" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{activeForm === "reset" ? "Confirm new encryption password" : "Confirm new password"}</span>
            <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} autoComplete="new-password" disabled={isBusy} className="flex h-9 w-full rounded-md bg-input px-3 text-sm outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 disabled:opacity-50" />
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={isBusy} className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {activeForm === "change" ? "Update Password" : activeForm === "set" ? "Set Password" : "Reset Password"}
            </button>
            <button type="button" onClick={() => { setActiveForm(null); reset(); }} disabled={isBusy} className="inline-flex h-8 items-center rounded-md border border-border bg-background px-4 text-xs font-medium text-foreground hover:bg-accent/40 disabled:opacity-60">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
