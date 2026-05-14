import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { oneTimeTokenClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { getApiBaseUrl } from "./api-url";

// Define a specific type for the auth client
const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  basePath: "/api/auth",
  plugins: [passkeyClient(), oneTimeTokenClient(), oauthProviderClient()],
}) as any;

// Export the full client
export { authClient };

// Export convenience methods
export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const signUp = authClient.signUp;
export const useSession = authClient.useSession;
