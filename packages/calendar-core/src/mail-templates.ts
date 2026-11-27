import { newClientEntityId } from "./content-encryption";
import type { TextSelection } from "./mail-compose-format";
import { encodedSize, entryNameError, entryPreview, normalizeEntries } from "./mail-settings-entries";
import { z } from "./zod";

export const MAIL_TEMPLATE_LIMITS = {
  count: 50,
  name: 80,
  subject: 200,
  body: 20_000,
  /** Templates ride in the sealed mail settings blob, which the API caps at 65,536 characters. */
  totalBytes: 30_000,
} as const;

const mailTemplateSchema = z.strictObject({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(MAIL_TEMPLATE_LIMITS.name),
  subject: z.string().max(MAIL_TEMPLATE_LIMITS.subject).optional(),
  body: z.string().max(MAIL_TEMPLATE_LIMITS.body),
});

export type MailTemplate = z.infer<typeof mailTemplateSchema>;

export const MAIL_TEMPLATES_DESCRIPTION =
  "Save text you send often and insert it while you write. Templates are encrypted and sync to your devices.";

export type MailTemplateDraft = { name: string; subject: string; body: string };

export type MailTemplateDraftErrors = Partial<
  Record<keyof MailTemplateDraft | "form", string>
>;

export const EMPTY_MAIL_TEMPLATE_DRAFT: MailTemplateDraft = {
  name: "",
  subject: "",
  body: "",
};

export function normalizeMailTemplates(input: unknown): MailTemplate[] {
  return normalizeEntries(
    input,
    mailTemplateSchema,
    (template) => template.id,
    MAIL_TEMPLATE_LIMITS.count,
  );
}

export function mailTemplateToDraft(template: MailTemplate): MailTemplateDraft {
  return {
    name: template.name,
    subject: template.subject ?? "",
    body: template.body,
  };
}

function draftToTemplate(id: string, draft: MailTemplateDraft): MailTemplate {
  const subject = draft.subject.trim();
  return {
    id,
    name: draft.name.trim(),
    ...(subject ? { subject } : {}),
    body: draft.body,
  };
}

/** Inline errors for the template editor; `editingId` is null while adding a new template. */
export function validateMailTemplateDraft(
  draft: MailTemplateDraft,
  templates: readonly MailTemplate[],
  editingId: string | null,
): MailTemplateDraftErrors {
  const name = entryNameError(draft.name, templates, editingId, "template", MAIL_TEMPLATE_LIMITS.name);
  const errors: MailTemplateDraftErrors = name ? { name } : {};
  if (draft.subject.trim().length > MAIL_TEMPLATE_LIMITS.subject) {
    errors.subject = `Use ${MAIL_TEMPLATE_LIMITS.subject} characters or fewer.`;
  }
  if (!draft.body.trim()) {
    errors.body = "Write the text this template inserts.";
  } else if (draft.body.length > MAIL_TEMPLATE_LIMITS.body) {
    errors.body = "Use 20,000 characters or fewer.";
  }
  if (Object.keys(errors).length > 0) return errors;
  if (!editingId && templates.length >= MAIL_TEMPLATE_LIMITS.count) {
    errors.form = `You can keep up to ${MAIL_TEMPLATE_LIMITS.count} templates. Delete one to add another.`;
  } else if (
    encodedSize(saveMailTemplate(templates, draft, editingId).templates) >
    MAIL_TEMPLATE_LIMITS.totalBytes
  ) {
    errors.form = "Your templates are full. Shorten or delete a template to save this one.";
  }
  return errors;
}

/** Adds the draft, or replaces the template with `editingId` in place. */
export function saveMailTemplate(
  templates: readonly MailTemplate[],
  draft: MailTemplateDraft,
  editingId: string | null,
): { templates: MailTemplate[]; id: string } {
  if (editingId && templates.some((template) => template.id === editingId)) {
    return {
      id: editingId,
      templates: templates.map((template) =>
        template.id === editingId ? draftToTemplate(editingId, draft) : template,
      ),
    };
  }
  const id = newClientEntityId();
  return { id, templates: [...templates, draftToTemplate(id, draft)] };
}

export function deleteMailTemplate(
  templates: readonly MailTemplate[],
  id: string,
): MailTemplate[] {
  return templates.filter((template) => template.id !== id);
}

/** Replaces the selection, or inserts at the start when there is none, and puts the caret after the inserted text. */
export function insertMailTemplateText(
  text: string,
  selection: TextSelection | null,
  insert: string,
): { text: string; selection: TextSelection } {
  const start = Math.min(Math.max(selection?.start ?? 0, 0), text.length);
  const end = Math.min(Math.max(selection?.end ?? start, start), text.length);
  const caret = start + insert.length;
  return {
    text: `${text.slice(0, start)}${insert}${text.slice(end)}`,
    selection: { start: caret, end: caret },
  };
}

/** A template fills the subject only while the message has none. */
export function resolveMailTemplateSubject(
  currentSubject: string,
  template: MailTemplate,
): string {
  const subject = template.subject?.trim();
  return currentSubject.trim() || !subject ? currentSubject : subject;
}

/** A template's list row text: its subject, or its body on one line. */
export function mailTemplatePreview(template: MailTemplate): string {
  return template.subject || entryPreview(template.body);
}
