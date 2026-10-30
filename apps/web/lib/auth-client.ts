import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { oneTimeTokenClient } from "better-auth/client/plugins";
import {
  createAuthKeyFetch,
  type PasswordEnvelopeRequest,
} from "@workspace/calendar-client";
import { getApiBaseUrl } from "./api-url";
import { deriveAuthKey } from "./e2ee-crypto";
import { AUTH_SESSION_REFRESH_INTERVAL_SECONDS } from "@workspace/calendar-core";

const baseAuthClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  basePath: "/api/auth",
  sessionOptions: { refetchInterval: AUTH_SESSION_REFRESH_INTERVAL_SECONDS },
  fetchOptions: { customFetchImpl: createAuthKeyFetch(deriveAuthKey) },
  plugins: [passkeyClient(), oneTimeTokenClient()],
});

export const authClient = baseAuthClient as typeof baseAuthClient & {
  /** The email salts both auth keys, so the API can refuse a key derived for another address. */
  changePassword: (opts: {
    currentPassword: string;
    newPassword: string;
    email: string;
    revokeOtherSessions?: boolean;
    /** Stored with the new password in one transaction, so the two never diverge. */
    passwordEnvelope: PasswordEnvelopeRequest;
  }) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export const signIn = baseAuthClient.signIn;
export const signOut = baseAuthClient.signOut;
export const signUp = baseAuthClient.signUp;
export const useSession = baseAuthClient.useSession;
