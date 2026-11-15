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
      redirect: "manual",
      signal: controller.signal,
    });
    // A redirect target never passed the public-host check, so it is not followed; the POST already reached the checked host.
    const redirected = response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400);
    if (!response.ok && !redirected) throw new Error("The sender didn't accept the unsubscribe request.");
  } finally {
    clearTimeout(timer);
  }
}
