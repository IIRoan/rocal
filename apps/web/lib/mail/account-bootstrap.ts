import { authClient } from "../auth-client";
import { mailDemoApiService } from "./api-service";
import type { MailSignupResponse, UserKeyVault } from "./types";
import { createEncryptedMailVault } from "./vault-crypto";
import { putStoredMailVault } from "./vault-storage";
import { mailCryptoWorkerClient } from "./worker-client";

const SESSION_RETRY_DELAYS_MS = [0, 75, 150, 300, 500] as const;

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim() || "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isAuthError(error: unknown): boolean {
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode?: unknown }).statusCode
      : null;

  return statusCode === 401 || statusCode === 403;
}

async function waitForAuthenticatedUser(input: {
  userId?: string;
  email: string;
  displayName?: string | null;
}): Promise<{ userId: string; email: string; displayName: string | null }> {
  if (input.userId) {
    return {
      userId: input.userId,
      email: normalizeEmail(input.email),
      displayName: normalizeOptionalText(input.displayName),
    };
  }

  for (const delayMs of SESSION_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }

    const sessionResult = await authClient.getSession();
    const user = sessionResult?.data?.user;

    if (user?.id && user?.email) {
      return {
        userId: user.id,
        email: normalizeEmail(user.email),
        displayName: normalizeOptionalText(user.name) ?? normalizeOptionalText(input.displayName),
      };
    }
  }

  throw new Error(
    "Your account was created, but the authenticated session was not ready for mailbox setup.",
  );
}

export async function bootstrapMailboxForAccount(input: {
  email: string;
  password: string;
  displayName?: string | null;
  userId?: string;
}): Promise<MailSignupResponse> {
  const authenticatedUser = await waitForAuthenticatedUser(input);
  const createdAt = new Date().toISOString();
  const generated = await mailCryptoWorkerClient.generateKeyPair({
    name: authenticatedUser.displayName || authenticatedUser.email,
    email: authenticatedUser.email,
    privateKeyPassphrase: input.password,
  });
  const vault: UserKeyVault = {
    userId: authenticatedUser.userId,
    email: authenticatedUser.email,
    publicKeyArmored: generated.publicKeyArmored,
    publicKeyFingerprint: generated.fingerprint,
    encryptedPrivateKeyArmored: generated.privateKeyArmored,
    kdf: "argon2id",
    kdfParams: {
      saltB64: "",
      memoryKiB: 65536,
      iterations: 3,
      parallelism: 4,
    },
    vaultVersion: 1,
    createdAt,
  };
  const encryptedVault = await createEncryptedMailVault(vault, input.password);

  let provisionedMailbox: MailSignupResponse | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      provisionedMailbox = await mailDemoApiService.bootstrapAccountMailbox({
        password: input.password,
        publicKeyArmored: generated.publicKeyArmored,
        fingerprint: generated.fingerprint,
        algorithm: "openpgp",
        createdAt,
        vaultVersion: 1,
        encryptedVaultB64: encryptedVault.encryptedVaultB64,
        kdf: encryptedVault.kdf,
        kdfParams: encryptedVault.kdfParams,
      });
      break;
    } catch (error) {
      if (!isAuthError(error) || attempt === 2) {
        throw error;
      }

      await waitForAuthenticatedUser(input);
    }
  }

  if (!provisionedMailbox) {
    throw new Error("Could not provision the mailbox for this account.");
  }

  await putStoredMailVault({
    email: authenticatedUser.email,
    vaultVersion: 1,
    encryptedVaultB64: encryptedVault.encryptedVaultB64,
    kdf: encryptedVault.kdf,
    kdfParams: encryptedVault.kdfParams,
  });

  return provisionedMailbox;
}