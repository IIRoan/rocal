"use client";

import {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  useReducer,
  type ReactNode,
} from "react";
import {
  buildEventReminderMailView,
  enrichSelfMailRecipient,
  getErrorMessage,
  isDecryptedEventReminderContent,
  pickOutgoingAttachmentFiles,
  resolveMailServerLimits,
} from "@workspace/calendar-core";
import { useQuery } from "@tanstack/react-query";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Clock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile, usePrefersReducedMotion } from "@workspace/ui/hooks";
import type { CalendarEvent } from "@workspace/calendar-core";
import { getAllMessageLabels } from "@/lib/mail/mail-labels";
import { isSpamMailboxRole } from "@/lib/mail/mail-mailbox-roles";
import type { MailAttachment } from "@/lib/mail/types";
import {
  classifyMessageEncryption,
  extractMessageBodies,
} from "@/lib/mail/message-security";
import {
  cleanInviteMailHtml,
  cleanInviteMailText,
} from "@/lib/mail/invite-boilerplate";
import { messageHasLoadedBody } from "@/lib/mail/mail-message-body";
import { splitPlaintextQuote, splitHtmlQuote } from "@/lib/mail/quoted-text";
import {
  resolveMailContentIsDark,
  shouldBlockRemoteImages,
  htmlContainsRemoteResources,
  useMailDisplaySettings,
} from "@/lib/mail/mail-display-settings";
import {
  extractLinkedCalendarEventId,
  extractReminderLeadMinutes,
  getCalendarEventLinkSource,
  isSolaceEventReminderEmail,
} from "@/lib/mail/calendar-event-link";
import { calendarApiService } from "@/lib/calendar-api-service";
import { useMailCalendarInvitation } from "@/hooks/use-mail-calendar-invitation";
import {
  initialMessageReaderChromeState,
  initialMessageReaderUiState,
  messageReaderChromeReducer,
  messageReaderUiReducer,
  type MessageReaderChromeAction,
  type MessageReaderUiAction,
} from "./message-reader-ui-state";
import type { MessageReaderProps } from "./message-reader-types";
import { EMPTY_ARRAY, MOVE_EXCLUDED_ROLES } from "./message-reader/constants";

type LinkedCalendarEventState = {
  eventId: string;
  event: CalendarEvent | null;
  loading: boolean;
  error: string | null;
};

export type MessageReaderViewModel = {
  message: NonNullable<MessageReaderProps["message"]>;
  isFlagged: boolean;
  messageLabels: ReturnType<typeof getAllMessageLabels>;
  messageState: ReturnType<typeof classifyMessageEncryption>;
  displayHtml: string;
  displayText: string;
  renderAsHtml: boolean;
  senderEmail: string;
  senderName: string | undefined;
  enrichedSender: ReturnType<typeof enrichSelfMailRecipient>;
  otherMailboxes: MessageReaderProps["mailboxes"];
  orderedConversationMessages: NonNullable<
    MessageReaderProps["conversationMessages"]
  >;
  showConversation: boolean;
  ownMessageCount: number;
  visibleConversationMessages: NonNullable<
    MessageReaderProps["conversationMessages"]
  >;
  isInTrash: boolean;
  isInSpam: boolean;
  canReportSpam: boolean;
  canNotSpam: boolean;
  plaintextBody: string;
  plaintextQuote: string;
  cleanHtml: string;
  htmlHasQuote: boolean;
  hasRemoteContent: boolean;
  shouldReplaceBodyWithEventReminder: boolean;
  isReminderEventLoading: boolean;
  eventReminderView: ReturnType<typeof buildEventReminderMailView> | null;
  bodyAttachedAbove: boolean;
  mailCalendarInviteMeta:
    | Array<{ icon: typeof Clock; children: string }>
    | undefined;
};

export function useMessageReaderController(props: MessageReaderProps) {
  const {
    message,
    selectedMessageId,
    conversationMessages = EMPTY_ARRAY,
    loading,
    plaintext,
    decryptedHtml,
    attachments,
    accountEncryptedAtRest,
    isBusy,
    mailboxes,
    currentMailboxId,
    labels = EMPTY_ARRAY,
    onReply,
    onSendReply,
    onLoadAttachmentPreview,
    timeFormat,
    timezone,
    navigation,
    onReportSpam,
    onNotSpam,
    accountEmail,
    accountName,
    mailServerLimits = resolveMailServerLimits({}),
  } = props;
  const isMessageBodyLoading = loading?.messageBody ?? false;
  const isDecrypting = loading?.decrypting ?? false;
  const hasPrev = navigation?.hasPrev;
  const hasNext = navigation?.hasNext;
  const { settings: displaySettings } = useMailDisplaySettings();
  const [allowExternalContent, setAllowExternalContent] = useState(
    () => displaySettings.externalContentPolicy === "allow",
  );
  const externalContentKey = `${message?.id ?? ""}:${displaySettings.externalContentPolicy}`;
  const [prevExternalContentKey, setPrevExternalContentKey] =
    useState(externalContentKey);
  if (prevExternalContentKey !== externalContentKey) {
    setPrevExternalContentKey(externalContentKey);
    setAllowExternalContent(displaySettings.externalContentPolicy === "allow");
  }
  const externalContentSenderEmail = message?.from?.[0]?.email ?? null;
  const blockRemoteImages = shouldBlockRemoteImages({
    policy: displaySettings.externalContentPolicy,
    allowExternalContent,
    senderEmail: externalContentSenderEmail,
    trustedSenders: displaySettings.trustedSenders,
  });
  const blockTrackingPixels = displaySettings.blockTrackingPixels;
  const isDark = resolveMailContentIsDark(displaySettings);
  const [chrome, dispatchChrome] = useReducer(
    messageReaderChromeReducer,
    initialMessageReaderChromeState,
  );
  const {
    labelPopoverOpen,
    moreActionsOpen,
    morePopoverOpen,
    moveToExpanded,
    isBodyExpanded,
    showOwnMessages,
    showRawHtmlDialog,
  } = chrome;
  const [messageUi, dispatchMessageUi] = useReducer(
    messageReaderUiReducer,
    initialMessageReaderUiState,
  );
  const {
    replyText,
    attachedFiles,
    emojiPickerOpen,
    isSendingReply,
    isReplyExpanded,
    attachmentHoverPreviews,
    loadingAttachmentPreviewKey,
    showQuote,
    isConversationCollapsed,
  } = messageUi;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedWrapRef = useRef<HTMLDivElement>(null);
  const replyHasInit = useRef(false);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const prefersReducedMotion = usePrefersReducedMotion();
  const calendarEventLinkSource = useMemo(
    () => (message ? getCalendarEventLinkSource(message, plaintext) : null),
    [message, plaintext],
  );
  const linkedCalendarEventId = useMemo(
    () =>
      calendarEventLinkSource
        ? extractLinkedCalendarEventId(message!, plaintext)
        : null,
    [calendarEventLinkSource, message, plaintext],
  );
  const calendarInvitation = useMailCalendarInvitation({
    message,
    plaintext,
    attachments,
  });
  const {
    hasCalendarInvitationHint,
    mailCalendarInvite,
    currentCalendarInviteEvent,
    inviteDeclined,
    inviteCancelled,
    inviteResponsePending,
    cancelProcessPending,
    handleInvitationResponse,
    handleCancelRemove,
  } = calendarInvitation;
  const isEventReminderEmail = useMemo(() => {
    if (hasCalendarInvitationHint) {
      return false;
    }
    if (
      mailCalendarInvite?.method === "REQUEST" ||
      mailCalendarInvite?.method === "CANCEL"
    ) {
      return false;
    }
    return calendarEventLinkSource
      ? isSolaceEventReminderEmail(calendarEventLinkSource)
      : false;
  }, [
    calendarEventLinkSource,
    hasCalendarInvitationHint,
    mailCalendarInvite?.method,
  ]);
  const {
    data: linkedEventData,
    isLoading: isLinkedEventLoading,
    isError: isLinkedEventError,
    error: linkedEventQueryError,
  } = useQuery({
    queryKey: ["events", "detail", linkedCalendarEventId],
    enabled: Boolean(isEventReminderEmail && linkedCalendarEventId),
    queryFn: () => calendarApiService.getEvent(linkedCalendarEventId!),
  });
  const linkedCalendarEvent = useMemo((): LinkedCalendarEventState | null => {
    if (!isEventReminderEmail || !linkedCalendarEventId) {
      return null;
    }
    if (isLinkedEventLoading) {
      return {
        eventId: linkedCalendarEventId,
        event: null,
        loading: true,
        error: null,
      };
    }
    if (isLinkedEventError) {
      return {
        eventId: linkedCalendarEventId,
        event: null,
        loading: false,
        error: getErrorMessage(
          linkedEventQueryError,
          "Unable to load linked event details.",
        ),
      };
    }
    return {
      eventId: linkedCalendarEventId,
      event: linkedEventData ?? null,
      loading: false,
      error: null,
    };
  }, [
    isEventReminderEmail,
    linkedCalendarEventId,
    isLinkedEventLoading,
    isLinkedEventError,
    linkedEventQueryError,
    linkedEventData,
  ]);
  const mailCalendarInviteMeta = useMemo(() => {
    if (!mailCalendarInvite) return undefined;

    const items = [];
    if (mailCalendarInvite.start) {
      items.push({
        icon: Clock,
        children: mailCalendarInvite.start.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
          hour12:
            timeFormat === "12h"
              ? true
              : timeFormat === "24h"
                ? false
                : undefined,
          timeZone: timezone ?? undefined,
        }),
      });
    }
    if (mailCalendarInvite.location) {
      items.push({
        icon: MapPin,
        children: mailCalendarInvite.location,
      });
    }

    return items.length > 0 ? items : undefined;
  }, [mailCalendarInvite, timeFormat, timezone]);

  useEffect(() => {
    dispatchMessageUi({ type: "reset" });
  }, [message?.id]);

  const eventReminderView = useMemo(() => {
    if (!linkedCalendarEvent?.event) {
      return null;
    }
    if (!isDecryptedEventReminderContent(linkedCalendarEvent.event)) {
      return null;
    }

    return buildEventReminderMailView({
      event: linkedCalendarEvent.event,
      minutesBefore: calendarEventLinkSource
        ? extractReminderLeadMinutes(calendarEventLinkSource)
        : null,
      timezone: timezone ?? undefined,
      timeFormat,
    });
  }, [calendarEventLinkSource, linkedCalendarEvent, timeFormat, timezone]);

  const shouldReplaceBodyWithEventReminder = Boolean(
    isEventReminderEmail &&
      eventReminderView &&
      linkedCalendarEvent &&
      !linkedCalendarEvent.loading &&
      !linkedCalendarEvent.error,
  );
  const isReminderEventLoading = Boolean(
    isEventReminderEmail &&
      linkedCalendarEvent &&
      (linkedCalendarEvent.loading ||
        (!shouldReplaceBodyWithEventReminder && !linkedCalendarEvent.error)),
  );

  const displayAttachments = useMemo<MailAttachment[]>(() => {
    const all = attachments ?? message?.attachments ?? [];
    if (!displaySettings.hideInlineImageAttachments) return all;
    return all.filter(
      (attachment) =>
        !(
          attachment.disposition === "inline" &&
          Boolean(attachment.cid?.trim())
        ),
    );
  }, [
    attachments,
    displaySettings.hideInlineImageAttachments,
    message?.attachments,
  ]);

  const handleLoadAttachmentHoverPreview = useCallback(
    (attachment: MailAttachment, previewKey: string) => {
      if (
        !displaySettings.attachmentImagePreviewsEnabled ||
        !onLoadAttachmentPreview ||
        previewKey in attachmentHoverPreviews
      ) {
        return;
      }

      dispatchMessageUi({
        type: "patch",
        patch: { loadingAttachmentPreviewKey: previewKey },
      });
      void onLoadAttachmentPreview(attachment)
        .then((preview) => {
          dispatchMessageUi({
            type: "updateAttachmentHoverPreviews",
            updater: (current) => ({
              ...current,
              [previewKey]: preview,
            }),
          });
        })
        .catch(() => {
          dispatchMessageUi({
            type: "updateAttachmentHoverPreviews",
            updater: (current) => ({
              ...current,
              [previewKey]: null,
            }),
          });
        })
        .finally(() => {
          dispatchMessageUi({
            type: "clearLoadingAttachmentPreviewKeyIf",
            previewKey,
          });
        });
    },
    [
      attachmentHoverPreviews,
      displaySettings.attachmentImagePreviewsEnabled,
      onLoadAttachmentPreview,
    ],
  );

  const handleSendReply = useCallback(async () => {
    if (onSendReply) {
      if (!replyText.trim()) {
        toast.error("Enter a reply message.");
        return;
      }
      dispatchMessageUi({ type: "patch", patch: { isSendingReply: true } });
      try {
        await onSendReply(replyText, attachedFiles);
        dispatchMessageUi({
          type: "patch",
          patch: { replyText: "", attachedFiles: [] },
        });
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not send reply."));
      } finally {
        dispatchMessageUi({ type: "patch", patch: { isSendingReply: false } });
      }
    } else {
      onReply();
      dispatchMessageUi({ type: "patch", patch: { replyText: "" } });
    }
  }, [replyText, attachedFiles, onSendReply, onReply]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const accepted = pickOutgoingAttachmentFiles(
        Array.from(e.target.files ?? []),
        {
          maxBytes: mailServerLimits.maxOutgoingAttachmentBytes,
          onReject: (error) => toast.error(error),
        },
      );
      if (accepted.length > 0) {
        dispatchMessageUi({ type: "appendAttachedFiles", files: accepted });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [mailServerLimits],
  );

  useGSAP(
    () => {
      const wrap = expandedWrapRef.current;
      if (!wrap) return;

      if (!replyHasInit.current) {
        replyHasInit.current = true;
        if (isReplyExpanded) {
          gsap.set(wrap, { height: "auto", autoAlpha: 1, overflow: "visible" });
        } else {
          gsap.set(wrap, { height: 0, autoAlpha: 0, overflow: "hidden" });
        }
        return;
      }

      gsap.killTweensOf(wrap);

      if (prefersReducedMotion) {
        gsap.set(
          wrap,
          isReplyExpanded
            ? { height: "auto", autoAlpha: 1, overflow: "visible" }
            : { height: 0, autoAlpha: 0, overflow: "hidden" },
        );
        return;
      }

      if (isReplyExpanded) {
        gsap.set(wrap, { overflow: "hidden" });
        gsap.to(wrap, {
          height: "auto",
          autoAlpha: 1,
          duration: 0.28,
          ease: "power2.out",
          onComplete: () => {
            gsap.set(wrap, { overflow: "visible" });
            textareaRef.current?.focus();
          },
        });
      } else {
        gsap.set(wrap, { overflow: "hidden" });
        gsap.to(wrap, {
          autoAlpha: 0,
          height: 0,
          duration: 0.22,
          ease: "power2.in",
        });
      }
    },
    { dependencies: [isReplyExpanded] },
  );

  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const _earlyBodies = message ? extractMessageBodies(message) : null;
  const _displayHtml = cleanInviteMailHtml(
    decryptedHtml ?? (_earlyBodies?.html || ""),
  );
  const _displayText = cleanInviteMailText(
    plaintext ?? (_earlyBodies?.text || ""),
  );

  const { body: plaintextBody, quote: plaintextQuote } = useMemo(
    () => splitPlaintextQuote(_displayText ?? ""),
    [_displayText],
  );
  const { html: cleanHtml, hasQuote: htmlHasQuote } = useMemo(
    () => splitHtmlQuote(_displayHtml ?? ""),
    [_displayHtml],
  );
  const hasRemoteContent = useMemo(
    () => htmlContainsRemoteResources(_displayHtml ?? ""),
    [_displayHtml],
  );

  useEffect(() => {
    const el = conversationListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationMessages.length]);

  const earlyReturn: ReactNode | null = !message ? (
    <div className="flex h-full min-h-0 items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">Select a message to read</p>
    </div>
  ) : isMessageBodyLoading && !messageHasLoadedBody(message) ? (
    <div className="flex h-full min-h-0 items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">Loading message…</p>
    </div>
  ) : null;

  const viewModel = useMemo((): MessageReaderViewModel | null => {
    if (!message) return null;

    const displayHtml = _displayHtml;
    const displayText = _displayText;
    const isHtmlEmail = Boolean(displayHtml);
    const renderAsHtml = isHtmlEmail && (htmlHasQuote || !plaintextQuote);

    const senderEmail = message.from?.[0]?.email ?? "";
    const senderName = message.from?.[0]?.name ?? undefined;
    const enrichedSender = enrichSelfMailRecipient(
      { email: senderEmail, name: senderName },
      { email: accountEmail, name: accountName },
    );

    const otherMailboxes = mailboxes.filter(
      (m) =>
        m.id !== currentMailboxId &&
        !MOVE_EXCLUDED_ROLES.has(m.role?.toLowerCase() ?? ""),
    );

    const orderedConversationMessages = conversationMessages.length
      ? conversationMessages
      : [message];
    const showConversation = orderedConversationMessages.length > 1;

    const ownMessageCount = accountEmail
      ? orderedConversationMessages.filter(
          (m) =>
            m.from?.[0]?.email?.toLowerCase() === accountEmail.toLowerCase(),
        ).length
      : 0;
    const visibleConversationMessages =
      accountEmail && !showOwnMessages
        ? orderedConversationMessages.filter(
            (m) =>
              m.from?.[0]?.email?.toLowerCase() !== accountEmail.toLowerCase(),
          )
        : orderedConversationMessages;

    const currentMailboxRole = mailboxes
      .find((m) => m.id === currentMailboxId)
      ?.role?.toLowerCase();
    const isInTrash = currentMailboxRole === "trash";
    const isInSpam = isSpamMailboxRole(currentMailboxRole);
    const canReportSpam = Boolean(onReportSpam) && !isInSpam && !isInTrash;
    const canNotSpam = Boolean(onNotSpam) && isInSpam;

    const hasCardAboveBody =
      mailCalendarInvite?.method === "REQUEST" ||
      mailCalendarInvite?.method === "CANCEL";
    const hasReminderBannerAbove =
      isEventReminderEmail && Boolean(linkedCalendarEvent);
    const bodyAttachedAbove = hasCardAboveBody || hasReminderBannerAbove;

    return {
      message,
      isFlagged: message?.keywords?.["$flagged"] === true,
      messageLabels: getAllMessageLabels(message, labels),
      messageState: classifyMessageEncryption(message),
      displayHtml,
      displayText,
      renderAsHtml,
      senderEmail,
      senderName,
      enrichedSender,
      otherMailboxes,
      orderedConversationMessages,
      showConversation,
      ownMessageCount,
      visibleConversationMessages,
      isInTrash,
      isInSpam,
      canReportSpam,
      canNotSpam,
      plaintextBody,
      plaintextQuote,
      cleanHtml,
      htmlHasQuote,
      hasRemoteContent,
      shouldReplaceBodyWithEventReminder,
      isReminderEventLoading,
      eventReminderView,
      bodyAttachedAbove,
      mailCalendarInviteMeta,
    };
  }, [
    message,
    _displayHtml,
    _displayText,
    htmlHasQuote,
    plaintextQuote,
    plaintextBody,
    accountEmail,
    accountName,
    mailboxes,
    currentMailboxId,
    conversationMessages,
    showOwnMessages,
    onReportSpam,
    onNotSpam,
    labels,
    mailCalendarInvite?.method,
    isEventReminderEmail,
    linkedCalendarEvent,
    shouldReplaceBodyWithEventReminder,
    isReminderEventLoading,
    eventReminderView,
    mailCalendarInviteMeta,
    cleanHtml,
    hasRemoteContent,
  ]);

  const isFlagged = message?.keywords?.["$flagged"] === true;
  const messageLabels = message ? getAllMessageLabels(message, labels) : [];

  return {
    earlyReturn,
    viewModel,
    message,
    isFlagged,
    messageLabels,
    isMobile,
    isBusy,
    isDecrypting,
    isDark,
    hasPrev,
    hasNext,
    displaySettings,
    allowExternalContent,
    setAllowExternalContent,
    externalContentSenderEmail,
    blockRemoteImages,
    blockTrackingPixels,
    chrome,
    dispatchChrome,
    messageUi,
    dispatchMessageUi,
    fileInputRef,
    textareaRef,
    expandedWrapRef,
    conversationListRef,
    displayAttachments,
    attachmentHoverPreviews,
    loadingAttachmentPreviewKey,
    labelPopoverOpen,
    moreActionsOpen,
    morePopoverOpen,
    moveToExpanded,
    isBodyExpanded,
    showOwnMessages,
    showRawHtmlDialog,
    replyText,
    attachedFiles,
    emojiPickerOpen,
    isSendingReply,
    isReplyExpanded,
    showQuote,
    isConversationCollapsed,
    selectedMessageId,
    calendarInvitation,
    mailCalendarInvite,
    currentCalendarInviteEvent,
    inviteDeclined,
    inviteCancelled,
    inviteResponsePending,
    cancelProcessPending,
    handleInvitationResponse,
    handleCancelRemove,
    isEventReminderEmail,
    linkedCalendarEvent,
    handleLoadAttachmentHoverPreview,
    handleSendReply,
    handleFileSelect,
    autoResizeTextarea,
    props,
  };
}

export type MessageReaderController = ReturnType<
  typeof useMessageReaderController
>;

export type DispatchChrome = React.Dispatch<MessageReaderChromeAction>;
export type DispatchMessageUi = React.Dispatch<MessageReaderUiAction>;
