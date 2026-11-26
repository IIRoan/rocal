"use client";

import { useId, useState } from "react";
import { FileText, Plus } from "lucide-react";
import {
  EMPTY_MAIL_TEMPLATE_DRAFT,
  MAIL_TEMPLATES_DESCRIPTION,
  MAIL_TEMPLATE_LIMITS,
  deleteMailTemplate,
  mailTemplateToDraft,
  saveMailTemplate,
  validateMailTemplateDraft,
  type MailTemplate,
  type MailTemplateDraft,
  type MailTemplateDraftErrors,
} from "@workspace/calendar-core";
import { Textarea } from "@workspace/ui/components/ui/textarea";
import { useMailComposeSettings } from "@/lib/mail/compose-settings";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteField,
  PaletteFormActions,
  PaletteNavRow,
  PaletteSection,
  PaletteView,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";

type Editing = { id: string | null; draft: MailTemplateDraft };

export function MailTemplatesPanel({ goBack }: { goBack: () => void }) {
  const { settings, updateSettings } = useMailComposeSettings();
  const [editing, setEditing] = useState<Editing | null>(null);
  const templates = settings.templates;

  if (editing) {
    const editingId = editing.id;
    return (
      <PaletteView
        title={editing.id ? "Edit template" : "New template"}
        onBack={() => setEditing(null)}
      >
        <MailTemplateForm
          editing={editing}
          templates={templates}
          onCancel={() => setEditing(null)}
          onSave={(draft) => {
            updateSettings({
              templates: saveMailTemplate(templates, draft, editingId).templates,
            });
            setEditing(null);
          }}
          onDelete={
            editingId
              ? () => {
                  updateSettings({ templates: deleteMailTemplate(templates, editingId) });
                  setEditing(null);
                }
              : undefined
          }
        />
      </PaletteView>
    );
  }

  return (
    <PaletteView title="Templates" onBack={goBack}>
      <p className="p-2 text-[13px] leading-[130%] text-muted-foreground">
        {MAIL_TEMPLATES_DESCRIPTION}
      </p>
      <PaletteNavRow
        icon={Plus}
        label="New template"
        disabled={templates.length >= MAIL_TEMPLATE_LIMITS.count}
        description={
          templates.length >= MAIL_TEMPLATE_LIMITS.count
            ? `You can keep up to ${MAIL_TEMPLATE_LIMITS.count} templates.`
            : undefined
        }
        trailing={null}
        onClick={() => setEditing({ id: null, draft: EMPTY_MAIL_TEMPLATE_DRAFT })}
      />
      {templates.length === 0 ? (
        <PaletteEmptyState>No templates yet.</PaletteEmptyState>
      ) : (
        <PaletteSection label="Your templates">
          {templates.map((template) => (
            <PaletteNavRow
              key={template.id}
              icon={FileText}
              label={template.name}
              description={templatePreview(template)}
              onClick={() =>
                setEditing({ id: template.id, draft: mailTemplateToDraft(template) })
              }
            />
          ))}
        </PaletteSection>
      )}
    </PaletteView>
  );
}

function templatePreview(template: MailTemplate): string {
  return template.subject || template.body.replace(/\s+/g, " ").trim();
}

function MailTemplateForm({
  editing,
  templates,
  onCancel,
  onSave,
  onDelete,
}: {
  editing: Editing;
  templates: MailTemplate[];
  onCancel: () => void;
  onSave: (draft: MailTemplateDraft) => void;
  onDelete?: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(editing.draft);
  const [submitted, setSubmitted] = useState(false);
  const errors: MailTemplateDraftErrors = submitted
    ? validateMailTemplateDraft(draft, templates, editing.id)
    : {};
  const patch = (next: Partial<MailTemplateDraft>) =>
    setDraft((current) => ({ ...current, ...next }));
  const fieldProps = (field: keyof MailTemplateDraftErrors) =>
    errors[field]
      ? { "aria-invalid": true, "aria-describedby": `${id}-${field}-error` }
      : {};

  const save = () => {
    setSubmitted(true);
    const nextErrors = validateMailTemplateDraft(draft, templates, editing.id);
    if (Object.keys(nextErrors).length > 0) {
      const field = (["name", "subject", "body"] as const).find((key) => nextErrors[key]);
      if (field) document.getElementById(`${id}-${field}`)?.focus();
      return;
    }
    onSave(draft);
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <PaletteField label="Name" htmlFor={`${id}-name`}>
        <input
          id={`${id}-name`}
          type="text"
          value={draft.name}
          placeholder="Thanks for reaching out"
          autoComplete="off"
          onChange={(event) => patch({ name: event.target.value })}
          className={PALETTE_INPUT_CLASS}
          {...fieldProps("name")}
        />
        <FieldError id={`${id}-name-error`} message={errors.name} />
      </PaletteField>
      <PaletteField
        label="Subject"
        htmlFor={`${id}-subject`}
        hint="Optional. Fills the subject only when it's empty."
      >
        <input
          id={`${id}-subject`}
          type="text"
          value={draft.subject}
          autoComplete="off"
          onChange={(event) => patch({ subject: event.target.value })}
          className={PALETTE_INPUT_CLASS}
          {...fieldProps("subject")}
        />
        <FieldError id={`${id}-subject-error`} message={errors.subject} />
      </PaletteField>
      <PaletteField label="Text" htmlFor={`${id}-body`}>
        <Textarea
          id={`${id}-body`}
          value={draft.body}
          rows={6}
          onChange={(event) => patch({ body: event.target.value })}
          className="bg-muted text-base text-foreground md:text-[15px]"
          {...fieldProps("body")}
        />
        <FieldError id={`${id}-body-error`} message={errors.body} />
      </PaletteField>
      {errors.form ? (
        <p role="alert" className="px-2 text-[13px] leading-[130%] text-destructive">
          {errors.form}
        </p>
      ) : null}
      <PaletteFormActions>
        {onDelete ? (
          <PaletteButton variant="destructive" className="mr-auto" onClick={onDelete}>
            Delete
          </PaletteButton>
        ) : null}
        <PaletteButton variant="ghost" onClick={onCancel}>
          Cancel
        </PaletteButton>
        <PaletteButton type="submit" variant="primary">
          Save
        </PaletteButton>
      </PaletteFormActions>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-[13px] leading-[130%] text-destructive">
      {message}
    </p>
  ) : null;
}
