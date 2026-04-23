import { t } from "elysia";

export type RowEncryptionState = "plaintext" | "shadow_write" | "encrypted";

export const rowEncryptionStateSchema = t.Union(
  [
    t.Literal("plaintext"),
    t.Literal("shadow_write"),
    t.Literal("encrypted"),
  ],
  {
    description:
      "Encryption rollout state for this row (plaintext, shadow_write, or encrypted).",
  },
);