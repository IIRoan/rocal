/**
 * Mail runtime orchestration: turns the backend mail config + session cookie
 * into a ready-to-use authenticated JMAP client and discovered session.
 *
 * The crypto-bound vault (used by the web app to decrypt PGP bodies and sign
 * outgoing mail) is intentionally not loaded here — Hermes/React Native cannot
 * run the required WebCrypto/WASM Argon2 primitives. Listing mailboxes and
 * messages and reading plaintext / encrypted-at-rest bodies needs no crypto.
 */
import {
  StalwartJmapClient,
  getPrimaryMailAccountId,
} from "./jmap-client";
import {
  createServerMailTokenManager,
  getMailConfig,
  mailFetch,
} from "./mail-api";
import { sortMailboxes } from "./mail-helpers";
import type {
  JmapIdentity,
  JmapMailbox,
  JmapSession,
  MailDemoConfig,
} from "./types";

export type MailRuntime = {
  config: MailDemoConfig;
  client: StalwartJmapClient;
  session: JmapSession;
  accountId: string;
  mailboxes: JmapMailbox[];
  identities: JmapIdentity[];
  /** Server-side encryption-at-rest (not E2EE); bodies still arrive readable. */
  encryptedAtRest: boolean;
};

/**
 * Builds an authenticated JMAP runtime for the signed-in user. Requires that
 * the user has already provisioned a mailbox on the web client.
 */
export async function buildMailRuntime(): Promise<MailRuntime> {
  const config = await getMailConfig();

  const tokenManager = createServerMailTokenManager(
    config.oauth.mailTokenEndpoint,
  );
  const client = new StalwartJmapClient({
    baseUrl: config.discoveryBaseUrl,
    getAccessToken: () => tokenManager.getAccessToken(),
    fetcher: mailFetch,
  });

  const session = await client.discoverSession();
  const accountId = getPrimaryMailAccountId(session);
  if (!accountId) {
    throw new Error("JMAP session did not include a primary mail account.");
  }

  const [accountSettings, mailboxes, identities] = await Promise.all([
    client.getAccountSettings(session).catch(() => ({}) as Record<
      string,
      unknown
    >),
    client.getMailboxes(session),
    client.getIdentities(session).catch(() => [] as JmapIdentity[]),
  ]);

  const encryptedAtRest =
    (accountSettings.encryptionAtRest as { "@type"?: string } | undefined)?.[
      "@type"
    ] === "Aes256";

  return {
    config,
    client,
    session,
    accountId,
    mailboxes: sortMailboxes(mailboxes),
    identities,
    encryptedAtRest,
  };
}
