import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { API_BASE_URL, APP_SCHEME, AUTH_STORAGE_PREFIX } from "./constants";
import { authSecureStore } from "./secure-store-chunked";

/** Native Better Auth client; expo/client gives secure cookie storage and deep links, passkeyClient keeps Expo web working. */
export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  basePath: "/api/auth",
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
