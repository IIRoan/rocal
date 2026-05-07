"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@workspace/logger";
import { Inbox, Lock, MailPlus, RefreshCcw, Send, ShieldCheck, UserRoundPlus } from "lucide-react";
import { useSession } from "../../lib/auth-client";
import { peekCachedAuthPassword } from "../../lib/e2ee-password-cache";
import { bootstrapMailboxForAccount } from "../../lib/mail/account-bootstrap";
import { mailDemoApiService } from "../../lib/mail/api-service";
import { StalwartJmapClient } from "../../lib/mail/jmap-client";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  resolveSecurityLabels,
} from "../../lib/mail/message-security";
import { unlockEncryptedMailVault } from "../../lib/mail/vault-crypto";
import {
  getStoredMailVault,
  putStoredMailVault,
} from "../../lib/mail/vault-storage";
import { mailCryptoWorkerClient } from "../../lib/mail/worker-client";
import type {
  JmapEmailMessage,
  JmapIdentity,
  JmapMailbox,
  JmapSession,
  MailAccountStatus,
  MailDemoConfig,
  UserKeyVault,
} from "../../lib/mail/types";

const log = createLogger("mail-app");

type AuthMode = "sign-in" | "sign-up";

type ActiveMailboxState = {
  client: StalwartJmapClient;
  session: JmapSession;
  mailboxes: JmapMailbox[];
  identities: JmapIdentity[];
  messages: JmapEmailMessage[];
  unlockedVault: UserKeyVault;
  accountEncryptedAtRest: boolean;
  email: string;
  selectedMailboxId: string | null;
};

function getPrimaryMailboxId(mailboxes: JmapMailbox[], role: string): string | null {
  return mailboxes.find((mailbox) => mailbox.role === role)?.id || mailboxes[0]?.id || null;
}

function formatAddress(addresses: Array<{ email: string; name?: string | null }> | undefined): string {
  const first = addresses?.[0];
  if (!first) {
    return "Unknown sender";
  }

  return first.name?.trim() || first.email;
}

function summarizeBody(message: JmapEmailMessage): string {
  const { text, html } = extractMessageBodies(message);
  const value = text || html || "No preview available.";
  return value.replace(/\s+/g, " ").trim();
}

export function MailApp() {
  const { data: session, isPending: isSessionPending } = useSession();
  const [config, setConfig] = useState<MailDemoConfig | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [mailboxStatus, setMailboxStatus] = useState<MailAccountStatus | null>(null);
  const [isMailboxStatusLoading, setIsMailboxStatusLoading] = useState(false);

  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");

  const [loginPassword, setLoginPassword] = useState("");
  const [hasAttemptedAutoOpen, setHasAttemptedAutoOpen] = useState(false);

  const [activeMailbox, setActiveMailbox] = useState<ActiveMailboxState | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessagePlaintext, setSelectedMessagePlaintext] = useState<string | null>(null);
  const [selectedMessageVerified, setSelectedMessageVerified] = useState(false);
  const [selectedMessageDecryptError, setSelectedMessageDecryptError] = useState<string | null>(null);

  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  useEffect(() => {
    let cancelled = false;

    void mailDemoApiService
      .getConfig()
      .then((nextConfig) => {
        if (!cancelled) {
          setConfig(nextConfig);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          log.error("Failed to load mail config", error);
          setErrorMessage("Could not load the mail demo configuration.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedMessage = activeMailbox?.messages.find(
    (message) => message.id === selectedMessageId,
  ) || null;
  const selectedMailbox = activeMailbox?.mailboxes.find(
    (mailbox) => mailbox.id === activeMailbox.selectedMailboxId,
  ) || null;
  const accountEmail = session?.user?.email?.trim().toLowerCase() || "";
  const accountDisplayName = session?.user?.name?.trim() || "";
  const accountUserId = session?.user?.id?.trim() || "";
  const mailboxEmail = mailboxStatus?.email || accountEmail;
  const cachedAuthPassword = peekCachedAuthPassword();
  const shouldAutoOpenMailbox =
    Boolean(config) &&
    Boolean(session?.user) &&
    Boolean(mailboxStatus?.provisioned) &&
    Boolean(cachedAuthPassword) &&
    !activeMailbox;
  const isAutoOpeningMailbox = shouldAutoOpenMailbox && (!hasAttemptedAutoOpen || isBusy);

  useEffect(() => {
    let cancelled = false;

    if (!accountEmail || !accountUserId) {
      setMailboxStatus(null);
      setActiveMailbox(null);
      return () => {
        cancelled = true;
      };
    }

    setIsMailboxStatusLoading(true);

    void mailDemoApiService
      .getAccountStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }

        setMailboxStatus(status);
        setAuthMode(status.provisioned ? "sign-in" : "sign-up");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        log.error("Failed to load authenticated mailbox status", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load your mailbox status.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsMailboxStatusLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountEmail, accountUserId]);

  useEffect(() => {
    setHasAttemptedAutoOpen(false);
  }, [accountUserId, mailboxStatus?.provisioned]);

  useEffect(() => {
    if (!selectedMessage || !activeMailbox) {
      setSelectedMessagePlaintext(null);
      setSelectedMessageVerified(false);
      setSelectedMessageDecryptError(null);
      return;
    }

    const encryptionState = classifyMessageEncryption(selectedMessage);
    if (encryptionState !== "inline_pgp") {
      setSelectedMessagePlaintext(null);
      setSelectedMessageVerified(false);
      setSelectedMessageDecryptError(null);
      return;
    }

    let cancelled = false;
    const { text } = extractMessageBodies(selectedMessage);
    if (!text) {
      setSelectedMessageDecryptError("No armored message body was found.");
      return;
    }

    void (async () => {
      try {
        const senderEmail = selectedMessage.from?.[0]?.email;
        let senderPublicKeyArmored: string | undefined;

        if (senderEmail && config && senderEmail.endsWith(`@${config.defaultDomain}`)) {
          try {
            const senderKey = await mailDemoApiService.getRecipientKey(senderEmail);
            senderPublicKeyArmored = senderKey.publicKeyArmored;
          } catch {
            senderPublicKeyArmored = undefined;
          }
        }

        const decrypted = await mailCryptoWorkerClient.decryptMessage({
          armoredMessage: text,
          senderPublicKeyArmored,
        });

        if (cancelled) {
          return;
        }

        setSelectedMessagePlaintext(decrypted.plaintext);
        setSelectedMessageVerified(decrypted.hasVerifiedSignature);
        setSelectedMessageDecryptError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        log.warn("Failed to decrypt selected message", error);
        setSelectedMessagePlaintext(null);
        setSelectedMessageVerified(false);
        setSelectedMessageDecryptError("Could not decrypt this message on this device.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeMailbox, config, selectedMessage]);

  async function refreshMailboxMessages(mailboxId: string) {
    if (!activeMailbox) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const messages = await activeMailbox.client.getMailboxMessages(
        activeMailbox.session,
        mailboxId,
      );

      setActiveMailbox((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          selectedMailboxId: mailboxId,
          messages,
        };
      });
      setSelectedMessageId((currentId) => {
        if (currentId && messages.some((message) => message.id === currentId)) {
          return currentId;
        }

        return messages[0]?.id || null;
      });
    } catch (error) {
      log.error("Failed to load mailbox messages", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load mailbox messages.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignup() {
    if (!config) {
      return;
    }

    if (!accountEmail || !accountUserId) {
      setErrorMessage("Sign in to Solace before provisioning a mailbox.");
      return;
    }

    if (!signupPassword) {
      setErrorMessage("Enter your account password.");
      return;
    }

    if (signupPassword !== signupPasswordConfirm) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const provisionedMailbox = await bootstrapMailboxForAccount({
        email: accountEmail,
        password: signupPassword,
        displayName: accountDisplayName,
        userId: accountUserId,
      });

      setMailboxStatus({
        email: provisionedMailbox.email,
        displayName: provisionedMailbox.displayName,
        provisioned: true,
      });

      setStatusMessage(
        `Mailbox ${provisionedMailbox.email} is ready. Sign in below to open the inbox.`,
      );
      setLoginPassword(signupPassword);
      setAuthMode("sign-in");
    } catch (error) {
      log.error("Mail signup failed", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Could not provision the mailbox.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignIn(passwordOverride?: string) {
    if (!config) {
      return;
    }

    if (!mailboxStatus?.provisioned || !mailboxEmail) {
      setErrorMessage("Create your mailbox before opening the inbox.");
      return;
    }

    const mailboxPassword = passwordOverride ?? loginPassword;

    if (!mailboxPassword) {
      setErrorMessage("Enter your account password to open the mailbox.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const email = mailboxEmail.trim().toLowerCase();
      const client = new StalwartJmapClient({
        baseUrl: config.discoveryBaseUrl,
        email,
        password: mailboxPassword,
      });
      const session = await client.discoverSession();
      const remoteBackup = await mailDemoApiService.getAccountVaultBackup().catch(() => null);
      const localBackup = await getStoredMailVault(email);
      const backup = remoteBackup || localBackup;

      if (!backup) {
        throw new Error("No encrypted vault backup was found for this mailbox.");
      }

      if (remoteBackup) {
        await putStoredMailVault(backup);
      }

      const unlockedVault = await unlockEncryptedMailVault(
        backup.encryptedVaultB64,
        mailboxPassword,
        backup.kdfParams,
      );
      await mailCryptoWorkerClient.loadVault({
        privateKeyArmored: unlockedVault.encryptedPrivateKeyArmored,
        privateKeyPassphrase: mailboxPassword,
        publicKeyArmored: unlockedVault.publicKeyArmored,
      });

      const [accountSettings, mailboxes, identities] = await Promise.all([
        client.getAccountSettings(session),
        client.getMailboxes(session),
        client.getIdentities(session),
      ]);

      const initialMailboxId = getPrimaryMailboxId(mailboxes, "inbox");
      const messages = initialMailboxId
        ? await client.getMailboxMessages(session, initialMailboxId)
        : [];

      setActiveMailbox({
        client,
        session,
        mailboxes,
        identities,
        messages,
        unlockedVault,
        accountEncryptedAtRest:
          (accountSettings.encryptionAtRest as { "@type"?: string } | undefined)?.["@type"] ===
          "Aes256",
        email,
        selectedMailboxId: initialMailboxId,
      });
      setSelectedMessageId(messages[0]?.id || null);
      setLoginPassword(mailboxPassword);
      setStatusMessage(`Signed in as ${email}.`);
    } catch (error) {
      log.error("Mail sign-in failed", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Could not sign in to the mailbox.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    if (
      !config ||
      !session?.user ||
      isSessionPending ||
      isMailboxStatusLoading ||
      isBusy ||
      activeMailbox ||
      !mailboxStatus?.provisioned ||
      hasAttemptedAutoOpen
    ) {
      return;
    }

    const pendingPassword = peekCachedAuthPassword();

    if (!pendingPassword) {
      return;
    }

    setHasAttemptedAutoOpen(true);
    setLoginPassword((currentPassword) => currentPassword || pendingPassword);
    void handleSignIn(pendingPassword);
  }, [
    activeMailbox,
    config,
    hasAttemptedAutoOpen,
    isBusy,
    isMailboxStatusLoading,
    isSessionPending,
    mailboxStatus?.provisioned,
    session?.user,
  ]);

  async function handleSendMessage() {
    if (!activeMailbox) {
      return;
    }

    if (!composeTo.trim()) {
      setErrorMessage("Enter a recipient email address.");
      return;
    }

    if (!composeSubject.trim()) {
      setErrorMessage("Enter a subject line.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const draftsMailboxId = getPrimaryMailboxId(activeMailbox.mailboxes, "drafts");
      const identityId = activeMailbox.identities[0]?.id;

      if (!draftsMailboxId || !identityId) {
        throw new Error("This mailbox is missing a draft mailbox or sending identity.");
      }

      await activeMailbox.client.sendMessage(activeMailbox.session, {
        draftsMailboxId,
        fromEmail: activeMailbox.email,
        to: [composeTo.trim().toLowerCase()],
        subject: composeSubject.trim(),
        textBody: composeBody,
        identityId,
      });

      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setStatusMessage("Message sent.");

      if (activeMailbox.selectedMailboxId) {
        const refreshedMessages = await activeMailbox.client.getMailboxMessages(
          activeMailbox.session,
          activeMailbox.selectedMailboxId,
        );
        setActiveMailbox((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            messages: refreshedMessages,
          };
        });
      }
    } catch (error) {
      log.error("Failed to send mail", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Could not send the message.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await mailCryptoWorkerClient.clear();
    } catch {
      // Best-effort cleanup.
    }

    setActiveMailbox(null);
    setSelectedMessageId(null);
    setSelectedMessagePlaintext(null);
    setSelectedMessageVerified(false);
    setSelectedMessageDecryptError(null);
    setStatusMessage("Signed out of the mail demo.");
  }

  const selectedMessageEncryptionState = selectedMessage
    ? classifyMessageEncryption(selectedMessage)
    : "plain";
  const selectedMessageLabels = selectedMessage
    ? resolveSecurityLabels({
        messageState: selectedMessageEncryptionState,
        accountEncryptedAtRest: activeMailbox?.accountEncryptedAtRest ?? false,
        hasVerifiedSignature: selectedMessageVerified,
        decryptionFailed: Boolean(selectedMessageDecryptError),
      })
    : [];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.04),_rgba(255,255,255,0))] px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
          <div className="rounded-3xl border border-border/60 bg-background/85 p-6 shadow-xl shadow-sky-950/5 backdrop-blur">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-700/70 dark:text-sky-300/70">
                  Solace Mail Demo
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                  Shared account mail with browser-owned keys.
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                  This demo provisions a real Stalwart mailbox for your signed-in Solace
                  account, reuses the same password for JMAP login and the browser vault,
                  enables AES-256 encryption at rest, and keeps the private key encrypted on
                  the device.
                </p>
              </div>
              <div className="rounded-2xl border border-sky-200/60 bg-sky-50/80 p-3 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                <ShieldCheck className="h-8 w-8" />
              </div>
            </div>

            <div className="mb-5 flex gap-2 rounded-2xl bg-muted/60 p-1">
              <button
                type="button"
                onClick={() => setAuthMode("sign-in")}
                disabled={!session?.user || isMailboxStatusLoading}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                  authMode === "sign-in"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                Mailbox sign-in
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("sign-up")}
                disabled={!session?.user || isMailboxStatusLoading}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                  authMode === "sign-up"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                Create mailbox
              </button>
            </div>

            {statusMessage ? (
              <div className="mb-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                {statusMessage}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mb-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            {!session?.user ? (
              <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-4 text-sm leading-6 text-muted-foreground">
                {isSessionPending
                  ? "Checking your Solace session…"
                  : "Sign in to your Solace account first. Mail now uses the same account identity across the app."}
              </div>
            ) : isMailboxStatusLoading ? (
              <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-4 text-sm leading-6 text-muted-foreground">
                Checking whether this Solace account already has a mailbox…
              </div>
            ) : activeMailbox ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/70 px-4 py-4 text-sm leading-6 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                  Mailbox connected as {activeMailbox.email}. Your Solace sign-in already unlocked Mail for this browser session.
                </div>

                <button
                  type="button"
                  disabled={isBusy || !activeMailbox.selectedMailboxId}
                  onClick={() => {
                    if (!activeMailbox?.selectedMailboxId) {
                      return;
                    }

                    void refreshMailboxMessages(activeMailbox.selectedMailboxId);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh mailbox
                </button>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    void handleLogout();
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Lock className="h-4 w-4" />
                  Disconnect mailbox
                </button>
              </div>
            ) : isAutoOpeningMailbox ? (
              <div className="rounded-2xl border border-sky-200/60 bg-sky-50/70 px-4 py-4 text-sm leading-6 text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                Opening your mailbox with your current Solace sign-in…
              </div>
            ) : authMode === "sign-in" ? (
              <div className="space-y-4">
                <label className="block text-sm font-medium" htmlFor="login-email">
                  Mailbox email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={mailboxEmail}
                  readOnly
                  className="w-full rounded-2xl border border-border bg-muted/40 px-4 py-3 outline-none ring-0"
                />

                <label className="block text-sm font-medium" htmlFor="login-mailbox-password">
                  Account password
                </label>
                <input
                  id="login-mailbox-password"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none ring-0 transition focus:border-sky-500"
                  placeholder="Used for mailbox login and vault unlock"
                />

                {!mailboxStatus?.provisioned ? (
                  <p className="text-sm leading-6 text-muted-foreground">
                    This Solace account does not have a mailbox yet. Switch to Create mailbox to provision it.
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={isBusy || !config || !mailboxStatus?.provisioned || !mailboxEmail}
                  onClick={() => {
                    void handleSignIn();
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Inbox className="h-4 w-4" />
                  {isBusy ? "Opening…" : "Open mailbox"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-sm font-medium" htmlFor="signup-display-name">
                  Solace account name
                </label>
                <input
                  id="signup-display-name"
                  type="text"
                  value={accountDisplayName || mailboxEmail}
                  readOnly
                  className="w-full rounded-2xl border border-border bg-muted/40 px-4 py-3 outline-none ring-0"
                />

                <label className="block text-sm font-medium" htmlFor="signup-mailbox-email">
                  Shared email address
                </label>
                <input
                  id="signup-mailbox-email"
                  type="email"
                  value={accountEmail}
                  readOnly
                  className="w-full rounded-2xl border border-border bg-muted/40 px-4 py-3 outline-none ring-0"
                />

                <label className="block text-sm font-medium" htmlFor="signup-mailbox-password">
                  Account password
                </label>
                <input
                  id="signup-mailbox-password"
                  type="password"
                  value={signupPassword}
                  onChange={(event) => setSignupPassword(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none ring-0 transition focus:border-emerald-500"
                  placeholder="Reused for mailbox login and vault unlock"
                />

                <label className="block text-sm font-medium" htmlFor="signup-vault-password-confirm">
                  Confirm password
                </label>
                <input
                  id="signup-vault-password-confirm"
                  type="password"
                  value={signupPasswordConfirm}
                  onChange={(event) => setSignupPasswordConfirm(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none ring-0 transition focus:border-emerald-500"
                  placeholder="Repeat the password"
                />

                <button
                  type="button"
                  disabled={
                    isBusy ||
                    !config ||
                    !accountEmail ||
                    !accountUserId ||
                    Boolean(mailboxStatus?.provisioned)
                  }
                  onClick={() => {
                    void handleSignup();
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UserRoundPlus className="h-4 w-4" />
                  {isBusy ? "Provisioning…" : "Create mailbox"}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-border/60 bg-background/80 p-6 shadow-xl shadow-sky-950/5 backdrop-blur">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Lock className="h-4 w-4 text-sky-600" />
                  Client vault
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  OpenPGP key pairs are generated in a worker. The encrypted private key stays in
                  IndexedDB and can be backed up to the backend only as ciphertext.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Stalwart storage
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  The shared-account mailbox flow registers the generated public key and enables
                  AES-256 encryption at rest for mailbox storage. Outgoing messages are sent as
                  normal plaintext unless you encrypt them outside this demo.
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <MailPlus className="h-4 w-4 text-violet-600" />
                  Direct JMAP
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  After login, the browser uses JMAP through the backend proxy for mailbox,
                  message, and send operations. The backend only handles orchestration and
                  local-browser connectivity.
                </p>
              </div>
            </div>
          </div>
        </section>

        {activeMailbox ? (
          <section className="grid min-h-[700px] gap-4 lg:grid-cols-[220px_360px_1fr]">
            <aside className="rounded-3xl border border-border/60 bg-background/85 p-4 shadow-xl shadow-sky-950/5 backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Mailboxes
                  </p>
                  <p className="mt-1 text-sm font-medium">{activeMailbox.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void handleLogout();
                  }}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:border-sky-500 hover:text-sky-700 dark:hover:text-sky-300"
                >
                  Logout
                </button>
              </div>

              <div className="space-y-2">
                {activeMailbox.mailboxes.map((mailbox) => (
                  <button
                    key={mailbox.id}
                    type="button"
                    onClick={() => {
                      void refreshMailboxMessages(mailbox.id);
                    }}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      activeMailbox.selectedMailboxId === mailbox.id
                        ? "border-sky-500 bg-sky-50/80 dark:bg-sky-500/10"
                        : "border-border/60 bg-muted/30 hover:border-sky-400/60"
                    }`}
                  >
                    <div className="font-medium">{mailbox.name}</div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {mailbox.role || "custom"}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-border/60 bg-sky-50/70 p-4 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100">
                <p className="font-semibold">Account security</p>
                <p className="mt-2 leading-6">
                  {activeMailbox.accountEncryptedAtRest
                    ? "Stalwart reports AES-256 encryption at rest for this account."
                    : "The account does not currently report encryption at rest."}
                </p>
              </div>
            </aside>

            <section className="rounded-3xl border border-border/60 bg-background/85 p-4 shadow-xl shadow-sky-950/5 backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    {selectedMailbox?.role || "mailbox"}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {selectedMailbox?.name || "Messages"}
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={isBusy || !activeMailbox.selectedMailboxId}
                  onClick={() => {
                    if (!activeMailbox.selectedMailboxId) {
                      return;
                    }

                    void refreshMailboxMessages(activeMailbox.selectedMailboxId);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:border-sky-500 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:text-sky-300"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>

              <div className="space-y-2">
                {activeMailbox.messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
                    No messages were found in this mailbox.
                  </div>
                ) : null}

                {activeMailbox.messages.map((message) => {
                  const isActive = message.id === selectedMessageId;
                  const labels = resolveSecurityLabels({
                    messageState: classifyMessageEncryption(message),
                    accountEncryptedAtRest: activeMailbox.accountEncryptedAtRest,
                    hasVerifiedSignature: false,
                    decryptionFailed: false,
                  });

                  return (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() => setSelectedMessageId(message.id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? "border-sky-500 bg-sky-50/80 dark:bg-sky-500/10"
                          : "border-border/60 bg-muted/20 hover:border-sky-400/60"
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold">{message.subject || "(No subject)"}</p>
                        <span className="text-xs text-muted-foreground">
                          {message.receivedAt ? new Date(message.receivedAt).toLocaleString() : ""}
                        </span>
                      </div>
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {formatAddress(message.from)}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {summarizeBody(message)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {labels.map((label) => (
                          <span
                            key={label}
                            className="rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-[11px] font-medium"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-rows-[1fr_auto]">
              <div className="rounded-3xl border border-border/60 bg-background/85 p-5 shadow-xl shadow-sky-950/5 backdrop-blur">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Message
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">
                      {selectedMessage?.subject || "Select a message"}
                    </h2>
                    {selectedMessage ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        From {formatAddress(selectedMessage.from)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {selectedMessageLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-medium"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedMessage ? (
                  <div className="space-y-4 text-sm leading-7 text-foreground/90">
                    {selectedMessageDecryptError ? (
                      <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                        {selectedMessageDecryptError}
                      </div>
                    ) : null}
                    <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-4 whitespace-pre-wrap">
                      {selectedMessagePlaintext || summarizeBody(selectedMessage)}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
                    Choose a message to inspect its body, security badges, and decrypted content.
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-border/60 bg-background/85 p-5 shadow-xl shadow-sky-950/5 backdrop-blur">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-2">
                    <Send className="h-5 w-5 text-sky-600" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Compose
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">Send from JMAP</h3>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    type="email"
                    value={composeTo}
                    onChange={(event) => setComposeTo(event.target.value)}
                    className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-sky-500"
                    placeholder="Recipient"
                  />
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(event) => setComposeSubject(event.target.value)}
                    className="rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-sky-500"
                    placeholder="Subject"
                  />
                </div>
                <textarea
                  value={composeBody}
                  onChange={(event) => setComposeBody(event.target.value)}
                  className="mt-3 min-h-40 w-full rounded-2xl border border-border bg-background px-4 py-3 outline-none transition focus:border-sky-500"
                  placeholder="Write your message. Outgoing mail is sent as normal plaintext."
                />

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      void handleSendMessage();
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Send className="h-4 w-4" />
                    {isBusy ? "Sending…" : "Send message"}
                  </button>
                </div>
              </div>
            </section>
          </section>
        ) : null}
      </div>
    </main>
  );
}