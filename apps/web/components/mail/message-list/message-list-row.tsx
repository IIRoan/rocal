"use client";

import { ChevronDown, RotateCcw, Star } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
  ContextDropdown,
  Icon,
  Icons,
  Size,
  Typography,
  TypographyWeight,
} from "@workspace/ui/solace";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { formatAddress, formatMessageDate } from "../mail-helpers";
import { SenderAvatar } from "../mail-avatar";
import { getAllMessageLabels } from "@/lib/mail/mail-labels";
import { resolveLabelDisplayColor, type TimeFormat } from "@workspace/calendar-core";
import {
  formatThreadSenders,
  getListPreviewSnippet,
  getSecondaryThreadMessages,
  getThreadAvatarSenders,
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
  className,
}: {
  messageLabels: { id: string; name: string; color?: string }[];
  max?: number;
  className: string;
}) {
  if (messageLabels.length === 0) return null;
  const visible = messageLabels.slice(0, max);
  const overflow = messageLabels.length - visible.length;

  return (
    <div className={cn("flex items-center gap-1", className)}>
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
  isChecked,
  isSelected,
  isRead,
}: {
  isChecked: boolean;
  isSelected: boolean;
  isRead: boolean;
}) {
  const tone = isChecked || isSelected
    ? "bg-[var(--bg-cell-active)]"
    : isRead
      ? "hover:bg-[var(--bg-cell-hover)]"
      : "bg-[var(--bg-cell-unread)] hover:border-b-[var(--border-primary)]";
  return cn(
    "group/row relative w-full overflow-hidden text-left cursor-pointer border-b border-[var(--border-tertiary)] box-border transition-colors duration-150 pl-3.5 pr-4 py-2.5",
    tone,
  );
}

function MessageListRowSubject({
  isRead,
  subject,
  previewSnippet,
}: {
  isRead: boolean;
  subject: string;
  previewSnippet: string;
}) {
  const weight = isRead ? TypographyWeight.REGULAR : TypographyWeight.MEDIUM;
  return (
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
  );
}

export type MessageListRowProps = {
  row: MessageListThreadRow;
  primaryIds: Set<string>;
  interaction: MessageListRowInteraction;
  presentation: MessageListRowPresentation;
  height?: number;
};

/** A day heading in the list; while selecting it checks or clears that day's conversations. */
export function MessageListDayHeader({
  label,
  selectionActive,
  allSelected,
  onToggleDay,
}: {
  label: string;
  selectionActive: boolean;
  allSelected: boolean;
  onToggleDay: (event: React.MouseEvent) => void;
}) {
  return (
    <div className="flex h-[30px] items-center justify-between px-4 text-xs font-medium text-[var(--text-tertiary)]">
      <h2>{label}</h2>
      {selectionActive ? (
        <button
          type="button"
          onClick={onToggleDay}
          className="-mx-1.5 cursor-pointer rounded px-1.5 py-0.5 hover:bg-[var(--bg-overlay-tertiary)] hover:text-[var(--text-primary)]"
        >
          {allSelected ? "Clear" : "Select all"}
          <span className="sr-only"> from {label}</span>
        </button>
      ) : null}
    </div>
  );
}

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
    scheduledSendAtById,
    mailboxActions,
  } = presentation;
  const scheduledAt = scheduledSendAtById?.get(message.id);
  const dateLabel = scheduledAt
    ? `Scheduled · ${formatMessageDate(scheduledAt, timeFormat, timezone)}`
    : formatMessageDate(message.receivedAt, timeFormat, timezone);
  const selectedCount = row.messageIds.filter((id) => selectedIds.has(id)).length;
  const isRead =
    row.messages.filter((entry) => primaryIds.has(entry.id) && !entry.keywords?.["$seen"])
      .length === 0;
  const threaded = display.threadExpandEnabled && row.messages.length > 1;
  const hasAttachments = row.messages.some(
    (entry) => entry.hasAttachment === true || (entry.attachments?.length ?? 0) > 0,
  );
  const previewSnippet = getListPreviewSnippet(message);
  const senderLabel =
    row.messages.length > 1
      ? formatThreadSenders(row.messages)
      : formatAddress(message.from);
  return {
    row,
    message,
    avatarSenders: getThreadAvatarSenders(row.messages),
    onSelect,
    onToggleSelect,
    onToggleThreadExpand,
    labels,
    moveTargets,
    spamActions,
    timeFormat,
    timezone,
    mailboxActions,
    selectedCount,
    dateLabel,
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
      dateLabel,
      hasAttachments ? "Has attachment" : null,
      isRead ? null : "Unread",
    ]
      .filter(Boolean)
      .join(", "),
    senderTone: (isRead ? "secondary" : "primary") as "secondary" | "primary",
    senderWeight: isRead ? TypographyWeight.REGULAR : TypographyWeight.BOLD,
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

type MessageListRowView = ReturnType<typeof buildMessageListRowView>;

/** Two overlapping avatars for a conversation with more than one sender, else the one sender. */
function MessageListRowAvatars({ senders }: { senders: MessageListRowView["avatarSenders"] }) {
  const [latest, other] = senders;
  if (!latest) return <span aria-hidden className="size-8 shrink-0" />;
  if (!other) return <SenderAvatar email={latest.email} name={latest.name} className="size-8 shrink-0" />;
  return (
    <span aria-hidden className="relative flex size-8 shrink-0">
      <SenderAvatar email={latest.email} name={latest.name} className="absolute top-0 left-0 size-[23px]" />
      <SenderAvatar
        email={other.email}
        name={other.name}
        className="absolute right-0 bottom-0 size-[23px] rounded-full ring-2 ring-[var(--bg-l2-solid)]"
      />
    </span>
  );
}

function MessageListRowThreadCount({
  count,
  thread,
  onToggleThreadExpand,
}: {
  count: number;
  thread: NonNullable<MessageListRowView["thread"]>;
  onToggleThreadExpand: (threadId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggleThreadExpand(thread.id);
      }}
      className="relative z-2 -my-1 inline-flex h-6 shrink-0 cursor-pointer items-center gap-0.5 rounded px-1 text-xs tabular-nums text-[var(--text-tertiary)] hover:bg-[var(--bg-overlay-tertiary)] hover:text-[var(--text-primary)]"
      aria-label="Show thread messages"
      aria-expanded={thread.expanded}
    >
      {count}
      {thread.loading ? (
        <RotateCcw aria-hidden className="size-3 animate-spin" strokeWidth={2} />
      ) : (
        <ChevronDown aria-hidden className={cn("size-3", thread.expanded && "rotate-180")} strokeWidth={2.25} />
      )}
    </button>
  );
}

/** Only a list wide enough to keep the sender readable swaps the date for read, trash, star and the actions menu on hover or keyboard focus. */
function MessageListRowInlineActions({ view }: { view: MessageListRowView }) {
  const { message, row } = view;
  return (
    <div className="relative z-2 -my-1 ml-auto hidden shrink-0 items-center gap-0.5 @min-[480px]/list:group-hover/row:flex @min-[480px]/list:group-has-[:focus-visible]/row:flex @min-[480px]/list:group-has-[[data-state=open]]/row:flex">
      <MessageListRowHoverActions
        isRead={view.isRead}
        isFlagged={view.isFlagged}
        isBulk={row.messageIds.length > 1}
        messageId={message.id}
        messageIds={row.messageIds}
        onMarkAsUnread={view.mailboxActions.onMarkAsUnread}
        onMarkAsRead={view.mailboxActions.onMarkAsRead}
        onBulkMarkAsUnread={view.mailboxActions.onBulkMarkAsUnread}
        onBulkMarkAsRead={view.mailboxActions.onBulkMarkAsRead}
        onDelete={view.mailboxActions.onDelete}
        onBulkDelete={view.mailboxActions.onBulkDelete}
        onToggleFlagged={view.mailboxActions.onToggleFlagged}
      />
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
  );
}

/** The checkbox takes the avatar's place on the hovered or focused row and on checked rows; every other row keeps its avatar. */
function MessageListRowSelect({ view }: { view: MessageListRowView }) {
  const { row } = view;
  const checkbox = (
    <Icons
      color={view.isChecked ? "primary" : "secondary"}
      icon={view.isChecked ? Icon.CheckboxFilled : Icon.CheckboxEmpty}
      size={Size.SMALL}
    />
  );
  return (
    <button
      type="button"
      aria-label="Select message"
      aria-pressed={view.isChecked}
      onClick={(event) => view.onToggleSelect(event, row.messageIds)}
      className="group/select relative z-2 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full"
    >
      {view.isChecked ? (
        checkbox
      ) : (
        <>
          <span className="flex group-hover/row:hidden group-focus-visible/select:hidden">
            <MessageListRowAvatars senders={view.avatarSenders} />
          </span>
          <span className="hidden group-hover/row:flex group-focus-visible/select:flex">{checkbox}</span>
        </>
      )}
    </button>
  );
}

/** Phones and the desktop list stack sender, subject and preview so each keeps the full row width. */
function MessageListRowStacked({ view }: { view: MessageListRowView }) {
  const { message, row } = view;
  return (
    <div className="flex h-full items-center gap-2.5">
      <MessageListRowSelect view={view} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-[18px] min-w-0 items-center gap-1.5">
          {view.isRead ? null : <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-accent" />}
          <div className="flex min-w-0 overflow-hidden">
            <Typography color={view.senderTone} weight={view.senderWeight}>
              {view.senderLabel}
            </Typography>
          </div>
          {view.thread ? (
            <MessageListRowThreadCount
              count={row.messages.length}
              thread={view.thread}
              onToggleThreadExpand={view.onToggleThreadExpand}
            />
          ) : null}
          {/* The date keeps a fixed column so attachment and star icons line up from row to row. */}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 @min-[480px]/list:group-hover/row:hidden @min-[480px]/list:group-has-[:focus-visible]/row:hidden @min-[480px]/list:group-has-[[data-state=open]]/row:hidden">
            {view.hasAttachments ? (
              <Icons color="tertiary" icon={Icon.PaperClip} size={Size.SMALL} />
            ) : null}
            {view.isFlagged ? <Star aria-label="Starred" className="size-3 fill-current text-accent" /> : null}
            <span className="min-w-12 text-right text-xs tabular-nums whitespace-nowrap text-[var(--text-tertiary)]">
              {view.dateLabel}
            </span>
          </span>
          <MessageListRowInlineActions view={view} />
        </div>
        <div className="flex h-5 min-w-0 items-center gap-1.5">
          <MessageListRowSubject
            isRead={view.isRead}
            subject={message.subject ?? ""}
            previewSnippet={view.previewSnippet}
          />
          <MessageLabelChips messageLabels={view.messageLabels} className="max-w-[60%] shrink-0 overflow-hidden" />
        </div>
      </div>
    </div>
  );
}

export function MessageListRow(props: MessageListRowProps) {
  const view = buildMessageListRowView(props);
  const { message, row } = view;

  return (
    <>
      <ContextDropdown
        width={220}
        trigger={
        <div
          style={{ height: props.height }}
          className={rowShellClassName({
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
          <MessageListRowStacked view={view} />
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
  // Lined up under the row's text; each line names who wrote it, since a thread shares one subject.
  return (
    <div className="mr-1.5 mb-1.5 ml-14 border-l-2 border-border/30">
      {messages.map((threadMsg) => {
        const threadRead = threadMsg.keywords?.["$seen"];
        const preview = getListPreviewSnippet(threadMsg);
        return (
          <button
            key={threadMsg.id}
            type="button"
            onClick={() => onSelect(threadMsg.id)}
            className="flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40"
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
                "max-w-[45%] shrink-0 truncate text-xs",
                threadRead ? "text-foreground/80" : "font-medium text-foreground",
              )}
            >
              {formatAddress(threadMsg.from)}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {preview || threadMsg.subject || "(No subject)"}
            </span>
            <span className="min-w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {formatMessageDate(threadMsg.receivedAt, timeFormat, timezone)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
