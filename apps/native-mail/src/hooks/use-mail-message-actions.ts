import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import {
  getErrorMessage,
  resolveAttachmentPreviewKind,
  resolveMarkAsReadDelayMs,
  type MailAttachmentPreviewKind,
} from "@workspace/calendar-core";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useMailCompose } from "../providers/MailComposeProvider";
import {
  releaseMarkAsReadSuppression,
  suppressMarkAsRead,
  useMailMutations,
  useSimpleLoginAliasAction,
} from "../lib/mail/use-mail";
import { isSpamMailboxRole } from "../lib/mail/mail-helpers";
import { useMailListSettings } from "./use-mail-list-settings";
import { useMailUndoToast } from "./use-mail-undo-toast";
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
  const { back } = useRouter();
  const { openCompose: presentCompose } = useMailCompose();
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
  const simpleLoginAction = useSimpleLoginAliasAction(runtime);
  const { settings: listSettings, isLoaded: listSettingsLoaded } =
    useMailListSettings();
  const showMoveToast = useMailUndoToast(runtime);
  const markAsReadDelayMs = resolveMarkAsReadDelayMs(
    listSettings.markAsReadDelay,
  );
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
    if (!runtime || !messageId || isSeen || !listSettingsLoaded) return;
    if (markAsReadDelayMs === null) return;
    if (markReadHandledIdRef.current === messageId) return;
    const markRead = () => {
      if (markReadHandledIdRef.current === messageId) return;
      markReadHandledIdRef.current = messageId;
      markAsReadMutate(messageId);
    };
    if (markAsReadDelayMs === 0) {
      markRead();
      return;
    }
    const timer = setTimeout(markRead, markAsReadDelayMs);
    return () => clearTimeout(timer);
  }, [
    isSeen,
    listSettingsLoaded,
    markAsReadDelayMs,
    markAsReadMutate,
    messageId,
    runtime,
  ]);

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
    runtime?.mailboxes.find((mailbox) => isSpamMailboxRole(mailbox.role))?.id ??
    null;
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
      cacheKey:
        attachment.blobId ?? `preview-${attachment.name ?? "attachment"}`,
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
    presentCompose({ mode, messageId });
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
    if (isTrash) {
      Alert.alert(
        "Delete forever?",
        "This message will be permanently deleted. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => runTrashAction(message.id, true),
          },
        ],
      );
      return;
    }
    runTrashAction(message.id, false);
  };

  const runTrashAction = (targetMessageId: string, isTrash: boolean) => {
    const mutation = isTrash ? deleteMessage : moveToTrash;
    mutation.mutate(targetMessageId, {
      onSuccess: (_data, _messageId, snapshot) => {
        if (isTrash) {
          toast("Message deleted");
        } else {
          showMoveToast("Message moved to trash", snapshot);
        }
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
        onSuccess: (_data, _input, snapshot) => {
          setActiveSheetView(null);
          showMoveToast(successMessage, snapshot);
          back();
        },
        onError: (error) =>
          toast(getErrorMessage(error, failureMessage), "error"),
      },
    );
  };

  const handleMoveToMailbox = (targetMailboxId: string) =>
    moveMessage(
      targetMailboxId,
      "Message moved",
      "Failed to move the message.",
    );

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

  const handleSimpleLoginAction = (target: JmapEmailMessage) => {
    simpleLoginAction.mutate(target, {
      onSuccess: (action) => toast(action.doneLabel, "success"),
      onError: (error) =>
        toast(getErrorMessage(error, "Could not reach SimpleLogin."), "error"),
    });
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
    handleSimpleLoginAction,
    isSimpleLoginPending: simpleLoginAction.isPending,
  };
}

export type MailMessageActions = ReturnType<typeof useMailMessageActions>;
