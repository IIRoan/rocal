const ONE_CLICK_TIMEOUT_MS = 15_000;

/** RFC 8058 one-click unsubscribe; the URL carries list tokens, so it is never logged. */
export async function postOneClickUnsubscribe(url: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ONE_CLICK_TIMEOUT_MS);
  try {
    // repo-rules-allow client-api-boundary: RFC 8058 one-click unsubscribe POST to the list sender, from the device
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("The sender didn't accept the unsubscribe request.");
  } finally {
    clearTimeout(timer);
  }
}
