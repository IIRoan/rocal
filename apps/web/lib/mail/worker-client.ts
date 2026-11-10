import { MailCryptoWorkerClient } from "./worker-client-core";
import { getActiveE2eeSession, subscribeActiveE2eeSession } from "@/lib/e2ee-session";

export { MailCryptoWorkerClient } from "./worker-client-core";

export const mailCryptoWorkerClient = new MailCryptoWorkerClient(() => {
  if (typeof Worker === "undefined") {
    throw new Error("Web Workers are not available in this runtime.");
  }

  return new Worker(
    new URL("../../workers/mail-crypto.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
});

let activeAccountId = getActiveE2eeSession()?.userId ?? null;
subscribeActiveE2eeSession(() => {
  const accountId = getActiveE2eeSession()?.userId ?? null;
  if (!accountId || activeAccountId !== accountId) mailCryptoWorkerClient.dispose();
  activeAccountId = accountId;
});
