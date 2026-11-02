"use client";

import type { ComponentProps } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  ContextDropdown,
  FilledVariant,
  Icon,
  IconButton,
  Icons,
  Size,
  Type,
  Typography,
  TypographySize,
  TypographyWeight,
} from "@workspace/ui/solace";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { formatAddress, formatMessageDate } from "../mail-helpers";
import { SenderAvatar } from "../mail-avatar";
import { getAllMessageLabels } from "@/lib/mail/mail-labels";
import { resolveLabelDisplayColor, type TimeFormat } from "@workspace/calendar-core";
import {
  buildMailPreviewSnippet,
  ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER,
} from "@/lib/mail/mail-preview";
import {
  formatThreadSenders,
  getSecondaryThreadMessages,
  type MessageListThreadRow,
} from "./message-list-utils";
import type {
  MessageListRowInteraction,
  MessageListRowPresentation,
} from "./message-list-types";
import { MessageListRowContextMenu } from "./message-list-row-context-menu";
import { MessageListRowHoverActions } from "./message-list-row-hover-actions";
import { MessageListRowOverflowMenu } from "./message-list-row-overflow-menu";

function MessageLabelChips({
  messageLabels,
  max = 2,
}: {
  messageLabels: { id: string; name: string; color?: string }[];
  max?: number;
}) {
  if (messageLabels.length === 0) return null;
  const visible = messageLabels.slice(0, max);
  const overflow = messageLabels.length - visible.length;

  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden pr-4">
      {visible.map((label) => {
        const displayColor = resolveLabelDisplayColor(label.color);
        return (
          <span
            key={label.id}
            title={label.name}
            className="inline-flex max-w-[5.5rem] items-center gap-0.5 rounded px-1 py-px text-[11px] font-medium leading-none text-[var(--text-primary)]"
            style={{
              backgroundColor: `color-mix(in srgb, ${displayColor} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${displayColor} 25%, transparent)`,
            }}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: displayColor }}
            />
            <span className="truncate">{label.name}</span>
          </span>
        );
      })}
      {overflow > 0 ? (
        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function rowShellClassName({
  stacked,
  density,
  isChecked,
  isSelected,
  isRead,
}: {
  stacked: boolean;
  density: "compact" | "comfortable";
  isChecked: boolean;
  isSelected: boolean;
  isRead: boolean;
}) {
  const padding =
    stacked || density === "comfortable" ? "px-[18px] py-3" : "px-5 py-3";
  const tone = isChecked || isSelected
    ? "bg-[var(--bg-cell-active)]"
    : isRead
      ? "hover:bg-[var(--bg-cell-hover)]"
      : "bg-[var(--bg-cell-unread)] hover:border-b-[var(--border-primary)]";
  return cn(
    "group/row relative w-full overflow-hidden text-left cursor-pointer border-b border-[var(--border-tertiary)] box-border transition-colors duration-150",
    padding,
    tone,
  );
}

function MessageListRowSelectAvatar({
  email,
  name,
  isChecked,
  onToggleSelect,
}: {
  email: string;
  name?: string;
  isChecked: boolean;
  onToggleSelect: (event: React.MouseEvent) => void;
}) {
  return (
    <div className="mr-3 flex shrink-0 items-center gap-3">
      <IconButton
        aria-label="Select message"
        aria-pressed={isChecked}
        className="relative z-2"
        icon={isChecked ? Icon.CheckboxFilled : Icon.CheckboxEmpty}
        onClick={onToggleSelect}
        size={Size.SMALL}
        type={Type.TERTIARY}
        variant={FilledVariant.UNFILLED}
      />
      <SenderAvatar email={email} name={name} className="size-8" />
    </div>
  );
}

function MessageListRowSubject({
  className,
  isRead,
  subject,
  previewSnippet,
  thread,
  onToggleThreadExpand,
}: {
  className?: string;
  isRead: boolean;
  subject: string;
  previewSnippet: string;
  thread: {
    id: string;
    expanded: boolean;
    loading: boolean;
  } | null;
  onToggleThreadExpand: (threadId: string) => void;
}) {
  const weight = isRead ? TypographyWeight.REGULAR : TypographyWeight.MEDIUM;
  return (
    <div className={cn("ml-1 flex min-w-0 flex-1 items-center", className)}>
      {thread ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleThreadExpand(thread.id);
          }}
          // The 16px chevron gets a 24px hit area (WCAG 2.5.8); the text clip sits on the sibling so it can't cut it.
          className="relative z-2 mr-1 shrink-0 rounded p-0.5 text-[var(--icon-tertiary)] after:absolute after:top-1/2 after:left-1/2 after:size-6 after:-translate-1/2 hover:text-[var(--icon-primary)]"
          aria-label="Show thread messages"
          aria-expanded={thread.expanded}
        >
          {thread.loading ? (
            <RotateCcw className="size-3 animate-spin" strokeWidth={2} />
          ) : thread.expanded ? (
            <ChevronDown className="size-3" strokeWidth={2.25} />
          ) : (
            <ChevronRight className="size-3" strokeWidth={2.25} />
          )}
        </button>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center overflow-hidden">
        <Typography color={isRead ? "secondary" : "primary"} minWidth="auto" weight={weight}>
          {subject || "(No subject)"}
        </Typography>
        {previewSnippet ? (
          <Typography color={isRead ? "tertiary" : "secondary"}>
            <span>&nbsp;–&nbsp;</span>
            {previewSnippet}
          </Typography>
        ) : null}
      </div>
    </div>
  );
}

export type MessageListRowProps = {
  row: MessageListThreadRow;
  primaryIds: Set<string>;
  interaction: MessageListRowInteraction;
  presentation: MessageListRowPresentation;
  height?: number;
};

function buildMessageListRowView({
  row,
  primaryIds,
  interaction,
  presentation,
}: MessageListRowProps) {
  const message = row.latestMessage;
  const { selectedMessageId, selectedIds, onSelect, onToggleSelect, onToggleThreadExpand } =
    interaction;
  const {
    labels,
    moveTargets,
    spamActions,
    display,
    threadUi,
    timeFormat,
    timezone,
    mailboxActions,
  } = presentation;
  const selectedCount = row.messageIds.filter((id) => selectedIds.has(id)).length;
  const isRead =
    row.messages.filter((entry) => primaryIds.has(entry.id) && !entry.keywords?.["$seen"])
      .length === 0;
  const threaded = display.threadExpandEnabled && row.messages.length > 1;
  const hasAttachments = row.messages.some(
    (entry) => entry.hasAttachment === true || (entry.attachments?.length ?? 0) > 0,
  );
  const snippet = buildMailPreviewSnippet(message);
  // A list row shows only the subject for encrypted mail; the reader names the encryption.
  const previewSnippet = snippet === ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER ? "" : snippet;
  const senderLabel =
    row.messages.length > 1
      ? formatThreadSenders(row.messages)
      : formatAddress(message.from);
  return {
    row,
    message,
    onSelect,
    onToggleSelect,
    onToggleThreadExpand,
    labels,
    moveTargets,
    spamActions,
    display,
    timeFormat,
    timezone,
    mailboxActions,
    selectedCount,
    isChecked: selectedCount === row.messageIds.length,
    isSelected: row.messageIds.includes(selectedMessageId ?? ""),
    isRead,
    isFlagged: row.messages.some((entry) => entry.keywords?.["$flagged"] === true),
    hasAttachments,
    messageLabels: display.showLabelChips ? getAllMessageLabels(message, labels) : [],
    previewSnippet,
    senderLabel,
    rowLabel: [
      senderLabel,
      message.subject || "(No subject)",
      formatMessageDate(message.receivedAt, timeFormat, timezone),
      hasAttachments ? "Has attachment" : null,
      isRead ? null : "Unread",
    ]
      .filter(Boolean)
      .join(", "),
    senderTone: (isRead ? "secondary" : "primary") as "secondary" | "primary",
    senderWeight: isRead ? TypographyWeight.REGULAR : TypographyWeight.BOLD,
    unreadOpacity: isRead ? 0 : 1,
    thread: threaded
      ? {
          id: row.id,
          expanded: threadUi.expandedThreads.has(row.id),
          loading: threadUi.loadingThreadIds.has(row.id),
        }
      : null,
    showThreadChildren: threaded && threadUi.expandedThreads.has(row.id),
    secondaryThreadMessages: getSecondaryThreadMessages(
      threadUi.expandedThreadMessages[row.id] ?? row.messages,
      message.id,
    ),
  };
}

function MessageListRowTrailing({
  hasAttachments,
  messageLabels,
  receivedAt,
  timeFormat,
  timezone,
  hover,
}: {
  hasAttachments: boolean;
  messageLabels: { id: string; name: string; color?: string }[];
  receivedAt?: string;
  timeFormat: TimeFormat;
  timezone?: string;
  hover: ComponentProps<typeof MessageListRowHoverActions>;
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-4">
      <div className="flex items-center gap-1">
        {hasAttachments ? (
          <Icons color="tertiary" icon={Icon.PaperClip} size={Size.SMALL} />
        ) : null}
        <MessageLabelChips messageLabels={messageLabels} />
      </div>
      <Typography
        className="group-hover/row:hidden"
        color="tertiary"
        mono
        size={TypographySize.SMALL}
      >
        {formatMessageDate(receivedAt, timeFormat, timezone)}
      </Typography>
      <MessageListRowHoverActions {...hover} />
    </div>
  );
}

function UnreadDot({ opacity }: { opacity: number }) {
  return (
    <span className="ml-1 flex h-2 w-2.5 shrink-0 items-center">
      <span className="size-2 rounded-full bg-accent" style={{ opacity }} />
    </span>
  );
}

/** Phone widths and the narrow desktop list stack sender/date over subject so the subject keeps the full row width. */
function MessageListRowStacked({
  view,
}: {
  view: ReturnType<typeof buildMessageListRowView>;
}) {
  const { message, row } = view;
  const showMenu = view.display.narrow;
  const date = formatMessageDate(message.receivedAt, view.timeFormat, view.timezone);
  return (
    <div className="flex h-full items-start">
      <MessageListRowSelectAvatar
        email={message.from?.[0]?.email ?? ""}
        name={message.from?.[0]?.name ?? undefined}
        isChecked={view.isChecked}
        onToggleSelect={(event) => view.onToggleSelect(event, row.messageIds)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={cn("flex min-w-0 items-center gap-1", showMenu && "h-6")}>
          <div className="flex min-w-0 flex-1 overflow-hidden">
            <Typography color={view.senderTone} weight={view.senderWeight}>
              {view.senderLabel}
            </Typography>
          </div>
          <UnreadDot opacity={view.unreadOpacity} />
          {view.hasAttachments ? (
            <Icons color="tertiary" icon={Icon.PaperClip} size={Size.SMALL} />
          ) : null}
          {showMenu ? (
            <div className="group/actions relative z-2 flex shrink-0 items-center">
              <Typography
                className="group-hover/row:hidden group-has-[[data-state=open]]/actions:hidden"
                color="tertiary"
                mono
                size={TypographySize.SMALL}
              >
                {date}
              </Typography>
              <div className="hidden transition-opacity duration-150 ease-in-out group-hover/row:flex group-has-[[data-state=open]]/actions:flex starting:opacity-0">
                <MessageListRowOverflowMenu
                  message={message}
                  messageIds={row.messageIds}
                  isRead={view.isRead}
                  isFlagged={view.isFlagged}
                  labels={view.labels}
                  moveTargets={view.moveTargets}
                  spamActions={view.spamActions}
                  mailboxActions={view.mailboxActions}
                />
              </div>
            </div>
          ) : (
            <Typography color="tertiary" mono size={TypographySize.SMALL}>
              {date}
            </Typography>
          )}
        </div>
        <MessageListRowSubject
          className="ml-0 w-full flex-none"
          isRead={view.isRead}
          subject={message.subject ?? ""}
          previewSnippet={view.previewSnippet}
          thread={view.thread}
          onToggleThreadExpand={view.onToggleThreadExpand}
        />
        <MessageLabelChips messageLabels={view.messageLabels} />
      </div>
    </div>
  );
}

function MessageListRowInline({
  view,
}: {
  view: ReturnType<typeof buildMessageListRowView>;
}) {
  const { message, row } = view;
  return (
    <div className="flex h-full items-center">
      <MessageListRowSelectAvatar
        email={message.from?.[0]?.email ?? ""}
        name={message.from?.[0]?.name ?? undefined}
        isChecked={view.isChecked}
        onToggleSelect={(event) => view.onToggleSelect(event, row.messageIds)}
      />
      <div className="flex min-w-[140px] w-[16vw] max-w-[220px] shrink-0 items-center overflow-hidden">
        <Typography color={view.senderTone} weight={view.senderWeight}>
          {view.senderLabel}
        </Typography>
      </div>
      <UnreadDot opacity={view.unreadOpacity} />
      <MessageListRowSubject
        isRead={view.isRead}
        subject={message.subject ?? ""}
        previewSnippet={view.previewSnippet}
        thread={view.thread}
        onToggleThreadExpand={view.onToggleThreadExpand}
      />
      <MessageListRowTrailing
        hasAttachments={view.hasAttachments}
        messageLabels={view.messageLabels}
        receivedAt={message.receivedAt}
        timeFormat={view.timeFormat}
        timezone={view.timezone}
        hover={{
          isRead: view.isRead,
          isFlagged: view.isFlagged,
          isBulk: row.messageIds.length > 1,
          messageId: message.id,
          messageIds: row.messageIds,
          onMarkAsUnread: view.mailboxActions.onMarkAsUnread,
          onMarkAsRead: view.mailboxActions.onMarkAsRead,
          onBulkMarkAsUnread: view.mailboxActions.onBulkMarkAsUnread,
          onBulkMarkAsRead: view.mailboxActions.onBulkMarkAsRead,
          onDelete: view.mailboxActions.onDelete,
          onBulkDelete: view.mailboxActions.onBulkDelete,
          onToggleFlagged: view.mailboxActions.onToggleFlagged,
        }}
      />
    </div>
  );
}

export function MessageListRow(props: MessageListRowProps) {
  const view = buildMessageListRowView(props);
  const { message, row, display } = view;

  return (
    <>
      <ContextDropdown
        width={220}
        trigger={
        <div
          style={{ height: props.height }}
          className={rowShellClassName({
            stacked: display.isMobile || display.narrow,
            density: display.density,
            isChecked: view.isChecked,
            isSelected: view.isSelected,
            isRead: view.isRead,
          })}
        >
          {/* One real button covers the row; the row's own controls sit above it (z-2) so nothing nests inside a button. */}
          <button
            type="button"
            aria-label={view.rowLabel}
            aria-current={view.isSelected || undefined}
            onClick={() => view.onSelect(message.id)}
            className="absolute inset-0 z-1 cursor-pointer focus-visible:-outline-offset-2"
          />
          {display.isMobile || display.narrow ? (
            <MessageListRowStacked view={view} />
          ) : (
            <MessageListRowInline view={view} />
          )}
        </div>
        }
      >
      <MessageListRowContextMenu
        message={message}
        messageIds={row.messageIds}
        isRead={view.isRead}
        isFlagged={view.isFlagged}
        labels={view.labels}
        moveTargets={view.moveTargets}
        spamActions={view.spamActions}
        mailboxActions={view.mailboxActions}
      />
      </ContextDropdown>
      <MessageListRowThreadChildren
        visible={view.showThreadChildren}
        messages={view.secondaryThreadMessages}
        timeFormat={view.timeFormat}
        timezone={view.timezone}
        onSelect={view.onSelect}
      />
    </>
  );
}

function MessageListRowThreadChildren({
  visible,
  messages,
  timeFormat,
  timezone,
  onSelect,
}: {
  visible: boolean;
  messages: JmapEmailMessage[];
  timeFormat: TimeFormat;
  timezone?: string;
  onSelect: (id: string) => void;
}) {
  if (!visible) return null;
  return (
    <div className="border-l-2 border-border/30 ml-2 mt-0.5 mb-1">
      {messages.map((threadMsg) => {
        const threadRead = threadMsg.keywords?.["$seen"];
        return (
          <button
            key={threadMsg.id}
            type="button"
            onClick={() => onSelect(threadMsg.id)}
            className="flex w-full items-center gap-2 px-2.5 py-1 cursor-pointer text-left hover:bg-muted/40 transition-colors border-b border-border/20"
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                threadRead ? "bg-transparent" : "bg-accent",
              )}
            >
              {threadRead ? null : <span className="sr-only">Unread</span>}
            </span>
            <span
              className={cn(
                "flex-1 min-w-0 truncate text-[11px]",
                threadRead ? "text-muted-foreground" : "font-medium text-foreground/80",
              )}
            >
              {threadMsg.subject || "(No subject)"}
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
              {formatMessageDate(threadMsg.receivedAt, timeFormat, timezone)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
