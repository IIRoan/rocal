import { MailCryptoWorkerClient } from "./worker-client-core";

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
