import type { RowEncryptionState } from "./encryption-state";
import { ALLOWED_CALENDAR_COLORS, isValidCalendarColor } from "./colors";
import { ValidationError } from "./errors";

type NormalizeEntityNameOptions = {
  entityLabel: string;
  field?: string;
  maxLength?: number;
};

type EncryptedNameFieldsInput = {
  encryptedName?: string;
  blindIndexTokens?: string[];
  encryptionState?: RowEncryptionState;
  encryptionKeyVersion?: number;
};

export function normalizeEntityName(
  value: string,
  options: NormalizeEntityNameOptions,
) {
  const { entityLabel, field = "name", maxLength = 100 } = options;
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new ValidationError(
      `${entityLabel} name is required and cannot be empty`,
      field,
    );
  }

  if (trimmedValue.length > maxLength) {
    throw new ValidationError(
      `${entityLabel} name cannot exceed ${maxLength} characters`,
      field,
    );
  }

  return trimmedValue;
}

export function assertValidEntityColor(color: string, field: string = "color") {
  if (!isValidCalendarColor(color)) {
    throw new ValidationError(
      `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
      field,
    );
  }
}

export function buildEncryptedNameFields(input: EncryptedNameFieldsInput) {
  return {
    ...(input.encryptedName !== undefined
      ? { encryptedName: input.encryptedName }
      : {}),
    ...(input.blindIndexTokens !== undefined
      ? { blindIndexTokens: JSON.stringify(input.blindIndexTokens) }
      : {}),
    ...(input.encryptionState !== undefined
      ? { encryptionState: input.encryptionState }
      : {}),
    ...(input.encryptionKeyVersion !== undefined
      ? { encryptionKeyVersion: input.encryptionKeyVersion }
      : {}),
  };
}
