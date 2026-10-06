import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { oneTimeTokenClient } from "better-auth/client/plugins";
import { getApiBaseUrl } from "./api-url";

const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  basePath: "/api/auth",
  plugins: [passkeyClient(), oneTimeTokenClient()],
});

export { authClient };

export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const signUp = authClient.signUp;
export const useSession = authClient.useSession;
