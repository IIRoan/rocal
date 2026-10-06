import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { oneTimeTokenClient } from "better-auth/client/plugins";
import { getApiBaseUrl } from "./api-url";

const baseAuthClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  basePath: "/api/auth",
  plugins: [passkeyClient(), oneTimeTokenClient()],
});

// Better Auth clients are dynamic path proxies, so undeclared methods still resolve at runtime; setPassword is used by the command palette until it moves to changePassword.
export const authClient = baseAuthClient as typeof baseAuthClient & {
  setPassword: (opts: { newPassword: string }) => Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export const signIn = baseAuthClient.signIn;
export const signOut = baseAuthClient.signOut;
export const signUp = baseAuthClient.signUp;
export const useSession = baseAuthClient.useSession;
