import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { oneTimeTokenClient } from "better-auth/client/plugins";
import { createAuthKeyFetch } from "@workspace/calendar-client";
import { getApiBaseUrl } from "./api-url";
import { deriveAuthKey } from "./e2ee-crypto";
import { AUTH_SESSION_REFRESH_INTERVAL_SECONDS } from "@workspace/calendar-core";
import type { UpsertE2eePasswordRequest } from "./types/calendar";

const baseAuthClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  basePath: "/api/auth",
  sessionOptions: { refetchInterval: AUTH_SESSION_REFRESH_INTERVAL_SECONDS },
  fetchOptions: { customFetchImpl: createAuthKeyFetch(deriveAuthKey) },
  plugins: [passkeyClient(), oneTimeTokenClient()],
});

// Better Auth clients are dynamic path proxies, so undeclared methods still resolve at runtime; setPassword is used by the command palette until it moves to changePassword.
export const authClient = baseAuthClient as typeof baseAuthClient & {
  setPassword: (opts: { newPassword: string }) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
  /** The email salts both auth keys, so the API can refuse a key derived for another address. */
  changePassword: (opts: {
    currentPassword: string;
    newPassword: string;
    email: string;
    revokeOtherSessions?: boolean;
    /** Stored with the new password in one transaction, so the two never diverge. */
    passwordEnvelope?: UpsertE2eePasswordRequest;
  }) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export const signIn = baseAuthClient.signIn;
export const signOut = baseAuthClient.signOut;
export const signUp = baseAuthClient.signUp;
export const useSession = baseAuthClient.useSession;
