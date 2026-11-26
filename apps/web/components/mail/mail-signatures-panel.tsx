"use client";

import { useId, useState } from "react";
import { Plus, Signature } from "lucide-react";
import {
  EMPTY_MAIL_SIGNATURE_DRAFT,
  MAIL_SIGNATURES_DESCRIPTION,
  MAIL_SIGNATURE_LIMITS,
  deleteMailSignature,
  getMailSignatureDefaultId,
  mailSignatureToDraft,
  saveMailSignature,
  setMailSignatureDefault,
  validateMailSignatureDraft,
  type MailSignature,
  type MailSignatureDraft,
  type MailSignatureDraftErrors,
  type MailSignatureKind,
} from "@workspace/calendar-core";
import { Textarea } from "@workspace/ui/components/ui/textarea";
import { useMailComposeSettings } from "@/lib/mail/compose-settings";
import type { JmapIdentity } from "@/lib/mail/types";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteField,
  PaletteFormActions,
  PaletteNavRow,
  PaletteSection,
  PaletteSelect,
  PaletteView,
} from "../command-palette/palette-ui";
import { PALETTE_INPUT_CLASS } from "../command-palette/palette-styles";

type Editing = { id: string | null; draft: MailSignatureDraft };

const NO_SIGNATURE = "none";

const DEFAULT_KINDS: { kind: MailSignatureKind; label: string }[] = [
  { kind: "newMessage", label: "New messages" },
  { kind: "replyForward", label: "Replies and forwards" },
];

export function MailSignaturesPanel({
  goBack,
  identities,
}: {
  goBack: () => void;
  identities: JmapIdentity[];
}) {
  const { settings, updateSettings } = useMailComposeSettings();
  const [editing, setEditing] = useState<Editing | null>(null);
  const signatures = settings.signatures;
  const full = signatures.length >= MAIL_SIGNATURE_LIMITS.count;

  if (editing) {
    const editingId = editing.id;
    return (
      <PaletteView
        title={editing.id ? "Edit signature" : "New signature"}
        onBack={() => setEditing(null)}
      >
        <MailSignatureForm
          editing={editing}
          signatures={signatures}
          onCancel={() => setEditing(null)}
          onSave={(draft) => {
            const saved = saveMailSignature(
              settings,
              draft,
              editingId,
              identities.map((identity) => identity.id),
            );
            updateSettings({
              signatures: saved.signatures,
              signatureDefaults: saved.signatureDefaults,
            });
            setEditing(null);
          }}
          onDelete={
            editingId
              ? () => {
                  updateSettings(deleteMailSignature(settings, editingId));
                  setEditing(null);
                }
              : undefined
          }
        />
      </PaletteView>
    );
  }

  return (
    <PaletteView title="Signatures" onBack={goBack}>
      <p className="p-2 text-[13px] leading-[130%] text-muted-foreground">
        {MAIL_SIGNATURES_DESCRIPTION}
      </p>
      <PaletteNavRow
        icon={Plus}
        label="New signature"
        disabled={full}
        description={
          full ? `You can keep up to ${MAIL_SIGNATURE_LIMITS.count} signatures.` : undefined
        }
        trailing={null}
        onClick={() => setEditing({ id: null, draft: EMPTY_MAIL_SIGNATURE_DRAFT })}
      />
      {signatures.length === 0 ? (
        <PaletteEmptyState>No signatures yet.</PaletteEmptyState>
      ) : (
        <>
          <PaletteSection label="Your signatures">
            {signatures.map((signature) => (
              <PaletteNavRow
                key={signature.id}
                icon={Signature}
                label={signature.name}
                description={signature.body.replace(/\s+/g, " ").trim()}
                onClick={() =>
                  setEditing({ id: signature.id, draft: mailSignatureToDraft(signature) })
                }
              />
            ))}
          </PaletteSection>
          {identities.map((identity) => (
            <PaletteSection key={identity.id} label={`Defaults for ${identity.email}`}>
              {DEFAULT_KINDS.map(({ kind, label }) => (
                <SignatureDefaultField
                  key={kind}
                  label={label}
                  signatures={signatures}
                  value={getMailSignatureDefaultId(settings.signatureDefaults, identity.id, kind)}
                  onChange={(signatureId) =>
                    updateSettings({
                      signatureDefaults: setMailSignatureDefault(
                        settings.signatureDefaults,
                        identity.id,
                        kind,
                        signatureId,
                      ),
                    })
                  }
                />
              ))}
            </PaletteSection>
          ))}
        </>
      )}
    </PaletteView>
  );
}

function SignatureDefaultField({
  label,
  signatures,
  value,
  onChange,
}: {
  label: string;
  signatures: MailSignature[];
  value: string | null;
  onChange: (signatureId: string | null) => void;
}) {
  const id = useId();
  const options = [
    { value: NO_SIGNATURE, label: "None" },
    ...signatures.map((signature) => ({ value: signature.id, label: signature.name })),
  ];
  const selected = signatures.some((signature) => signature.id === value) ? value : null;
  return (
    <PaletteField label={label} htmlFor={id}>
      <PaletteSelect
        id={id}
        label={label}
        value={selected ?? NO_SIGNATURE}
        options={options}
        onValueChange={(next) => onChange(next === NO_SIGNATURE ? null : next)}
      />
    </PaletteField>
  );
}

function MailSignatureForm({
  editing,
  signatures,
  onCancel,
  onSave,
  onDelete,
}: {
  editing: Editing;
  signatures: MailSignature[];
  onCancel: () => void;
  onSave: (draft: MailSignatureDraft) => void;
  onDelete?: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(editing.draft);
  const [submitted, setSubmitted] = useState(false);
  const errors: MailSignatureDraftErrors = submitted
    ? validateMailSignatureDraft(draft, signatures, editing.id)
    : {};
  const patch = (next: Partial<MailSignatureDraft>) =>
    setDraft((current) => ({ ...current, ...next }));
  const fieldProps = (field: keyof MailSignatureDraftErrors) =>
    errors[field]
      ? { "aria-invalid": true, "aria-describedby": `${id}-${field}-error` }
      : {};

  const save = () => {
    setSubmitted(true);
    const nextErrors = validateMailSignatureDraft(draft, signatures, editing.id);
    if (Object.keys(nextErrors).length > 0) {
      const field = (["name", "body"] as const).find((key) => nextErrors[key]);
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
          placeholder="Work"
          autoComplete="off"
          onChange={(event) => patch({ name: event.target.value })}
          className={PALETTE_INPUT_CLASS}
          {...fieldProps("name")}
        />
        <FieldError id={`${id}-name-error`} message={errors.name} />
      </PaletteField>
      <PaletteField label="Text" htmlFor={`${id}-body`}>
        <Textarea
          id={`${id}-body`}
          value={draft.body}
          rows={5}
          placeholder={"Kind regards,\nAlex"}
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
