import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  getErrorMessage,
  resolveAttachmentPreviewKind,
  type MailAttachmentPreviewKind,
} from "@workspace/calendar-core";
import { useToast } from "../providers/ToastProvider";
import {
  releaseMarkAsReadSuppression,
  suppressMarkAsRead,
  useMailMutations,
} from "../lib/mail/use-mail";
import { isSpamMailboxRole } from "../lib/mail/mail-helpers";
import {
  shareCachedAttachment,
  writeAttachmentToCache,
} from "../lib/mail/attachment-cache";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import type { JmapAttachment, JmapEmailMessage } from "../lib/mail/types";

export type MessageSheetView = "menu" | "move" | "label" | "html" | null;

export type MailAttachmentPreview = {
  attachment: JmapAttachment;
  kind: MailAttachmentPreviewKind;
};

export function useMailMessageActions({
  messageId,
  message,
  runtime,
}: {
  messageId: string;
  message: JmapEmailMessage | null;
  runtime: MailRuntime | undefined;
}) {
  const { push, back } = useRouter();
  const { toast } = useToast();
  const {
    markAsRead,
    markAsUnread,
    toggleFlagged,
    moveToTrash,
    deleteMessage,
    moveToMailbox,
    setMessageLabel,
  } = useMailMutations(runtime, null);
  const [downloadingBlobId, setDownloadingBlobId] = useState<string | null>(
    null,
  );
  const [preview, setPreview] = useState<MailAttachmentPreview | null>(null);
  const [activeSheetView, setActiveSheetView] =
    useState<MessageSheetView>(null);
  const markReadHandledIdRef = useRef<string | null>(null);

  const isFlagged = Boolean(message?.keywords?.["$flagged"]);
  const isSeen = Boolean(message?.keywords?.["$seen"]);
  const { mutate: markAsReadMutate } = markAsRead;

  // Mark read once per visit; a mid-visit "mark unread" also claims the id so it is not undone.
  useEffect(() => {
    if (!runtime || !messageId || isSeen) return;
    if (markReadHandledIdRef.current === messageId) return;
    markReadHandledIdRef.current = messageId;
    markAsReadMutate(messageId);
  }, [isSeen, markAsReadMutate, messageId, runtime]);

  useEffect(() => {
    return () => {
      releaseMarkAsReadSuppression(messageId);
    };
  }, [messageId]);

  const currentMailboxId = message
    ? (Object.keys(message.mailboxIds ?? {})[0] ?? null)
    : null;
  const currentMailbox = runtime?.mailboxes.find((mailbox) =>
    currentMailboxId ? mailbox.id === currentMailboxId : false,
  );
  const currentMailboxRole = currentMailbox?.role ?? null;
  const inboxMailboxId =
    runtime?.mailboxes.find((mailbox) => mailbox.role === "inbox")?.id ?? null;
  const archiveMailboxId =
    runtime?.mailboxes.find((mailbox) => mailbox.role === "archive")?.id ??
    null;
  const spamMailboxId =
    runtime?.mailboxes.find((mailbox) => isSpamMailboxRole(mailbox.role))
      ?.id ?? null;
  const moveTargets = useMemo(() => {
    if (!runtime || !message) {
      return [];
    }

    const activeMailboxIds = new Set(Object.keys(message.mailboxIds ?? {}));
    return runtime.mailboxes.filter(
      (mailbox) => !activeMailboxIds.has(mailbox.id),
    );
  }, [message, runtime]);
  const isActionBusy =
    markAsUnread.isPending ||
    toggleFlagged.isPending ||
    moveToTrash.isPending ||
    deleteMessage.isPending ||
    moveToMailbox.isPending;

  const cacheAttachment = (attachment: JmapAttachment, cacheKey: string) =>
    writeAttachmentToCache({
      attachment,
      cacheKey,
      runtime,
    });

  // Stable per preview so the modal loads once instead of on every screen render.
  const loadPreview = useCallback(async () => {
    if (!preview) throw new Error("No attachment selected.");
    const { attachment } = preview;
    return writeAttachmentToCache({
      attachment,
      cacheKey: attachment.blobId ?? `preview-${attachment.name ?? "attachment"}`,
      runtime,
    });
  }, [preview, runtime]);

  const handleOpenAttachment = async (
    attachment: JmapAttachment,
    cacheKey: string,
  ) => {
    const kind = resolveAttachmentPreviewKind({
      name: attachment.name,
      type: attachment.type,
    });

    if (kind) {
      setPreview({ attachment, kind });
      return;
    }

    setDownloadingBlobId(cacheKey);
    try {
      const cached = await cacheAttachment(attachment, cacheKey);
      await shareCachedAttachment(cached);
    } catch (err) {
      toast(getErrorMessage(err, "Could not download attachment."), "error");
    } finally {
      setDownloadingBlobId(null);
    }
  };

  const openCompose = (mode: "reply" | "reply-all" | "forward") => {
    if (!messageId) return;
    setActiveSheetView(null);
    push({
      pathname: "/(tabs)/mail/compose",
      params: { mode, messageId },
    });
  };

  const handleToggleStar = () => {
    if (!message) return;
    toggleFlagged.mutate({
      messageId: message.id,
      flagged: !isFlagged,
    });
    toast(isFlagged ? "Unstarred" : "Starred");
    setActiveSheetView(null);
  };

  const handleMarkUnread = () => {
    if (!message) return;
    markReadHandledIdRef.current = message.id;
    suppressMarkAsRead(message.id);
    setActiveSheetView(null);
    markAsUnread.mutate(message.id, {
      onSuccess: () => toast("Marked as unread"),
      onError: (error) =>
        toast(
          getErrorMessage(error, "Failed to mark message as unread."),
          "error",
        ),
    });
  };

  const handleMoveToTrash = () => {
    if (!message) return;
    setActiveSheetView(null);
    const isTrash = currentMailboxRole === "trash";
    const mutation = isTrash ? deleteMessage : moveToTrash;
    mutation.mutate(message.id, {
      onSuccess: () => {
        toast(isTrash ? "Message deleted" : "Message moved to trash");
        back();
      },
      onError: (error) =>
        toast(
          getErrorMessage(
            error,
            isTrash
              ? "Failed to delete the message."
              : "Failed to move message to trash.",
          ),
          "error",
        ),
    });
  };

  const moveMessage = (
    targetMailboxId: string,
    successMessage: string,
    failureMessage: string,
  ) => {
    if (!message) return;
    moveToMailbox.mutate(
      { messageId: message.id, targetMailboxId },
      {
        onSuccess: () => {
          setActiveSheetView(null);
          toast(successMessage);
          back();
        },
        onError: (error) =>
          toast(getErrorMessage(error, failureMessage), "error"),
      },
    );
  };

  const handleMoveToMailbox = (targetMailboxId: string) =>
    moveMessage(targetMailboxId, "Message moved", "Failed to move the message.");

  const handleArchive = () => {
    if (!archiveMailboxId) {
      toast("No archive mailbox is configured", "info");
      return;
    }
    handleMoveToMailbox(archiveMailboxId);
  };

  const handleRestoreToInbox = () => {
    if (!inboxMailboxId) {
      toast("No inbox mailbox is configured for this account", "info");
      return;
    }
    handleMoveToMailbox(inboxMailboxId);
  };

  const handleReportSpam = () => {
    if (!message) return;
    if (!spamMailboxId) {
      toast("No spam mailbox is configured", "info");
      return;
    }
    moveMessage(spamMailboxId, "Reported as spam", "Failed to report spam.");
  };

  const handleSetLabel = (labelId: string, assigned: boolean) => {
    if (!message) return;
    setMessageLabel.mutate({ messageId: message.id, labelId, assigned });
  };

  return {
    activeSheetView,
    setActiveSheetView,
    preview,
    closePreview: () => setPreview(null),
    loadPreview,
    downloadingBlobId,
    isFlagged,
    isSeen,
    isStarPending: toggleFlagged.isPending,
    isActionBusy,
    currentMailbox,
    currentMailboxRole,
    inboxMailboxId,
    archiveMailboxId,
    spamMailboxId,
    moveTargets,
    handleOpenAttachment,
    handleReply: () => openCompose("reply"),
    handleReplyAll: () => openCompose("reply-all"),
    handleForward: () => openCompose("forward"),
    handleToggleStar,
    handleMarkUnread,
    handleMoveToTrash,
    handleMoveToMailbox,
    handleArchive,
    handleRestoreToInbox,
    handleReportSpam,
    handleSetLabel,
  };
}

export type MailMessageActions = ReturnType<typeof useMailMessageActions>;
