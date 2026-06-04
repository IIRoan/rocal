import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { API_BASE_URL, APP_SCHEME, AUTH_STORAGE_PREFIX } from "./constants";
import { chunkedSecureStore } from "./secure-store-chunked";

/**
 * Better Auth client configured for the native app.
 *
 * Uses `@better-auth/expo/client` for secure cookie storage via
 * `expo-secure-store` and deep-link callback handling, while the passkey
 * plugin keeps the web passkey hooks available for Expo web.
 */
export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  basePath: "/api/auth",
  plugins: [
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: AUTH_STORAGE_PREFIX,
      storage: chunkedSecureStore,
    }),
    passkeyClient(),
  ],
});
