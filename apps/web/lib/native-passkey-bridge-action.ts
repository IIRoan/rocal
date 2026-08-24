import { authClient } from "@/lib/auth-client";
import {
  buildNativePasskeyCallbackURL,
  getNativePasskeyBridgeError,
  getPasskeyBridgeFreshenRequest,
  getWebAuthnSupportError,
  type NativePasskeyBridgeMode,
} from "@/lib/native-passkey-bridge";

export type NativePasskeyBridgeActionInput = {
  mode: NativePasskeyBridgeMode;
  callbackURL: string;
  bridgeToken: string | null;
  passkeyName: string;
  failureMessage: string;
};

export type NativePasskeyBridgeActionResult =
  | { status: "redirect"; url: string }
  | { status: "error"; message: string };

type AuthClientFetchResult = {
  data: { token?: string } | null;
  error: { message?: string } | null;
};

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
        return {
          status: "error",
          message:
            typeof registration.error.message === "string"
              ? registration.error.message
              : "Unable to finish passkey setup.",
        };
      }

      return {
        status: "redirect",
        url: buildNativePasskeyCallbackURL(input.callbackURL, {
          passkeyRegistered: true,
        }),
      };
    }

    const signInResult = await authClient.signIn.passkey({
      autoFocus: true,
    });

    if (signInResult.error) {
      return {
        status: "error",
        message:
          typeof signInResult.error.message === "string"
            ? signInResult.error.message
            : "Passkey sign-in failed. Please try again.",
      };
    }

    const tokenResult = (await authClient.$fetch("/one-time-token/generate", {
      method: "GET",
      throw: false,
    })) as AuthClientFetchResult;

    if (!tokenResult.data?.token) {
      return {
        status: "error",
        message:
          tokenResult.error?.message ?? "Unable to finish passkey sign-in.",
      };
    }

    return {
      status: "redirect",
      url: buildNativePasskeyCallbackURL(input.callbackURL, {
        oneTimeToken: tokenResult.data.token,
      }),
    };
  } catch (caughtError) {
    return {
      status: "error",
      message: getNativePasskeyBridgeError(caughtError, input.failureMessage),
    };
  }
}
