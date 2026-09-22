"use client";

import { Typography, TypographySize } from "@workspace/ui/solace";
import { ComposeForm } from "../compose-dialog";
import { MessageReader } from "../message-reader";
import type { MailAppContentController } from "../use-mail-app-content-controller";

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
    isConversationLoading,
    isMessageBodyLoading,
    selectedMessageIsDecrypting,
    conversationDecryptedPreviews,
    setSelectedConversationMessageId,
    selectedMessagePlaintext,
    selectedMessageDecryptedHtml,
    selectedMessageDecryptedAttachments,
    selectedMessageSignatureVerificationState,
    selectedMessageDecryptError,
    activeMailbox,
    isBusy,
    handleReply,
    handleForward,
    handleDeleteMessage,
    handleMoveMessage,
    handleMarkAsUnread,
    handleToggleFlagged,
    handleSetMessageLabel,
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
    composeSessionId,
    handleDismissCompose,
    handleFullComposeSend,
    handleComposeImageUpload,
  } = controller;

  if (!activeMailbox) {
    return null;
  }

  const readerOpen =
    isMobile
      ? showMobileDetailPane
      : Boolean((selectedMessage && !selectedIsDraft) || isFullCompose);

  return (
    <div
      className={
        !readerOpen
          ? "hidden"
          : isMobile
            ? "relative flex w-full min-h-0 flex-col overflow-hidden"
            : "relative flex h-full min-h-0 min-w-0 w-[42%] shrink-0 overflow-hidden bg-[var(--bg-l2-solid)]"
      }
    >
      {selectedMessage && !selectedIsDraft ? (
        <div
          className="absolute inset-0 flex flex-col transition-[transform,opacity] duration-200 ease-in-out"
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
            conversationPreviews={conversationDecryptedPreviews}
            loading={{
              conversation: isConversationLoading,
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
            decryptError={selectedMessageDecryptError}
            accountEncryptedAtRest={activeMailbox.accountEncryptedAtRest}
            isBusy={isBusy}
            mailboxes={activeMailbox.mailboxes}
            currentMailboxId={activeMailbox.selectedMailboxId}
            onReply={handleReply}
            onForward={handleForward}
            onDelete={() => void handleDeleteMessage()}
            onMove={(targetId) => void handleMoveMessage(targetId)}
            onMarkAsUnread={() => void handleMarkAsUnread()}
            onToggleFlagged={() => void handleToggleFlagged(selectedMessage.id)}
            onSetLabel={(labelId, assigned) =>
              selectedMessage
                ? void handleSetMessageLabel(
                    selectedMessage.id,
                    labelId,
                    assigned,
                  )
                : undefined
            }
            onCreateLabel={(name, color) => handleCreateLabel(name, color)}
            onUpdateLabel={(id, updates) => void handleUpdateLabel(id, updates)}
            onDeleteLabel={(id) => void handleDeleteLabel(id)}
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
            onUntrash={() => void handleUntrash()}
            onReportSpam={() => void handleReportSpam()}
            onNotSpam={() => void handleNotSpam()}
            onConversationMessageDelete={(id) => void handleDeleteMessage(id)}
            onConversationMessageMarkUnread={(id) =>
              void handleMarkAsUnread(id)
            }
            onConversationMessageMove={(id, mailboxId) =>
              void handleMoveMessage(mailboxId, id)
            }
            accountEmail={activeMailbox?.email ?? accountEmail}
            accountName={accountDisplayName}
            identities={activeMailbox.pickerIdentities}
            mailServerLimits={composeMailPolicy.limits}
          />
        </div>
      ) : !isFullCompose ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-8">
          <Typography color="disabled" size={TypographySize.H4}>
            Select a conversation
          </Typography>
          <Typography color="disabled" size={TypographySize.SMALL}>
            Choose a message from the list to read it
          </Typography>
        </div>
      ) : null}

      <div
        className="absolute inset-0 flex flex-col transition-[transform,opacity] duration-200 ease-in-out"
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
          onClose={() => void handleDismissCompose()}
          onSend={handleFullComposeSend}
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
    </div>
  );
}
