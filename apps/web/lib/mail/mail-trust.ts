import type { QueryClient } from "@tanstack/react-query";
import {
  MailTrustApiService,
  MailTrustClient,
  createMailTrustAnchor,
  resolveMailTrustRecipient,
  reviewMailTrustSender,
} from "@workspace/calendar-client";
import {
  MAIL_KEY_CONTINUITY_ENABLED,
  MailTrustBlockedError,
  mailTrustQueryKeys,
  normalizeMailTrustAddress,
  resolveMailSenderKeySource,
} from "@workspace/calendar-core";
import { parseEncryptedJsonPayload } from "@workspace/e2ee";
import { httpClient } from "@/lib/api-clients";
import { decryptJsonPayload, encryptJsonPayload } from "@/lib/e2ee-crypto";
import {
  getActiveE2eeSession,
  subscribeActiveE2eeSession,
} from "@/lib/e2ee-session";
import { mailDemoApiService } from "./api-service";
import { mailCryptoWorkerClient } from "./worker-client";
import type { MailVaultVerificationContext } from "./worker-client-core";
import {
  readMailTrustAnchor,
  writeMailTrustAnchor,
} from "./mail-trust-anchor-storage";

export {
  mailTrustReviewBridge,
  cancelMailTrustReview,
} from "./mail-trust-lifecycle";
import {
  mailTrustReviewBridge,
  cancelMailTrustReview,
  captureMailTrustGeneration,
  subscribeMailTrustInvalidation,
} from "./mail-trust-lifecycle";
let queryClient: QueryClient | null = null;
let subscribedToSession = false;
let active: {
  session: NonNullable<ReturnType<typeof getActiveE2eeSession>>;
  context: MailVaultVerificationContext;
  client: MailTrustClient;
} | null = null;
subscribeMailTrustInvalidation(() => {
  active = null;
});

export function configureMailTrustQueryClient(client: QueryClient): () => void {
  queryClient = client;
  return () => {
    if (queryClient === client) {
      queryClient = null;
      cancelMailTrustReview();
    }
  };
}

function clientFor(context: MailVaultVerificationContext): MailTrustClient {
  const session = getActiveE2eeSession();
  const queries = queryClient;
  if (!session || context.ownerUserId !== session.userId)
    throw new Error("Mail encryption session changed.");
  if (!queries) throw new MailTrustBlockedError({ kind: "unavailable" });
  if (active?.session === session && active.context === context)
    return active.client;
  if (!subscribedToSession) {
    subscribeActiveE2eeSession(cancelMailTrustReview);
    subscribedToSession = true;
  }
  const isGenerationCurrent = captureMailTrustGeneration();
  const isCurrent = () =>
    isGenerationCurrent() &&
    getActiveE2eeSession() === session &&
    mailCryptoWorkerClient.isVerificationContextCurrent(context);
  const api = new MailTrustApiService(httpClient, isCurrent);
  const cipher = {
    encryptJson: async (value: unknown, aad: string) =>
      JSON.stringify(await encryptJsonPayload(session.accountKey, value, aad)),
    decryptJson: async (encrypted: string, aad: string) => {
      const payload = parseEncryptedJsonPayload(encrypted);
      return payload
        ? decryptJsonPayload<unknown>(session.accountKey, payload, aad).catch(
            () => null,
          )
        : null;
    },
  };
  const anchor = createMailTrustAnchor({
    accountId: session.userId,
    ...cipher,
    readCiphertext: () => readMailTrustAnchor(session.userId, isCurrent),
    writeCiphertext: (value) =>
      writeMailTrustAnchor(session.userId, value, isCurrent),
  });
  const key = mailTrustQueryKeys.account(session.userId);
  const client = new MailTrustClient({
    accountId: session.userId,
    isCurrent,
    ...cipher,
    read: (fresh) =>
      queries.fetchQuery({
        queryKey: key,
        queryFn: () => api.get(),
        staleTime: fresh ? 0 : 60_000,
        retry: false,
      }),
    write: async (body) => {
      const response = await api.put(body);
      if (!isCurrent()) throw new Error("Mail encryption session changed.");
      queries.setQueryData(key, response);
      return response;
    },
    readAnchor: anchor.read,
    markEstablished: anchor.mark,
    inspectKey: (armoredKey, knownArmoredKey, purpose) =>
      mailCryptoWorkerClient.inspectPublicKey({
        armoredKey,
        knownArmoredKey,
        forEncryption: purpose === "send",
      }),
  });
  active = { session, context, client };
  return client;
}

export async function resolveTrustedMailRecipient(
  emailInput: string,
  context: MailVaultVerificationContext,
): Promise<string> {
  const email = normalizeMailTrustAddress(emailInput);
  if (!mailCryptoWorkerClient.isVerificationContextCurrent(context))
    throw new Error("Mail encryption session changed.");
  if (
    resolveMailSenderKeySource({
      senderEmail: email,
      ownAddresses: context.ownAddresses,
      internalDomain: null,
    }) === "self"
  )
    return context.publicKeyArmored;
  const lookup = async () =>
    (await mailDemoApiService.getRecipientKey(email)).publicKeyArmored;
  if (!MAIL_KEY_CONTINUITY_ENABLED) return lookup();
  return resolveMailTrustRecipient({
    client: clientFor(context),
    email,
    lookup,
    review: mailTrustReviewBridge.request,
    isCurrent: () =>
      mailCryptoWorkerClient.isVerificationContextCurrent(context),
  });
}

export async function lookupPinnedMailSender(
  email: string,
  context: MailVaultVerificationContext,
): Promise<string | undefined> {
  return (
    await clientFor(context).verifySender(
      email,
      async () =>
        (await mailDemoApiService.getRecipientKey(email)).publicKeyArmored,
    )
  ).senderPublicKeyArmored;
}

export async function inspectPinnedMailSender(
  email: string,
  context: MailVaultVerificationContext,
) {
  return clientFor(context).verifySender(
    email,
    async () =>
      (await mailDemoApiService.getRecipientKey(email)).publicKeyArmored,
  );
}

export async function reviewMailSenderKey(email: string): Promise<void> {
  if (!MAIL_KEY_CONTINUITY_ENABLED) return;
  const context = mailCryptoWorkerClient.getVerificationContext();
  if (!context) throw new Error("Mail vault is not loaded on this device.");
  return reviewMailTrustSender({
    client: clientFor(context),
    email,
    lookup: async () =>
      (await mailDemoApiService.getRecipientKey(email)).publicKeyArmored,
    review: mailTrustReviewBridge.request,
    isCurrent: () =>
      mailCryptoWorkerClient.isVerificationContextCurrent(context),
  });
}
