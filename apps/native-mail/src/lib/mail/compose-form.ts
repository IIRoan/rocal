import type { ComposeTextFields } from "@workspace/calendar-core";
import type { PendingComposeAttachment } from "./compose-attachments";
import type { ComposeSeedPlan } from "./compose-seed";

export interface ComposeFormState extends ComposeTextFields {
  bodySourceVersion: number;
  showCcBcc: boolean;
  /** The seeded fields are the baseline: closing without edits never saves or prompts. */
  seed: ComposeTextFields | null;
  draftId: string | null;
  decrypting: boolean;
  attachments: PendingComposeAttachment[];
}

export type ComposeFormAction =
  | { type: "edit"; field: keyof ComposeTextFields; value: string }
  | { type: "editBody"; update: (body: string) => string }
  | { type: "toggleCcBcc" }
  | { type: "seed"; plan: ComposeSeedPlan }
  | { type: "decrypted"; fields: ComposeTextFields | null }
  | { type: "draftId"; draftId: string | null }
  | { type: "attach"; attachment: PendingComposeAttachment }
  | { type: "detach"; id: string };

export const INITIAL_COMPOSE_FORM: ComposeFormState = {
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
  bodySourceVersion: 0,
  showCcBcc: false,
  seed: null,
  draftId: null,
  decrypting: false,
  attachments: [],
};

const EMPTY_SEED: ComposeTextFields = { to: "", cc: "", bcc: "", subject: "", body: "" };

function withSeed(
  state: ComposeFormState,
  fields: ComposeTextFields,
): ComposeFormState {
  return {
    ...state,
    ...fields,
    bodySourceVersion: state.bodySourceVersion + 1,
    showCcBcc: state.showCcBcc || Boolean(fields.cc || fields.bcc),
    seed: fields,
  };
}

export function composeFormReducer(
  state: ComposeFormState,
  action: ComposeFormAction,
): ComposeFormState {
  switch (action.type) {
    case "edit":
      return { ...state, [action.field]: action.value };
    case "editBody": {
      const body = action.update(state.body);
      if (body === state.body) return state;
      return { ...state, body, bodySourceVersion: state.bodySourceVersion + 1 };
    }
    case "toggleCcBcc":
      return { ...state, showCcBcc: !state.showCcBcc };
    case "seed": {
      const next = { ...state, draftId: action.plan.draftId ?? state.draftId };
      if (action.plan.kind === "decrypt-draft" || action.plan.kind === "decrypt-source") {
        return { ...next, decrypting: true };
      }
      const seeded = withSeed(next, action.plan.fields);
      // A restored send counts as edited, so the next autosave replaces its sealed copy.
      return action.plan.restoredAttachments
        ? { ...seeded, seed: EMPTY_SEED, attachments: action.plan.restoredAttachments }
        : seeded;
    }
    case "decrypted": {
      const next = { ...state, decrypting: false };
      return action.fields ? withSeed(next, action.fields) : next;
    }
    case "draftId":
      return { ...state, draftId: action.draftId };
    case "attach":
      return { ...state, attachments: [...state.attachments, action.attachment] };
    case "detach":
      return {
        ...state,
        attachments: state.attachments.filter((item) => item.id !== action.id),
      };
  }
}
