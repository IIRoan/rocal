"use client";

import { useEffect, useRef, useState } from "react";
import {
  RotateCcw,
  ArrowLeft,
  Pencil,
  Menu,
  Search,
  X,
} from "lucide-react";
import {
  SidebarProvider,
  SidebarInset,
  useSidebar,
} from "@workspace/ui/components/ui/sidebar";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import { PageLoadingOverlay } from "@workspace/ui/components/ui";
import { useIsMobile } from "@workspace/ui/hooks";
import { useQuery } from "@tanstack/react-query";
import { useMailApp } from "@/hooks/use-mail-app";
import { useSettings } from "@/hooks/use-settings";
import { MobileAppSwitcher } from "@/components/mobile-app-switcher";
import { MailSidebar } from "./mail-sidebar";
import { MailCommandPalette } from "./mail-command-palette";
import { ComposeDialog, ComposeForm } from "./compose-dialog";
import { AttachmentPreviewDialog } from "./attachment-preview-dialog";
import { MessageList } from "./message-list";
import { MessageReader } from "./message-reader";
import type { JmapEmailMessage } from "@/lib/mail/types";

interface MobileMailHeaderProps {
  selectedMailboxName: string;
  mailboxMessageCount: number;
  selectedMessageSubject: string | null;
  mailboxEmail: string;
  showReaderOnMobile: boolean;
  isFullCompose: boolean;
  isBusy: boolean;
  isRefreshing: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onCompose: () => void;
}

function MobileMailHeader({
  selectedMailboxName,
  mailboxMessageCount,
  selectedMessageSubject,
  mailboxEmail,
  showReaderOnMobile,
  isFullCompose,
  isBusy,
  isRefreshing,
  onBack,
  onRefresh,
  onCompose,
}: MobileMailHeaderProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="safe-area-inset-top px-4 pb-3 pt-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 rounded-xl text-muted-foreground"
            onClick={toggleSidebar}
            aria-label="Open mailboxes"
          >
            <Menu size={18} strokeWidth={2.25} />
          </Button>

          <div className="flex min-w-0 flex-1 justify-center">
            <MobileAppSwitcher activeApp="mail" />
          </div>

          {isFullCompose ? (
            <div className="size-9 shrink-0" aria-hidden />
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-9 rounded-xl text-muted-foreground"
              onClick={onCompose}
              aria-label="Compose message"
            >
              <Pencil size={18} strokeWidth={2.25} />
            </Button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3">
          {isFullCompose ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                New message
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {mailboxEmail}
              </p>
            </div>
          ) : showReaderOnMobile ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-9 rounded-xl text-muted-foreground"
                onClick={onBack}
                aria-label="Back to messages"
              >
                <ArrowLeft size={18} strokeWidth={2.25} />
              </Button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {selectedMessageSubject || "Message"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedMailboxName}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {selectedMailboxName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {mailboxMessageCount}{" "}
                  {mailboxMessageCount === 1 ? "message" : "messages"}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-9 rounded-xl text-muted-foreground disabled:opacity-40"
                  disabled={isRefreshing || isBusy}
                  onClick={onRefresh}
                  aria-label="Refresh mail"
                  title="Refresh mail"
                >
                  <RotateCcw
                    size={16}
                    strokeWidth={2.25}
                    className={
                      isRefreshing ? "animate-spin" : "transition-transform"
                    }
                  />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

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
    openMessageById,
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
    mailDarkMode,
    setMailDarkMode,
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
  const handledDeepLinkMessageIdRef = useRef<string | null>(null);
  const [mailListSearch, setMailListSearch] = useState("");
  const [debouncedMailListSearch, setDebouncedMailListSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMailListSearch(mailListSearch), 300);
    return () => clearTimeout(timer);
  }, [mailListSearch]);

  const mailboxId = activeMailbox?.selectedMailboxId ?? null;

  const {
    data: serverSearchResults,
    isFetching: isSearching,
  } = useQuery<JmapEmailMessage[]>({
    queryKey: ["mail-inline-search", mailboxId, debouncedMailListSearch],
    queryFn: async () => {
      if (!activeMailbox || !mailboxId || !debouncedMailListSearch.trim()) return [];
      const { messages } = await activeMailbox.client.searchMailboxMessages(
        activeMailbox.session,
        mailboxId,
        debouncedMailListSearch.trim(),
        40,
      );
      return messages;
    },
    enabled: Boolean(debouncedMailListSearch.trim() && activeMailbox && mailboxId),
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });

  const filteredListMessages: JmapEmailMessage[] = debouncedMailListSearch.trim()
    ? (serverSearchResults ?? [])
    : (activeMailbox?.messages ?? []);

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

  useEffect(() => {
    if (!activeMailbox || typeof window === "undefined") return;
    const messageId = new URLSearchParams(window.location.search).get(
      "messageId",
    );
    if (!messageId || handledDeepLinkMessageIdRef.current === messageId) return;

    handledDeepLinkMessageIdRef.current = messageId;
    void openMessageById(messageId);
  }, [activeMailbox, openMessageById]);

  // Clear inline search when switching mailboxes
  const prevMailboxIdRef = useRef<string | null | undefined>(null);
  useEffect(() => {
    const currentId = activeMailbox?.selectedMailboxId ?? null;
    if (prevMailboxIdRef.current !== null && prevMailboxIdRef.current !== currentId) {
      setMailListSearch("");
    }
    prevMailboxIdRef.current = currentId;
  }, [activeMailbox?.selectedMailboxId]);

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
          onOpenSearch={() => setIsPaletteOpen(true)}
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
            <div className="flex h-full flex-col overflow-hidden bg-background">
              {isMobile && !showReaderOnMobile && !isFullCompose && (
                <MobileMailHeader
                  selectedMailboxName={selectedMailbox?.name ?? "Inbox"}
                  mailboxMessageCount={activeMailbox.messages.length}
                  selectedMessageSubject={selectedMessage?.subject ?? null}
                  mailboxEmail={activeMailbox.email ?? accountEmail}
                  showReaderOnMobile={showReaderOnMobile}
                  isFullCompose={isFullCompose}
                  isBusy={isBusy}
                  isRefreshing={isRefreshing}
                  onBack={handleBack}
                  onRefresh={() => void handleManualRefresh()}
                  onCompose={() => setIsComposeOpen(true)}
                />
              )}

              <div className="flex flex-1 min-h-0 overflow-hidden relative">
                {/* Message list — hidden on mobile when a message is open */}
                <div
                  className={
                    isMobile
                      ? showReaderOnMobile || isFullCompose
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
                  {/* Inline search input — desktop only */}
                  {!isMobile && (
                    <div className="px-3 py-2 border-b border-border/40 shrink-0">
                      <div className="relative flex items-center">
                        <Search
                          size={13}
                          strokeWidth={2}
                          className="absolute left-2.5 text-muted-foreground/50 pointer-events-none"
                        />
                        <Input
                          value={mailListSearch}
                          onChange={(e) => setMailListSearch(e.target.value)}
                          placeholder="Search all messages…"
                          className="h-7 pl-7 pr-7 text-xs bg-muted/40 border-0 shadow-none rounded-md focus-visible:ring-1 focus-visible:ring-ring/40 placeholder:text-muted-foreground/40"
                        />
                        {isSearching && debouncedMailListSearch && (
                          <RotateCcw
                            size={11}
                            strokeWidth={2}
                            className="absolute right-2 text-muted-foreground/40 animate-spin pointer-events-none"
                          />
                        )}
                        {mailListSearch && !isSearching && (
                          <button
                            type="button"
                            onClick={() => setMailListSearch("")}
                            className="absolute right-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                            aria-label="Clear search"
                          >
                            <X size={12} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <MessageList
                    key={activeMailbox.selectedMailboxId ?? "mailbox-list"}
                    messages={filteredListMessages}
                    relatedMessages={debouncedMailListSearch ? [] : conversationSourceMessages}
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
                    onLoadMore={debouncedMailListSearch ? undefined : () => void loadMoreMessages()}
                    hasMore={debouncedMailListSearch ? false : hasMoreMessages}
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
                      mailDarkMode={mailDarkMode}
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
        mailDarkMode={mailDarkMode}
        onToggleMailDarkMode={() => setMailDarkMode(!mailDarkMode)}
        mailboxes={activeMailbox?.mailboxes ?? []}
        onCreateMailbox={(name) => handleCreateMailbox(name)}
        onDeleteMailbox={(id) => handleDeleteMailbox(id)}
        onRenameMailbox={(id, name) => handleRenameMailbox(id, name)}
        labels={labels}
        onCreateLabel={(name, color) => handleCreateLabel(name, color)}
        onDeleteLabel={(id) => handleDeleteLabel(id)}
        messages={activeMailbox?.messages ?? []}
        onSelectMessage={(id) => void openMessageById(id)}
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
