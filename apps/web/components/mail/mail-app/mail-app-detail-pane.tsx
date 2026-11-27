"use client";

import { useLayoutEffect, useRef } from "react";
import { createLogger } from "@workspace/logger";
import { MOTION_EASING, revealSequence } from "@workspace/ui/lib/motion";
import { Logo } from "@workspace/ui/components/layout";
import { Typography, TypographySize, TypographyWeight } from "@workspace/ui/solace";
import { ComposeForm } from "../compose-dialog";
import { MessageReader } from "../message-reader";
import type { MailAppContentController } from "../use-mail-app-content-controller";
import { MailReaderLayer, MailReaderPending, useMailReaderDrawer } from "./mail-reader-layer";

const log = createLogger("mail-app-detail-pane");

export function MailAppDetailPane({
  controller,
}: {
  controller: MailAppContentController;
}) {
  const {
    isMobile,
    showMobileDetailPane,
    isFullCompose,
    selectedMessage,
    selectedIsDraft,
    selectedMessageId,
    selectedConversationMessages,
    isSelectedConversationReady,
    isMessageBodyLoading,
    selectedMessageIsDecrypting,
    conversationDecryptedPreviews,
    conversationAttachments,
    setSelectedConversationMessageId,
    selectedMessagePlaintext,
    selectedMessageDecryptedHtml,
    selectedMessageDecryptedAttachments,
    selectedMessageSignatureVerificationState,
    selectedMessageSenderKeyTrustState,
    selectedMessageDecryptError,
    selectedMessageReadState,
    activeMailbox,
    isBusy,
    handleReply,
    handleReplyAll,
    handleForward,
    handleDeleteMessage,
    handleMoveMessage,
    handleMarkAsUnread,
    handleToggleFlagged,
    handleSetMessageLabel,
    handleSimpleLoginAction,
    handleUnsubscribe,
    handleCreateLabel,
    handleUpdateLabel,
    handleDeleteLabel,
    labels,
    timeFormat,
    timezone,
    handleCloseMessage,
    handleNavigatePrev,
    handleNavigateNext,
    hasPrev,
    hasNext,
    handleArchive,
    handleQuickReply,
    loadAttachmentHoverPreview,
    handlePreviewAttachment,
    handleDownloadAttachment,
    handleUntrash,
    handleReportSpam,
    handleNotSpam,
    accountEmail,
    accountDisplayName,
    composeMailPolicy,
    composeScheduling,
    composeSessionId,
    handleDismissCompose,
    handleFullComposeSend,
    handleComposeImageUpload,
  } = controller;
  // Each conversation gets its own surface, so the last stays on screen until the next has loaded.
  const openKey = selectedMessage && !selectedIsDraft ? (selectedMessage.threadId ?? selectedMessage.id) : null;
  const drawer = useMailReaderDrawer(openKey, isSelectedConversationReady);

  if (!activeMailbox) {
    return null;
  }

  const panes = (
    <>
      <div
        className="absolute inset-0 transition-[transform,opacity] duration-200 ease-in-out motion-reduce:transition-opacity"
        style={{
          opacity: isFullCompose ? 0 : 1,
          transform: isFullCompose ? "translateX(-16px)" : "translateX(0)",
          pointerEvents: isFullCompose ? "none" : "auto",
        }}
      >
        {/* On mobile the reader only shows once a message is picked, so it never needs the empty state. */}
        {drawer.showEmpty && !isMobile ? <MailReaderEmptyState /> : null}
        {drawer.layers.map(({ key, revealed, slideIn, leaving }) => (
          <MailReaderLayer
            key={key}
            revealed={revealed}
            slideIn={slideIn}
            leaving={leaving}
            onEntered={() => drawer.finishEnter(key)}
            onLeft={drawer.finishLeave}
          >
            {key === openKey && selectedMessage ? (
              <MessageReader
                message={selectedMessage}
                selectedMessageId={selectedMessage?.id ?? null}
                conversationMessages={selectedConversationMessages}
                conversationPreviews={conversationDecryptedPreviews}
                conversationAttachments={conversationAttachments}
                loading={{
                  messageBody: isMessageBodyLoading,
                  decrypting: selectedMessageIsDecrypting,
                }}
                onSelectConversationMessage={(id) =>
                  setSelectedConversationMessageId(id)
                }
                plaintext={selectedMessagePlaintext}
                decryptedHtml={selectedMessageDecryptedHtml}
                attachments={selectedMessageDecryptedAttachments ?? undefined}
                signatureVerificationState={
                  selectedMessageSignatureVerificationState
                }
                senderKeyTrustState={selectedMessageSenderKeyTrustState}
                decryptError={selectedMessageDecryptError}
                readState={selectedMessageReadState}
                accountEncryptedAtRest={activeMailbox.accountEncryptedAtRest}
                isBusy={isBusy}
                mailboxes={activeMailbox.mailboxes}
                currentMailboxId={activeMailbox.selectedMailboxId}
                onReply={handleReply}
                onReplyAll={handleReplyAll}
                onForward={handleForward}
                onDelete={() =>
                  void handleDeleteMessage().catch((error) =>
                    log.error("Failed to delete message", error),
                  )
                }
                onMove={(targetId) =>
                  void handleMoveMessage(targetId).catch((error) =>
                    log.error("Failed to move message", error),
                  )
                }
                onMarkAsUnread={() =>
                  void handleMarkAsUnread().catch((error) =>
                    log.error("Failed to mark message as unread", error),
                  )
                }
                onToggleFlagged={() =>
                  void handleToggleFlagged(selectedMessage.id).catch((error) =>
                    log.error("Failed to toggle flagged", error),
                  )
                }
                onSetLabel={(labelId, assigned) =>
                  selectedMessage
                    ? void handleSetMessageLabel(
                        selectedMessage.id,
                        labelId,
                        assigned,
                      ).catch((error) =>
                        log.error("Failed to set message label", error),
                      )
                    : undefined
                }
                onSimpleLoginAction={(message, mode) =>
                  void handleSimpleLoginAction(message, mode).catch((error) =>
                    log.error("Failed to run SimpleLogin action", error),
                  )
                }
                onUnsubscribe={(message) =>
                  void handleUnsubscribe(message).catch((error) =>
                    log.error("Failed to unsubscribe", error),
                  )
                }
                onCreateLabel={(name, color) => handleCreateLabel(name, color)}
                onUpdateLabel={(id, updates) =>
                  void handleUpdateLabel(id, updates).catch((error) =>
                    log.error("Failed to update label", error),
                  )
                }
                onDeleteLabel={(id) =>
                  void handleDeleteLabel(id).catch((error) =>
                    log.error("Failed to delete label", error),
                  )
                }
                labels={labels}
                timeFormat={timeFormat}
                timezone={timezone}
                onClose={handleCloseMessage}
                onNavigatePrev={handleNavigatePrev}
                onNavigateNext={handleNavigateNext}
                navigation={{ hasPrev, hasNext }}
                onArchive={handleArchive}
                onSendReply={handleQuickReply}
                onLoadAttachmentPreview={loadAttachmentHoverPreview}
                onPreviewAttachment={handlePreviewAttachment}
                onDownloadAttachment={handleDownloadAttachment}
                onUntrash={() =>
                  void handleUntrash().catch((error) =>
                    log.error("Failed to move out of trash", error),
                  )
                }
                onReportSpam={() =>
                  void handleReportSpam().catch((error) =>
                    log.error("Failed to report spam", error),
                  )
                }
                onNotSpam={() =>
                  void handleNotSpam().catch((error) =>
                    log.error("Failed to move out of spam", error),
                  )
                }
                onConversationMessageDelete={(id) =>
                  void handleDeleteMessage(id).catch((error) =>
                    log.error("Failed to delete message", error),
                  )
                }
                onConversationMessageMarkUnread={(id) =>
                  void handleMarkAsUnread(id).catch((error) =>
                    log.error("Failed to mark message as unread", error),
                  )
                }
                onConversationMessageMove={(id, mailboxId) =>
                  void handleMoveMessage(mailboxId, id).catch((error) =>
                    log.error("Failed to move message", error),
                  )
                }
                accountEmail={activeMailbox?.email ?? accountEmail}
                accountName={accountDisplayName}
                identities={activeMailbox.pickerIdentities}
                mailServerLimits={composeMailPolicy.limits}
              />
            ) : undefined}
          </MailReaderLayer>
        ))}
        {drawer.pending ? <MailReaderPending /> : null}
      </div>

      <div
        className="absolute inset-0 flex flex-col transition-[transform,opacity] duration-200 ease-in-out motion-reduce:transition-opacity"
        style={{
          opacity: isFullCompose ? 1 : 0,
          transform: isFullCompose ? "translateX(0)" : "translateX(16px)",
          pointerEvents: isFullCompose ? "auto" : "none",
        }}
      >
        <ComposeForm
          key={composeSessionId}
          identities={activeMailbox.pickerIdentities}
          fallbackFromEmail={activeMailbox.email ?? accountEmail}
          onClose={() => handleDismissCompose()}
          onSend={handleFullComposeSend}
          scheduling={composeScheduling}
          onImageUpload={handleComposeImageUpload}
          activeMailbox={
            activeMailbox
              ? {
                  client: activeMailbox.client,
                  session: activeMailbox.session,
                }
              : null
          }
          isBusy={isBusy}
        />
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div
        className={
          showMobileDetailPane
            ? "relative flex w-full min-h-0 flex-col overflow-hidden"
            : "hidden"
        }
      >
        {panes}
      </div>
    );
  }

  // The reader is always beside the list on desktop, so opening a message never moves the list.
  return (
    <div className="relative min-w-0 flex-1 overflow-hidden">
      {panes}
    </div>
  );
}

/** What the reader shows with nothing open: a small stack of envelopes sealed with the Solace mark. */
function MailReaderEmptyState() {
  const rootRef = useRef<HTMLDivElement>(null);
  // The envelopes, then the words, lift in once painted; each time a message closes the empty pane arrives the same way.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return revealSequence(root, [
      { selector: "[data-empty-reveal]", offset: { y: 6 }, duration: 260, stagger: 60, easing: MOTION_EASING.soft },
    ]);
  }, []);

  return (
    <div ref={rootRef} className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
      <div data-empty-reveal aria-hidden className="relative h-[104px] w-[150px]">
        <span className="absolute top-1.5 left-4 h-[78px] w-[118px] -rotate-8 rounded-[10px] border-[1.5px] border-[var(--border-secondary)] bg-[var(--bg-l2-solid)]" />
        <span className="absolute top-1.5 left-4 h-[78px] w-[118px] rotate-6 rounded-[10px] border-[1.5px] border-[var(--border-secondary)] bg-[var(--bg-l2-solid)]" />
        <span className="absolute top-3.5 left-3 h-[84px] w-[126px] overflow-hidden rounded-[11px] border-[1.5px] border-[var(--border-primary)] bg-[var(--bg-l3-solid)]">
          <svg viewBox="0 0 126 84" className="absolute inset-0 size-full text-[var(--border-primary)]">
            <path d="M2 4 L63 46 L124 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="absolute top-10 left-1/2 flex size-[26px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent">
            <Logo width="15" height="15" className="text-accent-foreground" />
          </span>
        </span>
      </div>
      <div data-empty-reveal className="mt-6 flex flex-col items-center gap-1">
        <Typography size={TypographySize.MEDIUM} weight={TypographyWeight.MEDIUM}>
          Select a conversation
        </Typography>
        <Typography color="tertiary" size={TypographySize.SMALL}>
          Messages you open will appear here
        </Typography>
      </div>
    </div>
  );
}
