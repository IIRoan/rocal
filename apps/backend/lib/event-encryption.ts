export type EventEncryptionMode = "hybrid" | "full";

export type ResolvedEventPersistencePolicy = {
  encryptionState: "plaintext" | "shadow_write" | "encrypted";
  title: string;
  description: string | null;
  location: string | null;
};

type ResolveEventPersistencePolicyInput = {
  mode?: string | null;
  hasEncryptedPayload: boolean;
  title: string;
  description?: string | null;
  location?: string | null;
  reminderMinutes?: number | null;
  calendarShareEnabled?: boolean;
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeEventEncryptionMode(
  value?: string | null,
): EventEncryptionMode {
  return value === "full" ? "full" : "hybrid";
}

export function isEventFullyEncrypted(
  encryptionState?: string | null,
): boolean {
  return encryptionState === "encrypted";
}

export function resolveEventPersistencePolicy(
  input: ResolveEventPersistencePolicyInput,
): ResolvedEventPersistencePolicy {
  const mode = normalizeEventEncryptionMode(input.mode);
  const title = input.title.trim();
  const description = normalizeOptionalText(input.description);
  const location = normalizeOptionalText(input.location);
  const requiresPlaintext =
    (input.reminderMinutes ?? null) !== null || !!input.calendarShareEnabled;

  if (!input.hasEncryptedPayload) {
    return {
      encryptionState: "plaintext",
      title,
      description,
      location,
    };
  }

  if (mode === "full") {
    return {
      encryptionState: "encrypted",
      title: "",
      description: null,
      location: null,
    };
  }

  if (requiresPlaintext) {
    return {
      encryptionState: "shadow_write",
      title,
      description,
      location,
    };
  }

  return {
    encryptionState: "encrypted",
    title: "",
    description: null,
    location: null,
  };
}