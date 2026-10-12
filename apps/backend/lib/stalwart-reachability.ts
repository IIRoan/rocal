import { withStalwartGate } from "./stalwart-gate";

const PROBE_TIMEOUT_MS = 5_000;

type ReachabilityFetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** One unauthenticated session GET: only 200/401 prove Stalwart answered, since the gate and missing routes answer 404. */
export async function probeStalwartReachable(input: {
  baseUrl: string;
  fetcher?: ReachabilityFetcher;
  timeoutMs?: number;
}): Promise<{ ok: true } | { ok: false; status: number }> {
  const fetcher = withStalwartGate(input.fetcher ?? fetch);

  try {
    const response = await fetcher(
      `${input.baseUrl.replace(/\/+$/, "")}/jmap/session`,
      {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(input.timeoutMs ?? PROBE_TIMEOUT_MS),
      },
    );
    await response.body?.cancel();

    return response.ok || response.status === 401
      ? { ok: true }
      : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
