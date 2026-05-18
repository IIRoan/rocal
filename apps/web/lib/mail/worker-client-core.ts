import type { GenerateKeyPairResult, MailDecryptResult } from "./types";

type WorkerMessage = {
  requestId: number;
  type: string;
  payload?: Record<string, unknown>;
  error?: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

export class MailCryptoWorkerClient {
  private static readonly DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

  private worker: Worker | null = null;
  private requestId = 0;
  private readonly requestTimeoutMs: number;
  private readonly createWorker: () => Worker;
  private pending = new Map<number, PendingRequest>();

  constructor(
    createWorker: () => Worker,
    options: { requestTimeoutMs?: number } = {},
  ) {
    this.createWorker = createWorker;
    this.requestTimeoutMs =
      options.requestTimeoutMs ??
      MailCryptoWorkerClient.DEFAULT_REQUEST_TIMEOUT_MS;
  }

  private nextRequestId(): number {
    this.requestId += 1;
    if (this.requestId > Number.MAX_SAFE_INTEGER) {
      this.requestId = 1;
    }
    return this.requestId;
  }

  private settlePending(
    requestId: number,
    callback: (entry: PendingRequest) => void,
  ) {
    const entry = this.pending.get(requestId);
    if (!entry) {
      return;
    }

    this.pending.delete(requestId);
    clearTimeout(entry.timeoutId);
    callback(entry);
  }

  private rejectAllPending(error: Error) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timeoutId);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private resetWorker(worker: Worker) {
    worker.terminate();
    if (this.worker === worker) {
      this.worker = null;
    }
  }

  private getWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }

    const worker = this.createWorker();

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      this.settlePending(event.data.requestId, (entry) => {
        if (event.data.error) {
          entry.reject(new Error(event.data.error));
          return;
        }

        entry.resolve(event.data.payload);
      });
    };

    worker.onerror = (event) => {
      const error = new Error(event.message || "Mail crypto worker failed.");
      event.preventDefault?.();
      this.rejectAllPending(error);
      this.resetWorker(worker);
    };

    worker.onmessageerror = () => {
      const error = new Error(
        "Mail crypto worker returned an unreadable response.",
      );
      this.rejectAllPending(error);
      this.resetWorker(worker);
    };

    this.worker = worker;
    return worker;
  }

  private call<T = unknown>(
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<T> {
    const requestId = this.nextRequestId();
    const worker = this.getWorker();

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error(
          `Mail crypto worker request timed out after ${this.requestTimeoutMs}ms.`,
        );
        this.rejectAllPending(error);
        this.resetWorker(worker);
      }, this.requestTimeoutMs);

      this.pending.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
        timeoutId,
      });

      try {
        worker.postMessage({ requestId, type, payload });
      } catch (error) {
        clearTimeout(timeoutId);
        this.pending.delete(requestId);
        reject(
          error instanceof Error
            ? error
            : new Error("Failed to post message to the mail crypto worker."),
        );
        this.resetWorker(worker);
      }
    });
  }

  reEncryptPrivateKey(input: {
    privateKeyArmored: string;
    oldPassphrase: string;
    newPassphrase: string;
  }): Promise<{ privateKeyArmored: string }> {
    return this.call<{ privateKeyArmored: string }>(
      "REENCRYPT_PRIVATE_KEY",
      input,
    );
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
  }): Promise<MailDecryptResult> {
    return this.call<MailDecryptResult>("DECRYPT_PGP_MESSAGE", input);
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
    if (!this.worker) {
      return Promise.resolve({ cleared: true });
    }
    return this.call<{ cleared: boolean }>("CLEAR_ACTIVE_VAULT");
  }
}
