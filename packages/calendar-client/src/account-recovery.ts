import type { Schema } from "@workspace/api-contracts";
import type { E2eeModule } from "@workspace/e2ee";
import { z } from "@workspace/calendar-core/zod";
import type { AccountApiService } from "./account-api-service";

export const RECOVERY_KEY_TYPO_MESSAGE =
  "That recovery key has a typo. Check each group of four and try again.";

const RECOVERY_UNWRAP_MESSAGE =
  "This recovery key could not open your encrypted data. Contact support.";

/** POST to a Better Auth route through the auth-key fetch, resolving to the body or throwing its message. */
export type RecoveryPost = (
  path: string,
  body: Record<string, unknown>,
) => Promise<unknown>;

type AuthClientFetch = (
  path: string,
  options: { method: "POST"; body: Record<string, unknown>; throw: false },
) => Promise<{ data: unknown; error: { message?: string } | null }>;

const recoveryEnvelopeSchema = z.object({
  wrappedAccountKey: z.string().min(1),
  wrappedSearchKey: z.string().min(1),
  keyVersion: z.number().int().min(1),
}) satisfies z.ZodType<Schema<"RecoveryEnvelope">>;

/** Adapts a Better Auth client's `$fetch` to `RecoveryPost`. */
export function recoveryPost(fetch: AuthClientFetch): RecoveryPost {
  return async (path, body) => {
    const result = await fetch(path, { method: "POST", body, throw: false });
    if (result.error) {
      throw new Error(result.error.message || "Unable to reset your password. Try again.");
    }
    return result.data;
  };
}

/** Seals the session's keys under a fresh recovery key and stores the kit; returns the key for the user to save, which nothing persists. */
export async function createRecoveryKit(input: {
  api: Pick<AccountApiService, "putRecoveryKit">;
  e2ee: Pick<
    E2eeModule,
    "generateRecoveryKey" | "createRecoveryEnvelope" | "deriveRecoveryAuthKey" | "deriveAuthKey"
  >;
  keys: { accountKey: CryptoKey; blindIndexKey: CryptoKey };
  email: string;
  currentPassword: string;
}): Promise<string> {
  const { secret, recoveryKey } = await input.e2ee.generateRecoveryKey();
  const [envelope, recoveryAuthKey, currentPassword] = await Promise.all([
    input.e2ee.createRecoveryEnvelope(input.keys.accountKey, input.keys.blindIndexKey, secret),
    input.e2ee.deriveRecoveryAuthKey(secret),
    input.e2ee.deriveAuthKey(input.currentPassword, input.email),
  ]);
  await input.api.putRecoveryKit({
    currentPassword,
    recoveryAuthKey,
    wrappedAccountKey: envelope.wrappedAccountKey,
    wrappedSearchKey: envelope.wrappedSearchKey,
    keyVersion: envelope.keyVersion,
  });
  return recoveryKey;
}

/** Opens the account keys with the recovery key and stores them under the new password; the caller then signs in as usual. */
export async function recoverAccount(input: {
  post: RecoveryPost;
  e2ee: Pick<
    E2eeModule,
    | "parseRecoveryKey"
    | "deriveRecoveryAuthKey"
    | "unwrapRecoveryEnvelope"
    | "createPasswordEnvelope"
  >;
  email: string;
  recoveryKey: string;
  newPassword: string;
  removePasskeys: boolean;
}): Promise<void> {
  const secret = await input.e2ee.parseRecoveryKey(input.recoveryKey);
  if (!secret) {
    throw new Error(RECOVERY_KEY_TYPO_MESSAGE);
  }
  const email = input.email.trim();
  const recoveryAuthKey = await input.e2ee.deriveRecoveryAuthKey(secret);
  const envelope = recoveryEnvelopeSchema.parse(
    await input.post("/recovery/start", { email, recoveryAuthKey }),
  );
  const keys = await input.e2ee
    .unwrapRecoveryEnvelope(secret, envelope)
    .catch(() => {
      throw new Error(RECOVERY_UNWRAP_MESSAGE);
    });
  const passwordEnvelope = await input.e2ee.createPasswordEnvelope(
    keys.accountKey,
    keys.blindIndexKey,
    input.newPassword,
  );
  await input.post("/recovery/complete", {
    email,
    recoveryAuthKey,
    newPassword: input.newPassword,
    passwordEnvelope,
    removePasskeys: input.removePasskeys,
  });
}
