import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";

export type MessageListSpamActions = {
  canReportSpam: boolean;
  canNotSpam: boolean;
};

export type MessageListDisplayOptions = {
  isMobile: boolean;
  density: "compact" | "comfortable";
  showLabelChips: boolean;
  threadExpandEnabled: boolean;
};

export type MessageListPaginationState = {
  hasMore?: boolean;
  isLoadingMore?: boolean;
};

export type MessageListThreadUiState = {
  expandedThreads: Set<string>;
  expandedThreadMessages: Record<string, JmapEmailMessage[]>;
  loadingThreadIds: Set<string>;
};

export type MessageListRowMailboxActions = {
  onDelete?: (id: string) => void;
  onMove?: (id: string, targetMailboxId: string) => void;
  onMarkAsUnread?: (id: string) => void;
  onMarkAsRead?: (id: string) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkMove?: (ids: string[], targetMailboxId: string) => void;
  onBulkMarkAsUnread?: (ids: string[]) => void;
  onBulkMarkAsRead?: (ids: string[]) => void;
  onToggleFlagged?: (id: string) => void;
  onReportSpam?: (id: string) => void;
  onNotSpam?: (id: string) => void;
  onSetLabel?: (messageId: string, labelId: string, assigned: boolean) => void;
};

export type MessageListRowInteraction = {
  selectedMessageId: string | null;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleSelect: (event: React.MouseEvent, ids: string[]) => void;
  onToggleThreadExpand: (threadId: string) => void;
};

export type MessageListRowPresentation = {
  labels: LabelDef[];
  moveTargets: JmapMailbox[];
  spamActions: MessageListSpamActions;
  display: MessageListDisplayOptions;
  threadUi: MessageListThreadUiState;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  mailboxActions: MessageListRowMailboxActions;
};
