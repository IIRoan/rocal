"use client";

import { Plus, RefreshCcw } from "lucide-react";
import {
  SidebarProvider,
  SidebarInset,
} from "@workspace/ui/components/ui/sidebar";
import { Button } from "@workspace/ui/components/ui/button";
import { MailSkeleton } from "@workspace/ui/components/ui/app-skeletons";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import { useMailApp } from "@/hooks/use-mail-app";
import { MailSidebar } from "./mail-sidebar";
import { MailCommandPalette } from "./mail-command-palette";
import { ComposeDialog } from "./compose-dialog";
import { MessageList } from "./message-list";
import { MessageReader } from "./message-reader";
import { MailAuthPanel } from "./mail-auth-panel";

export function MailApp() {
  const {
    session,
    isSessionPending,
    config,
    authMode,
    setAuthMode,
    isBusy,
    isMailboxStatusLoading,
    isAutoOpeningMailbox,
    mailboxProvisioned,
    signupPassword,
    setSignupPassword,
    signupPasswordConfirm,
    setSignupPasswordConfirm,
    loginPassword,
    setLoginPassword,
    activeMailbox,
    selectedMessage,
    selectedMessageId,
    setSelectedMessageId,
    selectedMessagePlaintext,
    selectedMessageDecryptedHtml,
    selectedMessageVerified,
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
    handleSignIn,
    handleSignup,
    handleSendMessage,
    handleDeleteMessage,
    handleReply,
    handleForward,
    handleMoveMessage,
    handleCreateMailbox,
    handleDeleteMailbox,
    handleReorderMailboxes,
    handleMarkAsUnread,
    handleMarkAsRead,
    handleBulkDelete,
    handleBulkMove,
    handleBulkMarkAsUnread,
    handleBulkMarkAsRead,
    handleSignOut,
    user,
    mailboxEmail,
    accountEmail,
    accountDisplayName,
  } = useMailApp();

  if (isSessionPending || !session?.user) {
    return (
      <>
        <MailSkeleton />
        <PageLoadingOverlay isLoading={true} messageContext="PAGE_LOAD" enableCycling priority />
      </>
    );
  }

  const isOverlayLoading = isMailboxStatusLoading;

  const selectedMailbox =
    activeMailbox?.mailboxes.find((m) => m.id === activeMailbox.selectedMailboxId) ?? null;

  return (
    <>
      <SidebarProvider>
        <MailSidebar
          user={user ?? { name: "User", email: "" }}
          activeMailbox={activeMailbox}
          onSelectMailbox={(id) => void refreshMailboxMessages(id)}
          onCompose={() => setIsComposeOpen(true)}
          onOpenPalette={() => setIsPaletteOpen(true)}
          onSignOut={() => void handleSignOut()}
          onCreateMailbox={(name) => void handleCreateMailbox(name)}
          onDeleteMailbox={(id) => void handleDeleteMailbox(id)}
          onReorderMailboxes={(reordered) => void handleReorderMailboxes(reordered)}
          isBusy={isBusy}
        />
        <SidebarInset>
          {activeMailbox ? (
            <div className="flex h-full flex-col overflow-hidden">
              <header className="flex h-12 shrink-0 items-center border-b border-border/40 px-4 gap-3">
                <h1 className="text-sm font-semibold">{selectedMailbox?.name ?? "Inbox"}</h1>
                <span className="text-xs text-muted-foreground/60">
                  {activeMailbox.messages.length}{" "}
                  {activeMailbox.messages.length === 1 ? "message" : "messages"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost" size="icon"
                    className="size-8 rounded-lg text-muted-foreground/60 hover:text-foreground"
                    disabled={isBusy || !activeMailbox.selectedMailboxId}
                    onClick={() => activeMailbox.selectedMailboxId && void refreshMailboxMessages(activeMailbox.selectedMailboxId)}
                    aria-label="Refresh"
                  >
                    <RefreshCcw size={15} strokeWidth={2} className={isBusy ? "animate-spin" : ""} />
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 rounded-lg text-[13px] text-muted-foreground/60 hover:text-foreground"
                    onClick={() => setIsComposeOpen(true)}
                  >
                    <Plus size={14} />
                    Compose
                  </Button>
                </div>
              </header>

              <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="w-72 shrink-0 border-r border-border/40 overflow-y-auto">
                  <MessageList
                    messages={activeMailbox.messages}
                    selectedMessageId={selectedMessageId}
                    onSelect={setSelectedMessageId}
                    mailboxes={activeMailbox.mailboxes}
                    currentMailboxId={activeMailbox.selectedMailboxId}
                    onDelete={(id) => void handleDeleteMessage(id)}
                    onMove={(id, targetId) => void handleMoveMessage(targetId, id)}
                    onMarkAsUnread={(id) => void handleMarkAsUnread(id)}
                    onMarkAsRead={(id) => void handleMarkAsRead(id)}
                    onBulkDelete={(ids) => void handleBulkDelete(ids)}
                    onBulkMove={(ids, targetId) => void handleBulkMove(ids, targetId)}
                    onBulkMarkAsUnread={(ids) => void handleBulkMarkAsUnread(ids)}
                    onBulkMarkAsRead={(ids) => void handleBulkMarkAsRead(ids)}
                  />
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <MessageReader
                    message={selectedMessage}
                    plaintext={selectedMessagePlaintext}
                    decryptedHtml={selectedMessageDecryptedHtml}
                    verified={selectedMessageVerified}
                    decryptError={selectedMessageDecryptError}
                    accountEncryptedAtRest={activeMailbox.accountEncryptedAtRest}
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
                  />
                </div>
              </div>
            </div>
          ) : (
            <MailAuthPanel
              authMode={authMode}
              setAuthMode={setAuthMode}
              mailboxEmail={mailboxEmail}
              accountEmail={accountEmail}
              accountDisplayName={accountDisplayName}
              signupPassword={signupPassword}
              setSignupPassword={setSignupPassword}
              signupPasswordConfirm={signupPasswordConfirm}
              setSignupPasswordConfirm={setSignupPasswordConfirm}
              loginPassword={loginPassword}
              setLoginPassword={setLoginPassword}
              isBusy={isBusy}
              isMailboxStatusLoading={isMailboxStatusLoading}
              isAutoOpeningMailbox={isAutoOpeningMailbox}
              mailboxProvisioned={mailboxProvisioned}
              onSignIn={() => void handleSignIn()}
              onSignUp={() => void handleSignup()}
              configLoaded={Boolean(config)}
            />
          )}
        </SidebarInset>
      </SidebarProvider>

      <MailCommandPalette
        open={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        onCompose={() => setIsComposeOpen(true)}
        blockRemoteImages={blockRemoteImages}
        blockTrackingPixels={blockTrackingPixels}
        onToggleBlockRemoteImages={() => setBlockRemoteImages(!blockRemoteImages)}
        onToggleBlockTrackingPixels={() => setBlockTrackingPixels(!blockTrackingPixels)}
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

      <PageLoadingOverlay isLoading={isOverlayLoading} messageContext="PAGE_LOAD" enableCycling priority />
    </>
  );
}
