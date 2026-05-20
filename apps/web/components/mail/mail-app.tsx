"use client";

import { useState } from "react";
import {
  SlidersHorizontal,
  RotateCcw,
  ArrowLeft,
  Pencil,
} from "lucide-react";
import {
  SidebarProvider,
  SidebarInset,
} from "@workspace/ui/components/ui/sidebar";
import { Button } from "@workspace/ui/components/ui/button";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import { useIsMobile } from "@workspace/ui/hooks";
import { useMailApp } from "@/hooks/use-mail-app";
import { useSettings } from "@/hooks/use-settings";
import { MailSidebar } from "./mail-sidebar";
import { MailCommandPalette } from "./mail-command-palette";
import { ComposeDialog, ComposeForm } from "./compose-dialog";
import { AttachmentPreviewDialog } from "./attachment-preview-dialog";
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
    activeMailbox,
    selectedMessage,
    selectedMessageId,
    setSelectedMessageId,
    selectedConversationMessages,
    isConversationLoading,
    setSelectedConversationMessageId,
    selectedMessagePlaintext,
    selectedMessageDecryptedHtml,
    selectedMessageDecryptedAttachments,
    attachmentPreview,
    selectedMessageSignatureVerificationState,
    selectedMessageDecryptError,
    composeTo,
    setComposeTo,
    composeCc,
    setComposeCc,
    composeBcc,
    setComposeBcc,
    composeAttachments,
    setComposeAttachments,
    composeSubject,
    setComposeSubject,
    composeBody,
    setComposeBody,
    isComposeOpen,
    setIsComposeOpen,
    isFullCompose,
    setIsFullCompose,
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
    handleQuickReply,
    handlePreviewAttachment,
    loadAttachmentHoverPreview,
    handleDownloadAttachment,
    closeAttachmentPreview,
    handleMoveMessage,
    handleUntrash,
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
    accountEmail,
    conversationSourceMessages,
  } = useMailApp();

  const { settings } = useSettings();
  const timeFormat = settings?.timeFormat ?? "24h";
  const [paletteInitialView, setPaletteInitialView] = useState<
    string | undefined
  >();
  const isMobile = useIsMobile();

  const handleSelectMessage = (id: string | null) => {
    setSelectedMessageId(id);
  };

  const handleBack = () => {
    setSelectedMessageId(null);
  };

  // Derive navigation state from current message list
  const messages = activeMailbox?.messages ?? [];
  const selectedIndex = messages.findIndex((m) => m.id === selectedMessageId);
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < messages.length - 1;

  const handleNavigatePrev = () => {
    if (hasPrev) setSelectedMessageId(messages[selectedIndex - 1].id);
  };
  const handleNavigateNext = () => {
    if (hasNext) setSelectedMessageId(messages[selectedIndex + 1].id);
  };
  const handleCloseMessage = () => {
    setSelectedMessageId(null);
  };

  // Archive = move to the first mailbox with role "archive"
  const archiveMailbox = activeMailbox?.mailboxes.find(
    (m) => m.role?.toLowerCase() === "archive",
  );
  const handleArchive = archiveMailbox
    ? () => void handleMoveMessage(archiveMailbox.id)
    : undefined;

  if (isSessionPending || !session?.user) {
    return (
      <PageLoadingOverlay
        isLoading={true}
        messageContext="PAGE_LOAD"
        enableCycling
        priority
      />
    );
  }

  const isOverlayLoading = isMailboxStatusLoading || (isBusy && !activeMailbox);

  const selectedMailbox =
    activeMailbox?.mailboxes.find(
      (m) => m.id === activeMailbox.selectedMailboxId,
    ) ?? null;

  // On mobile: show reader pane when a message is selected
  const showReaderOnMobile = isMobile && Boolean(selectedMessageId);

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
              {/* Mobile-only top header — adapts between list header and reader header */}
              {isMobile && (
                <header className="flex h-12 shrink-0 items-center border-b border-border/40 px-4 gap-3">
                  {showReaderOnMobile ? (
                    <>
                      <button
                        type="button"
                        onClick={handleBack}
                        className="inline-flex items-center justify-center size-8 rounded-lg text-foreground/70 hover:text-foreground hover:bg-accent/40 transition-colors"
                        aria-label="Back to list"
                      >
                        <ArrowLeft size={17} strokeWidth={2} />
                      </button>
                      <h1 className="text-sm font-semibold flex-1 truncate">
                        {selectedMessage?.subject || "Message"}
                      </h1>
                    </>
                  ) : (
                    <>
                      <h1 className="text-sm font-semibold">
                        {selectedMailbox?.name ?? "Inbox"}
                      </h1>
                      <span className="text-xs text-muted-foreground/60">
                        {activeMailbox.messages.length}{" "}
                        {activeMailbox.messages.length === 1
                          ? "message"
                          : "messages"}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-[min(var(--radius-md),12px)]"
                          onClick={() => setIsPaletteOpen(true)}
                          aria-label="Filter"
                          title="Filter"
                        >
                          <SlidersHorizontal size={15} strokeWidth={2} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-[min(var(--radius-md),12px)] disabled:opacity-40"
                          disabled={isRefreshing || isBusy}
                          onClick={() => void handleManualRefresh()}
                          aria-label="Refresh mail"
                          title="Refresh mail"
                        >
                          <RotateCcw
                            size={15}
                            strokeWidth={2}
                            className={
                              isRefreshing
                                ? "animate-spin"
                                : "transition-transform"
                            }
                          />
                        </Button>
                      </div>
                    </>
                  )}
                </header>
              )}

              <div className="flex flex-1 min-h-0 overflow-hidden relative">
                {/* Message list — hidden on mobile when a message is open */}
                <div
                  className={
                    isMobile
                      ? showReaderOnMobile
                        ? "hidden"
                        : "flex flex-col w-full min-h-0"
                      : "w-72 shrink-0 border-r border-border/40 flex flex-col min-h-0"
                  }
                >
                  {/* Desktop-only header inside list column */}
                  {!isMobile && (
                    <header className="flex h-12 shrink-0 items-center border-b border-border/40 px-4 gap-3">
                      <h1 className="text-sm font-semibold">
                        {selectedMailbox?.name ?? "Inbox"}
                      </h1>
                      <span className="text-xs text-muted-foreground/60">
                        {activeMailbox.messages.length}{" "}
                        {activeMailbox.messages.length === 1
                          ? "message"
                          : "messages"}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="rounded-[min(var(--radius-md),12px)] disabled:opacity-40"
                          disabled={isRefreshing || isBusy}
                          onClick={() => void handleManualRefresh()}
                          aria-label="Refresh mail"
                          title="Refresh mail"
                        >
                          <RotateCcw
                            size={15}
                            strokeWidth={2}
                            className={
                              isRefreshing
                                ? "animate-spin"
                                : "transition-transform"
                            }
                          />
                        </Button>
                      </div>
                    </header>
                  )}
                  <MessageList
                    key={activeMailbox.selectedMailboxId ?? "mailbox-list"}
                    messages={activeMailbox.messages}
                    relatedMessages={conversationSourceMessages}
                    selectedMessageId={selectedMessageId}
                    onSelect={handleSelectMessage}
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

                {/* Message reader / inline composer — full screen on mobile when open */}
                <div
                  className={
                    isMobile
                      ? showReaderOnMobile || isFullCompose
                        ? "flex flex-col w-full min-h-0 overflow-hidden relative"
                        : "hidden"
                      : "flex-1 min-w-0 overflow-hidden relative"
                  }
                >
                  {/* Message reader — hidden (but mounted) when full compose is active */}
                  <div
                    className="absolute inset-0 flex flex-col transition-all duration-200 ease-in-out"
                    style={{
                      opacity: isFullCompose ? 0 : 1,
                      transform: isFullCompose ? "translateX(-16px)" : "translateX(0)",
                      pointerEvents: isFullCompose ? "none" : "auto",
                    }}
                  >
                    <MessageReader
                      message={selectedMessage}
                      selectedMessageId={selectedMessage?.id ?? null}
                      conversationMessages={selectedConversationMessages}
                      isConversationLoading={isConversationLoading}
                      onSelectConversationMessage={(id) =>
                        setSelectedConversationMessageId(id)
                      }
                      plaintext={selectedMessagePlaintext}
                      decryptedHtml={selectedMessageDecryptedHtml}
                      attachments={selectedMessageDecryptedAttachments ?? undefined}
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
                      onClose={handleCloseMessage}
                      onNavigatePrev={handleNavigatePrev}
                      onNavigateNext={handleNavigateNext}
                      hasPrev={hasPrev}
                      hasNext={hasNext}
                      onArchive={handleArchive}
                      onSendReply={handleQuickReply}
                      onLoadAttachmentPreview={loadAttachmentHoverPreview}
                      onPreviewAttachment={handlePreviewAttachment}
                      onDownloadAttachment={handleDownloadAttachment}
                      onUntrash={handleUntrash}
                      onConversationMessageDelete={(id) =>
                        void handleDeleteMessage(id)
                      }
                      onConversationMessageMarkUnread={(id) =>
                        void handleMarkAsUnread(id)
                      }
                      onConversationMessageMove={(id, mailboxId) =>
                        void handleMoveMessage(mailboxId, id)
                      }
                      accountEmail={activeMailbox?.email ?? accountEmail}
                    />
                  </div>

                  {/* Full inline composer — slides in from right */}
                  <div
                    className="absolute inset-0 flex flex-col transition-all duration-200 ease-in-out"
                    style={{
                      opacity: isFullCompose ? 1 : 0,
                      transform: isFullCompose ? "translateX(0)" : "translateX(16px)",
                      pointerEvents: isFullCompose ? "auto" : "none",
                    }}
                  >
                    <ComposeForm
                      fromEmail={activeMailbox.email ?? accountEmail}
                      onClose={() => setIsFullCompose(false)}
                      onSend={async () => {
                        await handleSendMessage();
                        setIsFullCompose(false);
                      }}
                      composeTo={composeTo}
                      composeCc={composeCc}
                      composeBcc={composeBcc}
                      composeSubject={composeSubject}
                      composeBody={composeBody}
                      composeAttachments={composeAttachments}
                      setComposeTo={setComposeTo}
                      setComposeCc={setComposeCc}
                      setComposeBcc={setComposeBcc}
                      setComposeSubject={setComposeSubject}
                      setComposeBody={setComposeBody}
                      setComposeAttachments={setComposeAttachments}
                      isBusy={isBusy}
                    />
                  </div>
                </div>
              </div>

              {/* Mobile compose FAB — shown in list view */}
              {isMobile && !showReaderOnMobile && (
                <button
                  type="button"
                  onClick={() => setIsComposeOpen(true)}
                  className="fixed bottom-6 right-5 z-30 flex items-center justify-center size-14 rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
                  aria-label="Compose"
                >
                  <Pencil size={20} strokeWidth={2} />
                </button>
              )}
            </div>
          ) : null}
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
        labels={labels}
        onCreateLabel={(name, color) => handleCreateLabel(name, color)}
        onDeleteLabel={(id) => handleDeleteLabel(id)}
      />

      <ComposeDialog
        open={isComposeOpen}
        fromEmail={activeMailbox?.email ?? accountEmail}
        onClose={() => setIsComposeOpen(false)}
        onSend={handleSendMessage}
        onExpand={() => {
          setIsComposeOpen(false);
          setIsFullCompose(true);
        }}
        composeTo={composeTo}
        composeCc={composeCc}
        composeBcc={composeBcc}
        composeSubject={composeSubject}
        composeBody={composeBody}
        composeAttachments={composeAttachments}
        setComposeTo={setComposeTo}
        setComposeCc={setComposeCc}
        setComposeBcc={setComposeBcc}
        setComposeSubject={setComposeSubject}
        setComposeBody={setComposeBody}
        setComposeAttachments={setComposeAttachments}
        isBusy={isBusy}
      />

      <AttachmentPreviewDialog
        preview={attachmentPreview}
        onOpenChange={(open) => {
          if (!open) {
            closeAttachmentPreview();
          }
        }}
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
