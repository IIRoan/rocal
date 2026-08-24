export const PASSKEY_BRIDGE_FRESHEN_PATH = "/passkey-bridge/freshen-session";

type SessionRecord = {
  token?: unknown;
};

type BridgeUser = {
  id: string;
};

function isSessionRecord(value: unknown): value is SessionRecord & object {
  return Boolean(value && typeof value === "object");
}

function isUser(value: unknown): value is BridgeUser {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    (value as { id: string }).id,
  );
}

export function parsePasskeyBridgeSession(value: unknown): {
  session: SessionRecord & object;
  user: BridgeUser;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const current = value as {
    session?: unknown;
    user?: unknown;
  };
  if (!isSessionRecord(current.session) || !isUser(current.user)) {
    return null;
  }

  return {
    session: current.session,
    user: current.user,
  };
}

export function isFreshSessionRecord(
  value: unknown,
): value is SessionRecord & { token: string } {
  return isSessionRecord(value) && typeof value.token === "string" && Boolean(value.token);
}
