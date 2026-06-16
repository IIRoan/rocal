export type AttachmentHoverPreview =
  | {
      kind: "image" | "pdf";
      url: string;
      type: string;
    }
  | {
      kind: "text";
      text: string;
      type: string;
    }
  | null;

export type MessageReaderUiState = {
  replyText: string;
  attachedFiles: File[];
  emojiPickerOpen: boolean;
  isSendingReply: boolean;
  isReplyExpanded: boolean;
  attachmentHoverPreviews: Record<string, AttachmentHoverPreview>;
  loadingAttachmentPreviewKey: string | null;
  showQuote: boolean;
  isConversationCollapsed: boolean;
};

export const initialMessageReaderUiState: MessageReaderUiState = {
  replyText: "",
  attachedFiles: [],
  emojiPickerOpen: false,
  isSendingReply: false,
  isReplyExpanded: false,
  attachmentHoverPreviews: {},
  loadingAttachmentPreviewKey: null,
  showQuote: false,
  isConversationCollapsed: true,
};

export type MessageReaderUiAction =
  | { type: "reset" }
  | { type: "patch"; patch: Partial<MessageReaderUiState> }
  | {
      type: "updateAttachmentHoverPreviews";
      updater: (
        current: MessageReaderUiState["attachmentHoverPreviews"],
      ) => MessageReaderUiState["attachmentHoverPreviews"];
    }
  | { type: "appendAttachedFiles"; files: File[] }
  | { type: "removeAttachedFile"; index: number }
  | { type: "appendReplyText"; value: string }
  | { type: "clearLoadingAttachmentPreviewKeyIf"; previewKey: string };

export function messageReaderUiReducer(
  state: MessageReaderUiState,
  action: MessageReaderUiAction,
): MessageReaderUiState {
  switch (action.type) {
    case "reset":
      return initialMessageReaderUiState;
    case "patch":
      return { ...state, ...action.patch };
    case "updateAttachmentHoverPreviews":
      return {
        ...state,
        attachmentHoverPreviews: action.updater(state.attachmentHoverPreviews),
      };
    case "appendAttachedFiles":
      return {
        ...state,
        attachedFiles: [...state.attachedFiles, ...action.files],
      };
    case "removeAttachedFile":
      return {
        ...state,
        attachedFiles: state.attachedFiles.filter(
          (_, index) => index !== action.index,
        ),
      };
    case "appendReplyText":
      return {
        ...state,
        replyText: state.replyText + action.value,
      };
    case "clearLoadingAttachmentPreviewKeyIf":
      return {
        ...state,
        loadingAttachmentPreviewKey:
          state.loadingAttachmentPreviewKey === action.previewKey
            ? null
            : state.loadingAttachmentPreviewKey,
      };
    default:
      return state;
  }
}
