import type { GenerateKeyPairResult } from "./types";

type WorkerMessage = {
  requestId: number;
  type: string;
  payload?: Record<string, unknown>;
  error?: string;
};

class MailCryptoWorkerClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
    }
  >();

  private getWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }

    if (typeof Worker === "undefined") {
      throw new Error("Web Workers are not available in this runtime.");
    }

    const worker = new Worker(
      new URL("../../workers/mail-crypto.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const entry = this.pending.get(event.data.requestId);
      if (!entry) {
        return;
      }

      this.pending.delete(event.data.requestId);

      if (event.data.error) {
        entry.reject(new Error(event.data.error));
        return;
      }

      entry.resolve(event.data.payload);
    };

    worker.onerror = (event) => {
      const error = new Error(event.message || "Mail crypto worker failed.");
      for (const entry of this.pending.values()) {
        entry.reject(error);
      }
      this.pending.clear();
    };

    this.worker = worker;
    return worker;
  }

  private call<T = unknown>(
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<T> {
    const requestId = ++this.requestId;
    const worker = this.getWorker();

    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      worker.postMessage({ requestId, type, payload });
    });
  }

  generateKeyPair(input: {
    name: string;
    email: string;
    privateKeyPassphrase: string;
  }): Promise<GenerateKeyPairResult> {
    return this.call<GenerateKeyPairResult>("GENERATE_PGP_KEYPAIR", input);
  }

  loadVault(input: {
    privateKeyArmored: string;
    privateKeyPassphrase: string;
    publicKeyArmored: string;
  }): Promise<{ fingerprint: string }> {
    return this.call<{ fingerprint: string }>("LOAD_ACTIVE_VAULT", input);
  }

  decryptMessage(input: {
    armoredMessage: string;
    senderPublicKeyArmored?: string;
  }): Promise<{ plaintext: string; hasVerifiedSignature: boolean }> {
    return this.call<{ plaintext: string; hasVerifiedSignature: boolean }>(
      "DECRYPT_PGP_MESSAGE",
      input,
    );
  }

  encryptForRecipients(input: {
    plaintext: string;
    recipientPublicKeysArmored: string[];
  }): Promise<{ armoredMessage: string }> {
    return this.call<{ armoredMessage: string }>(
      "ENCRYPT_FOR_RECIPIENTS",
      input,
    );
  }

  clear(): Promise<{ cleared: boolean }> {
    return this.call<{ cleared: boolean }>("CLEAR_ACTIVE_VAULT");
  }
}

export const mailCryptoWorkerClient = new MailCryptoWorkerClient();