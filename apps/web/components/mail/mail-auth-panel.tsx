"use client";

import { Inbox, Loader2 } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import type { AuthMode } from "@/hooks/use-mail-app";

export interface MailAuthPanelProps {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  mailboxEmail: string;
  accountEmail: string;
  accountDisplayName: string;
  signupPassword: string;
  setSignupPassword: (v: string) => void;
  signupPasswordConfirm: string;
  setSignupPasswordConfirm: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  isBusy: boolean;
  isMailboxStatusLoading: boolean;
  isAutoOpeningMailbox: boolean;
  mailboxProvisioned: boolean;
  onSignIn: () => void;
  onSignUp: () => void;
  configLoaded: boolean;
}

export function MailAuthPanel({
  authMode,
  setAuthMode,
  mailboxEmail,
  accountEmail,
  accountDisplayName,
  signupPassword,
  setSignupPassword,
  signupPasswordConfirm,
  setSignupPasswordConfirm,
  loginPassword,
  setLoginPassword,
  isBusy,
  isMailboxStatusLoading,
  isAutoOpeningMailbox,
  mailboxProvisioned,
  onSignIn,
  onSignUp,
  configLoaded,
}: MailAuthPanelProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">
            {authMode === "sign-in" ? "Open your mailbox" : "Create your mailbox"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {authMode === "sign-in"
              ? "Sign in with your Solace account password to access your encrypted mailbox."
              : "Provision a secure mailbox tied to your Solace account identity."}
          </p>
        </div>

        <div className="flex gap-1 rounded-lg bg-muted/60 p-1 mb-5">
          {(["sign-in", "sign-up"] as AuthMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                authMode === mode
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground/80"
              }`}
              onClick={() => setAuthMode(mode)}
              disabled={isMailboxStatusLoading}
            >
              {mode === "sign-in" ? "Sign in" : "Create mailbox"}
            </button>
          ))}
        </div>

        {isMailboxStatusLoading ? (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Checking mailbox status…</p>
          </div>
        ) : isAutoOpeningMailbox ? (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Opening your mailbox…</p>
          </div>
        ) : authMode === "sign-in" ? (
          <div className="space-y-3">
            <Input type="email" value={mailboxEmail} readOnly className="bg-muted/40 opacity-70" placeholder="Mailbox email" />
            <Input
              id="login-password" type="password"
              value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Account password"
              onKeyDown={(e) => e.key === "Enter" && onSignIn()}
              disabled={isBusy}
            />
            {!mailboxProvisioned && (
              <p className="text-xs text-muted-foreground">No mailbox found. Switch to Create mailbox to provision one.</p>
            )}
            <Button className="w-full" onClick={onSignIn} disabled={isBusy || !configLoaded || !mailboxProvisioned || !mailboxEmail}>
              <Inbox size={15} />
              {isBusy ? "Opening…" : "Open mailbox"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Input type="text" value={accountDisplayName || accountEmail} readOnly className="bg-muted/40 opacity-70" placeholder="Display name" />
            <Input type="email" value={accountEmail} readOnly className="bg-muted/40 opacity-70" placeholder="Email address" />
            <Input
              id="signup-password" type="password"
              value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)}
              placeholder="Account password" disabled={isBusy}
            />
            <Input
              id="signup-password-confirm" type="password"
              value={signupPasswordConfirm} onChange={(e) => setSignupPasswordConfirm(e.target.value)}
              placeholder="Confirm password"
              onKeyDown={(e) => e.key === "Enter" && onSignUp()}
              disabled={isBusy}
            />
            {mailboxProvisioned && (
              <p className="text-xs text-muted-foreground">A mailbox already exists for this account. Sign in instead.</p>
            )}
            <Button className="w-full" onClick={onSignUp} disabled={isBusy || !configLoaded || !accountEmail || Boolean(mailboxProvisioned)}>
              {isBusy ? "Provisioning…" : "Create mailbox"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
