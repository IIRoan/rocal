import * as openpgp from "openpgp";
import { createE2eeModule, parseEncryptedJsonPayload } from "@workspace/e2ee";
import {
  MailTrustApiService,
  MailTrustClient,
  createMailTrustAnchor,
  resolveMailTrustRecipient,
  reviewMailTrustSender,
} from "@workspace/calendar-client";
import {
  collectOwnMailAddresses,
  createMailTrustReviewBridge,
  inspectMailPublicKey,
  MAIL_KEY_CONTINUITY_ENABLED,
  MailTrustBlockedError,
  mailTrustQueryKeys,
  normalizeMailTrustAddress,
  resolveMailSenderKeySource,
} from "@workspace/calendar-core";
import { httpClient } from "@workspace/native-core/lib/api";
import { getActiveE2eeSession } from "@workspace/native-core/lib/e2ee-session";
import { createNativeCryptoProvider } from "@workspace/native-core/lib/native-crypto-provider";
import {
  captureSessionDataScope,
  isSessionDataScopeCurrent,
  subscribeSessionDataScope,
} from "@workspace/native-core/lib/session-data-lifecycle";
import { queryClient } from "@workspace/native-core/providers/QueryProvider";
import { ensureVaultLoaded, isMailVaultCurrent } from "./mail-crypto";
import { getRecipientKey } from "./mail-api";
import {
  readMailTrustAnchor,
  writeMailTrustAnchor,
} from "./mail-trust-anchor-storage";
import type { MailRuntime } from "./mail-runtime";

export const mailTrustReviewBridge = createMailTrustReviewBridge();
let active: {
  session: NonNullable<ReturnType<typeof getActiveE2eeSession>>;
  vault: Awaited<ReturnType<typeof ensureVaultLoaded>>;
  client: MailTrustClient;
} | null = null;
if (MAIL_KEY_CONTINUITY_ENABLED)
  subscribeSessionDataScope(() => {
    active = null;
    mailTrustReviewBridge.cancel();
  });

async function clientFor(runtime: MailRuntime): Promise<MailTrustClient> {
  const session = getActiveE2eeSession();
  const scope = captureSessionDataScope(session?.userId);
  if (!session || !isSessionDataScopeCurrent(scope))
    throw new MailTrustBlockedError({ kind: "unavailable" });
  const vault = await ensureVaultLoaded(runtime);
  if (active?.session === session && active.vault === vault)
    return active.client;
  const isCurrent = () =>
    getActiveE2eeSession() === session &&
    isSessionDataScopeCurrent(scope) &&
    isMailVaultCurrent(vault);
  if (!isCurrent() || vault.vault.userId !== session.userId)
    throw new Error("Mail encryption session changed.");
  const api = new MailTrustApiService(httpClient, isCurrent);
  const provider = createNativeCryptoProvider();
  if (!provider) throw new MailTrustBlockedError({ kind: "unavailable" });
  const crypto = createE2eeModule(provider);
  const cipher = {
    encryptJson: async (value: unknown, aad: string) =>
      JSON.stringify(
        await crypto.encryptJsonPayload(session.accountKey, value, aad),
      ),
    decryptJson: async (encrypted: string, aad: string) => {
      const payload = parseEncryptedJsonPayload(encrypted);
      return payload
        ? crypto
            .decryptJsonPayload<unknown>(session.accountKey, payload, aad)
            .catch(() => null)
        : null;
    },
  };
  const key = mailTrustQueryKeys.account(session.userId);
  const anchor = createMailTrustAnchor({
    accountId: session.userId,
    ...cipher,
    readCiphertext: () => readMailTrustAnchor(session.userId),
    writeCiphertext: (value) => writeMailTrustAnchor(session.userId, value),
  });
  const client = new MailTrustClient({
    accountId: session.userId,
    isCurrent,
    ...cipher,
    read: (fresh) =>
      queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => api.get(),
        staleTime: fresh ? 0 : 60_000,
        retry: false,
      }),
    write: async (body) => {
      const response = await api.put(body);
      if (!isCurrent()) throw new Error("Mail encryption session changed.");
      queryClient.setQueryData(key, response);
      return response;
    },
    readAnchor: anchor.read,
    markEstablished: anchor.mark,
    inspectKey: (armoredKey, knownArmoredKey, purpose) =>
      inspectMailPublicKey(
        { armoredKey, knownArmoredKey, forEncryption: purpose === "send" },
        openpgp,
      ),
  });
  active = { session, vault, client };
  return client;
}

export async function resolveTrustedMailRecipient(
  runtime: MailRuntime,
  emailInput: string,
  isCurrent: () => boolean,
): Promise<string> {
  const email = normalizeMailTrustAddress(emailInput);
  if (!isCurrent()) throw new Error("Mail encryption session changed.");
  const vault = await ensureVaultLoaded(runtime);
  if (!isCurrent()) throw new Error("Mail encryption session changed.");
  if (
    resolveMailSenderKeySource({
      senderEmail: email,
      ownAddresses: collectOwnMailAddresses([
        vault.vault.email,
        runtime.session.username,
        ...runtime.identities.map((identity) => identity.email),
      ]),
      internalDomain: null,
    }) === "self"
  )
    return vault.vault.publicKeyArmored;
  const lookup = async () => (await getRecipientKey(email)).publicKeyArmored;
  if (!MAIL_KEY_CONTINUITY_ENABLED) return lookup();
  return resolveMailTrustRecipient({
    client: await clientFor(runtime),
    email,
    lookup,
    review: mailTrustReviewBridge.request,
    isCurrent,
  });
}

export async function lookupPinnedMailSender(
  runtime: MailRuntime,
  email: string,
): Promise<string | undefined> {
  return (
    await (
      await clientFor(runtime)
    ).verifySender(
      email,
      async () => (await getRecipientKey(email)).publicKeyArmored,
    )
  ).senderPublicKeyArmored;
}

export async function inspectPinnedMailSender(
  runtime: MailRuntime,
  email: string,
  lookup: () => Promise<string> = async () =>
    (await getRecipientKey(email)).publicKeyArmored,
) {
  return (await clientFor(runtime)).verifySender(email, lookup);
}

export async function reviewMailSenderKey(
  runtime: MailRuntime,
  email: string,
): Promise<void> {
  if (!MAIL_KEY_CONTINUITY_ENABLED) return;
  const scope = captureSessionDataScope();
  const client = await clientFor(runtime);
  return reviewMailTrustSender({
    client,
    email,
    lookup: async () => (await getRecipientKey(email)).publicKeyArmored,
    review: mailTrustReviewBridge.request,
    isCurrent: () => isSessionDataScopeCurrent(scope),
  });
}
