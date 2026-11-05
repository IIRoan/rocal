import { createAuthClient } from "better-auth/react";
import { expoClient, storageAdapter } from "@better-auth/expo/client";
import { passkeyClient } from "@better-auth/passkey/client";
import {
  createAuthKeyFetch,
  type PasswordEnvelopeRequest,
} from "@workspace/calendar-client";
import { createE2eeModule } from "@workspace/e2ee";
import { API_BASE_URL, APP_SCHEME, AUTH_STORAGE_PREFIX } from "./constants";
import { createNativeCryptoProvider } from "./native-crypto-provider";
import { authSecureStore } from "./secure-store-chunked";

/** Resolved per call, so a build without native crypto fails the sign-in instead of the app start. */
async function deriveAuthKey(password: string, email: string): Promise<string> {
  const crypto = createNativeCryptoProvider();
  if (!crypto) {
    throw new Error("This build can't protect your password. Update Solace and try again.");
  }
  return createE2eeModule(crypto).deriveAuthKey(password, email);
}

/** Native Better Auth client; expo/client gives secure cookie storage and deep links, passkeyClient keeps Expo web working. */
const baseAuthClient = createAuthClient({
  baseURL: API_BASE_URL,
  basePath: "/api/auth",
  fetchOptions: { customFetchImpl: createAuthKeyFetch(deriveAuthKey) },
  plugins: [
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: AUTH_STORAGE_PREFIX,
      // Raw store — Better Auth's expo adapter already chunks oversized values.
      storage: authSecureStore,
    }),
    passkeyClient(),
  ],
});

/** Clear both copies through Better Auth's shared storage queue so late writes cannot revive a signed-out session. */
export async function clearAuthSessionCache(): Promise<void> {
  const session = baseAuthClient.$store.atoms.session;
  if (session) session.set({ ...session.get(), data: null, error: null, isPending: false });
  const storage = storageAdapter(authSecureStore);
  await Promise.all([
    storage.setItemAsync(`${AUTH_STORAGE_PREFIX}_cookie`, "{}"),
    storage.setItemAsync(`${AUTH_STORAGE_PREFIX}_session_data`, "{}"),
  ]);
}

// Better Auth types the body without `email`, which salts both auth keys, or the envelope the API stores with the new password.
export const authClient = baseAuthClient as typeof baseAuthClient & {
  changePassword: (opts: {
    currentPassword: string;
    newPassword: string;
    email: string;
    passwordEnvelope: PasswordEnvelopeRequest;
    revokeOtherSessions?: boolean;
  }) => Promise<{ data: unknown; error: { message?: string } | null }>;
};
