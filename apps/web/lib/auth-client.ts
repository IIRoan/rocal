import { createAuthClient } from "better-auth/react";

// Define a specific type for the auth client
const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  basePath: "/api/auth",
}) as any;

// Export the full client
export { authClient };

// Export convenience methods
export const signIn = authClient.signIn;
export const signOut = authClient.signOut;
export const signUp = authClient.signUp;
export const useSession = authClient.useSession;
