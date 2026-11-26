import {
  dropInlineImagePlaceholders,
  htmlToPlainText,
  replaceInlineImagePlaceholders,
  type ComposeTextFields,
} from "@workspace/calendar-core";
import type { PendingComposeAttachment } from "./compose-attachments";
import type { ComposeSeedPlan } from "./compose-seed";

/** The text fields plus the rich body; `body` is the HTML's plain projection, or the body itself in plain text. */
export type ComposeFields = ComposeTextFields & { htmlBody: string };

export interface ComposeFormState extends ComposeFields {
  bodySourceVersion: number;
  showCcBcc: boolean;
  /** The seeded fields are the baseline: closing without edits never saves or prompts. */
  seed: ComposeTextFields | null;
  draftId: string | null;
  decrypting: boolean;
  attachments: PendingComposeAttachment[];
  /** The editor page's own copy of the body it was last given, so formatting-only edits count as edits. */
  editorBaseline: string | null;
  /** The editor has posted an edit since that baseline. */
  htmlEdited: boolean;
}

export type ComposeFormAction =
  | { type: "edit"; field: keyof ComposeTextFields; value: string }
  | { type: "editHtml"; html: string }
  | { type: "editorBaseline"; html: string }
  | { type: "editBody"; update: (body: string) => string }
  | { type: "hydrateImages"; cidToDataUrl: ReadonlyMap<string, string>; failed: ReadonlySet<string> }
  | { type: "toggleCcBcc" }
  | { type: "seed"; plan: ComposeSeedPlan }
  | { type: "decrypted"; fields: ComposeFields | null }
  | { type: "draftId"; draftId: string | null }
  | { type: "attach"; attachment: PendingComposeAttachment }
  | { type: "detach"; id: string };

export const INITIAL_COMPOSE_FORM: ComposeFormState = {
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
  htmlBody: "",
  bodySourceVersion: 0,
  showCcBcc: false,
  seed: null,
  draftId: null,
  decrypting: false,
  attachments: [],
  editorBaseline: null,
  htmlEdited: false,
};

const EMPTY_SEED: ComposeTextFields = { to: "", cc: "", bcc: "", subject: "", body: "" };

function withSeed(
  state: ComposeFormState,
  fields: ComposeFields,
): ComposeFormState {
  const { htmlBody, ...text } = fields;
  return {
    ...state,
    ...fields,
    htmlBody,
    bodySourceVersion: state.bodySourceVersion + 1,
    showCcBcc: state.showCcBcc || Boolean(fields.cc || fields.bcc),
    seed: text,
  };
}

export function composeFormReducer(
  state: ComposeFormState,
  action: ComposeFormAction,
): ComposeFormState {
  switch (action.type) {
    case "edit":
      // A body typed outside the rich editor replaces any HTML, so a send never carries a stale copy.
      return action.field === "body"
        ? { ...state, body: action.value, htmlBody: "" }
        : { ...state, [action.field]: action.value };
    case "editHtml":
      return { ...state, htmlBody: action.html, body: htmlToPlainText(action.html), htmlEdited: true };
    case "editorBaseline":
      return { ...state, editorBaseline: action.html, htmlEdited: false };
    case "editBody": {
      const body = action.update(state.body);
      if (body === state.body) return state;
      return { ...state, body, bodySourceVersion: state.bodySourceVersion + 1 };
    }
    case "hydrateImages": {
      // A quoted image that could not be loaded leaves the quote, as on web; the editor page applies the same change in place.
      const hydrate = (html: string) =>
        dropInlineImagePlaceholders(replaceInlineImagePlaceholders(html, action.cidToDataUrl), action.failed);
      const htmlBody = hydrate(state.htmlBody);
      if (htmlBody === state.htmlBody) return state;
      return {
        ...state,
        htmlBody,
        body: htmlToPlainText(htmlBody),
        editorBaseline: state.editorBaseline === null ? null : hydrate(state.editorBaseline),
      };
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

/** Formatting, links and images change the HTML without changing its text, so they count as edits too. */
export function hasComposeHtmlEdits(state: Pick<ComposeFormState, "htmlEdited" | "htmlBody" | "editorBaseline">): boolean {
  return state.htmlEdited && state.editorBaseline !== null && state.htmlBody !== state.editorBaseline;
}
