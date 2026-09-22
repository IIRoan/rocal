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
import { resolveLabelDisplayColor } from "@workspace/calendar-core";
import { buildMailPreviewSnippet } from "@/lib/mail/mail-preview";
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
            className="inline-flex max-w-[5.5rem] items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium leading-none"
            style={{
              color: displayColor,
              backgroundColor: `${displayColor}1a`,
              border: `1px solid ${displayColor}40`,
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
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function rowShellClassName({
  isMobile,
  density,
  isChecked,
  isSelected,
  isRead,
}: {
  isMobile: boolean;
  density: "compact" | "comfortable";
  isChecked: boolean;
  isSelected: boolean;
  isRead: boolean;
}) {
  const padding =
    isMobile || density === "comfortable" ? "px-[18px] py-3" : "px-5 py-3";
  const tone = isChecked || isSelected
    ? "bg-[var(--bg-cell-active)]"
    : isRead
      ? "hover:bg-[var(--bg-cell-hover)]"
      : "bg-[var(--bg-cell-unread)] hover:border-b-[var(--border-primary)]";
  return cn(
    "group/row relative h-full w-full overflow-hidden text-left cursor-pointer border-b border-[var(--border-tertiary)] box-border",
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
    <div className={cn("ml-1 flex min-w-0 flex-1 items-center overflow-hidden", className)}>
      {thread ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleThreadExpand(thread.id);
          }}
          className="mr-1 shrink-0 rounded p-0.5 text-[var(--icon-disabled)] hover:text-[var(--icon-primary)]"
          aria-label={thread.expanded ? "Collapse thread" : "Expand thread"}
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
      <Typography color={isRead ? "secondary" : "primary"} minWidth="auto" weight={weight}>
        {subject || "(No subject)"}
      </Typography>
      {previewSnippet ? (
        <Typography color={isRead ? "disabled" : "secondary"}>
          <span>&nbsp;–&nbsp;</span>
          {previewSnippet}
        </Typography>
      ) : null}
    </div>
  );
}

export type MessageListRowProps = {
  row: MessageListThreadRow;
  primaryIds: Set<string>;
  interaction: MessageListRowInteraction;
  presentation: MessageListRowPresentation;
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
    hasAttachments: row.messages.some(
      (entry) => entry.hasAttachment === true || (entry.attachments?.length ?? 0) > 0,
    ),
    messageLabels: display.showLabelChips ? getAllMessageLabels(message, labels) : [],
    previewSnippet: buildMailPreviewSnippet(message) ?? "",
    senderLabel:
      row.messages.length > 1
        ? formatThreadSenders(row.messages)
        : formatAddress(message.from),
    senderTone: (isRead ? "secondary" : "primary") as "secondary" | "primary",
    senderWeight: isRead ? TypographyWeight.REGULAR : TypographyWeight.MEDIUM,
    unreadOpacity: isRead ? 0 : 1,
    unreadLabel: isRead ? undefined : "Unread",
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
  timeFormat?: "12h" | "24h";
  timezone?: string;
  hover: ComponentProps<typeof MessageListRowHoverActions>;
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-4">
      <div className="flex items-center gap-1">
        {hasAttachments ? (
          <Icons color="disabled" icon={Icon.PaperClip} size={Size.SMALL} />
        ) : null}
        <MessageLabelChips messageLabels={messageLabels} />
      </div>
      <Typography
        className="group-hover/row:hidden"
        color="disabled"
        mono
        size={TypographySize.SMALL}
      >
        {formatMessageDate(receivedAt, timeFormat, timezone)}
      </Typography>
      <MessageListRowHoverActions {...hover} />
    </div>
  );
}

function UnreadDot({ opacity, label }: { opacity: number; label?: string }) {
  return (
    <span className="ml-1 flex h-2 w-2.5 shrink-0 items-center">
      <span
        className="size-2 rounded-full bg-[rgb(var(--orange-500))]"
        style={{ opacity }}
        aria-label={label}
      />
    </span>
  );
}

/** Phone widths stack sender/date over subject so the subject keeps the full row width. */
function MessageListRowStacked({
  view,
}: {
  view: ReturnType<typeof buildMessageListRowView>;
}) {
  const { message, row } = view;
  return (
    <div className="flex h-full items-start">
      <MessageListRowSelectAvatar
        email={message.from?.[0]?.email ?? ""}
        name={message.from?.[0]?.name ?? undefined}
        isChecked={view.isChecked}
        onToggleSelect={(event) => view.onToggleSelect(event, row.messageIds)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1">
          <div className="flex min-w-0 flex-1 overflow-hidden">
            <Typography color={view.senderTone} weight={view.senderWeight}>
              {view.senderLabel}
            </Typography>
          </div>
          <UnreadDot opacity={view.unreadOpacity} label={view.unreadLabel} />
          {view.hasAttachments ? (
            <Icons color="disabled" icon={Icon.PaperClip} size={Size.SMALL} />
          ) : null}
          <Typography color="disabled" mono size={TypographySize.SMALL}>
            {formatMessageDate(message.receivedAt, view.timeFormat, view.timezone)}
          </Typography>
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
      <UnreadDot opacity={view.unreadOpacity} label={view.unreadLabel} />
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
          role="button"
          tabIndex={0}
          onClick={() => view.onSelect(message.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              view.onSelect(message.id);
            }
          }}
          className={rowShellClassName({
            isMobile: display.isMobile,
            density: display.density,
            isChecked: view.isChecked,
            isSelected: view.isSelected,
            isRead: view.isRead,
          })}
        >
          {display.isMobile ? (
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
  timeFormat?: "12h" | "24h";
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
                threadRead ? "bg-transparent" : "bg-primary",
              )}
            />
            <span
              className={cn(
                "flex-1 min-w-0 truncate text-[11px]",
                threadRead ? "text-foreground/50" : "font-medium text-foreground/80",
              )}
            >
              {threadMsg.subject || "(No subject)"}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums whitespace-nowrap">
              {formatMessageDate(threadMsg.receivedAt, timeFormat, timezone)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
