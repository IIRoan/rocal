import { authClient } from "@/lib/auth-client";
import {
  buildNativePasskeyCallbackURL,
  getNativePasskeyBridgeError,
  getPasskeyBridgeFreshenRequest,
  getWebAuthnSupportError,
  isPasskeyAuthCancelled,
  type NativePasskeyBridgeMode,
} from "@/lib/native-passkey-bridge";

export type NativePasskeyBridgeActionInput = {
  mode: NativePasskeyBridgeMode;
  callbackURL: string;
  bridgeToken: string | null;
  passkeyName: string;
  cancelMessage: string;
  failureMessage: string;
};

export type NativePasskeyBridgeActionResult =
  | { status: "redirect"; url: string }
  | { status: "cancelled"; message: string }
  | { status: "error"; message: string };

type AuthClientFetchResult = {
  data: { token?: string } | null;
  error: { message?: string } | null;
};

function resolvePasskeyClientError(
  error: unknown,
  input: Pick<NativePasskeyBridgeActionInput, "cancelMessage" | "failureMessage">,
): NativePasskeyBridgeActionResult {
  if (isPasskeyAuthCancelled(error)) {
    return { status: "cancelled", message: input.cancelMessage };
  }

  return {
    status: "error",
    message: getNativePasskeyBridgeError(error, input.failureMessage),
  };
}

function getBrowserWebAuthnSupportError() {
  return getWebAuthnSupportError({
    isSecureContext: window.isSecureContext,
    origin: window.location.origin,
    PublicKeyCredential: window.PublicKeyCredential,
  });
}

export async function runNativePasskeyBridgeAction(
  input: NativePasskeyBridgeActionInput,
): Promise<NativePasskeyBridgeActionResult> {
  const webAuthnSupportError = getBrowserWebAuthnSupportError();
  if (webAuthnSupportError) {
    return { status: "error", message: webAuthnSupportError };
  }

  try {
    if (input.mode === "register") {
      if (!input.bridgeToken) {
        return {
          status: "error",
          message:
            "This passkey setup request is missing a session handoff token.",
        };
      }

      const bridgeSession = (await authClient.$fetch("/one-time-token/verify", {
        method: "POST",
        body: { token: input.bridgeToken },
        throw: false,
      })) as AuthClientFetchResult;

      if (!bridgeSession.data) {
        return {
          status: "error",
          message:
            bridgeSession.error?.message ?? "Unable to start passkey setup.",
        };
      }

      const freshenRequest = getPasskeyBridgeFreshenRequest("register");
      if (!freshenRequest) {
        return {
          status: "error",
          message: "Unable to start passkey setup.",
        };
      }

      const freshenedSession = (await authClient.$fetch(freshenRequest.path, {
        method: freshenRequest.method,
        body: {},
        throw: false,
      })) as AuthClientFetchResult;

      if (!freshenedSession.data) {
        return {
          status: "error",
          message:
            freshenedSession.error?.message ??
            "Unable to start passkey setup.",
        };
      }

      const registration = await authClient.passkey.addPasskey({
        name: input.passkeyName,
        authenticatorAttachment: "platform",
      });

      if (registration.error) {
        return resolvePasskeyClientError(registration.error, input);
      }

      return {
        status: "redirect",
        url: buildNativePasskeyCallbackURL(input.callbackURL, {
          passkeyRegistered: true,
        }),
      };
    }

    if (!input.bridgeToken) {
      return {
        status: "error",
        message:
          "Sign in with email and password in the app first, then verify your passkey.",
      };
    }

    const bridgeSession = (await authClient.$fetch("/one-time-token/verify", {
      method: "POST",
      body: { token: input.bridgeToken },
      throw: false,
    })) as AuthClientFetchResult;

    if (!bridgeSession.data) {
      return {
        status: "error",
        message:
          bridgeSession.error?.message ??
          "Unable to start passkey verification.",
      };
    }

    const signInResult = await authClient.signIn.passkey({
      autoFocus: true,
    });

    if (signInResult.error) {
      return resolvePasskeyClientError(signInResult.error, input);
    }

    const tokenResult = (await authClient.$fetch("/one-time-token/generate", {
      method: "GET",
      throw: false,
    })) as AuthClientFetchResult;

    if (!tokenResult.data?.token) {
      return {
        status: "error",
        message:
          tokenResult.error?.message ??
          "Unable to finish passkey verification.",
      };
    }

    return {
      status: "redirect",
      url: buildNativePasskeyCallbackURL(input.callbackURL, {
        oneTimeToken: tokenResult.data.token,
        passkeyVerified: true,
      }),
    };
  } catch (caughtError) {
    return resolvePasskeyClientError(caughtError, input);
  }
}
