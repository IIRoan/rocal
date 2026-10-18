type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const STALWART_GATE_HEADER = "X-Solace-Gate";

/** Adds the backend-gate key (apps/stalwart/backend-gate.cfg) only to https calls on the client's configured Stalwart origin; env is read per call like mail-bridge-auth.ts. */
export function withStalwartGate(fetcher: Fetcher, stalwartBaseUrl: string): Fetcher {
  const gateOrigin = originOf(stalwartBaseUrl);
  return (input, init) => {
    const key = process.env.STALWART_GATE_KEY?.trim();
    if (!key || !gateOrigin?.startsWith("https://") || originOf(input) !== gateOrigin) {
      return fetcher(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set(STALWART_GATE_HEADER, key);
    return fetcher(input, { ...init, headers });
  };
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
