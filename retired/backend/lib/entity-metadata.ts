import {
  ENCRYPTED_CALENDAR_EXTERNAL_LABEL,
  PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE,
  hasEncryptedPayloadValue,
  CALENDAR_COLORS,
  isValidCalendarColor,
} from "@workspace/calendar-core";
import type { PrismaClient } from "../generated/prisma/index.js";
import { ValidationError } from "./errors";

type NormalizeEntityNameOptions = {
  entityLabel: string;
  field?: string;
  maxLength?: number;
};

type EntityNamePersistenceInput = {
  entityLabel: string;
  name?: string;
  encryptedName?: string;
  blindIndexTokens?: string[];
  encryptionKeyVersion?: number;
  requireName: boolean;
};

export type EntityNamePersistence =
  | { kind: "none"; data: Record<string, never> }
  | {
      kind: "plaintext";
      name: string;
      data: {
        name: string;
        encryptedName: null;
        blindIndexTokens: null;
        encryptionState: "plaintext";
      };
    }
  | {
      kind: "encrypted";
      data: {
        name: "";
        encryptedName: string;
        blindIndexTokens: string;
        encryptionState: "encrypted";
        encryptionKeyVersion: number;
      };
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
      `Color must be one of: ${CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
      field,
    );
  }
}

/** Ciphertext blanks the plaintext column; plaintext alongside ciphertext is rejected. */
export function resolveEntityNamePersistence(
  input: EntityNamePersistenceInput & { requireName: true },
): Exclude<EntityNamePersistence, { kind: "none" }>;
export function resolveEntityNamePersistence(
  input: EntityNamePersistenceInput,
): EntityNamePersistence;
export function resolveEntityNamePersistence(
  input: EntityNamePersistenceInput,
): EntityNamePersistence {
  const { entityLabel } = input;

  if (input.encryptedName !== undefined) {
    if (!hasEncryptedPayloadValue(input.encryptedName)) {
      throw new ValidationError(
        `Encrypted ${entityLabel.toLowerCase()} name cannot be empty`,
        "encryptedName",
      );
    }

    if (input.name?.trim()) {
      throw new ValidationError(PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE, "name");
    }

    return {
      kind: "encrypted",
      data: {
        name: "",
        encryptedName: input.encryptedName,
        blindIndexTokens: JSON.stringify(input.blindIndexTokens ?? []),
        encryptionState: "encrypted",
        encryptionKeyVersion: input.encryptionKeyVersion ?? 1,
      },
    };
  }

  if (input.name === undefined && !input.requireName) {
    return { kind: "none", data: {} };
  }

  const name = normalizeEntityName(input.name ?? "", { entityLabel });

  return {
    kind: "plaintext",
    name,
    data: {
      name,
      encryptedName: null,
      blindIndexTokens: null,
      encryptionState: "plaintext",
    },
  };
}

/** Accounts with an E2EE device must send encrypted names. */
export async function assertPlaintextNameAllowed(
  prisma: Pick<PrismaClient, "userEncryptionDevice">,
  userId: string,
  entityLabel: string,
): Promise<void> {
  const deviceCount = await prisma.userEncryptionDevice.count({
    where: { userId },
  });

  if (deviceCount > 0) {
    throw new ValidationError(
      `${entityLabel} name encryption requires an active encryption session.`,
      "encryptedName",
    );
  }
}

/** Calendar label sent to Stalwart/ICS; encrypted names never leave the device. */
export function externalCalendarName(name: string): string {
  return name.trim() || ENCRYPTED_CALENDAR_EXTERNAL_LABEL;
}
