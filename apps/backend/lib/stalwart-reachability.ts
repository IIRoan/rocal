const PROBE_TIMEOUT_MS = 5_000;

type ReachabilityFetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** One unauthenticated GET: any non-5xx answer (normally 401) proves the API can reach Stalwart. */
export async function probeStalwartReachable(input: {
  baseUrl: string;
  fetcher?: ReachabilityFetcher;
  timeoutMs?: number;
}): Promise<{ ok: true } | { ok: false; status: number }> {
  const fetcher = input.fetcher ?? fetch;

  try {
    const response = await fetcher(
      `${input.baseUrl.replace(/\/+$/, "")}/.well-known/jmap`,
      {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(input.timeoutMs ?? PROBE_TIMEOUT_MS),
      },
    );
    await response.body?.cancel();

    return response.status < 500 ? { ok: true } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
