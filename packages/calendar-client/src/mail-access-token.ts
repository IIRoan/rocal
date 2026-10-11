export type MailAccessToken = {
  accessToken: string;
  expiresAtMs: number | null;
};

export function createMailAccessTokenManager(
  loadToken: () => Promise<MailAccessToken>,
) {
  let token: MailAccessToken | null = null;
  let inflight: Promise<string> | null = null;
  let generation = 0;

  async function mint() {
    const startedGeneration = generation;
    const fresh = await loadToken();
    if (startedGeneration !== generation)
      throw new Error("Mail authorization changed while requesting a token.");
    token = fresh;
    return fresh.accessToken;
  }

  return {
    async getAccessToken(): Promise<string> {
      if (
        token &&
        (token.expiresAtMs === null || Date.now() + 30_000 < token.expiresAtMs)
      )
        return token.accessToken;
      if (inflight) return inflight;
      const request = mint();
      inflight = request;
      try {
        return await request;
      } finally {
        if (inflight === request) inflight = null;
      }
    },
    clear() {
      generation += 1;
      token = null;
      inflight = null;
    },
  };
}
