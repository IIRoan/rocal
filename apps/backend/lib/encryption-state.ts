import { t } from "elysia";
import type { EncryptionState } from "@workspace/calendar-core";

export type RowEncryptionState = EncryptionState;

export const rowEncryptionStateSchema = t.Union(
  [t.Literal("plaintext"), t.Literal("shadow_write"), t.Literal("encrypted")],
  {
    description:
      "Encryption rollout state for this row (plaintext, shadow_write, or encrypted).",
  },
);
