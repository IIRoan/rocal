import {
  capIdentitiesForPicker,
  resolveMailServerPolicy,
  type MailServerPolicy,
} from "@workspace/calendar-core";
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
import type { JmapIdentity, JmapMailbox } from "./types";

export type MailRuntime = {
  config: Awaited<ReturnType<typeof getMailConfig>>;
  client: StalwartJmapClient;
  session: import("./types").JmapSession;
  accountId: string;
  mailboxes: JmapMailbox[];
  identities: JmapIdentity[];
  pickerIdentities: JmapIdentity[];
  /** Server-side encryption-at-rest (not E2EE); bodies still arrive readable. */
  encryptedAtRest: boolean;
  mailServerPolicy: MailServerPolicy;
};

export async function refreshMailRuntimePolicy(
  runtime: MailRuntime,
): Promise<MailRuntime> {
  const mailServerPolicy =
    (await runtime.client.syncMailServerPolicy(runtime.session, {
      force: true,
    })) ?? runtime.mailServerPolicy;

  return {
    ...runtime,
    pickerIdentities: capIdentitiesForPicker(
      runtime.identities,
      mailServerPolicy,
    ),
    mailServerPolicy,
  };
}

/**
 * Builds an authenticated JMAP runtime for the signed-in user after mailbox
 * provisioning has completed on either native or web.
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

  const [accountSettings, stalwartPolicy, mailboxes, identities] =
    await Promise.all([
      client.getAccountSettings(session).catch(() => ({}) as Record<
        string,
        unknown
      >),
      client.getStalwartPolicySingletons(session),
      client.getMailboxes(session),
      client.getIdentities(session).catch(() => [] as JmapIdentity[]),
    ]);

  const encryptedAtRest =
    (accountSettings.encryptionAtRest as { "@type"?: string } | undefined)?.[
      "@type"
    ] === "Aes256";

  const mailServerPolicy = resolveMailServerPolicy({
    session,
    emailSettings: stalwartPolicy.emailSettings,
    jmapSettings: stalwartPolicy.jmapSettings,
    configPolicy: config.serverLimits ?? null,
  });
  client.setMailServerPolicy(mailServerPolicy, config.serverLimits ?? null);

  return {
    config,
    client,
    session,
    accountId,
    mailboxes: sortMailboxes(mailboxes),
    identities,
    pickerIdentities: capIdentitiesForPicker(identities, mailServerPolicy),
    encryptedAtRest,
    mailServerPolicy,
  };
}
