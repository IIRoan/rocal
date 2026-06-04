/**
 * Bridge to the secure web mail client for operations that require browser-only
 * E2EE crypto (decrypting PGP message bodies and composing encrypted mail),
 * which Hermes/React Native cannot perform on-device.
 */
import * as WebBrowser from "expo-web-browser";
import { APP_BASE_URL } from "../constants";

export function isWebMailAvailable(): boolean {
  return Boolean(APP_BASE_URL);
}

function buildMailUrl(path: string): string | null {
  if (!APP_BASE_URL) return null;
  const base = APP_BASE_URL.replace(/\/+$/, "");
  return `${base}${path}`;
}

/** Opens the web mailbox (optionally focused on a specific message). */
export async function openWebMail(messageId?: string): Promise<void> {
  const url = buildMailUrl(
    messageId ? `/mail?message=${encodeURIComponent(messageId)}` : "/mail",
  );
  if (!url) return;
  await WebBrowser.openBrowserAsync(url);
}

/** Opens the web compose experience. */
export async function openWebMailCompose(): Promise<void> {
  const url = buildMailUrl("/mail?compose=1");
  if (!url) return;
  await WebBrowser.openBrowserAsync(url);
}
