import type { ComposeTextFields } from "@workspace/calendar-core";
import type { PendingComposeAttachment } from "./compose-attachments";
import type { ComposeSeedPlan } from "./compose-seed";

export interface ComposeFormState extends ComposeTextFields {
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
  showCcBcc: false,
  seed: null,
  draftId: null,
  decrypting: false,
  attachments: [],
};

function withSeed(
  state: ComposeFormState,
  fields: ComposeTextFields,
): ComposeFormState {
  return {
    ...state,
    ...fields,
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
    case "editBody":
      return { ...state, body: action.update(state.body) };
    case "toggleCcBcc":
      return { ...state, showCcBcc: !state.showCcBcc };
    case "seed": {
      const next = { ...state, draftId: action.plan.draftId ?? state.draftId };
      return action.plan.kind === "decrypt-draft"
        ? { ...next, decrypting: true }
        : withSeed(next, action.plan.fields);
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
