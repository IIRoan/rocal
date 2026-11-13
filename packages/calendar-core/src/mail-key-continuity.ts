import { z } from "./zod";
import {
  isValidEmailAddress,
  normalizeEmailAddress,
  parseRecipientString,
} from "./mail-addresses";

export const MAIL_KEY_CONTINUITY_ENABLED = false;
export const MAIL_TRUST_MAX_RECORDS = 256;
export const MAIL_TRUST_MAX_PLAINTEXT_BYTES = 1_048_576;
export const MAIL_TRUST_MAX_CIPHERTEXT_LENGTH = 1_400_000;
export const mailTrustQueryKeys = {
  account: (accountId: string) => ["mail-trust", accountId] as const,
};

const fingerprintSchema = z.string().regex(/^(?:[A-F0-9]{40}|[A-F0-9]{64})$/);
const pinSchema = z
  .object({
    email: z
      .string()
      .min(3)
      .max(320)
      .refine(
        (value) =>
          isValidEmailAddress(value) && value === normalizeEmailAddress(value),
      ),
    fingerprint: fingerprintSchema,
    publicKeyArmored: z.string().min(1).max(16_384),
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    firstSeen: z.string().datetime(),
  })
  .strict();
export const mailTrustStateSchema = z
  .object({
    version: z.literal(1),
    revision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    pins: z.array(pinSchema).max(MAIL_TRUST_MAX_RECORDS),
  })
  .strict()
  .refine(
    (state) =>
      new Set(state.pins.map((pin) => pin.email)).size === state.pins.length,
  );

export type MailTrustState = z.infer<typeof mailTrustStateSchema>;
export type MailTrustPin = z.infer<typeof pinSchema>;
export type MailTrustObservedKey = Pick<
  MailTrustPin,
  "publicKeyArmored" | "fingerprint"
>;
export type MailTrustProblem = {
  kind:
    | "changed"
    | "unavailable"
    | "missing"
    | "rollback"
    | "capacity"
    | "update_required"
    | "review_changed"
    | "reset_complete";
  email?: string;
  oldFingerprint?: string;
  newFingerprint?: string;
  expectedEncryptedTrust?: string | null;
  resetAllowed?: boolean;
  removablePins?: Pick<MailTrustPin, "email" | "fingerprint">[];
};
export type MailTrustReviewAction =
  | "cancel"
  | "retry"
  | "approve"
  | "reset"
  | { kind: "remove"; email: string; fingerprint: string };

export class MailTrustBlockedError extends Error {
  constructor(public readonly problem: MailTrustProblem) {
    super(mailTrustProblemMessage(problem));
    this.name = "MailTrustBlockedError";
  }
}

export function mailTrustProblemMessage(problem: MailTrustProblem): string {
  switch (problem.kind) {
    case "changed":
      return "This recipient's saved encryption key changed. Compare the fingerprints before approving the replacement.";
    case "missing":
      return "Your saved encryption-key history is missing. Sending is paused until it is restored or you deliberately reset it.";
    case "rollback":
      return "Your saved encryption-key history is older than this device last saw. Sending is paused. Retry to fetch current history, restore it, or deliberately reset it if it cannot be recovered.";
    case "capacity":
      return "Your saved encryption-key history is full. Existing keys were kept and this message was not sent.";
    case "update_required":
      return "Your encryption-key history uses a newer format. Update Solace before sending; your saved keys were kept.";
    case "reset_complete":
      return "Saved encryption-key history was reset. Review the recipients and send again to establish new keys.";
    case "review_changed":
      return "The encryption key or saved history changed while you reviewed it. Review the current values again.";
    default:
      return "Your saved encryption keys could not be checked. Sending is paused. Retry when the key history is available.";
  }
}

export function normalizeMailTrustAddress(value: string): string {
  const email = normalizeEmailAddress(parseRecipientString(value).email);
  if (!isValidEmailAddress(email))
    throw new MailTrustBlockedError({ kind: "unavailable" });
  return email;
}

export function parseMailTrustState(value: unknown): MailTrustState {
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    typeof value.version === "number" &&
    value.version > 1
  ) {
    throw new MailTrustBlockedError({ kind: "update_required" });
  }
  const parsed = mailTrustStateSchema.safeParse(value);
  if (!parsed.success) throw new MailTrustBlockedError({ kind: "unavailable" });
  if (
    new TextEncoder().encode(JSON.stringify(parsed.data)).length >
    MAIL_TRUST_MAX_PLAINTEXT_BYTES
  ) {
    throw new MailTrustBlockedError({ kind: "capacity" });
  }
  return parsed.data;
}

export function observeMailTrustKey(
  state: MailTrustState,
  emailInput: string,
  key: MailTrustObservedKey,
  now: string,
  approvedOldFingerprint?: string,
): MailTrustState {
  const email = normalizeMailTrustAddress(emailInput);
  const pin = state.pins.find((candidate) => candidate.email === email);
  if (
    pin &&
    pin.fingerprint !== key.fingerprint &&
    approvedOldFingerprint !== pin.fingerprint
  ) {
    throw new MailTrustBlockedError({
      kind: "changed",
      email,
      oldFingerprint: pin.fingerprint,
      newFingerprint: key.fingerprint,
    });
  }
  if (approvedOldFingerprint && pin?.fingerprint !== approvedOldFingerprint) {
    throw new MailTrustBlockedError({ kind: "review_changed", email });
  }
  if (
    pin?.fingerprint === key.fingerprint &&
    pin.publicKeyArmored === key.publicKeyArmored
  )
    return state;
  if (!pin && state.pins.length >= MAIL_TRUST_MAX_RECORDS)
    throw new MailTrustBlockedError({ kind: "capacity", email });
  const next: MailTrustPin = {
    email,
    ...key,
    revision: pin ? pin.revision + 1 : 1,
    firstSeen: pin?.firstSeen ?? now,
  };
  return parseMailTrustState({
    version: 1,
    revision: state.revision + 1,
    pins: pin
      ? state.pins.map((candidate) =>
          candidate.email === email ? next : candidate,
        )
      : [...state.pins, next],
  });
}

export function createMailTrustReviewBridge() {
  type Handler = (
    problem: MailTrustProblem | null,
  ) => Promise<MailTrustReviewAction>;
  let handler: Handler | null = null;
  return {
    subscribe(next: Handler) {
      if (handler) void handler(null).catch(() => undefined);
      handler = next;
      return () => {
        if (handler === next) handler = null;
      };
    },
    cancel() {
      if (handler) void handler(null).catch(() => undefined);
    },
    request(problem: MailTrustProblem): Promise<MailTrustReviewAction> {
      return handler ? handler(problem) : Promise.resolve("cancel");
    },
  };
}

export const MAIL_TRUST_RESET_WARNING =
  "This forgets every saved correspondent key. The next protected send will establish keys again. Compare fingerprints through another trusted channel first. This cannot recover previous history.";
export const MAIL_TRUST_IDENTITY_NOTICE =
  "Compare the offered fingerprint with your contact through a separate trusted channel. First use records the offered key without independently verifying identity. This device checks its highest saved history revision when local storage is available. A fresh device or cleared local storage cannot detect earlier server history.";
export function mailTrustReviewActions(problem: MailTrustProblem) {
  return {
    approve:
      problem.kind === "changed" &&
      Boolean(problem.oldFingerprint && problem.newFingerprint),
    retry: problem.kind !== "update_required",
    reset:
      problem.resetAllowed === true &&
      problem.expectedEncryptedTrust !== undefined &&
      ["unavailable", "missing", "rollback", "capacity"].includes(problem.kind),
  };
}

export type MailSenderKeyTrustState =
  | {
      kind:
        | "self"
        | "pinned"
        | "unpinned"
        | "missing"
        | "rollback"
        | "update_required"
        | "not_applicable";
    }
  | { kind: "unavailable"; reason: "history" | "directory" | "local" }
  | { kind: "key_changed"; oldFingerprint: string; newFingerprint: string };
export type MailSenderVerification = {
  senderPublicKeyArmored?: string;
  senderKeyTrustState?: MailSenderKeyTrustState;
};

export function getMailSenderTrustNotice(
  state: MailSenderKeyTrustState | undefined,
): { label: string; description: string } | null {
  switch (state?.kind) {
    case "key_changed":
      return {
        label: "Sender key changed",
        description:
          "The directory offers a different key. This message was checked against the previously saved key. Reading does not approve the replacement.",
      };
    case "unpinned":
      return {
        label: "Sender key not saved",
        description:
          "No saved key is available for this sender. Reading does not establish one.",
      };
    case "rollback":
      return {
        label: "Sender key history is older",
        description:
          "Saved history is older than this device last saw. Retry or deliberately recover the saved history; reading does not approve a reset.",
      };
    case "missing":
      return {
        label: "Sender key history missing",
        description:
          "Previously established history is missing. Sender-key continuity is unconfirmed.",
      };
    case "update_required":
      return {
        label: "Update required to check sender key",
        description:
          "Saved key history has a newer format. Update Solace; reading does not reset it.",
      };
    case "unavailable":
      if (state.reason === "local")
        return {
          label: "Local key-history protection unavailable",
          description:
          "The signature was checked with the saved key, but this device could not save or check its local history revision. After restarting, older server history cannot be checked against that unsaved revision.",
        };
      return state.reason === "directory"
        ? {
            label: "Sender key status unavailable",
            description:
              "The signature was checked with the saved key, but the current directory key could not be checked.",
          }
        : {
            label: "Sender key history unavailable",
            description:
              "Earlier signature verification does not establish current sender-key continuity while saved history is unavailable.",
          };
    default:
      return null;
  }
}
export function getMailSignatureVerificationLabel(
  signature: "not_signed" | "verified" | "unverified" | "failed",
  trust: MailSenderKeyTrustState | undefined,
): string | null {
  if (signature === "failed")
    return trust?.kind === "key_changed"
      ? "Signature does not match saved key"
      : "Signature verification failed";
  if (signature === "unverified") return "Signature not verified";
  if (signature !== "verified") return null;
  if (trust?.kind === "self") return "Signed with your local key";
  if (trust?.kind === "key_changed")
    return "Signature matches previous saved key";
  if (
    trust?.kind === "pinned" ||
    (trust?.kind === "unavailable" && trust.reason !== "history")
  )
    return "Signature matches saved key";
  if (trust || MAIL_KEY_CONTINUITY_ENABLED)
    return "Earlier signature check, key history unconfirmed";
  return "Signature verified";
}

export const mailSenderKeyTrustStateSchema = z.union([
  z
    .object({
      kind: z.enum([
        "self",
        "pinned",
        "unpinned",
        "missing",
        "rollback",
        "update_required",
        "not_applicable",
      ]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unavailable"),
      reason: z.enum(["history", "directory", "local"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("key_changed"),
      oldFingerprint: fingerprintSchema,
      newFingerprint: fingerprintSchema,
    })
    .strict(),
]);
