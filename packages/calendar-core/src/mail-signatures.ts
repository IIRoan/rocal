import { newClientEntityId } from "./content-encryption";
import {
  getPlainTextSignature,
  replacePlainTextSignatureBlock,
  resolveComposeSignatureIdentity,
  type SignatureSource,
} from "./mail-signature";
import { encodedSize, entryNameError, entryPreview, normalizeEntries } from "./mail-settings-entries";
import { z } from "./zod";

export const MAIL_SIGNATURE_LIMITS = {
  count: 10,
  name: 80,
  body: 2_000,
  identities: 20,
  /** Beside templates' 30,000 bytes this keeps the sealed mail settings blob well under the API's 65,536 characters. */
  totalBytes: 8_000,
} as const;

const signatureIdSchema = z.string().min(1).max(32);

const mailSignatureSchema = z.strictObject({
  id: signatureIdSchema,
  name: z.string().trim().min(1).max(MAIL_SIGNATURE_LIMITS.name),
  body: z.string().max(MAIL_SIGNATURE_LIMITS.body),
});

const mailSignatureDefaultSchema = z.strictObject({
  identityId: z.string().min(1).max(64),
  newMessage: signatureIdSchema.nullable(),
  replyForward: signatureIdSchema.nullable(),
});

export type MailSignature = z.infer<typeof mailSignatureSchema>;

/** The signatures one JMAP identity starts new messages and replies or forwards with; null is no signature. */
export type MailSignatureDefault = z.infer<typeof mailSignatureDefaultSchema>;

export type MailSignatureKind = "newMessage" | "replyForward";

export type MailSignatureSettings = {
  signatures: readonly MailSignature[];
  signatureDefaults: readonly MailSignatureDefault[];
};

export type MailSignatureDraft = { name: string; body: string };

export type MailSignatureDraftErrors = Partial<
  Record<keyof MailSignatureDraft | "form", string>
>;

export const EMPTY_MAIL_SIGNATURE_DRAFT: MailSignatureDraft = { name: "", body: "" };

export const MAIL_SIGNATURES_DESCRIPTION =
  "Sign off the mail you write. Signatures are encrypted and sync to your devices.";

export function normalizeMailSignatures(input: unknown): MailSignature[] {
  return normalizeEntries(
    input,
    mailSignatureSchema,
    (signature) => signature.id,
    MAIL_SIGNATURE_LIMITS.count,
  );
}

export function normalizeMailSignatureDefaults(input: unknown): MailSignatureDefault[] {
  return normalizeEntries(
    input,
    mailSignatureDefaultSchema,
    (entry) => entry.identityId,
    MAIL_SIGNATURE_LIMITS.identities,
  );
}

export function mailSignatureToDraft(signature: MailSignature): MailSignatureDraft {
  return { name: signature.name, body: signature.body };
}

/** Inline errors for the signature editor; `editingId` is null while adding a new signature. */
export function validateMailSignatureDraft(
  draft: MailSignatureDraft,
  signatures: readonly MailSignature[],
  editingId: string | null,
): MailSignatureDraftErrors {
  const name = entryNameError(draft.name, signatures, editingId, "signature", MAIL_SIGNATURE_LIMITS.name);
  const errors: MailSignatureDraftErrors = name ? { name } : {};
  const body = draft.body.trim();
  if (!body) {
    errors.body = "Write the text this signature adds.";
  } else if (body.length > MAIL_SIGNATURE_LIMITS.body) {
    errors.body = "Use 2,000 characters or fewer.";
  }
  if (Object.keys(errors).length > 0) return errors;
  if (!editingId && signatures.length >= MAIL_SIGNATURE_LIMITS.count) {
    errors.form = `You can keep up to ${MAIL_SIGNATURE_LIMITS.count} signatures. Delete one to add another.`;
  } else if (
    encodedSize(
      saveMailSignature({ signatures, signatureDefaults: [] }, draft, editingId).signatures,
    ) > MAIL_SIGNATURE_LIMITS.totalBytes
  ) {
    errors.form = "Your signatures are full. Shorten or delete a signature to save this one.";
  }
  return errors;
}

/** Adds the draft, or replaces the signature with `editingId`; a first signature becomes the default of every identity in `identityIds`. */
export function saveMailSignature(
  settings: MailSignatureSettings,
  draft: MailSignatureDraft,
  editingId: string | null,
  identityIds: readonly string[] = [],
): { signatures: MailSignature[]; signatureDefaults: MailSignatureDefault[]; id: string } {
  const editing =
    editingId !== null && settings.signatures.some((signature) => signature.id === editingId);
  const id = editing && editingId ? editingId : newClientEntityId();
  const saved = { id, name: draft.name.trim(), body: draft.body.trim() };
  if (editing) {
    return {
      id,
      signatures: settings.signatures.map((signature) =>
        signature.id === id ? saved : signature,
      ),
      signatureDefaults: [...settings.signatureDefaults],
    };
  }
  return {
    id,
    signatures: [...settings.signatures, saved],
    signatureDefaults:
      settings.signatures.length === 0
        ? identityIds
            .slice(0, MAIL_SIGNATURE_LIMITS.identities)
            .map((identityId) => ({ identityId, newMessage: id, replyForward: id }))
        : [...settings.signatureDefaults],
  };
}

/** Deletes the signature and clears it from every default that used it. */
export function deleteMailSignature(
  settings: MailSignatureSettings,
  id: string,
): { signatures: MailSignature[]; signatureDefaults: MailSignatureDefault[] } {
  return {
    signatures: settings.signatures.filter((signature) => signature.id !== id),
    signatureDefaults: settings.signatureDefaults.reduce<MailSignatureDefault[]>(
      (kept, entry) => withoutEmptyDefault(kept, {
        identityId: entry.identityId,
        newMessage: entry.newMessage === id ? null : entry.newMessage,
        replyForward: entry.replyForward === id ? null : entry.replyForward,
      }),
      [],
    ),
  };
}

function withoutEmptyDefault(
  kept: MailSignatureDefault[],
  entry: MailSignatureDefault,
): MailSignatureDefault[] {
  return entry.newMessage || entry.replyForward ? [...kept, entry] : kept;
}

export function getMailSignatureDefaultId(
  defaults: readonly MailSignatureDefault[],
  identityId: string | null | undefined,
  kind: MailSignatureKind,
): string | null {
  return defaults.find((entry) => entry.identityId === identityId)?.[kind] ?? null;
}

export function setMailSignatureDefault(
  defaults: readonly MailSignatureDefault[],
  identityId: string,
  kind: MailSignatureKind,
  signatureId: string | null,
): MailSignatureDefault[] {
  const current = defaults.find((entry) => entry.identityId === identityId);
  const next: MailSignatureDefault = {
    identityId,
    newMessage: kind === "newMessage" ? signatureId : (current?.newMessage ?? null),
    replyForward: kind === "replyForward" ? signatureId : (current?.replyForward ?? null),
  };
  const updated = current
    ? defaults.map((entry) => (entry === current ? next : entry))
    : [...defaults, next];
  return updated.reduce<MailSignatureDefault[]>(withoutEmptyDefault, []);
}

export function composeSignatureKind(mode: string | null | undefined): MailSignatureKind {
  return mode === "reply" || mode === "reply-all" || mode === "forward"
    ? "replyForward"
    : "newMessage";
}

function mailSignatureSource(signature: MailSignature): SignatureSource & { id: string } {
  return { id: signature.id, textSignature: signature.body };
}

/** `choice` undefined follows the identity's default and null means none; the identity's own JMAP signature applies until a signature is saved. */
export function resolveComposeSignature<T extends SignatureSource & { id?: string | null }>(
  settings: MailSignatureSettings,
  identities: readonly T[],
  identityId: string | null | undefined,
  kind: MailSignatureKind,
  choice?: string | null,
): (SignatureSource & { id?: string | null }) | null {
  if (choice === null) return null;
  if (settings.signatures.length === 0) {
    return resolveComposeSignatureIdentity(identities, identityId);
  }
  const chosenId =
    choice ??
    getMailSignatureDefaultId(
      settings.signatureDefaults,
      identityId ?? identities[0]?.id,
      kind,
    );
  const signature = settings.signatures.find((entry) => entry.id === chosenId);
  return signature ? mailSignatureSource(signature) : null;
}

/** Every signature compose may have put in a body, longest first so a shorter one never matches inside it. */
export function composeSignatureCandidates(
  settings: MailSignatureSettings,
  identities: readonly SignatureSource[],
): SignatureSource[] {
  return [...settings.signatures.map(mailSignatureSource), ...identities]
    .filter((candidate) => getPlainTextSignature(candidate))
    .sort(
      (a, b) => getPlainTextSignature(b).length - getPlainTextSignature(a).length,
    );
}

/** Swaps whichever candidate sits on its own lines in the body for `next`, or removes it; null when the body holds none. */
export function replaceComposePlainTextSignature(
  body: string,
  candidates: readonly SignatureSource[],
  next: SignatureSource | null,
  options: { separator: boolean },
): string | null {
  for (const candidate of candidates) {
    const replaced = replacePlainTextSignatureBlock(body, candidate, next, options);
    if (replaced !== null) return replaced;
  }
  return null;
}

export type ComposeSignatureOption = {
  key: string;
  /** What picking the row stores as the compose choice; undefined follows the identity's default. */
  choice: string | undefined;
  name: string;
  preview: string;
  selected: boolean;
};

export function mailSignaturePreview(signature: MailSignature): string {
  return entryPreview(signature.body);
}

/** Rows for the compose signature picker: saved signatures, or the identity's own signature until one is saved. */
export function listComposeSignatureOptions<T extends SignatureSource & { id?: string | null }>(
  settings: MailSignatureSettings,
  identities: readonly T[],
  identityId: string | null | undefined,
  kind: MailSignatureKind,
  choice: string | null | undefined,
): ComposeSignatureOption[] {
  const active = resolveComposeSignature(settings, identities, identityId, kind, choice);
  if (settings.signatures.length > 0) {
    return settings.signatures.map((signature) => ({
      key: signature.id,
      choice: signature.id,
      name: signature.name,
      preview: mailSignaturePreview(signature),
      selected: active?.id === signature.id,
    }));
  }
  const accountSignature = getPlainTextSignature(
    resolveComposeSignatureIdentity(identities, identityId),
  );
  return accountSignature
    ? [
        {
          key: "account",
          choice: undefined,
          name: "Account signature",
          preview: entryPreview(accountSignature),
          selected: Boolean(getPlainTextSignature(active)),
        },
      ]
    : [];
}
