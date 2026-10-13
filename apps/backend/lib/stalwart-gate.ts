type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const STALWART_GATE_HEADER = "X-Solace-Gate";

/** Adds the Railway backend-gate key (apps/stalwart/backend-gate.cfg) to https Stalwart calls; env is read per call like mail-bridge-auth.ts. */
export function withStalwartGate(fetcher: Fetcher): Fetcher {
  return (input, init) => {
    const key = process.env.STALWART_GATE_KEY?.trim();
    if (!key || !input.startsWith("https://")) return fetcher(input, init);
    const headers = new Headers(init?.headers);
    headers.set(STALWART_GATE_HEADER, key);
    return fetcher(input, { ...init, headers });
  };
}
