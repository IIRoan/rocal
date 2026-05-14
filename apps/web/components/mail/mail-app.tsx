"use client";

import { useState } from "react";
import { Inbox, Plus, RefreshCcw } from "lucide-react";
import {
  SidebarProvider,
  SidebarInset,
} from "@workspace/ui/components/ui/sidebar";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { MailSkeleton } from "@workspace/ui/components/ui/app-skeletons";
import { AppLoadingState, PageLoadingOverlay } from "@workspace/ui/components/ui";
import { useMailApp } from "@/hooks/use-mail-app";
import { useSettings } from "@/hooks/use-settings";
import { MailSidebar } from "./mail-sidebar";
import { MailCommandPalette } from "./mail-command-palette";
import { ComposeDialog } from "./compose-dialog";
import { MessageList } from "./message-list";
import { MessageReader } from "./message-reader";

export function MailApp() {
  const {
    session,
    isSessionPending,
    config,
    isBusy,
    mailboxStatus,
    isMailboxStatusLoading,
    needsPasswordPrompt,
    loginPassword,
    setLoginPassword,
    activeMailbox,
    selectedMessage,
    selectedMessageId,
    setSelectedMessageId,
    selectedMessagePlaintext,
    selectedMessageDecryptedHtml,
    selectedMessageSignatureVerificationState,
    selectedMessageDecryptError,
    composeTo,
    setComposeTo,
    composeSubject,
    setComposeSubject,
    composeBody,
    setComposeBody,
    isComposeOpen,
    setIsComposeOpen,
    isPaletteOpen,
    setIsPaletteOpen,
    blockRemoteImages,
    setBlockRemoteImages,
    blockTrackingPixels,
    setBlockTrackingPixels,
    refreshMailboxMessages,
    handleManualRefresh,
    isRefreshing,
    loadMoreMessages,
    hasMoreMessages,
    isLoadingMore,
    handleSignIn,
    handleSendMessage,
    handleDeleteMessage,
    handleReply,
    handleForward,
    handleMoveMessage,
    handleCreateMailbox,
    handleDeleteMailbox,
    handleRenameMailbox,
    handleReorderMailboxes,
    handleMarkAsUnread,
    handleMarkAsRead,
    handleBulkDelete,
    handleBulkMove,
    handleBulkMarkAsUnread,
    handleBulkMarkAsRead,
    handleToggleFlagged,
    handleSetMessageLabel,
    handleCreateLabel,
    handleDeleteLabel,
    labels,
    handleSignOut,
    user,
    mailboxEmail,
    accountEmail,
  } = useMailApp();

  const { settings } = useSettings();
  const timeFormat = settings?.timeFormat ?? "24h";
  const [paletteInitialView, setPaletteInitialView] = useState<
    string | undefined
  >();

  if (isSessionPending || !session?.user) {
    return (
      <>
        <MailSkeleton />
        <PageLoadingOverlay
          isLoading={true}
          messageContext="PAGE_LOAD"
          enableCycling
          priority
        />
      </>
    );
  }

  const isOverlayLoading = isMailboxStatusLoading;

  const selectedMailbox =
    activeMailbox?.mailboxes.find(
      (m) => m.id === activeMailbox.selectedMailboxId,
    ) ?? null;
  const mailboxIsProvisioned = mailboxStatus?.provisioned ?? false;
  const mailboxUnlockTitle = mailboxIsProvisioned
    ? "Open your mailbox"
    : "Set up your mailbox";
  const mailboxUnlockDescription = mailboxIsProvisioned
    ? "Enter your encryption password to unlock your encrypted mailbox."
    : "Enter your encryption password to create and unlock your encrypted mailbox.";
  const mailboxButtonLabel = isBusy
    ? mailboxIsProvisioned
      ? "Opening…"
      : "Setting up…"
    : mailboxIsProvisioned
      ? "Open mailbox"
      : "Set up mailbox";

  return (
    <>
      <SidebarProvider>
        <MailSidebar
          user={user ?? { name: "User", email: "" }}
          activeMailbox={activeMailbox}
          onSelectMailbox={(id) => void refreshMailboxMessages(id)}
          onCompose={() => setIsComposeOpen(true)}
          onOpenPalette={() => setIsPaletteOpen(true)}
          onOpenMailboxes={() => {
            setPaletteInitialView("mailboxes");
            setIsPaletteOpen(true);
          }}
          onSignOut={() => void handleSignOut()}
          onReorderMailboxes={(reordered) =>
            void handleReorderMailboxes(reordered)
          }
          isBusy={isBusy}
        />
        <SidebarInset>
          {activeMailbox ? (
            <div className="flex h-full flex-col overflow-hidden">
              <header className="flex h-12 shrink-0 items-center border-b border-border/40 px-4 gap-3">
                <h1 className="text-sm font-semibold">
                  {selectedMailbox?.name ?? "Inbox"}
                </h1>
                <span className="text-xs text-muted-foreground/60">
                  {activeMailbox.messages.length}{" "}
                  {activeMailbox.messages.length === 1 ? "message" : "messages"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-foreground/70 hover:text-foreground disabled:opacity-40"
                    disabled={isRefreshing || isBusy}
                    onClick={() => void handleManualRefresh()}
                    aria-label="Refresh mail"
                    title="Refresh mail"
                  >
                    <RefreshCcw
                      size={15}
                      strokeWidth={2}
                      className={
                        isRefreshing ? "animate-spin" : "transition-transform"
                      }
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg text-[13px] text-foreground/70 hover:text-foreground"
                    onClick={() => setIsComposeOpen(true)}
                  >
                    <Plus size={14} />
                    Compose
                  </Button>
                </div>
              </header>

              <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="w-72 shrink-0 border-r border-border/40 flex flex-col min-h-0">
                  <MessageList
                    key={activeMailbox.selectedMailboxId ?? "mailbox-list"}
                    messages={activeMailbox.messages}
                    selectedMessageId={selectedMessageId}
                    onSelect={setSelectedMessageId}
                    mailboxes={activeMailbox.mailboxes}
                    currentMailboxId={activeMailbox.selectedMailboxId}
                    onDelete={(id) => void handleDeleteMessage(id)}
                    onMove={(id, targetId) =>
                      void handleMoveMessage(targetId, id)
                    }
                    onMarkAsUnread={(id) => void handleMarkAsUnread(id)}
                    onMarkAsRead={(id) => void handleMarkAsRead(id)}
                    onBulkDelete={(ids) => void handleBulkDelete(ids)}
                    onBulkMove={(ids, targetId) =>
                      void handleBulkMove(ids, targetId)
                    }
                    onBulkMarkAsUnread={(ids) =>
                      void handleBulkMarkAsUnread(ids)
                    }
                    onBulkMarkAsRead={(ids) => void handleBulkMarkAsRead(ids)}
                    onToggleFlagged={(id) => void handleToggleFlagged(id)}
                    labels={labels}
                    timeFormat={timeFormat}
                    timezone={settings?.timezone}
                    onLoadMore={() => void loadMoreMessages()}
                    hasMore={hasMoreMessages}
                    isLoadingMore={isLoadingMore}
                  />
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <MessageReader
                    message={selectedMessage}
                    plaintext={selectedMessagePlaintext}
                    decryptedHtml={selectedMessageDecryptedHtml}
                    signatureVerificationState={
                      selectedMessageSignatureVerificationState
                    }
                    decryptError={selectedMessageDecryptError}
                    accountEncryptedAtRest={
                      activeMailbox.accountEncryptedAtRest
                    }
                    isBusy={isBusy}
                    blockRemoteImages={blockRemoteImages}
                    blockTrackingPixels={blockTrackingPixels}
                    mailboxes={activeMailbox.mailboxes}
                    currentMailboxId={activeMailbox.selectedMailboxId}
                    onReply={handleReply}
                    onForward={handleForward}
                    onDelete={() => void handleDeleteMessage()}
                    onMove={(targetId) => void handleMoveMessage(targetId)}
                    onMarkAsUnread={() => void handleMarkAsUnread()}
                    onToggleFlagged={() => void handleToggleFlagged()}
                    onSetLabel={(labelId, assigned) =>
                      selectedMessage
                        ? void handleSetMessageLabel(
                            selectedMessage.id,
                            labelId,
                            assigned,
                          )
                        : undefined
                    }
                    onCreateLabel={(name, color) =>
                      handleCreateLabel(name, color)
                    }
                    onDeleteLabel={(id) => void handleDeleteLabel(id)}
                    labels={labels}
                    timeFormat={timeFormat}
                    timezone={settings?.timezone}
                  />
                </div>
              </div>
            </div>
          ) : needsPasswordPrompt ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="w-full max-w-sm space-y-4">
                  <div>
                    <h1 className="text-xl font-semibold">{mailboxUnlockTitle}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {mailboxUnlockDescription}
                    </p>
                  </div>
                  <Input
                    id="mailbox-password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Encryption password"
                    onKeyDown={(e) => e.key === "Enter" && void handleSignIn()}
                    disabled={isBusy}
                    autoFocus
                  />
                  <Button
                    className="w-full"
                    onClick={() => void handleSignIn()}
                    disabled={isBusy || !loginPassword || !mailboxEmail}
                  >
                    <Inbox size={15} />
                    {mailboxButtonLabel}
                  </Button>
                </div>
              </div>
            ) : (
              <AppLoadingState
                variant="centered"
                className="flex-1"
                text={
                  isMailboxStatusLoading
                    ? "Checking your workspace..."
                    : !config
                      ? "Loading your workspace..."
                      : mailboxStatus?.provisioned
                        ? "Opening your mailbox..."
                        : "Setting up your mailbox..."
                }
              />
            )}
        </SidebarInset>
      </SidebarProvider>

      <MailCommandPalette
        open={isPaletteOpen}
        onOpenChange={(v) => {
          setIsPaletteOpen(v);
          if (!v) setPaletteInitialView(undefined);
        }}
        initialView={paletteInitialView}
        onCompose={() => setIsComposeOpen(true)}
        blockRemoteImages={blockRemoteImages}
        blockTrackingPixels={blockTrackingPixels}
        onToggleBlockRemoteImages={() =>
          setBlockRemoteImages(!blockRemoteImages)
        }
        onToggleBlockTrackingPixels={() =>
          setBlockTrackingPixels(!blockTrackingPixels)
        }
        mailboxes={activeMailbox?.mailboxes ?? []}
        onCreateMailbox={(name) => handleCreateMailbox(name)}
        onDeleteMailbox={(id) => handleDeleteMailbox(id)}
        onRenameMailbox={(id, name) => handleRenameMailbox(id, name)}
      />

      <ComposeDialog
        open={isComposeOpen}
        fromEmail={activeMailbox?.email ?? accountEmail}
        onClose={() => setIsComposeOpen(false)}
        onSend={handleSendMessage}
        composeTo={composeTo}
        composeSubject={composeSubject}
        composeBody={composeBody}
        setComposeTo={setComposeTo}
        setComposeSubject={setComposeSubject}
        setComposeBody={setComposeBody}
        isBusy={isBusy}
      />

      <PageLoadingOverlay
        isLoading={isOverlayLoading}
        messageContext="DATA_SYNC"
        enableCycling
        priority
      />
    </>
  );
}
