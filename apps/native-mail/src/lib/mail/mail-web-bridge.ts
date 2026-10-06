/** Bridge to the web mail client for browser-only E2EE crypto that Hermes cannot run on-device. */
import * as WebBrowser from "expo-web-browser";
import { APP_BASE_URL } from "@workspace/native-core/lib/constants";

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
