import { format } from "date-fns";
import type { Passkey } from "@better-auth/passkey/client";

interface PasskeyFetchError {
  message?: string;
}

interface PasskeyFetchOptions {
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  throw: false;
}

interface PasskeyFetchResult<T> {
  data: T | null;
  error: PasskeyFetchError | null;
}

export interface PasskeyRouteClient {
  $fetch: <T>(
    path: string,
    options: PasskeyFetchOptions,
  ) => Promise<PasskeyFetchResult<T>>;
}

interface StoredPasskeySummary {
  deviceType: Passkey["deviceType"];
  backedUp: boolean;
  createdAt: Date | string;
}

export function getDefaultPasskeyName(
  platformOS = "native",
): string {
  switch (platformOS) {
    case "ios":
      return "This Apple device";
    case "android":
      return "This Android device";
    default:
      return "This device";
  }
}

export function formatStoredPasskeyDescription(
  passkey: StoredPasskeySummary,
): string {
  const deviceLabel =
    passkey.deviceType === "multiDevice"
      ? "Synced across devices"
      : "Saved to this device";
  const backupLabel = passkey.backedUp ? "Backed up" : "Local only";
  const createdAt = format(new Date(passkey.createdAt), "MMM d, yyyy");

  return `${deviceLabel} · ${backupLabel} · Added ${createdAt}`;
}

export async function deleteStoredPasskey(
  client: PasskeyRouteClient,
  id: string,
): Promise<void> {
  await fetchPasskeyRoute(
    client,
    "/passkey/delete-passkey",
    {
      method: "POST",
      body: { id },
      throw: false,
    },
    "Unable to delete passkey.",
  );
}

async function fetchPasskeyRoute<T>(
  client: PasskeyRouteClient,
  path: string,
  options: PasskeyFetchOptions,
  fallbackMessage: string,
): Promise<T> {
  const result = await client.$fetch<T>(path, options);

  if (!result.data) {
    throw new Error(result.error?.message ?? fallbackMessage);
  }

  return result.data;
}
