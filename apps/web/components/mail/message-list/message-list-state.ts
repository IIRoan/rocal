import type { JmapEmailMessage } from "@/lib/mail/types";

export type MessageListState = {
  selectedIds: Set<string>;
  isBarVisible: boolean;
  bulkActionsOpen: boolean;
  expandedThreads: Set<string>;
  expandedThreadMessages: Record<string, JmapEmailMessage[]>;
  isLoadingThread: Set<string>;
};

export const initialMessageListState: MessageListState = {
  selectedIds: new Set(),
  isBarVisible: false,
  bulkActionsOpen: false,
  expandedThreads: new Set(),
  expandedThreadMessages: {},
  isLoadingThread: new Set(),
};

export type MessageListAction =
  | { type: "toggleSelect"; ids: string[] }
  | { type: "clearSelection" }
  | { type: "selectAll"; ids: string[] }
  | { type: "setBulkActionsOpen"; open: boolean }
  | { type: "hideBar" }
  | { type: "toggleThread"; threadId: string }
  | {
      type: "setThreadMessages";
      threadId: string;
      messages: JmapEmailMessage[];
    }
  | { type: "setThreadLoading"; threadId: string; loading: boolean };

export function messageListReducer(
  state: MessageListState,
  action: MessageListAction,
): MessageListState {
  switch (action.type) {
    case "toggleSelect": {
      const next = new Set(state.selectedIds);
      const allSelected = action.ids.every((id) => next.has(id));
      for (const id of action.ids) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return {
        ...state,
        selectedIds: next,
        isBarVisible: next.size > 0 ? true : state.isBarVisible,
      };
    }
    case "clearSelection":
      return { ...state, selectedIds: new Set() };
    case "selectAll":
      return { ...state, selectedIds: new Set(action.ids), isBarVisible: true };
    case "setBulkActionsOpen":
      return { ...state, bulkActionsOpen: action.open };
    case "hideBar":
      return { ...state, isBarVisible: false };
    case "toggleThread": {
      const next = new Set(state.expandedThreads);
      if (next.has(action.threadId)) {
        next.delete(action.threadId);
      } else {
        next.add(action.threadId);
      }
      return { ...state, expandedThreads: next };
    }
    case "setThreadMessages":
      return {
        ...state,
        expandedThreadMessages: {
          ...state.expandedThreadMessages,
          [action.threadId]: action.messages,
        },
      };
    case "setThreadLoading": {
      const next = new Set(state.isLoadingThread);
      if (action.loading) {
        next.add(action.threadId);
      } else {
        next.delete(action.threadId);
      }
      return { ...state, isLoadingThread: next };
    }
    default:
      return state;
  }
}
