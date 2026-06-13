"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { useMailUrlSync } from "@/hooks/use-mail-url-sync";
import { useSettings } from "@/hooks/use-settings";
import { MobileAppSwitcher } from "@/components/mobile-app-switcher";
import { MailSidebar } from "./mail-sidebar";
import { MailCommandPalette } from "./mail-command-palette";
import { ComposeDialog, ComposeForm } from "./compose-dialog";
import {
  MailComposeProvider,
  flushComposeDraftSave,
  getMailComposeBridge,
  useMailComposeChrome,
} from "./mail-compose-context";
import { AttachmentPreviewDialog } from "./attachment-preview-dialog";
import { MessageList } from "./message-list";
import { MessageReader } from "./message-reader";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { mailQueryKeys } from "@/lib/mail/mail-query-keys";
import { useComposeDraftAutosave } from "@/hooks/use-compose-draft-autosave";
import { useRefreshGesture } from "@/hooks/use-refresh-gesture";
import { isDraftMessage } from "@/lib/mail/draft-utils";
import { classifyMessageEncryption } from "@/lib/mail/message-security";

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

function MailComposeAutosave({
  activeMailbox,
  accountEmail,
}: {
  activeMailbox: {
    client: import("@/lib/mail/jmap-client").StalwartJmapClient;
    session: import("@/lib/mail/types").JmapSession;
    mailboxes: import("@/lib/mail/types").JmapMailbox[];
    identities: import("@/lib/mail/types").JmapIdentity[];
    email: string;
  } | null;
  accountEmail: string;
}) {
  useComposeDraftAutosave({
    client: activeMailbox?.client ?? null,
    session: activeMailbox?.session ?? null,
    mailboxes: activeMailbox?.mailboxes ?? [],
    identities: activeMailbox?.identities ?? [],
    fallbackFromEmail: activeMailbox?.email ?? accountEmail,
    enabled: Boolean(activeMailbox),
  });
  return null;
}

export function MailApp() {
  const mail = useMailApp();

  if (mail.isSessionPending || !mail.session?.user) {
    return (
      <PageLoadingOverlay
        isLoading={true}
        messageContext="PAGE_LOAD"
        enableCycling
        priority
      />
    );
  }

  return (
    <MailComposeProvider identities={mail.activeMailbox?.identities ?? []}>
      <MailComposeAutosave
        activeMailbox={mail.activeMailbox}
        accountEmail={mail.accountEmail}
      />
      <MailAppContent mail={mail} />
    </MailComposeProvider>
  );
}

function MailAppContent({ mail }: { mail: ReturnType<typeof useMailApp> }) {
  const { isComposeOpen, setIsComposeOpen, isFullCompose, setIsFullCompose, dismissCompose } =
    useMailComposeChrome();
  const {
    session,
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
  } = mail;

  useRefreshGesture({
    enabled: Boolean(activeMailbox && session?.user),
    onRefresh: () => void handleManualRefresh(),
  });

  const { settings } = useSettings();
  const timeFormat = settings?.timeFormat ?? "24h";
  const [paletteInitialView, setPaletteInitialView] = useState<
    string | undefined
  >();
  const isMobile = useIsMobile();
  const [mailListSearch, setMailListSearch] = useState("");
  const [debouncedMailListSearch, setDebouncedMailListSearch] = useState("");
  const openedDraftIdRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMailListSearch(mailListSearch), 300);
    return () => clearTimeout(timer);
  }, [mailListSearch]);

  const mailboxId = activeMailbox?.selectedMailboxId ?? null;

  useEffect(() => {
    if (!selectedMessage || !activeMailbox) {
      openedDraftIdRef.current = null;
      return;
    }

    const mailboxes = activeMailbox.mailboxes ?? [];
    if (!isDraftMessage(selectedMessage, mailboxId, mailboxes)) {
      openedDraftIdRef.current = null;
      return;
    }

    if (openedDraftIdRef.current === selectedMessage.id) {
      return;
    }

    const bridge = getMailComposeBridge();
    if (!bridge) {
      return;
    }

    const encryption = classifyMessageEncryption(selectedMessage);
    const needsDecrypt =
      encryption === "inline_pgp" || encryption === "pgp_mime";

    if (
      needsDecrypt &&
      !selectedMessagePlaintext &&
      !selectedMessageDecryptError
    ) {
      return;
    }

    bridge.seedDraft(
      selectedMessage,
      needsDecrypt
        ? {
            plaintext: selectedMessagePlaintext,
            html: selectedMessageDecryptedHtml,
          }
        : undefined,
    );
    openedDraftIdRef.current = selectedMessage.id;
  }, [
    selectedMessage,
    mailboxId,
    activeMailbox,
    selectedMessagePlaintext,
    selectedMessageDecryptedHtml,
    selectedMessageDecryptError,
  ]);

  const {
    data: serverSearchResults,
    isFetching: isSearching,
  } = useQuery<JmapEmailMessage[]>({
    queryKey: mailQueryKeys.inlineSearch(mailboxId, debouncedMailListSearch),
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

  const messages = activeMailbox?.messages ?? [];

  const selectedIsDraft = Boolean(
    selectedMessage &&
      activeMailbox &&
      isDraftMessage(selectedMessage, mailboxId, activeMailbox.mailboxes),
  );

  const handleDismissCompose = useCallback(async () => {
    await flushComposeDraftSave();
    dismissCompose();
    openedDraftIdRef.current = null;
    setSelectedMessageId(null);
  }, [dismissCompose, setSelectedMessageId]);

  const handleSelectMessage = useCallback(
    (id: string | null) => {
      if (!id) {
        openedDraftIdRef.current = null;
        setSelectedMessageId(null);
        return;
      }

      const message =
        filteredListMessages.find((entry) => entry.id === id) ??
        messages.find((entry) => entry.id === id);

      if (
        message &&
        activeMailbox &&
        isDraftMessage(message, mailboxId, activeMailbox.mailboxes)
      ) {
        if (openedDraftIdRef.current === id && isFullCompose) {
          return;
        }
        openedDraftIdRef.current = null;
        setSelectedMessageId(id);
        return;
      }

      openedDraftIdRef.current = null;
      setSelectedMessageId(id);
    },
    [
      activeMailbox,
      filteredListMessages,
      isFullCompose,
      mailboxId,
      messages,
      setSelectedMessageId,
    ],
  );

  const handleBack = () => {
    if (isFullCompose) {
      void handleDismissCompose();
      return;
    }
    setSelectedMessageId(null);
  };
  const selectedIndex = messages.findIndex((m) => m.id === selectedMessageId);
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < messages.length - 1;

  const handleNavigatePrev = () => {
    if (hasPrev) handleSelectMessage(messages[selectedIndex - 1].id);
  };
  const handleNavigateNext = () => {
    if (hasNext) handleSelectMessage(messages[selectedIndex + 1].id);
  };
  const handleCloseMessage = () => {
    if (selectedIsDraft) {
      void handleDismissCompose();
      return;
    }
    setSelectedMessageId(null);
  };

  // Derive navigation state from current message list
  useMailUrlSync({
    activeMailbox,
    selectedMessageId,
    onSelectMailbox: refreshMailboxMessages,
    onSelectMessageId: setSelectedMessageId,
    openMessageById,
  });

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

  const isOverlayLoading = isMailboxStatusLoading || (isBusy && !activeMailbox);

  const selectedMailbox =
    activeMailbox?.mailboxes.find(
      (m) => m.id === activeMailbox.selectedMailboxId,
    ) ?? null;

  // On mobile: show reader/compose pane for real messages or the full composer
  const showMobileDetailPane =
    isMobile &&
    (isFullCompose || (Boolean(selectedMessageId) && !selectedIsDraft));

  return (
    <>
      <SidebarProvider className="h-svh max-h-svh min-h-0 overflow-hidden">
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
        <SidebarInset className="min-h-0 overflow-hidden">
          {activeMailbox ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
              {isMobile && !showMobileDetailPane && (
                <MobileMailHeader
                  selectedMailboxName={selectedMailbox?.name ?? "Inbox"}
                  mailboxMessageCount={activeMailbox.messages.length}
                  selectedMessageSubject={selectedMessage?.subject ?? null}
                  mailboxEmail={activeMailbox.email ?? accountEmail}
                  showReaderOnMobile={showMobileDetailPane}
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
                      ? showMobileDetailPane
                        ? "hidden"
                        : "flex h-full min-h-0 flex-1 flex-col overflow-hidden"
                      : "flex h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-r border-border/40"
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
                  <div className="flex min-h-0 flex-1 flex-col">
                    <MessageList
                    key={activeMailbox.selectedMailboxId ?? "mailbox-list"}
                    messages={filteredListMessages}
                    relatedMessages={[]}
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
                </div>

                {/* Message reader / inline composer — full screen on mobile when open */}
                <div
                  className={
                    isMobile
                      ? showMobileDetailPane
                        ? "flex flex-col w-full min-h-0 overflow-hidden relative"
                        : "hidden"
                      : "flex h-full min-h-0 min-w-0 flex-1 overflow-hidden relative"
                  }
                >
                  {/* Message reader — never shown for drafts */}
                  {selectedMessage && !selectedIsDraft ? (
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
                  ) : !isFullCompose ? (
                    <div className="absolute inset-0 flex items-center justify-center p-8">
                      <p className="text-sm text-muted-foreground">
                        {selectedIsDraft
                          ? "Opening draft…"
                          : "Select a message to read"}
                      </p>
                    </div>
                  ) : null}

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
                      identities={activeMailbox.identities}
                      fallbackFromEmail={activeMailbox.email ?? accountEmail}
                      onClose={() => void handleDismissCompose()}
                      onSend={async () => {
                        await handleSendMessage();
                        setIsFullCompose(false);
                      }}
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
        identities={activeMailbox?.identities ?? []}
        fallbackFromEmail={activeMailbox?.email ?? accountEmail}
        onClose={() => void handleDismissCompose()}
        onSend={handleSendMessage}
        onExpand={() => {
          setIsComposeOpen(false);
          setIsFullCompose(true);
        }}
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
