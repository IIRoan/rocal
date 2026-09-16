import { env } from "./env";
import type {
  StalwartJmapEnvelope,
  StalwartJmapMethodCall,
} from "./stalwart-admin";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type MailAccessTokenProvider = {
  getAccessTokenForUser(input: {
    userId: string;
    email: string;
  }): Promise<{ access_token: string }>;
  invalidateAccessTokenForUser(userId: string): void;
};

export type StalwartUserJmapCall = {
  userId: string;
  email: string;
  using: string[];
  methodCalls: StalwartJmapMethodCall[];
};

export interface StalwartUserJmapClientLike {
  callJmap(input: StalwartUserJmapCall): Promise<StalwartJmapEnvelope>;
}

/** Calls JMAP as the mailbox owner so server-side mail work needs no admin rights. */
export class StalwartUserJmapClient implements StalwartUserJmapClientLike {
  constructor(input: {
    baseUrl: string;
    tokens: MailAccessTokenProvider;
    fetcher?: Fetcher;
  }) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, "");
    this.tokens = input.tokens;
    this.fetcher = input.fetcher ?? fetch;
  }

  private readonly baseUrl: string;
  private readonly tokens: MailAccessTokenProvider;
  private readonly fetcher: Fetcher;

  async callJmap(input: StalwartUserJmapCall): Promise<StalwartJmapEnvelope> {
    const response = await this.post(input);

    if (response.status === 401) {
      this.tokens.invalidateAccessTokenForUser(input.userId);
      return this.readEnvelope(await this.post(input));
    }

    return this.readEnvelope(response);
  }

  private async post(input: StalwartUserJmapCall): Promise<Response> {
    const token = await this.tokens.getAccessTokenForUser({
      userId: input.userId,
      email: input.email,
    });

    return this.fetcher(`${this.baseUrl}/jmap/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        using: input.using,
        methodCalls: input.methodCalls,
      }),
    });
  }

  private async readEnvelope(
    response: Response,
  ): Promise<StalwartJmapEnvelope> {
    if (!response.ok) {
      throw new Error(
        `Stalwart JMAP request failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as StalwartJmapEnvelope;
  }
}

export function createStalwartUserJmapClient(input: {
  tokens: MailAccessTokenProvider;
  baseUrl?: string;
  fetcher?: Fetcher;
}): StalwartUserJmapClient {
  return new StalwartUserJmapClient({
    baseUrl: input.baseUrl || env.stalwartBaseUrl,
    tokens: input.tokens,
    fetcher: input.fetcher,
  });
}
