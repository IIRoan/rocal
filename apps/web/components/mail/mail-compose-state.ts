import type { QuotedInlineAttachment } from "@/lib/mail/compose-editor-utils";
import type { ComposeMode, DraftSaveStatus, MailReplyContext } from "./mail-compose-types";

export type MailComposeState = {
  composeTo: string;
  composeCc: string;
  composeBcc: string;
  composeSubject: string;
  composeBody: string;
  composeHtmlBody: string;
  composeAttachments: File[];
  composeMode: ComposeMode;
  quotedAttachments: QuotedInlineAttachment[];
  signatureAlreadyEmbedded: boolean;
  composeReplyContext: MailReplyContext | null;
  selectedIdentityId: string | null;
  draftId: string | null;
  draftSaveStatus: DraftSaveStatus;
  isComposeOpen: boolean;
  isFullCompose: boolean;
  composeSessionId: number;
  composeClosePromptOpen: boolean;
};

export const initialMailComposeState: MailComposeState = {
  composeTo: "",
  composeCc: "",
  composeBcc: "",
  composeSubject: "",
  composeBody: "",
  composeHtmlBody: "",
  composeAttachments: [],
  composeMode: "new",
  quotedAttachments: [],
  signatureAlreadyEmbedded: false,
  composeReplyContext: null,
  selectedIdentityId: null,
  draftId: null,
  draftSaveStatus: "idle",
  isComposeOpen: false,
  isFullCompose: false,
  composeSessionId: 0,
  composeClosePromptOpen: false,
};

export type MailComposeAction =
  | { type: "patch"; patch: Partial<MailComposeState> }
  | {
      type: "updateAttachments";
      updater: (current: File[]) => File[];
    }
  | { type: "resetDraft"; selectedIdentityId: string | null }
  | { type: "clearComposeFields"; selectedIdentityId: string | null }
  | { type: "incrementSession" };

export function mailComposeReducer(
  state: MailComposeState,
  action: MailComposeAction,
): MailComposeState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.patch };
    case "updateAttachments":
      return {
        ...state,
        composeAttachments: action.updater(state.composeAttachments),
      };
    case "resetDraft":
      return {
        ...initialMailComposeState,
        selectedIdentityId: action.selectedIdentityId,
        composeSessionId: state.composeSessionId,
      };
    case "clearComposeFields":
      return {
        ...state,
        composeTo: "",
        composeCc: "",
        composeBcc: "",
        composeSubject: "",
        composeBody: "",
        composeHtmlBody: "",
        composeAttachments: [],
        composeReplyContext: null,
        composeMode: "new",
        quotedAttachments: [],
        signatureAlreadyEmbedded: false,
        draftId: null,
        draftSaveStatus: "idle",
        selectedIdentityId: action.selectedIdentityId,
      };
    case "incrementSession":
      return {
        ...state,
        composeSessionId: state.composeSessionId + 1,
      };
    default:
      return state;
  }
}
